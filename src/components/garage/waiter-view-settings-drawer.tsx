import { useEffect } from "react";
import {
  BellRing,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import type { WaiterNotifyPrefs } from "@/lib/waiter-notify";

export function SettingsDrawer({
  prefs,
  onToggleSound,
  onToggleVibe,
  onToggleNotif,
  onClose,
}: {
  prefs: WaiterNotifyPrefs;
  onToggleSound: () => void | Promise<void>;
  onToggleVibe: () => void;
  onToggleNotif: () => void | Promise<void>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  type Row = {
    label: string;
    desc: string;
    icon: typeof Volume2;
    activeIcon: typeof Volume2;
    on: boolean;
    onClick: () => void | Promise<void>;
  };
  const rows: Row[] = [
    {
      label: "Suara Notifikasi",
      desc: "Bunyi saat order siap antar.",
      icon: VolumeX,
      activeIcon: Volume2,
      on: prefs.sound,
      onClick: onToggleSound,
    },
    {
      label: "Getar",
      desc: "Getar HP saat order siap (jika didukung).",
      icon: VibrateOff,
      activeIcon: Vibrate,
      on: prefs.vibrate,
      onClick: onToggleVibe,
    },
    {
      label: "Notifikasi Browser",
      desc: "Tampil bahkan saat tab background.",
      icon: BellRing,
      activeIcon: BellRing,
      on: prefs.browserNotif,
      onClick: onToggleNotif,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan notifikasi"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-t-2xl border border-white/10 bg-[#0e0e10] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden />
        <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/55">Pengaturan</p>
            <p className="text-lg font-bold text-white">Notifikasi</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-md bg-white/[0.05] text-white/75 ring-1 ring-white/12 transition active:scale-[0.97]"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </header>
        <ul className="divide-y divide-white/6">
          {rows.map((row) => {
            const Icon = row.on ? row.activeIcon : row.icon;
            return (
              <li key={row.label}>
                <button
                  type="button"
                  onClick={() => void row.onClick()}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-white/[0.04]"
                >
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-lg ring-1 ${
                      row.on
                        ? "bg-[#22c55e]/15 text-[#bbf7d0] ring-[#22c55e]/35"
                        : "bg-white/[0.04] text-white/55 ring-white/12"
                    }`}
                  >
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-white">{row.label}</p>
                    <p className="text-[11px] text-white/55">{row.desc}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${
                      row.on
                        ? "bg-[#22c55e]/15 text-[#bbf7d0] ring-[#22c55e]/35"
                        : "bg-white/[0.04] text-white/55 ring-white/12"
                    }`}
                  >
                    {row.on ? "ON" : "OFF"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-4 py-3 text-[10px] text-white/45">
          Pengaturan tersimpan di perangkat ini.
        </div>
      </div>
    </div>
  );
}
