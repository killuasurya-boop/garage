import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Bukti transfer menu digital (token invoice), WiFi member MikroTik
// (kredensial harian + log), dan filter "WA aktif" di CRM.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let tmpRoot = "";
let customerId = "";
const png = () => new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "bukti.png");

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), "garage-wa-wifi-"));
  process.env.GARAGE_PROJECT_ROOT = tmpRoot;
  process.env.GARAGE_WIFI_SECRET = "test-wifi-secret-0123456789";
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: "u-wa" }));
  const db = t.getDb();
  const [customer] = await db
    .insert(t.schema.customers)
    .values({ name: "Rina Member", phone: "081311112222", tier: "Silver" } as any)
    .returning();
  customerId = customer.id;
  await db.insert(t.schema.customers).values({ name: "Budi Member", phone: "081399998888", tier: "Silver", waVerifiedAt: new Date() } as any);
  await db.insert(t.schema.orders).values([
    { orderNo: "QR-T1", channel: "QR", status: "awaiting_payment", subtotal: 20_000, service: 0, tax: 0, total: 20_000, outletId, invoiceTrackingToken: "tok-open-123456789" },
    { orderNo: "QR-T2", channel: "QR", status: "paid", subtotal: 20_000, service: 0, tax: 0, total: 20_000, outletId, invoiceTrackingToken: "tok-paid-123456789" },
  ] as any);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
  await rm(tmpRoot, { recursive: true, force: true });
  delete process.env.GARAGE_PROJECT_ROOT;
  delete process.env.GARAGE_WIFI_SECRET;
});

describe("bukti transfer menu digital", () => {
  it("token benar → tersimpan & bisa dibaca staf; token salah / order lunas / file palsu ditolak", async () => {
    const { attachPaymentProof } = await import("@/lib/payment-proof");
    const { readProfileFile } = await import("@/lib/profile-file-storage");
    const res = await attachPaymentProof("tok-open-123456789", png());
    expect(res.orderNo).toBe("QR-T1");
    const { eq } = await import("drizzle-orm");
    const [order] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, res.orderId));
    expect(order.paymentProofUrl).toMatch(new RegExp(`^/api/orders/${res.orderId}/payment-proof/payment-`));
    expect(order.paymentProofAt).toBeTruthy();
    const name = order.paymentProofUrl!.split("/").pop()!;
    expect(await readProfileFile("payment", res.orderId, name)).not.toBeNull();

    await expect(attachPaymentProof("tok-salah-123456789", png())).rejects.toMatchObject({ status: 404 });
    await expect(attachPaymentProof("tok-paid-123456789", png())).rejects.toMatchObject({ code: "ORDER_CLOSED" });
    await expect(attachPaymentProof("pendek", png())).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(attachPaymentProof("tok-open-123456789", new File([Buffer.from("<html>")], "x.png"))).rejects.toMatchObject({
      code: "FILE_UNSUPPORTED",
    });
  });
});

describe("WiFi member", () => {
  it("nonaktif → ditolak; aktif → kredensial harian + log; login URL asing ditolak", async () => {
    const wifi = await import("@/lib/wifi-hotspot");
    const loginUrl = "http://10.5.50.1/login";
    await expect(wifi.grantMemberWifi(customerId, { loginUrl })).rejects.toMatchObject({ code: "WIFI_DISABLED" });

    await t.getDb().insert(t.schema.appSettings).values([
      { outletId: null, key: "wifiEnabled", valueJson: true },
      { outletId: null, key: "wifiSessionHours", valueJson: 4 },
    ] as any);
    const now = new Date("2026-10-18T05:00:00Z");
    const grant = await wifi.grantMemberWifi(customerId, { loginUrl: `${loginUrl}?a=1`, mac: "aa:bb:cc:dd:ee:ff", ip: "10.5.50.20" }, now);
    expect(grant).toMatchObject({ loginUrl, username: "garage-member", sessionHours: 4 });
    expect(grant.password).toBe(wifi.dailyWifiPassword("test-wifi-secret-0123456789", "2026-10-18"));

    await expect(wifi.grantMemberWifi(customerId, { loginUrl: "https://phish.example.com/login" })).rejects.toMatchObject({
      code: "WIFI_NOT_ON_HOTSPOT",
    });
    const logs = await t.getDb().select().from(t.schema.wifiAccessLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ customerId, mac: "AA:BB:CC:DD:EE:FF", ip: "10.5.50.20" });
    const usage = await wifi.getWifiUsage(now);
    expect(usage.recent[0]?.name).toBe("Rina Member");
  });

  it("router menarik skrip harian → sinkron terakhir tercatat (tanpa password/key); dicatat ulang tanpa dobel", async () => {
    const wifi = await import("@/lib/wifi-hotspot");
    const day1 = new Date("2026-11-16T17:01:00Z");
    expect(await wifi.getRouterSync(day1)).toMatchObject({ lastSync: null, syncedToday: false });
    await wifi.recordRouterSync(day1);
    expect(await wifi.getRouterSync(new Date("2026-11-17T03:00:00Z"))).toMatchObject({ lastSync: day1.toISOString(), syncedToday: true });
    const day2 = new Date("2026-11-17T17:01:00Z");
    await wifi.recordRouterSync(day2);
    const rows = (await t.getDb().select().from(t.schema.appSettings)).filter((r: any) => r.key === "wifi_router_last_sync");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0].valueJson)).not.toMatch(/password|key/i);
    // Kunci asing tidak mengubah setelan aplikasi.
    expect((await wifi.getWifiSettings()).enabled).toBe(true);
  });

  it("route router-script: hanya skrip berisi password (WiFi aktif) yang dicatat sebagai diambil", async () => {
    process.env.GARAGE_WIFI_ROUTER_KEY = "router-key-0123456789abcdef";
    const { eq } = await import("drizzle-orm");
    const route = await import("@/app/api/wifi/router-script/route");
    const db = t.getDb();
    const syncAt = async () =>
      ((await db.select().from(t.schema.appSettings)).find((r: any) => r.key === "wifi_router_last_sync")?.valueJson as any)?.at ?? null;
    const before = await syncAt();
    await db.update(t.schema.appSettings).set({ valueJson: false } as any).where(eq(t.schema.appSettings.key, "wifiEnabled"));
    const off = await route.GET(new Request("http://x/api/wifi/router-script?key=router-key-0123456789abcdef"));
    expect(await off.text()).toContain("nonaktif");
    expect(await syncAt()).toBe(before);
    await db.update(t.schema.appSettings).set({ valueJson: true } as any).where(eq(t.schema.appSettings.key, "wifiEnabled"));
    const on = await route.GET(new Request("http://x/api/wifi/router-script?key=router-key-0123456789abcdef"));
    expect(await on.text()).toContain("password=");
    expect(await syncAt()).not.toBe(before);
  });
});

