import { GoogleGenerativeAI } from "@google/generative-ai";

export type GeminiVoiceName = "Aoede" | "Charon" | "Fenrir" | "Kore" | "Puck" | string;

export type GeminiTtsOptions = {
  message: string;
  voiceDirection?: string;
};

export type GeminiTtsResult = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
};

export async function generateGeminiTtsAudio(
  opts: GeminiTtsOptions
): Promise<GeminiTtsResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const modelName = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
  const voiceName = process.env.GEMINI_TTS_VOICE_NAME || "Aoede";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const direction =
    opts.voiceDirection ||
    `Use a clear Indonesian female station announcer voice.
Tone: formal, calm, operational, premium, and easy to understand.
Style: like a train station or terminal announcement, but original for Garage OS.
Pace: medium, not too slow, not too fast.
Emotion: professional and helpful.
Pronunciation: Indonesian language, clear table numbers.
Do not imitate any real station, company, or copyrighted jingle.`;

  const prompt = `${direction}

Transcript:
${opts.message}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // @ts-expect-error - responseModalities belum ada di typing versi SDK ini
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName,
            },
          },
        },
      },
    });

    const candidate = result.response.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const inlineData = part?.inlineData;

    if (!inlineData || !inlineData.data) {
      throw new Error("No audio data returned from Gemini TTS.");
    }

    const buffer = Buffer.from(inlineData.data, "base64");
    
    // Usually inlineData.mimeType is "audio/wav" or "audio/pcm"
    let extension = "wav";
    if (inlineData.mimeType.includes("mp3")) extension = "mp3";
    else if (inlineData.mimeType.includes("pcm")) extension = "pcm";

    return {
      buffer,
      mimeType: inlineData.mimeType,
      extension,
    };
  } catch (error) {
    console.error("[Gemini TTS] Error generating audio:", error);
    throw error;
  }
}
