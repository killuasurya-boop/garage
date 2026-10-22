import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { buildResetPlan, applyGrandOpeningReset } from "@/db/reset-grand-opening";
import { drizzle } from "drizzle-orm/pglite";

const ddl = fs.readFileSync("drizzle/0147_closing_replenishment.sql", "utf8");
describe("Closing additive migration and historical protection", () => {
  it("extends the exact W2 snapshot without changing POS or existing WMS tables", () => {
    const prev = JSON.parse(fs.readFileSync("drizzle/meta/0146_snapshot.json", "utf8"));
    const next = JSON.parse(fs.readFileSync("drizzle/meta/0147_snapshot.json", "utf8"));
    expect(next.prevId).toBe(prev.id);
    for (const [name, table] of Object.entries(prev.tables)) expect(next.tables[name], name).toEqual(table);
    const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8")).entries;
    const before = journal.findIndex((e: { tag: string }) => e.tag === "0146_master_import");
    expect(journal[before + 1].tag).toBe("0147_closing_replenishment");
    expect(journal[before + 1].when).toBeGreaterThan(journal[before].when);
    expect(ddl).not.toMatch(/^(?:DROP|TRUNCATE|DELETE FROM|UPDATE)\s/im);
  });

  it("executes every statement strictly; preserves master data and blocks resets once closing exists", async () => {
    const client = new PGlite();
    try {
      await client.exec(`CREATE TABLE "user" (id text PRIMARY KEY); CREATE TABLE outlets (id uuid PRIMARY KEY); CREATE TABLE wms_warehouse (id uuid PRIMARY KEY); CREATE TABLE wms_product (id uuid PRIMARY KEY); CREATE TABLE wms_batch (id uuid PRIMARY KEY); CREATE TABLE wms_supplier (id uuid PRIMARY KEY); CREATE TABLE menu_items (id text PRIMARY KEY, price integer); INSERT INTO menu_items VALUES ('protected', 20000);`);
      for (const statement of ddl.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await client.exec(statement);
      const tables = await client.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'wms_closing_%'");
      expect(tables.rows).toHaveLength(11);
      const names = tables.rows.map(t => t.table_name);
      const plan = buildResetPlan([...names, "menu_items", "wms_batch"], [{child:"wms_closing_allocation",parent:"wms_batch",onDelete:"a"}], {resetMemberPoints:false});
      expect(plan.unknown).toEqual([]);
      expect(plan.keep).toEqual(expect.arrayContaining(names));
      expect(plan.blockers.some(s => s.includes("wms_closing_allocation"))).toBe(true);
      await client.exec(`INSERT INTO "user" VALUES ('owner'); INSERT INTO outlets VALUES ('10000000-0000-4000-8000-000000000001'); INSERT INTO wms_warehouse VALUES ('20000000-0000-4000-8000-000000000001'); INSERT INTO wms_closing_request (doc,outlet_id,warehouse_id,division,business_date,needed_date,created_by) VALUES ('CLS-TEST','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','bar','2026-10-23','2026-10-24','owner');`);
      await expect(client.exec(`INSERT INTO wms_closing_request (doc,outlet_id,warehouse_id,division,business_date,needed_date,created_by) VALUES ('CLS-DUP','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','bar','2026-10-23','2026-10-24','owner');`)).rejects.toThrow();
      await expect(applyGrandOpeningReset(drizzle(client) as never, plan, {resetMemberPoints:false})).rejects.toThrow(/histori closing/);
      expect((await client.query<{ price:number }>("SELECT price FROM menu_items WHERE id='protected'")).rows[0].price).toBe(20000);
      expect((await client.query("SELECT id FROM wms_closing_request")).rows).toHaveLength(1);
    } finally { await client.close(); }
  });
});
