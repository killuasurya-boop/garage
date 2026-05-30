import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config as loadEnv } from "dotenv";

// Load local env files to get DATABASE_URL
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

import { getDb } from "../db";
import { siteAssets } from "../db/schema";

const sourcePngPath = "C:/Users/killu/.gemini/antigravity/brain/6f894d91-b5e8-4c0b-bcf4-0e36248b0810/garage_landing_hero_1779730935206.png";
const targetWebpDir = path.join(process.cwd(), "public", "garage-uploads", "landing");
const targetWebpName = "hero-premium-design.webp";
const targetWebpPath = path.join(targetWebpDir, targetWebpName);

async function run() {
  console.log("Starting landing hero update from project directory...");
  
  // Ensure upload directory exists
  await mkdir(targetWebpDir, { recursive: true });
  
  // Convert and optimize PNG to WebP using Sharp
  console.log(`Converting ${sourcePngPath} to WebP...`);
  const imageInfo = await sharp(sourcePngPath)
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true })
    .webp({ quality: 80, effort: 5 })
    .toFile(targetWebpPath);
    
  console.log("Image conversion completed successfully!");
  console.log("Details:", imageInfo);
  
  const db = getDb();
  
  const publicUrl = `/garage-uploads/landing/${targetWebpName}`;
  const assetInput = {
    slot: "landing_hero",
    publicUrl,
    width: imageInfo.width,
    height: imageInfo.height,
    alt: "Premium Café Racer Motorcycle and Espresso Crema in Garage Coffee & Motor",
    sizeBytes: imageInfo.size,
    mimeType: "image/webp",
    version: "premium-v1",
    updatedBy: null, // System / AI
  };
  
  console.log("Upserting site asset into database...");
  await db
    .insert(siteAssets)
    .values(assetInput)
    .onConflictDoUpdate({
      target: siteAssets.slot,
      set: {
        publicUrl: assetInput.publicUrl,
        width: assetInput.width,
        height: assetInput.height,
        alt: assetInput.alt,
        sizeBytes: assetInput.sizeBytes,
        mimeType: assetInput.mimeType,
        version: assetInput.version,
        updatedAt: new Date(),
      },
    });
    
  console.log("Successfully updated landing hero asset in database!");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error executing script:", err);
    process.exit(1);
  });
