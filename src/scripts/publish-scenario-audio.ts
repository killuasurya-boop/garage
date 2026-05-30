import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { EdgeTTS } from "edge-tts-universal";

import { GARAGE_HOSPITALITY_PROSODY } from "@/lib/edge-tts-garage";

type ScenarioAudioEntry = {
  scenario: string;
  file: string;
  text: string;
};

type ScenarioAudioManifest = {
  voice: string;
  rate: string;
  pitch: string;
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

async function main() {
  const raw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw) as ScenarioAudioManifest;

  const voice = process.env.EDGE_TTS_VOICE?.trim() || manifest.voice;
  const rate =
    process.env.EDGE_TTS_RATE?.trim() ||
    manifest.rate ||
    GARAGE_HOSPITALITY_PROSODY.defaultRate;
  const pitch =
    process.env.EDGE_TTS_PITCH?.trim() ||
    manifest.pitch ||
    GARAGE_HOSPITALITY_PROSODY.defaultPitch;

  await mkdir(PUBLIC_DIR, { recursive: true });

  console.log(`Publishing ${manifest.scenarios.length} scenario MP3 → public/voice/scenarios`);
  console.log(`Voice: ${voice} | rate: ${rate} | pitch: ${pitch}\n`);

  const published: Array<{
    scenario: string;
    file: string;
    url: string;
    bytes: number;
  }> = [];

  for (const entry of manifest.scenarios) {
    const outputPath = path.join(PUBLIC_DIR, entry.file);
    process.stdout.write(`  ${entry.file} … `);
    const tts = new EdgeTTS(entry.text.trim(), voice, { rate, pitch });
    const result = await tts.synthesize();
    const buffer = Buffer.from(await result.audio.arrayBuffer());
    await writeFile(outputPath, buffer);
    published.push({
      scenario: entry.scenario,
      file: entry.file,
      url: `${manifest.publicBasePath}/${entry.file}`,
      bytes: buffer.length,
    });
    console.log(`OK (${buffer.length} bytes)`);
  }

  const index = {
    publishedAt: new Date().toISOString(),
    voice,
    rate,
    pitch,
    basePath: manifest.publicBasePath,
    scenarios: published,
  };

  await writeFile(
    path.join(PUBLIC_DIR, "manifest.json"),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8",
  );

  console.log("\nSelesai. Smart Notification akan memutar file ini (tanpa API ElevenLabs/Edge saat runtime).");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
