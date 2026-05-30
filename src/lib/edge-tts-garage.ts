import { EdgeTTS } from "edge-tts-universal";

import type { GarageTtsChannel } from "@/lib/garage-tts-channels";

export const EDGE_TTS_MAX_TEXT_LENGTH = 2000;
const DEFAULT_VOICE = "id-ID-GadisNeural";

/** Preset GARAGE Hospitality: ramah, tegas, sedikit cepat, mudah didengar. */
export const GARAGE_HOSPITALITY_PROSODY = {
  defaultRate: "+6%",
  defaultPitch: "+1Hz",
  kitchenRate: "+4%",
  kitchenPitch: "+0Hz",
  warningRate: "+8%",
  warningPitch: "+0Hz",
} as const;

export type EdgeTtsConfig = {
  enabled: boolean;
  voice: string;
  rate: string;
  pitch: string;
  maxTextLength: number;
};

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function getEdgeTtsConfig(): EdgeTtsConfig {
  const voice = readEnv("EDGE_TTS_VOICE") || DEFAULT_VOICE;
  const rate = readEnv("EDGE_TTS_RATE") || GARAGE_HOSPITALITY_PROSODY.defaultRate;
  const pitch = readEnv("EDGE_TTS_PITCH") || GARAGE_HOSPITALITY_PROSODY.defaultPitch;

  return {
    enabled: isEdgeTtsEnabled(),
    voice,
    rate,
    pitch,
    maxTextLength: EDGE_TTS_MAX_TEXT_LENGTH,
  };
}

/** Microsoft Edge neural TTS — gratis, tanpa API key (unofficial online service). */
export function isEdgeTtsEnabled() {
  const flag = readEnv("EDGE_TTS_ENABLED").toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return true;
}

export function getEdgeVoiceForChannel(channel: GarageTtsChannel = "executive") {
  const base = readEnv("EDGE_TTS_VOICE") || DEFAULT_VOICE;
  switch (channel) {
    case "kitchen":
      return readEnv("EDGE_TTS_VOICE_KITCHEN") || base;
    case "warning":
      return readEnv("EDGE_TTS_VOICE_WARNING") || base;
    case "bar":
      return readEnv("EDGE_TTS_VOICE_BAR") || base;
    case "kasir":
      return readEnv("EDGE_TTS_VOICE_KASIR") || base;
    case "executive":
    default:
      return base;
  }
}

function getEdgeProsodyForChannel(channel: GarageTtsChannel) {
  const baseRate =
    readEnv("EDGE_TTS_RATE") || GARAGE_HOSPITALITY_PROSODY.defaultRate;
  const basePitch =
    readEnv("EDGE_TTS_PITCH") || GARAGE_HOSPITALITY_PROSODY.defaultPitch;

  if (channel === "kitchen") {
    return {
      rate: readEnv("EDGE_TTS_RATE_KITCHEN") || GARAGE_HOSPITALITY_PROSODY.kitchenRate,
      pitch: readEnv("EDGE_TTS_PITCH_KITCHEN") || GARAGE_HOSPITALITY_PROSODY.kitchenPitch,
    };
  }
  if (channel === "warning") {
    return {
      rate: readEnv("EDGE_TTS_RATE_WARNING") || GARAGE_HOSPITALITY_PROSODY.warningRate,
      pitch: readEnv("EDGE_TTS_PITCH_WARNING") || GARAGE_HOSPITALITY_PROSODY.warningPitch,
    };
  }
  if (channel === "bar") {
    return {
      rate: readEnv("EDGE_TTS_RATE_BAR") || baseRate,
      pitch: readEnv("EDGE_TTS_PITCH_BAR") || basePitch,
    };
  }
  return { rate: baseRate, pitch: basePitch };
}

export async function synthesizeEdgeSpeech(
  text: string,
  channel: GarageTtsChannel = "executive",
): Promise<ArrayBuffer> {
  if (!isEdgeTtsEnabled()) {
    throw new Error("Edge TTS is disabled.");
  }

  const trimmed = text.trim().slice(0, EDGE_TTS_MAX_TEXT_LENGTH);
  if (!trimmed) {
    throw new Error("TTS text is empty.");
  }

  const voice = getEdgeVoiceForChannel(channel);
  const prosody = getEdgeProsodyForChannel(channel);
  const tts = new EdgeTTS(trimmed, voice, prosody);
  const result = await tts.synthesize();
  return result.audio.arrayBuffer();
}
