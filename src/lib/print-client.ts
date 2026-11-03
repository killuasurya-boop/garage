// Jalur cetak struk sisi-klien untuk deployment VPS.
//
// Saat app dijalankan di VPS (Linux, di datacenter), server TIDAK bisa menyentuh
// printer fisik di warung. Jadi konten struk dibentuk di browser kasir lalu
// dikirim ke "agen cetak lokal" (scripts/thermal-print-server.js) yang berjalan
// di PC kasir — mesin yang sama yang colok printer USB.
//
// Catatan keamanan browser: halaman HTTPS BOLEH memanggil http://localhost
// (localhost dianggap secure context), tapi http://192.168.x.x diblokir
// mixed-content. Karena itu agen WAJIB di PC yang sama dengan browser kasir.
//
// Fungsi ini mengembalikan `Response` agar jadi pengganti drop-in untuk
// `fetch("/api/print/thermal", ...)` di seluruh pemanggil lama.

import { stripReceiptQr } from "@/lib/receipt-layout";
import {
  DEVICE_PRINTER_MODE_LABELS,
  DevicePrinterError,
  browserColumns,
  deviceColumns,
  escPosJob,
  findRememberedDirectMode,
  loadDevicePrinterConfig,
  printViaBrowser,
  sendToDirectPrinter,
  toPrinterText,
  type DevicePrinterConfig,
} from "@/lib/device-printer";
import {
  buildKitchenChitContent,
  buildThermalContent,
  type KitchenChitInput,
  type ThermalReceiptInput,
} from "@/lib/thermal-receipt";

export interface PrintThermalPayload {
  receipt: ThermalReceiptInput;
  printerName?: string;
  copies?: number | null;
}

export interface PrintKitchenChitPayload {
  chit: KitchenChitInput;
  printerName?: string;
}

