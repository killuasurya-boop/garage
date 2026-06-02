"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

type Row = Record<string, unknown>;

export function GenericAreaChart({
  data,
  xKey,
  yKey,
  color = "var(--garage-amber)",
  height = 220,
  formatValue,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const id = `area-${yKey}`;
  return (
    <div className="w-full" style={{ height }}>
      <SafeResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.42} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: "#9696a1", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#9696a1", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={formatValue} />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.1)", strokeDasharray: "4 4" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const v = Number(payload[0].value);
              return (
                <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-1)] p-3 shadow-xl">
                  <p className="text-[10px] font-mono uppercase text-zinc-400">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{formatValue ? formatValue(v) : v.toLocaleString("id-ID")}</p>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} fill={`url(#${id})`} animationDuration={1300} />
        </AreaChart>
      </SafeResponsiveContainer>
    </div>
  );
}
