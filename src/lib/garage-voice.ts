// Garage Voice Notification System
// Sistem voice announcement gaya bandara untuk POS, KDS, dan operasional.
// Frontend-only (Web Speech API + WebAudio oscillator). Settings persist di localStorage.
//
// Pakai dari komponen:
//   import { voice } from "@/lib/garage-voice";
//   voice.unlock();                 // panggil sekali di user gesture
//   voice.announce("order_new", { customerName: "Surya", table: "12" });
//
// Voice channel:
//   - kasir   : female calm
//   - kitchen : firm (lower pitch)
//   - bar     : soft modern (slightly higher pitch)
//   - warning : short alert (lower pitch + alert ding)
//
// Smart Notification: file MP3 di /public/voice/scenarios (utama), fallback Edge/browser.

import {
  getScenarioAudioUrl,
  VOICE_SCENARIO_AUDIO_URLS,
  type VoiceScenarioWithAudio,
} from "@/lib/garage-voice-assets";

export type VoiceChannel = "kasir" | "kitchen" | "bar" | "warning" | "executive";

export type VoiceScenario =
  | "order_new"
  | "order_new_kitchen"
  | "order_new_bar"
  | "airport_qr"
  | "online_new"
  | "kitchen_cooking"
  | "bar_mixing"
  | "order_ready"
  | "order_ready_deliver"
  | "warning_printer"
  | "warning_lowstock"
  | "approval_pending"
  | "cash_anomaly"
  | "delivery_pickup"
  | "member_vip"
  | "audit_alert"
  | "waiter_call"
  | "waiter_bill_request"
  | "waiter_clear_table"
  | "waiter_reservation"
  | "waiter_refill"
  | "waiter_special_request"
  | "ai_alert_high"
  | "test_ceo"
  | "voice_command_ack"
  | "role_alert"
  | "staff_monitor"
  | "autopilot_alert"
  | "product_management_alert"
  | "finance_alert"
  | "membership_approval"
  | "owner_chat_ping";

export type DingKind = "soft" | "alert";

export type VoiceTtsProvider = "auto" | "browser" | "edge" | "elevenlabs" | "local";

/** @deprecated Use VoiceTtsProvider */
export type ExecutiveTtsProvider = VoiceTtsProvider;

export type VoiceSettings = {
  enabled: boolean;
  volume: number;
  rate: number;
  pitch: number;
  dingEnabled: boolean;
  voiceByChannel: Partial<Record<VoiceChannel, string>>;
  scenariosEnabled: Record<VoiceScenario, boolean>;
  /** Smart Notification Center (POS/KDS) — default file MP3 lokal di public. */
  smartTtsProvider: VoiceTtsProvider;
  /** CEO Brain — browser / Edge / ElevenLabs. */
  executiveTtsProvider: VoiceTtsProvider;
};

export type ExecutiveTtsStatus = {
  edge: {
    enabled: boolean;
    voice: string;
    rate: string;
    pitch: string;
    maxTextLength: number;
  };
  elevenlabs: {
    enabled: boolean;
    configured: boolean;
    voiceIdSet: boolean;
    modelId: string;
    maxTextLength: number;
  };
  maxTextLength: number;
  recommendedFree: "edge";
};

export type AnnouncePayload = {
  customerName?: string | null;
  table?: string | null;
  channel?: string | null;
  itemName?: string | null;
};

export type AnnounceOptions = AnnouncePayload & {
  dedupKey?: string;
  dingKind?: DingKind;
  force?: boolean;
};

export type VoiceRuntimeStatus = {
  supported: boolean;
  speechSupported: boolean;
  audioSupported: boolean;
  voicesLoaded: boolean;
  voiceCount: number;
  audioState: AudioContextState | "unavailable";
};

export type VoiceAnnouncementLog = {
  id: string;
  scenario: VoiceScenario;
  channel: VoiceChannel;
  text: string;
  at: string;
  dedupKey: string;
};

const STORAGE_KEY = "garage:voice:settings:v2";
const STORAGE_KEY_LEGACY = "garage:voice:settings:v1";
const COOLDOWN_MS = 3500;
const MAX_LOGS = 20;

const DEFAULT_SETTINGS: VoiceSettings = {
  enabled: true,
  volume: 0.85,
  rate: 1.05,
  pitch: 1.0,
  dingEnabled: true,
  voiceByChannel: {},
  scenariosEnabled: {
    order_new: true,
    order_new_kitchen: true,
    order_new_bar: true,
    airport_qr: true,
    online_new: true,
    kitchen_cooking: true,
    bar_mixing: true,
    order_ready: true,
    order_ready_deliver: true,
    warning_printer: true,
    warning_lowstock: true,
    approval_pending: true,
    cash_anomaly: true,
    delivery_pickup: true,
    member_vip: true,
    audit_alert: true,
    waiter_call: true,
    waiter_bill_request: true,
    waiter_clear_table: true,
    waiter_reservation: true,
    waiter_refill: true,
    waiter_special_request: true,
    ai_alert_high: true,
    test_ceo: true,
    voice_command_ack: true,
    role_alert: true,
    staff_monitor: true,
    autopilot_alert: true,
    product_management_alert: true,
    finance_alert: true,
    membership_approval: true,
    owner_chat_ping: true,
  },
  smartTtsProvider: "local",
  executiveTtsProvider: "auto",
};

