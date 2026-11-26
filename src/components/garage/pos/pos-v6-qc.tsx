"use client";

// QC Kasir (GOD++ Fase 4): ringkas, berbasis data NYATA di perangkat ini.
// Status: Siap / Perlu perhatian / Tidak tersedia / Belum diuji. Tidak memblokir transaksi —
// pemblokiran tetap di validasi yang sudah ada (tender guard, meja, shift). Tidak menampilkan
// kas seharusnya / omzet (blind count).
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, ClipboardCheck, Printer, RefreshCw, Wifi, WifiOff, XCircle } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DEVICE_PRINTER_MODE_LABELS, loadDevicePrinterConfig } from "@/lib/device-printer";
import { getPrintHealth, getPrintHealthServer, subscribePrintHealth } from "@/lib/print-health";

export type QcState = "ok" | "warn" | "down" | "unknown";

const STATE_LABEL: Record<QcState, string> = { ok: "Siap", warn: "Perlu perhatian", down: "Tidak tersedia", unknown: "Belum diuji" };

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}

function subscribeScreen(fn: () => void) {
  window.addEventListener("resize", fn);
  document.addEventListener("fullscreenchange", fn);
  return () => {
    window.removeEventListener("resize", fn);
    document.removeEventListener("fullscreenchange", fn);
  };
}

/** Snapshot layar (string supaya stabil untuk useSyncExternalStore). */
export function useScreenInfo() {
  const raw = useSyncExternalStore(
    subscribeScreen,
    () => `${window.innerWidth}x${window.innerHeight}|${document.fullscreenElement ? 1 : 0}|${window.devicePixelRatio || 1}`,
    () => "0x0|0|1",
  );
  const [size, fs, dpr] = raw.split("|");
  const [width, height] = size.split("x").map(Number);
  return { width, height, fullscreen: fs === "1", dpr: Number(dpr) };
}

export function screenCheck(info: { width: number; height: number; fullscreen: boolean }): { state: QcState; detail: string } {
  if (!info.width) return { state: "unknown", detail: "Memeriksa layar…" };
  const layout = info.width >= 1280 ? "sidebar + katalog + keranjang" : info.width >= 768 ? "tablet (menu lewat tombol Menu)" : "HP (keranjang di laci bawah)";
  const tips: string[] = [];
  if (!info.fullscreen) tips.push("belum layar penuh");
  if (info.height < 640) tips.push("tinggi layar sempit — perkecil ukuran teks di Theme Studio");
  if (info.width < 768) tips.push("layar HP — pakai tablet untuk kasir");
  const detail = `${info.width}×${info.height} px · ${info.width > info.height ? "mendatar" : "tegak"} · tata letak ${layout}${tips.length ? ` · ${tips.join(", ")}` : ""}.`;
  return { state: tips.length ? "warn" : "ok", detail };
}

