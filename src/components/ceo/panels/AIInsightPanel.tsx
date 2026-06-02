"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Brain, Lightbulb, Sparkles, TrendingUp, Wrench } from "lucide-react";
import { GlowDot } from "../ui/GlowDot";
import { aiInsights, type InsightType } from "../data/mockData";

const iconMap: Record<InsightType, typeof Sparkles> = {
  opportunity: TrendingUp,
  warning: AlertTriangle,
  "action-needed": Wrench,
  insight: Lightbulb,
  prediction: Brain,
};

const toneMap: Record<InsightType, { ring: string; bg: string; text: string; label: string }> = {
  opportunity: { ring: "ring-[color-mix(in_srgb,var(--garage-success)_40%,transparent)]", bg: "bg-[color-mix(in_srgb,var(--garage-success)_15%,transparent)]", text: "text-[#a8f0c4]", label: "Peluang" },
  warning: { ring: "ring-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)]", bg: "bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)]", text: "text-[#ffd8a8]", label: "Waspada" },
  "action-needed": { ring: "ring-[color-mix(in_srgb,var(--garage-red)_60%,transparent)]", bg: "bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)]", text: "text-[#ffb1b1]", label: "Perlu aksi" },
  insight: { ring: "ring-[color-mix(in_srgb,var(--garage-silver)_25%,transparent)]", bg: "bg-[color-mix(in_srgb,var(--garage-silver)_10%,transparent)]", text: "text-zinc-200", label: "Insight" },
  prediction: { ring: "ring-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)]", bg: "bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)]", text: "text-[#ffd8a8]", label: "Prediksi" },
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 220, damping: 22 } },
};

export function AIInsightPanel() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-5 shadow-[var(--garage-shadow-panel)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--garage-red-bright),var(--garage-amber))]" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--garage-red)_55%,transparent)]">
            <Sparkles className="h-5 w-5 text-[#ffb1b1]" />
          </div>
          <div>
            <p className="flex items-center gap-2 font-[var(--garage-font-display)] text-base font-black uppercase text-zinc-50">
              GARAGE AI Control <GlowDot tone="success" />
            </p>
            <p className="text-xs text-zinc-400">Prioritas owner untuk shift hari ini.</p>
          </div>
        </div>
        <button className="rounded-md border border-white/15 bg-[var(--garage-bg-3)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 transition hover:bg-[var(--garage-bg-1)]">
          Tanya GARAGE AI
        </button>
      </div>

      <motion.ul
        variants={container}
        initial="hidden"
        animate="show"
        className="relative mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        {aiInsights.map((insight) => {
          const Icon = iconMap[insight.type];
          const tone = toneMap[insight.type];
          return (
            <motion.li
              key={insight.id}
              variants={item}
              whileHover={{ y: -2 }}
              className="group rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3 transition hover:border-white/20 hover:bg-[var(--garage-bg-1)]"
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.bg} ring-1 ${tone.ring}`}>
                  <Icon className={`h-4 w-4 ${tone.text}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] font-semibold uppercase ${tone.text}`}>{tone.label}</p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-zinc-100">{insight.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{insight.summary}</p>
                  <button className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase text-amber-300 transition hover:text-amber-200">
                    {insight.action} <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}
