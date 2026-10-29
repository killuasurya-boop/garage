"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, Loader2, ShieldQuestion, XCircle } from "lucide-react";

import type { ProcTone } from "@/lib/wms-procurement-meta";

// Nada warna pengadaan: SELALU ikon + teks (tidak hanya warna). Tema terang WMS.
export const TONE: Record<ProcTone, { pill: string; card: string; icon: typeof CheckCircle2 }> = {
  gray: { pill: "border-[#D1D5DB] bg-[#F3F4F6] text-[#374151]", card: "border-[#E5E7EB]", icon: CircleDashed },
  blue: { pill: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]", card: "border-[#BFDBFE]", icon: Loader2 },
  amber: { pill: "border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]", card: "border-[#FCD34D]", icon: Clock3 },
  red: { pill: "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]", card: "border-[#FCA5A5]", icon: XCircle },
  green: { pill: "border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]", card: "border-[#86EFAC]", icon: CheckCircle2 },
  purple: { pill: "border-[#D8B4FE] bg-[#FAF5FF] text-[#7E22CE]", card: "border-[#D8B4FE]", icon: ShieldQuestion },
};

export function TonePill({ tone, children, className = "" }: { tone: ProcTone; children: ReactNode; className?: string }) {
  const Icon = tone === "red" && typeof children === "string" && /terlambat|jatuh/i.test(children) ? AlertTriangle : TONE[tone].icon;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-bold ${TONE[tone].pill} ${className}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-[#ECEDF0] motion-reduce:animate-none ${className}`} />;
}

export const proc = {
  btn: "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/40 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-[0.98]",
  primary: "bg-[#C8102E] text-white hover:bg-[#a60d26]",
  dark: "bg-[#111111] text-white hover:bg-black",
  wa: "bg-[#128C4A] text-white hover:bg-[#0e7039]",
  outline: "border border-[#D9DCE1] bg-white text-[#111111] hover:bg-[#F8F9FB]",
  ghostDanger: "text-[#B91C1C] hover:bg-[#FEF2F2]",
  input:
    "h-10 w-full rounded-md border border-[#D9DCE1] bg-white px-3 text-base text-[#111111] outline-none focus-visible:border-[#C8102E] focus-visible:ring-2 focus-visible:ring-[#C8102E]/20 sm:text-[13.5px]",
  label: "mb-1 block text-[12px] font-semibold text-[#374151]",
};

export const rupiah = (n: number) => `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
export const tanggal = (iso: string | null | undefined) =>
  iso
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00+07:00` : iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })
    : "-";
export const waktu = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
