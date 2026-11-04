"use client";

// Toast bertingkat Menu V5 (papan 06): sukses hijau, stok terbatas amber, gagal
// merah; masing-masing bisa ditutup. Pop-in 180 ms (mati saat reduced-motion).
import { AlertTriangle, Check, X, XCircle } from "lucide-react";

export type MenuToastTone = "success" | "warning" | "error";
export type MenuToast = { id: number; tone: MenuToastTone; title: string; detail?: string };

/** Maksimal toast yang tampil bersamaan; yang paling lama dibuang lebih dulu. */
export const MENU_TOAST_LIMIT = 3;
export const MENU_TOAST_MS: Record<MenuToastTone, number> = { success: 2200, warning: 3200, error: 4500 };

/** Tambah toast baru; toast dengan judul + nada sama diganti (tidak menumpuk duplikat). */
export function pushMenuToast(list: readonly MenuToast[], next: MenuToast): MenuToast[] {
  const rest = list.filter((toast) => !(toast.tone === next.tone && toast.title === next.title));
  return [...rest, next].slice(-MENU_TOAST_LIMIT);
}

const ICON = { success: Check, warning: AlertTriangle, error: XCircle } as const;

export function MenuToastStackV5({ toasts, onDismiss }: { toasts: readonly MenuToast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="gm5-toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICON[toast.tone];
        return (
          <div key={toast.id} role={toast.tone === "error" ? "alert" : "status"} className="gm5-toast gm5-pop" data-tone={toast.tone}>
            <Icon className="gm5-toast-icon size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 break-words text-sm leading-5">
              <strong className="font-semibold text-white">{toast.title}</strong>
              {toast.detail ? <span className="text-[#ede6dc]"> {toast.detail}</span> : null}
            </p>
            <button type="button" className="gm5-toast-close" aria-label="Tutup notifikasi" onClick={() => onDismiss(toast.id)}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Centang sukses yang tergambar (SVG stroke) + success pulse 300 ms. */
export function SuccessCheckV5({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`gm5-success-check ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="10.5" className="gm5-success-ring" />
      <path d="M7 12.5l3.2 3.2L17 9" className="gm5-success-tick" />
    </svg>
  );
}
