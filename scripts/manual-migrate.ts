import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const DATA_DIR = process.env.PGLITE_DATA_DIR ?? "D:/GARAGEFIX/pglite-data";

async function main() {
  console.log("Connecting to PGlite:", DATA_DIR);
  const client = new PGlite(DATA_DIR);
  await client.waitReady;
  console.log("✓ PGlite connected");

  await client.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      created_at BIGINT
    );
  `);

  const migrationsDir = join(process.cwd(), "drizzle");
  let files: string[] = [];

  try {
    files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    console.error("Folder drizzle/ tidak ditemukan! Jalankan dulu: npm run db:generate");
    process.exit(1);
  }

  if (files.length === 0) {
    console.error("Tidak ada file .sql di folder drizzle/");
    process.exit(1);
  }

  console.log(`Ditemukan ${files.length} file migrasi`);

  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), "utf-8");
    console.log(`Menjalankan: ${file}...`);
    try {
      await client.exec(sql);
      console.log(`✓ ${file} selesai`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("already exists")) {
        console.log(`⚠ ${file} sudah ada, skip`);
      } else {
        console.error(`✗ ${file} gagal:`, message);
      }
    }
  }

  await client.close();
  console.log("\n✓ Semua migrasi selesai!");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
