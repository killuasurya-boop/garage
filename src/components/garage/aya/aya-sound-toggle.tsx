"use client";

// Tombol suara Aya (OD-04): customer nyala secara bawaan, staf mati secara bawaan; pilihan
// disimpan per perangkat. Teks Aya tetap tampil walau suara mati.
import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { ayaSoundDefaults, readAyaSound, subscribeAyaSound, writeAyaSound, type AyaAudienceSound } from "@/lib/aya-sound";

export function useAyaSound(audience: AyaAudienceSound) {
  return useSyncExternalStore(
    subscribeAyaSound,
    () => readAyaSound(audience),
    () => ayaSoundDefaults(audience),
  );
}

export function AyaSoundToggle({ audience }: { audience: AyaAudienceSound }) {
  const sound = useAyaSound(audience);
  const Icon = sound.enabled ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      onClick={() => writeAyaSound(audience, { ...sound, enabled: !sound.enabled })}
      aria-pressed={sound.enabled}
      className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-garage-dim transition-colors hover:bg-garage-bg-3 hover:text-white"
    >
      <Icon className="size-3.5" aria-hidden />
      Suara Aya: {sound.enabled ? "nyala" : "mati"}
    </button>
  );
}
