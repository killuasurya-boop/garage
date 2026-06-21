import { sql } from "drizzle-orm";
import { getDb, ensureDatabaseReady } from "@/db";

async function main() {
  await ensureDatabaseReady();
  const db = getDb();
  console.log("Menjalankan migrasi manual untuk recruitment_positions...");

  // Bikin table recruitment_positions
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "recruitment_positions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "slug" text NOT NULL UNIQUE,
      "title" text NOT NULL,
      "location" text NOT NULL DEFAULT 'Tebing Tinggi',
      "type" text NOT NULL DEFAULT 'Full-time',
      "experience" text NOT NULL DEFAULT '',
      "description" text NOT NULL DEFAULT '',
      "is_open" boolean NOT NULL DEFAULT true,
      "sort_order" integer NOT NULL DEFAULT 0,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
  console.log("Tabel recruitment_positions sukses dibuat/diperbarui.");

  // Tambahkan kolom baru ke tabel candidates jika belum ada (dari task recruitment)
  try {
    await db.execute(sql`ALTER TABLE "candidates" ADD COLUMN "interview_date" timestamp with time zone;`);
  } catch(e) {}
  
  try {
    await db.execute(sql`ALTER TABLE "candidates" ADD COLUMN "interview_link" text;`);
  } catch(e) {}
  
  try {
    await db.execute(sql`ALTER TABLE "candidates" ADD COLUMN "cv_parsed_data" jsonb;`);
  } catch(e) {}
  console.log("Kolom candidates selesai.");

  process.exit(0);
}

main().catch(err => {
  console.error("Gagal jalankan migrasi manual:", err);
  process.exit(1);
});
