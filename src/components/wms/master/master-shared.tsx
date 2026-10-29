"use client";

import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Tipe & elemen bersama halaman Master Data (tema terang WMS: putih, teks #111, aksen merah Garage).

export type MasterArea = "bar" | "dapur" | "umum";
export type MasterCategory = { id: string; name: string; area: MasterArea; archived: boolean; productCount: number };
export type MasterSupplier = { id: string; name: string; phone: string; address: string; note: string; archived: boolean; productCount: number };

export const AREA_LABEL: Record<MasterArea, string> = { bar: "Bar", dapur: "Dapur", umum: "Umum" };
export const AREA_TONE: Record<MasterArea, string> = {
  bar: "bg-[#FDF1F3] text-[#A30D26] border-[#F5C2CB]",
  dapur: "bg-[#FFF7E6] text-[#92400E] border-[#F6D9A8]",
  umum: "bg-[#F3F4F6] text-[#374151] border-[#E5E7EB]",
};

export const ui = {
  input:
    "h-10 w-full rounded-md border border-[#D9DCE1] bg-white px-3 text-base text-[#111111] outline-none placeholder:text-[#9CA3AF] focus-visible:border-[#C8102E] focus-visible:ring-2 focus-visible:ring-[#C8102E]/20 disabled:bg-[#F3F4F6] disabled:text-[#6B7280] sm:text-[13.5px]",
  label: "mb-1 block text-[12px] font-semibold text-[#374151]",
  card: "min-w-0 rounded-xl border border-[#E8E8E8] bg-white",
  primary:
    "inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[#C8102E] px-4 text-[13px] font-bold text-white hover:bg-[#a60d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/40 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[#D9DCE1] bg-white px-3.5 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/30 disabled:opacity-50",
  iconBtn:
    "grid size-9 place-items-center rounded-md text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#111111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/30 disabled:opacity-40",
  th: "whitespace-nowrap px-3 py-2.5 text-left text-[11.5px] font-bold uppercase tracking-wide text-[#4B5563]",
  td: "px-3 py-2.5 align-middle text-[13px] text-[#111111]",
};

export function AreaBadge({ area }: { area: MasterArea }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${AREA_TONE[area]}`}>{AREA_LABEL[area]}</span>;
}

/** Field dengan label, petunjuk, dan indikator validasi (ikon + teks, bukan hanya warna). */
export function Field({
  id,
  label,
  hint,
  error,
  ok,
  required,
  children,
  className = "",
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  ok?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className={ui.label}>
        {label}
        {required && <span className="ml-0.5 text-[#C8102E]" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="mt-1 flex items-start gap-1 text-[12px] font-medium text-[#B91C1C]">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : ok ? (
        <p id={`${id}-msg`} className="mt-1 flex items-start gap-1 text-[12px] font-medium text-[#15803D]">
          <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden="true" /> {ok}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-1 text-[12px] text-[#6B7280]">{hint}</p>
      ) : null}
    </div>
  );
}

/** Konfirmasi perubahan penting (arsip, ganti HPP, rename kategori). */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="border-[#E8E8E8] bg-white text-[#111111]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[16px] font-bold text-[#111111]">{title}</AlertDialogTitle>
          {/* className di wrapper (digabung cn/tailwind-merge), bukan di anak asChild — supaya warna teks tidak kalah oleh text-muted-foreground. */}
          <AlertDialogDescription asChild className="space-y-2 text-[13.5px] leading-relaxed text-[#374151]">
            <div>{body}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className={`${ui.secondary} dark:border-[#D9DCE1] dark:bg-white dark:text-[#111111] dark:hover:bg-[#F8F9FB]`}
            disabled={busy}
          >
            Batal
          </AlertDialogCancel>
          <AlertDialogAction
            className={danger ? ui.primary : `${ui.primary} bg-[#111111] hover:bg-black`}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "Menyimpan…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-[13px] text-[#6B7280]">{children}</td>
    </tr>
  );
}

export const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
