// Health-check pasca migrasi Supabase.
// Pakai: DATABASE_URL='postgresql://...supabase.com:5432/postgres' \
//         npx tsx scripts/supabase-verify.mts
//
// Cek: koneksi hidup, ~131 tabel ada, tabel kunci ada, migrasi terekam
// di drizzle.__drizzle_migrations. Aman dijalankan berulang (read-only).

import pkg from "pg";
const { Client } = pkg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL kosong. Set env dulu (pakai port 5432 DIRECT).");
  process.exit(1);
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
} catch (e) {
  console.error("❌ Gagal koneksi:", (e as Error).message);
  process.exit(2);
}

console.log("✅ Koneksi Supabase OK");

const { rows: version } = await client.query<{ version: string }>("SELECT version()");
console.log(`🐘 ${version[0].version.split(",")[0]}`);

const { rows: tables } = await client.query<{ table_name: string }>(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
);
console.log(`🗂  Tabel di public schema: ${tables.length}`);

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
const set = new Set(tables.map((r) => r.table_name));
let missing = 0;
console.log(`\n=== TABEL KUNCI ===`);
for (const k of key) {
  const has = set.has(k);
  console.log(`  ${has ? "✅" : "❌"} ${k}`);
  if (!has) missing++;
}

// Migrasi tracking
try {
  const { rows: mig } = await client.query<{ tag: string }>(
    `SELECT tag FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5`,
  );
  console.log(`\n📜 5 migrasi terakhir tercatat:`);
  for (const m of mig) console.log(`  - ${m.tag}`);
} catch {
  console.log(`\n⚠️  Tabel drizzle.__drizzle_migrations belum ada (belum di-migrate?)`);
}

// Row count contoh (verify DB berfungsi)
try {
  const { rows } = await client.query<{ count: string }>(`SELECT COUNT(*) FROM "user"`);
  console.log(`\n👥 Row di tabel user: ${rows[0].count}`);
} catch {
  /* ignore */
}

await client.end();
console.log(`\n${missing === 0 ? "🎉 SEMUA HIJAU" : `⚠️  ${missing} tabel kunci hilang`}`);
process.exit(missing === 0 ? 0 : 3);
