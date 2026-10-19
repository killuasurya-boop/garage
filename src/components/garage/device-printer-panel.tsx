"use client";

import {
  Bluetooth,
  CheckCircle2,
  Globe,
  Network,
  Plug,
  Printer,
  Unplug,
  Usb,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEVICE_PRINTER_MODE_LABELS,
  DevicePrinterError,
  connectDevicePrinter,
  deviceColumns,
  devicePrinterSupport,
  forgetDevicePrinter,
  loadDevicePrinterConfig,
  saveDevicePrinterConfig,
  type DevicePrinterConfig,
  type DevicePrinterMode,
} from "@/lib/device-printer";
import { buildTestPageContent } from "@/lib/management-slips";
import { PAPER_COLUMNS } from "@/lib/receipt-layout";
import { printDocument } from "@/lib/print-client";

type ModeOption = {
  mode: DevicePrinterMode;
  icon: LucideIcon;
  title: string;
  detail: string;
  support?: "serial" | "usb" | "ble";
};

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: "auto",
    icon: Wand2,
    title: "Otomatis",
    detail: "Pakai printer yang pernah dihubungkan; bila tidak ada, agen lalu dialog print Chrome.",
  },
  {
    mode: "serial",
    icon: Plug,
    title: "Kabel / Bluetooth (COM)",
    detail: "RPP02N & printer kasir umum. Bluetooth: pair dulu di Windows, lalu pilih port COM-nya.",
    support: "serial",
  },
  {
    mode: "ble",
    icon: Bluetooth,
    title: "Bluetooth LE",
    detail: "Printer Bluetooth Low Energy — langsung dipilih dari Chrome tanpa pair Windows.",
    support: "ble",
  },
  {
    mode: "usb",
    icon: Usb,
    title: "Kabel USB langsung",
    detail: "Printer USB yang tidak muncul sebagai port COM.",
    support: "usb",
  },
  {
    mode: "agent",
    icon: Network,
    title: "Jaringan / LAN",
    detail: "Printer IP (WiFi/LAN) lewat Garage Print Agent di laptop ini.",
  },
  {
    mode: "browser",
    icon: Globe,
    title: "Printer umum (Chrome)",
    detail: "Printer apa pun yang sudah terpasang di laptop — lewat dialog print Chrome.",
  },
];

const SERVER_SUPPORT = { serial: false, usb: false, ble: false, secure: true };
let cachedSupport: ReturnType<typeof devicePrinterSupport> | null = null;
const subscribeNoop = () => () => {};
const clientSupport = () => (cachedSupport ??= devicePrinterSupport());
const serverSupport = () => SERVER_SUPPORT;

const DIRECT_MODES = new Set<DevicePrinterMode>(["serial", "usb", "ble"]);

/**
 * Pengaturan printer per laptop (owner, Okt 2026): kasir/helper cukup pilih
 * cara sambung → Hubungkan → Tes cetak. Disimpan di browser laptop ini.
 */
