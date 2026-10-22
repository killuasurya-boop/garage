import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { buildResetPlan } from "@/db/reset-grand-opening";

const sql = fs.readFileSync("drizzle/0146_master_import.sql", "utf8");

describe("W2 integration after the event migration", () => {
  it("preserves the event snapshot chain and appends an increasing journal entry", () => {
    const previous = JSON.parse(fs.readFileSync("drizzle/meta/0145_snapshot.json", "utf8"));
    const current = JSON.parse(fs.readFileSync("drizzle/meta/0146_snapshot.json", "utf8"));
    const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8")).entries;
    expect(current.prevId).toBe(previous.id);
    expect(current.tables["public.event_menu_entries"]).toEqual(previous.tables["public.event_menu_entries"]);
    expect(current.tables["public.master_imports"]).toBeDefined();
    expect(current.tables["public.master_crosswalk"]).toBeDefined();
    const position = journal.findIndex((e: { tag: string }) => e.tag === "0145_event_menu_commerce");
    const last = journal.slice(position, position + 2);
    expect(last.map((e: { tag: string }) => e.tag)).toEqual(["0145_event_menu_commerce", "0146_master_import"]);
    expect(last[1].when).toBeGreaterThan(last[0].when);
    expect(new Set(journal.map((e: { idx: number }) => e.idx)).size).toBe(journal.length);
    expect(new Set(journal.map((e: { tag: string }) => e.tag)).size).toBe(journal.length);
  });

  it("executes every new DDL statement strictly and preserves existing event data", async () => {
    const db = new PGlite();
    try {
      // Only prerequisites needed by the event and import additive migrations.
      await db.exec(`CREATE TABLE "user" (id text PRIMARY KEY); CREATE TABLE events (id uuid PRIMARY KEY); CREATE TABLE outlets (id uuid PRIMARY KEY); CREATE TABLE menu_items (id text PRIMARY KEY); CREATE TABLE order_items (id uuid PRIMARY KEY); CREATE TABLE orders (id uuid PRIMARY KEY);`);
      const eventSql = fs.readFileSync("drizzle/0145_event_menu_commerce.sql", "utf8");
      for (const stmt of eventSql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await db.exec(stmt);
      await db.exec(`INSERT INTO events VALUES ('00000000-0000-4000-8000-000000000001'); INSERT INTO outlets VALUES ('00000000-0000-4000-8000-000000000002');`);
      await db.exec(`INSERT INTO event_menu_entries (id,event_id,kind,name,price,status,starts_at,ends_at,"groups") VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','bundle','Event existing',25000,'active','2026-10-24T08:00Z','2026-10-24T16:00Z','[{}]');`);
      // Unlike the legacy test harness, do not suppress migration errors.
      for (const stmt of sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await db.exec(stmt);
      const event = await db.query<{ name: string }>("SELECT name FROM event_menu_entries");
      expect(event.rows[0].name).toBe("Event existing");
      await db.exec(`INSERT INTO master_imports (file_name,file_hash,mode) VALUES ('test.xlsx','hash','apply'); INSERT INTO master_crosswalk (kind,source_key,status) VALUES ('material','KIT-001','created');`);
      await expect(db.exec(`INSERT INTO master_crosswalk (kind,source_key,status) VALUES ('material','KIT-001','created')`)).rejects.toThrow();
      await expect(db.exec(`INSERT INTO master_crosswalk (kind,source_key,status,import_id) VALUES ('material','KIT-002','created','00000000-0000-4000-8000-000000000099')`)).rejects.toThrow();
      const indexes = await db.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE tablename IN ('master_imports','master_crosswalk')");
      expect(indexes.rows.map(r => r.indexname)).toContain("master_crosswalk_kind_key_unique");
    } finally { await db.close(); }
  });

  it("keeps import decisions and preserves the event quota reset classification", () => {
    const plan = buildResetPlan(["master_imports", "master_crosswalk", "event_menu_entries"], [], { resetMemberPoints: false });
    expect(plan.keep).toEqual(expect.arrayContaining(["master_imports", "master_crosswalk"]));
    expect(plan.reset).toContain("event_menu_entries");
    expect(plan.clear).not.toContain("master_imports");
  });
});
