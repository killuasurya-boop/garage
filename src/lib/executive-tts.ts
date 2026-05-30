import {
  getElevenLabsTtsConfig,
  isElevenLabsTtsEnabled,
  synthesizeElevenLabsSpeech,
} from "@/lib/elevenlabs-tts";
import {
  getEdgeTtsConfig,
  isEdgeTtsEnabled,
  synthesizeEdgeSpeech,
} from "@/lib/edge-tts-garage";
import type { GarageTtsChannel } from "@/lib/garage-tts-channels";

export type GarageTtsProvider = "auto" | "edge" | "elevenlabs" | "browser";

/** @deprecated Use GarageTtsProvider */
export type ExecutiveTtsProvider = GarageTtsProvider;

export const EXECUTIVE_TTS_MAX_TEXT_LENGTH = 2000;

export type ExecutiveTtsStatus = {
  edge: ReturnType<typeof getEdgeTtsConfig>;
  elevenlabs: ReturnType<typeof getElevenLabsTtsConfig> & { enabled: boolean };
  maxTextLength: number;
  recommendedFree: "edge";
};

export function getExecutiveTtsStatus(): ExecutiveTtsStatus {
  return {
    edge: getEdgeTtsConfig(),
    elevenlabs: {
      ...getElevenLabsTtsConfig(),
      enabled: isElevenLabsTtsEnabled(),
    },
    maxTextLength: EXECUTIVE_TTS_MAX_TEXT_LENGTH,
    recommendedFree: "edge",
  };
}

export async function synthesizeGarageSpeech(
  text: string,
  options: {
    provider?: GarageTtsProvider;
    channel?: GarageTtsChannel;
  } = {},
): Promise<{ audio: ArrayBuffer; usedProvider: "edge" | "elevenlabs" }> {
  const provider = options.provider ?? "auto";
  const channel = options.channel ?? "executive";
  const allowElevenLabs = channel === "executive";

  const order: Array<"edge" | "elevenlabs"> =
    provider === "edge"
      ? ["edge"]
      : provider === "elevenlabs"
        ? allowElevenLabs
          ? ["elevenlabs"]
          : ["edge"]
        : allowElevenLabs
          ? ["edge", "elevenlabs"]
          : ["edge"];

  const errors: string[] = [];

  for (const candidate of order) {
    try {
      if (candidate === "edge" && isEdgeTtsEnabled()) {
        const audio = await synthesizeEdgeSpeech(text, channel);
        return { audio, usedProvider: "edge" };
      }
      if (candidate === "elevenlabs" && allowElevenLabs && isElevenLabsTtsEnabled()) {
        const audio = await synthesizeElevenLabsSpeech(text);
        return { audio, usedProvider: "elevenlabs" };
      }
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : `${candidate} TTS failed.`,
      );
    }
  }

  if (provider === "browser") {
    throw new Error("Browser TTS is client-only.");
  }

  throw new Error(
    errors.length > 0
      ? errors.join(" ")
      : "Tidak ada provider TTS server yang aktif. Aktifkan Edge TTS (gratis) atau ElevenLabs.",
  );
}

export async function synthesizeExecutiveSpeech(
  text: string,
  provider: GarageTtsProvider = "auto",
) {
  return synthesizeGarageSpeech(text, { provider, channel: "executive" });
}
