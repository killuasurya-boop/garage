// =============================================================================
// "Printer Perangkat Ini" (owner, Okt 2026): kasir & helper di laptop Chrome
// mencetak langsung ke printer thermal TANPA driver/agen.
//
//   serial  → Web Serial: kabel USB-serial & Bluetooth Klasik (RPP02N di-pair
//             di Windows → muncul sebagai port COM)
//   usb     → WebUSB: printer USB kelas printer (endpoint bulk OUT)
//   ble     → Web Bluetooth: printer Bluetooth Low Energy
//   agent   → Garage Print Agent lokal (printer jaringan/LAN, cara lama)
//   browser → dialog print Chrome (printer apa pun yang terpasang di laptop)
//   auto    → perangkat yang pernah diizinkan → agen → dialog print
//
// Konfigurasi disimpan per perangkat (localStorage), bukan per outlet.
// =============================================================================

import { paperColumns, PAPER_COLUMNS, type PaperSize } from "@/lib/receipt-layout";

export type DevicePrinterMode = "auto" | "serial" | "usb" | "ble" | "agent" | "browser";

export interface DevicePrinterConfig {
  mode: DevicePrinterMode;
  paper: PaperSize;
  /** Override kolom (24–64). Kosong = ikut kertas. */
  columns: number | null;
  baudRate: number;
  cut: boolean;
  feedLines: number;
  agentUrl: string;
  /** Nama perangkat terakhir yang terhubung (hanya tampilan). */
  deviceLabel: string | null;
}

export const DEVICE_PRINTER_STORAGE_KEY = "garage:device-printer";

export const DEFAULT_DEVICE_PRINTER_CONFIG: DevicePrinterConfig = {
  mode: "auto",
  paper: "58",
  columns: null,
  baudRate: 9600,
  cut: false,
  feedLines: 4,
  agentUrl: "",
  deviceLabel: null,
};

export const DEVICE_PRINTER_MODE_LABELS: Record<DevicePrinterMode, string> = {
  auto: "Otomatis",
  serial: "Kabel / Bluetooth (port COM)",
  usb: "Kabel USB langsung",
  ble: "Bluetooth LE",
  agent: "Jaringan / Agen lokal",
  browser: "Printer umum (dialog Chrome)",
};

const MODES: DevicePrinterMode[] = ["auto", "serial", "usb", "ble", "agent", "browser"];
const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

export function normalizeDevicePrinterConfig(raw: unknown): DevicePrinterConfig {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<DevicePrinterConfig>;
  const columns = value.columns == null ? null : paperColumns(value.columns);
  return {
    mode: MODES.includes(value.mode as DevicePrinterMode) ? (value.mode as DevicePrinterMode) : "auto",
    paper: value.paper === "80" ? "80" : "58",
    columns,
    baudRate: BAUD_RATES.includes(Number(value.baudRate)) ? Number(value.baudRate) : 9600,
    cut: value.cut === true,
    feedLines: Math.min(10, Math.max(0, Math.round(Number(value.feedLines ?? 4)) || 0)),
    agentUrl: typeof value.agentUrl === "string" ? value.agentUrl.trim().slice(0, 200) : "",
    deviceLabel: typeof value.deviceLabel === "string" ? value.deviceLabel.slice(0, 80) : null,
  };
}

export function loadDevicePrinterConfig(): DevicePrinterConfig {
  try {
    if (typeof window === "undefined") return { ...DEFAULT_DEVICE_PRINTER_CONFIG };
    const raw = window.localStorage.getItem(DEVICE_PRINTER_STORAGE_KEY);
    return normalizeDevicePrinterConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_DEVICE_PRINTER_CONFIG };
  }
}

