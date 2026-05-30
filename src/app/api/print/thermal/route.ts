import { z } from "zod";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";

import { readJson } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const fallbackPrinterName = "RPP02N_Thermal";
const optionalString = z.string().nullish();
const optionalNumber = z.number().nullish();

const thermalSchema = z.object({
  receipt: z.object({
    invoiceNo: optionalString,
    orderNo: optionalString,
    createdAt: optionalString,
    outlet: z.object({
      name: optionalString,
      code: optionalString,
    }).nullish(),
    cashier: z.object({
      name: optionalString,
    }).nullish(),
    payment: z.object({
      method: optionalString,
      provider: optionalString,
      reference: optionalString,
      cashReceived: optionalNumber,
      change: optionalNumber,
    }).nullish(),
    items: z.array(z.object({
      name: optionalString,
      itemName: optionalString,
      variant: optionalString,
      variantLabel: optionalString,
      qty: optionalNumber,
      unitPrice: optionalNumber,
      lineTotal: optionalNumber,
    })).nullish(),
    subtotal: optionalNumber,
    service: optionalNumber,
    tax: optionalNumber,
    discount: optionalNumber,
    total: optionalNumber,
    settings: z.object({
      serviceChargePct: optionalNumber,
      taxPct: optionalNumber,
      receiptCopies: optionalNumber,
      brandName: optionalString,
      brandTagline: optionalString,
      outletAddress: optionalString,
      outletPhone: optionalString,
      npwp: optionalString,
      receiptFooter: optionalString,
      // Live wired dari /control/settings → Receipt & Invoice
      receiptHeaderText: optionalString,
      receiptShowTaxBreakdown: z.boolean().nullish(),
      receiptShowLogo: z.boolean().nullish(),
      receiptShowMemberPoints: z.boolean().nullish(),
      cashDrawerOnPayment: z.boolean().nullish(),
    }).nullish(),
    paymentMethod: optionalString,
    isReprint: z.boolean().nullish(),
    reprintAt: optionalString,
    memberReward: z.object({
      level: optionalString,
      memberName: optionalString,
      pointsEarned: optionalNumber,
      totalPoints: optionalNumber,
    }).nullish(),
    invoiceWebUrl: optionalString,
  }),
  printerName: optionalString,
  copies: z.number().int().min(1).max(5).nullish(),
});

