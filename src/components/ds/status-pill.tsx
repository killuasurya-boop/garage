import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, XCircle } from "lucide-react";

import type { StatusTone } from "@/lib/design-tokens";

// U1 (PRD §24.2/§24.6): status SELALU ikon + teks — tidak pernah hanya warna.
// Warna teks dari token status (lolos kontras AA di semua latar gelap).

const TONE_CLASS: Record<StatusTone, string> = {
  success: "text-[var(--gos-status-success)] border-[color-mix(in_srgb,var(--gos-status-success)_40%,transparent)] bg-[color-mix(in_srgb,var(--gos-status-success)_10%,transparent)]",
  warning: "text-[var(--gos-status-warning)] border-[color-mix(in_srgb,var(--gos-status-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--gos-status-warning)_10%,transparent)]",
  danger: "text-[var(--gos-status-danger)] border-[color-mix(in_srgb,var(--gos-status-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--gos-status-danger)_10%,transparent)]",
  info: "text-[var(--gos-status-info)] border-[color-mix(in_srgb,var(--gos-status-info)_40%,transparent)] bg-[color-mix(in_srgb,var(--gos-status-info)_10%,transparent)]",
  neutral: "text-[var(--gos-status-neutral)] border-white/15 bg-white/[0.06]",
};

const TONE_ICON: Record<StatusTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: CircleDashed,
};

export function StatusPill({ tone, children, className = "" }: { tone: StatusTone; children: ReactNode; className?: string }) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      data-tone={tone}
      className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]} ${className}`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