export function saveDevicePrinterConfig(config: DevicePrinterConfig): DevicePrinterConfig {
  const normalized = normalizeDevicePrinterConfig(config);
  try {
    window.localStorage.setItem(DEVICE_PRINTER_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Mode privat / storage diblokir: konfigurasi berlaku untuk tab ini saja.
  }
  return normalized;
}

/** Kolom karakter efektif untuk perangkat ini. */
export function deviceColumns(config: DevicePrinterConfig = loadDevicePrinterConfig()): number {
  return config.columns ?? PAPER_COLUMNS[config.paper];
}

// ── ESC/POS ─────────────────────────────────────────────────────────────────

const ESC = 0x1b;
const GS = 0x1d;

/** Teks struk (bisa berisi kode laci ESC p) → byte ESC/POS siap kirim. */
export function escPosJob(
  content: string,
  options: { copies?: number; cut?: boolean; feedLines?: number } = {},
): Uint8Array {
  const copies = Math.min(5, Math.max(1, Math.round(options.copies ?? 1)));
  const feed = Math.min(10, Math.max(0, options.feedLines ?? 4));
  const body: number[] = [];
  // Spasi tak-putus (dari format Rupiah Intl) → spasi biasa agar aman di semua codepage.
  for (const ch of content.replace(/\u00a0/g, " ")) {
    const code = ch.codePointAt(0) ?? 63;
    body.push(code <= 0xff ? code : 63); // di luar latin1 → "?"
  }
  const out: number[] = [];
  for (let i = 0; i < copies; i += 1) {
    out.push(ESC, 0x40, ...body, ...Array(feed).fill(0x0a));
    if (options.cut) out.push(GS, 0x56, 0x42, 0x00); // potong sebagian + umpan
  }
  return Uint8Array.from(out);
}

/** Buang kode kontrol ESC/POS (mis. buka laci) untuk cetak lewat dialog Chrome. */
export function stripControlCodes(content: string): string {
  return content
    .replace(/\x1B\x70[\s\S]{0,3}/g, "")
    .replace(/\x1B[\s\S]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

export function chunkBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  const step = Math.max(1, size);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += step) chunks.push(bytes.subarray(i, i + step));
  return chunks;
}

// ── Dukungan browser ────────────────────────────────────────────────────────

/* Tipe minimal Web Serial / WebUSB / Web Bluetooth (belum ada di lib.dom TS). */
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly writable: WritableStream<Uint8Array> | null;
  getInfo?(): { usbVendorId?: number; usbProductId?: number; bluetoothServiceClassId?: number | string };
}
interface SerialLike {
  requestPort(options?: { allowedBluetoothServiceClassIds?: string[] }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}
interface UsbEndpointLike { direction: "in" | "out"; type: string; endpointNumber: number }
interface UsbInterfaceLike {
  interfaceNumber: number;
  alternate: { interfaceClass: number; endpoints: UsbEndpointLike[] };
}
interface UsbDeviceLike {
  productName?: string;
  opened: boolean;
  configuration: { interfaces: UsbInterfaceLike[] } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(number: number): Promise<void>;
  transferOut(endpoint: number, data: Uint8Array): Promise<unknown>;
}
interface UsbLike {
  requestDevice(options: { filters: Array<Record<string, number>> }): Promise<UsbDeviceLike>;
  getDevices(): Promise<UsbDeviceLike[]>;
}
interface BleCharacteristicLike {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue?(data: Uint8Array): Promise<void>;
  writeValueWithoutResponse?(data: Uint8Array): Promise<void>;
  writeValueWithResponse?(data: Uint8Array): Promise<void>;
}
interface BleServiceLike { getCharacteristics(): Promise<BleCharacteristicLike[]> }
interface BleServerLike {
  connected: boolean;
  getPrimaryServices(): Promise<BleServiceLike[]>;
}
interface BleDeviceLike {
  name?: string;
  gatt?: { connected: boolean; connect(): Promise<BleServerLike> };
}
interface BluetoothLike {
  requestDevice(options: { acceptAllDevices?: boolean; filters?: Array<{ services: string[] }>; optionalServices?: string[] }): Promise<BleDeviceLike>;
  getDevices?(): Promise<BleDeviceLike[]>;
}

function nav(): (Navigator & { serial?: SerialLike; usb?: UsbLike; bluetooth?: BluetoothLike }) | null {
  return typeof navigator === "undefined"
    ? null
    : (navigator as Navigator & { serial?: SerialLike; usb?: UsbLike; bluetooth?: BluetoothLike });
}

export function devicePrinterSupport() {
  const n = nav();
  const secure = typeof window !== "undefined" && window.isSecureContext;
  return {
    serial: Boolean(secure && n?.serial),
    usb: Boolean(secure && n?.usb),
    ble: Boolean(secure && n?.bluetooth),
    secure,
  };
}

// Layanan BLE yang umum dipakai printer thermal murah (RPP02N, Xprinter, dll.).
export const BLE_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
];
// Serial Port Profile — agar port COM Bluetooth Klasik ikut terdaftar.
const SPP_UUID = "00001101-0000-1000-8000-00805f9b34fb";

// ── Koneksi (di-cache per tab) ──────────────────────────────────────────────

let serialPort: SerialPortLike | null = null;
let usbTarget: { device: UsbDeviceLike; endpoint: number } | null = null;
let bleTarget: { device: BleDeviceLike; characteristic: BleCharacteristicLike } | null = null;

export class DevicePrinterError extends Error {
  constructor(
    public code: "NOT_SUPPORTED" | "NOT_CONNECTED" | "SEND_FAILED" | "CANCELLED",
    message: string,
  ) {
    super(message);
  }
}

async function openSerial(port: SerialPortLike, baudRate: number) {
  if (!port.writable) await port.open({ baudRate });
  serialPort = port;
}

