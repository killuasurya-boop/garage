import { sql } from "drizzle-orm";

import type { GarageDb } from "@/db";

let ensured = false;

export async function ensureStaffProfileAccessColumns(db: GarageDb) {
  if (ensured) return;
  await db.execute(sql`
    ALTER TABLE "staff_profiles"
    ADD COLUMN IF NOT EXISTS "password_reset_required" boolean DEFAULT false NOT NULL
  `);
  // Production Hub (migrasi 0104). Dijaga di sini supaya login tidak gagal bila
  // server jalan sebelum migrasi; backfill kasir → "all" tetap dari migrasi.
  await db.execute(sql`
    ALTER TABLE "staff_profiles"
    ADD COLUMN IF NOT EXISTS "workstation" text
  `);
  ensured = true;
}
