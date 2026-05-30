"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Calendar, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function isDateInFilter(
  raw: string | number | Date | null | undefined,
  filter: DateFilterValue,
): boolean {
  if (filter.mode === "all") return true;
  const d = toDate(raw);
  if (!d) return false;

  if (filter.mode === "day" && filter.day) {
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return ymd === filter.day;
  }
  if (filter.mode === "month" && filter.month) {
    const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    return ym === filter.month;
  }
  if (filter.mode === "year" && filter.year) {
    return d.getFullYear().toString() === filter.year;
  }
  if (filter.mode === "custom") {
    const from = filter.from ? toDate(filter.from) : null;
    const to = filter.to ? toDate(filter.to) : null;
    if (from && d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) return false;
    if (to && d > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)) return false;
    return true;
  }
  return true;
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
  compact?: boolean;
};

const MODE_LABEL: Record<DateFilterMode, string> = {
  all: "Semua",
  day: "Hari",
  month: "Bulan",
  year: "Tahun",
  custom: "Rentang",
};

export function DateFilter({ value, onChange, className, compact = false }: Props) {
  const today = useMemo(() => new Date(), []);
  const todayYmd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const todayYm = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const todayY = today.getFullYear().toString();

  const setMode = (mode: DateFilterMode) => {
    if (mode === "all") return onChange({ mode: "all" });
    if (mode === "day") return onChange({ mode: "day", day: value.day ?? todayYmd });
    if (mode === "month") return onChange({ mode: "month", month: value.month ?? todayYm });
    if (mode === "year") return onChange({ mode: "year", year: value.year ?? todayY });
    if (mode === "custom") return onChange({ mode: "custom", from: value.from, to: value.to });
  };

  const isActive = value.mode !== "all";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs",
        compact ? "" : "",
        className,
      )}
    >
      <Calendar className="size-3.5 text-white/60 shrink-0" />
      <div className="flex flex-wrap gap-1">
        {(Object.keys(MODE_LABEL) as DateFilterMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              value.mode === m
                ? "bg-red-500/20 text-red-200 ring-1 ring-red-400/40"
                : "text-white/60 hover:bg-white/5 hover:text-white",
            )}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {value.mode === "day" && (
        <Input
          type="date"
          value={value.day ?? ""}
          onChange={(e) => onChange({ mode: "day", day: e.target.value })}
          className="h-7 w-[140px] bg-black/40 text-xs"
        />
      )}
      {value.mode === "month" && (
        <Input
          type="month"
          value={value.month ?? ""}
          onChange={(e) => onChange({ mode: "month", month: e.target.value })}
          className="h-7 w-[130px] bg-black/40 text-xs"
        />
      )}
      {value.mode === "year" && (
        <Input
          type="number"
          min={2000}
          max={2100}
          value={value.year ?? ""}
          onChange={(e) => onChange({ mode: "year", year: e.target.value })}
          className="h-7 w-[90px] bg-black/40 text-xs"
        />
      )}
      {value.mode === "custom" && (
        <>
          <Input
            type="date"
            value={value.from ?? ""}
            onChange={(e) => onChange({ ...value, mode: "custom", from: e.target.value })}
            className="h-7 w-[140px] bg-black/40 text-xs"
          />
          <span className="text-white/40">–</span>
          <Input
            type="date"
            value={value.to ?? ""}
            onChange={(e) => onChange({ ...value, mode: "custom", to: e.target.value })}
            className="h-7 w-[140px] bg-black/40 text-xs"
          />
        </>
      )}

      {isActive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(DATE_FILTER_DEFAULT)}
          className="ml-auto h-6 gap-1 px-2 text-[11px] text-white/60 hover:text-white"
        >
          <X className="size-3" /> Reset
        </Button>
      )}
    </div>
  );
}
