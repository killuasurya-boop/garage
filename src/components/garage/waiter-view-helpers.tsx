import {
  ChefHat,
  CircleDot,
  Coffee,
  Loader2,
  Sparkle,
} from "lucide-react";

import type { GarageMe, TableLiveRow } from "@/lib/garage-api-types";

export const POLL_MS = 6000;

export type ToastInput = {
  tone: "success" | "error" | "info";
  title: string;
  body?: string;
  ttl?: number;
};

// Waiter tidak lagi mengurus antaran (Bar/Dapur yang memanggil & mencatat "Diambil").
export type WaiterBoardTab = "tables" | "bills" | "more";

export function stationTone(station: string): string {
  if (station?.toLowerCase().includes("bar")) return "text-[#fbbf24]";
  return "text-[#a7f3d0]";
}

export function stationIcon(station: string) {
  if (station?.toLowerCase().includes("bar")) return <Coffee size={14} />;
  return <ChefHat size={14} />;
}

export function statusBadge(status: string) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#22c55e]/18 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#bbf7d0] ring-1 ring-[#22c55e]/40">
        <Sparkle size={10} /> Siap Antar
      </span>
    );
  }
  if (status === "cooking") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e8883a]/16 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ffd08a] ring-1 ring-[#e8883a]/40">
        <Loader2 size={10} className="animate-spin" /> Diproses
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70 ring-1 ring-white/15">
      <CircleDot size={10} /> Antri
    </span>
  );
}

export function hasOpenBill(row: TableLiveRow) {
  return (
    (row.openBillCount ?? 0) > 0 ||
    row.status === "pending" ||
    row.status === "accepted" ||
    row.status === "awaiting_payment" ||
    row.status === "ready" ||
    row.status === "mixed"
  );
}

export function hasAwaitingPaymentBill(row: TableLiveRow) {
  return (
    row.status === "awaiting_payment" ||
    (row.bills ?? []).some((bill) => bill.status === "awaiting_payment")
  );
}

export function isWaiterOperator(role: GarageMe["role"]) {
  return role === "Waiter";
}

export function isPaidOnly(row: TableLiveRow) {
  return (
    (row.openBillCount ?? 0) === 0 &&
    ((row.paidBillCount ?? 0) > 0 || row.status === "paid")
  );
}

// Siklus meja (Production Hub §12): AVAILABLE → OCCUPIED → DIRTY → CLEANING →
// AVAILABLE, plus RESERVED.
export function isCleaningTable(row: TableLiveRow) {
  return row.status === "cleaning";
}

export function isDirtyTable(row: TableLiveRow) {
  return !isCleaningTable(row) && (row.needsCleaning || row.status === "needs_cleaning");
}

export type TableTone = {
  /** Kelas kartu: latar + garis tepi. */
  card: string;
  /** Teks status (Bahasa Indonesia), selalu tampil di kartu. */
  label: string;
  /** Versi pendek untuk sel sempit (pemilih meja). */
  short: string;
  labelColor: string;
  /** Kotak kecil untuk keterangan warna / chip. */
  swatch: string;
  /** Garis aksen status di sisi kiri kartu meja. */
  bar: string;
  /** Titik status di pil label. */
  dot: string;
};