export const VOICE_CHANNEL_LABEL: Record<VoiceChannel, string> = {
  kasir: "Kasir (ramah & jelas)",
  kitchen: "Dapur (ramah & tegas)",
  bar: "Bar (hangat & modern)",
  warning: "Peringatan (tegas & cepat)",
  executive: "CEO Assistant (ramah profesional)",
};

export const SCENARIO_META: Record<
  VoiceScenario,
  {
    label: string;
    channel: VoiceChannel;
    dingKind: DingKind;
    build: (p: AnnouncePayload) => string;
  }
> = {
  order_new: {
    label: "Konfirmasi POS (kasir input) — DEPRECATED",
    channel: "kasir",
    dingKind: "soft",
    // @deprecated Pakai order_new_kitchen / order_new_bar yang split berdasar
    // kategori item. Scenario ini dipertahankan supaya tidak breaking change
    // tapi tidak di-fire dari handler manapun.
    build: () =>
      `Pembayaran berhasil. Pesanan telah dikirim ke dapur dan bar.`,
  },
  order_new_kitchen: {
    label: "Order baru → Dapur (kasir input)",
    channel: "kitchen",
    dingKind: "soft",
    // Heads-up dapur saat kasir submit order yang punya item makanan/cemilan.
    // Pakai file MP3 statis (text tidak di-build dinamis).
    build: () => `Tim Dapur. Pesanan baru dari kasir telah masuk antrian.`,
  },
  order_new_bar: {
    label: "Order baru → Bar (kasir input)",
    channel: "bar",
    dingKind: "soft",
    // Heads-up bar saat kasir submit order yang punya item coffee/non-coffee.
    build: () => `Tim Bar. Pesanan minuman baru dari kasir telah masuk antrian.`,
  },
  airport_qr: {
    label: "QR masuk (airport)",
    channel: "kasir",
    dingKind: "soft",
    build: ({ customerName, table, channel }) => {
      const name = (customerName ?? "").trim();
      const t = normalizeTable(table);
      const c = normalizeChannel((channel ?? "").trim() || "QR meja");
      const target = t ? `${c} ${t}` : c;
      return name
        ? `Hai kasir, ${target} baru masuk, atas nama ${name}. Cek dan terima sekarang.`
        : `Hai kasir, ${target} baru masuk. Cek dan terima sekarang.`;
    },
  },
  online_new: {
    label: "Order online masuk",
    channel: "kasir",
    dingKind: "soft",
    build: ({ channel }) => {
      const c = normalizeChannel((channel ?? "").trim() || "platform online");
      return `Hai kasir, order online dari ${c} baru masuk. Segera cek ya.`;
    },
  },
  kitchen_cooking: {
    label: "Dapur memasak",
    channel: "kitchen",
    dingKind: "soft",
    build: ({ table }) => {
      const t = normalizeTable(table) || "meja";
      return `Tim dapur, ${t} mulai dimasak. Tetap on time ya.`;
    },
  },
  bar_mixing: {
    label: "Bar meracik",
    channel: "bar",
    dingKind: "soft",
    build: ({ table }) => {
      const t = normalizeTable(table) || "meja";
      return `Hai bar, minuman ${t} sedang diracik. Lanjutkan ya.`;
    },
  },
  order_ready: {
    label: "Pesanan selesai",
    channel: "kitchen",
    dingKind: "soft",
    build: ({ table }) => {
      const t = normalizeTable(table) || "meja";
      return `Hai semua, pesanan ${t} sudah siap. Bisa diantar.`;
    },
  },
  order_ready_deliver: {
    label: "Siap diantar",
    channel: "kitchen",
    dingKind: "soft",
    build: ({ table }) => {
      const t = normalizeTable(table) || "meja";
      return `Hai runner, pesanan ${t} siap antar. Ke meja sekarang ya.`;
    },
  },
  warning_printer: {
    label: "Printer error",
    channel: "warning",
    dingKind: "alert",
    build: () => `Kasir, printer belum nyambung. Cek kabel dan kertas sekarang.`,
  },
  warning_lowstock: {
    label: "Stok hampir habis",
    channel: "warning",
    dingKind: "alert",
    build: ({ itemName }) =>
      itemName
        ? `Tim gudang, stok ${itemName} hampir habis. Cek dan isi ulang ya.`
        : `Tim gudang, ada stok hampir habis. Cek dan isi ulang ya.`,
  },
  approval_pending: {
    label: "Approval menunggu",
    channel: "warning",
    dingKind: "alert",
    build: ({ itemName, customerName }) => {
      const subject = (itemName ?? "").trim() || "request approval";
      const by = (customerName ?? "").trim();
      return by
        ? `Manager, ada ${subject} dari ${by} menunggu persetujuan. Cek sekarang ya.`
        : `Manager, ada ${subject} menunggu persetujuan. Cek sekarang ya.`;
    },
  },
  cash_anomaly: {
    label: "Selisih kas",
    channel: "warning",
    dingKind: "alert",
    build: ({ itemName }) => {
      const detail = (itemName ?? "").trim();
      return detail
        ? `Manager, ada selisih kas ${detail} saat tutup. Mohon verifikasi sekarang.`
        : `Manager, ada selisih kas saat tutup. Mohon verifikasi sekarang.`;
    },
  },
  delivery_pickup: {
    label: "Driver pickup",
    channel: "kasir",
    dingKind: "soft",
    build: ({ channel, customerName }) => {
      const c = normalizeChannel((channel ?? "").trim() || "Delivery");
      const name = (customerName ?? "").trim();
      return name
        ? `Hai kasir, driver ${c} sudah datang menjemput pesanan ${name}. Serahkan sekarang ya.`
        : `Hai kasir, driver ${c} sudah datang menjemput pesanan. Serahkan sekarang ya.`;
    },
  },
  member_vip: {
    label: "Member VIP datang",
    channel: "kasir",
    dingKind: "soft",
    build: ({ customerName, table }) => {
      const name = (customerName ?? "").trim() || "member VIP";
      const t = normalizeTable(table);
      return t
        ? `Hai tim, ${name} member VIP baru tiba di ${t}. Sambut dan utamakan ya.`
        : `Hai tim, ${name} member VIP baru tiba. Sambut dan utamakan ya.`;
    },
  },
  audit_alert: {
    label: "Audit anomali",
    channel: "warning",
    dingKind: "alert",
    build: ({ itemName }) => {
      const detail = (itemName ?? "").trim();
      return detail
        ? `Owner, audit mendeteksi anomali: ${detail}. Mohon ditinjau segera.`
        : `Owner, audit mendeteksi anomali transaksi. Mohon ditinjau segera.`;
    },
  },
  waiter_call: {
    label: "Waiter dipanggil",
    channel: "kasir",
    dingKind: "soft",
    build: () =>
      `Perhatian Waiter. Pelanggan di meja memerlukan bantuan. Mohon segera dilayani.`,
  },
  waiter_bill_request: {
    label: "Permintaan tagihan",
    channel: "kasir",
    dingKind: "soft",
    build: () =>
      `Perhatian Waiter. Pelanggan meminta tagihan. Mohon segera diantarkan ke meja.`,
  },
  waiter_clear_table: {
    label: "Meja perlu dibersihkan",
    channel: "kasir",
    dingKind: "soft",
    build: () =>
      `Perhatian Waiter. Meja perlu segera dibersihkan dan disiapkan kembali untuk pelanggan berikutnya.`,
  },
  waiter_reservation: {
    label: "Reservasi tiba",
    channel: "kasir",
    dingKind: "soft",
    build: () =>
      `Perhatian Waiter. Tamu reservasi telah tiba. Mohon segera disambut dan diantar ke meja.`,
  },
  waiter_refill: {
    label: "Permintaan refill",
    channel: "kasir",
    dingKind: "soft",
    build: () =>
      `Perhatian Waiter. Pelanggan meminta refill atau tambahan pesanan ringan. Mohon segera dilayani.`,
  },
  waiter_special_request: {
    label: "Permintaan khusus",
    channel: "kasir",
    dingKind: "soft",
    build: () =>
      `Perhatian Waiter. Terdapat permintaan khusus dari pelanggan. Mohon segera dikoordinasikan dengan dapur.`,
  },
  ai_alert_high: {
    label: "AI alert prioritas tinggi",
    channel: "warning",
    dingKind: "alert",
    build: () =>
      `Perhatian. Terdapat tugas prioritas tinggi yang memerlukan tindakan segera.`,
  },
  test_ceo: {
    label: "Tes suara CEO",
    channel: "executive",
    dingKind: "soft",
    build: () =>
      `Perhatian. Ini adalah tes suara Asisten Eksekutif Garage Coffee and Motor.`,
  },
  voice_command_ack: {
    label: "Konfirmasi voice command",
    channel: "executive",
    dingKind: "soft",
    build: () => `Perintah diterima.`,
  },
  role_alert: {
    label: "Alert proaktif role",
    channel: "warning",
    dingKind: "alert",
    build: () => `Perhatian. Terdapat alert proaktif yang memerlukan perhatian Anda.`,
  },
  staff_monitor: {
    label: "Staff monitor status",
    channel: "executive",
    dingKind: "soft",
    build: () => `Perhatian. Update status staff monitor.`,
  },
  autopilot_alert: {
    label: "Autopilot alert",
    channel: "warning",
    dingKind: "alert",
    build: () => `Perhatian. Autopilot alert membutuhkan tindakan Anda.`,
  },
  product_management_alert: {
    label: "Produk manajemen",
    channel: "executive",
    dingKind: "soft",
    build: ({ itemName }) =>
      itemName
        ? `Pak Owner, perubahan pada produk ${itemName} memerlukan perhatian Anda.`
        : `Pak Owner, ada perubahan pada produk yang memerlukan perhatian Anda.`,
  },
  finance_alert: {
    label: "Finance alert",
    channel: "executive",
    dingKind: "alert",
    build: () => `Pak Owner, ada notifikasi finance yang membutuhkan keputusan Anda.`,
  },
  membership_approval: {
    label: "Approval membership",
    channel: "executive",
    dingKind: "soft",
    build: () => `Pak Owner, ada pengajuan membership baru menunggu persetujuan.`,
  },
  owner_chat_ping: {
    label: "Chat owner → karyawan",
    channel: "executive",
    dingKind: "soft",
    build: ({ customerName }) =>
      customerName
        ? `Pesan dari Owner untuk ${customerName}. Mohon segera dicek.`
        : `Pesan dari Owner. Mohon segera dicek di chat internal.`,
  },
};