async function prepareUsb(device: UsbDeviceLike) {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const interfaces = device.configuration?.interfaces ?? [];
  // Utamakan kelas printer (7); kalau tidak ada, ambil interface dengan bulk OUT.
  const sorted = [...interfaces].sort(
    (a, b) => Number(b.alternate.interfaceClass === 7) - Number(a.alternate.interfaceClass === 7),
  );
  for (const iface of sorted) {
    const endpoint = iface.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
    if (!endpoint) continue;
    await device.claimInterface(iface.interfaceNumber);
    usbTarget = { device, endpoint: endpoint.endpointNumber };
    return;
  }
  throw new DevicePrinterError("NOT_SUPPORTED", "Printer USB ini tidak punya jalur kirim data (bulk OUT).");
}

async function prepareBle(device: BleDeviceLike) {
  if (!device.gatt) throw new DevicePrinterError("NOT_SUPPORTED", "Perangkat Bluetooth tidak mendukung GATT.");
  const server = await device.gatt.connect();
  for (const service of await server.getPrimaryServices()) {
    for (const characteristic of await service.getCharacteristics()) {
      if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
        bleTarget = { device, characteristic };
        return;
      }
    }
  }
  throw new DevicePrinterError("NOT_SUPPORTED", "Printer Bluetooth ini tidak menyediakan jalur cetak.");
}

/**
 * Pilih & sambungkan printer (WAJIB dipanggil dari klik tombol — Chrome hanya
 * menampilkan pemilih perangkat dari aksi pengguna). Mengembalikan nama tampil.
 */
export async function connectDevicePrinter(
  mode: "serial" | "usb" | "ble",
  config: DevicePrinterConfig,
): Promise<string> {
  const n = nav();
  try {
    if (mode === "serial") {
      if (!n?.serial) throw new DevicePrinterError("NOT_SUPPORTED", "Browser ini belum mendukung Web Serial. Pakai Google Chrome/Edge di laptop.");
      let port: SerialPortLike;
      try {
        port = await n.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] });
      } catch (error) {
        if (error instanceof TypeError) port = await n.serial.requestPort();
        else throw error;
      }
      await openSerial(port, config.baudRate);
      const info = port.getInfo?.() ?? {};
      if (info.bluetoothServiceClassId) return "Printer Bluetooth (port COM)";
      return info.usbVendorId ? `Printer USB ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}` : "Printer port COM";
    }
    if (mode === "usb") {
      if (!n?.usb) throw new DevicePrinterError("NOT_SUPPORTED", "Browser ini belum mendukung WebUSB. Pakai Google Chrome/Edge di laptop.");
      const device = await n.usb.requestDevice({ filters: [] });
      await prepareUsb(device);
      return device.productName || "Printer USB";
    }
    if (!n?.bluetooth) throw new DevicePrinterError("NOT_SUPPORTED", "Browser ini belum mendukung Web Bluetooth. Pakai Google Chrome/Edge di laptop.");
    const device = await n.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_PRINTER_SERVICES });
    await prepareBle(device);
    return device.name || "Printer Bluetooth";
  } catch (error) {
    if (error instanceof DevicePrinterError) throw error;
    const name = (error as { name?: string })?.name;
    if (name === "NotFoundError" || name === "AbortError") {
      throw new DevicePrinterError("CANCELLED", "Pemilihan printer dibatalkan.");
    }
    if (name === "SecurityError" || name === "NetworkError") {
      throw new DevicePrinterError(
        "SEND_FAILED",
        "Printer tidak bisa dibuka. Pastikan printer menyala dan tidak sedang dipakai aplikasi lain.",
      );
    }
    throw new DevicePrinterError("SEND_FAILED", error instanceof Error ? error.message : "Gagal menyambung printer.");
  }
}

/** Sambung ulang tanpa dialog ke perangkat yang sudah pernah diizinkan. */
async function reconnect(mode: "serial" | "usb" | "ble", config: DevicePrinterConfig): Promise<boolean> {
  const n = nav();
  try {
    if (mode === "serial") {
      if (serialPort?.writable) return true;
      const ports = (await n?.serial?.getPorts()) ?? [];
      if (ports.length === 0) return false;
      await openSerial(ports[0], config.baudRate);
      return true;
    }
    if (mode === "usb") {
      if (usbTarget?.device.opened) return true;
      const devices = (await n?.usb?.getDevices()) ?? [];
      if (devices.length === 0) return false;
      await prepareUsb(devices[0]);
      return true;
    }
    if (bleTarget?.device.gatt?.connected) return true;
    if (bleTarget) {
      await prepareBle(bleTarget.device);
      return true;
    }
    const devices = (await n?.bluetooth?.getDevices?.()) ?? [];
    if (devices.length === 0) return false;
    await prepareBle(devices[0]);
    return true;
  } catch {
    return false;
  }
}

