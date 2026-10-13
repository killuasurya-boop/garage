"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isCalendarDateKey, todayWibKey } from "@/lib/date-range";
import { addDaysKey } from "@/lib/report-periods";
import { cn } from "@/lib/utils";

export type DateFilterMode = "all" | "day" | "month" | "year" | "custom";

export type DateFilterValue = {
  mode: DateFilterMode;
  day?: string;
  month?: string;
  year?: string;
  from?: string;
  to?: string;
};

export const DATE_FILTER_DEFAULT: DateFilterValue = { mode: "all" };

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Tanggal kalender WIB (YYYY-MM-DD) — data operasional selalu di Asia/Jakarta. */
function wibKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}

function lastDayOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Rentang tanggal (WIB, inklusif) dari filter; null = semua / belum lengkap /
 * tidak valid. Dipakai juga untuk meneruskan filter ke API (dateFrom/dateTo)
 * supaya daftar berhalaman tidak difilter ulang hanya pada halaman aktif.
 */
export function filterRange(filter: DateFilterValue): { from: string; to: string } | null {
  if (filter.mode === "day" && isCalendarDateKey(filter.day)) return { from: filter.day, to: filter.day };
  if (filter.mode === "month" && filter.month && /^\d{4}-\d{2}$/.test(filter.month)) {
    return { from: `${filter.month}-01`, to: `${filter.month}-${String(lastDayOfMonth(filter.month)).padStart(2, "0")}` };
  }
  if (filter.mode === "year" && filter.year && /^\d{4}$/.test(filter.year)) {
    return { from: `${filter.year}-01-01`, to: `${filter.year}-12-31` };
  }
  if (filter.mode === "custom") {
    const from = isCalendarDateKey(filter.from) ? filter.from : null;
    const to = isCalendarDateKey(filter.to) ? filter.to : null;
    if (!from && !to) return null;
    if (from && to && from > to) return null;
    return { from: from ?? "0000-01-01", to: to ?? "9999-12-31" };
  }
  return null;
}

/** Pesan kesalahan filter (rentang terbalik / tahun tidak valid), null = OK. */
export function filterError(filter: DateFilterValue): string | null {
  if (filter.mode === "custom" && isCalendarDateKey(filter.from) && isCalendarDateKey(filter.to) && filter.from > filter.to) {
    return "Tanggal mulai harus sebelum tanggal akhir.";
  }
  if (filter.mode === "year" && filter.year && !/^(19|20)\d{2}$/.test(filter.year)) return "Tahun tidak valid.";
  return null;
}

export function isDateInFilter(
  raw: string | number | Date | null | undefined,
  filter: DateFilterValue,
): boolean {
  if (filter.mode === "all") return true;
  const range = filterRange(filter);
  // Filter belum lengkap/tidak valid → tidak menyembunyikan data diam-diam.
  if (!range) return true;
  const d = toDate(raw);
  if (!d) return false;
  const key = wibKey(d);
  return key >= range.from && key <= range.to;
}