export const SCENARIO_ORDER: VoiceScenario[] = [
  "order_new_kitchen",
  "order_new_bar",
  "airport_qr",
  "online_new",
  "kitchen_cooking",
  "bar_mixing",
  "order_ready",
  "order_ready_deliver",
  "delivery_pickup",
  "waiter_call",
  "waiter_bill_request",
  "waiter_clear_table",
  "waiter_reservation",
  "waiter_refill",
  "waiter_special_request",
  "member_vip",
  "approval_pending",
  "cash_anomaly",
  "audit_alert",
  "warning_printer",
  "warning_lowstock",
  "ai_alert_high",
  "role_alert",
  "autopilot_alert",
  "staff_monitor",
  "voice_command_ack",
  "product_management_alert",
  "finance_alert",
  "membership_approval",
  "owner_chat_ping",
  "test_ceo",
];

function normalizeTable(t?: string | null): string {
  if (!t) return "";
  const trimmed = String(t).trim();
  if (!trimmed) return "";
  if (/^meja\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^meja\s*/i, "").trim();
    return rest ? `meja ${rest}` : "meja";
  }
  if (/^\d+$/.test(trimmed)) return `meja ${trimmed}`;
  return trimmed;
}

function normalizeChannel(c: string): string {
  const lower = c.toLowerCase();
  if (lower.includes("gofood")) return "GoFood";
  if (lower.includes("grabfood")) return "GrabFood";
  if (lower.includes("shopeefood") || lower.includes("shopee")) return "ShopeeFood";
  if (lower.includes("qr_table") || lower === "qr") return "QR meja";
  if (lower.includes("qr_takeaway")) return "QR takeaway";
  if (lower.includes("whatsapp")) return "WhatsApp";
  if (lower.includes("instagram")) return "Instagram";
  if (lower.includes("delivery")) return "Delivery";
  return c;
}

