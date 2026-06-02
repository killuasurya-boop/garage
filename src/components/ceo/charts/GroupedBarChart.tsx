"use client";

import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

type Row = Record<string, unknown>;

export function GroupedBarChart({
  data,
  xKey,
  series,
  height = 260,
  formatValue,
}: {
  data: Row[];
  xKey: string;
  series: { key: string; name: string; color: string }[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  return (
    <div className="w-full" style={{ height }}>
      <SafeResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: "#9696a1", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#9696a1", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={formatValue} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-1)] p-3 shadow-xl">
                  <p className="text-[10px] font-mono uppercase text-zinc-400">{label}</p>
                  {payload.map((p) => (
                    <div key={p.dataKey as string} className="mt-1 flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                        {p.name}
                      </span>
                      <span className="font-semibold text-zinc-100">{formatValue ? formatValue(Number(p.value)) : Number(p.value).toLocaleString("id-ID")}</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: "#d0d0d6", paddingTop: 6 }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[6, 6, 0, 0]} animationDuration={1100} />
          ))}
        </BarChart>
      </SafeResponsiveContainer>
    </div>
  );
}