export function useBrowserOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Cek server (/api/health) tiap 30 dtk dan saat kembali online. */
export function useServerHealth(enabled = true) {
  const online = useBrowserOnline();
  const [state, setState] = useState<{ ok: boolean | null; at: number | null; ms: number | null }>({ ok: null, at: null, ms: null });
  const check = useCallback(async () => {
    const started = performance.now();
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      setState({ ok: response.ok, at: Date.now(), ms: Math.round(performance.now() - started) });
    } catch {
      setState({ ok: false, at: Date.now(), ms: null });
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // Cek pertama dijadwalkan (bukan setState sinkron di effect).
    const first = window.setTimeout(() => void check(), 0);
    const id = window.setInterval(() => void check(), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [check, enabled, online]);
  return { ...state, online, check };
}

/** Indikator koneksi di topbar: hijau = online & server OK, merah = offline/server gagal. */
export function PosV6ConnectionChip({ onOpen, count = 0 }: { onOpen: () => void; count?: number }) {
  const health = useServerHealth();
  const bad = !health.online || health.ok === false;
  const text = !health.online ? "Offline" : health.ok === false ? "Server gagal" : "Online";
  // Angka di chip = pesanan QR menunggu + tiket Bar/Dapur aktif; jelaskan lewat aria-label/title.
  const countNote = count > 0 ? ` · ${count} pesanan QR/tiket perlu dicek` : "";
  return (
    <button
      type="button"
      className="pos-v6-tb-chip pos-v6-conn pos-v6-tb-btn pos-v6-tb-statuschip"
      data-bad={bad}
      data-tone={bad ? "danger" : undefined}
      data-testid="pos-qc-open"
      onClick={onOpen}
      aria-label={`Buka QC Kasir — ${text}${countNote}`}
      title={`${bad ? "Koneksi/server bermasalah — pembayaran bisa gagal" : "Online · server terhubung"}${countNote}`}
    >
      {bad ? <WifiOff className="size-3.5" aria-hidden /> : <Wifi className="size-3.5" aria-hidden />}
      <span className={`hidden ${bad ? "xl:inline" : "2xl:inline"}`}>{text}</span>
      {count > 0 ? <span className="pos-v6-tb-count">{count > 99 ? "99+" : count}</span> : null}
    </button>
  );
}

function StateIcon({ state }: { state: QcState }) {
  if (state === "ok") return <CheckCircle2 className="size-5 shrink-0" aria-hidden />;
  if (state === "warn") return <CircleAlert className="size-5 shrink-0" aria-hidden />;
  if (state === "down") return <XCircle className="size-5 shrink-0" aria-hidden />;
  return <CircleDashed className="size-5 shrink-0" aria-hidden />;
}

function Row({ state, title, detail, action }: { state: QcState; title: string; detail: ReactNode; action?: ReactNode }) {
  return (
    <li className="pos-v6-qc-row" data-state={state}>
      <StateIcon state={state} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 text-sm font-bold">
          {title}
          <span className="pos-v6-qc-badge">{STATE_LABEL[state]}</span>
        </span>
        <span className="block text-xs leading-snug opacity-85">{detail}</span>
      </span>
      {action}
    </li>
  );
}

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export function PosV6QcPanel({
  open,
  onOpenChange,
  theme,
  cashier,
  role,
  device,
  shiftOpen,
  menuCount,
  soldOutCount,
  qrisReady,
  qrWaiting,
  unpaidQr,
  kitchenReady,
  onOpenShift,
  onOpenQr,
  onOpenPending,
  onOpenKitchen,
  onOpenSoldOut,
  onReload,
  onToggleFullscreen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme?: string;
  cashier: string;
  role: string;
  device: string;
  shiftOpen: boolean;
  menuCount: number;
  soldOutCount: number;
  qrisReady: boolean;
  qrWaiting: number;
  unpaidQr: number;
  kitchenReady: number;
  onOpenShift: () => void;
  onOpenQr: () => void;
  onOpenPending: () => void;
  onOpenKitchen: () => void;
  onOpenSoldOut: () => void;
  onReload: () => void;
  onToggleFullscreen?: () => void;
}) {
  const health = useServerHealth(open);
  const screen = screenCheck(useScreenInfo());
  const print = useSyncExternalStore(subscribePrintHealth, getPrintHealth, getPrintHealthServer);
  const [printerMode, setPrinterMode] = useState<string>("");
  useEffect(() => {
    // Konfigurasi printer tersimpan per perangkat (localStorage) — dibaca saat panel dibuka.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setPrinterMode(DEVICE_PRINTER_MODE_LABELS[loadDevicePrinterConfig().mode]);
  }, [open]);

  const btn = (label: string, onClick: () => void) => (
    <button type="button" className="pos-v6-btn-outline !min-h-10 shrink-0 !px-3 text-xs" onClick={onClick}>
      {label}
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-cashier-theme-scope={theme} className="pos-v6-qc garage-scroll w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5" aria-hidden /> QC Kasir
          </SheetTitle>
          <SheetDescription>Cek kesiapan perangkat & antrean. Data dari perangkat ini dan server, diperbarui otomatis.</SheetDescription>
        </SheetHeader>

        <section className="space-y-2 px-4" aria-labelledby="qc-before">
          <h3 id="qc-before" className="pos-v6-studio-h">Sebelum & selama shift</h3>
          <ul className="space-y-1.5">
            <Row state="ok" title="Akun" detail={`Masuk sebagai ${cashier} (${role}) di ${device}. Pastikan ini akun Anda sendiri.`} />
            <Row
              state={shiftOpen ? "ok" : "warn"}
              title="Shift kasir"
              detail={shiftOpen ? "Shift aktif — transaksi tercatat ke shift Anda." : "Shift belum dibuka. Hitung modal awal lalu buka shift."}
              action={btn(shiftOpen ? "Tutup shift" : "Buka shift", onOpenShift)}
            />
            <Row
              state={!health.online ? "down" : health.ok === null ? "unknown" : health.ok ? "ok" : "down"}
              title="Internet & server"
              detail={
                !health.online
                  ? "Perangkat offline. Pembayaran tidak bisa disimpan sampai koneksi kembali."
                  : health.ok === null
                    ? "Memeriksa…"
                    : health.ok
                      ? `Server terhubung${health.ms !== null ? ` · ${health.ms} ms` : ""}${health.at ? ` · dicek ${timeFmt.format(health.at)}` : ""}.`
                      : "Server tidak menjawab. Jangan ulang transaksi dengan isi berbeda — tekan bayar lagi setelah pulih."
              }
              action={btn("Cek lagi", () => void health.check())}
            />
            <Row
              state={print === null ? "unknown" : print.ok ? "ok" : "warn"}
              title="Printer struk"
              detail={
                print === null
                  ? `Mode: ${printerMode || "—"}. Belum ada cetakan di sesi ini.`
                  : print.ok
                    ? `Cetak terakhir berhasil ${timeFmt.format(print.at)} · ${printerMode}.`
                    : `Cetak terakhir GAGAL ${timeFmt.format(print.at)}: ${print.message}. Pembayaran tetap sah — cetak ulang dari Riwayat Struk.`
              }
            />
            <Row
              state={menuCount > 0 ? (soldOutCount > 0 ? "warn" : "ok") : "down"}
              title="Menu & harga"
              detail={menuCount > 0 ? `${menuCount} produk dimuat${soldOutCount ? ` · ${soldOutCount} ditandai habis` : ""}.` : "Menu belum dimuat. Muat ulang POS."}
              action={menuCount > 0 ? (soldOutCount ? btn("Lihat habis", onOpenSoldOut) : undefined) : btn("Muat ulang", onReload)}
            />
            <Row
              state={screen.state}
              title="Cek layar"
              detail={screen.detail}
              action={onToggleFullscreen ? btn("Layar penuh", onToggleFullscreen) : undefined}
            />
            <Row state={qrisReady ? "ok" : "warn"} title="QRIS resmi" detail={qrisReady ? "Gambar QRIS merchant siap ditampilkan." : "Gambar QRIS belum tersedia — pembayaran QRIS dinonaktifkan."} />
          </ul>
        </section>

        <section className="mt-4 space-y-2 px-4" aria-labelledby="qc-queue">
          <h3 id="qc-queue" className="pos-v6-studio-h">Antrean yang perlu tindakan</h3>
          <ul className="space-y-1.5">
            <Row state={qrWaiting ? "warn" : "ok"} title="Order QR/Waiter menunggu" detail={qrWaiting ? `${qrWaiting} order menunggu Terima/Final Bayar.` : "Tidak ada."} action={qrWaiting ? btn("Buka", onOpenQr) : undefined} />
            <Row state={unpaidQr ? "warn" : "ok"} title="Tagihan belum lunas" detail={unpaidQr ? `${unpaidQr} tagihan belum lunas (Cash & QRIS dipisah) — tagih lalu Final Bayar setelah uang/mutasi diterima.` : "Tidak ada."} action={unpaidQr ? btn("Buka", onOpenPending) : undefined} />
            <Row state={kitchenReady ? "warn" : "ok"} title="Pesanan siap antar" detail={kitchenReady ? `${kitchenReady} tiket Bar/Dapur siap diantar.` : "Tidak ada."} action={kitchenReady ? btn("Buka", onOpenKitchen) : undefined} />
          </ul>
        </section>

        <section className="mt-4 space-y-2 px-4 pb-6" aria-labelledby="qc-after">
          <h3 id="qc-after" className="pos-v6-studio-h">Setelah shift</h3>
          <ol className="pos-v6-qc-steps list-decimal space-y-1 pl-5 text-sm">
            <li>Selesaikan order/tagihan yang belum lunas (lihat antrean di atas).</li>
            <li>Hitung uang laci per pecahan — hitungan #1, lalu hitungan ulang #2 (kosong, tanpa melihat #1).</li>
            <li>Cocokkan QRIS/Transfer dengan notifikasi merchant/bank (tidak masuk laci).</li>
            <li>Tentukan modal yang ditinggal & catat setoran ke rekening.</li>
            <li>Tutup shift → Manajer verifikasi → Owner finalisasi.</li>
          </ol>
          <button type="button" className="pos-v6-btn-primary mt-2 w-full justify-center" onClick={onOpenShift} disabled={!shiftOpen}>
            <RefreshCw className="size-4" aria-hidden /> Mulai tutup shift
          </button>
          <p className="flex items-start gap-1.5 text-xs opacity-80">
            <Printer className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Kas seharusnya & selisih baru tampil setelah shift ditutup (blind count).
          </p>
        </section>
      </SheetContent>
    </Sheet>
  );
}
