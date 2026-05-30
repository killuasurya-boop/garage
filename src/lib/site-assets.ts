import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { siteAssets } from "@/db/schema";
import type { SiteAsset } from "@/lib/garage-api-types";

export const landingHeroSlot = "landing_hero";

type SiteAssetRow = typeof siteAssets.$inferSelect;

type SaveSiteAssetInput = {
  slot: string;
  publicUrl: string;
  width: number;
  height: number;
  alt: string;
  sizeBytes: number;
  mimeType: string;
  version: string;
  updatedBy: string | null;
};

function serializeSiteAsset(row: SiteAssetRow): SiteAsset {
  return {
    slot: row.slot,
    publicUrl: row.publicUrl,
    width: row.width,
    height: row.height,
    alt: row.alt,
    sizeBytes: row.sizeBytes,
    mimeType: row.mimeType,
    version: row.version,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSiteAsset(slot: string) {
  const [row] = await getDb()
    .select()
    .from(siteAssets)
    .where(eq(siteAssets.slot, slot))
    .limit(1);

  return row ? serializeSiteAsset(row) : null;
}

export function getLandingHeroAsset() {
  return getSiteAsset(landingHeroSlot);
}

export async function saveSiteAsset(input: SaveSiteAssetInput) {
  const [row] = await getDb()
    .insert(siteAssets)
    .values(input)
    .onConflictDoUpdate({
      target: siteAssets.slot,
      set: {
        publicUrl: input.publicUrl,
        width: input.width,
        height: input.height,
        alt: input.alt,
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
        version: input.version,
        updatedBy: input.updatedBy,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return serializeSiteAsset(row);
}