export function isOnlineChannel(channel: string | null | undefined): boolean {
  if (!channel) return false;
  const lower = String(channel).toLowerCase();
  return (
    lower.includes("gofood") ||
    lower.includes("grabfood") ||
    lower.includes("shopee") ||
    lower.includes("qr_table") ||
    lower.includes("qr_takeaway") ||
    lower.includes("delivery") ||
    lower.includes("online") ||
    lower.includes("whatsapp") ||
    lower.includes("instagram") ||
    lower === "qr"
  );
}

type WebAudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

let _settings: VoiceSettings | null = null;
let _audioCtx: AudioContext | null = null;
let _voicesCache: SpeechSynthesisVoice[] = [];
let _voicesLoaded = false;
let _queue: Promise<void> = Promise.resolve();
let _executiveQueue: Promise<void> = Promise.resolve();
let _executiveTtsStatusCache: ExecutiveTtsStatus | null = null;
let _executiveTtsStatusPromise: Promise<ExecutiveTtsStatus | null> | null = null;
let _currentExecutiveAudio: HTMLAudioElement | null = null;
let _currentAnnouncementAudio: HTMLAudioElement | null = null;
const _localAudioAvailability = new Map<string, boolean>();
const _cooldownMap = new Map<string, number>();
const _settingsListeners = new Set<(s: VoiceSettings) => void>();
const _voiceListListeners = new Set<(v: SpeechSynthesisVoice[]) => void>();
const _logListeners = new Set<(logs: VoiceAnnouncementLog[]) => void>();
let _announcementLogs: VoiceAnnouncementLog[] = [];

