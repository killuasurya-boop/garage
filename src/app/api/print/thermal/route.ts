import { z } from "zod";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";

import { readJson } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";
import { buildThermalContent } from "@/lib/thermal-receipt";

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

  // Build print content (sumber tunggal, dipakai juga oleh jalur agen lokal)
  const content = buildThermalContent(receipt);
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
