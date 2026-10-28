import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// M3e: tool MCP Member/CRM, Meja/QR, Event — service yang sama dengan layar CRM,
// waiter & event manager. Poin lewat preview → konfirmasi (R2).

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let outletId = "";
const OWNER = "user-m3e-owner";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

function as(role: string): GarageSession {
  return {
    user: { id: OWNER, name: "Owner M3e", email: `${OWNER}@garage.id` },
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
  svc = await import("@/lib/garage-service");
  await t.getDb().insert(t.schema.staffProfiles).values({ userId: OWNER, outletId, role: "Owner", status: "active" } as any).onConflictDoNothing();
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("M3e — tool Member, Meja, Event", () => {
  it("sesuaikan_poin_member: preview tidak mengubah poin; konfirmasi menambah & tercatat ADJUSTMENT", async () => {
    const [member] = await t.getDb().insert(t.schema.customers).values({ name: "Member M3e", phone: "081299990777", tier: "Bronze", points: 40 } as any).returning();
    const found = await call(owner(), "cari_member", { cari: "Member M3e" });
    expect(JSON.stringify(found)).toContain(member.id);

    const preview = await call(owner(), "sesuaikan_poin_member", { memberId: member.id, poin: 25, alasan: "Kompensasi pesanan telat" });
    expect(preview.ringkasan).toMatchObject({ poinSaatIni: 40, poinSetelah: 65 });
    expect((await svc.getCustomerDetailForCrm(member.id))!.points).toBe(40);
    const done = await call(owner(), "sesuaikan_poin_member", { memberId: member.id, poin: 25, alasan: "Kompensasi pesanan telat", konfirmasi: preview.konfirmasi });
    expect(done.status).toBe("BERHASIL");
    expect((await svc.getCustomerDetailForCrm(member.id))!.points).toBe(65);
    const { eq } = await import("drizzle-orm");
    const txs = await t.getDb().select().from(t.schema.memberTransactions).where(eq(t.schema.memberTransactions.customerId, member.id));
    expect(txs.map((row: any) => row.source)).toContain("ADJUSTMENT");

    await expect(call(as("Kasir"), "detail_member", { memberId: member.id })).rejects.toBeTruthy();
  });

  it("pindah_meja (R1) jalan langsung; status_meja menampilkan bill di meja baru", async () => {
    const created = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 12",
      customerMode: "guest",
      guestName: "Tamu",
      paymentMethod: "Cash",
      source: "qr_table",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    } as any);
    await svc.updateCustomerOrderStatus(created.order.id, { action: "accept" }, owner());
    const moved = await call(owner(), "pindah_meja", { dari: "12", ke: "Meja 14" });
    expect(moved.orderIds).toEqual([created.order.id]);
    const live = await call(owner(), "status_meja", { meja: "14" });
    expect(JSON.stringify(live)).toContain(created.order.id);
    await expect(call(owner(), "pindah_meja", { dari: "12", ke: "999" })).rejects.toMatchObject({ code: "INVALID_TABLE" });
  });

  it("daftar_event & ubah_status_event (R1)", async () => {
    const events = await call(owner(), "daftar_event", {});
    const event = events.find((row: any) => row.slug === "grand-opening");
    expect(event).toBeTruthy();
    const updated = await call(owner(), "ubah_status_event", { eventId: event.id, status: "archived" });
    expect(updated.status).toBe("archived");
    expect(await call(owner(), "ringkasan_event", { eventId: event.id })).toBeTruthy();
  });
});
