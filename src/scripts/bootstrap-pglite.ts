import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";

import { ensureDatabaseReady, getPgPool } from "@/db";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

async function main() {
  console.log("Booting PGlite (may take 10-30s on first run)...");
  await ensureDatabaseReady();
  console.log("PGlite ready.");

  const pool = getPgPool() as {
    query: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
    exec?: (q: string) => Promise<unknown>;
    end?: () => Promise<void>;
  };
  const isPglite = typeof pool.exec === "function";
  console.log(`driver: ${isPglite ? "pglite (multi-stmt via exec)" : "postgres"}`);

  await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle;`);
  await pool.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id serial PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  );`);

  const appliedRes = await pool.query(`SELECT hash FROM drizzle.__drizzle_migrations;`);
  const applied = new Set(appliedRes.rows.map((r) => r.hash as string));
  console.log(`already applied: ${applied.size} migrations`);

  const drizzleDir = path.join(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  console.log(`found ${files.length} migration files`);

  for (const file of files) {
    const hash = file.replace(/\.sql$/, "");
    if (applied.has(hash)) continue;

    const sql = fs.readFileSync(path.join(drizzleDir, file), "utf8");
    // PGlite's exec() uses the simple query protocol which supports
    // multi-statement scripts (DO $$ blocks, multiple ALTERs in a single
    // breakpoint chunk, etc). PGlite's query() uses extended protocol and
    // rejects multi-statement payloads. So always prefer exec() on PGlite.
    process.stdout.write(`applying ${file}... `);
    try {
      if (isPglite) {
        await pool.exec!(sql);
      } else {
        const statements = sql
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const stmt of statements) {
          await pool.query(stmt);
        }
      }
      await pool.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${Date.now()});`,
      );
      console.log("ok");
    } catch (err) {
      console.log("FAIL");
      throw err;
    }
  }

  if (pool.end) await pool.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
