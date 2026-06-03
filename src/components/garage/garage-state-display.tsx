"use client";

// Komponen reusable bertema Garage untuk state UI per modul.
// Standardize empty / error / loading state di seluruh aplikasi (Section 38 DoD).
//
// Pakai:
//   <GarageEmpty icon={Inbox} title="Belum ada order" description="..." action={<Button .../>} />
//   <GarageError message={err.message} onRetry={refetch} />
//   <GarageLoadingRows count={5} />

import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─────────────────────────────────────────────────────────────────────
// EmptyState — saat data list/result kosong
// ─────────────────────────────────────────────────────────────────────
export function GarageEmpty({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Compact: pakai di dalam card/section kecil; default ruang lebih lega */
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[#34343c] bg-white/[0.02] text-center ${
        compact ? "px-4 py-6" : "px-6 py-10"
      }`}
    >
      <div className="flex size-10 items-center justify-center rounded-full border border-[#34343c] bg-white/[0.04] text-[#9a9a9a]">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="garage-mono text-sm font-semibold text-[#d6d6dc]">{title}</p>
      {description ? (
        <p className="max-w-md text-xs text-[#8f8f99]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ErrorState — saat fetch gagal / runtime error di modul
// ─────────────────────────────────────────────────────────────────────
export function GarageError({
  title = "Gagal memuat data",
  message,
  onRetry,
  compact = false,
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-2 rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/10 text-center ${
        compact ? "px-4 py-6" : "px-6 py-10"
      }`}
    >
      <div className="flex size-10 items-center justify-center rounded-full border border-[#d11a2a]/45 bg-[#d11a2a]/15 text-[#ff6b5b]">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="garage-mono text-sm font-semibold text-[#f4f4f5]">{title}</p>
      {message ? (
        <p className="max-w-md text-xs text-[#ffb8b0]">{message}</p>
      ) : null}
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 h-8 gap-1 border-[#d11a2a]/55 bg-[#d11a2a]/10 px-3 text-xs font-bold uppercase tracking-wider text-[#ffd0c8] hover:bg-[#d11a2a]/20"
        >
          <RefreshCw className="size-3" />
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LoadingRows — skeleton list bertema (tabel/cards)
// ─────────────────────────────────────────────────────────────────────
export function GarageLoadingRows({
  count = 5,
  showHeader = true,
}: {
  count?: number;
  showHeader?: boolean;
}) {
  return (
    <div role="status" aria-label="Memuat data" className="space-y-2">
      {showHeader ? (
        <div className="flex items-center justify-between rounded-md border border-[#26262c] bg-white/[0.03] px-3 py-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      ) : null}
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md border border-[#26262c] bg-white/[0.02] px-3 py-3"
        >
          <Skeleton className="size-8 shrink-0 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2 w-1/3" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Card variant — utk dipasang dalam Card existing tanpa wrapper baru
// ─────────────────────────────────────────────────────────────────────
export function GarageInlineMessage({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "warn" | "error";
  children: ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? "border-[#d11a2a]/40 bg-[#d11a2a]/10 text-[#ffb8b0]"
      : tone === "warn"
      ? "border-[#f5a742]/40 bg-[#f5a742]/10 text-[#ffd79a]"
      : "border-[#34343c] bg-white/[0.04] text-[#8f8f99]";
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${toneClass}`}>
      {children}
    </div>
  );
}
