"use client";

import { motion } from "framer-motion";
import { funnelData } from "../data/mockData";

const colors = ["var(--garage-red-bright)", "var(--garage-red)", "var(--garage-amber)", "var(--garage-silver)", "var(--garage-success)"];

export function SalesFunnelChart({ data = funnelData }: { data?: { stage: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((row, i) => {
        const pct = (row.value / max) * 100;
        const next = data[i + 1];
        const conversion = next ? ((next.value / row.value) * 100).toFixed(1) : null;
        return (
          <div key={row.stage} className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase">
              <span className="text-zinc-300">{row.stage}</span>
              <span className="font-mono text-zinc-100">{row.value.toLocaleString("id-ID")}</span>
            </div>
            <div className="h-7 w-full overflow-hidden rounded-md border border-white/10 bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.9, delay: i * 0.1, ease: "easeOut" }}
                className="flex h-full items-center justify-end pr-2 text-[10px] font-bold text-white"
                style={{ background: `linear-gradient(90deg, ${colors[i]}, ${colors[Math.min(i + 1, colors.length - 1)]})` }}
              >
                {pct.toFixed(0)}%
              </motion.div>
            </div>
            {conversion ? (
              <p className="pl-1 text-[10px] text-zinc-500">
                lanjut <span className="font-mono text-amber-300">{conversion}%</span> ke {next!.stage}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
