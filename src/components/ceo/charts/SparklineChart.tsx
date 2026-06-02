"use client";

import { useId } from "react";
import { Area, AreaChart } from "recharts";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

const colorMap = {
  red: "var(--garage-red-bright)",
  amber: "var(--garage-amber)",
  chrome: "var(--garage-silver)",
  success: "var(--garage-success)",
} as const;

export function SparklineChart({ data, accent = "chrome" }: { data: number[]; accent?: keyof typeof colorMap }) {
  const stroke = colorMap[accent];
  const points = data.map((v, i) => ({ i, v }));
  const reactId = useId().replace(/[:]/g, "");
  const id = `spark-${accent}-${reactId}`;
  return (
    <SafeResponsiveContainer>
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.45} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={1.6}
          fill={`url(#${id})`}
          isAnimationActive
          animationDuration={1100}
        />
      </AreaChart>
    </SafeResponsiveContainer>
  );
}
