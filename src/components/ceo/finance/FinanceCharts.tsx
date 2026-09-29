"use client";

import { useReducedMotion } from "framer-motion";
import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { FinanceControlDashboard } from "@/lib/finance-control";
import { SafeResponsiveContainer } from "../charts/SafeResponsiveContainer";
import { axisShort, percent, rupiah } from "./finance-format";

const COLOR = {
  revenue: "var(--garage-red-bright)",
  bep: "var(--garage-amber)",
  target: "var(--garage-silver)",
  gross: "var(--garage-silver)",
  net: "var(--garage-red-bright)",
  prev: "#8a8a94",
  cashIn: "#c9c9cf",
  cashOut: "var(--garage-red)",
  netCash: "var(--garage-amber)",
};

const PALETTE = [
  "var(--garage-red-bright)",
  "var(--garage-amber)",
  "#d4d4d8",
  "#b3261e",
  "#f2b872",
  "#8a8a94",
  "#6b1414",
  "#5c5c66",
];

const axisTick = { fill: "#b4b4bd", fontSize: 12 };
const grid = "rgba(255,255,255,0.07)";

function useChartMotion() {
  const reduce = useReducedMotion();
  return { isAnimationActive: !reduce, animationDuration: 800, animationEasing: "ease-out" as const };
}

type TooltipRow = { name: string; value: number | null | undefined; color: string; kind?: "money" | "pct" };

