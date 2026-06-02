#!/usr/bin/env node
// Apply Drizzle migrations against the local PGlite data dir.
// Uses PGlite client.exec() which supports multi-statement SQL — avoids the
// "cannot insert multiple commands into a prepared statement" error that
// drizzle-kit migrate hits on Garage migrations that lack `--> statement-breakpoint`.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const dataDir = path.join(process.cwd(), ".garage-db");
const migrationsFolder = path.join(process.cwd(), "drizzle");
const journalPath = path.join(migrationsFolder, "meta", "_journal.json");

if (!fs.existsSync(journalPath)) {
  console.error(`[pglite-migrate] missing ${journalPath}`);
  process.exit(1);
}

const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
console.log(`[pglite-migrate] data dir: ${dataDir}`);
console.log(`[pglite-migrate] migrations: ${journal.entries.length}`);

const client = new PGlite(dataDir);
await client.waitReady;

await client.exec(`CREATE SCHEMA IF NOT EXISTS "drizzle";`);
await client.exec(`
  CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  );
`);

const applied = await client.query(
  `SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at ASC`,
);
const appliedHashes = new Set(applied.rows.map((r) => r.hash));

const started = Date.now();
let appliedCount = 0;
let skippedCount = 0;

for (const entry of journal.entries) {
  const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
  const sqlText = fs.readFileSync(sqlPath, "utf8");
  const hash = crypto.createHash("sha256").update(sqlText).digest("hex");

  if (appliedHashes.has(hash)) {
    skippedCount += 1;
    continue;
  }

  process.stdout.write(`[pglite-migrate] applying ${entry.tag} ... `);
  try {
    // Strip breakpoint markers so the SQL is plain multi-statement.
    const cleaned = sqlText.replaceAll("--> statement-breakpoint", "");
    await client.exec(cleaned);
    await client.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, entry.when],
    );
    appliedCount += 1;
    console.log("ok");
  } catch (err) {
    console.log("FAILED");
    console.error(err?.message ?? err);
    await client.close();
    process.exit(1);
  }
}

console.log(
  `[pglite-migrate] done in ${Date.now() - started}ms (applied=${appliedCount}, skipped=${skippedCount})`,
);
await client.close();
