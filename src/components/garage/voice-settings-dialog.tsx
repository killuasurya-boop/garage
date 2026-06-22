"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  BellOff,
  CheckCircle2,
  ClipboardList,
  Mic,
  MicOff,
  PlayCircle,
  RotateCcw,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  SCENARIO_META,
  SCENARIO_ORDER,
  VOICE_CHANNEL_LABEL,
  type ExecutiveTtsStatus,
  type VoiceTtsProvider,
  type VoiceAnnouncementLog,
  type VoiceChannel,
  type VoiceRuntimeStatus,
  type VoiceScenario,
  type VoiceSettings,
  voice,
} from "@/lib/garage-voice";

const CHANNEL_ORDER: VoiceChannel[] = ["kasir", "kitchen", "bar", "warning", "executive"];
const TRIGGER_CHECKLIST: Array<{
  title: string;
  detail: string;
  scenario: VoiceScenario;
}> = [
  {
    title: "POS → Dapur",
    detail: "Kasir input order makanan/cemilan, heads-up ke dapur.",
    scenario: "order_new_kitchen",
  },
  {
    title: "POS → Bar",
    detail: "Kasir input order coffee/non-coffee, heads-up ke bar.",
    scenario: "order_new_bar",
  },
  {
    title: "QR meja masuk",
    detail: "Customer submit dari /order?source=qr_table.",
    scenario: "online_new",
  },
  {
    title: "Dapur cooking",
    detail: "Food ticket queue ke cooking.",
    scenario: "kitchen_cooking",
  },
  {
    title: "Bar mixing",
    detail: "Bar ticket queue ke cooking.",
    scenario: "bar_mixing",
  },
  {
    title: "Order ready",
    detail: "Ticket cooking ke ready.",
    scenario: "order_ready",
  },
  {
    title: "Runner delivery",
    detail: "Ticket ready ke delivered.",
    scenario: "order_ready_deliver",
  },
  {
    title: "Printer warning",
    detail: "Print struk atau test printer gagal.",
    scenario: "warning_printer",
  },
  {
    title: "Low stock",
    detail: "SKU inventory baru berubah ke low.",
    scenario: "warning_lowstock",
  },
  {
    title: "Driver pickup",
    detail: "GoFood/Grab/Shopee driver datang ambil pesanan.",
    scenario: "delivery_pickup",
  },
  {
    title: "Member VIP datang",
    detail: "Member VIP/loyalty tier tinggi check-in di meja.",
    scenario: "member_vip",
  },
  {
    title: "Approval pending",
    detail: "Refund / void / diskon menunggu persetujuan Manager.",
    scenario: "approval_pending",
  },
  {
    title: "Cash anomaly",
    detail: "Selisih kas saat tutup shift / setoran.",
    scenario: "cash_anomaly",
  },
  {
    title: "Audit alert",
    detail: "Void berlebih / diskon ekstrem / pola transaksi anomali.",
    scenario: "audit_alert",
  },
  {
    title: "Waiter dipanggil",
    detail: "Pelanggan di meja memanggil waiter via bell / tombol.",
    scenario: "waiter_call",
  },
  {
    title: "Permintaan tagihan",
    detail: "Pelanggan minta bill dibawa ke meja.",
    scenario: "waiter_bill_request",
  },
  {
    title: "Meja perlu dibersihkan",
    detail: "Pelanggan pulang, meja siap di-bus untuk tamu berikut.",
    scenario: "waiter_clear_table",
  },
  {
    title: "Reservasi tiba",
    detail: "Tamu reservasi datang, perlu disambut dan diantar.",
    scenario: "waiter_reservation",
  },
  {
    title: "Permintaan refill",
    detail: "Pelanggan minta refill air / pesanan tambahan ringan.",
    scenario: "waiter_refill",
  },
  {
    title: "Permintaan khusus",
    detail: "Pesanan khusus dari pelanggan (allergen, modifikasi).",
    scenario: "waiter_special_request",
  },
  {
    title: "AI alert tinggi",
    detail: "Alert priority tinggi dari AI Alerts Bell.",
    scenario: "ai_alert_high",
  },
  {
    title: "Alert proaktif role",
    detail: "AI assistant memberi alert proaktif ke role aktif.",
    scenario: "role_alert",
  },
  {
    title: "Autopilot alert",
    detail: "Klik card autopilot alert di dashboard.",
    scenario: "autopilot_alert",
  },
  {
    title: "Staff monitor status",
    detail: "Update status staff monitor (critical / watch / ready).",
    scenario: "staff_monitor",
  },
  {
    title: "Konfirmasi voice command",
    detail: "AI mengakui perintah voice diterima.",
    scenario: "voice_command_ack",
  },
  {
    title: "Tes suara CEO",
    detail: "Tombol Tes CEO di dialog ini.",
    scenario: "test_ceo",
  },
];

type VoiceSettingsDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render konten tanpa wrapper Dialog (untuk dipasang langsung di module page). */
  embedded?: boolean;
};

export function VoiceSettingsDialog({
  open = false,
  onOpenChange = () => undefined,
  embedded = false,
}: VoiceSettingsDialogProps) {
  const [settings, setSettings] = useState<VoiceSettings>(() => voice.getSettings());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => voice.listVoices());
  const [logs, setLogs] = useState<VoiceAnnouncementLog[]>(() => voice.listLogs());
  const [runtime, setRuntime] = useState<VoiceRuntimeStatus>(() =>
    voice.runtimeStatus(),
  );
  const [testAllRunning, setTestAllRunning] = useState(false);
  const [executiveTtsStatus, setExecutiveTtsStatus] = useState<ExecutiveTtsStatus | null>(
    null,
  );
  const [executiveTestRunning, setExecutiveTestRunning] = useState(false);
  const supportsTts =
    typeof window !== "undefined" ? "speechSynthesis" in window : true;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsubSettings = voice.subscribe(setSettings);
    const unsubVoices = voice.subscribeVoices(setVoices);
    const unsubLogs = voice.subscribeLogs(setLogs);
    const refreshRuntime = () => setRuntime(voice.runtimeStatus());
    refreshRuntime();
    const intervalId = window.setInterval(refreshRuntime, 1500);
    return () => {
      unsubSettings();
      unsubVoices();
      unsubLogs();
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!open && !embedded) return;
    voice.unlock();
    const timeoutId = window.setTimeout(() => {
      setRuntime(voice.runtimeStatus());
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [open, embedded]);

  useEffect(() => {
    if (!open && !embedded) return;
    voice.invalidateExecutiveTtsStatus();
    void voice.fetchExecutiveTtsStatus().then(setExecutiveTtsStatus);
  }, [open, embedded]);

  const idVoices = useMemo(
    () => voices.filter((v) => v.lang?.toLowerCase().startsWith("id")),
    [voices],
  );
  const otherVoices = useMemo(
    () => voices.filter((v) => !v.lang?.toLowerCase().startsWith("id")),
    [voices],
  );

  const handleMasterToggle = useCallback(() => {
    voice.unlock();
    const next = !settings.enabled;
    voice.updateSettings({ enabled: next });
    if (next) {
      // Test ding sebagai feedback aktivasi. User bisa klik "Test" per skenario
      // di bawah untuk dengar full voice.
      voice.playDing("soft");
    } else {
      voice.stop();
    }
  }, [settings.enabled]);

  const handleDingToggle = useCallback(() => {
    voice.updateSettings({ dingEnabled: !settings.dingEnabled });
  }, [settings.dingEnabled]);

  const handleVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value) / 100;
      voice.updateSettings({ volume: Math.max(0, Math.min(1, value)) });
    },
    [],
  );

  const handleRateChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value) / 100;
      voice.updateSettings({ rate: Math.max(0.5, Math.min(1.5, value)) });
    },
    [],
  );

  const handleScenarioToggle = useCallback(
    (scenario: VoiceScenario) => {
      voice.updateSettings({
        scenariosEnabled: {
          ...settings.scenariosEnabled,
          [scenario]: !settings.scenariosEnabled[scenario],
        },
      });
    },
    [settings.scenariosEnabled],
  );

  const handlePreview = useCallback((scenario: VoiceScenario) => {
    voice.unlock();
    void voice.preview(scenario);
  }, []);

  const handleTestAll = useCallback(async () => {
    if (testAllRunning) return;
    voice.unlock();
    setTestAllRunning(true);
    try {
      for (const scenario of SCENARIO_ORDER) {
        await voice.preview(scenario);
      }
    } finally {
      setTestAllRunning(false);
    }
  }, [testAllRunning]);

  const handleVoicePick = useCallback(
    (channel: VoiceChannel, value: string) => {
      voice.updateSettings({
        voiceByChannel: {
          ...settings.voiceByChannel,
          [channel]: value === "__auto__" ? undefined : value,
        },
      });
    },
    [settings.voiceByChannel],
  );

  const handleStop = useCallback(() => {
    voice.stop();
  }, []);

  const handleSmartTtsProvider = useCallback((value: VoiceTtsProvider) => {
    voice.updateSettings({ smartTtsProvider: value });
  }, []);

  const handleExecutiveTtsProvider = useCallback((value: VoiceTtsProvider) => {
    voice.updateSettings({ executiveTtsProvider: value });
  }, []);

  const handleAutoGenerateToggle = useCallback(() => {
    voice.updateSettings({ autoGenerateVoiceAsset: !settings.autoGenerateVoiceAsset });
  }, [settings.autoGenerateVoiceAsset]);

  const handleFallbackToggle = useCallback(() => {
    voice.updateSettings({ fallbackEnabled: !settings.fallbackEnabled });
  }, [settings.fallbackEnabled]);

  const handleCooldownChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      voice.updateSettings({ cooldownMs: Math.max(1000, Math.min(10000, value)) });
    },
    [],
  );

  const [generatingAll, setGeneratingAll] = useState(false);
  const handleGenerateAll = useCallback(async () => {
    if (generatingAll) return;
    setGeneratingAll(true);
    try {
      const res = await fetch("/api/smart-notif/generate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables: "1-50" }),
      });
      if (res.ok) {
        alert("Proses generate audio Meja 1-50 sedang berjalan di background.");
      } else {
        const data = await res.json();
        alert(`Gagal memulai generate: ${data.error || "Unknown error"}`);
      }
    } catch (e: unknown) {
      alert(`Gagal memanggil API: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [generatingAll]);

  const handleExecutiveTest = useCallback(async () => {
    if (executiveTestRunning) return;
    voice.unlock();
    setExecutiveTestRunning(true);
    try {
      await voice.announce("test_ceo", { force: true });
    } finally {
      setExecutiveTestRunning(false);
    }
  }, [executiveTestRunning]);

  const headerNode = embedded ? (
    <header className="space-y-1">
      <h2 className="garage-display flex items-center gap-2 text-lg text-white">
        <Mic className="size-5 text-[#f5a742]" />
        Smart Notification Center
      </h2>
      <p className="text-sm text-[#b8b8bf]">
        Voice announcement, trigger monitor, dan test center untuk POS, Kitchen,
        Bar, QR, Printer, Stok, Delivery, Waiter, Member VIP, Approval, Kas,
        Audit, AI alert, dan asisten suara.
      </p>
    </header>
  ) : (
    <DialogHeader>
      <DialogTitle className="garage-display flex items-center gap-2 text-lg">
        <Mic className="size-5 text-[#f5a742]" />
        Smart Notification Center
      </DialogTitle>
      <DialogDescription className="text-[#b8b8bf]">
        Voice announcement, trigger monitor, dan test center untuk POS, Kitchen,
        Bar, QR, Printer, Stok, Delivery, Waiter, Member VIP, Approval, Kas,
        Audit, AI alert, dan asisten suara.
      </DialogDescription>
    </DialogHeader>
  );

  const contentBody = (
    <>
      {headerNode}

        {!supportsTts && (
          <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffe1e5]">
            Browser ini tidak support Web Speech API. Sound ding tetap jalan; voice text-to-speech akan dilewati.
          </div>
        )}

        <div className="space-y-5">
          {/* Smart status */}
          <section className="rounded-md border border-[#34343c] bg-white/[0.045] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                  MVP Master Pro status
                </p>
                <p className="mt-1 text-sm text-[#f4f4f5]">
                  {settings.enabled
                    ? "Smart notification aktif dan siap menerima event operasional."
                    : "Smart notification standby. Aktifkan Voice ON sebelum jam operasional."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 border-[#4a4a54] bg-white/[0.06] text-[#f4f4f5]"
                onClick={() => void handleTestAll()}
                disabled={testAllRunning}
              >
                {testAllRunning ? (
                  <RotateCcw className="mr-2 size-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 size-4" />
                )}
                Test Semua
              </Button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <HealthTile
                label="Voice"
                ok={settings.enabled}
                value={settings.enabled ? "ON" : "OFF"}
              />
              <HealthTile
                label="Edge TTS ID"
                ok={executiveTtsStatus?.edge.enabled ?? false}
                value={
                  executiveTtsStatus?.edge.enabled
                    ? "Aktif (Gadis)"
                    : "Nonaktif"
                }
              />
              <HealthTile
                label="Browser TTS"
                ok={runtime.speechSupported}
                value={runtime.speechSupported ? "Cadangan" : "No TTS"}
              />
              <HealthTile
                label="Audio"
                ok={runtime.audioSupported}
                value={runtime.audioState}
              />
              <HealthTile
                label="Voices"
                ok={runtime.voiceCount > 0}
                value={`${runtime.voiceCount} loaded`}
              />
            </div>
          </section>

          {/* Master controls */}
          <section className="rounded-md border border-[#34343c] bg-white/[0.045] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                  Master
                </p>
                <p className="text-sm text-[#f4f4f5]">
                  {settings.enabled
                    ? "Voice announcement aktif. Setiap event akan diumumkan."
                    : "Voice announcement nonaktif. Klik ON untuk aktifkan."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={`garage-press h-10 border-[#4a4a54] ${
                    settings.enabled
                      ? "bg-[#1f6b3a]/22 text-[#c9f0d4] hover:bg-[#1f6b3a]/34"
                      : "bg-white/[0.06] text-[#d6d6dc]"
                  }`}
                  onClick={handleMasterToggle}
                  aria-label="Toggle master voice"
                >
                  {settings.enabled ? (
                    <>
                      <Mic className="mr-2 size-4" /> Voice ON
                    </>
                  ) : (
                    <>
                      <MicOff className="mr-2 size-4" /> Voice OFF
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`garage-press h-10 border-[#4a4a54] ${
                    settings.dingEnabled
                      ? "bg-white/[0.08] text-[#f4f4f5]"
                      : "bg-white/[0.045] text-[#9a9aa0]"
                  }`}
                  onClick={handleDingToggle}
                  aria-label="Toggle ding"
                >
                  {settings.dingEnabled ? (
                    <>
                      <Bell className="mr-2 size-4" /> Ding ON
                    </>
                  ) : (
                    <>
                      <BellOff className="mr-2 size-4" /> Ding OFF
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#d11a2a]/55 bg-[#d11a2a]/14 text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                  onClick={handleStop}
                  aria-label="Stop suara aktif"
                >
                  <VolumeX className="mr-2 size-4" /> Stop
                </Button>
              </div>
            </div>

            <div className="mt-4 max-w-md space-y-1">
              <div className="text-xs font-semibold text-[#f4f4f5]">
                Suara Smart Notification (POS / Dapur / Bar)
              </div>
              <p className="text-xs text-[#9a9aa0]">
                Default <strong className="text-[#fde8c8]">File MP3 lokal</strong> di{" "}
                <span className="garage-mono">public/voice/scenarios</span> — tanpa API
                Gemini/Edge saat operasional. Cadangan: Otomatis → Edge → browser.
              </p>
              <Select
                value={settings.smartTtsProvider}
                onValueChange={(value) =>
                  handleSmartTtsProvider(value as VoiceTtsProvider)
                }
              >
                <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06] text-[#f4f4f5]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[#34343c] bg-[#111116] text-[#f4f4f5]">
                  <SelectItem value="local">File MP3 lokal — utama (disarankan)</SelectItem>
                  <SelectItem value="auto">Otomatis (MP3 lalu Edge)</SelectItem>
                  <SelectItem value="edge">Edge neural online</SelectItem>
                  <SelectItem value="browser">Browser — bisa Inggris di Windows</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <div className="flex items-center justify-between text-xs text-[#b8b8bf]">
                  <span className="garage-mono uppercase tracking-[0.14em]">Volume</span>
                  <span className="text-[#f4f4f5]">{Math.round(settings.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(settings.volume * 100)}
                  onChange={handleVolumeChange}
                  className="garage-press h-2 w-full cursor-pointer appearance-none rounded-full bg-[#23232a] accent-[#d11a2a]"
                  aria-label="Volume"
                />
              </label>
              <label className="space-y-1">
                <div className="flex items-center justify-between text-xs text-[#b8b8bf]">
                  <span className="garage-mono uppercase tracking-[0.14em]">Kecepatan</span>
                  <span className="text-[#f4f4f5]">{settings.rate.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={70}
                  max={130}
                  step={5}
                  value={Math.round(settings.rate * 100)}
                  onChange={handleRateChange}
                  className="garage-press h-2 w-full cursor-pointer appearance-none rounded-full bg-[#23232a] accent-[#f5a742]"
                  aria-label="Speaking rate"
                />
              </label>
              <label className="space-y-1 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-xs text-[#b8b8bf]">
                  <span className="garage-mono uppercase tracking-[0.14em]">Cooldown (ms)</span>
                  <span className="text-[#f4f4f5]">{settings.cooldownMs}ms</span>
                </div>
                <input
                  type="range"
                  min={1000}
                  max={10000}
                  step={500}
                  value={settings.cooldownMs}
                  onChange={handleCooldownChange}
                  className="garage-press h-2 w-full cursor-pointer appearance-none rounded-full bg-[#23232a] accent-[#f5a742]"
                  aria-label="Cooldown"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#f4f4f5]">Gunakan Fallback Audio</p>
                  <p className="text-xs text-[#9a9aa0]">Jika audio file tidak ditemukan, gunakan audio generik (tanpa nomor meja).</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className={`garage-press h-8 border-[#4a4a54] ${
                    settings.fallbackEnabled ? "bg-[#1f6b3a]/22 text-[#c9f0d4]" : "bg-white/[0.06] text-[#d6d6dc]"
                  }`}
                  onClick={handleFallbackToggle}
                >
                  {settings.fallbackEnabled ? "ON" : "OFF"}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#f4f4f5]">Auto Generate Voice Asset</p>
                  <p className="text-xs text-[#9a9aa0]">Buat MP3 via Gemini otomatis jika belum ada (Limitasi 10/hari untuk free tier!).</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className={`garage-press h-8 border-[#4a4a54] ${
                    settings.autoGenerateVoiceAsset ? "bg-[#1f6b3a]/22 text-[#c9f0d4]" : "bg-white/[0.06] text-[#d6d6dc]"
                  }`}
                  onClick={handleAutoGenerateToggle}
                >
                  {settings.autoGenerateVoiceAsset ? "ON" : "OFF"}
                </Button>
              </div>
              <div className="flex items-center justify-between border-t border-[#34343c] pt-3">
                <div>
                  <p className="text-sm font-semibold text-[#f4f4f5]">Generate Massal (Meja 1-50)</p>
                  <p className="text-xs text-[#9a9aa0]">Generasi manual membutuhkan API Key berbayar agar lolos limitasi harian.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-8 border-[#f5a742]/55 bg-[#f5a742]/14 text-[#fde8c8]"
                  onClick={handleGenerateAll}
                  disabled={generatingAll}
                >
                  {generatingAll ? <RotateCcw className="mr-2 size-4 animate-spin" /> : null}
                  Generate Meja 1-50
                </Button>
              </div>
            </div>
          </section>

          {/* CEO Executive voice (Gemini TTS) */}
          <section className="rounded-md border border-[#34343c] bg-white/[0.045] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                  Suara CEO Assistant
                </p>
                <p className="mt-1 text-xs text-[#9a9aa0]">
                  Untuk mode Executive Assistant (Owner/Manager). Rekomendasi gratis:
                  Microsoft Edge neural (Gadis). Gemini TTS opsional berbayar.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 shrink-0 border-[#4a4a54] bg-white/[0.06] text-[#f4f4f5]"
                onClick={() => void handleExecutiveTest()}
                disabled={executiveTestRunning}
              >
                {executiveTestRunning ? (
                  <RotateCcw className="mr-2 size-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 size-4" />
                )}
                Tes CEO
              </Button>
            </div>

            {executiveTtsStatus ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <HealthTile
                  label="Edge TTS (gratis)"
                  ok={executiveTtsStatus.edge.enabled}
                  value={
                    executiveTtsStatus.edge.enabled
                      ? executiveTtsStatus.edge.voice
                      : "Nonaktif"
                  }
                />
                <HealthTile
                  label="Gemini TTS"
                  ok={executiveTtsStatus.elevenlabs.enabled}
                  value={
                    executiveTtsStatus.elevenlabs.enabled ? "Aktif" : "Opsional"
                  }
                />
                <HealthTile
                  label="Kecepatan"
                  ok
                  value={executiveTtsStatus.edge.rate}
                />
                <HealthTile
                  label="Pilihan UI"
                  ok
                  value={
                    settings.executiveTtsProvider === "auto"
                      ? "Otomatis"
                      : settings.executiveTtsProvider === "edge"
                        ? "Edge neural"
                        : settings.executiveTtsProvider === "elevenlabs"
                          ? "Gemini TTS"
                          : "Browser"
                  }
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-[#9a9aa0]">
                Status Gemini TTS hanya untuk Owner / Admin / Manager (login diperlukan).
              </p>
            )}

            <div className="mt-3 max-w-md space-y-1">
              <div className="text-xs font-semibold text-[#f4f4f5]">
                Sumber suara executive
              </div>
              <Select
                value={settings.executiveTtsProvider}
                onValueChange={(value) =>
                  handleExecutiveTtsProvider(value as VoiceTtsProvider)
                }
              >
                <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06] text-[#f4f4f5]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[#34343c] bg-[#111116] text-[#f4f4f5]">
                  <SelectItem value="auto">
                    Otomatis (Edge gratis dulu, lalu ElevenLabs jika ada key)
                  </SelectItem>
                  <SelectItem value="edge">
                    Edge neural — gratis, mirip manusia (Gadis ID)
                  </SelectItem>
                  <SelectItem value="elevenlabs">ElevenLabs — berbayar</SelectItem>
                  <SelectItem value="browser">Browser TTS — gratis, lebih robot</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {executiveTtsStatus && !executiveTtsStatus.edge.enabled && (
              <p className="mt-3 rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-2 text-xs text-[#fde8c8]">
                Edge TTS dimatikan. Hapus atau set{" "}
                <span className="garage-mono">EDGE_TTS_ENABLED=true</span> lalu restart.
              </p>
            )}

            {executiveTtsStatus &&
              executiveTtsStatus.edge.enabled &&
              !executiveTtsStatus.elevenlabs.enabled && (
                <p className="mt-2 text-xs text-[#9a9aa0]">
                  Mode Otomatis memakai Edge TTS — tidak perlu API key. ElevenLabs hanya
                  jika Anda menambahkan kredensial berbayar.
                </p>
              )}
          </section>

          {/* Trigger coverage */}
          <section className="rounded-md border border-[#34343c] bg-white/[0.045] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                  Trigger coverage
                </p>
                <p className="mt-1 text-xs text-[#9a9aa0]">
                  Semua skenario utama sudah punya trigger dan tombol test cepat.
                </p>
              </div>
              <ClipboardList className="size-5 text-[#f5a742]" />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {TRIGGER_CHECKLIST.map((item) => {
                const enabled = settings.scenariosEnabled[item.scenario] !== false;
                return (
                  <button
                    type="button"
                    key={item.scenario}
                    className="garage-press rounded-md border border-[#2a2a31] bg-[#16161c] p-3 text-left transition hover:border-[#4a4a54]"
                    onClick={() => handlePreview(item.scenario)}
                  >
                    <div className="flex items-start gap-2">
                      <CheckCircle2
                        className={`mt-0.5 size-4 shrink-0 ${
                          enabled ? "text-[#22c55e]" : "text-[#6b7280]"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#f4f4f5]">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs text-[#9a9aa0]">{item.detail}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Voice per channel */}
          <section className="rounded-md border border-[#34343c] bg-white/[0.045] p-3">
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
              Suara per channel
            </p>
            <p className="mt-1 text-xs text-[#9a9aa0]">
              Pilih voice browser untuk setiap channel. Auto = prioritaskan suara
              Bahasa Indonesia wanita (Gadis / Damayanti), lalu fallback Indonesia lain.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {CHANNEL_ORDER.map((channel) => {
                const selected = settings.voiceByChannel[channel] ?? "__auto__";
                return (
                  <div key={channel} className="space-y-1">
                    <div className="text-xs font-semibold text-[#f4f4f5]">
                      {VOICE_CHANNEL_LABEL[channel]}
                    </div>
                    <Select
                      value={selected}
                      onValueChange={(value) => handleVoicePick(channel, value)}
                    >
                      <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06] text-[#f4f4f5]">
                        <SelectValue placeholder="Auto" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72 border-[#34343c] bg-[#111116] text-[#f4f4f5]">
                        <SelectItem value="__auto__">Auto (Indonesia wanita)</SelectItem>
                        {idVoices.length > 0 && (
                          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9a9aa0]">
                            Bahasa Indonesia
                          </div>
                        )}
                        {idVoices.map((v) => (
                          <SelectItem key={`id-${v.voiceURI}`} value={v.voiceURI}>
                            {v.name} ({v.lang})
                          </SelectItem>
                        ))}
                        {otherVoices.length > 0 && (
                          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9a9aa0]">
                            Lainnya
                          </div>
                        )}
                        {otherVoices.map((v) => (
                          <SelectItem key={`o-${v.voiceURI}`} value={v.voiceURI}>
                            {v.name} ({v.lang})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Per-scenario toggles */}
          <section className="rounded-md border border-[#34343c] bg-white/[0.045] p-3">
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
              Skenario announcement
            </p>
            <p className="mt-1 text-xs text-[#9a9aa0]">
              Aktifkan/matikan per skenario. Tombol Test untuk preview suara langsung.
            </p>
            <div className="mt-3 space-y-2">
              {SCENARIO_ORDER.map((scenario) => {
                const meta = SCENARIO_META[scenario];
                const enabled = settings.scenariosEnabled[scenario] !== false;
                return (
                  <div
                    key={scenario}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#2a2a31] bg-[#16161c] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#f4f4f5]">
                        <span>{meta.label}</span>
                        <span className="garage-mono rounded-full border border-[#34343c] bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[#b8b8bf]">
                          {VOICE_CHANNEL_LABEL[meta.channel].split(" ")[0]}
                        </span>
                      </div>
                      <div className="text-xs text-[#9a9aa0]">
                        {meta.build({
                          customerName: "Surya",
                          table: "12",
                          channel: "GoFood",
                          itemName: "kopi susu",
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="garage-press h-9 border-[#4a4a54] bg-white/[0.06] text-[#f4f4f5]"
                        onClick={() => handlePreview(scenario)}
                      >
                        <PlayCircle className="mr-1.5 size-4" /> Test
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`garage-press h-9 border-[#4a4a54] ${
                          enabled
                            ? "bg-[#1f6b3a]/22 text-[#c9f0d4]"
                            : "bg-white/[0.045] text-[#9a9aa0]"
                        }`}
                        onClick={() => handleScenarioToggle(scenario)}
                      >
                        {enabled ? (
                          <>
                            <Volume2 className="mr-1.5 size-4" /> ON
                          </>
                        ) : (
                          <>
                            <VolumeX className="mr-1.5 size-4" /> OFF
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Live monitor */}
          <section className="rounded-md border border-[#34343c] bg-white/[0.045] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                  Live announcement log
                </p>
                <p className="mt-1 text-xs text-[#9a9aa0]">
                  Riwayat lokal browser untuk cek apakah event sudah masuk ke voice queue.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="garage-press h-9 border-[#4a4a54] bg-white/[0.06]"
                onClick={() => voice.clearLogs()}
              >
                <Trash2 className="mr-1.5 size-4" />
                Clear
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {logs.length ? (
                logs.slice(0, 10).map((log) => (
                  <div
                    key={log.id}
                    className="rounded-md border border-[#2a2a31] bg-[#16161c] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="garage-mono text-[10px] uppercase tracking-[0.12em] text-[#ffd08a]">
                        {SCENARIO_META[log.scenario].label}
                      </span>
                      <span className="text-[11px] text-[#8f8f99]">
                        {new Date(log.at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#d6d6dc]">{log.text}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-[#34343c] bg-black/10 p-4 text-center text-xs text-[#8f8f99]">
                  Belum ada announcement di session ini. Klik Test atau jalankan event POS/KDS.
                </div>
              )}
            </div>
          </section>

          {/* Helper */}
          <div className="rounded-md border border-[#34343c] bg-[#0e0e12] p-3 text-xs text-[#b8b8bf]">
            <p>
              <span className="garage-mono uppercase tracking-[0.14em] text-[#ffd08a]">
                Tips:
              </span>{" "}
              Untuk suara terbaik di Windows, install voice Bahasa Indonesia (Damayanti)
              via Settings &gt; Time &amp; language &gt; Speech &gt; Add a voice.
            </p>
            <p className="mt-1">
              Browser butuh user gesture untuk membuka audio. Buka dialog ini sekali per
              session dan klik Test sebagai unlock.
            </p>
          </div>
        </div>

        {embedded ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#2a2a31] pt-3">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54] bg-white/[0.06] text-[#d6d6dc]"
              onClick={() => voice.resetCooldown()}
              title="Reset cooldown supaya bisa replay test cepat"
            >
              <RotateCcw className="mr-2 size-4" />
              Reset cooldown
            </Button>
          </div>
        ) : (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54] bg-white/[0.06] text-[#d6d6dc]"
              onClick={() => voice.resetCooldown()}
              title="Reset cooldown supaya bisa replay test cepat"
            >
              <RotateCcw className="mr-2 size-4" />
              Reset cooldown
            </Button>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54] bg-white/[0.06]"
              onClick={() => onOpenChange(false)}
            >
              Tutup
            </Button>
          </DialogFooter>
        )}
    </>
  );

  if (embedded) {
    return (
      <section className="garage-scroll space-y-5 rounded-lg border border-[#34343c] bg-[#111116] p-4 text-[#f4f4f5] sm:p-5">
        {contentBody}
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="garage-scroll max-h-[90vh] overflow-y-auto border-[#34343c] bg-[#111116] text-[#f4f4f5] sm:max-w-2xl">
        {contentBody}
      </DialogContent>
    </Dialog>
  );
}

function HealthTile({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        ok
          ? "border-[#22c55e]/35 bg-[#22c55e]/10"
          : "border-[#f5a742]/35 bg-[#f5a742]/10"
      }`}
    >
      <div className="flex items-center gap-2">
        <Activity className={`size-3.5 ${ok ? "text-[#86efac]" : "text-[#ffd08a]"}`} />
        <span className="garage-mono text-[10px] uppercase tracking-[0.12em] text-[#b8b8bf]">
          {label}
        </span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

/**
 * VoiceStatusBadge — indikator kompak voice ON/OFF untuk POS & KDS header.
 * Klik buka VoiceSettingsDialog.
 */
type VoiceStatusBadgeProps = {
  onOpen: () => void;
  compact?: boolean;
};

export function VoiceStatusBadge({ onOpen, compact = false }: VoiceStatusBadgeProps) {
  const [settings, setSettings] = useState<VoiceSettings>(() => voice.getSettings());
  useEffect(() => voice.subscribe(setSettings), []);
  const enabled = settings.enabled;
  return (
    <button
      type="button"
      onClick={() => {
        voice.unlock();
        onOpen();
      }}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition ${
        enabled
          ? "border-[#22c55e]/55 bg-[#22c55e]/14 text-[#86efac] hover:bg-[#22c55e]/22"
          : "border-[#4a4a54] bg-white/[0.05] text-[#9a9aa0] hover:bg-white/[0.08]"
      }`}
      aria-label={enabled ? "Voice ON" : "Voice OFF"}
      title={
        enabled
          ? "Voice announcement aktif. Klik untuk settings."
          : "Voice OFF. Klik untuk aktifkan."
      }
    >
      <span className="relative inline-flex">
        {enabled ? (
          <Mic className="size-4" />
        ) : (
          <MicOff className="size-4 opacity-75" />
        )}
        {enabled && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex size-2 rounded-full bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.7)]" />
        )}
      </span>
      {!compact && (
        <span className="hidden sm:inline">{enabled ? "Voice ON" : "Voice"}</span>
      )}
    </button>
  );
}