function readSettingsFromStorage(): VoiceSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(STORAGE_KEY_LEGACY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      voiceByChannel: {
        ...DEFAULT_SETTINGS.voiceByChannel,
        ...(parsed.voiceByChannel ?? {}),
      },
      scenariosEnabled: {
        ...DEFAULT_SETTINGS.scenariosEnabled,
        ...(parsed.scenariosEnabled ?? {}),
      },
      smartTtsProvider:
        parsed.smartTtsProvider ?? DEFAULT_SETTINGS.smartTtsProvider,
      executiveTtsProvider:
        parsed.executiveTtsProvider ?? DEFAULT_SETTINGS.executiveTtsProvider,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function getVoiceSettings(): VoiceSettings {
  if (!_settings) _settings = readSettingsFromStorage();
  return _settings;
}

export function updateVoiceSettings(patch: Partial<VoiceSettings>): VoiceSettings {
  const current = getVoiceSettings();
  const next: VoiceSettings = {
    ...current,
    ...patch,
    voiceByChannel: {
      ...current.voiceByChannel,
      ...(patch.voiceByChannel ?? {}),
    },
    scenariosEnabled: {
      ...current.scenariosEnabled,
      ...(patch.scenariosEnabled ?? {}),
    },
    smartTtsProvider: patch.smartTtsProvider ?? current.smartTtsProvider,
    executiveTtsProvider:
      patch.executiveTtsProvider ?? current.executiveTtsProvider,
  };
  _settings = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage gak available (private mode) — skip persist
    }
  }
  for (const cb of _settingsListeners) {
    try {
      cb(next);
    } catch {
      // ignore listener error
    }
  }
  return next;
}

export function subscribeVoiceSettings(cb: (s: VoiceSettings) => void): () => void {
  _settingsListeners.add(cb);
  return () => {
    _settingsListeners.delete(cb);
  };
}

export function listAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    _voicesCache = voices;
    _voicesLoaded = true;
  }
  return _voicesCache;
}

export function subscribeVoiceList(
  cb: (voices: SpeechSynthesisVoice[]) => void,
): () => void {
  _voiceListListeners.add(cb);
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    if (!_voicesLoaded) {
      const handler = () => {
        listAvailableVoices();
        for (const listener of _voiceListListeners) {
          try {
            listener(_voicesCache);
          } catch {
            /* ignore */
          }
        }
      };
      window.speechSynthesis.addEventListener?.("voiceschanged", handler, {
        once: true,
      });
      // First read attempt
      listAvailableVoices();
    } else {
      // Already loaded — fire immediately
      try {
        cb(_voicesCache);
      } catch {
        /* ignore */
      }
    }
  }
  return () => {
    _voiceListListeners.delete(cb);
  };
}

function emitAnnouncementLogs() {
  for (const cb of _logListeners) {
    try {
      cb(_announcementLogs);
    } catch {
      /* ignore */
    }
  }
}

export function listAnnouncementLogs(): VoiceAnnouncementLog[] {
  return _announcementLogs;
}

export function subscribeAnnouncementLogs(
  cb: (logs: VoiceAnnouncementLog[]) => void,
): () => void {
  _logListeners.add(cb);
  try {
    cb(_announcementLogs);
  } catch {
    /* ignore */
  }
  return () => {
    _logListeners.delete(cb);
  };
}

export function clearAnnouncementLogs(): void {
  _announcementLogs = [];
  emitAnnouncementLogs();
}

function pushAnnouncementLog(entry: Omit<VoiceAnnouncementLog, "id" | "at">) {
  _announcementLogs = [
    {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
    },
    ..._announcementLogs,
  ].slice(0, MAX_LOGS);
  emitAnnouncementLogs();
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as WebAudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  if (!_audioCtx || _audioCtx.state === "closed") {
    _audioCtx = new Ctor();
  }
  if (_audioCtx.state === "suspended") {
    void _audioCtx.resume();
  }
  return _audioCtx;
}

export function getVoiceRuntimeStatus(): VoiceRuntimeStatus {
  if (typeof window === "undefined") {
    return {
      supported: false,
      speechSupported: false,
      audioSupported: false,
      voicesLoaded: false,
      voiceCount: 0,
      audioState: "unavailable",
    };
  }
  const w = window as WebAudioWindow;
  const speechSupported = "speechSynthesis" in window;
  const audioSupported = Boolean(w.AudioContext ?? w.webkitAudioContext);
  const voices = speechSupported ? listAvailableVoices() : [];
  return {
    supported: speechSupported || audioSupported,
    speechSupported,
    audioSupported,
    voicesLoaded: _voicesLoaded || voices.length > 0,
    voiceCount: voices.length,
    audioState: _audioCtx?.state ?? "unavailable",
  };
}

