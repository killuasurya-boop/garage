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

// ─── Validasi perubahan pengaturan (B1b) ─────────────────────────────────────
// Snapshot laba-rugi harian & closing disimpan per tanggal. Agar angka lama tidak
// tercampur dua aturan: tanggal efektif minimal HARI INI (kalender WIB) dan, begitu
// berlaku, jam cut-off & tanggal efektif tidak bisa diubah/dihapus lagi.

export class BusinessDaySettingError extends Error {
  constructor(
    readonly code: "BUSINESS_DAY_OWNER_ONLY" | "BUSINESS_DAY_GLOBAL_ONLY" | "BUSINESS_DAY_INVALID" | "BUSINESS_DAY_LOCKED",
    message: string,
  ) {
    super(message);
    this.name = "BusinessDaySettingError";
  }
}

type BusinessDaySettingValues = { businessDayCutoffHour?: unknown; businessDayEffectiveDate?: unknown };

export function touchesBusinessDaySettings(patch: object) {
  return "businessDayCutoffHour" in patch || "businessDayEffectiveDate" in patch;
}

export function assertBusinessDaySettingsChange(input: {
  before: { businessDayCutoffHour: number; businessDayEffectiveDate: string };
  patch: BusinessDaySettingValues;
  outletId: string | null;
  isOwner: boolean;
  now?: Date;
}) {
  const { before, patch } = input;
  if (!touchesBusinessDaySettings(patch)) return;
  const nextHour = "businessDayCutoffHour" in patch ? Number(patch.businessDayCutoffHour) : before.businessDayCutoffHour;
  const rawDate = "businessDayEffectiveDate" in patch ? patch.businessDayEffectiveDate : before.businessDayEffectiveDate;
  const nextDate = typeof rawDate === "string" ? rawDate.trim() : "";
  // Form pengaturan mengirim semua field satu tab: nilai yang tidak berubah selalu lolos.
  if (nextHour === before.businessDayCutoffHour && nextDate === (before.businessDayEffectiveDate ?? "").trim()) return;
  if (!input.isOwner) {
    throw new BusinessDaySettingError("BUSINESS_DAY_OWNER_ONLY", "Hanya Owner yang boleh mengubah tanggal operasional.");
  }
  if (input.outletId) {
    throw new BusinessDaySettingError("BUSINESS_DAY_GLOBAL_ONLY", "Tanggal operasional hanya bisa diatur global (semua outlet).");
  }
  const today = calendarKey(input.now ?? new Date());
  const current = normalizeBusinessDayPolicy({
    cutoffHour: before.businessDayCutoffHour,
    effectiveFrom: before.businessDayEffectiveDate,
  });
  if (current.effectiveFrom && current.effectiveFrom <= today) {
    throw new BusinessDaySettingError(
      "BUSINESS_DAY_LOCKED",
      `Tanggal operasional sudah berlaku sejak ${current.effectiveFrom}; jam cut-off & tanggal efektif tidak bisa diubah lagi.`,
    );
  }
  if (!Number.isInteger(nextHour) || nextHour < 1 || nextHour > 12) {
    throw new BusinessDaySettingError("BUSINESS_DAY_INVALID", "Jam cut-off harus jam bulat 1–12 (WIB).");
  }
  if (nextDate === "") return;
  if (!isCalendarDateKey(nextDate)) {
    throw new BusinessDaySettingError("BUSINESS_DAY_INVALID", "Tanggal efektif harus format YYYY-MM-DD.");
  }
  if (nextDate < today) {
    throw new BusinessDaySettingError(
      "BUSINESS_DAY_INVALID",
      "Tanggal efektif tidak boleh di masa lalu — laporan & closing hari yang sudah lewat tidak diubah.",
    );
  }
}
