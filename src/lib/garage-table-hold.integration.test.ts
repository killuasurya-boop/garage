import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Menu digital pilih meja (PDF owner, Okt 2026): kunci meja "Sedang dipilih",
// tabrakan pilihan, kode gabung meja terisi, reserved / perlu bersih ditolak,
// kode ikut pindah meja & hilang saat meja dikosongkan.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const KASIR = "user-itest-hold-kasir";

function kasir(): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir Hold" },
    profile: {
      id: `sp-${KASIR}`,
      role: "Kasir",
      shiftLabel: "Pagi",
      deviceLabel: "HOLD-1",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

function customerOrder(table: string, claim: { tableHoldToken?: string; tableJoinCode?: string }) {
  return svc.createCustomerOrder({
    orderType: "dine-in",
    tableLabel: table,
    customerMode: "guest",
    guestName: "Tamu",
    paymentMethod: "Cash",
    source: "qr_table",
    enforceTableClaim: true,
    ...claim,
    items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
  });
}

async function publicRow(table: string, token?: string) {
  const rows = await svc.getPublicTableLiveData(outletId, token ?? null);
  return rows.find((row: any) => row.tableNumber === table);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Kunci meja (Sedang dipilih)", () => {
  it("pelanggan A memilih meja → kuning; pelanggan B ditolak; A melihat 'meja kamu'", async () => {
    const a = await svc.holdCustomerTable({ tableNumber: "07", outletId });
    expect(a.mode).toBe("new");
    expect(a.holdToken).toMatch(/^[a-f0-9]{48}$/);

    await expect(svc.holdCustomerTable({ tableNumber: "07", outletId })).rejects.toMatchObject({ code: "TABLE_HELD" });

    const seenByB = await publicRow("07");
    expect(seenByB.customerStatus).toBe("held");
    expect(seenByB.mine).toBe(false);
    const seenByA = await publicRow("07", a.holdToken);
    expect(seenByA.mine).toBe(true);

    const staff = await svc.getTableLiveRow("07", outletId);
    expect(staff.status).toBe("held");
    expect(staff.heldUntil).toBeTruthy();
  });

  it("order tanpa kunci ke meja yang dipegang orang lain ditolak; pemegang kunci berhasil + dapat kode gabung", async () => {
    const a = await svc.holdCustomerTable({ tableNumber: "08", outletId });
    await expect(customerOrder("08", {})).rejects.toMatchObject({ code: "TABLE_HELD" });
    const created = await customerOrder("08", { tableHoldToken: a.holdToken });
    expect(created.joinCode).toMatch(/^\d{4}$/);
    const row = await publicRow("08");
    expect(row.customerStatus).toBe("occupied");
  });

  it("ganti meja: kunci lama dilepas otomatis (satu pelanggan satu meja)", async () => {
    const a = await svc.holdCustomerTable({ tableNumber: "09", outletId });
    await svc.holdCustomerTable({ tableNumber: "10", outletId, holdToken: a.holdToken });
    expect((await publicRow("09")).customerStatus).toBe("available");
    expect((await publicRow("10")).customerStatus).toBe("held");
    await svc.releaseCustomerTable({ holdToken: a.holdToken, outletId });
    expect((await publicRow("10")).customerStatus).toBe("available");
  });

  it("kunci kedaluwarsa → meja bisa diambil pelanggan lain", async () => {
    await svc.holdCustomerTable({ tableNumber: "11", outletId });
    const { eq, and } = await import("drizzle-orm");
    await t
      .getDb()
      .update(t.schema.tableSessions)
      .set({ heldUntil: new Date(Date.now() - 1000) })
      .where(and(eq(t.schema.tableSessions.outletId, outletId), eq(t.schema.tableSessions.tableNumber, "11")));
    expect((await publicRow("11")).customerStatus).toBe("available");
    const b = await svc.holdCustomerTable({ tableNumber: "11", outletId });
    expect(b.mode).toBe("new");
  });

  it("staf bisa melepas kunci", async () => {
    await svc.holdCustomerTable({ tableNumber: "12", outletId });
    await svc.releaseTableHoldByStaff("12", kasir());
    expect((await publicRow("12")).customerStatus).toBe("available");
  });
});