function agentBaseUrl(config: DevicePrinterConfig = loadDevicePrinterConfig()) {
  // URL agen bisa diisi per laptop (Pengaturan Printer); fallback env build-time.
  return (
    config.agentUrl.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_PRINT_AGENT_URL?.replace(/\/$/, "") ||
    "http://localhost:9100"
  );
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const AGENT_DOWN_ERROR = {
  error: {
    code: "PRINT_AGENT_OFFLINE",
    message: "Agen cetak lokal tidak berjalan",
    title: "Agen cetak lokal tidak berjalan",
    hint:
      "Aplikasi tidak bisa menemukan program pencetak di komputer kasir ini. " +
      "Struk dibentuk di browser dan butuh agen lokal untuk dikirim ke printer.",
    actions: [
      "Pastikan 'Garage Print Agent' berjalan di komputer kasir (cek ikon/jendela hitam)",
      "Jalankan ulang: npm run print:server (atau shortcut start agen)",
      "Pastikan printer RPP02N menyala dan kertas terpasang",
      "Setelah agen jalan, klik Cetak lagi",
    ],
    detail: "",
  },
};

const DEVICE_ACTIONS = [
  "Pastikan printer menyala, kertas terpasang, dan lampu Bluetooth/kabel aktif",
  "Buka Pengaturan → Printer Perangkat Ini, lalu klik Hubungkan",
  "Klik Tes cetak untuk memastikan printer siap",
];

function deviceErrorResponse(error: unknown, mode: string) {
  const message =
    error instanceof DevicePrinterError || error instanceof Error
      ? error.message
      : "Gagal mencetak ke printer perangkat.";
  const notConnected = error instanceof DevicePrinterError && error.code === "NOT_CONNECTED";
  return jsonResponse(
    {
      error: {
        code: notConnected ? "PRINTER_NOT_CONNECTED" : "PRINT_FAILED",
        message,
        title: notConnected ? "Printer belum terhubung" : "Gagal mencetak",
        hint: `Koneksi: ${mode}. ${message}`,
        actions: DEVICE_ACTIONS,
        detail: message,
      },
    },
    notConnected ? 503 : 502,
  );
}

function printedResponse(printer: string, method: string) {
  return jsonResponse({ success: true, printer, method }, 200);
}

interface DeliverOptions {
  copies: number;
  printerName?: string;
  /** Body untuk route server lama (/api/print/thermal) bila agen tak terjangkau. */
  legacyBody?: unknown;
  config?: DevicePrinterConfig;
  /** Mode Otomatis: boleh jatuh ke dialog print Chrome (default ya). */
  browserFallback?: boolean;
}

/**
 * Satu pintu kirim teks struk ke printer sesuai pengaturan laptop ini:
 *   serial/usb/ble → langsung (tanpa driver/agen)
 *   browser        → dialog print Chrome
 *   agent          → agen lokal (+ route server di dev)
 *   auto           → perangkat yang pernah diizinkan → agen → dialog print
 * Selalu resolve dengan Response (bentuk sama seperti route lama).
 */
/**
 * Production Hub V4 (P1 audit): apakah perangkat ini BENAR-BENAR bisa cetak otomatis
 * sekarang — printer langsung yang sudah tersambung, atau agen cetak yang menjawab
 * /health. Dipakai sebelum mengklaim job agar tablet tanpa printer tidak
 * menghabiskan jatah percobaan job milik perangkat lain.
 */
export async function probeAutoPrinter(
  config: DevicePrinterConfig = loadDevicePrinterConfig(),
): Promise<{ ready: boolean; reason: string | null }> {
  if (config.mode === "browser") return { ready: false, reason: "Printer perangkat = dialog Chrome." };
  if (config.mode === "serial" || config.mode === "usb" || config.mode === "ble" || config.mode === "auto") {
    const direct = await findRememberedDirectMode(config).catch(() => null);
    if (direct && (config.mode === "auto" || direct === config.mode)) return { ready: true, reason: null };
    if (config.mode !== "auto") return { ready: false, reason: "Printer langsung belum tersambung." };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${agentBaseUrl(config)}/health`, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) return { ready: true, reason: null };
  } catch {
    // agen tidak berjalan
  }
  return { ready: false, reason: "Printer/agen cetak tidak terdeteksi." };
}

export async function deliverPrintContent(
  source: string | ((columns: number) => string),
  options: DeliverOptions,
): Promise<Response> {
  const config = options.config ?? loadDevicePrinterConfig();
  // Builder → tata letak ikut jalur: cetak langsung/agen = kolom kertas,
  // dialog Chrome = kolom "huruf besar" (lihat browserColumns).
  const content = typeof source === "string" ? source : source(deviceColumns(config));
  const browserContent = typeof source === "string" ? source : source(browserColumns(config));
  const copies = Math.max(1, options.copies || 1);
  const job = () =>
    escPosJob(content, {
      copies,
      cut: config.cut,
      feedLines: config.feedLines,
      paper: config.paper,
      bold: config.bold,
      textSize: config.textSize,
      compat: config.compat,
    });

  if (config.mode === "serial" || config.mode === "usb" || config.mode === "ble") {
    try {
      await sendToDirectPrinter(config.mode, job(), config);
      return printedResponse(config.deviceLabel || DEVICE_PRINTER_MODE_LABELS[config.mode], config.mode);
    } catch (error) {
      return deviceErrorResponse(error, DEVICE_PRINTER_MODE_LABELS[config.mode]);
    }
  }

  if (config.mode === "browser") {
    try {
      for (let i = 0; i < copies; i += 1) await printViaBrowser(browserContent, config);
      return printedResponse("Dialog print Chrome", "browser");
    } catch (error) {
      return deviceErrorResponse(error, DEVICE_PRINTER_MODE_LABELS.browser);
    }
  }

  if (config.mode === "auto") {
    const remembered = await findRememberedDirectMode(config).catch(() => null);
    if (remembered) {
      try {
        await sendToDirectPrinter(remembered, job(), config);
        return printedResponse(config.deviceLabel || DEVICE_PRINTER_MODE_LABELS[remembered], remembered);
      } catch {
        // lanjut ke agen / dialog print
      }
    }
  }

  // Agen cetak lokal di PC kasir (printer jaringan/LAN atau driver Windows).
  try {
    const res = await fetch(`${agentBaseUrl(config)}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: toPrinterText(stripReceiptQr(content)), copies, printerName: options.printerName }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { printer?: string };
      return printedResponse(data.printer ?? "local-agent", "local-agent");
    }
    // Agen menjawab tapi gagal cetak (printer mati/kertas habis, dll.).
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return jsonResponse(
      {
        error: {
          code: "PRINT_FAILED",
          message: data.error || "Gagal mencetak",
          title: "Gagal mencetak",
          hint: "Agen cetak menerima perintah tapi printer gagal merespon.",
          actions: [
            "Pastikan printer RPP02N menyala (lampu indikator hidup)",
            "Cek kertas masih ada dan tidak tersangkut",
            "Coba cetak lagi",
          ],
          detail: data.error || "",
        },
      },
      502,
    );
  } catch {
    // Agen tak terjangkau → lanjut.
  }

  // Route server (dev / server == PC warung).
  if (options.legacyBody !== undefined) {
    try {
      const res = await fetch("/api/print/thermal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(options.legacyBody),
      });
      const text = await res.text();
      if (res.ok || config.mode === "agent") {
        return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
      }
    } catch {
      // lanjut
    }
  }

  // Otomatis: terakhir pakai dialog print Chrome agar struk tidak pernah macet.
  if (config.mode === "auto" && options.browserFallback !== false) {
    try {
      for (let i = 0; i < copies; i += 1) await printViaBrowser(browserContent, config);
      return printedResponse("Dialog print Chrome", "browser");
    } catch {
      // jatuh ke pesan agen offline
    }
  }
  return jsonResponse(AGENT_DOWN_ERROR, 503);
}

