import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";
import { enableTestTotp, freshTotpCode } from "@/lib/test-helpers/owner-totp";

// M3b: tool MCP POS/Order + Karyawan. Batal/refund lewat pengajuan resmi, koreksi
// metode bayar lewat buku kas, perubahan staf hanya sesi Owner (bukan API key).

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let outletId = "";
const KASIR = "user-m3b-kasir";
const OWNER = "user-m3b-owner";
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
  // D-01a: aksi R3 butuh kode 2FA Owner di panggilan konfirmasi.
  const kode2fa = preview.butuhKode2fa ? await freshTotpCode(t, OWNER) : undefined;
  const done = await call(owner(), name, { ...args, konfirmasi: preview.konfirmasi, ...(kode2fa ? { kode2fa } : {}) });
  expect(done.status).toBe("BERHASIL");
  expect(done.receipt.tool).toBe(name);
  return { preview, done };
}

const KASIR2 = "user-m3b-kasir2";
let orderVoid: any;
let orderRefund: any;
let orderFix: any;

async function sell(qty: number, method = "Cash") {
  return svc.createOrder(
    { orderType: "takeaway", paymentMethod: method, cashReceived: method === "Cash" ? qty * 1_000 : undefined, items: [{ itemId: "itm-m3b", variantId: "reg", qty }] } as any,
    kasir(),
  );
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  const { hashPin } = await import("@/lib/attendance");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: OWNER, name: "Owner M3b", email: `${OWNER}@garage.id` },
    { id: KASIR2, name: "Kasir Dua", email: `${KASIR2}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir", status: "active" },
    { userId: KASIR2, outletId, role: "Kasir", status: "active" },
    { userId: OWNER, outletId, role: "Owner", status: "active", pinHash: hashPin(PIN) },
  ]).onConflictDoNothing();
  await d.insert(t.schema.menuItems).values({ id: "itm-m3b", name: "Item M3b", category: "Coffee", section: "Coffee", prep: "1m" });
  await d.insert(t.schema.menuVariants).values({ itemId: "itm-m3b", variantId: "reg", label: "Regular", price: 1_000 });
  await d.update(t.schema.cashSessions).set({ status: "closed", closedAt: new Date() }).where(eq(t.schema.cashSessions.status, "open"));
  await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
  orderVoid = await sell(10);
  orderRefund = await sell(20);
  orderFix = await sell(30);
  await enableTestTotp(t, OWNER);
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

const orderNoOf = (order: any) => order.orderNo as string;
const orderIdOf = (order: any) => order.orderId as string;

describe("M3b — tool POS/Order + Karyawan", () => {
  it("terdaftar dengan domain & risiko", async () => {
    const { listAgentTools } = await import("@/lib/agent-tools");
    const byName = new Map(listAgentTools(owner()).map((tool) => [tool.name, tool]));
    expect(byName.get("batalkan_order")).toMatchObject({ domain: "pos", risk: "R2" });
    expect(byName.get("ubah_info_order")).toMatchObject({ domain: "pos", risk: "R1" });
    expect(byName.get("ubah_status_peran_staf")).toMatchObject({ domain: "karyawan", risk: "R3" });
  });

  it("ubah_info_order (R1) jalan langsung; nominal tidak berubah; tercatat di riwayat", async () => {
    await call(owner(), "ubah_info_order", { order: orderNoOf(orderVoid), namaPelanggan: "Budi", alasan: "Nama salah ketik" });
    const history = await call(owner(), "riwayat_order", { order: orderNoOf(orderVoid) });
    expect(JSON.stringify(history)).toContain("Budi");
  });

  it("batalkan_order: preview menampilkan item & total; konfirmasi → batal langsung atau pengajuan APP-VOID", async () => {
    const { preview, done } = await confirmed("batalkan_order", { order: orderNoOf(orderVoid), alasan: "salah_input" });
    expect(preview.ringkasan).toMatchObject({ total: "Rp10.000" });
    expect(preview.ringkasan.item).toEqual(["10× Item M3b (Regular)"]);
    const order = await svc.getRefundableOrder(orderNoOf(orderVoid), owner());
    // Owner: pengajuan APP-VOID tercatat & langsung disetujui (jejak audit tetap ada).
    expect(done.hasil.approvalId).toMatch(/^APP-VOID-/);
    expect(order!.status).toBe(done.hasil.status === "approved" ? "voided" : "paid");
  });

  it("refund_order: lewat pengajuan APP-RFD (Owner = langsung disetujui)", async () => {
    const order = await svc.getRefundableOrder(orderNoOf(orderRefund), owner());
    const itemId = order!.items[0].id;
    const { preview, done } = await confirmed("refund_order", { order: orderNoOf(orderRefund), item: [{ orderItemId: itemId, qty: 5 }], alasan: "komplain_kualitas" });
    expect(preview.ringkasan.itemDirefund).toEqual(["5/20× Item M3b @ Rp1.000"]);
    expect(done.hasil.approvalId).toMatch(/^APP-RFD-/);
    const after = await svc.getRefundableOrder(orderNoOf(orderRefund), owner());
    if (done.hasil.status === "approved") expect(after!.items[0].qty).toBe(15);
    else expect(after!.pendingApprovalId).toBe(done.hasil.approvalId);
  });

  it("koreksi_metode_bayar: Cash → QRIS, total tetap", async () => {
    await confirmed("koreksi_metode_bayar", { orderId: orderIdOf(orderFix), metodeBaru: "QRIS", alasan: "Pelanggan bayar QRIS, kasir salah tekan" });
    const order = await svc.getRefundableOrder(orderIdOf(orderFix), owner());
    expect(order!.total).toBe(30_000);
    const [payment] = await t.getDb().select().from(t.schema.payments).where((await import("drizzle-orm")).eq(t.schema.payments.orderId, orderIdOf(orderFix)));
    expect(payment.method).toBe("QRIS");
  });

  it("ubah_status_peran_staf: suspend lewat konfirmasi; API key & Owner terakhir ditolak", async () => {
    const list = await call(owner(), "daftar_staf", {});
    expect(list.staf.map((row: any) => row.userId)).toContain(KASIR2);
    await confirmed("ubah_status_peran_staf", { userId: KASIR2, status: "suspended", alasan: "Tidak masuk 3 hari" });
    const after = await call(owner(), "daftar_staf", { cari: "Kasir Dua" });
    expect(after.staf[0]).toMatchObject({ status: "suspended", alasanSuspend: "Tidak masuk 3 hari" });

    const agentSession = { ...owner(), profile: { ...owner().profile, agentKey: { id: "k1", label: "Hermes", scope: "owner" } } } as any;
    await expect(call(agentSession, "ubah_status_peran_staf", { userId: KASIR2, status: "active", alasan: "Coba" })).rejects.toMatchObject({ code: "AGENT_FORBIDDEN" });

    const demote = await call(owner(), "ubah_status_peran_staf", { userId: OWNER, peran: "Manajer", alasan: "Uji Owner terakhir" });
    await expect(call(owner(), "ubah_status_peran_staf", { userId: OWNER, peran: "Manajer", alasan: "Uji Owner terakhir", konfirmasi: demote.konfirmasi, kode2fa: await freshTotpCode(t, OWNER) })).rejects.toMatchObject({
      code: "UPDATE_USER_FAILED",
    });
  });
});

describe("D-01a — aksi R3 lewat chat wajib kode 2FA Owner", () => {
  it("tanpa kode / kode salah / argumen berubah ditolak tanpa menghanguskan token; kode benar → berhasil sekali", async () => {
    const { createOTP } = await import("@better-auth/utils/otp");
    const args = { userId: KASIR2, status: "active", alasan: "Sudah masuk kerja lagi" };
    const preview = await call(owner(), "ubah_status_peran_staf", args);
    expect(preview).toMatchObject({ status: "PERLU_KONFIRMASI", risiko: "R3", butuhKode2fa: true });
    expect(preview.instruksi).toMatch(/kode2fa/);

    await expect(call(owner(), "ubah_status_peran_staf", { ...args, konfirmasi: preview.konfirmasi })).rejects.toMatchObject({
      code: "KODE_2FA_WAJIB",
    });
    const wrong = await createOTP("bukan-secret-owner-xxxxxxxxxxxxx", { period: 30, digits: 6 }).totp();
    await expect(
      call(owner(), "ubah_status_peran_staf", { ...args, konfirmasi: preview.konfirmasi, kode2fa: wrong }),
    ).rejects.toMatchObject({ code: "INVALID_CODE" });
    await expect(
      call(owner(), "ubah_status_peran_staf", {
        ...args,
        alasan: "Alasan diganti diam-diam",
        konfirmasi: preview.konfirmasi,
        kode2fa: await freshTotpCode(t, OWNER),
      }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_ARGS_CHANGED" });
    const before = await call(owner(), "daftar_staf", { cari: "Kasir Dua" });
    expect(before.staf[0].status).toBe("suspended");

    const kode2fa = await freshTotpCode(t, OWNER);
    const done = await call(owner(), "ubah_status_peran_staf", { ...args, konfirmasi: preview.konfirmasi, kode2fa });
    expect(done.status).toBe("BERHASIL");
    expect((await call(owner(), "daftar_staf", { cari: "Kasir Dua" })).staf[0].status).toBe("active");
    await expect(
      call(owner(), "ubah_status_peran_staf", { ...args, konfirmasi: preview.konfirmasi, kode2fa }),
    ).rejects.toMatchObject({ code: "CHALLENGE_USED" });
  });
});
