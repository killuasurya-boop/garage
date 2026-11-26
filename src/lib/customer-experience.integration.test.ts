import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// CX Engine V4: konteks member invoice, izin promosi, event funnel, kampanye manual.
let t: GarageTestDb;
let outletId = "";
const TOKEN = "cx-v4-token-0123456789abcdef";

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: "user-itest-cx" });
  outletId = seeded.outletId;
  await t
    .getDb()
    .insert(t.schema.orders)
    .values({
      orderNo: "CX-1",
      outletId,
      tableLabel: "Meja 07",
      channel: "QR Table",
      status: "awaiting_payment",
      subtotal: 50_000,
      service: 0,
      tax: 0,
      total: 50_000,
      customerName: "Tamu",
      customerPhone: "081200000001",
      invoiceTrackingToken: TOKEN,
    });
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("CX Engine V4", () => {
  it("guest: tanpa penawaran voucher (voucher dimatikan Owner 25 Nov 2026), tanpa data CRM", async () => {
    const db = t.getDb();
    await db.insert(t.schema.vouchers).values([
      { code: "MEMBER-NOV", title: "Promo member November", type: "percent", value: 15, audience: "member", status: "active", endsAt: new Date(Date.now() + 5 * 86_400_000) },
      { code: "LAMA-OKT", title: "Promo lama", type: "percent", value: 20, audience: "member", status: "active", endsAt: new Date(Date.now() - 86_400_000) },
    ]);
    const { getInvoiceMemberContext } = await import("@/lib/customer-experience-service");
    const context = await getInvoiceMemberContext(TOKEN, null);
    expect(context?.viewer).toBe("guest");
    expect(context?.member).toBeNull();
    // Voucher "active" lama di DB tetap tidak ditawarkan (voucher-policy.ts).
    expect(context?.offers).toEqual([]);
    expect(await getInvoiceMemberContext("token-tidak-ada-123456", null)).toBeNull();
  });

  it("daftar member: TANPA voucher daftar, izin promosi terpisah, invoice TIDAK ditautkan", async () => {
    const { registerMember } = await import("@/lib/member-service");
    const { getInvoiceMemberContext, recordMarketingConsent, getMarketingConsent } = await import("@/lib/customer-experience-service");
    const result = await registerMember({ name: "Andi Pratama", phone: "081299990001", password: "123456" });
    expect(result.data).toBeTruthy();
    const customerId = result.data!.customer.id;
    expect((await getMarketingConsent(customerId)).granted).toBe(false);
    await recordMarketingConsent({ customerId, granted: true, source: "invoice_register" });
    expect((await getMarketingConsent(customerId)).granted).toBe(true);

    const context = await getInvoiceMemberContext(TOKEN, customerId);
    expect(context?.viewer).toBe("member");
    expect(context?.member?.name).toBe("Andi Pratama");
    expect(context?.invoiceLinked).toBe(false);
    // Owner 25 Nov 2026: pendaftaran tidak menerbitkan voucher WELCOME-, penawaran voucher kosong.
    expect(context?.offers).toEqual([]);
    const { like } = await import("drizzle-orm");
    expect(await t.getDb().select().from(t.schema.vouchers).where(like(t.schema.vouchers.code, "WELCOME-%"))).toHaveLength(0);
    expect(context?.benefits.map((benefit: { key: string }) => benefit.key)).not.toContain("welcome");
    expect(context?.marketingConsent?.granted).toBe(true);

    // opt-out = baris baru (riwayat tetap)
    await recordMarketingConsent({ customerId, granted: false, source: "member_profile" });
    expect((await getMarketingConsent(customerId)).granted).toBe(false);
    const rows = await t.getDb().select().from(t.schema.customerMarketingConsents);
    expect(rows.filter((row: { customerId: string }) => row.customerId === customerId)).toHaveLength(2);
  });

  it("event funnel: refresh tidak menggandakan, metrik dihitung dari event", async () => {
    const { recordCxEvent, resolveInvoiceOrder, getInvoiceFunnelMetrics } = await import("@/lib/customer-experience-service");
    const order = await resolveInvoiceOrder(TOKEN);
    expect(order).toBeTruthy();
    expect((await recordCxEvent({ event: "invoice_viewed", orderId: order!.id })).recorded).toBe(true);
    expect((await recordCxEvent({ event: "invoice_viewed", orderId: order!.id })).recorded).toBe(false);
    await recordCxEvent({ event: "whatsapp_order_clicked", orderId: order!.id });
    const metrics = await getInvoiceFunnelMetrics(30);
    expect(metrics.invoicesViewed).toBe(1);
    expect(metrics.whatsappOrderClicks).toBe(1);
    expect(metrics.notes.join(" ")).toMatch(/BUKAN pesan terkirim/);
  });

  it("kampanye: promosi diblokir tanpa izin, welcome boleh", async () => {
    const { listCxCampaignCandidates, logCxCampaignOpened } = await import("@/lib/customer-experience-service");
    const welcome = await listCxCampaignCandidates("welcome");
    const andi = welcome.find((row) => row.name === "Andi Pratama");
    expect(andi?.blockReason).toBeNull();
    expect(andi?.waUrl).toMatch(/^https:\/\/wa\.me\//);
    await expect(
      logCxCampaignOpened({ kind: "repeat_visit", customerId: andi!.customerId, userId: "user-itest-cx", message: "x" }),
    ).rejects.toThrow(/izin/);
  });

  it("sweeper voucher: hanya active yang lewat tanggal → expired, idempoten", async () => {
    const { expireEndedVouchers } = await import("@/lib/customer-experience-service");
    const codes = await expireEndedVouchers();
    expect(codes).toContain("LAMA-OKT");
    expect(codes).not.toContain("MEMBER-NOV");
    expect(await expireEndedVouchers()).toEqual([]);
  });
});
