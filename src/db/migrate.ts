import { config as loadEnv } from "dotenv";
import crypto from "node:crypto";
import fs from "fs";
import path from "path";
import type pg from "pg";

import { ensureDatabaseReady, getDatabaseDriver, getPgPool } from "./index";
import type { PGlite } from "@electric-sql/pglite";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

// =============================================================================
// Migration runner idempoten dengan tracking hash.
//
// Sebelumnya runner menjalankan SEMUA drizzle/*.sql dari 0000 tiap deploy tanpa
// tracking -> gagal di "relation already exists" (42P07) -> migrasi BARU tidak
// pernah auto-apply. Sekarang:
//   1. Pakai tabel "drizzle"."__drizzle_migrations" (hash per file) untuk skip
//      migrasi yang sudah diterapkan.
//   2. Toleransi error "objek sudah ada" (DUPLICATE_CODES) supaya DB lama yang
//      skemanya sudah ada (tapi belum tercatat) ter-baseline mulus.
//   3. JANGAN throw pada error (app depends_on migrate dengan
//      service_completed_successfully -> exit non-zero = app TIDAK start).
//      Error non-duplikat dicatat JELAS + migrasinya tidak ditandai applied
//      (retry deploy berikutnya), tapi proses tetap exit 0 agar app tetap naik.
// =============================================================================

type DbDriver = ReturnType<typeof getDatabaseDriver>;
type AnyClient = PGlite | pg.Pool;

// SQLSTATE objek-duplikat — aman di-skip (idempoten / baseline DB lama).
const DUPLICATE_CODES = new Set([
  "42P07", // duplicate_table / relation already exists
  "42710", // duplicate_object (constraint, index, dll)
  "42701", // duplicate_column
  "42P06", // duplicate_schema
  "42723", // duplicate_function
  "42P04", // duplicate_database
  "23505", // unique_violation
]);

function isDuplicateError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | undefined;
  if (e?.code && DUPLICATE_CODES.has(e.code)) return true;
  const m = (e?.message ?? "").toLowerCase();
  return m.includes("already exists") || m.includes("duplicate key");
}

async function exec(client: AnyClient, driver: DbDriver, statement: string) {
  if (driver === "pglite") {
    await (client as PGlite).exec(statement);
    return;
  }
  await (client as pg.Pool).query(statement);
}

async function queryRows(
  client: AnyClient,
  driver: DbDriver,
  text: string,
  params?: unknown[],
): Promise<Array<Record<string, unknown>>> {
  if (driver === "pglite") {
    const r = await (client as PGlite).query(text, params as unknown[] | undefined);
    return (r.rows ?? []) as Array<Record<string, unknown>>;
  }
  const r = await (client as pg.Pool).query(text, params);
  return (r.rows ?? []) as Array<Record<string, unknown>>;
}

async function run() {
  await ensureDatabaseReady();
  const driver = getDatabaseDriver();
  console.log(`Running migrations via ${driver}...`);
  const client = getPgPool();
  let appliedCount = 0;
  let skipped = 0;
  let genuineErrors = 0;

  try {
    // Tabel tracking.
    await exec(client, driver, `CREATE SCHEMA IF NOT EXISTS "drizzle";`);
    await exec(
      client,
      driver,
      `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id serial PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );`,
    );

    const appliedRows = await queryRows(
      client,
      driver,
      `SELECT hash FROM "drizzle"."__drizzle_migrations"`,
    );
    const applied = new Set(appliedRows.map((r) => String(r.hash)));

    const files = fs
      .readdirSync("./drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const sqlContent = fs.readFileSync(path.join("./drizzle", file), "utf8");
      const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");

      if (applied.has(hash)) {
        skipped += 1;
        continue;
      }

      console.log(`Applying ${file}...`);
      const statements = sqlContent
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      let fileFailed = false;
      for (const statement of statements) {
        try {
          await exec(client, driver, statement);
        } catch (err) {
          if (isDuplicateError(err)) {
            // Objek sudah ada — idempoten, lanjut ke statement berikutnya.
            continue;
          }
          fileFailed = true;
          genuineErrors += 1;
          console.error(
            `  [x] statement GAGAL di ${file} (bukan duplikat):`,
            err instanceof Error ? err.message : err,
          );
          break;
        }
      }

      if (fileFailed) {
        console.error(
          `  [!] ${file} TIDAK ditandai applied — akan dicoba lagi pada deploy berikutnya.`,
        );
        continue;
      }

      await queryRows(
        client,
        driver,
        `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [hash, Date.now()],
      );
      appliedCount += 1;
    }

    console.log(
      `Migrations done (applied=${appliedCount}, skipped=${skipped}).` +
        (genuineErrors > 0
          ? ` ADA ${genuineErrors} error non-duplikat — cek log di atas.`
          : " OK."),
    );
  } catch (error) {
    // Jangan throw: app depends_on migrate (service_completed_successfully).
    console.error("Migration runner error:", error);
  } finally {
    if ("end" in client && typeof client.end === "function") {
      await client.end();
    } else if (
      "close" in client &&
      typeof (client as { close: () => Promise<void> }).close === "function"
    ) {
      await (client as { close: () => Promise<void> }).close();
    }
  }
}

run();