export function unlockVoice(): boolean {
  if (typeof window === "undefined") return false;
  ensureAudioContext();
  if ("speechSynthesis" in window) {
    try {
      // Silent utterance to unlock TTS engine on some browsers
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
    // Prime voice list
    listAvailableVoices();
  }
  return true;
}

function stopAnnouncementAudioPlayback() {
  if (!_currentAnnouncementAudio) return;
  try {
    _currentAnnouncementAudio.pause();
    _currentAnnouncementAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
  _currentAnnouncementAudio = null;
}

export function stopAllVoice() {
  if (typeof window === "undefined") return;
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  stopExecutiveAudioPlayback();
  stopAnnouncementAudioPlayback();
  _queue = Promise.resolve();
  _executiveQueue = Promise.resolve();
}

export function resetCooldown(): void {
  _cooldownMap.clear();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function playDing(
  kind: DingKind = "soft",
  volumeOverride?: number,
  force = false,
): void {
  const settings = getVoiceSettings();
  if ((!settings.enabled && !force) || !settings.dingEnabled) return;
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state === "closed") return;
  try {
    const startAt = ctx.currentTime;
    const gain = ctx.createGain();
    const oscillator = ctx.createOscillator();
    const peakVol = clamp(
      (volumeOverride ?? settings.volume) * (kind === "alert" ? 0.2 : 0.22),
      0.0001,
      0.5,
    );
    if (kind === "soft") {
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(1320, startAt + 0.12);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peakVol, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.36);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.4);
    } else {
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(440, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peakVol, startAt + 0.02);
      gain.gain.setValueAtTime(peakVol, startAt + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2);
      gain.gain.exponentialRampToValueAtTime(peakVol, startAt + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.5);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.55);
    }
  } catch {
    /* ignore */
  }
}

function isIndonesianVoice(voice: SpeechSynthesisVoice) {
  const lang = voice.lang?.toLowerCase() ?? "";
  const name = voice.name.toLowerCase();
  return (
    lang.startsWith("id") ||
    name.includes("indonesia") ||
    name.includes("gadis") ||
    name.includes("damayanti")
  );
}

function isEnglishOnlyVoice(voice: SpeechSynthesisVoice) {
  const lang = voice.lang?.toLowerCase() ?? "";
  const name = voice.name.toLowerCase();
  if (lang.startsWith("id")) return false;
  if (isIndonesianVoice(voice)) return false;
  return (
    lang.startsWith("en") ||
    /zira|david|mark|aria neural|google us|microsoft.*english/i.test(name)
  );
}

function isLikelyFemaleVoice(voice: SpeechSynthesisVoice) {
  return /gadis|damayanti|female|woman|wanita|zira|aria|susan|sari|putri|ayu/i.test(
    voice.name,
  );
}

function pickVoiceForChannel(channel: VoiceChannel): SpeechSynthesisVoice | null {
  const voices = listAvailableVoices();
  if (!voices.length) return null;
  const settings = getVoiceSettings();
  const desiredKey = settings.voiceByChannel[channel];
  if (desiredKey) {
    const found = voices.find(
      (v) => v.voiceURI === desiredKey || v.name === desiredKey,
    );
    if (found && isIndonesianVoice(found) && !isEnglishOnlyVoice(found)) {
      return found;
    }
  }
  const idCandidates = voices.filter(
    (voice) => isIndonesianVoice(voice) && !isEnglishOnlyVoice(voice),
  );
  const femaleIdVoice = idCandidates.find((voice) => isLikelyFemaleVoice(voice));
  if (femaleIdVoice) return femaleIdVoice;
  if (idCandidates[0]) return idCandidates[0];
  const gadis = voices.find((v) => /gadis|damayanti/i.test(v.name));
  if (gadis) return gadis;
  return null;
}

function channelPitchOffset(channel: VoiceChannel): number {
  switch (channel) {
    case "kitchen":
      return 0.98;
    case "bar":
      return 1.06;
    case "warning":
      return 0.95;
    case "kasir":
      return 1.08;
    case "executive":
      return 1.02;
    default:
      return 1.0;
  }
}

function channelRateOffset(channel: VoiceChannel): number {
  switch (channel) {
    case "warning":
      return 1.06;
    case "kasir":
    case "bar":
      return 1.04;
    case "executive":
      return 0.98;
    case "kitchen":
      return 1.02;
    default:
      return 1.0;
  }
}

