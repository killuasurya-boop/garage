"use client";

// Sambutan Aya di menu digital (keputusan Owner D-07): robot AI Garage menyapa
// pelanggan dan mengajak memesan. Teks statis — tidak memanggil AI, tidak membuka
// data internal, tidak menjanjikan promo yang tidak ada. Bisa ditutup per sesi.
import { useEffect, useState } from "react";
import { HandHelping, Search, Sparkles, X } from "lucide-react";

import { AyaAvatar } from "@/components/garage/aya-avatar";
import { AYA_NAME } from "@/lib/garage-ai-persona";

const HIDDEN_KEY = "garage:aya-greeting-hidden";

/** Sapaan menurut jam WIB (pelanggan bisa membuka dari zona lain). */
export function ayaGreetingSalam(now: Date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(now));
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

export function AyaGreeting({
  name,
  heroLabel,
  onShowHero,
  onFocusSearch,
  onHelp,
}: {
  name?: string | null;
  /** Label rail unggulan (Unggulan/Promo/Terlaris); kosong = tombolnya disembunyikan. */
  heroLabel?: string | null;
  onShowHero?: () => void;
  onFocusSearch: () => void;
  /** Dine-in saja: buka sheet bantuan meja. */
  onHelp?: () => void;
}) {
  const [hidden, setHidden] = useState(true);
  const [salam, setSalam] = useState("Halo");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(HIDDEN_KEY);
    } catch {
      stored = null;
    }
    // Baca setelah mount agar SSR & hidrasi sama (sessionStorage/jam klien).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(stored === "1");
    setSalam(ayaGreetingSalam());
  }, []);

  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      window.sessionStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // sessionStorage diblokir: cukup sembunyikan untuk render ini.
    }
  }

  const firstName = name?.trim().split(/\s+/)[0];

  return (
    <section
      aria-label={`Sambutan ${AYA_NAME}`}
      className="garage-animate-in mt-4 flex gap-3 rounded-lg border border-garage-line-2 bg-garage-bg-2 p-3 sm:p-4"
    >
      <AyaAvatar size={52} className="mt-0.5 sm:size-14" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-bold text-white">
            {salam}
            {firstName ? `, ${firstName}` : ""}! Aku {AYA_NAME} 👋
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="-mr-1 -mt-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-garage-dim transition-colors hover:bg-garage-bg-3 hover:text-white"
            aria-label={`Tutup sambutan ${AYA_NAME}`}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-garage-dim">
          Robot AI Garage Coffee. Mau yang segar, yang manis, atau yang bikin kenyang? Pilih menu di bawah, nanti kasir
          konfirmasi pesananmu.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {heroLabel && onShowHero ? (
            <button
              type="button"
              onClick={onShowHero}
              className="garage-press flex h-10 cursor-pointer items-center gap-1.5 rounded-md bg-garage-red px-3 text-sm font-bold text-white transition-colors hover:bg-garage-red-bright"
            >
              <Sparkles className="size-4" aria-hidden />
              Lihat {heroLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onFocusSearch}
            className="garage-press flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-garage-line-2 px-3 text-sm font-bold text-white transition-colors hover:bg-garage-bg-3"
          >
            <Search className="size-4" aria-hidden />
            Cari menu
          </button>
          {onHelp ? (
            <button
              type="button"
              onClick={onHelp}
              className="garage-press flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-garage-line-2 px-3 text-sm font-bold text-white transition-colors hover:bg-garage-bg-3"
            >
              <HandHelping className="size-4" aria-hidden />
              Panggil staf
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
