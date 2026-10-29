"use client";

import type { ReactNode } from "react";

import type { PackUom } from "@/lib/stock-uom";
import { OPNAME_CLASS_META, type OpnameClass } from "@/lib/wms-opname-rules";

export type OpnameKind = "daily" | "weekly" | "monthly" | "incidental";
export type OpnameScope = "full" | "partial" | "cycle";

export type OpnameRow = {
  id: string;
  doc: string;
  status: string;
  kind: OpnameKind;
  scope: OpnameScope;
  rejected: boolean;
  warehouseId: string | null;
  warehouse: string;
  lines: number;
  counted: number;
  recount: number;
  createdAt: string;
};

export type OpnameLine = {
  id: string;
  productId: string | null;
  productName: string;
  sku: string | null;
  barcode: string | null;
  imageUrl: string | null;
  category: string | null;
  unit: string;
  uoms?: PackUom[];
  counted: boolean;
  countedByMe: boolean;
  attempts: number;
  needsRecount: boolean;
  recountReason: string;
  /** null = hitung buta. */
  systemQty: number | null;
  physicalQty: number | null;
  firstPhysicalQty: number | null;
  variance: number | null;
  varianceValue: number | null;
  classification: OpnameClass | null;
};

export type OpnameDetail = {
  id: string;
  doc: string;
  warehouseId: string | null;
  status: string;
  kind: OpnameKind;
  scope: OpnameScope;
  businessDate: string | null;
  blind: boolean;
  rejectReason: string;
  progress: { counted: number; total: number; recount: number };
  approvalTier: OpnameClass | null;
  lines: OpnameLine[];
};

export type WarehouseOption = { id: string; name: string; type: string };

export const KIND_LABEL: Record<OpnameKind, string> = { daily: "Harian", weekly: "Mingguan", monthly: "Bulanan", incidental: "Insidental" };
export const SCOPE_LABEL: Record<OpnameScope, string> = { full: "Penuh", partial: "Sebagian", cycle: "Cycle count" };
export const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Sedang dihitung", cls: "bg-[#FEF3C7] text-[#92400E]" },
  submitted: { label: "Menunggu review", cls: "bg-[#DBEAFE] text-[#1E40AF]" },
  completed: { label: "Diposting", cls: "bg-[#DCFCE7] text-[#166534]" },
};

// Warna status selisih: hijau sesuai, abu kecil, kuning hitung ulang, ungu manajer, merah Owner.
export const TONE_CLS: Record<(typeof OPNAME_CLASS_META)[OpnameClass]["tone"], string> = {
  green: "bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]",
  gray: "bg-[#F3F4F6] text-[#374151] border-[#E5E7EB]",
  amber: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]",
  purple: "bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]",
  red: "bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]",
};

/** Transisi 150–250 ms; dimatikan bila pengguna memilih kurangi gerak. */
export const motion = "transition-[background-color,border-color,color,opacity,transform] duration-200 ease-out motion-reduce:transition-none";

export const rupiah = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
export const num = (n: number | null | undefined) => (n === null || n === undefined ? "–" : n.toLocaleString("id-ID", { maximumFractionDigits: 4 }));
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n.toLocaleString("id-ID")}%`);
export const todayWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

export function ClassBadge({ value }: { value: OpnameClass | null }) {
  if (!value) return <span className="text-[11px] text-[#9CA3AF]">–</span>;
  const meta = OPNAME_CLASS_META[value];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE_CLS[meta.tone]}`}>{meta.label}</span>;
}

export function StatusBadge({ status, rejected }: { status: string; rejected?: boolean }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "bg-[#F3F4F6] text-[#374151]" };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${rejected ? "bg-[#FEE2E2] text-[#991B1B]" : meta.cls}`}>{rejected ? "Perlu hitung ulang" : meta.label}</span>;
}

export function Kpi({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "bad" | "good" | "warn" }) {
  const toneCls = tone === "bad" ? "text-[#B91C1C]" : tone === "good" ? "text-[#15803D]" : tone === "warn" ? "text-[#B45309]" : "text-[#111111]";
  return (
    <div className="min-w-0 rounded-xl border border-[#E8E8E8] bg-white p-3">
      <p className="text-[11.5px] font-semibold text-[#4B5563]">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-[18px] font-extrabold ${toneCls}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11.5px] text-[#6B7280]">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const p = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#F0F1F4]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label="Progres hitung">
      <div className={`h-full rounded-full bg-[#C8102E] ${motion}`} style={{ width: `${p}%` }} />
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const cls =
    tone === "error"
      ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]"
      : tone === "warn"
        ? "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]"
        : tone === "ok"
          ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
          : "border-[#BFDBFE] bg-[#EFF6FF] text-[#1E40AF]";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-[13px] ${cls}`}>
      {children}
    </p>
  );
}

export const DISCLAIMER = "Selisih stok adalah sinyal untuk diperiksa (resep, pencatatan, penerimaan, salah hitung) — bukan bukti kesalahan atau pencurian oleh orang tertentu.";
