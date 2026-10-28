import type { ReactNode } from "react";
import { CheckCircle2, Clock4, FileQuestion, GitCompareArrows, Loader2, Lock, RefreshCw, SearchX, WifiOff, XCircle } from "lucide-react";

import type { ScreenState } from "@/lib/design-tokens";

// U1 (PRD §24.8): keadaan wajib setiap layar kritis. Satu komponen supaya teks & ikon
// konsisten di semua modul: "tidak ada data" ≠ "filter terlalu sempit" ≠ "tidak punya akses".

type ViewState = Exclude<ScreenState, "default"> | "filtered";

const STATE_META: Record<ViewState, { icon: typeof Loader2; title: string; body: string; tone: string; role?: "status" | "alert" }> = {
  loading: { icon: Loader2, title: "Memuat data…", body: "Sebentar, data sedang diambil.", tone: "text-[var(--gos-text-secondary)]", role: "status" },
  empty: { icon: FileQuestion, title: "Belum ada data", body: "Belum ada catatan untuk ditampilkan.", tone: "text-[var(--gos-text-secondary)]" },
  filtered: { icon: SearchX, title: "Tidak ada yang cocok dengan filter", body: "Longgarkan filter atau hapus pencarian.", tone: "text-[var(--gos-text-secondary)]" },
  error: { icon: XCircle, title: "Data gagal dimuat", body: "Periksa koneksi lalu coba lagi. Tidak ada data yang berubah.", tone: "text-[var(--gos-status-danger)]", role: "alert" },
  offline: { icon: WifiOff, title: "Sedang offline", body: "Perubahan menunggu koneksi — belum tersimpan di server.", tone: "text-[var(--gos-status-warning)]", role: "status" },
  success: { icon: CheckCircle2, title: "Tersimpan", body: "Perubahan sudah tercatat.", tone: "text-[var(--gos-status-success)]", role: "status" },
  unauthorized: { icon: Lock, title: "Tidak punya akses", body: "Peran Anda tidak boleh membuka data ini. Minta Owner bila perlu.", tone: "text-[var(--gos-status-warning)]" },
  conflict: { icon: GitCompareArrows, title: "Data sudah diubah orang lain", body: "Muat ulang untuk melihat versi terbaru sebelum menyimpan.", tone: "text-[var(--gos-status-warning)]", role: "alert" },
  stale: { icon: Clock4, title: "Data mungkin sudah lama", body: "Data ini melewati batas kesegaran — segarkan sebelum memutuskan.", tone: "text-[var(--gos-status-warning)]", role: "status" },
};

export const STATE_VIEW_KINDS = Object.keys(STATE_META) as ViewState[];

export function StateView({
  state,
  title,
  description,
  onRetry,
  retryLabel = "Coba lagi",
  action,
  compact = false,
}: {
  state: ViewState;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <div
      role={meta.role}
      aria-live={meta.role ? "polite" : undefined}
      data-state={state}
      className={`flex ${compact ? "items-start gap-3 p-3" : "flex-col items-center gap-2 px-4 py-8 text-center"} rounded-lg border border-white/10 bg-[var(--gos-bg-surface)]`}
    >
      <Icon className={`shrink-0 ${compact ? "mt-0.5 size-5" : "size-8"} ${meta.tone} ${state === "loading" ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className={`font-semibold ${compact ? "text-sm" : "text-base"} text-[var(--gos-text-primary)]`}>{title ?? meta.title}</p>
        <p className="mt-0.5 text-sm text-[var(--gos-text-secondary)]">{description ?? meta.body}</p>
        {onRetry || action ? (
          <div className={`mt-3 flex flex-wrap gap-2 ${compact ? "" : "justify-center"}`}>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--gos-control-border)] px-3 text-sm font-semibold text-[var(--gos-text-primary)] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gos-control-focus)]"
              >
                <RefreshCw className="size-4" aria-hidden="true" /> {retryLabel}
              </button>
            ) : null}
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