function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-[180px] rounded-xl border border-white/12 bg-[var(--garage-bg-1)] p-3 shadow-xl">
      <p className="font-mono text-[11px] font-bold uppercase text-zinc-300">{title}</p>
      {rows.map((row) => (
        <div key={row.name} className="mt-1.5 flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-2 text-zinc-300">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: row.color }} />
            {row.name}
          </span>
          <span className="font-mono font-bold tabular-nums text-zinc-50">
            {row.kind === "pct" ? percent(row.value ?? null) : rupiah(row.value ?? null)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Toggle({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold uppercase transition-colors active:scale-[0.98] ${
        active ? "border-white/25 bg-white/12 text-zinc-50" : "border-white/10 bg-transparent text-zinc-400 hover:text-zinc-200"
      }`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: active ? color : "#55555d" }} />
      {children}
    </button>
  );
}

function ChartFrame({ children, height = 300 }: { children: React.ReactElement<Record<string, unknown>>; height?: number }) {
  // Mobile: grafik boleh di-scroll horizontal agar label tidak berdesakan (PRD §34).
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="min-w-[520px]" style={{ height }}>
        <SafeResponsiveContainer>{children}</SafeResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Revenue vs BEP (PRD §20, §23) ──────────────────────────────────────────

export function RevenueBepChart({ data }: { data: FinanceControlDashboard }) {
  const motion = useChartMotion();
  const [show, setShow] = useState({ revenue: true, bep: true, target: true });
  const hasTarget = data.trend.some((point) => point.target !== null);
  const hourly = data.hourly;
  const toggles = (
    <div className="flex flex-wrap gap-2">
      <Toggle active={show.revenue} color={COLOR.revenue} onClick={() => setShow((s) => ({ ...s, revenue: !s.revenue }))}>
        Revenue
      </Toggle>
      <Toggle active={show.bep} color={COLOR.bep} onClick={() => setShow((s) => ({ ...s, bep: !s.bep }))}>
        BEP
      </Toggle>
      {hasTarget && !hourly ? (
        <Toggle active={show.target} color={COLOR.target} onClick={() => setShow((s) => ({ ...s, target: !s.target }))}>
          Target
        </Toggle>
      ) : null}
    </div>
  );

  if (hourly) {
    const bepValue = hourly[0]?.bep ?? null;
    return (
      <div className="space-y-3">
        {toggles}
        <p className="text-xs text-zinc-400">Omzet kumulatif per jam dibanding BEP harian.</p>
        <ChartFrame key={`h-${data.period.key}-${data.period.toKey}`}>
          <ComposedChart data={hourly} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="fcRevFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--garage-red-bright)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--garage-red-bright)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="hour" tick={axisTick} axisLine={false} tickLine={false} interval={2} />
            {/* Skala Y selalu memuat garis BEP agar target terlihat walau omzet masih kecil. */}
            <YAxis
              tickFormatter={axisShort}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={52}
              domain={[0, (dataMax: number) => Math.max(dataMax, show.bep && bepValue ? bepValue * 1.1 : 0)]}
            />
            <Tooltip
              animationDuration={180}
              cursor={{ stroke: "rgba(255,255,255,0.15)", strokeDasharray: "4 4" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as NonNullable<typeof hourly>[number];
                return (
                  <TooltipBox
                    title={`Pukul ${label}`}
                    rows={[
                      { name: "Omzet jam ini", value: point.revenue, color: COLOR.revenue },
                      { name: "Omzet kumulatif", value: point.cumulative, color: COLOR.revenue },
                      { name: "BEP harian", value: point.bep, color: COLOR.bep },
                      ...(point.bep && point.cumulative !== null
                        ? [{ name: "Achievement", value: (point.cumulative / point.bep) * 100, color: COLOR.bep, kind: "pct" as const }]
                        : []),
                    ]}
                  />
                );
              }}
            />
            {show.bep && bepValue ? (
              <ReferenceLine y={bepValue} stroke={COLOR.bep} strokeDasharray="6 4" strokeWidth={2} label={{ value: "BEP", fill: "#ffd8a8", fontSize: 12, position: "insideTopRight" }} />
            ) : null}
            {show.revenue ? (
              <Line type="monotone" dataKey="cumulative" name="Omzet kumulatif" stroke={COLOR.revenue} strokeWidth={2.6} dot={false} connectNulls={false} {...motion} />
            ) : null}
          </ComposedChart>
        </ChartFrame>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toggles}
      <ChartFrame key={`d-${data.period.key}-${data.period.fromKey}`}>
        <ComposedChart data={data.trend} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis tickFormatter={axisShort} tick={axisTick} axisLine={false} tickLine={false} width={52} />
          <Tooltip
            animationDuration={180}
            cursor={{ stroke: "rgba(255,255,255,0.15)", strokeDasharray: "4 4" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as FinanceControlDashboard["trend"][number];
              return (
                <TooltipBox
                  title={point.label}
                  rows={[
                    { name: "Revenue", value: point.revenue, color: COLOR.revenue },
                    { name: "BEP", value: point.bep, color: COLOR.bep },
                    ...(point.bep ? [{ name: "Achievement", value: (point.revenue / point.bep) * 100, color: COLOR.bep, kind: "pct" as const }] : []),
                    ...(point.target ? [{ name: "Target", value: point.target, color: COLOR.target }] : []),
                    { name: "Net profit", value: point.netProfit, color: COLOR.net },
                  ]}
                />
              );
            }}
          />
          {show.bep ? (
            <Line type="stepAfter" dataKey="bep" name="BEP" stroke={COLOR.bep} strokeWidth={2} strokeDasharray="6 4" dot={false} {...motion} />
          ) : null}
          {show.target && hasTarget ? (
            <Line type="monotone" dataKey="target" name="Target" stroke={COLOR.target} strokeWidth={1.6} strokeDasharray="2 4" dot={false} {...motion} />
          ) : null}
          {show.revenue ? (
            <Line
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke={COLOR.revenue}
              strokeWidth={2.6}
              dot={{ r: 3, fill: COLOR.revenue, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              {...motion}
            />
          ) : null}
        </ComposedChart>
      </ChartFrame>
    </div>
  );
}

// ─── Profit trend (PRD §24) ─────────────────────────────────────────────────

export function ProfitTrendChart({ data }: { data: FinanceControlDashboard }) {
  const motion = useChartMotion();
  const [compare, setCompare] = useState(true);
  const hasPrev = data.trend.some((point) => point.prevNetProfit !== null);
  return (
    <div className="space-y-3">
      {hasPrev ? (
        <Toggle active={compare} color={COLOR.prev} onClick={() => setCompare((c) => !c)}>
          Bandingkan periode lalu
        </Toggle>
      ) : null}
      <ChartFrame key={`p-${data.period.key}-${data.period.fromKey}`} height={270}>
        <LineChart data={data.trend} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis tickFormatter={axisShort} tick={axisTick} axisLine={false} tickLine={false} width={52} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
          <Tooltip
            animationDuration={180}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as FinanceControlDashboard["trend"][number];
              return (
                <TooltipBox
                  title={point.label}
                  rows={[
                    { name: "Revenue", value: point.revenue, color: COLOR.revenue },
                    { name: "HPP", value: point.cogs, color: COLOR.bep },
                    { name: "Gross profit", value: point.grossProfit, color: COLOR.gross },
                    { name: "Net profit", value: point.netProfit, color: COLOR.net },
                    ...(compare && point.prevNetProfit !== null
                      ? [{ name: "Net profit periode lalu", value: point.prevNetProfit, color: COLOR.prev }]
                      : []),
                  ]}
                />
              );
            }}
          />
          <Line type="monotone" dataKey="grossProfit" name="Gross profit" stroke={COLOR.gross} strokeWidth={2} dot={false} {...motion} />
          <Line type="monotone" dataKey="netProfit" name="Net profit" stroke={COLOR.net} strokeWidth={2.6} dot={false} {...motion} />
          {compare && hasPrev ? (
            <Line type="monotone" dataKey="prevNetProfit" name="Net profit periode lalu" stroke={COLOR.prev} strokeWidth={1.6} strokeDasharray="5 4" dot={false} {...motion} />
          ) : null}
        </LineChart>
      </ChartFrame>
      <Legend items={[["Gross profit", COLOR.gross], ["Net profit", COLOR.net], ...(compare && hasPrev ? [["Periode lalu", COLOR.prev] as [string, string]] : [])]} />
    </div>
  );
}

// ─── Cashflow (PRD §29) ─────────────────────────────────────────────────────

export function CashflowChart({ data }: { data: FinanceControlDashboard }) {
  const motion = useChartMotion();
  return (
    <div className="space-y-3">
      <ChartFrame key={`c-${data.period.key}-${data.period.fromKey}`} height={250}>
        <ComposedChart data={data.trend} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis tickFormatter={axisShort} tick={axisTick} axisLine={false} tickLine={false} width={52} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
          <Tooltip
            animationDuration={180}
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as FinanceControlDashboard["trend"][number];
              return (
                <TooltipBox
                  title={point.label}
                  rows={[
                    { name: "Cash in operasional", value: point.cashIn, color: COLOR.cashIn },
                    { name: "Cash out", value: point.cashOut, color: COLOR.cashOut },
                    { name: "Net cash operasional", value: point.netCash, color: COLOR.netCash },
                    ...(point.capitalIn ? [{ name: "Setoran modal (terpisah)", value: point.capitalIn, color: COLOR.bep }] : []),
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="cashIn" name="Cash in" fill={COLOR.cashIn} radius={[4, 4, 0, 0]} maxBarSize={22} {...motion} />
          <Bar dataKey="cashOut" name="Cash out" fill={COLOR.cashOut} radius={[4, 4, 0, 0]} maxBarSize={22} {...motion} />
          <Line type="monotone" dataKey="netCash" name="Net cash" stroke={COLOR.netCash} strokeWidth={2.2} dot={false} {...motion} />
        </ComposedChart>
      </ChartFrame>
      <Legend items={[["Cash in operasional", COLOR.cashIn], ["Cash out", COLOR.cashOut], ["Net cash", COLOR.netCash]]} />
    </div>
  );
}

// ─── Expense bar + donut (PRD §25–§26) ─────────────────────────────────────

export function ExpenseBars({ data }: { data: FinanceControlDashboard }) {
  const motion = useChartMotion();
  const lines = data.expenses.lines.slice(0, 8);
  const height = Math.max(160, lines.length * 38);
  return (
    <div style={{ height }}>
      <SafeResponsiveContainer>
        <BarChart data={lines} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ ...axisTick, fill: "#e4e4e7" }} axisLine={false} tickLine={false} width={120} />
          <Tooltip
            animationDuration={180}
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as { name: string; amount: number };
              return (
                <TooltipBox
                  title={row.name}
                  rows={[
                    { name: "Biaya", value: row.amount, color: COLOR.revenue },
                    { name: "Porsi", value: data.expenses.total ? (row.amount / data.expenses.total) * 100 : 0, color: COLOR.bep, kind: "pct" },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="amount" radius={[0, 6, 6, 0]} maxBarSize={22} {...motion}>
            {lines.map((row, index) => (
              <Cell key={row.name} fill={index === 0 ? "var(--garage-red-bright)" : index < 3 ? "var(--garage-red)" : "#7a2a2a"} />
            ))}
          </Bar>
        </BarChart>
      </SafeResponsiveContainer>
    </div>
  );
}

export function ExpenseDonut({ data }: { data: FinanceControlDashboard }) {
  const motion = useChartMotion();
  const top = data.expenses.lines.slice(0, 6);
  const rest = data.expenses.lines.slice(6).reduce((sum, row) => sum + row.amount, 0);
  const slices = [...top, ...(rest > 0 ? [{ name: "Lainnya", amount: rest }] : [])];
  const total = data.expenses.total;
  return (
    <div>
      <div className="relative h-[210px]">
        <SafeResponsiveContainer>
          <PieChart>
            <Tooltip
              animationDuration={180}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as { name: string; amount: number };
                return (
                  <TooltipBox
                    title={row.name}
                    rows={[
                      { name: "Biaya", value: row.amount, color: COLOR.revenue },
                      { name: "Porsi", value: total ? (row.amount / total) * 100 : 0, color: COLOR.bep, kind: "pct" },
                    ]}
                  />
                );
              }}
            />
            <Pie data={slices} dataKey="amount" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={2} stroke="none" {...motion}>
              {slices.map((slice, index) => (
                <Cell key={slice.name} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        </SafeResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-mono text-base font-bold tabular-nums text-zinc-50">{rupiah(total)}</p>
          <p className="text-[11px] font-semibold uppercase text-zinc-400">Total biaya</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {slices.map((slice, index) => (
          <li key={slice.name} className="flex items-start justify-between gap-3 text-zinc-300">
            <span className="flex items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[index % PALETTE.length] }} />
              <span className="break-words">{slice.name}</span>
            </span>
            <span className="font-mono text-xs tabular-nums text-zinc-100">{percent(total ? (slice.amount / total) * 100 : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Channel revenue (PRD §40) ──────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  Card: "Debit / Kartu",
  "Bank Transfer": "Transfer",
  "E-Wallet": "E-Wallet",
};

export function ChannelBars({ data }: { data: FinanceControlDashboard }) {
  const reduce = useReducedMotion();
  if (!data.channels.length) return null;
  const maxAmount = Math.max(...data.channels.map((row) => row.amount));
  return (
    <ul className="space-y-2.5">
      {data.channels.map((row) => (
        <li key={row.name}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="text-zinc-200">{CHANNEL_LABEL[row.name] ?? row.name}</span>
            <span className="font-mono tabular-nums text-zinc-100">
              {rupiah(row.amount)} <span className="text-xs text-zinc-400">· {percent(row.share)}</span>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--garage-red-deep)] to-[var(--garage-red-bright)]"
              style={{
                width: `${maxAmount ? (row.amount / maxAmount) * 100 : 0}%`,
                transition: reduce ? undefined : "width 700ms ease-out",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map(([name, color]) => (
        <span key={name} className="flex items-center gap-1.5 text-xs text-zinc-300">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {name}
        </span>
      ))}
    </div>
  );
}