describe("CRM WA aktif", () => {
  it("filter WA terverifikasi / belum", async () => {
    const { listCustomersForCrm } = await import("@/lib/garage-service");
    const verified = await listCustomersForCrm({ wa: "verified" });
    const unverified = await listCustomersForCrm({ wa: "unverified" });
    expect(verified.rows.map((r) => r.name)).toEqual(["Budi Member"]);
    expect(unverified.rows.map((r) => r.name)).toContain("Rina Member");
    expect(verified.rows[0].waVerifiedAt).toBeTruthy();
  });

  it("nomor member wajib WhatsApp valid", async () => {
    const { memberWhatsappSchema } = await import("@/lib/member-phone");
    expect(memberWhatsappSchema.safeParse("0812-3456-7890").success).toBe(true);
    expect(memberWhatsappSchema.safeParse("061456789").success).toBe(false);
    expect(memberWhatsappSchema.safeParse("12345678").success).toBe(false);
  });
});

describe("WiFi masuk cepat (tamu)", () => {
  it("nama + WA → kredensial tamu + log tamu; bukan baris customers; dimatikan → ditolak; nomor salah ditolak", async () => {
    const wifi = await import("@/lib/wifi-hotspot");
    const { eq } = await import("drizzle-orm");
    const db = t.getDb();
    const before = (await db.select().from(t.schema.customers)).length;
    const now = new Date("2026-11-18T05:00:00Z");
    const grant = await wifi.grantGuestWifi({ name: "  Budi  Tamu ", phone: "+62 812-3456-7899", mac: "aa:bb:cc:00:11:22", loginUrl: "http://10.5.50.1/login" }, now);
    expect(grant).toMatchObject({ loginUrl: "http://10.5.50.1/login", username: "garage-guest", sessionHours: 1 });
    expect(grant.password).toBe(wifi.dailyGuestWifiPassword("test-wifi-secret-0123456789", "2026-11-18"));
    expect((await db.select().from(t.schema.customers)).length).toBe(before);
    const log = (await db.select().from(t.schema.wifiAccessLogs)).find((r: any) => r.kind === "guest");
    expect(log).toMatchObject({ guestName: "Budi Tamu", guestPhone: "081234567899", customerId: null, mac: "AA:BB:CC:00:11:22" });
    const usage = await wifi.getWifiUsage(now);
    expect(usage.todayGuests).toBe(1);
    expect(usage.recent.find((r: any) => r.kind === "guest")).toMatchObject({ name: "Budi Tamu", phone: "081234567899" });

    await expect(wifi.grantGuestWifi({ name: "X", phone: "081234567899", loginUrl: "http://10.5.50.1/login" })).rejects.toMatchObject({ code: "WIFI_GUEST_NAME" });
    await expect(wifi.grantGuestWifi({ name: "Budi", phone: "12345", loginUrl: "http://10.5.50.1/login" })).rejects.toMatchObject({ code: "WIFI_GUEST_PHONE" });
    await expect(wifi.grantGuestWifi({ name: "Budi", phone: "081234567899", loginUrl: "https://phish.example.com/login" })).rejects.toMatchObject({ code: "WIFI_NOT_ON_HOTSPOT" });

    await db.insert(t.schema.appSettings).values({ outletId: null, key: "wifiGuestEnabled", valueJson: false } as any);
    await expect(wifi.grantGuestWifi({ name: "Budi", phone: "081234567899", loginUrl: "http://10.5.50.1/login" })).rejects.toMatchObject({ code: "WIFI_GUEST_DISABLED" });
    // Skrip router: user tamu dinonaktifkan saat masuk cepat dimatikan.
    process.env.GARAGE_WIFI_ROUTER_KEY = "router-key-0123456789abcdef";
    const route = await import("@/app/api/wifi/router-script/route");
    const off = await (await route.GET(new Request("http://x/api/wifi/router-script?key=router-key-0123456789abcdef"))).text();
    expect(off).toMatch(/find name="garage-guest"\] disabled=yes/);
    await db.delete(t.schema.appSettings).where(eq(t.schema.appSettings.key, "wifiGuestEnabled"));
    const on = await (await route.GET(new Request("http://x/api/wifi/router-script?key=router-key-0123456789abcdef"))).text();
    expect(on).toMatch(/profile set \[find name="garage-guest"\] shared-users=\d+ session-timeout=1h/);
  });
});