function speakText(
  text: string,
  channel: VoiceChannel,
  force = false,
): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return Promise.resolve();
  const settings = getVoiceSettings();
  if (!settings.enabled && !force) return Promise.resolve();
  const selected = pickVoiceForChannel(channel);
  // Guard: jangan pernah pakai voice English (David/Mark/Zira) untuk membaca
  // Bahasa Indonesia. Kalau Windows belum punya voice ID, lebih baik silent
  // daripada terdengar robot Inggris. Server-side Edge TTS yang harus jalan.
  if (!selected) return Promise.resolve();
  return new Promise<void>((resolve) => {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.voice = selected;
      utter.lang = selected.lang?.toLowerCase().startsWith("id")
        ? selected.lang
        : "id-ID";
      utter.volume = clamp(settings.volume, 0, 1);
      utter.rate = clamp(settings.rate * channelRateOffset(channel), 0.5, 1.5);
      utter.pitch = clamp(settings.pitch * channelPitchOffset(channel), 0.5, 2.0);
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      utter.onend = done;
      utter.onerror = done;
      // Safety timeout: kalau TTS engine hang, jangan blokir queue
      const estMs = Math.max(2000, text.length * 95);
      window.setTimeout(done, estMs + 2500);
      window.speechSynthesis.speak(utter);
    } catch {
      resolve();
    }
  });
}

function checkAndUpdateCooldown(key: string): boolean {
  if (!key) return true;
  const now = Date.now();
  const last = _cooldownMap.get(key) ?? 0;
  if (now - last < COOLDOWN_MS) return false;
  _cooldownMap.set(key, now);
  if (_cooldownMap.size > 200) {
    for (const [k, t] of _cooldownMap) {
      if (now - t > COOLDOWN_MS * 10) _cooldownMap.delete(k);
    }
  }
  return true;
}

export function announce(
  scenario: VoiceScenario,
  opts: AnnounceOptions = {},
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const settings = getVoiceSettings();
  if (!settings.enabled && !opts.force) return Promise.resolve();
  if (!opts.force && settings.scenariosEnabled[scenario] === false)
    return Promise.resolve();

  const dedup = opts.dedupKey
    ? `${scenario}:${opts.dedupKey}`
    : `${scenario}:${opts.table ?? ""}:${opts.customerName ?? ""}:${opts.channel ?? ""}:${opts.itemName ?? ""}`;
  if (!checkAndUpdateCooldown(dedup)) return Promise.resolve();

  const meta = SCENARIO_META[scenario];
  const text = meta.build(opts);
  const dingKind: DingKind = opts.dingKind ?? meta.dingKind;
  pushAnnouncementLog({
    scenario,
    channel: meta.channel,
    text,
    dedupKey: dedup,
  });

  _queue = _queue.then(async () => {
    try {
      // Resume audio context tiap announce — browser bisa suspend setelah idle/lock.
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* ignore */
        }
      }
      // Chrome quirk: kalau speechSynthesis paused (idle terlalu lama), wake up dulu.
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        } catch {
          /* ignore */
        }
      }
      playDing(dingKind, undefined, opts.force);
      await new Promise<void>((r) => window.setTimeout(r, 260));
      await speakChannelText(scenario, text, meta.channel, opts.force);
      // gap kecil antar announcement supaya tidak menumpuk
      await new Promise<void>((r) => window.setTimeout(r, 120));
    } catch {
      /* ignore */
    }
  });
  return _queue;
}

export function previewScenario(scenario: VoiceScenario): Promise<void> {
  return announce(scenario, {
    force: true,
    customerName: "Surya",
    table: "12",
    channel: "GoFood",
    itemName: "kopi susu",
    dedupKey: `preview:${Date.now()}`,
  });
}

export function invalidateExecutiveTtsStatusCache() {
  _executiveTtsStatusCache = null;
  _executiveTtsStatusPromise = null;
}

/** @deprecated Use invalidateExecutiveTtsStatusCache */
export function invalidateElevenLabsStatusCache() {
  invalidateExecutiveTtsStatusCache();
}

export async function fetchExecutiveTtsStatus(): Promise<ExecutiveTtsStatus | null> {
  if (typeof window === "undefined") return null;
  if (_executiveTtsStatusCache) return _executiveTtsStatusCache;
  if (_executiveTtsStatusPromise) return _executiveTtsStatusPromise;

  _executiveTtsStatusPromise = (async () => {
    try {
      const response = await fetch("/api/ai/tts/status", {
        credentials: "same-origin",
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { data?: ExecutiveTtsStatus };
      const data = payload.data ?? null;
      if (data) _executiveTtsStatusCache = data;
      return data;
    } catch {
      return null;
    } finally {
      _executiveTtsStatusPromise = null;
    }
  })();

  return _executiveTtsStatusPromise;
}

/** @deprecated Use fetchExecutiveTtsStatus */
export async function fetchElevenLabsTtsStatus(): Promise<ExecutiveTtsStatus | null> {
  return fetchExecutiveTtsStatus();
}

function stopExecutiveAudioPlayback() {
  if (!_currentExecutiveAudio) return;
  try {
    _currentExecutiveAudio.pause();
    _currentExecutiveAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
  _currentExecutiveAudio = null;
}

async function playServerGarageSpeech(
  text: string,
  channel: VoiceChannel,
  provider: VoiceTtsProvider,
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const response = await fetch("/api/ai/tts", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, channel, provider }),
  });

  if (!response.ok) return false;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("audio")) return false;

  const blob = await response.blob();
  const settings = getVoiceSettings();
  const url = URL.createObjectURL(blob);

  return new Promise<boolean>((resolve) => {
    const audio = new Audio(url);
    _currentExecutiveAudio = audio;
    audio.volume = clamp(settings.volume, 0, 1);

    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      if (_currentExecutiveAudio === audio) _currentExecutiveAudio = null;
      resolve(ok);
    };

    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    const estMs = Math.max(4000, text.length * 85);
    window.setTimeout(() => finish(true), estMs + 4000);

    void audio.play().then(() => undefined).catch(() => finish(false));
  });
}