/**
 * Cetak chit dapur/bar (tanpa harga). Lebar kolom ikut kertas laptop ini.
 * Selalu resolve dengan Response. Bila tak ada item, tidak mencetak.
 */
export async function printKitchenChit(
  payload: PrintKitchenChitPayload,
): Promise<Response> {
  const config = loadDevicePrinterConfig();
  const content = buildKitchenChitContent(payload.chit, { width: deviceColumns(config) });
  if (!content.trim()) {
    return jsonResponse({ success: true, skipped: true }, 200);
  }
  return deliverPrintContent((width) => buildKitchenChitContent(payload.chit, { width }), {
    copies: 1,
    printerName: payload.printerName,
    legacyBody: { chit: payload.chit, printerName: payload.printerName },
    config,
    // Chit otomatis tiap order: jangan memunculkan dialog print berulang-ulang.
    browserFallback: false,
  });
}

/**
 * Cetak tiket Bar/Dapur MANUAL dari kasir (tombol "Cetak tiket" / "Cetak semua
 * tiket baru"). Beberapa tiket digabung jadi satu job (dipisah garis sobek) dan
 * boleh jatuh ke dialog print Chrome — laptop kasir mencetak lewat driver.
 */
export async function printKitchenChits(chits: KitchenChitInput[], printerName?: string): Promise<Response> {
  const config = loadDevicePrinterConfig();
  const build = (width: number) =>
    chits
      .map((chit) => buildKitchenChitContent(chit, { width }))
      .filter((content) => content.trim())
      .join(`\n${"- ".repeat(Math.floor(width / 2)).trimEnd()}\n\n\n`);
  if (!build(deviceColumns(config)).trim()) {
    return jsonResponse({ success: true, skipped: true }, 200);
  }
  return deliverPrintContent(build, {
    copies: 1,
    printerName,
    config,
  });
}

/** Drop-in pengganti fetch("/api/print/thermal") untuk struk pelanggan. */
export async function printThermal(payload: PrintThermalPayload): Promise<Response> {
  const config = loadDevicePrinterConfig();
  return deliverPrintContent((width) => buildThermalContent(payload.receipt, { width }), {
    copies: payload.copies ?? 1,
    printerName: payload.printerName,
    legacyBody: payload,
    config,
  });
}

/**
 * Cetak kertas lain (slip tutup shift, rekap harian, tes cetak). `build`
 * menerima jumlah kolom kertas laptop ini supaya tata letak selalu pas.
 */
export async function printDocument(
  build: (columns: number) => string,
  options: { copies?: number; printerName?: string } = {},
): Promise<Response> {
  const config = loadDevicePrinterConfig();
  return deliverPrintContent(build, {
    copies: options.copies ?? 1,
    printerName: options.printerName,
    config,
  });
}