export function DevicePrinterPanel({
  brand,
  compact = false,
}: {
  brand?: { brandName?: string | null; outletName?: string | null; outletCode?: string | null };
  compact?: boolean;
}) {
  const [config, setConfig] = useState<DevicePrinterConfig>(() => loadDevicePrinterConfig());
  const support = useSyncExternalStore(subscribeNoop, clientSupport, serverSupport);
  const [busy, setBusy] = useState<"connect" | "test" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = deviceColumns(config);
  const preview = useMemo(
    () =>
      buildTestPageContent(
        { printerLabel: config.deviceLabel || "-", modeLabel: DEVICE_PRINTER_MODE_LABELS[config.mode] },
        { width: columns, brand, showSignature: false, printedAt: "2026-01-01T05:00:00.000Z" },
      ),
    [brand, columns, config.deviceLabel, config.mode],
  );

  function update(patch: Partial<DevicePrinterConfig>) {
    setConfig((current) => saveDevicePrinterConfig({ ...current, ...patch }));
    setNotice(null);
    setError(null);
  }

  async function connect() {
    if (!DIRECT_MODES.has(config.mode)) return;
    setBusy("connect");
    setNotice(null);
    setError(null);
    try {
      const label = await connectDevicePrinter(config.mode as "serial" | "usb" | "ble", config);
      update({ deviceLabel: label });
      setNotice(`Terhubung: ${label}. Klik Tes cetak untuk memastikan.`);
    } catch (err) {
      if (err instanceof DevicePrinterError && err.code === "CANCELLED") {
        setNotice("Pemilihan printer dibatalkan.");
      } else {
        setError(err instanceof Error ? err.message : "Gagal menghubungkan printer.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function forget() {
    await forgetDevicePrinter();
    update({ deviceLabel: null });
    setNotice("Printer dilupakan di tab ini. Untuk mencabut izin permanen: ikon gembok di address bar Chrome.");
  }

  async function testPrint() {
    setBusy("test");
    setNotice(null);
    setError(null);
    try {
      const res = await printDocument((width) =>
        buildTestPageContent(
          { printerLabel: config.deviceLabel || "-", modeLabel: DEVICE_PRINTER_MODE_LABELS[config.mode] },
          { width, brand, showSignature: false },
        ),
      );
      const data = (await res.json().catch(() => ({}))) as {
        printer?: string;
        error?: { message?: string; actions?: string[] };
      };
      if (res.ok) {
        setNotice(`Tes cetak terkirim (${data.printer ?? "printer"}).`);
      } else {
        setError([data.error?.message, ...(data.error?.actions ?? [])].filter(Boolean).join(" · "));
      }
    } finally {
      setBusy(null);
    }
  }

  const selected = MODE_OPTIONS.find((option) => option.mode === config.mode) ?? MODE_OPTIONS[0];
  const isDirect = DIRECT_MODES.has(config.mode);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[#34343c] bg-white/[0.045] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Printer Perangkat Ini</p>
            <p className="mt-0.5 text-xs leading-5 text-[#c4c4cc]">
              Berlaku hanya di laptop/browser ini. Tanpa driver, cukup Chrome.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              config.deviceLabel
                ? "border-[#f5a742]/50 bg-[#f5a742]/15 text-[#ffd08a]"
                : "border-[#4a4a54] bg-white/[0.05] text-[#c4c4cc]"
            }`}
          >
            {config.deviceLabel ? <CheckCircle2 className="size-3.5" /> : <Printer className="size-3.5" />}
            {config.deviceLabel ?? "Belum ada printer"}
          </span>
        </div>

        <div className={`mt-3 grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const unsupported = option.support ? !support[option.support] : false;
            const active = config.mode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                disabled={unsupported}
                onClick={() => update({ mode: option.mode })}
                aria-pressed={active}
                className={`garage-press flex min-h-[76px] flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                  active
                    ? "border-[#e5484d] bg-[#e5484d]/15 text-white"
                    : "border-[#3a3a44] bg-white/[0.04] text-[#e4e4ea] hover:bg-white/[0.08]"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4 shrink-0" />
                  {option.title}
                </span>
                <span className="text-xs leading-4 text-[#c4c4cc]">
                  {unsupported ? "Tidak didukung browser ini — pakai Chrome/Edge di laptop (HTTPS)." : option.detail}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 rounded-md border border-[#34343c] bg-white/[0.045] p-3 sm:grid-cols-2">
        <div className="space-y-1 text-xs font-semibold text-[#d8d8de]">
          <span>Lebar kertas</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Lebar kertas">
            {(["58", "80"] as const).map((paper) => (
              <button
                key={paper}
                type="button"
                aria-pressed={config.paper === paper}
                onClick={() => update({ paper, columns: null })}
                className={`garage-press h-10 rounded-md border px-2 text-sm font-semibold transition-colors ${
                  config.paper === paper
                    ? "border-[#e5484d] bg-[#e5484d]/20 text-white"
                    : "border-[#4a4a54] bg-white/[0.05] text-[#e4e4ea] hover:bg-white/[0.09]"
                }`}
              >
                {paper} mm · {paper === "58" ? 32 : 48} kolom
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1 text-xs font-semibold text-[#d8d8de]">
          <span>Ukuran huruf struk</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ukuran huruf struk">
            {(["normal", "besar"] as const).map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={config.textSize === size}
                onClick={() => update({ textSize: size })}
                className={`garage-press h-10 rounded-md border px-2 text-sm font-semibold transition-colors ${
                  config.textSize === size
                    ? "border-[#e5484d] bg-[#e5484d]/20 text-white"
                    : "border-[#4a4a54] bg-white/[0.05] text-[#e4e4ea] hover:bg-white/[0.09]"
                }`}
              >
                {size === "besar" ? "Besar (tinggi 2×)" : "Normal"}
              </button>
            ))}
          </div>
        </div>
        <label className="space-y-1 text-xs font-semibold text-[#d8d8de]">
          Jumlah kolom per baris
          <select
            value={columns}
            onChange={(e) => {
              const value = Number(e.target.value);
              update({ columns: value === PAPER_COLUMNS[config.paper] ? null : value });
            }}
            className="h-10 w-full rounded-md border border-[#4a4a54] bg-[#1b1b20] px-2 text-sm text-white"
          >
            {(config.paper === "80" ? [42, 44, 46, 48] : [28, 30, 32]).map((count) => (
              <option key={count} value={count}>
                {count} kolom{count === PAPER_COLUMNS[config.paper] ? " (standar)" : ""}
              </option>
            ))}
          </select>
          <span className="block font-normal text-[#c4c4cc]">
            Angka di kanan struk terpotong? Turunkan ke {config.paper === "80" ? 46 : 30}.
          </span>
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-[#e4e4ea]">
          <input
            type="checkbox"
            checked={config.bold}
            onChange={(e) => update({ bold: e.target.checked })}
            className="size-4 accent-[#e5484d]"
          />
          Huruf tebal (lebih hitam &amp; jelas)
        </label>
        {config.mode === "serial" ? (
          <label className="space-y-1 text-xs font-semibold text-[#d8d8de]">
            Kecepatan port (baud)
            <select
              value={config.baudRate}
              onChange={(e) => update({ baudRate: Number(e.target.value) })}
              className="h-10 w-full rounded-md border border-[#4a4a54] bg-[#1b1b20] px-2 text-sm text-white"
            >
              {[9600, 19200, 38400, 57600, 115200].map((baud) => (
                <option key={baud} value={baud}>
                  {baud}
                  {baud === 9600 ? " (RPP02N default)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {config.mode === "agent" || config.mode === "auto" ? (
          <label className="space-y-1 text-xs font-semibold text-[#d8d8de]">
            Alamat agen cetak (opsional)
            <Input
              value={config.agentUrl}
              onChange={(e) => update({ agentUrl: e.target.value })}
              placeholder="http://localhost:9100"
              className="h-10 border-[#4a4a54] bg-white/[0.06] font-mono"
            />
          </label>
        ) : null}
        <label className="flex min-h-10 items-center gap-2 text-sm text-[#e4e4ea]">
          <input
            type="checkbox"
            checked={config.cut}
            onChange={(e) => update({ cut: e.target.checked })}
            className="size-4 accent-[#e5484d]"
          />
          Potong kertas otomatis (printer dengan pisau)
        </label>
        <label className="space-y-1 text-xs font-semibold text-[#d8d8de]">
          Baris kosong di akhir struk
          <Input
            type="number"
            min={0}
            max={10}
            value={config.feedLines}
            onChange={(e) => update({ feedLines: Number(e.target.value) })}
            className="h-10 border-[#4a4a54] bg-white/[0.06]"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {isDirect ? (
          <Button type="button" className="garage-press h-11" onClick={() => void connect()} disabled={busy !== null}>
            <selected.icon className="mr-2 size-4" />
            {busy === "connect" ? "Menghubungkan..." : config.deviceLabel ? "Ganti printer" : "Hubungkan printer"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="garage-press h-11 border-[#f5a742]/50 bg-[#f5a742]/12 text-[#ffd08a] hover:bg-[#f5a742]/20"
          onClick={() => void testPrint()}
          disabled={busy !== null}
        >
          <Printer className="mr-2 size-4" />
          {busy === "test" ? "Mengirim..." : "Tes cetak"}
        </Button>
        {config.deviceLabel ? (
          <Button
            type="button"
            variant="outline"
            className="garage-press h-11 border-[#4a4a54] bg-white/[0.05]"
            onClick={() => void forget()}
            disabled={busy !== null}
          >
            <Unplug className="mr-2 size-4" />
            Lupakan printer
          </Button>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 px-3 py-2 text-sm text-[#ffe2b0]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-[#e5484d]/50 bg-[#e5484d]/12 px-3 py-2 text-sm text-[#ffc9cb]">
          {error}
        </p>
      ) : null}

      <div className={`grid gap-3 ${compact ? "" : "lg:grid-cols-[minmax(0,1fr)_auto]"}`}>
        <details className="rounded-md border border-[#34343c] bg-white/[0.035] p-3 text-sm text-[#d8d8de]">
          <summary className="cursor-pointer font-semibold text-white">Panduan singkat RPP02N di laptop</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-5">
            <li>
              <b>Bluetooth:</b> nyalakan printer → Windows Pengaturan → Bluetooth → Tambah perangkat → pilih
              RPP02N (PIN 0000 atau 1234). Lalu di sini pilih <b>Kabel / Bluetooth (COM)</b> → Hubungkan → pilih
              port &quot;Standard Serial over Bluetooth&quot;.
            </li>
            <li>
              <b>Kabel USB:</b> colok kabel → pilih <b>Kabel / Bluetooth (COM)</b> → Hubungkan → pilih port USB. Bila
              tidak muncul, coba <b>Kabel USB langsung</b>.
            </li>
            <li>
              <b>Printer lain / tidak terdeteksi:</b> pakai <b>Printer umum (Chrome)</b> — printer yang sudah terpasang di
              Windows. Agar tanpa dialog, buat shortcut Chrome dengan tambahan <code>--kiosk-printing</code>.
            </li>
            <li>
              <b>Printer WiFi/LAN:</b> pilih <b>Jaringan / LAN</b> dan jalankan Garage Print Agent (lihat dokumen
              PRINTER-LAPTOP).
            </li>
            <li>Chrome mengingat izin printer: setelah sekali dihubungkan, struk berikutnya langsung tercetak.</li>
          </ol>
        </details>
        <div className="overflow-x-auto rounded-md border border-[#34343c] bg-[#f4f4f0] p-2">
          <pre
            aria-label="Pratinjau struk"
            className="w-max font-mono text-[11px] leading-4 text-[#111]"
          >
            {preview}
          </pre>
        </div>
      </div>
    </div>
  );
}
