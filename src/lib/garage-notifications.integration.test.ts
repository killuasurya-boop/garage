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
// Pusat notifikasi staf + live chat pelanggan (Okt 2026):
// - feed per peran (kasir / kurir / waiter), dedup, tandai dibaca;
// - chat diikat ke pesanan lewat token tracking, halaman pesan via SQL (>200),
//   inbox tanpa N+1 + info pesanan; status publik lewat nomor order tidak
//   membocorkan id/token.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let notif: any;
let outletId = "";

const KASIR = "user-itest-ntf-kasir";
const OWNER = "user-itest-ntf-owner";
const KURIR = "user-itest-ntf-kurir";
const WAITER = "user-itest-ntf-waiter";

function session(id: string, name: string, role: Role, workstation: string | null = null): GarageSession {
  return {
    user: { id, name },
    profile: {
      id: `sp-${id}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "NTF-1",
      passwordResetRequired: false,
      workstation,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => session(KASIR, "Kasir Notif", "Kasir");
const owner = () => session(OWNER, "Owner Notif", "Owner");

const feedFor = (id: string, role: Role, workstation: string | null = null) =>
  notif.listStaffNotifications({ userId: id, outletId, profile: { role, workstation } });

async function token(orderId: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, orderId));
  return row.invoiceTrackingToken as string;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  await t.getDb().insert(t.schema.user).values([
    { id: OWNER, name: "Owner Notif", email: `${OWNER}@garage.id` },
    { id: KURIR, name: "Kurir Notif", email: `${KURIR}@garage.id` },
    { id: WAITER, name: "Waiter Notif", email: `${WAITER}@garage.id` },
  ]);
  await t.getDb().insert(t.schema.staffProfiles).values([
    { userId: OWNER, outletId, role: "Owner" },
    { userId: KURIR, outletId, role: "Waiter", workstation: "kurir" },
    { userId: WAITER, outletId, role: "Waiter" },
  ]);
  svc = await import("@/lib/garage-service");
  notif = await import("@/lib/staff-notifications");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Pusat notifikasi staf", () => {
  it("order QR baru → kasir & owner dapat; kurir & waiter tidak; dedup; tandai dibaca", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "takeaway",
      customerMode: "guest",
      guestName: "Nadia",
      paymentMethod: "QRIS",
      source: "qr_takeaway",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    const kasirFeed = await feedFor(KASIR, "Kasir");
    const item = kasirFeed.items.find((n: any) => n.kind === "qr_new" && n.orderId === res.order.id);
    expect(item).toBeTruthy();
    expect(item.severity).toBe("urgent");
    expect(item.read).toBe(false);
    expect((await feedFor(OWNER, "Owner")).items.some((n: any) => n.orderId === res.order.id)).toBe(true);
    expect((await feedFor(KURIR, "Waiter", "kurir")).items.some((n: any) => n.kind === "qr_new")).toBe(false);
    expect((await feedFor(WAITER, "Waiter")).items.some((n: any) => n.kind === "qr_new")).toBe(false);

    // Dedup: kunci yang sama tidak membuat baris kedua.
    const again = await notif.notifyStaff({ outletId, audience: "cashier", kind: "qr_new", title: "x", dedupKey: `qr_new:${res.order.id}` });
    expect(again).toBeNull();

    await notif.markStaffNotificationsRead(KASIR, [item.id]);
    const after = await feedFor(KASIR, "Kasir");
    expect(after.items.find((n: any) => n.id === item.id).read).toBe(true);
    expect(after.unreadCount).toBe(kasirFeed.unreadCount - 1);
    // Status baca per user: owner belum membaca.
    expect((await feedFor(OWNER, "Owner")).items.find((n: any) => n.id === item.id).read).toBe(false);
  });

  it("take away siap (semua station) → SATU notifikasi kasir + satu pesan chat", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "takeaway",
      customerMode: "guest",
      guestName: "Raka",
      paymentMethod: "QRIS",
      source: "qr_takeaway",
      items: [
        { itemId: "itm-coffee", variantId: "reg", qty: 1 },
        { itemId: "itm-food", variantId: "reg", qty: 1 },
      ],
    });
    const orderToken = await token(res.order.id);
    await svc.postCustomerChatMessage({ chatToken: "chat-token-raka-0001", tableLabel: "Take away", body: "Halo", orderToken });
    await svc.updateCustomerOrderStatus(res.order.id, { action: "paid", paymentMethod: "QRIS" }, kasir());
    const prod = await import("@/lib/garage-production");
    const { eq } = await import("drizzle-orm");
    const tickets = await t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, res.order.id));
    expect(tickets.length).toBe(2);
    for (const ticket of tickets) {
      await prod.productionTicketAction(ticket.ticketNo, "start", owner());
      await prod.productionTicketAction(ticket.ticketNo, "ready", owner(), { qcConfirmed: true });
    }
    const ready = (await feedFor(KASIR, "Kasir")).items.filter((n: any) => n.kind === "takeaway_ready" && n.orderId === res.order.id);
    expect(ready).toHaveLength(1);
    const chat = await svc.getCustomerChatMessages({ chatToken: "chat-token-raka-0001" });
    const siap = chat.messages.filter((m: any) => m.sender === "system" && /SIAP DIAMBIL/.test(m.body));
    expect(siap).toHaveLength(1);
    expect(chat.messages.some((m: any) => /diantar ke meja/.test(m.body))).toBe(false);
  });

  it("panggilan meja → waiter dapat notifikasi; kasir tidak", async () => {
    await svc.createServiceRequest({ tableLabel: "Meja 4", outletId, type: "bill" });
    expect((await feedFor(WAITER, "Waiter")).items.some((n: any) => n.kind === "service_bill" && /Meja 04/.test(n.title))).toBe(true);
    expect((await feedFor(KASIR, "Kasir")).items.some((n: any) => n.kind === "service_bill")).toBe(false);
  });
});

describe("Live chat pelanggan", () => {
  it("token tracking mengikat chat ke pesanan; token salah tidak; kasir melihat nomor & tipe pesanan", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "takeaway",
      customerMode: "guest",
      guestName: "Sinta",
      paymentMethod: "Cash",
      source: "qr_takeaway",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    const orderToken = await token(res.order.id);
    await svc.postCustomerChatMessage({ chatToken: "chat-token-sinta-0001", tableLabel: "Take away", body: "Pesanan saya mana?", orderToken });
    await svc.postCustomerChatMessage({ chatToken: "chat-token-palsu-0001", tableLabel: "Meja 9", body: "coba", orderToken: "token-salah-123456" });

    const threads = await svc.listStaffChatThreads({ outletId });
    const linked = threads.find((th: any) => th.orderId === res.order.id);
    expect(linked).toMatchObject({ orderNo: res.order.orderNo, fulfillment: "takeaway", unreadCount: 1 });
    expect(linked.tableLabel).toMatch(/^Take away · Sinta/);
    const fake = threads.find((th: any) => th.tableLabel === "Meja 9");
    expect(fake.orderId).toBeNull();

    // Notifikasi chat untuk kasir.
    expect((await feedFor(KASIR, "Kasir")).items.some((n: any) => n.kind === "chat" && n.orderId === res.order.id)).toBe(true);

    // Teruskan ke pelayan ditolak untuk take away.
    await expect(svc.forwardCustomerChatToWaiter(linked.id, KASIR)).rejects.toThrow(/meja/);

    // Balasan staf: nama staf terlihat pelanggan + tanda dibaca.
    await svc.postStaffChatMessage({ threadId: linked.id, userId: KASIR, body: "Sedang dibuat ya kak" });
    const chat = await svc.getCustomerChatMessages({ chatToken: "chat-token-sinta-0001" });
    const reply = chat.messages.find((m: any) => m.sender === "staff");
    expect(reply.staffName).toBeTruthy();
    expect(reply.staffName).not.toContain(" ");
    expect(chat.staffReadAt).toBeTruthy();
  });

  it("lebih dari 200 pesan: halaman terbaru & afterId tetap mengikuti pesan baru", async () => {
    const { eq } = await import("drizzle-orm");
    await svc.postCustomerChatMessage({ chatToken: "chat-token-panjang-01", tableLabel: "Meja 2", body: "awal" });
    const [thread] = await t
      .getDb()
      .select()
      .from(t.schema.customerChatThreads)
      .where(eq(t.schema.customerChatThreads.chatToken, "chat-token-panjang-01"));
    const base = Date.now() - 10 * 60_000;
    await t
      .getDb()
      .insert(t.schema.customerChatMessages)
      .values(
        Array.from({ length: 230 }, (_, i) => ({
          threadId: thread.id,
          sender: i % 2 ? "staff" : "customer",
          body: `pesan ${i}`,
          createdAt: new Date(base + i * 1000),
        })),
      );
    const page = await svc.getCustomerChatMessages({ chatToken: "chat-token-panjang-01" });
    expect(page.messages).toHaveLength(200);
    expect(page.messages.at(-1).body).toBe("awal"); // pesan paling baru (waktu sekarang)
    const lastId = page.messages.at(-1).id;
    await svc.postStaffChatMessage({ threadId: thread.id, userId: KASIR, body: "pesan terbaru" });
    const next = await svc.getCustomerChatMessages({ chatToken: "chat-token-panjang-01", afterId: lastId });
    expect(next.messages.map((m: any) => m.body)).toEqual(["pesan terbaru"]);
  });

  it("status publik lewat nomor order tidak membocorkan id & token invoice", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 3",
      customerMode: "guest",
      guestName: "Meja Tiga",
      paymentMethod: "Cash",
      source: "qr_table",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    const byId = await svc.getPublicCustomerOrderStatus(res.order.id);
    expect(byId.id).toBe(res.order.id);
    expect(byId.invoiceWebUrl).toMatch(/^\/invoice\//);
    const byNo = await svc.getPublicCustomerOrderStatus(res.order.orderNo);
    expect(byNo.id).toBeNull();
    expect(byNo.invoiceWebUrl).toBeNull();
    expect(byNo.orderStatus).toBe(byId.orderStatus);
  });
});
