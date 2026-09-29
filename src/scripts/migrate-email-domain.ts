// Skrip operator: ganti domain email akun @garage.co.id → @garage.id di DB.
// Menyisir SEMUA kolom teks bernama *email* (user login, member, log login,
// dll). Akun absen (@absen.garage.local) & bot internal tidak tersentuh.
//
// Dry-run (default, hanya menghitung):
//   npx tsx src/scripts/migrate-email-domain.ts
// Terapkan (server Garage harus MATI — PGlite satu penulis; backup dulu):
//   npx tsx src/scripts/migrate-email-domain.ts --apply
//
// Password & sesi tidak berubah (akun Better Auth terikat userId, bukan email);
// user cukup login memakai email baru.
import { sql } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db";

const FROM = "@garage.co.id";
const TO = "@garage.id";

type Row = Record<string, unknown>;

function rowsOf(result: unknown): Row[] {
  return ((result as { rows?: Row[] }).rows ?? (result as Row[])) || [];
}

async function main() {
  const apply = process.argv.includes("--apply");
  await ensureDatabaseReady();
  const db = getDb();

  const columns = rowsOf(
    await db.execute(sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and column_name ilike '%email%'
        and data_type in ('text', 'character varying')
      order by table_name, column_name
    `),
  ).map((row) => ({ table: String(row.table_name), column: String(row.column_name) }));

  // Login email unik — pastikan target belum dipakai akun lain.
  const conflicts = rowsOf(
    await db.execute(sql`
      select a.email as old_email, b.email as new_email
      from "user" a
      join "user" b on lower(b.email) = lower(replace(a.email, ${FROM}, ${TO}))
      where a.email ilike ${"%" + FROM}
    `),
  );
  if (conflicts.length) {
    console.error("KONFLIK — email tujuan sudah dipakai akun lain:");
    for (const c of conflicts) console.error(`  ${c.old_email} → ${c.new_email}`);
    process.exit(3);
  }

  let total = 0;
  for (const { table, column } of columns) {
    const target = sql.raw(`"${table}"."${column}"`);
    const [count] = rowsOf(
      await db.execute(
        sql`select count(*)::int as n from ${sql.raw(`"${table}"`)} where ${target} ilike ${"%" + FROM}`,
      ),
    );
    const n = Number(count?.n ?? 0);
    if (!n) continue;
    total += n;
    console.log(`${apply ? "UBAH" : "AKAN UBAH"} ${table}.${column}: ${n} baris`);
    if (apply) {
      await db.execute(
        sql`update ${sql.raw(`"${table}"`)} set ${sql.raw(`"${column}"`)} = regexp_replace(${target}, ${"@garage\\.co\\.id$"}, ${TO}, 'i') where ${target} ilike ${"%" + FROM}`,
      );
    }
  }

  if (apply) {
    const users = rowsOf(
      await db.execute(sql`select email from "user" where email ilike ${"%" + TO} order by email`),
    );
    console.log(`SELESAI: ${total} baris diubah. Akun login @garage.id sekarang:`);
    for (const u of users) console.log(`  ${u.email}`);
  } else {
    console.log(`Dry-run: ${total} baris akan diubah. Jalankan dengan --apply untuk menerapkan.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERR:", e?.message || e);
    process.exit(1);
  });
