import type { ReactNode } from "react";
import { GlowDot } from "../ui/GlowDot";

export function PageHeader({ kicker, title, subtitle, actions }: { kicker?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker ? (
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase text-amber-300">
            <GlowDot tone="amber" /> {kicker}
          </p>
        ) : null}
        <h1 className="font-[var(--garage-font-display)] text-2xl font-black uppercase text-zinc-50 sm:text-3xl">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