function scenarioHasLocalAudio(scenario: VoiceScenario): scenario is VoiceScenarioWithAudio {
  return scenario in VOICE_SCENARIO_AUDIO_URLS;
}

async function probeLocalAudio(url: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const cached = _localAudioAvailability.get(url);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch(url, { method: "HEAD" });
    const ok = response.ok;
    _localAudioAvailability.set(url, ok);
    return ok;
  } catch {
    _localAudioAvailability.set(url, false);
    return false;
  }
}

async function playLocalScenarioAudio(
  scenario: VoiceScenario,
  volume: number,
): Promise<boolean> {
  if (typeof window === "undefined" || !scenarioHasLocalAudio(scenario)) {
    return false;
  }

  const url = getScenarioAudioUrl(scenario);
  if (!(await probeLocalAudio(url))) return false;

  return new Promise<boolean>((resolve) => {
    const audio = new Audio(url);
    _currentAnnouncementAudio = audio;
    audio.volume = clamp(volume, 0, 1);
    audio.preload = "auto";

    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (_currentAnnouncementAudio === audio) _currentAnnouncementAudio = null;
      resolve(ok);
    };

    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    window.setTimeout(() => finish(true), 12000);

    void audio.play().then(() => undefined).catch(() => finish(false));
  });
}

async function shouldUseServerTts(provider: VoiceTtsProvider): Promise<boolean> {
  if (provider === "browser" || provider === "local") return false;
  if (provider === "edge" || provider === "elevenlabs") return true;
  const status = await fetchExecutiveTtsStatus();
  return Boolean(status?.edge.enabled || status?.elevenlabs.enabled);
}

async function speakChannelText(
  scenario: VoiceScenario,
  text: string,
  channel: VoiceChannel,
  force = false,
): Promise<void> {
  const settings = getVoiceSettings();
  const provider = settings.smartTtsProvider;

  if (provider === "local" || provider === "auto") {
    const playedLocal = await playLocalScenarioAudio(scenario, settings.volume);
    if (playedLocal) return;
    if (provider === "local") {
      await speakText(text, channel, force);
      return;
    }
  }

  if (await shouldUseServerTts(provider)) {
    const played = await playServerGarageSpeech(text, channel, provider);
    if (played) return;
  }

  await speakText(text, channel, force);
}

async function speakExecutiveInternal(text: string): Promise<void> {
  try {
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }

    const settings = getVoiceSettings();
    if (await shouldUseServerTts(settings.executiveTtsProvider)) {
      const played = await playServerGarageSpeech(
        text,
        "executive",
        settings.executiveTtsProvider,
      );
      if (played) return;
    }

    await speakText(text, "executive", true);
  } catch {
    await speakText(text, "executive", true);
  }
}

/** Executive / CEO Brain TTS — announcer wanita Indonesia (ElevenLabs atau browser). */
export function speakExecutive(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return Promise.resolve();
  }

  _executiveQueue = _executiveQueue.then(() => speakExecutiveInternal(trimmed));
  return _executiveQueue;
}

export const voice = {
  unlock: unlockVoice,
  announce,
  speakExecutive,
  fetchExecutiveTtsStatus,
  invalidateExecutiveTtsStatus: invalidateExecutiveTtsStatusCache,
  fetchElevenLabsStatus: fetchExecutiveTtsStatus,
  invalidateElevenLabsStatus: invalidateExecutiveTtsStatusCache,
  preview: previewScenario,
  playDing,
  stop: stopAllVoice,
  resetCooldown,
  getSettings: getVoiceSettings,
  updateSettings: updateVoiceSettings,
  subscribe: subscribeVoiceSettings,
  listVoices: listAvailableVoices,
  subscribeVoices: subscribeVoiceList,
  runtimeStatus: getVoiceRuntimeStatus,
  listLogs: listAnnouncementLogs,
  subscribeLogs: subscribeAnnouncementLogs,
  clearLogs: clearAnnouncementLogs,
};

export type VoiceApi = typeof voice;
