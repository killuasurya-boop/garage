#!/usr/bin/env node
// Backfill SKU produk menu yang masih NULL. Format: <PREFIX>-<urut 3 digit>.
// Coffee=COF, Non-Coffee=NCOF, Makanan=FOOD, Cemilan=SNCK, lainnya=GEN.
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";

const DATA_DIR =
  process.env.PGLITE_DATA_DIR?.trim() || path.resolve(process.cwd(), ".pglite-data");

const PREFIX = {
  Coffee: "COF",
  "Non-Coffee": "NCOF",
  Makanan: "FOOD",
  Cemilan: "SNCK",
};
const prefixFor = (cat) => PREFIX[cat] || "GEN";

const db = new PGlite(DATA_DIR);
await db.waitReady;

// Cari nomor urut tertinggi yang sudah dipakai per prefix (kalau ada sebagian).
const existing = await db.query(
  `SELECT sku FROM public.menu_items WHERE sku IS NOT NULL`,
);
const maxSeq = {};
for (const row of existing.rows) {
  const m = /^([A-Z]+)-(\d+)$/.exec(row.sku || "");
  if (!m) continue;
  const [, pfx, num] = m;
  maxSeq[pfx] = Math.max(maxSeq[pfx] || 0, Number(num));
}

// Ambil produk tanpa SKU, urut kategori → sortOrder → nama (deterministik).
const rows = await db.query(
  `SELECT id, name, category FROM public.menu_items
   WHERE sku IS NULL
   ORDER BY category ASC, sort_order ASC, name ASC`,
);

let updated = 0;
for (const row of rows.rows) {
  const pfx = prefixFor(row.category);
  const next = (maxSeq[pfx] || 0) + 1;
  maxSeq[pfx] = next;
  const sku = `${pfx}-${String(next).padStart(3, "0")}`;
  await db.query(`UPDATE public.menu_items SET sku = $1 WHERE id = $2`, [sku, row.id]);
  updated++;
}

console.log(`Backfill selesai: ${updated} produk dapat SKU.`);

// Ringkasan per prefix
const summary = await db.query(
  `SELECT split_part(sku,'-',1) AS pfx, count(*)::int AS n
   FROM public.menu_items WHERE sku IS NOT NULL GROUP BY 1 ORDER BY 1`,
);
for (const r of summary.rows) console.log(`  ${r.pfx.padEnd(5)} ${r.n}`);

const sample = await db.query(
  `SELECT sku, name FROM public.menu_items WHERE sku IS NOT NULL ORDER BY sku LIMIT 6`,
);
console.log("Contoh:");
for (const r of sample.rows) console.log(`  ${r.sku}  ${r.name}`);

await db.close();
