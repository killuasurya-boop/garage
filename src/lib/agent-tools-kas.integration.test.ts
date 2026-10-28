import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { cashCount } from "@/lib/test-helpers/cash-count";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// M3a: tool MCP Shift & Kas + Keuangan. Aksi R2/R3 hanya jalan setelah preview →
// konfirmasi (M2), memakai service yang sama dengan layar (aturan tetap berlaku).

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let acc: typeof import("@/lib/cashier-accountability");
let outletId = "";
const KASIR = "user-m3-kasir";
const OWNER = "user-m3-owner";
const PIN = "482913";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

function as(userId: string, role: Role): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => as(KASIR, "Kasir");
const owner = () => as(OWNER, "Owner");

async function call(session: GarageSession, name: string, args: Record<string, unknown>) {
  const { runToolWithConfirmation } = await import("@/lib/mcp-confirmation");
  return (await runToolWithConfirmation({ session, name, rawArgs: args, ctx, oauthClientId: null })) as any;
}

/** Preview → konfirmasi → receipt. Memastikan preview belum mengubah apa pun. */
async function confirmed(name: string, args: Record<string, unknown>, beforeExecute?: (preview: any) => Promise<void>) {
  const preview = await call(owner(), name, args);
  expect(preview.status).toBe("PERLU_KONFIRMASI");
  expect(preview.dijalankan).toBe(false);
  await beforeExecute?.(preview);
  const done = await call(owner(), name, { ...args, konfirmasi: preview.konfirmasi });
  expect(done.status).toBe("BERHASIL");
  expect(done.receipt.tool).toBe(name);
  return { preview, done };
}

