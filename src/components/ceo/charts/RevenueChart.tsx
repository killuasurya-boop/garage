"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import { revenueData } from "../data/mockData";
import { useDashboard } from "../store/dashboardStore";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

function shortIdr(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return value.toString();
}

export function RevenueChart() {
  const { dateRange } = useDashboard();

  const data = useMemo(() => {
    const map: Record<string, number> = { "7d": 2, "30d": 4, "90d": 8, "1y": 12 };
    const last = map[dateRange] ?? 12;
    return revenueData.slice(-last);
  }, [dateRange]);

  return (
    <motion.div
      key={dateRange}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="h-[320px] w-full"
    >
      <SafeResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--garage-red-bright)" stopOpacity={0.42} />
              <stop offset="100%" stopColor="var(--garage-red-bright)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--garage-success)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--garage-success)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: "#9696a1", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={shortIdr} tick={{ fill: "#9696a1", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.1)", strokeDasharray: "4 4" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-1)] p-3 shadow-xl">
                  <p className="font-mono text-[10px] uppercase text-zinc-400">{label}</p>
                  {payload.map((p) => (
                    <div key={p.dataKey as string} className="mt-1 flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                        {p.name}
                      </span>
                      <span className="font-semibold text-zinc-100">Rp {shortIdr(Number(p.value))}</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 11, color: "#d0d0d6", paddingTop: 6 }}
          />
          <Area type="monotone" dataKey="revenue" name="Omzet" stroke="var(--garage-red-bright)" strokeWidth={2.2} fill="url(#revFill)" animationDuration={1400} />
          <Area type="monotone" dataKey="profit" name="Laba" stroke="var(--garage-success)" strokeWidth={1.8} fill="url(#profitFill)" animationDuration={1600} />
          <Line type="monotone" dataKey="expenses" name="Biaya" stroke="var(--garage-amber)" strokeWidth={1.6} dot={false} animationDuration={1600} />
        </ComposedChart>
      </SafeResponsiveContainer>
    </motion.div>
  );
}