describe("Meja terisi & kode gabung", () => {
  it("teman semeja tanpa kode ditolak, kode salah ditolak, kode benar masuk meja yang sama", async () => {
    const a = await svc.holdCustomerTable({ tableNumber: "14", outletId });
    const first = await customerOrder("14", { tableHoldToken: a.holdToken });
    const code = first.joinCode as string;

    await expect(customerOrder("14", {})).rejects.toMatchObject({ code: "TABLE_OCCUPIED" });
    const wrong = code === "1234" ? "4321" : "1234";
    await expect(customerOrder("14", { tableJoinCode: wrong })).rejects.toMatchObject({ code: "TABLE_JOIN_CODE_INVALID" });
    await expect(svc.holdCustomerTable({ tableNumber: "14", outletId })).rejects.toMatchObject({ code: "TABLE_OCCUPIED" });

    const join = await svc.holdCustomerTable({ tableNumber: "14", outletId, joinCode: code });
    expect(join.mode).toBe("join");
    const second = await customerOrder("14", { tableJoinCode: code });
    expect(second.joinCode).toBe(code);
    expect(second.order.tableLabel).toBe("Meja 14");

    const status = await svc.getPublicCustomerOrderStatus(second.order.id);
    expect(status.tableJoin?.joinCode).toBe(code);
  });

  it("kode ikut pindah meja dan hilang saat meja dikosongkan", async () => {
    const a = await svc.holdCustomerTable({ tableNumber: "15", outletId });
    const first = await customerOrder("15", { tableHoldToken: a.holdToken });
    await svc.moveTable("15", "16", kasir());
    const { eq, and } = await import("drizzle-orm");
    const sessionFor = async (table: string) => {
      const [row] = await t
        .getDb()
        .select()
        .from(t.schema.tableSessions)
        .where(and(eq(t.schema.tableSessions.outletId, outletId), eq(t.schema.tableSessions.tableNumber, table)));
      return row;
    };
    expect((await sessionFor("16")).joinCode).toBe(first.joinCode);
    expect((await sessionFor("15")).joinCode).toBeNull();

    await svc.updateTableStatus("16", { status: "empty" }, kasir());
    expect((await sessionFor("16")).joinCode).toBeNull();
  });
});

describe("Reserved & perlu dibersihkan", () => {
  it("meja reserved dan perlu dibersihkan tidak bisa dipilih atau dipesan pelanggan", async () => {
    await svc.updateTableStatus("18", { status: "reserved" }, kasir());
    await svc.updateTableStatus("19", { status: "needs_cleaning", needsCleaning: true, preserveCleanedAt: true }, kasir());
    expect((await publicRow("18")).customerStatus).toBe("reserved");
    expect((await publicRow("19")).customerStatus).toBe("cleaning");
    await expect(svc.holdCustomerTable({ tableNumber: "18", outletId })).rejects.toMatchObject({ code: "TABLE_RESERVED" });
    await expect(svc.holdCustomerTable({ tableNumber: "19", outletId })).rejects.toMatchObject({ code: "TABLE_CLEANING" });
    await expect(customerOrder("18", {})).rejects.toMatchObject({ code: "TABLE_RESERVED" });
  });

  it("order staf (tanpa aturan pilih meja) tetap jalan & membuat kode gabung", async () => {
    const created = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "20",
      customerMode: "guest",
      guestName: "Tamu Waiter",
      paymentMethod: "Cash",
      source: "qr_table",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    expect(created.joinCode).toMatch(/^\d{4}$/);
  });
});

describe("Kode gabung terlihat staf & tercetak di struk", () => {
  it("staf melihat kode di data meja; peta publik tidak membocorkannya", async () => {
    const a = await svc.holdCustomerTable({ tableNumber: "22", outletId });
    const first = await customerOrder("22", { tableHoldToken: a.holdToken });
    const staff = (await svc.getTableLiveRow("22", outletId)) as any;
    expect(staff.joinCode).toBe(first.joinCode);
    const pub = (await publicRow("22")) as any;
    expect(pub).toBeDefined();
    expect(pub.joinCode).toBeUndefined();
    expect(JSON.stringify(await svc.getPublicTableLiveData(outletId, null))).not.toContain(first.joinCode);
    // Meja kosong: tidak ada kode.
    expect(((await svc.getTableLiveRow("23", outletId)) as any).joinCode ?? null).toBeNull();
  });

  it("struk POS dine-in membawa kode gabung meja yang sama dengan data staf", async () => {
    const created = (await svc.createOrder(
      { orderType: "dine-in", tableLabel: "24", paymentMethod: "Cash", cashReceived: 1_000_000, items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }] } as any,
      kasir(),
    )) as any;
    expect(created.receipt.tableJoinCode).toMatch(/^\d{4}$/);
    const staff = (await svc.getTableLiveRow("24", outletId)) as any;
    expect(staff.joinCode).toBe(created.receipt.tableJoinCode);
    const { buildThermalContent } = await import("@/lib/thermal-receipt");
    expect(buildThermalContent(created.receipt)).toContain(`Kode gabung meja: ${created.receipt.tableJoinCode}`);
  });
});
