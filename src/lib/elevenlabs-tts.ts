const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices";
export const ELEVENLABS_MAX_TEXT_LENGTH = 2000;
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

export type ElevenLabsTtsConfig = {
  configured: boolean;
  voiceIdSet: boolean;
  modelId: string;
  maxTextLength: number;
  autoVoicePick: boolean;
};

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
};

let cachedAutoVoiceId: string | null = null;

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function scoreIndonesianVoice(voice: ElevenLabsVoice) {
  const name = voice.name.toLowerCase();
  const lang = (voice.labels?.language ?? voice.labels?.accent ?? "").toLowerCase();
  let score = 0;
  if (lang.includes("id") || lang.includes("indones")) score += 4;
  if (/indonesia|indonesian|gadis|sari|ayu|putri|wanita|female/i.test(name)) score += 3;
  if (/female|woman/i.test(voice.labels?.gender ?? "")) score += 2;
  if (/male|man/i.test(voice.labels?.gender ?? "")) score -= 2;
  return score;
}

async function resolveElevenLabsVoiceId(apiKey: string): Promise<string> {
  const explicit = readEnv("ELEVENLABS_VOICE_ID");
  if (explicit) return explicit;
  if (cachedAutoVoiceId) return cachedAutoVoiceId;

  const response = await fetch(ELEVENLABS_VOICES_URL, {
    headers: { "xi-api-key": apiKey },
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs list voices failed (${response.status}).`);
  }

  const payload = (await response.json()) as { voices?: ElevenLabsVoice[] };
  const voices = payload.voices ?? [];
  if (!voices.length) {
    throw new Error("ElevenLabs account has no voices.");
  }

  const ranked = [...voices].sort(
    (a, b) => scoreIndonesianVoice(b) - scoreIndonesianVoice(a),
  );
  cachedAutoVoiceId = ranked[0]!.voice_id;
  return cachedAutoVoiceId;
}

export function getElevenLabsTtsConfig(): ElevenLabsTtsConfig {
  const apiKey = readEnv("ELEVENLABS_API_KEY");
  const voiceId = readEnv("ELEVENLABS_VOICE_ID");
  const modelId = readEnv("ELEVENLABS_MODEL_ID") || DEFAULT_MODEL_ID;

  return {
    configured: Boolean(apiKey),
    voiceIdSet: Boolean(voiceId),
    modelId,
    maxTextLength: ELEVENLABS_MAX_TEXT_LENGTH,
    autoVoicePick: Boolean(apiKey && !voiceId),
  };
}

export function isElevenLabsTtsEnabled() {
  const flag = readEnv("ELEVENLABS_TTS_ENABLED").toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return Boolean(readEnv("ELEVENLABS_API_KEY"));
}

export async function synthesizeElevenLabsSpeech(text: string): Promise<ArrayBuffer> {
  const apiKey = readEnv("ELEVENLABS_API_KEY");
  const modelId = readEnv("ELEVENLABS_MODEL_ID") || DEFAULT_MODEL_ID;

  if (!apiKey) {
    throw new Error("ElevenLabs is not configured.");
  }

  const voiceId = await resolveElevenLabsVoiceId(apiKey);

  const trimmed = text.trim().slice(0, ELEVENLABS_MAX_TEXT_LENGTH);
  if (!trimmed) {
    throw new Error("TTS text is empty.");
  }

  const response = await fetch(`${ELEVENLABS_TTS_URL}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: trimmed,
      model_id: modelId,
      voice_settings: {
        stability: 0.48,
        similarity_boost: 0.78,
        style: 0.38,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    let detail = `ElevenLabs TTS failed (${response.status}).`;
    try {
      const payload = (await response.json()) as { detail?: { message?: string } | string };
      if (typeof payload.detail === "string") {
        detail = payload.detail;
      } else if (payload.detail?.message) {
        detail = payload.detail.message;
      }
    } catch {
      /* ignore parse errors */
    }
    throw new Error(detail);
  }

  return response.arrayBuffer();
}
