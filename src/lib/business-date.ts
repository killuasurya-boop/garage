// Tanggal operasional (business date) — PRD V4.0 §03.4, §16.2, AC-F27.
// Keputusan Owner (Okt 2026): hari operasional berakhir 04:00 WIB, berlaku mulai
// tanggal efektif (laporan sebelum tanggal itu tidak berubah). Selama tanggal
// efektif kosong/tidak valid → kalender WIB (perilaku lama, 00:00).
//
// Aturan (E = tanggal efektif, C = jam cut-off):
//   tanggal(at) = geser(at, −C) bila ≥ E, selain itu tanggal kalender.
//   awal hari d = d @ C:00 bila d > E, selain itu d @ 00:00.
// Hari E menjadi hari transisi (E 00:00 → E+1 C:00): tidak ada jam yang hilang
// atau terhitung dua kali.
import { isCalendarDateKey } from "@/lib/date-range";

export type BusinessDayPolicy = { cutoffHour: number; effectiveFrom: string | null };

export const CALENDAR_POLICY: BusinessDayPolicy = { cutoffHour: 0, effectiveFrom: null };

const WIB_OFFSET_MS = 7 * 60 * 60_000;
const DAY_MS = 86_400_000;

function calendarKey(at: Date) {
  return new Date(at.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Normalisasi nilai pengaturan; nilai tidak valid → kebijakan kalender (aman). */
export function normalizeBusinessDayPolicy(input: { cutoffHour?: unknown; effectiveFrom?: unknown }): BusinessDayPolicy {
  const hour = Number(input.cutoffHour);
  const effective = typeof input.effectiveFrom === "string" ? input.effectiveFrom.trim() : "";
  if (!Number.isInteger(hour) || hour <= 0 || hour > 12 || !isCalendarDateKey(effective)) return CALENDAR_POLICY;
  return { cutoffHour: hour, effectiveFrom: effective };
}

export function businessDateKey(at: Date, policy: BusinessDayPolicy = CALENDAR_POLICY) {
  const calendar = calendarKey(at);
  if (!policy.effectiveFrom || policy.cutoffHour <= 0) return calendar;
  const shifted = calendarKey(new Date(at.getTime() - policy.cutoffHour * 60 * 60_000));
  return shifted >= policy.effectiveFrom ? shifted : calendar;
}

/** Awal hari operasional `dateKey` (inklusif). */
export function businessDayStart(dateKey: string, policy: BusinessDayPolicy = CALENDAR_POLICY) {
  const midnight = Date.parse(`${dateKey}T00:00:00Z`) - WIB_OFFSET_MS;
  const useCutoff = Boolean(policy.effectiveFrom) && policy.cutoffHour > 0 && dateKey > (policy.effectiveFrom as string);
  return new Date(midnight + (useCutoff ? policy.cutoffHour * 60 * 60_000 : 0));
}

function nextKey(dateKey: string) {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

/** Rentang [awal `from`, awal hari setelah `to`) untuk filter laporan. */
export function businessDayRange(from: string, to: string, policy: BusinessDayPolicy = CALENDAR_POLICY) {
  return { start: businessDayStart(from, policy), end: businessDayStart(nextKey(to), policy) };
}

/** Tanggal operasional "hari ini". */
export function todayBusinessDateKey(policy: BusinessDayPolicy = CALENDAR_POLICY, now = new Date()) {
  return businessDateKey(now, policy);
}
