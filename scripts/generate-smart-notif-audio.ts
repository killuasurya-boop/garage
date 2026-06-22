import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { synthesizeEdgeSpeech } from "@/lib/edge-tts-garage";
import {
  isElevenLabsTtsEnabled,
  synthesizeElevenLabsSpeech,
} from "@/lib/elevenlabs-tts";

type TriggerKey =
  | "pos.order_created"
  | "kitchen.order_ready"
  | "waiter.order_ready"
  | "kitchen.sla_warning";

type Provider = "auto" | "edge" | "elevenlabs";
type AudioSource = "edge" | "elevenlabs" | "skipped";

type SmartNotifTemplate = {
  triggerKey: TriggerKey;
  label: string;
  fallbackFile: string;
  channel: "kasir" | "kitchen" | "warning" | "executive";
  tableText: (tableNo: number) => string;
  genericText: string;
};

const ROOT = process.cwd();
const PUBLIC_ROOT = path.join(ROOT, "public", "audio", "smart-notif");
const PUBLIC_BASE = "/audio/smart-notif";
const DEFAULT_TABLE_RANGE = "1-50";

const TEMPLATES: SmartNotifTemplate[] = [
  {
    triggerKey: "pos.order_created",
    label: "POS order created",
    fallbackFile: "order-created.mp3",
    channel: "kasir",
    tableText: (tableNo) =>
      `Ding ding ding. Perhatian. Pesanan baru meja ${tableNo}, telah masuk ke dapur. Tim dapur mohon segera cek layar kitchen display.`,
    genericText:
      "Ding ding ding. Perhatian. Pesanan baru telah masuk ke dapur. Tim dapur mohon segera cek layar kitchen display.",
  },
  {
    triggerKey: "kitchen.order_ready",
    label: "Kitchen order ready",
    fallbackFile: "kitchen-ready.mp3",
    channel: "kitchen",
    tableText: (tableNo) =>
      `Ding ding ding. Pesanan meja ${tableNo} sudah siap di pass counter. Waiter mohon segera antar ke pelanggan.`,
    genericText:
      "Ding ding ding. Ada pesanan yang sudah siap di pass counter. Waiter mohon segera cek dan antar ke pelanggan.",
  },
  {
    triggerKey: "waiter.order_ready",
    label: "Waiter order ready",
    fallbackFile: "waiter-ready.mp3",
    channel: "kitchen",
    tableText: (tableNo) =>
      `Waiter. Pesanan meja ${tableNo} siap diantar. Ambil di pass counter sekarang.`,
    genericText:
      "Waiter. Ada pesanan siap diantar. Ambil di pass counter sekarang.",
  },
  {
    triggerKey: "kitchen.sla_warning",
    label: "Kitchen SLA warning",
    fallbackFile: "general-alert.mp3",
    channel: "warning",
    tableText: (tableNo) =>
      `Perhatian dapur. Pesanan meja ${tableNo} telah melewati batas waktu layanan. Supervisor mohon bantu percepat penyelesaian.`,
    genericText:
      "Perhatian dapur. Ada pesanan yang telah melewati batas waktu layanan. Supervisor mohon bantu cek dan percepat penyelesaian.",
  },
];

function parseArgs(argv: string[]) {
  let tables = DEFAULT_TABLE_RANGE;
  let provider: Provider = "auto";
  let force = false;

  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg.startsWith("--tables=")) {
      tables = arg.slice("--tables=".length).trim() || DEFAULT_TABLE_RANGE;
      continue;
    }
    if (arg.startsWith("--provider=")) {
      const next = arg.slice("--provider=".length).trim();
      if (next === "auto" || next === "edge" || next === "elevenlabs") {
        provider = next;
      }
    }
  }

  return { tables: parseTableRange(tables), provider, force };
}

