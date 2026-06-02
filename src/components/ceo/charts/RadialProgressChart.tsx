"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

export function RadialProgressChart({
  value,
  label,
  unit = "%",
  accent = "var(--garage-red-bright)",
  size = 160,
}: {
  value: number; // 0..100
  label?: string;
  unit?: string;
  accent?: string;
  size?: number;
}) {
  const data = [{ name: "v", value }];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <SafeResponsiveContainer>
        <RadialBarChart innerRadius="74%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={20} fill={accent} background={{ fill: "rgba(255,255,255,0.08)" }} animationDuration={1200} />
        </RadialBarChart>
      </SafeResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-[var(--garage-font-display)] text-2xl font-black text-zinc-50">
          {Math.round(value)}
          <span className="text-sm text-zinc-400">{unit}</span>
        </p>
        {label ? <p className="mt-0.5 text-[10px] font-semibold uppercase text-zinc-400">{label}</p> : null}
      </div>
    </div>
  );
}
