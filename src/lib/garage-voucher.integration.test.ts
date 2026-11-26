import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// VOUCHER — TEST INTEGRASI: aturan & penukaran voucher (fitur uang kasir).
// validateVoucher (khusus member, minSpend, kuota, aktif) + redemption via
// createOrder (diskon diterapkan, total turun, usedCount bertambah).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let createOrder: any;
let validateVoucher: any;
let outletId = "";
let memberId = "";
const KASIR = "user-itest-kasir";

function kasirSession(): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir Test" },
    profile: {
      id: "sp-kasir",
      role: "Kasir" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  const d = t.getDb();

  // Member terdaftar (voucher khusus member).
  const [cust] = await d
    .insert(t.schema.customers)
    .values({ name: "Member Test", phone: "081200000001", tier: "Bronze" })
    .returning();
  memberId = cust.id;
  // Akun member aktif (createOrder mensyaratkan customers + memberAccounts).
  await d.insert(t.schema.memberAccounts).values({
    customerId: cust.id,
    name: "Member Test",
    phone: "081200000001",
    passwordHash: "x",
  });

  // Voucher fixed Rp5.000 aktif tanpa minSpend.
  await d.insert(t.schema.vouchers).values({
    code: "HEMAT5K",
    title: "Diskon 5K",
    type: "fixed",
    value: 5_000,
    minSpend: 0,
    audience: "all",
    status: "active",
  });
  // Voucher dgn minSpend tinggi (untuk uji penolakan).
  await d.insert(t.schema.vouchers).values({
    code: "MIN100K",
    title: "Min 100rb",
    type: "fixed",
    value: 10_000,
    minSpend: 100_000,
    audience: "all",
    status: "active",
  });

  const svc = await import("@/lib/garage-service");
  createOrder = svc.createOrder;
  validateVoucher = svc.validateVoucher;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

// Owner 25 Nov 2026: SEMUA voucher dimatikan (src/lib/voucher-policy.ts). Voucher yang masih "active" di DB
// (mis. data lama sebelum migrasi 0213) tetap ditolak — tidak ada diskon, tidak ada redemption, kuota tidak berubah.
describe("Voucher dimatikan — validasi selalu ditolak", () => {
  it("guest & member, voucher aktif atau tidak, semua ditolak dengan pesan jelas", async () => {
    for (const input of [
      { code: "HEMAT5K", subtotal: 20_000, customerMode: "guest" },
      { code: "HEMAT5K", subtotal: 20_000, customerMode: "member" },
      { code: "MIN100K", subtotal: 200_000, customerMode: "member" },
      { code: "NGAWUR", subtotal: 20_000, customerMode: "member" },
    ]) {
      const res = await validateVoucher(input);
      expect(res).toMatchObject({ valid: false, discount: 0 });
      expect(res.message).toMatch(/tidak berlaku/i);
    }
  });
});

describe("Voucher dimatikan — order kasir & penerbitan", () => {
  it("order kasir bervoucher ditolak; kuota & riwayat voucher tidak berubah", async () => {
    await expect(
      createOrder(
        {
          orderType: "takeaway",
          paymentMethod: "Cash",
          cashReceived: 100_000,
          customerId: memberId,
          voucherCode: "HEMAT5K",
          items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
        },
        kasirSession(),
      ),
    ).rejects.toThrow(/tidak berlaku/i);

    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [voucher] = await d.select().from(t.schema.vouchers).where(eq(t.schema.vouchers.code, "HEMAT5K")).limit(1);
    expect(voucher.usedCount).toBe(0);
    expect(await d.select().from(t.schema.voucherRedemptions)).toHaveLength(0);
  });

  it("voucher baru, voucher CRM, dan promo Marketing tidak bisa diterbitkan/diaktifkan lagi", async () => {
    const svc = await import("@/lib/garage-service");
    const marketing = await import("@/lib/garage-marketing-service");
    await expect(
      svc.createVoucher({ code: "BARU10", title: "Baru", type: "fixed", value: 10_000 } as never, kasirSession()),
    ).rejects.toMatchObject({ code: "VOUCHER_RETIRED", status: 410 });
    await expect(
      svc.issuePersonalVoucherForCrm({ customerId: memberId, type: "fixed", value: 10_000 }),
    ).rejects.toMatchObject({ code: "VOUCHER_RETIRED" });
    await expect(marketing.createMarketingPromo({ code: "PROMO1", title: "Promo", type: "fixed", value: 5_000 } as never)).rejects.toMatchObject({
      code: "VOUCHER_RETIRED",
    });

    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [hemat] = await d.select().from(t.schema.vouchers).where(eq(t.schema.vouchers.code, "HEMAT5K")).limit(1);
    // Menjeda boleh, mengaktifkan lagi tidak.
    expect(await marketing.updateMarketingPromoStatus(hemat.id, "paused")).toMatchObject({ status: "paused" });
    await expect(marketing.updateMarketingPromoStatus(hemat.id, "active")).rejects.toMatchObject({ code: "VOUCHER_RETIRED" });
    expect(await d.select().from(t.schema.vouchers).where(eq(t.schema.vouchers.code, "BARU10"))).toHaveLength(0);
  });
});
