// Periode laporan (kalender WIB) untuk Pusat Laporan: preset, navigasi
// sebelumnya/berikutnya, dan label. Murni (tanpa DOM) supaya bisa diuji unit.
import { daysBetween, isCalendarDateKey, todayWibKey } from "@/lib/date-range";

export type PeriodPreset = "today" | "yesterday" | "7d" | "this_week" | "this_month" | "last_month" | "this_year" | "custom";
export type PeriodUnit = "day" | "week" | "month" | "year" | "range";
export type ReportPeriod = { from: string; to: string; unit: PeriodUnit };

export const PERIOD_PRESETS: Array<{ id: PeriodPreset; label: string }> = [
  { id: "today", label: "Hari ini" },
  { id: "yesterday", label: "Kemarin" },
  { id: "7d", label: "7 hari" },
  { id: "this_week", label: "Minggu ini" },
  { id: "this_month", label: "Bulan ini" },
  { id: "last_month", label: "Bulan lalu" },
  { id: "this_year", label: "Tahun ini" },
  { id: "custom", label: "Pilih tanggal" },
];

function toKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
function fromKey(key: string) {
  return new Date(`${key}T00:00:00Z`);
}
export function addDaysKey(key: string, days: number) {
  return toKey(new Date(fromKey(key).getTime() + days * 86_400_000));
}
function monthEnd(year: number, month0: number) {
  return toKey(new Date(Date.UTC(year, month0 + 1, 0)));
}
function monthStart(year: number, month0: number) {
  return toKey(new Date(Date.UTC(year, month0, 1)));
}
function mondayOf(key: string) {
  const date = fromKey(key);
  return addDaysKey(key, -((date.getUTCDay() + 6) % 7));
}

/** Rentang untuk preset; bulan/tahun berjalan dihitung penuh (nama file YYYY-MM / YYYY). */
export function presetPeriod(preset: PeriodPreset, today = todayWibKey()): ReportPeriod {
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "today":
      return { from: today, to: today, unit: "day" };
    case "yesterday": {
      const key = addDaysKey(today, -1);
      return { from: key, to: key, unit: "day" };
    }
    case "7d":
      return { from: addDaysKey(today, -6), to: today, unit: "range" };
    case "this_week": {
      const monday = mondayOf(today);
      return { from: monday, to: addDaysKey(monday, 6), unit: "week" };
    }
    case "this_month":
      return { from: monthStart(y, m - 1), to: monthEnd(y, m - 1), unit: "month" };
    case "last_month":
      return { from: monthStart(y, m - 2), to: monthEnd(y, m - 2), unit: "month" };
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31`, unit: "year" };
    case "custom":
    default:
      return { from: today, to: today, unit: "range" };
  }
}

/** Geser periode ke sebelumnya (-1) / berikutnya (+1) dengan satuan yang sama. */
export function shiftPeriod(period: ReportPeriod, direction: -1 | 1): ReportPeriod {
  const { from, to, unit } = period;
  if (unit === "day") {
    const key = addDaysKey(from, direction);
    return { from: key, to: key, unit };
  }
  if (unit === "week") {
    return { from: addDaysKey(from, 7 * direction), to: addDaysKey(to, 7 * direction), unit };
  }
  if (unit === "month") {
    const [y, m] = from.split("-").map(Number);
    const month0 = m - 1 + direction;
    return { from: monthStart(y, month0), to: monthEnd(y, month0), unit };
  }
  if (unit === "year") {
    const y = Number(from.slice(0, 4)) + direction;
    return { from: `${y}-01-01`, to: `${y}-12-31`, unit };
  }
  const length = daysBetween(from, to) + 1;
  return { from: addDaysKey(from, length * direction), to: addDaysKey(to, length * direction), unit };
}

/** Periode berikutnya dimulai setelah hari ini → tombol "berikutnya" dinonaktifkan. */
export function canShiftForward(period: ReportPeriod, today = todayWibKey()) {
  return shiftPeriod(period, 1).from <= today;
}

/** Validasi input kustom; null = valid. */
export function periodError(from: string, to: string, options: { maxDays?: number; today?: string } = {}) {
  const today = options.today ?? todayWibKey();
  const maxDays = options.maxDays ?? 366;
  if (!isCalendarDateKey(from) || !isCalendarDateKey(to)) return "Isi tanggal mulai dan akhir yang valid.";
  if (from > to) return "Tanggal mulai harus sebelum atau sama dengan tanggal akhir.";
  if (from > today) return "Tanggal mulai tidak boleh di masa depan.";
  if (daysBetween(from, to) + 1 > maxDays) return `Rentang maksimal ${maxDays} hari.`;
  return null;
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function shortDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${SHORT[m - 1]} ${y}`;
}

export function periodLabel(period: ReportPeriod) {
  const { from, to, unit } = period;
  if (unit === "month") {
    const [y, m] = from.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  if (unit === "year") return `Tahun ${from.slice(0, 4)}`;
  if (from === to) return shortDate(from);
  return `${shortDate(from)} – ${shortDate(to)}`;
}
