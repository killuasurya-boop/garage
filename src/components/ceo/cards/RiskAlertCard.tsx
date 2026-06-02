"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertOctagon, AlertTriangle, ChevronDown, Info, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import type { RiskAlert } from "../data/mockData";

const config = {
  low: { icon: Info, bg: "bg-[color-mix(in_srgb,var(--garage-success)_15%,transparent)]", text: "text-[#a8f0c4]", ring: "ring-[color-mix(in_srgb,var(--garage-success)_40%,transparent)]", label: "Rendah" },
  medium: { icon: AlertTriangle, bg: "bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)]", text: "text-[#ffd8a8]", ring: "ring-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)]", label: "Sedang" },
  high: { icon: ShieldAlert, bg: "bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)]", text: "text-[#ffb1b1]", ring: "ring-[color-mix(in_srgb,var(--garage-red)_55%,transparent)]", label: "Tinggi" },
  critical: { icon: AlertOctagon, bg: "bg-[color-mix(in_srgb,var(--garage-red)_30%,transparent)]", text: "text-[#ffd0d0]", ring: "ring-[color-mix(in_srgb,var(--garage-red-bright)_70%,transparent)]", label: "Kritis" },
} as const;

export function RiskAlertCard({ alert }: { alert: RiskAlert }) {
  const [open, setOpen] = useState(false);
  const c = config[alert.level];
  const Icon = c.icon;
  const isCritical = alert.level === "critical";
  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      className={`relative overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_70%,transparent)] bg-[var(--garage-bg-3)] p-3 transition ${isCritical ? "animate-[critPulse_2s_ease-in-out_infinite]" : ""}`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 text-left"
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.bg} ring-1 ${c.ring}`}>
          <Icon className={`h-4 w-4 ${c.text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${c.bg} ${c.text} ${c.ring}`}>
              {c.label}
            </span>
            <span className="text-[10px] uppercase text-zinc-500">{alert.department}</span>
            <span className="ml-auto text-[10px] text-zinc-500">{formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true, locale: idLocale })}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{alert.title}</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="overflow-hidden"
      >
        <p className="mt-2 border-t border-white/10 pt-2 text-xs leading-relaxed text-zinc-300">{alert.description}</p>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-400">
          <span>Peluang: <span className="font-mono text-zinc-200">{Math.round(alert.probability * 100)}%</span></span>
          <span>Dampak: <span className="font-mono text-zinc-200">{Math.round(alert.impact * 100)}%</span></span>
        </div>
      </motion.div>
      <style jsx>{`
        @keyframes critPulse {
          0%, 100% { box-shadow: 0 0 0 1px color-mix(in srgb, var(--garage-red-bright) 50%, transparent); }
          50% { box-shadow: 0 0 18px color-mix(in srgb, var(--garage-red-bright) 46%, transparent); }
        }
        @media (prefers-reduced-motion: reduce) {
          div { animation: none; }
        }
      `}</style>
    </motion.div>
  );
}
