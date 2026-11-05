"use client";

// Welcome experience menu digital (master prompt §9).
// - Tampil sekali per sesi tab (sessionStorage), tidak untuk mode waiter (Pesankan).
// - Fullscreen HANYA lewat tombol (gesture pengguna), tidak pernah dipaksa saat halaman dimuat.
// - Tanpa Fullscreen API (iPhone Safari) → tata letak imersif (tinggi viewport dinamis) + saran
//   "Tambahkan ke Layar Utama"; pelanggan tidak pernah terkunci (tombol Keluar selalu ada).
// - Suara AYA opsional: kalau dicentang, AYA menyapa satu kali (setelah klik = izin interaksi).
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Maximize, Minimize, Volume2 } from "lucide-react";

import { AyaStage3D } from "@/components/garage/aya/aya-stage-3d";
import { readAyaSound, speakAya, writeAyaSound } from "@/lib/aya-sound";

import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, onFullscreenChange } from "./fullscreen";

export const AYA_VOICE_GREETING =
  "Halo, selamat datang di Garage Coffee! Aku Aya, asisten digital kamu. Mau lihat menu, cari rekomendasi minuman, atau butuh bantuan? Tanya Aya aja, ya!";

const WELCOME_KEY = "garage:menu-welcome:v1";

export function welcomeSeen() {
  try {
    return window.sessionStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return false;
  }
}

function markWelcomeSeen() {
  try {
    window.sessionStorage.setItem(WELCOME_KEY, "1");
  } catch {
    /* abaikan */
  }
}

export function useFullscreenState() {
  return useSyncExternalStore(
    (fn) => onFullscreenChange(fn),
    () => isFullscreen(),
    () => false,
  );
}

export function WelcomeV5({ tableLabel, onDone }: { tableLabel?: string | null; onDone: (result: { fullscreen: boolean; voice: boolean }) => void }) {
  const [voice, setVoice] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kemampuan browser baru diketahui setelah mount
    setSupported(fullscreenSupported());
    setVoice(readAyaSound("customer").enabled);
  }, []);

  const finish = useCallback(
    async (wantFullscreen: boolean) => {
      setBusy(true);
      markWelcomeSeen();
      const sound = readAyaSound("customer");
      if (voice !== sound.enabled) writeAyaSound("customer", { ...sound, enabled: voice });
      let fullscreen = false;
      if (wantFullscreen) {
        fullscreen = await enterFullscreen();
        if (!fullscreen) document.documentElement.setAttribute("data-gm5-immersive", "true");
      }
      // Satu kali sapaan suara, hanya bila pelanggan mengaktifkannya (klik ini = gesture).
      if (voice) window.setTimeout(() => speakAya(AYA_VOICE_GREETING, "customer"), fullscreen ? 450 : 150);
      onDone({ fullscreen, voice });
    },
    [onDone, voice],
  );

  // Escape = lanjut tanpa fullscreen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") void finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const table = tableLabel && /\d/.test(tableLabel) ? tableLabel : null;

  return (
    <div className="gm5 gm5-welcome fixed inset-0 z-[110] flex min-h-[100dvh] items-center justify-center overflow-y-auto px-4 py-6 text-white" role="dialog" aria-modal="true" aria-labelledby="gm5-welcome-title" aria-describedby="gm5-welcome-desc">
      <div className="gm5-welcome-card flex w-full max-w-md flex-col items-center text-center md:max-w-xl">
        <Image src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" width={1200} height={282} priority className="h-auto w-[170px] object-contain md:w-[220px]" />
        <div className="relative my-2 h-[min(34dvh,240px)] w-[min(34dvh,240px)] md:h-64 md:w-64">
          <AyaStage3D presence="greeting" className="h-full w-full" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff8a86]">Selamat datang di</p>
        <h2 id="gm5-welcome-title" className="gm5-display gm5-welcome-title mt-1 uppercase text-white">
          Garage Coffee
        </h2>
        <p id="gm5-welcome-desc" className="mt-2 max-w-sm text-base leading-relaxed text-[#e4ded9]">
          Jelajahi menu kami dengan tampilan terbaik.
          {table ? <span className="mt-1 block text-sm text-[#cfc9c4]">Kamu sedang melihat menu untuk <strong className="text-white">{table}</strong>.</span> : null}
        </p>

        <div className="mt-6 flex w-full max-w-sm flex-col gap-2.5">
          <button type="button" className="gm5-btn-red min-h-12 w-full gap-2 px-5 text-base" disabled={busy} onClick={() => void finish(true)} autoFocus>
            <Maximize className="size-5" aria-hidden /> Masuk Fullscreen
          </button>
          <button type="button" className="gm5-btn-ghost min-h-12 w-full px-5 text-base" disabled={busy} onClick={() => void finish(false)}>
            Lanjutkan Tanpa Fullscreen
          </button>
          <label className="mt-1 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[color:var(--gm5-line)] bg-[#141214] px-4 text-left text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Volume2 className="size-5 text-[var(--menu-red-bright)]" aria-hidden />
              <span>
                Aktifkan Suara AYA <span className="font-normal text-[#cfc9c4]">(opsional)</span>
              </span>
            </span>
            <input type="checkbox" role="switch" className="gm5-switch" checked={voice} onChange={(event) => setVoice(event.target.checked)} />
          </label>
          {!supported ? (
            <p className="text-xs leading-snug text-[#cfc9c4]">
              Browser ini belum mendukung layar penuh — menu tetap tampil memenuhi layar. Untuk pengalaman terbaik, pilih “Tambahkan ke Layar Utama” dari menu browser.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Tombol keluar fullscreen (selalu terlihat saat fullscreen/imersif aktif). */
export function FullscreenExitV5() {
  const fullscreen = useFullscreenState();
  const [immersive, setImmersive] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setImmersive(root.getAttribute("data-gm5-immersive") === "true");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-gm5-immersive"] });
    return () => observer.disconnect();
  }, []);
  if (!fullscreen && !immersive) return null;
  return (
    <button
      type="button"
      className="gm5 fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-3 z-[93] inline-flex lg:bottom-4 lg:left-4 min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-[#141214]/90 px-3.5 text-sm font-semibold text-white shadow-lg backdrop-blur-sm hover:border-[var(--menu-red)]"
      onClick={() => {
        document.documentElement.removeAttribute("data-gm5-immersive");
        void exitFullscreen();
      }}
    >
      <Minimize className="size-4" aria-hidden /> {fullscreen ? "Keluar layar penuh" : "Tampilan biasa"}
    </button>
  );
}
