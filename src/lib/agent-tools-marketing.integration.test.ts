import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// M3g: tool MCP Marketing + Notifikasi. Promo lewat konfirmasi (R2), terbit ke
// media sosial berhenti di preview tanpa konfirmasi (R3), notifikasi hanya internal.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
const OWNER = "user-m3g-owner";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

function as(role: string): GarageSession {
  return {
    user: { id: OWNER, name: "Owner M3g", email: `${OWNER}@garage.id` },
    profile: { id: `sp-${OWNER}`, role, shiftLabel: "Pagi", deviceLabel: "Laptop", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" } },
  } as unknown as GarageSession;
}
const owner = () => as("Owner");

async function call(session: GarageSession, name: string, args: Record<string, unknown>) {
  const { runToolWithConfirmation } = await import("@/lib/mcp-confirmation");
  return (await runToolWithConfirmation({ session, name, rawArgs: args, ctx, oauthClientId: null })) as any;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("M3g — tool Marketing & Notifikasi", () => {
  it("ubah_status_promo: preview menampilkan nilai; konfirmasi menjeda promo", async () => {
    const { eq } = await import("drizzle-orm");
    const [promo] = await t.getDb().insert(t.schema.vouchers).values({ code: "M3G10", title: "Diskon 10%", type: "percent", value: 10, maxDiscount: 15_000, status: "active" } as any).returning();
    const list = await call(owner(), "daftar_promo", { status: "active" });
    expect(list.map((row: any) => row.id)).toContain(promo.id);
    const preview = await call(owner(), "ubah_status_promo", { promoId: promo.id, status: "paused" });
    expect(preview.ringkasan).toMatchObject({ nilai: "10% (maks. Rp15.000)", statusSaatIni: "active" });
    const [still] = await t.getDb().select().from(t.schema.vouchers).where(eq(t.schema.vouchers.id, promo.id));
    expect(still.status).toBe("active");
    const done = await call(owner(), "ubah_status_promo", { promoId: promo.id, status: "paused", konfirmasi: preview.konfirmasi });
    expect(done.hasil.status).toBe("paused");
  });

  it("putuskan_konten (R1, Owner) lalu terbitkan_konten (R3) berhenti di preview", async () => {
    const [content] = await t.getDb().insert(t.schema.contentPublishingQueue).values({ title: "Promo Kopi Pagi", caption: "Kopi pagi 10%", platforms: ["instagram"], status: "needs_approval" } as any).returning();
    await expect(call(as("Manajer"), "putuskan_konten", { kontenId: content.id, keputusan: "approved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(owner(), "putuskan_konten", { kontenId: content.id, keputusan: "rejected" })).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    const approved = await call(owner(), "putuskan_konten", { kontenId: content.id, keputusan: "approved" });
    expect(approved.status).toBe("approved");

    const preview = await call(owner(), "terbitkan_konten", { kontenId: content.id });
    expect(preview).toMatchObject({ status: "PERLU_KONFIRMASI", risiko: "R3" });
    expect(preview.ringkasan.aksi).toContain("instagram");
    expect(preview.ringkasan.dampak).toContain("PUBLIK");
  });

  it("kirim_notifikasi_staf (R1): masuk staff_notifications outlet, bukan pesan keluar", async () => {
    const row = await call(owner(), "kirim_notifikasi_staf", { penerima: "cashier", judul: "Stok susu menipis", tingkat: "warning" });
    expect(row).toBeTruthy();
    const { eq } = await import("drizzle-orm");
    const rows = await t.getDb().select().from(t.schema.staffNotifications).where(eq(t.schema.staffNotifications.kind, "owner_announcement"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outletId, audience: "cashier", severity: "warning", title: "Stok susu menipis" });
  });
});
