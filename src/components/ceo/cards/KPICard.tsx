"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, AlertTriangle, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCounterAnimation, formatNumber } from "../hooks/useCounterAnimation";
import { SparklineChart } from "../charts/SparklineChart";
import type { Trend } from "../data/mockData";

type Accent = "red" | "amber" | "chrome" | "success";

type Props = {
  title: string;
  value: number;
  change: number;
  trend: Trend;
  icon: LucideIcon;
  accent: Accent;
  prefix?: string;
  suffix?: string;
  format?: "currency" | "percent" | "number";
  sparkline?: number[];
};

const accentBg: Record<Accent, string> = {
  red: "from-[color-mix(in_srgb,var(--garage-red)_28%,transparent)] to-transparent",
  amber: "from-[color-mix(in_srgb,var(--garage-amber)_28%,transparent)] to-transparent",
  chrome: "from-[color-mix(in_srgb,var(--garage-silver)_18%,transparent)] to-transparent",
  success: "from-[color-mix(in_srgb,var(--garage-success)_22%,transparent)] to-transparent",
};

const accentIcon: Record<Accent, string> = {
  red: "bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)] text-[#ffb1b1] ring-[color-mix(in_srgb,var(--garage-red)_45%,transparent)]",
  amber: "bg-[color-mix(in_srgb,var(--garage-amber)_22%,transparent)] text-[#ffd8a8] ring-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)]",
  chrome: "bg-[color-mix(in_srgb,var(--garage-silver)_12%,transparent)] text-zinc-100 ring-[color-mix(in_srgb,var(--garage-silver)_26%,transparent)]",
  success: "bg-[color-mix(in_srgb,var(--garage-success)_15%,transparent)] text-[#a8f0c4] ring-[color-mix(in_srgb,var(--garage-success)_40%,transparent)]",
};

const accentGlow: Record<Accent, string> = {
  red: "hover:shadow-[0_0_32px_color-mix(in_srgb,var(--garage-red)_28%,transparent)]",
  amber: "hover:shadow-[0_0_28px_color-mix(in_srgb,var(--garage-amber)_22%,transparent)]",
  chrome: "hover:shadow-[0_0_24px_rgba(244,244,245,0.18)]",
  success: "hover:shadow-[0_0_28px_color-mix(in_srgb,var(--garage-success)_24%,transparent)]",
};

export function KPICard({ title, value, change, trend, icon: Icon, accent, prefix, suffix, format, sparkline }: Props) {
  const display = useCounterAnimation(value);
  const formatted = formatNumber(display, format);

  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : trend === "warning" ? AlertTriangle : Minus;
  const trendColor =
    trend === "up"
      ? "text-emerald-300"
      : trend === "down"
        ? "text-red-300"
        : trend === "warning"
          ? "text-amber-300"
          : "text-zinc-300";
  const trendBg =
    trend === "up"
      ? "bg-emerald-500/12 border-emerald-400/30"
      : trend === "down"
        ? "bg-red-500/12 border-red-400/30"
        : trend === "warning"
          ? "bg-amber-500/12 border-amber-400/30"
          : "bg-white/8 border-white/15";

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      className={`group relative overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-5 shadow-[var(--garage-shadow-panel)] transition-all hover:border-[color-mix(in_srgb,var(--garage-silver)_30%,transparent)] ${accentGlow[accent]}`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accentBg[accent]} opacity-60`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-zinc-400">{title}</p>
          <p className="mt-2 truncate font-[var(--garage-font-display)] text-2xl font-black text-zinc-50 sm:text-[26px]">
            {prefix}
            {formatted}
            {suffix}
          </p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${accentIcon[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="relative mt-4 flex items-end justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${trendBg} ${trendColor}`}
        >
          <TrendIcon className="h-3.5 w-3.5" />
          {change > 0 ? "+" : ""}
          {change}%
        </span>
        {sparkline && sparkline.length > 0 ? (
          <div className="h-9 w-24 sm:w-28">
            <SparklineChart data={sparkline} accent={accent} />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
