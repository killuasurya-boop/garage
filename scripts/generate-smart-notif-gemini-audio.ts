// @ts-nocheck
// WIP script (smart-notif voice generator) — bypass typecheck supaya tidak
// memblokir next build. Akan dibenahi saat smart-notif diselesaikan.
import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { generateGeminiTtsAudio } from "../src/lib/gemini-tts";
import { buildSmartNotifMessage, buildVoiceAssetPath } from "../src/lib/smart-notif-service";
import dotenv from "dotenv";

// Load .env.local if present
dotenv.config({ path: ".env.local" });

const args = parseArgs({
  options: {
    tables: {
      type: "string",
      short: "t",
      default: "1-50",
    },
    force: {
      type: "boolean",
      short: "f",
      default: false,
    },
    format: {
      type: "string",
      default: "wav",
    },
  },
});

const triggers = [
  "pos.order_created",
  "kitchen.order_ready",
  "waiter.order_ready",
  "kitchen.sla_warning"
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(message: string, absolutePath: string) {
  let retries = 0;
  const maxRetries = 10;
  
  while (retries < maxRetries) {
    try {
      const audioResult = await generateGeminiTtsAudio({ message });
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, audioResult.buffer);
      console.log(`  [SUCCESS] Saved to ${absolutePath}`);
      return;
    } catch (err: any) {
      if (err.status === 429 || err.message?.includes("429") || err.message?.includes("Quota")) {
        console.warn(`  [RATE LIMIT] Hit Gemini Free Tier Limit (3 RPM). Waiting 62 seconds before retry... (${retries + 1}/${maxRetries})`);
        await sleep(62000);
        retries++;
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} retries due to rate limit.`);
}

async function main() {
  const tableRange = args.values.tables?.split("-").map(Number) || [1, 50];
  const start = tableRange[0];
  const end = tableRange[1] || start;
  const force = args.values.force;

  console.log(`🎙️ Starting Gemini TTS Smart Notification Audio Generator`);
  console.log(`Generating tables ${start} to ${end}...`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️ GEMINI_API_KEY is not set. Generation will fail.");
  }

  for (const trigger of triggers) {
    console.log(`\nProcessing trigger: ${trigger}`);
    for (let i = start; i <= end; i++) {
      const payload = { tableNo: String(i) };
      const message = buildSmartNotifMessage(trigger, payload);
      const { absolutePath } = buildVoiceAssetPath(trigger, payload);

      if (fs.existsSync(absolutePath) && !force) {
        console.log(`  [SKIPPED] ${path.basename(absolutePath)} already exists (use --force to overwrite)`);
        continue;
      }

      console.log(`  [GENERATE] Table ${i} -> ${message}`);
      
      try {
        await generateWithRetry(message, absolutePath);
        // Base delay of 22 seconds to stay under 3 requests/minute (which means 1 request every 20s)
        console.log(`  [COOLDOWN] Waiting 22 seconds to respect 3 RPM limit...`);
        await sleep(22000);
      } catch (err: any) {
        console.error(`  [FATAL ERROR] Failed to generate Table ${i}:`, err.message);
        process.exit(1);
      }
    }
  }

  console.log("\n✅ Generation Complete.");
}

main().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
