#!/usr/bin/env node
// Import garage-data.sql (dump dari VPS Postgres) ke PGlite lokal.
// Strategy: TRUNCATE seluruh tabel public + drizzle, lalu execute INSERT dump.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.PGLITE_DATA_DIR?.trim() || path.resolve(process.cwd(), ".pglite-data");
const DUMP = path.resolve(process.cwd(), "garage-data.sql");

if (!fs.existsSync(DUMP)) {
  console.error(`Dump tidak ditemukan: ${DUMP}`);
  process.exit(1);
}

console.log(`PGlite dir : ${DATA_DIR}`);
console.log(`Dump file  : ${DUMP}`);

const db = new PGlite(DATA_DIR);
await db.waitReady;

const tablesRes = await db.query(`
  SELECT schemaname, tablename FROM pg_tables
  WHERE schemaname IN ('public','drizzle')
`);
const tables = tablesRes.rows.map((r) => `"${r.schemaname}"."${r.tablename}"`);
console.log(`Truncate ${tables.length} tabel...`);
if (tables.length) {
  await db.exec(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE;`);
}

const raw = fs.readFileSync(DUMP, "utf8");
const lines = raw.split(/\r?\n/);
const stmts = [];
let buf = "";
for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith("--") || t.startsWith("\\") || t.startsWith("SET ") || t.startsWith("SELECT pg_catalog.set_config")) {
    continue;
  }
  buf += line + "\n";
  if (t.endsWith(";")) {
    stmts.push(buf);
    buf = "";
  }
}

console.log(`Eksekusi ${stmts.length} statement INSERT...`);
let ok = 0;
let fail = 0;
const fails = [];
for (const s of stmts) {
  try {
    await db.exec(s);
    ok++;
  } catch (e) {
    fail++;
    if (fails.length < 5) fails.push({ msg: e.message, sample: s.slice(0, 200) });
  }
}

console.log(`Selesai: ${ok} sukses, ${fail} gagal.`);
if (fails.length) {
  console.log("Contoh error:");
  for (const f of fails) console.log(" -", f.msg, "\n   ", f.sample);
}

await db.close();