function shiftFilter(value: DateFilterValue, direction: -1 | 1): DateFilterValue {
  if (value.mode === "day" && isCalendarDateKey(value.day)) {
    return { mode: "day", day: addDaysKey(value.day, direction) };
  }
  if (value.mode === "month" && value.month && /^\d{4}-\d{2}$/.test(value.month)) {
    const [y, m] = value.month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + direction, 1));
    return { mode: "month", month: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}` };
  }
  if (value.mode === "year" && value.year && /^\d{4}$/.test(value.year)) {
    return { mode: "year", year: String(Number(value.year) + direction) };
  }
  return value;
}

type DateFilterContextValue = {
  filter: DateFilterValue;
  setFilter: (next: DateFilterValue) => void;
  predicate: (raw: string | number | Date | null | undefined) => boolean;
};

const DateFilterContext = createContext<DateFilterContextValue | null>(null);

export function DateFilterProvider({
  children,
  initial = DATE_FILTER_DEFAULT,
}: {
  children: ReactNode;
  initial?: DateFilterValue;
}) {
  const [filter, setFilter] = useState<DateFilterValue>(initial);
  const predicate = useCallback(
    (raw: string | number | Date | null | undefined) => isDateInFilter(raw, filter),
    [filter],
  );
  const value = useMemo(
    () => ({ filter, setFilter, predicate }),
    [filter, predicate],
  );
  return <DateFilterContext.Provider value={value}>{children}</DateFilterContext.Provider>;
}

export function useDateFilterContext(): DateFilterContextValue {
  const ctx = useContext(DateFilterContext);
  if (!ctx) {
    return {
      filter: DATE_FILTER_DEFAULT,
      setFilter: () => undefined,
      predicate: () => true,
    };
  }
  return ctx;
}

export function DateFilterBar({ className }: { className?: string }) {
  const { filter, setFilter } = useDateFilterContext();
  return <DateFilter value={filter} onChange={setFilter} className={className} />;
}

export function useDateFilter(initial: DateFilterValue = DATE_FILTER_DEFAULT) {
  const [filter, setFilter] = useState<DateFilterValue>(initial);
  const reset = useCallback(() => setFilter(DATE_FILTER_DEFAULT), []);
  const predicate = useCallback(
    (raw: string | number | Date | null | undefined) => isDateInFilter(raw, filter),
    [filter],
  );
  return { filter, setFilter, reset, predicate };
}

type Props = {
  value: DateFilterValue;
  onChange: (next: DateFilterValue) => void;
  className?: string;
};

const MODE_LABEL: Record<DateFilterMode, string> = {
  all: "Semua",
  day: "Hari",
  month: "Bulan",
  year: "Tahun",
  custom: "Rentang",
};

export function DateFilter({ value, onChange, className }: Props) {
  const todayYmd = todayWibKey();
  const todayYm = todayYmd.slice(0, 7);
  const todayY = todayYmd.slice(0, 4);

  const setMode = (mode: DateFilterMode) => {
    if (mode === "all") return onChange({ mode: "all" });
    if (mode === "day") return onChange({ mode: "day", day: value.day ?? todayYmd });
    if (mode === "month") return onChange({ mode: "month", month: value.month ?? todayYm });
    if (mode === "year") return onChange({ mode: "year", year: value.year ?? todayY });
    if (mode === "custom") return onChange({ mode: "custom", from: value.from ?? todayYm + "-01", to: value.to ?? todayYmd });
  };

  const isActive = value.mode !== "all";
  const canStep = value.mode === "day" || value.mode === "month" || value.mode === "year";
  const next = canStep ? shiftFilter(value, 1) : value;
  const nextStart = filterRange(next)?.from;
  const error = filterError(value);
  const inputClass = "h-9 bg-black/40 text-sm [color-scheme:dark]";
  const stepClass =
    "grid size-8 shrink-0 place-items-center rounded-md border border-white/15 text-white/80 hover:bg-white/10 disabled:opacity-35";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-white/12 bg-black/30 px-2.5 py-2 text-sm",
        className,
      )}
      role="group"
      aria-label="Filter tanggal"
    >
      <Calendar className="size-4 shrink-0 text-[#f5a742]" aria-hidden />
      <div className="flex flex-wrap gap-1">
        {(Object.keys(MODE_LABEL) as DateFilterMode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={value.mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "min-h-8 rounded px-2.5 text-xs font-semibold transition-colors",
              value.mode === m
                ? "bg-red-500/25 text-red-100 ring-1 ring-red-400/50"
                : "text-white/75 hover:bg-white/10 hover:text-white",
            )}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {canStep ? (
        <button type="button" aria-label="Sebelumnya" className={stepClass} onClick={() => onChange(shiftFilter(value, -1))}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      ) : null}
      {value.mode === "day" && (
        <Input
          type="date"
          aria-label="Tanggal"
          value={value.day ?? ""}
          max={todayYmd}
          onChange={(e) => onChange({ mode: "day", day: e.target.value })}
          className={cn(inputClass, "w-[150px]")}
        />
      )}
      {value.mode === "month" && (
        <Input
          type="month"
          aria-label="Bulan"
          value={value.month ?? ""}
          max={todayYm}
          onChange={(e) => onChange({ mode: "month", month: e.target.value })}
          className={cn(inputClass, "w-[150px]")}
        />
      )}
      {value.mode === "year" && (
        <Input
          type="number"
          aria-label="Tahun"
          inputMode="numeric"
          min={2020}
          max={Number(todayY)}
          value={value.year ?? ""}
          onChange={(e) => onChange({ mode: "year", year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          className={cn(inputClass, "w-[92px]")}
        />
      )}
      {canStep ? (
        <button
          type="button"
          aria-label="Berikutnya"
          className={stepClass}
          disabled={!nextStart || nextStart > todayYmd}
          onClick={() => onChange(next)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      ) : null}
      {value.mode === "custom" && (
        <>
          <Input
            type="date"
            aria-label="Dari tanggal"
            value={value.from ?? ""}
            max={value.to || todayYmd}
            onChange={(e) => onChange({ ...value, mode: "custom", from: e.target.value })}
            className={cn(inputClass, "w-[150px]")}
          />
          <span className="text-white/60">–</span>
          <Input
            type="date"
            aria-label="Sampai tanggal"
            value={value.to ?? ""}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, mode: "custom", to: e.target.value })}
            className={cn(inputClass, "w-[150px]")}
          />
        </>
      )}
      {value.mode !== "all" && value.mode !== "custom" ? (
        <button
          type="button"
          className="min-h-8 rounded px-2 text-xs font-semibold text-[#ffd79a] hover:bg-white/10"
          onClick={() => setModeToday(value.mode, onChange, { todayYmd, todayYm, todayY })}
        >
          Sekarang
        </button>
      ) : null}

      {error ? (
        <span className="text-xs font-medium text-[#ffc2c8]" role="alert">
          {error}
        </span>
      ) : null}

      {isActive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(DATE_FILTER_DEFAULT)}
          className="ml-auto h-8 gap-1 px-2 text-xs text-white/75 hover:text-white"
        >
          <X className="size-3.5" /> Reset
        </Button>
      )}
    </div>
  );
}

function setModeToday(
  mode: DateFilterMode,
  onChange: (next: DateFilterValue) => void,
  today: { todayYmd: string; todayYm: string; todayY: string },
) {
  if (mode === "day") onChange({ mode: "day", day: today.todayYmd });
  else if (mode === "month") onChange({ mode: "month", month: today.todayYm });
  else if (mode === "year") onChange({ mode: "year", year: today.todayY });
}

/**
 * Gabungkan filter tanggal lokal (input dari/sampai di daftar) dengan filter
 * global modul → parameter API dateFrom/dateTo (irisan kedua rentang).
 */
export function mergeDateParams(local: { from?: string; to?: string }, global: DateFilterValue) {
  const range = filterRange(global);
  const pick = (a: string | undefined, b: string | undefined, take: "max" | "min") => {
    const values = [a, b].filter((v): v is string => isCalendarDateKey(v));
    if (!values.length) return "";
    return values.reduce((x, y) => (take === "max" ? (y > x ? y : x) : y < x ? y : x));
  };
  return {
    dateFrom: pick(local.from, range && range.from !== "0000-01-01" ? range.from : undefined, "max"),
    dateTo: pick(local.to, range && range.to !== "9999-12-31" ? range.to : undefined, "min"),
  };
}