async function writeBytes(mode: "serial" | "usb" | "ble", bytes: Uint8Array) {
  if (mode === "serial") {
    const writable = serialPort?.writable;
    if (!writable) throw new DevicePrinterError("NOT_CONNECTED", "Printer belum terhubung.");
    const writer = writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
    return;
  }
  if (mode === "usb") {
    if (!usbTarget) throw new DevicePrinterError("NOT_CONNECTED", "Printer USB belum terhubung.");
    for (const chunk of chunkBytes(bytes, 4096)) {
      await usbTarget.device.transferOut(usbTarget.endpoint, chunk);
    }
    return;
  }
  if (!bleTarget) throw new DevicePrinterError("NOT_CONNECTED", "Printer Bluetooth belum terhubung.");
  const c = bleTarget.characteristic;
  for (const chunk of chunkBytes(bytes, 100)) {
    if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) {
      await c.writeValueWithoutResponse(chunk);
      // Jeda kecil agar buffer printer murah tidak meluap.
      await new Promise((resolve) => setTimeout(resolve, 15));
    } else if (c.writeValueWithResponse) {
      await c.writeValueWithResponse(chunk);
    } else if (c.writeValue) {
      await c.writeValue(chunk);
    }
  }
}

/** Kirim ke printer langsung (serial/usb/ble), sambung ulang sekali bila putus. */
export async function sendToDirectPrinter(
  mode: "serial" | "usb" | "ble",
  bytes: Uint8Array,
  config: DevicePrinterConfig,
) {
  if (!(await reconnect(mode, config))) {
    throw new DevicePrinterError(
      "NOT_CONNECTED",
      "Printer belum terhubung di laptop ini. Buka Pengaturan Printer lalu klik Hubungkan.",
    );
  }
  try {
    await writeBytes(mode, bytes);
  } catch {
    // Kabel tercabut / Bluetooth tidur: reset cache, coba sekali lagi.
    serialPort = null;
    usbTarget = null;
    if (!(await reconnect(mode, config))) {
      throw new DevicePrinterError("NOT_CONNECTED", "Printer terputus. Nyalakan printer lalu klik Hubungkan.");
    }
    try {
      await writeBytes(mode, bytes);
    } catch (error) {
      throw new DevicePrinterError("SEND_FAILED", error instanceof Error ? error.message : "Gagal mengirim ke printer.");
    }
  }
}

/** Mode langsung yang bisa dipakai tanpa dialog (untuk mode Otomatis). */
export async function findRememberedDirectMode(
  config: DevicePrinterConfig,
): Promise<"serial" | "usb" | "ble" | null> {
  if (serialPort?.writable) return "serial";
  if (usbTarget?.device.opened) return "usb";
  if (bleTarget) return "ble";
  for (const mode of ["serial", "usb", "ble"] as const) {
    if (await reconnect(mode, config)) return mode;
  }
  return null;
}

export async function forgetDevicePrinter() {
  try {
    await serialPort?.close();
  } catch {
    // port sudah tertutup
  }
  try {
    await usbTarget?.device.close();
  } catch {
    // perangkat sudah tertutup
  }
  serialPort = null;
  usbTarget = null;
  bleTarget = null;
}

// ── Dialog print Chrome (printer umum) ──────────────────────────────────────

/** Cetak teks struk lewat dialog print Chrome, kertas 58/80 mm. */
export function printViaBrowser(content: string, config: DevicePrinterConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new DevicePrinterError("NOT_SUPPORTED", "Dialog print tidak tersedia."));
      return;
    }
    const widthMm = config.paper === "80" ? 80 : 58;
    const columns = deviceColumns(config);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      reject(new DevicePrinterError("NOT_SUPPORTED", "Dialog print tidak tersedia."));
      return;
    }
    const escaped = stripControlCodes(content)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    // Ukuran huruf dihitung agar `columns` karakter pas selebar area cetak.
    const printableMm = widthMm - 6;
    const fontMm = (printableMm / columns / 0.6).toFixed(2);
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Struk</title><style>
      @page { size: ${widthMm}mm auto; margin: 0 }
      html, body { margin: 0; padding: 0; background: #fff; color: #000 }
      pre { margin: 0; padding: 2mm 3mm; width: ${printableMm}mm; font: ${fontMm}mm/1.25 "Courier New", monospace; white-space: pre; }
    </style></head><body><pre>${escaped}</pre></body></html>`);
    doc.close();
    const cleanup = () => window.setTimeout(() => iframe.remove(), 500);
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
        cleanup();
        resolve();
      } catch (error) {
        cleanup();
        reject(new DevicePrinterError("SEND_FAILED", error instanceof Error ? error.message : "Dialog print gagal."));
      }
    }, 50);
  });
}
