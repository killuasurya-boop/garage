import { eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { siteAssets } from "@/db/schema";
import type { SiteAsset } from "@/lib/garage-api-types";

export const landingHeroSlot = "landing_hero";

/** Foto suasana outlet asli di homepage (Owner upload dari modul Website, owner 16 Nov 2026). */
export const atmosphereSlots = ["suasana_1", "suasana_2", "suasana_3", "suasana_4"] as const;
export type AtmosphereSlot = (typeof atmosphereSlots)[number];

/** Slot yang boleh diupload lewat /api/site/landing-hero. */
export const uploadableSiteSlots = [landingHeroSlot, ...atmosphereSlots] as const;
export type UploadableSiteSlot = (typeof uploadableSiteSlots)[number];

export function parseUploadableSlot(value: unknown): UploadableSiteSlot | null {
  const slot = typeof value === "string" && value.trim() ? value.trim() : landingHeroSlot;
  return (uploadableSiteSlots as readonly string[]).includes(slot) ? (slot as UploadableSiteSlot) : null;
}

export function isAtmosphereSlot(slot: string): slot is AtmosphereSlot {
  return (atmosphereSlots as readonly string[]).includes(slot);
}

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

/** Foto suasana yang sudah diupload, urut sesuai slot (slot kosong dilewati). */
export async function getAtmosphereAssets() {
  const rows = await getDb()
    .select()
    .from(siteAssets)
    .where(inArray(siteAssets.slot, [...atmosphereSlots]));
  const bySlot = new Map(rows.map((row) => [row.slot, serializeSiteAsset(row)]));
  return atmosphereSlots.flatMap((slot) => (bySlot.has(slot) ? [bySlot.get(slot)!] : []));
}

export async function deleteSiteAsset(slot: string) {
  const [row] = await getDb().delete(siteAssets).where(eq(siteAssets.slot, slot)).returning();
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
