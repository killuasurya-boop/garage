/**
 * Generate Smart Notification MP3 dari ElevenLabs.
 * Default: HANYA scenario yang belum punya file MP3 di public/voice/scenarios/
 * (hemat credit). Pakai --all untuk regenerate semua.
 *
 * Env yang dipakai (sudah ada di .env.local):
 *   ELEVENLABS_API_KEY      (wajib)
 *   ELEVENLABS_VOICE_ID     (opsional — kalau kosong, auto-pick voice Indonesia wanita)
 *   ELEVENLABS_MODEL_ID     (opsional — default eleven_multilingual_v2)
 *
 * Run:
 *   npx tsx src/scripts/publish-scenario-audio-elevenlabs.ts
 *   npx tsx src/scripts/publish-scenario-audio-elevenlabs.ts --all
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { synthesizeElevenLabsSpeech } from "@/lib/elevenlabs-tts";

type ScenarioAudioEntry = {
  scenario: string;
  file: string;
  text: string;
};

type ScenarioAudioManifest = {
  publicBasePath: string;
  scenarios: ScenarioAudioEntry[];
};

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(
  ROOT,
  "content",
  "voice-scripts",
  "scenario-audio.json",
);
const PUBLIC_DIR = path.join(ROOT, "public", "voice", "scenarios");

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const regenAll = process.argv.includes("--all");

  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error(
      "ELEVENLABS_API_KEY tidak ditemukan. Set di .env.local lalu coba lagi.",
    );
  }

  const raw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw) as ScenarioAudioManifest;

  await mkdir(PUBLIC_DIR, { recursive: true });

  const todo: ScenarioAudioEntry[] = [];
  for (const entry of manifest.scenarios) {
    const outputPath = path.join(PUBLIC_DIR, entry.file);
    if (regenAll || !(await fileExists(outputPath))) {
      todo.push(entry);
    }
  }

  if (!todo.length) {
    console.log(
      "Semua MP3 sudah ada. Pakai --all untuk regenerate dengan ElevenLabs.",
    );
    return;
  }

  console.log(
    `Generate ${todo.length} scenario MP3 via ElevenLabs → public/voice/scenarios`,
  );
  console.log(
    `Voice ID: ${process.env.ELEVENLABS_VOICE_ID?.trim() || "<auto-pick ID female>"}`,
  );
  console.log(`Model: ${process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2"}\n`);

  const published: Array<{
    scenario: string;
    file: string;
    url: string;
    bytes: number;
  }> = [];

  for (const entry of todo) {
    const outputPath = path.join(PUBLIC_DIR, entry.file);
    process.stdout.write(`  ${entry.file} … `);
    try {
      const buffer = Buffer.from(
        await synthesizeElevenLabsSpeech(entry.text.trim()),
      );
      await writeFile(outputPath, buffer);
      published.push({
        scenario: entry.scenario,
        file: entry.file,
        url: `${manifest.publicBasePath}/${entry.file}`,
        bytes: buffer.length,
      });
      console.log(`OK (${buffer.length} bytes)`);
    } catch (error) {
      console.log(`FAIL (${error instanceof Error ? error.message : error})`);
      throw error;
    }
  }

  const manifestOutPath = path.join(PUBLIC_DIR, "manifest-elevenlabs.json");
  const indexPayload = {
    publishedAt: new Date().toISOString(),
    provider: "elevenlabs",
    voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || "auto",
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
    basePath: manifest.publicBasePath,
    scenarios: published,
  };
  await writeFile(
    manifestOutPath,
    `${JSON.stringify(indexPayload, null, 2)}\n`,
    "utf8",
  );

  console.log(
    "\nSelesai. Smart Notification akan memutar file ini saat runtime.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
