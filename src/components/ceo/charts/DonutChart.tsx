"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

export type DonutSlice = { name: string; value: number; color: string };

export function DonutChart({
  data,
  centerLabel,
  centerValue,
  innerRadius = 62,
  outerRadius = 86,
}: {
  data: DonutSlice[];
  centerLabel?: string;
  centerValue?: string;
  innerRadius?: number;
  outerRadius?: number;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);

  return (
    <div className="relative h-[240px] w-full">
      <SafeResponsiveContainer>
        <PieChart>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as DonutSlice;
              const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
              return (
                <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-1)] p-3 shadow-xl">
                  <p className="text-[10px] font-mono uppercase text-zinc-400">{p.name}</p>
                  <p className="text-sm font-semibold text-zinc-100">{p.value.toLocaleString("id-ID")}</p>
                  <p className="text-xs text-amber-300">{pct}%</p>
                </div>
              );
            }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            stroke="none"
            animationDuration={1200}
          >
            {data.map((slice, i) => (
              <Cell key={`cell-${i}`} fill={slice.color} />
            ))}
          </Pie>
        </PieChart>
      </SafeResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue ? (
            <p className="font-[var(--garage-font-display)] text-2xl font-black text-zinc-50">{centerValue}</p>
          ) : null}
          {centerLabel ? (
            <p className="mt-0.5 text-[10px] font-semibold uppercase text-zinc-400">{centerLabel}</p>
          ) : null}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {data.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