// Warna status meja (PDF owner "Flow Pemesanan Menu Digital", Okt 2026) — sama
// dengan menu digital pelanggan. Setiap status punya LABEL teks; warna hanya penguat.
//   Kosong → hijau      Sedang dipilih → kuning     Terisi → merah (label teks
//   menyebut keadaannya: Belum bayar / Di kasir / Sebagian lunas / Lunas)
//   Reserved → biru
//   Perlu bersih → abu-abu      Dibersihkan → abu-abu putus-putus
export function tableTone(row: TableLiveRow): TableTone {
  if (isCleaningTable(row)) {
    return {
      card: "border-dashed border-[#9ca3af]/70 bg-[#9ca3af]/10",
      label: "Dibersihkan",
      bar: "bg-[repeating-linear-gradient(180deg,#9ca3af_0_6px,transparent_6px_10px)]",
      dot: "bg-[#9ca3af]",
      short: "Bersih-bersih",
      labelColor: "text-[#e5e7eb]",
      swatch: "border border-dashed border-[#9ca3af] bg-[#9ca3af]/20",
    };
  }
  if (isDirtyTable(row)) {
    return {
      card: "border-[#9ca3af]/75 bg-[#9ca3af]/14",
      label: "Perlu dibersihkan",
      bar: "bg-[#9ca3af]",
      dot: "bg-[#9ca3af]",
      short: "Kotor",
      labelColor: "text-[#e5e7eb]",
      swatch: "border border-[#9ca3af] bg-[#9ca3af]/35",
    };
  }
  if (row.status === "reserved") {
    return {
      card: "border-[#3b82f6]/70 bg-[#3b82f6]/12",
      label: "Reserved",
      bar: "bg-[#3b82f6]",
      dot: "bg-[#3b82f6]",
      short: "Reserved",
      labelColor: "text-[#bfdbfe]",
      swatch: "border border-[#3b82f6] bg-[#3b82f6]/30",
    };
  }
  if (row.status === "held") {
    return {
      card: "border-[#facc15]/75 bg-[#facc15]/12",
      label: "Sedang dipilih",
      bar: "bg-[#facc15]",
      dot: "bg-[#facc15]",
      short: "Dipilih",
      labelColor: "text-[#fef08a]",
      swatch: "border border-[#facc15] bg-[#facc15]/30",
    };
  }
  if (hasAwaitingPaymentBill(row)) {
    return {
      card: "border-[#ef4444] bg-[#ef4444]/18",
      label: "Di kasir",
      bar: "bg-[#ef4444]",
      dot: "bg-[#ef4444]",
      short: "Di kasir",
      labelColor: "text-[#fecaca]",
      swatch: "border border-[#ef4444] bg-[#ef4444]/45",
    };
  }
  if (row.status === "mixed") {
    return {
      card: "border-[#ef4444]/70 bg-[#ef4444]/12",
      label: "Sebagian lunas",
      bar: "bg-[#ef4444]",
      dot: "bg-[#ef4444]",
      short: "Sebagian",
      labelColor: "text-[#fecaca]",
      swatch: "border border-[#ef4444] bg-[#ef4444]/30",
    };
  }
  if (isPaidOnly(row)) {
    return {
      card: "border-[#ef4444]/50 bg-[#ef4444]/8",
      label: "Lunas",
      bar: "bg-[#ef4444]/70",
      dot: "bg-[#ef4444]",
      short: "Lunas",
      labelColor: "text-[#fecaca]",
      swatch: "border border-[#ef4444]/60 bg-[#ef4444]/15",
    };
  }
  if (hasOpenBill(row)) {
    return {
      card: "border-[#ef4444]/75 bg-[#ef4444]/14",
      label: row.status === "pending" ? "Menunggu kasir" : "Belum bayar",
      bar: "bg-[#ef4444]",
      dot: "bg-[#ef4444]",
      short: "Terisi",
      labelColor: "text-[#fecaca]",
      swatch: "border border-[#ef4444]/80 bg-[#ef4444]/30",
    };
  }
  return {
    card: "border-[#22c55e]/55 bg-[#22c55e]/8",
    label: "Kosong",
    bar: "bg-[#22c55e]",
    dot: "bg-[#22c55e]",
    short: "Kosong",
    labelColor: "text-[#bbf7d0]",
    swatch: "border border-[#22c55e] bg-[#22c55e]/25",
  };
}

/** Keterangan warna untuk peta & pemilih meja (sama dengan menu digital pelanggan). */
export const TABLE_LEGEND: Array<{ label: string; swatch: string }> = [
  { label: "Kosong", swatch: "border border-[#22c55e] bg-[#22c55e]/25" },
  { label: "Sedang dipilih", swatch: "border border-[#facc15] bg-[#facc15]/30" },
  { label: "Terisi", swatch: "border border-[#ef4444]/80 bg-[#ef4444]/30" },
  { label: "Reserved", swatch: "border border-[#3b82f6] bg-[#3b82f6]/30" },
  { label: "Perlu dibersihkan", swatch: "border border-[#9ca3af] bg-[#9ca3af]/35" },
];

/** Meja aktif yang menunggu lama: amber ≥15 menit, merah ≥30 menit. */
export function waitLevel(row: TableLiveRow): "ok" | "watch" | "late" {
  if (row.staleFromPreviousDay) return "late";
  if (!hasOpenBill(row)) return "ok";
  if (row.timerMinutes >= 30) return "late";
  if (row.timerMinutes >= 15) return "watch";
  return "ok";
}

export function relativeFromNow(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}d lalu`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  return `${h}j ${m % 60}m lalu`;
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function billStatusTone(status: string): { label: string; cls: string } {
  if (status === "paid") {
    return { label: "Lunas", cls: "bg-white/10 text-[#f4f4f5] ring-[#d4d4d8]/45" };
  }
  if (status === "awaiting_payment") {
    return { label: "Di kasir", cls: "bg-[#f5a742]/18 text-[#ffd08a] ring-[#f5a742]/45" };
  }
  if (status === "rejected") {
    return { label: "Ditolak", cls: "bg-white/8 text-white/60 ring-white/15" };
  }
  if (status === "pending_cashier" || status === "pending") {
    return { label: "Menunggu kasir", cls: "bg-[#f5a742]/12 text-[#ffd08a] ring-[#f5a742]/35" };
  }
  if (status === "accepted") {
    return { label: "Diterima", cls: "bg-[#f5a742]/12 text-[#ffd08a] ring-[#f5a742]/35" };
  }
  if (status === "ready") {
    return { label: "Siap antar", cls: "bg-[#f5a742]/18 text-[#ffd08a] ring-[#f5a742]/45" };
  }
  return { label: "Belum bayar", cls: "bg-[#f5a742]/12 text-[#ffd08a] ring-[#f5a742]/35" };
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-8 text-center">
      <p className="text-sm font-semibold text-white/80">{title}</p>
      <p className="mt-1 text-[12px] text-white/55">{body}</p>
    </div>
  );
}
