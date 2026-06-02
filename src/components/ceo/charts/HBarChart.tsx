"use client";

import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

type Row = Record<string, unknown>;

const palette = [
  "var(--garage-red-bright)",
  "var(--garage-red)",
  "var(--garage-amber)",
  "color-mix(in srgb, var(--garage-amber) 70%, white)",
  "var(--garage-silver)",
  "color-mix(in srgb, var(--garage-silver) 62%, var(--garage-bg-3))",
  "color-mix(in srgb, var(--garage-red) 68%, black)",
];

export function HBarChart({
  data,
  categoryKey,
  valueKey,
  height = 240,
  formatValue,
}: {
  data: Row[];
  categoryKey: string;
  valueKey: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  return (
    <div className="w-full" style={{ height }}>
      <SafeResponsiveContainer>
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 14, left: 6, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#9696a1", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatValue} />
          <YAxis dataKey={categoryKey} type="category" tick={{ fill: "#d0d0d6", fontSize: 11 }} axisLine={false} tickLine={false} width={96} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
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
          <Bar dataKey={valueKey} radius={[0, 6, 6, 0]} animationDuration={1100}>
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </SafeResponsiveContainer>
    </div>
  );
}
