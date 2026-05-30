import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { EdgeTTS } from "edge-tts-universal";

type VoiceScriptItem = {
  id: string;
  file: string;
  text: string;
};

type VoiceScriptPack = {
  id: string;
  label: string;
  items: VoiceScriptItem[];
};

type VoiceScriptManifest = {
  defaults: {
    voice: string;
    rate: string;
    pitch: string;
  };
  packs: VoiceScriptPack[];
};

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "content", "voice-scripts", "garage-voice-id.json");
const OUTPUT_DIR = path.join(ROOT, "exports", "voice-mp3");

function parseArgs(argv: string[]) {
  const packIds = new Set<string>();
  const itemIds = new Set<string>();
  let manifestPath = MANIFEST_PATH;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--manifest" && argv[i + 1]) {
      manifestPath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--pack" && argv[i + 1]) {
      packIds.add(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--id" && argv[i + 1]) {
      itemIds.add(argv[i + 1]);
      i += 1;
    }
  }

  return { packIds, itemIds, manifestPath, dryRun };
}

async function loadManifest(manifestPath: string): Promise<VoiceScriptManifest> {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as VoiceScriptManifest;
}

async function synthesizeToMp3(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
): Promise<Buffer> {
  const tts = new EdgeTTS(text.trim(), voice, { rate, pitch });
  const result = await tts.synthesize();
  const arrayBuffer = await result.audio.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function main() {
  const { packIds, itemIds, manifestPath, dryRun } = parseArgs(process.argv.slice(2));
  const manifest = await loadManifest(manifestPath);

  const voice = process.env.EDGE_TTS_VOICE?.trim() || manifest.defaults.voice;
  const rate = process.env.EDGE_TTS_RATE?.trim() || manifest.defaults.rate;
  const pitch = process.env.EDGE_TTS_PITCH?.trim() || manifest.defaults.pitch;

  const selected: Array<VoiceScriptItem & { packId: string; packLabel: string }> = [];

  for (const pack of manifest.packs) {
    if (packIds.size > 0 && !packIds.has(pack.id)) continue;
    for (const item of pack.items) {
      if (itemIds.size > 0 && !itemIds.has(item.id)) continue;
      selected.push({ ...item, packId: pack.id, packLabel: pack.label });
    }
  }

  if (selected.length === 0) {
    console.error("Tidak ada naskah yang cocok. Cek --pack atau --id.");
    process.exitCode = 1;
    return;
  }

  if (!dryRun) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }

  const generated: Array<{
    id: string;
    packId: string;
    packLabel: string;
    file: string;
    relativePath: string;
    text: string;
    bytes?: number;
  }> = [];

  console.log(`Voice: ${voice} | rate: ${rate} | pitch: ${pitch}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Items: ${selected.length}${dryRun ? " (dry-run)" : ""}\n`);

  for (const item of selected) {
    const outputPath = path.join(OUTPUT_DIR, item.file);
    const relativePath = path.relative(ROOT, outputPath).replace(/\\/g, "/");

    if (dryRun) {
      console.log(`[dry-run] ${item.file} — ${item.text.slice(0, 72)}…`);
      generated.push({
        id: item.id,
        packId: item.packId,
        packLabel: item.packLabel,
        file: item.file,
        relativePath,
        text: item.text,
      });
      continue;
    }

    process.stdout.write(`Generating ${item.file} … `);
    const buffer = await synthesizeToMp3(item.text, voice, rate, pitch);
    await writeFile(outputPath, buffer);
    console.log(`OK (${buffer.length} bytes)`);

    generated.push({
      id: item.id,
      packId: item.packId,
      packLabel: item.packLabel,
      file: item.file,
      relativePath,
      text: item.text,
      bytes: buffer.length,
    });
  }

  const index = {
    generatedAt: new Date().toISOString(),
    voice,
    rate,
    pitch,
    manifest: path.relative(ROOT, manifestPath).replace(/\\/g, "/"),
    outputDir: path.relative(ROOT, OUTPUT_DIR).replace(/\\/g, "/"),
    files: generated,
  };

  if (!dryRun) {
    const indexPath = path.join(OUTPUT_DIR, "index.json");
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    console.log(`\nIndex: ${indexPath}`);
  }

  console.log("\nSelesai. File MP3 siap di-import ke editor video, WA, atau penyimpanan lokal.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
