import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// =============================================================================
// Harness DB untuk test integrasi Garage OS. Membuat PGlite sementara yang
// TERISOLASI per file test (worker vitest sendiri-sendiri), menerapkan seluruh
// migrasi drizzle, dan menyediakan seed dasar (outlet, kasir, menu, kas).
// Aman untuk CI — tidak menyentuh DB lokal/produksi.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GarageTestDb = {
  tmpDir: string;
  getDb: () => any;
  getPgPool: () => any;
  schema: any;
};

export async function setupGarageTestDb(): Promise<GarageTestDb> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "garage-itest-"));
  process.env.GARAGE_DB_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = tmpDir;
  // Tes tidak boleh menyalin backup ke folder luar sungguhan (Google Drive owner).
  delete process.env.GARAGE_BACKUP_OFFSITE_DIR;

  const db = await import("@/db");
  await db.ensureDatabaseReady();

  // Terapkan semua migrasi (pola sama dgn migrate.ts: split statement-breakpoint,
  // abaikan error idempoten/duplikat).
  const client = db.getPgPool() as any;
  const files = fs
    .readdirSync("./drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join("./drizzle", file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      try {
        await client.exec(stmt);
      } catch {
        /* objek sudah ada / idempoten — abaikan */
      }
    }
  }

  // 0150 = data satu acara (Garage Coffee Event 24 Okt 2026), bukan skema → buang supaya suite lain
  // tidak melihat event tambahan. Tes seed-nya menjalankan ulang migrasi itu sendiri.
  for (const stmt of [
    `DELETE FROM "event_menu_entries" WHERE "event_id" IN (SELECT "id" FROM "events" WHERE "slug" = 'garage-coffee-event-2026-10-24')`,
    `DELETE FROM "app_settings" WHERE "key" = 'digitalMenu.featuredEventId' AND "updated_by" = 'migration-0150'`,
    `DELETE FROM "audit_logs" WHERE "action" = 'Seed event menu (Menu_Event_GARAGE_1.xlsx)'`,
    `DELETE FROM "events" WHERE "slug" = 'garage-coffee-event-2026-10-24'`,
  ]) {
    try {
      await client.exec(stmt);
    } catch {
      /* tabel belum ada di harness lama — abaikan */
    }
  }

  return { tmpDir, getDb: db.getDb, getPgPool: db.getPgPool, schema: db.schema };
}

export async function teardownGarageTestDb(t: GarageTestDb) {
  try {
    await t.getPgPool()?.end?.();
  } catch {
    /* abaikan */
  }
  try {
    if (t.tmpDir) fs.rmSync(t.tmpDir, { recursive: true, force: true });
  } catch {
    /* abaikan */
  }
}

/**
 * Seed dasar: 1 outlet, 1 user kasir, menu kopi (drink) + nasi (food) masing
 * varian "reg", dan 1 cash session terbuka. Mengembalikan id penting.
 */
export async function seedGarageBasics(t: GarageTestDb, opts?: { userId?: string }) {
  const d = t.getDb();
  const { schema } = t;
  const userId = opts?.userId ?? "user-itest";

  const [outlet] = await d
    .insert(schema.outlets)
    .values({ code: "TST", name: "Outlet Test" })
    .returning();

  await d
    .insert(schema.user)
    .values({ id: userId, name: "Staff Test", email: `${userId}@garage.id` });

  await d.insert(schema.menuItems).values([
    { id: "itm-coffee", name: "Kopi Test", category: "Coffee", section: "Coffee", prep: "5m" },
    { id: "itm-food", name: "Nasi Test", category: "Makanan", section: "Makanan", prep: "15m" },
  ]);
  await d.insert(schema.menuVariants).values([
    { itemId: "itm-coffee", variantId: "reg", label: "Regular", price: 20_000 },
    { itemId: "itm-food", variantId: "reg", label: "Regular", price: 30_000 },
  ]);
  await d.insert(schema.cashSessions).values({
    code: "CS-ITEST",
    openingCash: 100_000,
    expectedCash: 100_000,
    outletId: outlet.id,
    openedBy: userId,
    status: "open",
  });

  return { outletId: outlet.id, userId };
}
