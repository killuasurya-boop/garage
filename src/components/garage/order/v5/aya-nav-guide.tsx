"use client";

// Pemandu navigasi AYA (master prompt §8): setelah AYA membuka bagian menu, bar kecil ini
// menjelaskan apa yang disorot dan memberi kendali penuh ke pelanggan:
// - "Kembali ke AYA" (panel chat dibuka lagi),
// - "Batalkan" (kembali ke posisi & filter sebelumnya; AYA tidak lagi pindah halaman otomatis sesi ini),
// - tutup (X). Hilang sendiri setelah beberapa detik; tidak pernah menutupi kartu yang disorot
//   (diletakkan di pojok, di atas navigasi bawah HP).
import { useEffect } from "react";
import { MessageCircle, Undo2, X } from "lucide-react";

import { AyaMascot } from "@/components/garage/aya/aya-mascot";

export type AyaNavGuideState = { id: number; label: string; note?: string };

export const AYA_NAV_GUIDE_MS = 9000;

export function AyaNavGuideV5({
  guide,
  onBackToAya,
  onCancel,
  onDismiss,
}: {
  guide: AyaNavGuideState | null;
  onBackToAya: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!guide) return;
    const timer = window.setTimeout(onDismiss, AYA_NAV_GUIDE_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [guide, onDismiss]);

  if (!guide) return null;
  return (
    <div
      key={guide.id}
      className="gm5 gm5-aya-guidebar fixed z-[94] rounded-2xl border border-[color:var(--gm5-line)] bg-[#141214]/95 p-3 text-white shadow-[0_14px_36px_rgba(0,0,0,0.6)] backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <span className="relative size-11 shrink-0" aria-hidden>
          <AyaMascot state="guiding" crop="head" role="customer" />
        </span>
        <p className="min-w-0 flex-1 pt-0.5 text-sm leading-snug">
          <span className="block font-bold">AYA membuka {guide.label}</span>
          <span className="block text-[13px] text-[#cfc9c4]">{guide.note ?? "Bagian yang disorot merah adalah yang kamu cari."}</span>
        </p>
        <button type="button" className="gm5-icon-btn !h-10 !w-10 shrink-0" aria-label="Tutup petunjuk AYA" onClick={onDismiss}>
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" className="gm5-btn-ghost min-h-11 flex-1 gap-1.5 px-3 text-sm" onClick={onCancel}>
          <Undo2 className="size-4" aria-hidden /> Batalkan
        </button>
        <button type="button" className="gm5-btn-red min-h-11 flex-1 gap-1.5 px-3 text-sm" onClick={onBackToAya}>
          <MessageCircle className="size-4" aria-hidden /> Kembali ke AYA
        </button>
      </div>
    </div>
  );
}

/** Sorot elemen tujuan sebentar + pindahkan fokus (pembaca layar) tanpa menggulir ulang. */
export function spotlightElement(id: string, ms = 3600) {
  const el = document.getElementById(id);
  if (!el) return () => {};
  el.setAttribute("data-aya-spotlight", "true");
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  const timer = window.setTimeout(() => el.removeAttribute("data-aya-spotlight"), ms);
  return () => {
    window.clearTimeout(timer);
    el.removeAttribute("data-aya-spotlight");
  };
}
