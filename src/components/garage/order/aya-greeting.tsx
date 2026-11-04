"use client";

// Sambutan Aya di menu digital (keputusan Owner D-07): Aya, AI pet Garage, melayang di
// layar, menyapa pelanggan dan mengajak memesan. Teks statis — tidak memanggil AI, tidak
// membuka data internal, tidak menjanjikan promo yang tidak ada.
import { useEffect, useState } from "react";
import { Hand, HandHelping, MessageCircle, Search, Sparkles, X } from "lucide-react";

import { AYA_NAME } from "@/lib/garage-ai-persona";

/** Sapaan menurut jam WIB (pelanggan bisa membuka dari zona lain). */
export function ayaGreetingSalam(now: Date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(now));
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

/** Isi balon sapaan Aya di menu digital (dipakai di dalam AyaFloatingPet). */
export function AyaGreeting({
  name,
  heroLabel,
  onShowHero,
  onFocusSearch,
  onHelp,
  onStartGuide,
  onChat,
  onClose,
  onHide,
}: {
  name?: string | null;
  /** Label rail unggulan (Unggulan/Promo/Terlaris); kosong = tombolnya disembunyikan. */
  heroLabel?: string | null;
  onShowHero?: () => void;
  onFocusSearch: () => void;
  /** Dine-in saja: buka sheet bantuan meja. */
  onHelp?: () => void;
  /** Mulai panduan cara pesan (Aya menunjuk tombol satu per satu). */
  onStartGuide?: () => void;
  /** Buka panel chat AYA Assistant. */
  onChat?: () => void;
  onClose: () => void;
  onHide: () => void;
}) {
  const [salam, setSalam] = useState("Halo");
  useEffect(() => {
    // Jam klien dibaca setelah mount agar SSR & hidrasi sama.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSalam(ayaGreetingSalam());
  }, []);

  const firstName = name?.trim().split(/\s+/)[0];
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-bold text-white">
          {salam}
          {firstName ? `, ${firstName}` : ""}! Aku {AYA_NAME} 👋
        </p>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-garage-dim transition-colors hover:bg-garage-bg-3 hover:text-white"
          aria-label={`Tutup sapaan ${AYA_NAME}`}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="mt-0.5 text-sm leading-relaxed text-garage-dim">
        Mau yang segar, yang manis, atau yang bikin kenyang? Pilih menunya, nanti kasir konfirmasi pesananmu.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onChat ? (
          <button
            type="button"
            onClick={act(onChat)}
            className="garage-press flex h-10 cursor-pointer items-center gap-1.5 rounded-md bg-garage-red px-3 text-sm font-bold text-white transition-colors hover:bg-garage-red-bright"
          >
            <MessageCircle className="size-4" aria-hidden />
            Tanya {AYA_NAME}
          </button>
        ) : null}
        {onStartGuide ? (
          <button
            type="button"
            onClick={onStartGuide}
            className="garage-press flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-garage-amber/60 px-3 text-sm font-bold text-white transition-colors hover:bg-garage-bg-3"
          >
            <Hand className="size-4" aria-hidden />
            Cara pesan
          </button>
        ) : null}
        {heroLabel && onShowHero ? (
          <button
            type="button"
            onClick={act(onShowHero)}
            className="garage-press flex h-10 cursor-pointer items-center gap-1.5 rounded-md bg-garage-red px-3 text-sm font-bold text-white transition-colors hover:bg-garage-red-bright"
          >
            <Sparkles className="size-4" aria-hidden />
            Lihat {heroLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={act(onFocusSearch)}
          className="garage-press flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-garage-line-2 px-3 text-sm font-bold text-white transition-colors hover:bg-garage-bg-3"
        >
          <Search className="size-4" aria-hidden />
          Cari menu
        </button>
        {onHelp ? (
          <button
            type="button"
            onClick={act(onHelp)}
            className="garage-press flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-garage-line-2 px-3 text-sm font-bold text-white transition-colors hover:bg-garage-bg-3"
          >
            <HandHelping className="size-4" aria-hidden />
            Panggil staf
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onHide}
        className="mt-2 cursor-pointer text-xs font-semibold text-garage-mute underline-offset-2 hover:text-white hover:underline"
      >
        Sembunyikan {AYA_NAME} untuk sesi ini
      </button>
    </div>
  );
}
