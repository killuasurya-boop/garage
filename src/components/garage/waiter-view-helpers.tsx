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
};

// Palet Garage (hitam · silver · merah · amber). Setiap status punya LABEL teks,
// jadi warna hanya penguat — tidak ada yang harus ditebak dari warna saja.
//   Kosong   → grafit netral          Belum bayar → amber
//   Di kasir → amber pekat            Lunas       → silver
//   Perlu bersih → merah              Dibersihkan → merah putus-putus
//   Dipesan  → silver putus-putus     Sebagian lunas → amber + silver
export function tableTone(row: TableLiveRow): TableTone {
  if (isCleaningTable(row)) {
    return {
      card: "border-dashed border-[#ff2a3a]/70 bg-[#d11a2a]/10",
      label: "Dibersihkan",
      short: "Kotor",
      labelColor: "text-[#ffb3b3]",
      swatch: "border border-dashed border-[#ff2a3a] bg-[#d11a2a]/20",
    };
  }
  if (isDirtyTable(row)) {
    return {
      card: "border-[#ff2a3a]/75 bg-[#d11a2a]/14",
      label: "Perlu bersih",
      short: "Kotor",
      labelColor: "text-[#ffb3b3]",
      swatch: "border border-[#ff2a3a] bg-[#d11a2a]/35",
    };
  }
  if (row.status === "reserved") {
    return {
      card: "border-dashed border-[#d4d4d8]/70 bg-white/[0.04]",
      label: "Dipesan",
      short: "Dipesan",
      labelColor: "text-[#e4e4e7]",
      swatch: "border border-dashed border-[#d4d4d8] bg-white/10",
    };
  }
  if (hasAwaitingPaymentBill(row)) {
    return {
      card: "border-[#f5a742] bg-[#f5a742]/18",
      label: "Di kasir",
      short: "Di kasir",
      labelColor: "text-[#ffd08a]",
      swatch: "border border-[#f5a742] bg-[#f5a742]/45",
    };
  }
  if (row.status === "mixed") {
    return {
      card: "border-[#f5a742]/70 bg-[linear-gradient(135deg,rgba(245,167,66,0.14),rgba(212,212,216,0.08))]",
      label: "Sebagian lunas",
      short: "Sebagian",
      labelColor: "text-[#ffd08a]",
      swatch: "border border-[#f5a742] bg-[linear-gradient(135deg,rgba(245,167,66,0.5),rgba(212,212,216,0.35))]",
    };
  }
  if (isPaidOnly(row)) {
    return {
      card: "border-[#d4d4d8]/60 bg-white/[0.07]",
      label: "Lunas",
      short: "Lunas",
      labelColor: "text-[#f4f4f5]",
      swatch: "border border-[#d4d4d8] bg-white/25",
    };
  }
  if (hasOpenBill(row)) {
    return {
      card: "border-[#f5a742]/70 bg-[#f5a742]/10",
      label: row.status === "pending" ? "Menunggu kasir" : "Belum bayar",
      short: "Terisi",
      labelColor: "text-[#ffd08a]",
      swatch: "border border-[#f5a742]/80 bg-[#f5a742]/25",
    };
  }
  return {
    card: "border-garage-line bg-garage-bg-2",
    label: "Kosong",
    short: "Kosong",
    labelColor: "text-garage-dim",
    swatch: "border border-garage-line-2 bg-garage-bg-2",
  };
}

/** Keterangan warna untuk peta & pemilih meja. */
export const TABLE_LEGEND: Array<{ label: string; swatch: string }> = [
  { label: "Kosong", swatch: "border border-garage-line-2 bg-garage-bg-2" },
  { label: "Belum bayar", swatch: "border border-[#f5a742]/80 bg-[#f5a742]/25" },
  { label: "Lunas", swatch: "border border-[#d4d4d8] bg-white/25" },
  { label: "Perlu bersih", swatch: "border border-[#ff2a3a] bg-[#d11a2a]/35" },
  { label: "Dipesan", swatch: "border border-dashed border-[#d4d4d8] bg-white/10" },
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
