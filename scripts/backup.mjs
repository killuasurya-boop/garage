#!/usr/bin/env node
// Garage DB Backup Runner — pg_dump → local file → (opsional) upload S3-compat.
//
// Setup cron (Linux/Mac):
//   0 2 * * * cd /path/to/garage && node --env-file=.env.local scripts/backup.mjs
//
// Setup Task Scheduler (Windows):
//   Action: node, Args: scripts/backup.mjs, Start in: <project root>
//
// Env yang dipake:
//   DATABASE_URL              — wajib
//   GARAGE_BACKUP_DIR         — default ./backups
//   GARAGE_BACKUP_RETAIN_DAYS — default 14 (hapus backup lebih lama)
//   GARAGE_BACKUP_S3_BUCKET   — opsional, upload ke S3-compatible
//   GARAGE_BACKUP_S3_PREFIX   — opsional, default "garage-backups"
//
// Output: file *.dump (PostgreSQL custom format), bisa di-restore dengan:
//   pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner backup.dump

import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const BACKUP_DIR = process.env.GARAGE_BACKUP_DIR ?? "./backups";
const RETAIN_DAYS = Number(process.env.GARAGE_BACKUP_RETAIN_DAYS ?? 14);
const DATABASE_URL = process.env.DATABASE_URL;
const GARAGE_DB_DRIVER = process.env.GARAGE_DB_DRIVER?.trim().toLowerCase();

if (!DATABASE_URL) {
  console.error("[backup] DATABASE_URL belum di-set. Aborting.");
  process.exit(1);
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function runPgDump(outputPath) {
  return new Promise((resolveFn, rejectFn) => {
    const args = [
      DATABASE_URL,
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--compress=9",
      `--file=${outputPath}`,
    ];
    const proc = spawn("pg_dump", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", (err) => {
      rejectFn(new Error(`pg_dump tidak ketemu di PATH: ${err.message}`));
    });
    proc.on("close", (code) => {
      if (code === 0) resolveFn();
      else rejectFn(new Error(`pg_dump exit ${code}: ${stderr}`));
    });
  });
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString("hex")}'`;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function runSqlFallbackBackup(outputPath) {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("sslmode=") || DATABASE_URL.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await client.connect();
  try {
    const tableResult = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const chunks = [
      "-- GARAGE fallback SQL backup",
      `-- Generated: ${new Date().toISOString()}`,
      "-- Restore with: psql \"$DATABASE_URL\" < this-file.sql",
      "BEGIN;",
      "SET session_replication_role = replica;",
      "",
    ];

    for (const table of tableResult.rows) {
      const qualified = `${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`;
      const columnsResult = await client.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `,
        [table.table_schema, table.table_name],
      );
      const columns = columnsResult.rows.map((row) => row.column_name);
      if (!columns.length) continue;

      const rows = await client.query(`SELECT * FROM ${qualified}`);
      chunks.push(`-- ${qualified}: ${rows.rowCount} row(s)`);
      chunks.push(`TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE;`);
      for (const row of rows.rows) {
        const columnSql = columns.map(quoteIdent).join(", ");
        const valueSql = columns.map((column) => sqlLiteral(row[column])).join(", ");
        chunks.push(`INSERT INTO ${qualified} (${columnSql}) VALUES (${valueSql});`);
      }
      chunks.push("");
    }

    chunks.push("SET session_replication_role = DEFAULT;");
    chunks.push("COMMIT;");
    chunks.push("");
    await writeFile(outputPath, chunks.join("\n"), "utf8");
  } finally {
    await client.end();
  }
}

async function runPgliteSqlBackup(outputPath) {
  const client = new PGlite(resolve(".garage-db"));
  await client.waitReady;
  try {
    const tableResult = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const chunks = [
      "-- GARAGE PGlite SQL backup",
      `-- Generated: ${new Date().toISOString()}`,
      "-- Restore into PostgreSQL/PGlite with psql-compatible tooling.",
      "BEGIN;",
      "",
    ];

    for (const table of tableResult.rows) {
      const qualified = `${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`;
      const columnsResult = await client.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `,
        [table.table_schema, table.table_name],
      );
      const columns = columnsResult.rows.map((row) => row.column_name);
      if (!columns.length) continue;

      const rows = await client.query(`SELECT * FROM ${qualified}`);
      chunks.push(`-- ${qualified}: ${rows.rows.length} row(s)`);
      chunks.push(`TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE;`);
      for (const row of rows.rows) {
        const columnSql = columns.map(quoteIdent).join(", ");
        const valueSql = columns.map((column) => sqlLiteral(row[column])).join(", ");
        chunks.push(`INSERT INTO ${qualified} (${columnSql}) VALUES (${valueSql});`);
      }
      chunks.push("");
    }

    chunks.push("COMMIT;");
    chunks.push("");
    await writeFile(outputPath, chunks.join("\n"), "utf8");
  } finally {
    await client.close();
  }
}

