import { describe, expect, it } from "vitest";

import type {
  ProductionBatchSuggestionView,
  ProductionBatchView,
  ProductionTicketView,
} from "@/lib/garage-api-types";
import {
  batchSummary,
  buildBatchRows,
  estimateMinutes,
  nextAllocation,
  ordersReadyAfterBatches,
  tallyMenus,
} from "@/lib/production-batch-view";

const NOW = new Date("2026-11-02T10:00:00+07:00").getTime();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

function alloc(id: string, ticketNo: string, orderNo: string, qty: number, allocated = false, note: string | null = null) {
  return { id, ticketNo, orderNo, customerName: null, identity: "Tamu", table: "Meja 01", qty, note, allocated };
}

const latteNormal: ProductionBatchView = {
  id: "b1",
  batchNo: "B-1",
  station: "Bar",
  itemLabel: "Latte Cold",
  menuItemId: "latte",
  variantId: "cold",
  note: null,
  totalQty: 6,
  status: "processing",
  startedAt: ago(4),
  startedByName: "Bima",
  allocations: [alloc("a1", "T1", "105", 2, true), alloc("a2", "T2", "108", 4)],
};
const latteLess: ProductionBatchView = {
  ...latteNormal,
  id: "b2",
  batchNo: "B-2",
  note: "Less sugar",
  totalQty: 2,
  startedAt: ago(2),
  allocations: [alloc("a3", "T3", "110", 2, false, "Less sugar")],
};
const americano: ProductionBatchSuggestionView = {
  key: "s1",
  station: "Bar",
  itemLabel: "Americano Cold",
  menuItemId: "americano",
  variantId: "cold",
  note: null,
  totalQty: 3,
  oldestAt: ago(9),
  items: [
    { id: "i1", ticketNo: "T4", identity: "A", table: "Meja 02", orderNo: "111", qty: 2 },
    { id: "i2", ticketNo: "T5", identity: "B", table: "Meja 03", orderNo: "112", qty: 1 },
  ],
};

describe("baris batch (Auto Grouping)", () => {
  it("menu + varian sama jadi satu baris; modifier jadi chip; progress dari porsi teralokasi", () => {
    const rows = buildBatchRows([latteNormal, latteLess], [americano], { grouped: true, lateTicketNos: new Set() });
    expect(rows).toHaveLength(2);
    const latte = rows.find((r) => r.menuItemId === "latte")!;
    expect(latte).toMatchObject({ totalQty: 8, doneQty: 2, status: "proses" });
    expect(latte.modifiers).toEqual([
      { label: "Normal", qty: 6 },
      { label: "Less sugar", qty: 2 },
    ]);
    expect(latte.orders.sort()).toEqual(["105", "108", "110"]);
    expect(latte.batches).toHaveLength(2);
    const amer = rows.find((r) => r.menuItemId === "americano")!;
    expect(amer).toMatchObject({ status: "menunggu", totalQty: 3, doneQty: 0 });
  });

  it("tanpa grouping: tiap sub-batch kompatibel satu baris", () => {
    const rows = buildBatchRows([latteNormal, latteLess], [americano], { grouped: false, lateTicketNos: new Set() });
    expect(rows).toHaveLength(3);
  });

  it("prioritas SLA naik ke atas", () => {
    const rows = buildBatchRows([latteNormal], [americano], { grouped: true, lateTicketNos: new Set(["T5"]) });
    expect(rows[0]).toMatchObject({ menuItemId: "americano", priority: true });
  });
});

describe("aksi & ringkasan", () => {
  it("Selesaikan 1 memilih porsi pertama yang belum jadi", () => {
    const [row] = buildBatchRows([latteNormal], [], { grouped: true, lateTicketNos: new Set() });
    expect(nextAllocation(row)?.allocation.id).toBe("a2");
  });

  it("estimasi dari rata-rata produksi station dikurangi waktu berjalan", () => {
    expect(estimateMinutes({ startedAt: ago(4), status: "proses" }, 10, NOW)).toBe(6);
    expect(estimateMinutes({ startedAt: null, status: "menunggu" }, null, NOW)).toBe(8);
    expect(estimateMinutes({ startedAt: ago(30), status: "proses" }, 10, NOW)).toBe(1);
    expect(estimateMinutes({ startedAt: ago(1), status: "siap" }, 10, NOW)).toBe(0);
  });

  it("ringkasan: batch aktif, item proses, prioritas", () => {
    const rows = buildBatchRows([latteNormal, latteLess], [americano], { grouped: true, lateTicketNos: new Set(["T2"]) });
    expect(batchSummary(rows, 10, NOW)).toMatchObject({
      activeBatch: 2,
      processing: 1,
      waiting: 1,
      itemsInProgress: 9,
      totalQty: 11,
      priority: 1,
    });
  });
});

function ticket(ticketNo: string, status: string, items: Array<Partial<ProductionTicketView["items"][number]>>): ProductionTicketView {
  return {
    ticketNo,
    orderId: ticketNo,
    orderNo: `O-${ticketNo}`,
    queueNo: null,
    customerName: null,
    identity: "Tamu",
    table: "Meja 01",
    channel: "dine-in",
    station: "Bar",
    status,
    createdAt: ago(5),
    acceptedAt: null,
    readyAt: null,
    targetMinutes: 10,
    claimedByName: null,
    handoverAt: null,
    handoverByName: null,
    issueReason: null,
    addonSequence: 1,
    chitPrintedAt: null,
    legacy: false,
    pendingBatchNos: [],
    items: items.map((i, n) => ({ id: `${ticketNo}-${n}`, label: "Latte Cold", qty: 1, note: null, status: "waiting", batchId: null, batchNo: null, ...i })),
  };
}

describe("rekap menu & pesanan akan ready", () => {
  it("Semua Menu menjumlah porsi per status", () => {
    const tally = tallyMenus([
      ticket("T1", "cooking", [{ status: "processing", qty: 2 }, { label: "Americano Cold", status: "waiting" }]),
      ticket("T2", "ready", [{ status: "ready" }]),
      ticket("T3", "delivered", [{ status: "ready" }]),
    ]);
    const latte = tally.find((m) => m.label === "Latte Cold")!;
    expect(latte).toMatchObject({ processing: 2, ready: 1, waiting: 0 });
    expect(latte.orders.sort()).toEqual(["O-T1", "O-T2"]);
  });

  it("order hanya 'akan ready' bila semua porsi tersisanya ada di batch", () => {
    const rows = buildBatchRows([latteNormal], [], { grouped: true, lateTicketNos: new Set() });
    const onlyBatch = ticket("T2", "cooking", [{ status: "processing", batchId: "b1" }]);
    const mixed = { ...ticket("T2", "cooking", [{ status: "processing", batchId: "b1" }, { status: "waiting" }]), orderNo: "MIX" };
    expect(ordersReadyAfterBatches([onlyBatch], rows)).toEqual(["O-T2"]);
    expect(ordersReadyAfterBatches([mixed], rows)).toEqual([]);
  });
});
