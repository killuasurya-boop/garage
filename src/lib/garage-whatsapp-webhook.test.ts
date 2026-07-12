import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { whatsappConversations, whatsappMessages } from "@/db/schema";
import { handleWhatsappInbound } from "@/lib/garage-whatsapp-webhook";
import { updateWhatsappDeliveryStatus } from "@/lib/garage-whatsapp-messaging";

let getPgPool: () => unknown;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "garage-wa-webhook-"));
  process.env.GARAGE_DB_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = tmpDir;
  const db = await import("@/db");
  getDbRef = db.getDb;
  getPgPool = db.getPgPool as () => unknown;
  await db.ensureDatabaseReady();
  const client = getPgPool() as { exec: (s: string) => Promise<unknown> };
  const files = fs.readdirSync("./drizzle").filter((f) => f.endsWith(".sql")).sort();
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
        /* idempoten */
      }
    }
  }
}, 60_000);

let getDbRef: typeof getDb;

afterAll(async () => {
  try {
    const pool = getPgPool() as { end?: () => Promise<unknown> };
    await pool?.end?.();
  } catch {
    /* abaikan */
  }
  try {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* abaikan */
  }
});

describe("webhook inbound", () => {
  it("upsert conversation + insert pesan inbound", async () => {
    await handleWhatsappInbound([{ from: "62812000111", body: "Halo", messageId: "wamid.in.test" }]);
    const conv = await getDbRef()
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.phoneNumber, "62812000111"))
      .limit(1);
    expect(conv.length).toBe(1);
    expect(conv[0].unreadCount).toBeGreaterThanOrEqual(1);
    expect(conv[0].lastInboundAt).not.toBeNull();
    const msgs = await getDbRef()
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conv[0].id));
    expect(msgs.some((m) => m.direction === "inbound" && m.body === "Halo")).toBe(true);
  });

  it("delivery status ter-mirror ke pesan inbox", async () => {
    await handleWhatsappInbound([{ from: "62812000999", body: "Test", messageId: "wamid.flow.1" }]);
    const conv = await getDbRef()
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.phoneNumber, "62812000999"))
      .limit(1);
    await updateWhatsappDeliveryStatus("wamid.flow.1", "delivered");
    const msgs = await getDbRef()
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conv[0].id));
    expect(msgs[0].status).toBe("delivered");
  });
});
