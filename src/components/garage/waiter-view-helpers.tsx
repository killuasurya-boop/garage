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

export type WaiterBoardTab = "tables" | "orders" | "ready" | "bills" | "more";

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
  return role === "Waiter 1" || role === "Waiter 2";
}

export function isPaidOnly(row: TableLiveRow) {
  return (
    (row.openBillCount ?? 0) === 0 &&
    ((row.paidBillCount ?? 0) > 0 || row.status === "paid")
  );
}

export function tableTone(row: TableLiveRow) {
  if (row.needsCleaning || row.status === "needs_cleaning") {
    return {
      ring: "ring-[#ef4444]/60",
      bg: "bg-[#ef4444]/12",
      label: "PERLU BERSIH",
      labelColor: "text-[#ffe1e5]",
      dotBg: "bg-[#ef4444]",
      dotRing: "ring-[#ef4444]/40",
    };
  }
  if (isPaidOnly(row)) {
    return {
      ring: "ring-[#22c55e]/55",
      bg: "bg-[#22c55e]/12",
      label: "LUNAS",
      labelColor: "text-[#bbf7d0]",
      dotBg: "bg-[#22c55e]",
      dotRing: "ring-[#22c55e]/40",
    };
  }
  if (row.status === "empty") {
    return {
      ring: "ring-white/14",
      bg: "bg-[#11100b]",
      label: "READY",
      labelColor: "text-[#d0c5af]",
      dotBg: "bg-[#d0c5af]/70",
      dotRing: "ring-white/15",
    };
  }
  if (row.status === "mixed") {
    return {
      ring: "ring-[#a855f7]/55",
      bg: "bg-gradient-to-br from-[#a855f7]/12 to-[#ef4444]/10",
      label: "MIXED",
      labelColor: "text-[#e9d5ff]",
      dotBg: "bg-[#a855f7]",
      dotRing: "ring-[#a855f7]/40",
    };
  }
  if (
    row.status === "pending" ||
    row.status === "accepted" ||
    row.status === "ready"
  ) {
    return {
      ring: "ring-[#e8883a]/55",
      bg: "bg-[#e8883a]/12",
      label: "BELUM BAYAR",
      labelColor: "text-[#ffd08a]",
      dotBg: "bg-[#e8883a]",
      dotRing: "ring-[#e8883a]/40",
    };
  }
  if (row.status === "awaiting_payment") {
    return {
      ring: "ring-[#fbbf24]/60",
      bg: "bg-[#fbbf24]/14",
      label: "TAGIHAN",
      labelColor: "text-[#fde68a]",
      dotBg: "bg-[#fbbf24]",
      dotRing: "ring-[#fbbf24]/40",
    };
  }
  return {
    ring: "ring-white/15",
    bg: "bg-white/[0.04]",
    label: row.status.replace(/_/g, " ").toUpperCase(),
    labelColor: "text-white/70",
    dotBg: "bg-white/40",
    dotRing: "ring-white/15",
  };
}

// Stripe pinggir kartu meja sebagai indikator urgensi: hijau (fresh) ->
// amber (>15m) -> red (>30m). Hanya untuk meja aktif/menunggu.
export function waitStripe(row: TableLiveRow): string {
  const inactive =
    row.status === "empty" || isPaidOnly(row) || !row.currentOrderId;
  if (inactive) return "";
  const m = row.timerMinutes ?? 0;
  const base =
    "before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-xl";
  if (m >= 30) return `${base} before:bg-[#d11a2a]`;
  if (m >= 15) return `${base} before:bg-[#e8883a]`;
  return `${base} before:bg-[#22c55e]/70`;
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
    return {
      label: "LUNAS",
      cls: "bg-[#22c55e]/12 text-[#bbf7d0] ring-[#22c55e]/35",
    };
  }
  if (status === "awaiting_payment") {
    return {
      label: "DI KASIR",
      cls: "bg-[#fbbf24]/15 text-[#fde68a] ring-[#fbbf24]/35",
    };
  }
  if (status === "rejected") {
    return {
      label: "DITOLAK",
      cls: "bg-white/8 text-white/55 ring-white/15",
    };
  }
  return {
    label: status.replace(/_/g, " ").toUpperCase(),
    cls: "bg-[#e8883a]/15 text-[#ffd08a] ring-[#e8883a]/35",
  };
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-8 text-center">
      <p className="text-sm font-semibold text-white/80">{title}</p>
      <p className="mt-1 text-[12px] text-white/55">{body}</p>
    </div>
  );
}
