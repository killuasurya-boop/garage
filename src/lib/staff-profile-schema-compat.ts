import { sql } from "drizzle-orm";

import type { GarageDb } from "@/db";

let ensured = false;

export async function ensureStaffProfileAccessColumns(db: GarageDb) {
  if (ensured) return;
  await db.execute(sql`
    ALTER TABLE "staff_profiles"
    ADD COLUMN IF NOT EXISTS "password_reset_required" boolean DEFAULT false NOT NULL
  `);
  ensured = true;
}