async function cleanupOld(dir) {
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!/\.(dump|sql|backup)$/i.test(file)) continue;
      const fullPath = join(dir, file);
      const stats = await stat(fullPath);
      if (stats.mtimeMs < cutoff) {
        await unlink(fullPath);
        deleted += 1;
      }
    }
  } catch (err) {
    console.warn(`[backup] Cleanup failed: ${err.message}`);
  }
  return deleted;
}

async function uploadToS3(filePath) {
  const bucket = process.env.GARAGE_BACKUP_S3_BUCKET;
  if (!bucket) return null;

  const prefix = process.env.GARAGE_BACKUP_S3_PREFIX ?? "garage-backups";
  const fileName = filePath.split(/[\\/]/).pop();
  const key = `${prefix}/${fileName}`;

  return new Promise((resolveFn) => {
    const proc = spawn("aws", ["s3", "cp", filePath, `s3://${bucket}/${key}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", () => {
      console.warn("[backup] aws CLI tidak ketemu, skip upload S3.");
      resolveFn(null);
    });
    proc.on("close", (code) => {
      if (code === 0) {
        console.log(`[backup] Uploaded → s3://${bucket}/${key}`);
        resolveFn(key);
      } else {
        console.warn(`[backup] S3 upload failed (exit ${code}): ${stderr}`);
        resolveFn(null);
      }
    });
  });
}

async function copyToOffsite(filePath) {
  const offsiteDir = process.env.GARAGE_BACKUP_OFFSITE_DIR?.trim();
  if (!offsiteDir) return null;

  const destinationDir = resolve(offsiteDir);
  await mkdir(destinationDir, { recursive: true });
  const fileName = filePath.split(/[\\/]/).pop();
  const destination = join(destinationDir, fileName);
  await copyFile(filePath, destination);
  console.log(`[backup] Offsite copy → ${destination}`);
  return destination;
}

async function main() {
  const startedAt = Date.now();
  const dir = resolve(BACKUP_DIR);
  await mkdir(dir, { recursive: true });

  const fileName = `garage-${nowStamp()}.dump`;
  const fullPath = resolve(dir, fileName);

  console.log(`[backup] Starting → ${fullPath}`);

  if (GARAGE_DB_DRIVER === "pglite" || GARAGE_DB_DRIVER === "local" || !DATABASE_URL) {
    const fallbackPath = fullPath.replace(/\.dump$/i, ".sql");
    await runPgliteSqlBackup(fallbackPath);
    const fallbackStats = await stat(fallbackPath);
    console.log(`[backup] OK — ${(fallbackStats.size / 1024 / 1024).toFixed(2)} MB PGlite SQL`);
    const offsiteCopy = await copyToOffsite(fallbackPath);
    const deleted = await cleanupOld(dir);
    console.log(
      JSON.stringify({
        ok: true,
        file: fallbackPath,
        sizeBytes: fallbackStats.size,
        s3Key: null,
        offsiteCopy,
        retainDays: RETAIN_DAYS,
        pruned: deleted,
        fallback: "pglite-sql",
        durationMs: Date.now() - startedAt,
      }),
    );
    return;
  }

  try {
    await runPgDump(fullPath);
  } catch (err) {
    if (!String(err.message).includes("pg_dump tidak ketemu")) {
      console.error(`[backup] FAILED: ${err.message}`);
      process.exit(2);
    }

    const fallbackPath = fullPath.replace(/\.dump$/i, ".sql");
    console.warn(`[backup] pg_dump tidak tersedia, fallback ke SQL backup: ${fallbackPath}`);
    try {
      await runSqlFallbackBackup(fallbackPath);
    } catch (fallbackErr) {
      console.error(`[backup] FALLBACK FAILED: ${fallbackErr.message}`);
      process.exit(2);
    }

    const fallbackStats = await stat(fallbackPath);
    console.log(`[backup] OK â€” ${(fallbackStats.size / 1024 / 1024).toFixed(2)} MB fallback SQL`);
    const s3Key = await uploadToS3(fallbackPath);
    const offsiteCopy = await copyToOffsite(fallbackPath);
    const deleted = await cleanupOld(dir);
    console.log(
      JSON.stringify({
        ok: true,
        file: fallbackPath,
        sizeBytes: fallbackStats.size,
        s3Key,
        offsiteCopy,
        retainDays: RETAIN_DAYS,
        pruned: deleted,
        fallback: "sql",
        durationMs: Date.now() - startedAt,
      }),
    );
    return;
  }

  const stats = await stat(fullPath);
  const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`[backup] OK — ${sizeMb} MB in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  const s3Key = await uploadToS3(fullPath);
  const offsiteCopy = await copyToOffsite(fullPath);

  const deleted = await cleanupOld(dir);
  if (deleted > 0) {
    console.log(`[backup] Pruned ${deleted} backup(s) older than ${RETAIN_DAYS} days.`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      file: fullPath,
      sizeBytes: stats.size,
      s3Key,
      offsiteCopy,
      retainDays: RETAIN_DAYS,
      pruned: deleted,
      durationMs: Date.now() - startedAt,
    }),
  );
}

main().catch((err) => {
  console.error("[backup] Uncaught:", err);
  process.exit(99);
});
