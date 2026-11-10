"use client";

import { useEffect, useState } from "react";
import { Play, TrainFront } from "lucide-react";

import { voice } from "@/lib/garage-voice";
import {
  getSoundTheme,
  setSoundTheme,
  SOUND_THEME_LABELS,
  STATION_CUE_LABELS,
  type SoundTheme,
  type StationCue,
} from "@/lib/station-sound-theme";

const PREVIEW_CUES: StationCue[] = ["new_bar", "new_dapur", "ready", "late", "stock_sent", "approved"];

/** Pilihan tema bunyi per perangkat + pratinjau tiap cue "Stasiun Kereta". */
export function SoundThemePicker() {
  const [theme, setTheme] = useState<SoundTheme>("classic");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferensi perangkat dari localStorage
    setTheme(getSoundTheme());
  }, []);

  function choose(next: SoundTheme) {
    setTheme(next);
    setSoundTheme(next);
    voice.unlock();
    if (next === "station") voice.playThemeCue("new_bar", true);
    else voice.playDing("soft", undefined, true);
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#f4f4f5]">
        <TrainFront className="size-4 text-[#ffb3b3]" aria-hidden /> Tema suara perangkat ini
      </div>
      <div role="radiogroup" aria-label="Tema suara" className="grid grid-cols-2 gap-2 sm:max-w-md">
        {(Object.keys(SOUND_THEME_LABELS) as SoundTheme[]).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => choose(value)}
            className={`h-10 rounded-md border text-[13px] font-semibold ${
              theme === value ? "border-[#d11a2a] bg-[#d11a2a]/18 text-white" : "border-[#4a4a54] bg-white/[0.045] text-[#c9c9cf]"
            }`}
          >
            {SOUND_THEME_LABELS[value]}
          </button>
        ))}
      </div>
      {theme === "station" ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {PREVIEW_CUES.map((cue) => (
            <button
              key={cue}
              type="button"
              onClick={() => {
                voice.unlock();
                voice.playThemeCue(cue, true);
              }}
              className="flex min-h-10 items-center gap-2 rounded-md border border-[#4a4a54] bg-white/[0.045] px-2.5 py-1.5 text-left text-[12px] text-[#e4e4e7] hover:bg-white/[0.08]"
            >
              <Play className="size-3.5 shrink-0 text-[#ffb3b3]" aria-hidden />
              {STATION_CUE_LABELS[cue]}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-[12px] text-[#9a9aa0]">
        Nada &quot;Stasiun Kereta&quot; ciptaan sendiri (lonceng peron, bel perlintasan, klakson) — bukan rekaman lagu stasiun.
      </p>
    </div>
  );
}
