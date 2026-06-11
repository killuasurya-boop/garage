import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
const DATA_DIR = process.env.PGLITE_DATA_DIR?.trim() || path.resolve(process.cwd(), ".pglite-data");
const db = new PGlite(DATA_DIR);
await db.waitReady;
const tables = ["menu_items","menu_variants","inventory_items","customers","orders","staff_profiles","site_assets"];
for (const t of tables) {
  try {
    const r = await db.query(`SELECT COUNT(*)::int AS n FROM public."${t}"`);
    console.log(`${t.padEnd(22)} ${r.rows[0].n}`);
  } catch (e) {
    console.log(`${t.padEnd(22)} ERR ${e.message}`);
  }
}
await db.close();