function parseTableRange(raw: string) {
  const value = raw.trim();
  if (/^\d+-\d+$/.test(value)) {
    const [startRaw, endRaw] = value.split("-");
    const start = Number(startRaw);
    const end = Number(endRaw);
    if (start > 0 && end >= start) {
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
  }

  const tables = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!tables.length) {
    throw new Error(`Format --tables tidak valid: ${raw}`);
  }

  return [...new Set(tables)].sort((a, b) => a - b);
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function synthesize(
  text: string,
  template: SmartNotifTemplate,
  provider: Provider,
): Promise<{ buffer: Buffer; source: Exclude<AudioSource, "skipped"> }> {
  if (provider === "elevenlabs") {
    const audio = await synthesizeElevenLabsSpeech(text);
    return { buffer: Buffer.from(audio), source: "elevenlabs" };
  }

  if (provider === "auto" && isElevenLabsTtsEnabled()) {
    try {
      const audio = await synthesizeElevenLabsSpeech(text);
      return { buffer: Buffer.from(audio), source: "elevenlabs" };
    } catch (error) {
      console.warn(
        `ElevenLabs gagal, fallback ke Edge TTS: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const audio = await synthesizeEdgeSpeech(text, template.channel);
  return { buffer: Buffer.from(audio), source: "edge" };
}

async function writeAudioFile(
  outputPath: string,
  text: string,
  template: SmartNotifTemplate,
  provider: Provider,
  force: boolean,
) {
  if (!force && (await fileExists(outputPath))) {
    return { bytes: 0, source: "skipped" as const };
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const result = await synthesize(text, template, provider);
  await writeFile(outputPath, result.buffer);
  return { bytes: result.buffer.length, source: result.source };
}

async function main() {
  const { tables, provider, force } = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();

  await mkdir(PUBLIC_ROOT, { recursive: true });

  console.log(`Smart Notif operational audio`);
  console.log(`Tables: ${tables[0]}-${tables[tables.length - 1]} (${tables.length})`);
  console.log(`Provider: ${provider}${force ? " | force overwrite" : ""}`);
  console.log(`Output: ${PUBLIC_ROOT}\n`);

  const manifest: {
    generatedAt: string;
    basePath: string;
    providerRequested: Provider;
    files: Array<{
      triggerKey: string;
      variant: string;
      tableNo: number | null;
      text: string;
      url: string;
      source: AudioSource;
      bytes: number;
    }>;
  } = {
    generatedAt,
    basePath: PUBLIC_BASE,
    providerRequested: provider,
    files: [],
  };

  const chimeTemplate = TEMPLATES[0]!;
  const chimePath = path.join(PUBLIC_ROOT, "chime", "garage-station-chime.mp3");
  const chime = await writeAudioFile(
    chimePath,
    "Ding ding ding.",
    chimeTemplate,
    provider,
    force,
  );
  manifest.files.push({
    triggerKey: "chime",
    variant: "garage-station-chime",
    tableNo: null,
    text: "Ding ding ding.",
    url: `${PUBLIC_BASE}/chime/garage-station-chime.mp3`,
    source: chime.source,
    bytes: chime.bytes,
  });
  console.log(`chime/garage-station-chime.mp3 -> ${chime.source}`);

  for (const template of TEMPLATES) {
    const fallbackPath = path.join(PUBLIC_ROOT, "fallback", template.fallbackFile);
    const fallback = await writeAudioFile(
      fallbackPath,
      template.genericText,
      template,
      provider,
      force,
    );
    manifest.files.push({
      triggerKey: template.triggerKey,
      variant: "fallback",
      tableNo: null,
      text: template.genericText,
      url: `${PUBLIC_BASE}/fallback/${template.fallbackFile}`,
      source: fallback.source,
      bytes: fallback.bytes,
    });
    console.log(`fallback/${template.fallbackFile} -> ${fallback.source}`);

    for (const tableNo of tables) {
      const fileName = `table-${tableNo}.mp3`;
      const relativePath = path.join("generated", template.triggerKey, fileName);
      const outputPath = path.join(PUBLIC_ROOT, relativePath);
      const text = template.tableText(tableNo);
      const result = await writeAudioFile(outputPath, text, template, provider, force);
      manifest.files.push({
        triggerKey: template.triggerKey,
        variant: "table",
        tableNo,
        text,
        url: `${PUBLIC_BASE}/generated/${template.triggerKey}/${fileName}`,
        source: result.source,
        bytes: result.bytes,
      });
      console.log(`generated/${template.triggerKey}/${fileName} -> ${result.source}`);
    }
  }

  await writeFile(
    path.join(PUBLIC_ROOT, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(`\nManifest: ${path.join(PUBLIC_ROOT, "manifest.json")}`);
  console.log("Selesai. File ini permanent asset, tidak butuh ElevenLabs saat runtime.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
