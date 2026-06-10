/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Garage Print Agent (cetak struk thermal lokal)
 * Run: node scripts/thermal-print-server.js   (atau: npm run print:server)
 *
 * PERAN BARU (deployment VPS):
 *   App berjalan di VPS dan TIDAK bisa menyentuh printer di warung. Agen ini
 *   berjalan di PC kasir (yang colok printer USB). Browser kasir membentuk
 *   konten struk lalu POST ke http://localhost:9100/print — agen mengirim byte
 *   mentah (ESC/POS) ke printer.
 *
 * Dua metode cetak (env PRINT_METHOD):
 *   - "windows" (default): kirim RAW ke Windows print spooler via winspool.drv
 *                          (cocok untuk RPP02N USB / driver Generic-Text).
 *   - "network"          : kirim RAW via TCP ke printer jaringan
 *                          (PRINTER_HOST:PRINTER_PORT).
 *
 * Env:
 *   PORT            (default 9100)        port agen lokal
 *   PRINT_METHOD    (default "windows")   "windows" | "network"
 *   DEFAULT_PRINTER (default "RPP02N_Thermal")  nama printer Windows
 *   PRINTER_HOST    (default 192.168.100.100)   untuk PRINT_METHOD=network
 *   PRINTER_PORT    (default 9100)               untuk PRINT_METHOD=network
 *   ALLOWED_ORIGIN  (default "*")          origin app VPS yang boleh memanggil
 */

const http = require("http");
const net = require("net");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

// ─── Configuration ───────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "9100");
const PRINT_METHOD = (process.env.PRINT_METHOD || "windows").toLowerCase();
const DEFAULT_PRINTER = process.env.DEFAULT_PRINTER || "RPP02N_Thermal";
const PRINTER_HOST = process.env.PRINTER_HOST || "192.168.100.100";
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || "9100");
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
// ─────────────────────────────────────────────────────────────

// ─── CORS ────────────────────────────────────────────────────
// Halaman app di VPS (origin https://app...) memanggil agen ini di localhost.
// Browser kirim preflight OPTIONS + butuh header CORS di tiap respons.
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders() });
  res.end(JSON.stringify(body));
}

// ─── Print via Windows spooler (RAW, bypass GDI) ─────────────
// Thermal printer (RPP02N, Xprinter, dst.) umumnya pakai driver Generic/Text
// yang TIDAK kompatibel dengan Out-Printer (GDI). Kirim byte mentah langsung
// ke spooler lewat winspool.drv dengan datatype "RAW".
function buildRawPrintScript(tmpPath, printerName) {
  return (
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
    `if ($result -ne 'OK') { Write-Error $result; exit 1 }`
  );
}

function printViaWindows(content, printerName) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `garage-print-${Date.now()}.txt`);
    fs.writeFileSync(tmpPath, content, "latin1");
    const script = buildRawPrintScript(tmpPath, printerName);
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 15000 },
      (error, _stdout, stderr) => {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        if (error) {
          reject(new Error((stderr || error.message).replace(/\s+/g, " ").trim()));
          return;
        }
        resolve({ printer: printerName });
      },
    );
  });
}

// ─── Print via Network (RAW TCP) ─────────────────────────────
function printViaNetwork(content) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(8000);
    client.connect(PRINTER_PORT, PRINTER_HOST, () => {
      client.write(Buffer.from(content, "latin1"), () => {
        client.end();
        resolve({ printer: `${PRINTER_HOST}:${PRINTER_PORT}` });
      });
    });
    client.on("error", (err) => {
      reject(new Error(`Network print failed: ${err.message} (${PRINTER_HOST}:${PRINTER_PORT})`));
    });
    client.on("timeout", () => {
      client.destroy();
      reject(new Error(`Printer connection timeout: ${PRINTER_HOST}:${PRINTER_PORT}`));
    });
  });
}

function printContent(content, printerName) {
  if (PRINT_METHOD === "network") {
    return printViaNetwork(content);
  }
  return printViaWindows(content, printerName || DEFAULT_PRINTER);
}

// ─── HTTP Server ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // Health check
  if (url.pathname === "/health") {
    sendJson(res, 200, {
      status: "ok",
      method: PRINT_METHOD,
      printer: PRINT_METHOD === "network" ? `${PRINTER_HOST}:${PRINTER_PORT}` : DEFAULT_PRINTER,
    });
    return;
  }

  // Print endpoint — terima { content, copies, printerName }.
  if (req.method === "POST" && (url.pathname === "/print" || url.pathname === "/print/thermal")) {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const data = JSON.parse(body || "{}");
        // Jalur utama: konten ESC/POS sudah dibentuk di browser.
        const content = typeof data.content === "string" ? data.content : null;
        if (!content) {
          sendJson(res, 400, { error: "Missing 'content' (string)" });
          return;
        }
        const copies = Math.min(Math.max(parseInt(data.copies) || 1, 1), 5);
        let result = null;
        for (let i = 0; i < copies; i += 1) {
          result = await printContent(content, data.printerName);
        }
        console.log(
          `[${new Date().toISOString()}] Printed x${copies} -> ${result?.printer}`,
        );
        sendJson(res, 200, { success: true, printer: result?.printer });
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Print error:`, err.message);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  res.writeHead(404, corsHeaders());
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n🔥 Garage Print Agent`);
  console.log(`   Listen : http://localhost:${PORT}`);
  console.log(`   Method : ${PRINT_METHOD}`);
  console.log(
    `   Printer: ${PRINT_METHOD === "network" ? `${PRINTER_HOST}:${PRINTER_PORT}` : DEFAULT_PRINTER}`,
  );
  console.log(`   CORS   : ${ALLOWED_ORIGIN}`);
  console.log(`   POST /print  → cetak { content, copies, printerName }`);
  console.log(`   GET  /health → cek status\n`);
});

server.on("error", (err) => {
  console.error(`Agent error: ${err.message}`);
  process.exit(1);
});
