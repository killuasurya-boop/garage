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
