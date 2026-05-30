import { z } from "zod";

import { fail, readJson } from "@/lib/api-response";
import {
  EXECUTIVE_TTS_MAX_TEXT_LENGTH,
  synthesizeGarageSpeech,
  type GarageTtsProvider,
} from "@/lib/executive-tts";
import { isEdgeTtsEnabled } from "@/lib/edge-tts-garage";
import { GARAGE_TTS_CHANNELS } from "@/lib/garage-tts-channels";
import { isElevenLabsTtsEnabled } from "@/lib/elevenlabs-tts";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const ttsBodySchema = z.object({
  text: z.string().min(1).max(EXECUTIVE_TTS_MAX_TEXT_LENGTH),
  channel: z.enum(GARAGE_TTS_CHANNELS).optional().default("executive"),
  provider: z
    .enum(["auto", "edge", "elevenlabs", "browser"])
    .optional()
    .default("auto"),
});

export async function POST(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const parsed = await readJson(request, ttsBodySchema);
  if (parsed.error) return parsed.error;

  const provider = parsed.data.provider as GarageTtsProvider;
  const channel = parsed.data.channel;

  if (provider === "browser") {
    return fail(
      400,
      "BROWSER_TTS_CLIENT_ONLY",
      "Suara browser hanya di perangkat ini. Pilih auto atau edge.",
    );
  }

  if (provider === "auto" && !isEdgeTtsEnabled() && !isElevenLabsTtsEnabled()) {
    return fail(
      503,
      "TTS_NOT_CONFIGURED",
      "Tidak ada TTS server aktif. Edge TTS aktif secara default di server.",
    );
  }

  if (provider === "edge" && !isEdgeTtsEnabled()) {
    return fail(503, "EDGE_TTS_DISABLED", "Edge TTS dimatikan (EDGE_TTS_ENABLED=false).");
  }

  if (
    provider === "elevenlabs" &&
    channel === "executive" &&
    !isElevenLabsTtsEnabled()
  ) {
    return fail(
      503,
      "ELEVENLABS_NOT_CONFIGURED",
      "ElevenLabs belum aktif. Isi ELEVENLABS_API_KEY di environment server.",
    );
  }

  try {
    const { audio, usedProvider } = await synthesizeGarageSpeech(parsed.data.text, {
      provider,
      channel,
    });
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=120",
        "X-Garage-Tts-Provider": usedProvider,
        "X-Garage-Tts-Channel": channel,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Garage TTS request failed.";
    return fail(502, "GARAGE_TTS_FAILED", message);
  }
}
