"use client";

import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { activityTimeline } from "../data/mockData";

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const dotColor: Record<string, string> = {
  Keuangan: "bg-[var(--garage-amber)]",
  POS: "bg-red-400",
  Pembelian: "bg-[var(--garage-success)]",
  Stok: "bg-zinc-200",
  Tim: "bg-[var(--garage-success)]",
  Analitik: "bg-amber-300",
  Marketing: "bg-red-300",
  Operasional: "bg-emerald-300",
};

export function ActivityTimeline() {
  return (
    <div className="relative rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-5 shadow-[var(--garage-shadow-panel)]">
      <div className="flex items-center justify-between pb-3">
        <h3 className="font-[var(--garage-font-display)] text-sm font-black uppercase text-zinc-50">
          Aktivitas Control
        </h3>
        <span className="text-[10px] uppercase text-zinc-500">10 aktivitas terakhir</span>
      </div>
      <ol className="relative ml-1 space-y-3 border-l border-white/10 pl-5">
        {activityTimeline.map((e, i) => (
          <motion.li
            key={e.id}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ delay: i * 0.04, duration: 0.35 }}
            className="relative"
          >
            <span
              className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-black/40 ${dotColor[e.department] ?? "bg-zinc-300"}`}
            />
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-zinc-100">
                {initials(e.user)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-snug text-zinc-200">{e.action}</p>
                <p className="mt-0.5 flex items-center gap-2 text-[10px] uppercase text-zinc-500">
                  <span>{formatDistanceToNow(new Date(e.time), { addSuffix: true, locale: idLocale })}</span>
                  <span className="rounded-sm bg-[var(--garage-bg-3)] px-1.5 py-0.5 text-[9px] text-zinc-300">{e.department}</span>
                </p>
              </div>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