let sessionId = "";
let pendingId = "";
let depositId = "";
let pettyId = "";

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  acc = await import("@/lib/cashier-accountability");
  const { hashPin } = await import("@/lib/attendance");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  await d.insert(t.schema.user).values({ id: OWNER, name: "Owner M3", email: `${OWNER}@garage.id` });
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir", status: "active" },
    { userId: OWNER, outletId, role: "Owner", status: "active", pinHash: hashPin(PIN) },
  ]).onConflictDoNothing();
  await d.insert(t.schema.menuItems).values({ id: "itm-m3", name: "Item M3", category: "Coffee", section: "Coffee", prep: "1m" });
  await d.insert(t.schema.menuVariants).values({ itemId: "itm-m3", variantId: "reg", label: "Regular", price: 1_000 });
  await d.update(t.schema.cashSessions).set({ status: "closed", closedAt: new Date() }).where(eq(t.schema.cashSessions.status, "open"));

  const shift: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
  sessionId = shift.id;
  await svc.createOrder(
    { orderType: "takeaway", paymentMethod: "Cash", cashReceived: 300_000, items: [{ itemId: "itm-m3", variantId: "reg", qty: 300 }] } as any,
    kasir(),
  );
  const deposit: any = await svc.recordCashMovement(
    { type: "out", categoryKey: "setoran", description: "Setor siang", amount: 50_000, counterparty: "Kasir", depositAccount: "bank_jago", managerPin: PIN } as any,
    kasir(),
  );
  depositId = deposit.id;
  const pending: any = await svc.recordCashMovement(
    { type: "out", categoryKey: "belanja_bar", description: "Susu UHT 1 dus", amount: 150_000, submitForApproval: true } as any,
    kasir(),
  );
  pendingId = pending.id;
  await acc.createPettyCashEntry({ type: "topup", category: "Pengisian dana", description: "Dana awal", amount: 200_000, fundSource: "bank_jago" } as any, owner());
  const petty: any = await acc.createPettyCashEntry(
    { type: "expense", category: "Kebersihan", description: "Sabun", amount: 20_000, recipient: "Toko A" } as any,
    kasir(),
  );
  pettyId = petty.id;
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("M3a — tool Shift & Kas + Keuangan", () => {
  it("terdaftar dengan domain & risiko; aksi butuh konfirmasi", async () => {
    const { listAgentTools } = await import("@/lib/agent-tools");
    const byName = new Map(listAgentTools(owner()).map((tool) => [tool.name, tool]));
    expect(byName.get("pengawasan_kas")).toMatchObject({ domain: "shift_kas", risk: "R0", write: false });
    expect(byName.get("putuskan_kas_laci")).toMatchObject({ domain: "shift_kas", risk: "R2", write: true });
    expect(byName.get("tutup_buku_harian")).toMatchObject({ domain: "keuangan", risk: "R3", write: true });
  });

  it("pengawasan_kas: Owner saja; menampilkan antrean yang menggantung", async () => {
    const data = await call(owner(), "pengawasan_kas", {});
    expect(data.queues.cash_out_pending.map((item: any) => item.id)).toEqual([pendingId]);
    expect(data.queues.deposit_unconfirmed.map((item: any) => item.id)).toEqual([depositId]);
    await expect(call(kasir(), "pengawasan_kas", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("putuskan_kas_laci: preview tidak mengubah apa pun; konfirmasi menyetujui & uang bergerak", async () => {
    const before = (await svc.getCashMovementDetail(pendingId, owner()))!.movement;
    const { preview } = await confirmed("putuskan_kas_laci", { id: pendingId, keputusan: "approve" }, async () => {
      expect((await svc.getCashMovementDetail(pendingId, owner()))!.movement.status).toBe("pending_approval");
    });
    expect(before.status).toBe("pending_approval");
    expect(preview.ringkasan).toMatchObject({ aksi: "SETUJUI kas laci", nominal: "Rp150.000" });
    expect((await svc.getCashMovementDetail(pendingId, owner()))!.movement.status).toBe("recorded");
  });

  it("konfirmasi_setoran: bukti bank wajib; setoran pindah ke bank", async () => {
    await expect(call(owner(), "konfirmasi_setoran", { id: depositId, buktiBank: "x" })).rejects.toBeTruthy();
    await confirmed("konfirmasi_setoran", { id: depositId, buktiBank: "JAGO-778812" });
    const movement = (await svc.getCashMovementDetail(depositId, owner()))!.movement;
    expect(movement.depositBankRef).toBe("JAGO-778812");
    expect(movement.depositConfirmedAt).not.toBeNull();
  });

  it("putuskan_petty_cash: setujui lalu bayar (persetujuan ≠ pembayaran); tolak tanpa alasan ditolak", async () => {
    await expect(call(owner(), "putuskan_petty_cash", { id: pettyId, keputusan: "reject", konfirmasi: "x" })).rejects.toMatchObject({
      code: expect.any(String),
    });
    const { preview } = await confirmed("putuskan_petty_cash", { id: pettyId, keputusan: "approve" });
    expect(preview.ringkasan.dampak).toContain("Belum ada uang bergerak");
    const balanceBefore = await acc.pettyCashBalance(outletId);
    await confirmed("putuskan_petty_cash", { id: pettyId, keputusan: "pay", penerima: "Toko A" });
    expect(await acc.pettyCashBalance(outletId)).toBe(balanceBefore - 20_000);
  });

  it("verifikasi_shift: shift yang ditutup dengan selisih wajib diakui", async () => {
    await svc.closeCashSession(sessionId, { actualCash: 195_000, denominations: cashCount(195_000) } as any, kasir());
    const { preview } = await confirmed("verifikasi_shift", { sessionId, status: "verified", akuiSelisih: true, catatan: "Kurang Rp5.000, kasir ganti" });
    expect(preview.ringkasan.selisih).toBe("Rp-5.000");
  });

  it("status_closing_harian (R0) & tutup_buku_harian (R3) berhenti di preview tanpa konfirmasi", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    const review = await call(owner(), "status_closing_harian", { tanggal: today });
    expect(review.status).toBe("open");
    const preview = await call(owner(), "tutup_buku_harian", { tanggal: today });
    expect(preview).toMatchObject({ status: "PERLU_KONFIRMASI", risiko: "R3" });
    expect(preview.ringkasan.aksi).toContain("TUTUP BUKU");
    expect((await call(owner(), "status_closing_harian", { tanggal: today })).status).toBe("open");
  });
});
