// Waiter notification utilities — vibrate, sound tone, browser notification.
// Preferences disimpan di localStorage supaya per-device (HP waiter A vs B).

const PREFS_KEY = "garage:waiter:notify-prefs";

export type WaiterNotifyPrefs = {
  sound: boolean;
  vibrate: boolean;
  browserNotif: boolean;
};

const DEFAULT_PREFS: WaiterNotifyPrefs = {
  sound: true,
  vibrate: true,
  browserNotif: true,
};

export function loadNotifyPrefs(): WaiterNotifyPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<WaiterNotifyPrefs>;
    return {
      sound: parsed.sound ?? DEFAULT_PREFS.sound,
      vibrate: parsed.vibrate ?? DEFAULT_PREFS.vibrate,
      browserNotif: parsed.browserNotif ?? DEFAULT_PREFS.browserNotif,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveNotifyPrefs(prefs: WaiterNotifyPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function reducedMotionPreferred(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function vibrate(pattern: number | number[] = [200, 80, 200]) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

// Dua-nada cepat (mirip bell waiter restoran): C5 → E5.
export function playReadyTone() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
    const now = ctx.currentTime;
    const notes: Array<[number, number]> = [
      [523.25, now],
      [659.25, now + 0.18],
    ];
    for (const [freq, start] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    }
  } catch {
    /* ignore */
  }
}

export async function requestBrowserNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "default";
  }
}

export function showBrowserNotify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    // Tab fokus — toast in-app sudah cukup, skip OS notif supaya tidak dobel.
    return;
  }
  try {
    new Notification(title, { body, tag: "garage-waiter-ready" });
  } catch {
    /* ignore */
  }
}

// Trigger gabungan saat order ready baru terdeteksi.
export function notifyOrderReady(
  prefs: WaiterNotifyPrefs,
  title: string,
  body: string,
) {
  if (prefs.sound) playReadyTone();
  if (prefs.vibrate) vibrate([220, 90, 220, 90, 320]);
  if (prefs.browserNotif) showBrowserNotify(title, body);
}
