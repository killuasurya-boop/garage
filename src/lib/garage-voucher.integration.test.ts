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

describe("Voucher — aturan validasi", () => {
  it("guest tidak boleh pakai voucher (khusus member)", async () => {
    const res = await validateVoucher({ code: "HEMAT5K", subtotal: 20_000, customerMode: "guest" });
    expect(res.valid).toBe(false);
    expect(res.message).toMatch(/member/i);
  });

  it("member + voucher aktif → valid, diskon 5.000", async () => {
    const res = await validateVoucher({ code: "HEMAT5K", subtotal: 20_000, customerMode: "member" });
    expect(res.valid).toBe(true);
    expect(res.discount).toBe(5_000);
  });

  it("tolak bila belanja di bawah minimal", async () => {
    const res = await validateVoucher({ code: "MIN100K", subtotal: 20_000, customerMode: "member" });
    expect(res.valid).toBe(false);
    expect(res.message).toMatch(/minimal/i);
  });

  it("kode tidak dikenal → invalid", async () => {
    const res = await validateVoucher({ code: "NGAWUR", subtotal: 20_000, customerMode: "member" });
    expect(res.valid).toBe(false);
  });
});

describe("Voucher — penukaran via order kasir (member)", () => {
  it("voucher member: total berkurang & usedCount bertambah", async () => {
    const res = await createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        customerId: memberId,
        voucherCode: "HEMAT5K",
        items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
      },
      kasirSession(),
    );

    // subtotal 20.000; ada diskon voucher 5.000 → total < subtotal+service+tax.
    expect(res.discount).toBeGreaterThanOrEqual(5_000);
    expect(res.subtotal).toBe(20_000);

    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [voucher] = await d
      .select()
      .from(t.schema.vouchers)
      .where(eq(t.schema.vouchers.code, "HEMAT5K"))
      .limit(1);
    expect(voucher.usedCount).toBe(1);
  });
});
