import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Smart Notification V2 — alur end-to-end di PGlite:
// stasiun benar, "siap antar" sampai ke waiter, QRIS tidak terbaca lunas,
// notifikasi basi ditandai selesai, RBAC feed.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let notif: any;
let prod: any;
let outletId = "";

const KASIR = "user-itest-v2-kasir";
const OWNER = "user-itest-v2-owner";
const WAITER = "user-itest-v2-waiter";
const KURIR = "user-itest-v2-kurir";
const BAR = "user-itest-v2-bar";
const DAPUR = "user-itest-v2-dapur";

function session(id: string, name: string, role: Role, workstation: string | null = null): GarageSession {
  return {
    user: { id, name },
    profile: {
      id: `sp-${id}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "V2-1",
      passwordResetRequired: false,
      workstation,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => session(KASIR, "Kasir V2", "Kasir");
const owner = () => session(OWNER, "Owner V2", "Owner");
const barStaff = () => session(BAR, "Bar V2", "Kasir", "bar");

const feedFor = (id: string, role: Role, workstation: string | null = null) =>
  notif.listStaffNotifications({ userId: id, outletId, profile: { role, workstation } });

async function ticketsOf(orderId: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, orderId));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  await t.getDb().insert(t.schema.user).values([
    { id: OWNER, name: "Owner V2", email: `${OWNER}@garage.id` },
    { id: WAITER, name: "Waiter V2", email: `${WAITER}@garage.id` },
    { id: KURIR, name: "Kurir V2", email: `${KURIR}@garage.id` },
    { id: BAR, name: "Bar V2", email: `${BAR}@garage.id` },
    { id: DAPUR, name: "Dapur V2", email: `${DAPUR}@garage.id` },
  ]);
  await t.getDb().insert(t.schema.staffProfiles).values([
    { userId: OWNER, outletId, role: "Owner" },
    { userId: WAITER, outletId, role: "Waiter" },
    { userId: KURIR, outletId, role: "Waiter", workstation: "kurir" },
    { userId: BAR, outletId, role: "Kasir", workstation: "bar" },
    { userId: DAPUR, outletId, role: "Kasir", workstation: "dapur" },
  ]);
  svc = await import("@/lib/garage-service");
  notif = await import("@/lib/staff-notifications");
  prod = await import("@/lib/garage-production");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Smart Notification V2", () => {
  it("audience bar/dapur: hanya stasiun itu yang menerima (F-01)", async () => {
    await notif.notifyStaff({ outletId, audience: "bar", kind: "material_request", title: "Bahan Bar dikirim gudang", dedupKey: "v2-bar-1" });
    await notif.notifyStaff({ outletId, audience: "dapur", kind: "material_request", title: "Bahan Dapur dikirim gudang", dedupKey: "v2-dapur-1" });
    const bar = await feedFor(BAR, "Kasir", "bar");
    const dapur = await feedFor(DAPUR, "Kasir", "dapur");
    expect(bar.items.map((n: any) => n.dedupKey)).toContain("v2-bar-1");
    expect(bar.items.map((n: any) => n.dedupKey)).not.toContain("v2-dapur-1");
    expect(dapur.items.map((n: any) => n.dedupKey)).toContain("v2-dapur-1");
    expect(dapur.items.map((n: any) => n.dedupKey)).not.toContain("v2-bar-1");
    for (const [id, role, ws] of [[KASIR, "Kasir", null], [WAITER, "Waiter", null], [OWNER, "Owner", null]] as const) {
      const feed = await feedFor(id, role, ws);
      expect(feed.items.some((n: any) => n.dedupKey === "v2-bar-1" || n.dedupKey === "v2-dapur-1")).toBe(false);
    }
  });

  it("order QR QRIS: notifikasi tidak terbaca lunas; diterima → selesai, keluar dari badge (F-08, F-11)", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "takeaway",
      customerMode: "guest",
      guestName: "Dewi",
      paymentMethod: "QRIS",
      source: "qr_takeaway",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    const before = await feedFor(KASIR, "Kasir");
    const item = before.items.find((n: any) => n.kind === "qr_new" && n.orderId === res.order.id);
    expect(item.body).toContain("QRIS · menunggu verifikasi kasir");
    expect(item.body).not.toMatch(/lunas/i);
    expect(item.resolvedAt).toBeNull();

    await svc.updateCustomerOrderStatus(res.order.id, { action: "paid", paymentMethod: "QRIS" }, kasir());
    const after = await feedFor(KASIR, "Kasir");
    const resolved = after.items.find((n: any) => n.id === item.id);
    expect(resolved.resolvedAt).toBeTruthy();
    expect(resolved.resolvedReason).toBe("Order lunas");
    expect(after.unreadCount).toBe(before.unreadCount - 1);
  });

  it("order campuran dine-in: Bar 'Siap · Panggil' → waiter dapat 'siap antar' (Dapur masih diproses); diantar → selesai (F-03)", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 07",
      customerMode: "guest",
      guestName: "Budi",
      paymentMethod: "Cash",
      source: "qr_table",
      items: [
        { itemId: "itm-coffee", variantId: "reg", qty: 1 },
        { itemId: "itm-food", variantId: "reg", qty: 1 },
      ],
    });
    await svc.updateCustomerOrderStatus(res.order.id, { action: "accept" }, kasir());
    const tickets = await ticketsOf(res.order.id);
    expect(tickets).toHaveLength(2);
    const barTicket = tickets.find((row: any) => row.station === "Bar");
    expect(barTicket).toBeTruthy();

    await prod.productionTicketAction(barTicket.ticketNo, "start", barStaff());
    await prod.productionReadyAndCall(barTicket.ticketNo, barStaff(), { qcConfirmed: true });

    const waiterFeed = await feedFor(WAITER, "Waiter");
    const call = waiterFeed.items.find((n: any) => n.kind === "ready_to_deliver" && n.orderId === res.order.id);
    expect(call).toBeTruthy();
    expect(call.title).toMatch(/Meja 07 · Bar siap diantar/);
    expect(call.body).toMatch(/Dapur masih diproses/);
    expect(call.severity).toBe("urgent");
    // Tidak bocor ke stasiun, kasir, atau kurir.
    for (const [id, role, ws] of [[BAR, "Kasir", "bar"], [DAPUR, "Kasir", "dapur"], [KASIR, "Kasir", null], [KURIR, "Waiter", "kurir"]] as const) {
      expect((await feedFor(id, role, ws)).items.some((n: any) => n.kind === "ready_to_deliver")).toBe(false);
    }

    // Waiter mengambil → tiket delivered → notifikasi selesai (tidak bisa memicu aksi basi).
    await prod.productionPickup(barTicket.ticketNo, WAITER, barStaff());
    const done = (await feedFor(WAITER, "Waiter")).items.find((n: any) => n.id === call.id);
    expect(done.resolvedAt).toBeTruthy();
    expect(done.resolvedReason).toBe("Sudah diantar");
  });

  it("take away tidak memicu 'siap antar' waiter (pickup = kasir)", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "takeaway",
      customerMode: "guest",
      guestName: "Rina",
      paymentMethod: "Cash",
      source: "qr_takeaway",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    await svc.updateCustomerOrderStatus(res.order.id, { action: "paid", paymentMethod: "Cash" }, kasir());
    const [ticket] = await ticketsOf(res.order.id);
    await prod.productionTicketAction(ticket.ticketNo, "start", owner());
    await prod.productionTicketAction(ticket.ticketNo, "ready", owner(), { qcConfirmed: true });
    expect((await feedFor(WAITER, "Waiter")).items.some((n: any) => n.orderId === res.order.id)).toBe(false);
    expect((await feedFor(KASIR, "Kasir")).items.some((n: any) => n.kind === "takeaway_ready" && n.orderId === res.order.id)).toBe(true);
  });

  it("panggilan meja diselesaikan → notifikasi waiter selesai, ulangan berhenti (skenario 7)", async () => {
    const created = await svc.createServiceRequest({ tableLabel: "Meja 3", outletId, type: "call" });
    const before = (await feedFor(WAITER, "Waiter")).items.find((n: any) => n.dedupKey === `service:${created.id}`);
    expect(before.resolvedAt).toBeNull();
    await svc.resolveServiceRequest(created.id, WAITER, outletId);
    const after = (await feedFor(WAITER, "Waiter")).items.find((n: any) => n.id === before.id);
    expect(after.resolvedAt).toBeTruthy();
    expect(after.resolvedReason).toBe("Panggilan diselesaikan");
  });

  it("resolve idempoten & tidak menyentuh notifikasi lain", async () => {
    const a = await notif.notifyStaff({ outletId, audience: "cashier", kind: "x", title: "A", dedupKey: "v2-res-a" });
    const b = await notif.notifyStaff({ outletId, audience: "cashier", kind: "x", title: "B", dedupKey: "v2-res-b" });
    expect((await notif.resolveStaffNotifications({ dedupKeys: ["v2-res-a"] }, "uji")).resolved).toBe(1);
    expect((await notif.resolveStaffNotifications({ dedupKeys: ["v2-res-a"] }, "uji")).resolved).toBe(0);
    expect((await notif.resolveStaffNotifications({}, "uji")).resolved).toBe(0);
    const feed = await feedFor(KASIR, "Kasir");
    expect(feed.items.find((n: any) => n.id === a.id).resolvedAt).toBeTruthy();
    expect(feed.items.find((n: any) => n.id === b.id).resolvedAt).toBeNull();
    // Prefix dengan karakter LIKE khusus di-escape.
    await notif.notifyStaff({ outletId, audience: "cashier", kind: "x", title: "C", dedupKey: "v2_res%c:1" });
    expect((await notif.resolveStaffNotifications({ dedupPrefixes: ["v2_res%"] }, "uji")).resolved).toBe(1);
    expect((await notif.resolveStaffNotifications({ dedupPrefixes: ["v2_"] }, "uji")).resolved).toBe(0);
  });

  it("keputusan approval menyelesaikan notifikasi yang menunggunya (batal Bar/Dapur)", async () => {
    await t.getDb().insert(t.schema.approvals).values({
      id: "APP-V2-CANCEL-1",
      type: "Lainnya",
      requester: "Bar V2",
      amount: "Rp0",
      reason: "uji",
      risk: "low",
      age: "baru saja",
    });
    await notif.notifyStaff({ outletId, audience: "management", kind: "production_cancel_request", title: "Bar minta batal", dedupKey: "cancel-request:APP-V2-CANCEL-1" });
    await svc.decideApproval("APP-V2-CANCEL-1", { status: "rejected", reasonDecided: "Sudah dibuat" }, owner());
    const item = (await feedFor(OWNER, "Owner")).items.find((n: any) => n.dedupKey === "cancel-request:APP-V2-CANCEL-1");
    expect(item.resolvedAt).toBeTruthy();
    expect(item.resolvedReason).toBe("Ditolak");
  });

  it("'semua siap' diumumkan sekali per order walau tiket dibuka ulang lalu siap lagi (F-14)", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "takeaway",
      customerMode: "guest",
      guestName: "Tono",
      paymentMethod: "Cash",
      source: "qr_takeaway",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    const orderToken = (await (async () => {
      const { eq } = await import("drizzle-orm");
      const [row] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, res.order.id));
      return row.invoiceTrackingToken as string;
    })());
    await svc.postCustomerChatMessage({ chatToken: "chat-token-tono-0001", tableLabel: "Take away", body: "Halo", orderToken });
    await svc.updateCustomerOrderStatus(res.order.id, { action: "paid", paymentMethod: "Cash" }, kasir());
    const [ticket] = await ticketsOf(res.order.id);
    await prod.productionTicketAction(ticket.ticketNo, "start", owner());
    await prod.productionTicketAction(ticket.ticketNo, "ready", owner(), { qcConfirmed: true });
    await prod.productionTicketAction(ticket.ticketNo, "reopen", owner(), { reason: "Rasa kurang manis" });
    await prod.productionTicketAction(ticket.ticketNo, "ready", owner(), { qcConfirmed: true });
    const chat = await svc.getCustomerChatMessages({ chatToken: "chat-token-tono-0001" });
    expect(chat.messages.filter((m: any) => m.sender === "system" && /SIAP DIAMBIL/.test(m.body))).toHaveLength(1);
  });

  it("panel cek tutup shift: transaksi belum lunas terhitung; Kasir tidak melihat kas tunai (blind) (skenario 11)", async () => {
    const { and, eq } = await import("drizzle-orm");
    let [open] = await t
      .getDb()
      .select()
      .from(t.schema.cashSessions)
      .where(and(eq(t.schema.cashSessions.openedBy, KASIR), eq(t.schema.cashSessions.status, "open")));
    if (!open) {
      [open] = await t
        .getDb()
        .insert(t.schema.cashSessions)
        .values({ code: "CS-V2-CHECK", openingCash: 100_000, expectedCash: 100_000, outletId, openedBy: KASIR, status: "open" })
        .returning();
    }
    const res = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 09",
      customerMode: "guest",
      guestName: "Sari",
      paymentMethod: "QRIS",
      source: "qr_table",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    const { getShiftCloseCheck } = await import("@/lib/shift-close-check-service");
    const asKasir = await getShiftCloseCheck(open.id, { userId: KASIR, role: "Kasir", allowAll: false });
    expect(asKasir?.sessionStatus).toBe("open");
    expect(asKasir?.unpaidThisShift.orderNos).toContain(res.order.orderNo);
    expect(asKasir?.cash).toBeNull(); // blind count: tidak ada kas tunai / kas seharusnya
    expect(JSON.stringify(asKasir)).not.toMatch(/expectedCash/);

    const asOwner = await getShiftCloseCheck(open.id, { userId: OWNER, role: "Owner", allowAll: true });
    expect(asOwner?.cash).toMatchObject({ expectedCash: expect.any(Number) });
    // Kasir lain tidak bisa membaca shift orang lain.
    expect(await getShiftCloseCheck(open.id, { userId: WAITER, role: "Kasir", allowAll: false })).toBeNull();
  });

  it("RBAC: notifikasi manajemen tidak terlihat kasir/waiter/stasiun (skenario 10 & 13)", async () => {
    await notif.notifyStaff({ outletId, audience: "management", kind: "cash_variance", title: "Selisih kas", body: "Kas kurang Rp 75.000", dedupKey: "v2-mgmt-1" });
    expect((await feedFor(OWNER, "Owner")).items.some((n: any) => n.dedupKey === "v2-mgmt-1")).toBe(true);
    for (const [id, role, ws] of [[KASIR, "Kasir", null], [WAITER, "Waiter", null], [BAR, "Kasir", "bar"], [KURIR, "Waiter", "kurir"]] as const) {
      expect((await feedFor(id, role, ws)).items.some((n: any) => n.dedupKey === "v2-mgmt-1")).toBe(false);
    }
  });
});