export async function POST(request: Request) {
  const session = await requirePermission("orders:manage");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, thermalSchema);
  if (body.error) {
    return body.error;
  }

  const receipt = body.data.receipt;
  const detectedPrinters = await listWindowsPrinters();
  const printerName = resolvePrinterName(
    body.data.printerName || process.env.DEFAULT_PRINTER_NAME,
    detectedPrinters,
  );

  // Build print content
  const content = buildPrintContent(receipt);
  const copies = body.data.copies ?? receipt.settings?.receiptCopies ?? 1;

  // Save to temp file
  const tmpPath = join(tmpdir(), `garage-print-${Date.now()}.txt`);
  writeFileSync(tmpPath, content, "utf8");

  try {
    let result: Awaited<ReturnType<typeof printTextFile>> | null = null;
    for (let copy = 0; copy < copies; copy += 1) {
      result = await printTextFile(tmpPath, printerName);
    }
    try { unlinkSync(tmpPath); } catch { /* ignore */ }

    if (result?.success) {
      return new Response(JSON.stringify({
        success: true,
        printer: result.printer,
        invoiceNo: receipt.invoiceNo,
        method: "windows-print",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return printError(result?.output ?? "Print command gagal.", printerName, detectedPrinters);
    }
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return printError(msg, printerName, detectedPrinters);
  }
}

type PrintErrorPayload = {
  code: string;
  title: string;
  hint: string;
  actions: string[];
  printer: string;
  availablePrinters: string[];
  detail: string;
};

function printError(
  rawDetail: string,
  printerName: string,
  detectedPrinters: string[],
) {
  const classified = classifyPrintError(rawDetail, printerName, detectedPrinters);
  return new Response(
    JSON.stringify({
      error: {
        code: classified.code,
        message: classified.title,
        title: classified.title,
        hint: classified.hint,
        actions: classified.actions,
        printer: classified.printer,
        availablePrinters: classified.availablePrinters,
        detail: classified.detail,
      },
    }),
    {
      status: 500,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function classifyPrintError(
  rawDetail: string,
  printerName: string,
  detectedPrinters: string[],
): PrintErrorPayload {
  const detail = rawDetail.replace(/\s+/g, " ").trim();
  const base = {
    printer: printerName,
    availablePrinters: detectedPrinters,
    detail,
  };

  // Win32 error 1722 = RPC_S_SERVER_UNAVAILABLE → spooler tidak bisa kontak
  // printer. Untuk RPP02N (umumnya Bluetooth/USB), penyebab terbanyak adalah
  // printer mati atau Bluetooth belum pair.
  if (/err\s*1722|RPC_S_SERVER_UNAVAILABLE|RPC server is unavailable/i.test(detail)) {
    return {
      ...base,
      code: "PRINTER_UNREACHABLE",
      title: "Printer tidak terdeteksi",
      hint: "Printer terdaftar di Windows tapi tidak bisa dijangkau. Biasanya karena printer mati atau koneksi terputus.",
      actions: [
        "Pastikan printer RPP02N menyala (lampu indikator hidup)",
        "Cek koneksi USB / Bluetooth — colok ulang atau pair ulang",
        "Pastikan kertas terpasang dengan benar",
        "Coba cetak lagi setelah printer siap",
      ],
    };
  }

  // Win32 error 1801 = ERROR_INVALID_PRINTER_NAME
  if (/err\s*1801|invalid printer name/i.test(detail)) {
    return {
      ...base,
      code: "PRINTER_NAME_INVALID",
      title: "Nama printer tidak ditemukan",
      hint: `Windows tidak punya printer bernama "${printerName}".`,
      actions: [
        "Buka Settings → Bluetooth & devices → Printers & scanners",
        "Cek nama persis printer thermal Anda (case-sensitive)",
        detectedPrinters.length
          ? `Printer terdeteksi: ${detectedPrinters.join(", ")}`
          : "Tidak ada printer terdeteksi sama sekali — install dulu drivernya",
      ],
    };
  }

  // Win32 error 5 = ERROR_ACCESS_DENIED
  if (/err\s*5\b|access\s*denied/i.test(detail)) {
    return {
      ...base,
      code: "PRINTER_ACCESS_DENIED",
      title: "Tidak ada akses ke printer",
      hint: "User yang menjalankan aplikasi tidak punya izin pakai printer ini.",
      actions: [
        "Jalankan aplikasi Garage dengan akun yang sama dengan yang install printer",
        "Atau share printer-nya dan beri izin Everyone untuk Print",
      ],
    };
  }

  // Driver Generic/Text yang tidak kompatibel dengan GDI
  if (
    /InvalidPrinterException|Settings to access printer.*are not valid/i.test(
      detail,
    )
  ) {
    return {
      ...base,
      code: "PRINTER_DRIVER_INCOMPATIBLE",
      title: "Driver printer bermasalah",
      hint: "Driver printer thermal tidak merespon perintah cetak Windows.",
      actions: [
        "Pastikan printer menyala dan siap (lampu indikator stabil)",
        "Restart Print Spooler service (Run → services.msc → Print Spooler → Restart)",
        "Bila tetap gagal, re-install driver RPP02N dari CD/website vendor",
      ],
    };
  }

  // Tidak ada printer terdeteksi sama sekali
  if (!detectedPrinters.length) {
    return {
      ...base,
      code: "NO_PRINTER_INSTALLED",
      title: "Tidak ada printer terinstall",
      hint: "Windows tidak mendeteksi printer apa pun di komputer ini.",
      actions: [
        "Install driver printer RPP02N",
        "Sambungkan printer via USB atau Bluetooth",
        "Test cetak dari Notepad untuk konfirmasi koneksi",
      ],
    };
  }

  // Fallback umum
  return {
    ...base,
    code: "PRINT_FAILED",
    title: "Gagal mencetak struk",
    hint: "Terjadi error saat mengirim data ke printer.",
    actions: [
      "Pastikan printer menyala dan terhubung",
      "Cek apakah ada kertas tersangkut",
      "Coba cetak lagi dalam beberapa detik",
      "Bila terus gagal, restart Print Spooler service",
    ],
  };
}

function runPowerShell(command: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { timeout: 15000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

async function listWindowsPrinters() {
  try {
    const result = await runPowerShell(
      "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress",
    );
    const parsed = JSON.parse(result.stdout.trim() || "[]") as string | string[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function resolvePrinterName(requested: string | undefined, printers: string[]) {
  const requestedName = requested?.trim();
  if (requestedName && printers.includes(requestedName)) {
    return requestedName;
  }

  const thermal = printers.find((name) => /rpp02n|thermal/i.test(name));
  if (thermal) {
    return thermal;
  }

  return requestedName || fallbackPrinterName;
}

async function printTextFile(tmpPath: string, printerName: string) {
  // Thermal printers (RPP02N, Xprinter, Epson TM-T82, dsb.) umumnya pakai
  // driver "Generic / Text Only" yang TIDAK kompatibel dengan Out-Printer
  // (GDI). Out-Printer akan throw InvalidPrinterException karena driver
  // tidak punya page settings GDI yang valid. Solusinya: kirim byte mentah
  // langsung ke spooler lewat Win32 winspool.drv (datatype "RAW") — ini
  // bypass GDI sepenuhnya.
  const rawResult = await tryRawPrint(tmpPath, printerName);
  if (rawResult.success) {
    return rawResult;
  }

  // Fallback ke Out-Printer untuk printer GDI biasa (Laser/Inkjet) yang
  // mungkin di-pasang sebagai default printer.
  try {
    await runPowerShell(
      `$printer = ${JSON.stringify(printerName)}; ` +
        `$path = ${JSON.stringify(tmpPath)}; ` +
        "Get-Content -LiteralPath $path | Out-Printer -Name $printer",
    );
    return { success: true, output: "", printer: printerName };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown printer error";
    return {
      success: false,
      output:
        `Gagal mencetak ke printer '${printerName}'. ` +
        `Raw spool: ${rawResult.output}. Out-Printer: ${message}`,
      printer: printerName,
    };
  }
}

async function tryRawPrint(tmpPath: string, printerName: string) {
  const script =
    `$ErrorActionPreference = 'Stop'; ` +
    `$printer = ${JSON.stringify(printerName)}; ` +
    `$path = ${JSON.stringify(tmpPath)}; ` +
    `if (-not ([System.Management.Automation.PSTypeName]'GarageRawPrint').Type) { ` +
    `Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class GarageRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static string Send(string szPrinterName, byte[] bytes) {
    IntPtr hPrinter = IntPtr.Zero;
    DOCINFO di = new DOCINFO();
    di.pDocName = "Garage POS Receipt";
    di.pDataType = "RAW";
    if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero))
      return "OpenPrinter failed (err " + Marshal.GetLastWin32Error() + ")";
    try {
      if (!StartDocPrinter(hPrinter, 1, di))
        return "StartDocPrinter failed (err " + Marshal.GetLastWin32Error() + ")";
      try {
        if (!StartPagePrinter(hPrinter))
          return "StartPagePrinter failed (err " + Marshal.GetLastWin32Error() + ")";
        try {
          IntPtr ptr = Marshal.AllocCoTaskMem(bytes.Length);
          try {
            Marshal.Copy(bytes, 0, ptr, bytes.Length);
            Int32 written;
            if (!WritePrinter(hPrinter, ptr, bytes.Length, out written))
              return "WritePrinter failed (err " + Marshal.GetLastWin32Error() + ")";
            if (written != bytes.Length)
              return "WritePrinter partial: " + written + "/" + bytes.Length;
            return "OK";
          } finally { Marshal.FreeCoTaskMem(ptr); }
        } finally { EndPagePrinter(hPrinter); }
      } finally { EndDocPrinter(hPrinter); }
    } finally { ClosePrinter(hPrinter); }
  }
}
'@ } ` +
    `$bytes = [System.IO.File]::ReadAllBytes($path); ` +
    `$result = [GarageRawPrint]::Send($printer, $bytes); ` +
    `if ($result -ne 'OK') { Write-Error $result; exit 1 }`;

  try {
    await runPowerShell(script);
    return { success: true as const, output: "raw-ok", printer: printerName };
  } catch (error) {
    const message = error instanceof Error ? error.message : "raw print error";
    return {
      success: false as const,
      output: message.replace(/\s+/g, " ").trim(),
      printer: printerName,
    };
  }
}

function buildPrintContent(receipt: z.infer<typeof thermalSchema>["receipt"]): string {
  const currency = new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  });
  const fmt = (v: number | null | undefined) => currency.format(v ?? 0);
  const fmtDate = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat("id-ID", {
      dateStyle: "short", timeStyle: "short",
    }).format(new Date(iso)) : "-";
  const W = 32; // 57/58mm thermal paper, Generic/Text driver.

  const line = () => "-".repeat(W);
  const clean = (value: string | null | undefined) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  const center = (value: string) => {
    const text = clean(value).slice(0, W);
    const left = Math.max(0, Math.floor((W - text.length) / 2));
    return `${" ".repeat(left)}${text}`;
  };
  const row = (left: string, right: string) => {
    const price = clean(right).slice(0, 13);
    const labelWidth = W - price.length;
    return clean(left).slice(0, labelWidth).padEnd(labelWidth) + price;
  };

  const rows: string[] = [];

  // REPRINT badge — muncul di paling atas struk untuk audit & cegah double-spending.
  // Pakai garis pembatas tebal supaya kasir langsung tau struk duplikat.
  if (receipt.isReprint) {
    rows.push("=".repeat(W));
    rows.push(center("*** CETAK ULANG ***"));
    if (receipt.reprintAt) {
      rows.push(center(fmtDate(receipt.reprintAt)));
    }
    rows.push("=".repeat(W));
    rows.push("");
  }

  // Custom multi-line header dari settings — kalau di-isi, replace brand + address default.
  const customHeader = (receipt.settings?.receiptHeaderText ?? "").trim();
  if (customHeader) {
    for (const headerLine of customHeader.split(/\r?\n/)) {
      const trimmed = headerLine.trim();
      if (trimmed) rows.push(center(trimmed.slice(0, W)));
    }
  } else {
    rows.push(center(receipt.settings?.brandName || "GARAGE"));
    rows.push(center(receipt.settings?.brandTagline || "Coffee & Motor"));
    if (receipt.settings?.outletAddress) {
      rows.push(center(receipt.settings.outletAddress));
    }
  }
  if (receipt.settings?.outletPhone) {
    rows.push(center(receipt.settings.outletPhone));
  }
  if (receipt.settings?.npwp) {
    rows.push(center(`NPWP ${receipt.settings.npwp}`));
  }
  if (receipt.outlet?.code) {
    rows.push(center(receipt.outlet.code));
  }
  rows.push(line());
  rows.push(`Order : ${clean(receipt.orderNo) || "-"}`.slice(0, W));
  rows.push(`Inv   : ${clean(receipt.invoiceNo) || "-"}`.slice(0, W));
  rows.push(`Waktu : ${fmtDate(receipt.createdAt)}`.slice(0, W));
  rows.push(`Kasir : ${clean(receipt.cashier?.name) || "-"}`.slice(0, W));
  rows.push(line());

  for (const item of receipt.items || []) {
    const name = clean(item.name || item.itemName || "Item");
    const variant = clean(item.variant || item.variantLabel);
    const qty = item.qty || 1;
    const price = item.unitPrice || 0;
    const total = item.lineTotal || price * qty;
    const variantText = variant && variant !== "Regular" ? ` ${variant}` : "";
    rows.push(row(`${qty}x ${name}${variantText}`, fmt(total)));
    rows.push(`   @ ${fmt(price)}`.slice(0, W));
  }

  rows.push(line());
  // showTaxBreakdown: default true. Kalau false, hide line service & PB1 (tetap include di total).
  const showTaxBreakdown = receipt.settings?.receiptShowTaxBreakdown !== false;
  if (showTaxBreakdown) {
    rows.push(row("Subtotal", fmt(receipt.subtotal)));
    if ((receipt.service || 0) > 0) {
      rows.push(row(`Service ${receipt.settings?.serviceChargePct ?? 5}%`, fmt(receipt.service)));
    }
    if ((receipt.tax || 0) > 0) {
      rows.push(row(`PB1 ${receipt.settings?.taxPct ?? 10}%`, fmt(receipt.tax)));
    }
  }
  if ((receipt.discount || 0) > 0) {
    rows.push(row("Diskon", `-${fmt(receipt.discount)}`));
  }
  rows.push(row("TOTAL", fmt(receipt.total)));

  const cash = receipt.payment?.cashReceived;
  if (cash && cash > 0) {
    rows.push(line());
    rows.push(row("Tunai", fmt(cash)));
    rows.push(row("Kembali", fmt(receipt.payment?.change || 0)));
  }

  // Member reward block — wired ke setting receiptShowMemberPoints.
  const showMemberPoints = receipt.settings?.receiptShowMemberPoints !== false;
  if (showMemberPoints && receipt.memberReward?.memberName) {
    rows.push(line());
    rows.push(center(`Member: ${clean(receipt.memberReward.memberName).slice(0, W - 8)}`));
    if (receipt.memberReward.level) {
      rows.push(center(`Tier: ${clean(receipt.memberReward.level)}`));
    }
    if ((receipt.memberReward.pointsEarned ?? 0) > 0) {
      rows.push(row("Poin +", String(receipt.memberReward.pointsEarned)));
    }
    if ((receipt.memberReward.totalPoints ?? 0) > 0) {
      rows.push(row("Total poin", String(receipt.memberReward.totalPoints)));
    }
  }

  rows.push(line());
  rows.push(center(receipt.settings?.receiptFooter || "TERIMA KASIH"));
  if (receipt.isReprint) {
    rows.push(center("(salinan struk — bukan transaksi baru)"));
  }
  if (receipt.invoiceWebUrl) {
    rows.push("");
    rows.push(center("Cek invoice online:"));
    rows.push(center(clean(receipt.invoiceWebUrl).slice(0, W)));
  }
  rows.push("");

  let output = rows.join("\r\n");

  // Wire: cashDrawerOnPayment → ESC/POS drawer kick command setelah print.
  // Standard kick code (Epson-compatible): ESC p m t1 t2 → 1B 70 00 19 FA
  // Hanya fire kalau setting on AND payment method = cash (gak ada arti buka drawer
  // untuk QRIS/transfer).
  const shouldKickDrawer =
    receipt.settings?.cashDrawerOnPayment !== false &&
    (receipt.paymentMethod ?? "").toLowerCase() === "cash" &&
    !receipt.isReprint;
  if (shouldKickDrawer) {
    const drawerKick = "\x1B\x70\x00\x19\xFA";
    output = output + "\r\n" + drawerKick;
  }

  return output;
}
