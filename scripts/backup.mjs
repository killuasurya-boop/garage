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
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";

const BACKUP_DIR = process.env.GARAGE_BACKUP_DIR ?? "./backups";
const RETAIN_DAYS = Number(process.env.GARAGE_BACKUP_RETAIN_DAYS ?? 14);
const DATABASE_URL = process.env.DATABASE_URL;

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

async function cleanupOld(dir) {
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".dump")) continue;
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

async function main() {
  const startedAt = Date.now();
  const dir = resolve(BACKUP_DIR);
  await mkdir(dir, { recursive: true });

  const fileName = `garage-${nowStamp()}.dump`;
  const fullPath = resolve(dir, fileName);

  console.log(`[backup] Starting → ${fullPath}`);

  try {
    await runPgDump(fullPath);
  } catch (err) {
    console.error(`[backup] FAILED: ${err.message}`);
    process.exit(2);
  }

  const stats = await stat(fullPath);
  const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`[backup] OK — ${sizeMb} MB in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  const s3Key = await uploadToS3(fullPath);

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
