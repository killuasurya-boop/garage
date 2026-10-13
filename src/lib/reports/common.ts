// Helper bersama builder laporan per modul (src/lib/reports/*).
import { purchaseAreaOf, type PurchaseArea } from "@/lib/finance-purchases";

export type ReportRange = { from: string; to: string };

/** Divisi laporan: Bar, Kitchen (= area "dapur" di gudang), atau semua. */
export const REPORT_DIVISIONS = ["semua", "bar", "kitchen"] as const;
export type ReportDivision = (typeof REPORT_DIVISIONS)[number];

export const DIVISION_LABEL: Record<ReportDivision, string> = {
  semua: "Semua divisi",
  bar: "Divisi Bar",
  kitchen: "Divisi Kitchen",
};

/** Nama divisi untuk nama file (null = tanpa divisi). */
export function divisionFileTag(division: ReportDivision) {
  return division === "semua" ? null : division.toUpperCase();
}

/** Area gudang (bar|dapur|umum) cocok dengan divisi yang diminta? */
export function areaMatchesDivision(area: string | null | undefined, division: ReportDivision) {
  if (division === "semua") return true;
  const normalized: PurchaseArea = purchaseAreaOf(area);
  return division === "bar" ? normalized === "bar" : normalized === "dapur";
}

export function areaLabel(area: string | null | undefined) {
  const normalized = purchaseAreaOf(area);
  return normalized === "bar" ? "Bar" : normalized === "dapur" ? "Kitchen" : "Umum";
}

/** Awal hari WIB (inklusif) & awal hari setelah `to` (eksklusif). */
export function rangeBounds(range: ReportRange) {
  const start = new Date(`${range.from}T00:00:00+07:00`);
  const end = new Date(new Date(`${range.to}T00:00:00+07:00`).getTime() + 24 * 60 * 60_000);
  return { start, end };
}

export function wibKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}

export function wibTime(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(date);
}

/** Bulatkan angka kuantitas (numeric 4 desimal) agar total tidak bergeser float. */
export function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
