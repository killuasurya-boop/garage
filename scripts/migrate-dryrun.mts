// Dry-run: apply seluruh drizzle/*.sql ke PGlite temp fresh untuk verify
// tidak ada file migrasi yang broken sebelum di-apply ke Supabase.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PGlite } from "@electric-sql/pglite";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supabase-dryrun-"));
console.log(`Temp DB: ${tmpDir}`);
const db = new PGlite(tmpDir);
await db.waitReady;

const files = fs
  .readdirSync("./drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort();
console.log(`Applying ${files.length} migrasi ke DB fresh...`);

let ok = 0;
let dupSkipped = 0;
const errors: Array<{ file: string; error: string; sql: string }> = [];

for (const file of files) {
  const sql = fs.readFileSync(path.join("./drizzle", file), "utf8");
  const stmts = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  let fileOk = true;
  for (const stmt of stmts) {
    try {
      await db.exec(stmt);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (/already exists|duplicate/i.test(msg)) {
        dupSkipped++;
        continue;
      }
      fileOk = false;
      errors.push({ file, error: msg.slice(0, 300), sql: stmt.slice(0, 200) });
      break;
    }
  }
  if (fileOk) ok++;
}

const tables = await db.query<{ table_name: string }>(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
);

console.log(`\n=== HASIL DRY-RUN ===`);
console.log(`✅ File sukses:   ${ok}/${files.length}`);
console.log(`⏭️  Statement dup: ${dupSkipped} (idempoten)`);
console.log(`❌ File error:    ${errors.length}`);
console.log(`🗂  Tabel dibuat:  ${tables.rows.length}`);

if (errors.length) {
  console.log(`\n=== ERROR DETAIL ===`);
  for (const e of errors.slice(0, 8)) {
    console.log(`\n${e.file}:\n  ERR: ${e.error}\n  SQL: ${e.sql}`);
  }
}

const key = [
  "user",
  "staff_profiles",
  "orders",
  "order_items",
  "menu_items",
  "customers",
  "member_accounts",
  "otp_verifications",
  "payroll_settings",
  "staff_daily_wages",
  "fee_pool_daily",
  "fee_pool_splits",
  "staff_attendance_v2",
  "wms_product",
  "wms_recipe",
];
console.log(`\n=== TABEL KUNCI ===`);
const set = new Set(tables.rows.map((r) => r.table_name));
for (const k of key) console.log(`  ${set.has(k) ? "✅" : "❌"} ${k}`);

await db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
process.exit(errors.length ? 2 : 0);
