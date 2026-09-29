// =============================================================================
// QA — Audit database & integritas data (HANYA BACA).
//
// Membandingkan skema Drizzle dengan DB nyata (tabel/kolom hilang, FK tanpa
// indeks, migrasi belum terterapkan) lalu menjalankan cek integritas data
// (uang, stok, produksi, meja, shift, poin). Tidak ada tulis ke DB.
//
// Pakai terhadap SALINAN DB (PGlite satu penulis — jangan ke .pglite-data asli
// saat server owner menyala):
//   $env:PGLITE_DATA_DIR=".tmp/qa-db"; npx tsx src/scripts/qa-db-audit.ts
// Keluar dengan kode 1 bila ada temuan level FAIL.
// =============================================================================
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

type Level = "PASS" | "WARN" | "FAIL" | "INFO";
type Finding = { area: string; check: string; level: Level; detail: string };

const findings: Finding[] = [];
function record(area: string, check: string, level: Level, detail = "") {
  findings.push({ area, check, level, detail });
}

async function main() {
  const { getTableConfig } = await import("drizzle-orm/pg-core");
  const { is } = await import("drizzle-orm");
  const { PgTable } = await import("drizzle-orm/pg-core");
  const { ensureDatabaseReady, getPgPool } = await import("@/db");
  const schema = await import("@/db/schema");

  await ensureDatabaseReady();
  const client = getPgPool() as unknown as {
    query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
    close?: () => Promise<void>;
    end?: () => Promise<void>;
  };
  const q = async (text: string, params?: unknown[]) => (await client.query(text, params)).rows;
  const scalar = async (text: string) => Number(Object.values((await q(text))[0] ?? { v: 0 })[0] ?? 0);

  // ---------------------------------------------------------------- migrasi
  const applied = new Set((await q(`SELECT hash FROM "drizzle"."__drizzle_migrations"`)).map((r) => String(r.hash)));
  const files = fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join("drizzle", f), "utf8")).digest("hex");
    return !applied.has(hash);
  });
  record(
    "DB",
    `Migrasi terterapkan (${files.length} file)`,
    pending.length ? "FAIL" : "PASS",
    pending.length ? `belum: ${pending.join(", ")}` : `terakhir ${files.at(-1)}`,
  );

  // ------------------------------------------------------ skema vs DB nyata
  const dbColumns = await q(
    `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const colMap = new Map<string, Map<string, string>>();
  for (const row of dbColumns) {
    const t = String(row.table_name);
    if (!colMap.has(t)) colMap.set(t, new Map());
    colMap.get(t)!.set(String(row.column_name), String(row.data_type));
  }
  const indexRows = await q(`SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public'`);
  const indexDefs = new Map<string, string[]>();
  for (const row of indexRows) {
    const t = String(row.tablename);
    if (!indexDefs.has(t)) indexDefs.set(t, []);
    indexDefs.get(t)!.push(String(row.indexdef));
  }

  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const fkWithoutIndex: string[] = [];
  const floatMoney: string[] = [];
  let tableCount = 0;
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    tableCount += 1;
    const cols = colMap.get(config.name);
    if (!cols) {
      missingTables.push(config.name);
      continue;
    }
    for (const column of config.columns) {
      if (!cols.has(column.name)) missingColumns.push(`${config.name}.${column.name}`);
      const type = cols.get(column.name) ?? "";
      if (
        /(price|total|amount|subtotal|cash|cost|wage|salary|fee|discount|tax|service|payout|balance|nominal)/.test(column.name) &&
        /(real|double)/.test(type)
      ) {
        floatMoney.push(`${config.name}.${column.name} (${type})`);
      }
    }
    for (const fk of config.foreignKeys) {
      const first = fk.reference().columns[0]?.name;
      if (!first) continue;
      const defs = indexDefs.get(config.name) ?? [];
      const covered = defs.some((def) => new RegExp(`\\(\\s*"?${first}"?[\\s,)]`).test(def));
      if (!covered) fkWithoutIndex.push(`${config.name}.${first}`);
    }
  }
  record("DB", `Tabel skema ada di DB (${tableCount})`, missingTables.length ? "FAIL" : "PASS", missingTables.join(", "));
  record("DB", "Kolom skema ada di DB", missingColumns.length ? "FAIL" : "PASS", missingColumns.join(", "));
  record("DB", "Kolom uang bertipe integer (bukan float)", floatMoney.length ? "WARN" : "PASS", floatMoney.join(", "));
  record(
    "DB",
    "FK punya indeks (performa join/hapus)",
    fkWithoutIndex.length ? "WARN" : "PASS",
    fkWithoutIndex.length ? `${fkWithoutIndex.length} FK: ${fkWithoutIndex.join(", ")}` : "",
  );

  // Unik untuk nomor dokumen inti.
  for (const [table, column] of [
    ["orders", "order_no"],
    ["kitchen_tickets", "ticket_no"],
    ["vouchers", "code"],
    ["cash_sessions", "code"],
    ["production_batches", "batch_no"],
  ] as const) {
    const defs = indexDefs.get(table) ?? [];
    const unique = defs.some((def) => /UNIQUE/i.test(def) && new RegExp(`\\(\\s*"?${column}"?\\s*\\)`).test(def));
    record("DB", `Unik ${table}.${column}`, unique ? "PASS" : "FAIL");
  }

  // ------------------------------------------------------ integritas data
  const check = async (area: string, name: string, sqlText: string, level: Level = "FAIL") => {
    try {
      const n = await scalar(sqlText);
      record(area, name, n === 0 ? "PASS" : level, n === 0 ? "" : `${n} baris`);
    } catch (error) {
      record(area, name, "WARN", `query gagal: ${error instanceof Error ? error.message : error}`);
    }
  };

  await check("Integritas", "order_items yatim (order hilang)", `SELECT count(*) FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL`);
  await check("Integritas", "line_total = unit_price × qty", `SELECT count(*) FROM order_items WHERE line_total <> unit_price * qty`);
  await check("Integritas", "qty item > 0", `SELECT count(*) FROM order_items WHERE qty <= 0`);
  await check(
    "Integritas",
    "subtotal order = Σ line_total item (order induk, bukan split)",
    `SELECT count(*) FROM orders o
       JOIN (SELECT order_id, sum(line_total) s FROM order_items GROUP BY order_id) x ON x.order_id = o.id
      WHERE o.subtotal <> x.s`,
    "WARN",
  );
  await check(
    "Integritas",
    "total = subtotal + service + tax − discount (toleransi pembulatan Rp100)",
    `SELECT count(*) FROM orders WHERE abs(total - (subtotal + service + tax - discount)) >= 100`,
    "WARN",
  );
  await check("Integritas", "nilai uang order tidak negatif", `SELECT count(*) FROM orders WHERE total < 0 OR subtotal < 0 OR discount < 0`);
  await check(
    "Integritas",
    "order lunas: Σ payment captured ≥ total",
    `SELECT count(*) FROM orders o
       LEFT JOIN (SELECT order_id, sum(amount) s FROM payments WHERE status = 'captured' GROUP BY order_id) p ON p.order_id = o.id
      WHERE o.status = 'paid' AND o.total > 0 AND coalesce(p.s, 0) < o.total AND o.parent_order_id IS NULL`,
    "WARN",
  );
  await check("Integritas", "stok inventory tidak negatif", `SELECT count(*) FROM inventory_items WHERE on_hand < 0`, "WARN");
  await check("Integritas", "stok lokasi tidak negatif", `SELECT count(*) FROM inventory_location_stocks WHERE on_hand < 0`, "WARN");
  await check("Integritas", "stok gudang WMS tidak negatif", `SELECT count(*) FROM wms_warehouse_stock WHERE qty < 0`, "WARN");
  await check(
    "Integritas",
    "tiket produksi aktif untuk order void/batal",
    `SELECT count(*) FROM kitchen_tickets k JOIN orders o ON o.id = k.order_id
      WHERE o.status IN ('void','voided','cancelled','rejected','refunded') AND k.status IN ('queue','cooking','ready')`,
  );
  await check(
    "Integritas",
    "item produksi aktif di tiket yang sudah selesai/batal",
    `SELECT count(*) FROM production_ticket_items i JOIN kitchen_tickets k ON k.id = i.ticket_id
      WHERE k.status IN ('delivered','cancelled') AND i.status NOT IN ('ready','cancelled','delivered')`,
    "WARN",
  );
  await check(
    "Integritas",
    "batch selesai: alokasi = total_qty (100%)",
    `SELECT count(*) FROM production_batches b
       LEFT JOIN (SELECT batch_id, sum(qty) s FROM production_batch_allocations GROUP BY batch_id) a ON a.batch_id = b.id
      WHERE b.status = 'completed' AND coalesce(a.s, 0) <> b.total_qty`,
  );
  await check("Integritas", "shift kas terbuka > 1", `SELECT greatest(count(*) - 1, 0) FROM cash_sessions WHERE status = 'open'`, "WARN");
  await check(
    "Integritas",
    "shift kas terbuka > 24 jam",
    `SELECT count(*) FROM cash_sessions WHERE status = 'open' AND opened_at < now() - interval '24 hours'`,
    "WARN",
  );
  await check(
    "Integritas",
    "meja terisi tanpa order aktif",
    `SELECT count(*) FROM table_sessions t LEFT JOIN orders o ON o.id = t.current_order_id
      WHERE t.status NOT IN ('empty','available','reserved','needs_cleaning','dirty','cleaning')
        AND (o.id IS NULL OR o.status IN ('paid','void','voided','cancelled','rejected','refunded'))`,
    "WARN",
  );
  await check("Integritas", "poin member tidak negatif", `SELECT count(*) FROM customers WHERE points < 0`);
  await check("Integritas", "voucher used_count ≤ usage_limit", `SELECT count(*) FROM vouchers WHERE usage_limit IS NOT NULL AND used_count > usage_limit`);
  await check("Integritas", "payment amount > 0", `SELECT count(*) FROM payments WHERE amount <= 0 AND status = 'captured'`, "WARN");
  await check(
    "Integritas",
    "staff_profiles tanpa user",
    `SELECT count(*) FROM staff_profiles s LEFT JOIN "user" u ON u.id = s.user_id WHERE u.id IS NULL`,
  );
  await check(
    "Integritas",
    "workstation valid",
    `SELECT count(*) FROM staff_profiles WHERE workstation IS NOT NULL AND workstation NOT IN ('bar','dapur','all','helper_bar','helper_dapur','helper_all')`,
  );

  // Terminal POS dengan kunci default dev (hash sha256 "garage-pos-dev-key").
  const devKeyHash = crypto.createHash("sha256").update("garage-pos-dev-key").digest("hex");
  const devTerminals = await scalar(
    `SELECT count(*) FROM pos_terminals WHERE status = 'active' AND api_key_hash = '${devKeyHash}'`,
  );
  // Sejak QA-audit kunci ini ditolak requirePosTerminal saat NODE_ENV=production,
  // jadi cukup peringatan: set GARAGE_POS_API_KEY lalu db:seed untuk rotasi.
  record(
    "Keamanan",
    "Terminal POS aktif memakai kunci default dev",
    devTerminals ? "WARN" : "PASS",
    devTerminals ? `${devTerminals} terminal (diblok di production; rotasi via GARAGE_POS_API_KEY)` : "",
  );

  // ------------------------------------------------------ ringkasan
  const counts = await q(
    `SELECT (SELECT count(*) FROM orders) orders, (SELECT count(*) FROM order_items) items,
            (SELECT count(*) FROM payments) payments, (SELECT count(*) FROM kitchen_tickets) tickets,
            (SELECT count(*) FROM customers) customers, (SELECT count(*) FROM menu_items) menu,
            (SELECT count(*) FROM "user") users`,
  );
  record("INFO", "Jumlah baris", "INFO", JSON.stringify(counts[0]));

  for (const f of findings) {
    console.log(`[${f.level.padEnd(4)}] ${f.area.padEnd(10)} ${f.check}${f.detail ? ` — ${f.detail}` : ""}`);
  }
  const summary = { PASS: 0, WARN: 0, FAIL: 0, INFO: 0 } as Record<Level, number>;
  for (const f of findings) summary[f.level] += 1;
  console.log(`\nRINGKASAN: PASS=${summary.PASS} WARN=${summary.WARN} FAIL=${summary.FAIL}`);
  await (client.close?.() ?? client.end?.());
  process.exit(summary.FAIL ? 1 : 0);
}

main().catch((error) => {
  console.error("GAGAL:", error instanceof Error ? error.stack : error);
  process.exit(2);
});
