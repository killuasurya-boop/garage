import type { ReactNode } from "react";

type Tone = "red" | "amber" | "success" | "chrome" | "muted" | "info";

const toneClass: Record<Tone, string> = {
  red: "bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)] text-[#ffb1b1] border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)]",
  amber: "bg-[color-mix(in_srgb,var(--garage-amber)_22%,transparent)] text-[#ffd8a8] border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)]",
  success: "bg-[color-mix(in_srgb,var(--garage-success)_18%,transparent)] text-[#a8f0c4] border-[color-mix(in_srgb,var(--garage-success)_42%,transparent)]",
  chrome: "bg-white/10 text-zinc-100 border-white/15",
  muted: "bg-white/5 text-zinc-400 border-white/10",
  info: "bg-zinc-100/10 text-zinc-200 border-zinc-100/20",
};

export function Badge({ children, tone = "chrome", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase ${toneClass[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
