import { describe, expect, it } from "vitest";

import type { ProductionTicketView } from "@/lib/garage-api-types";
import {
  batchFifoAhead,
  boardColumns,
  fifoPositions,
  fifoSort,
  jumboTable,
  orderProgress,
  productionIndicators,
  productionKpis,
  queueLabel,
  syncHealth,
  wibDay,
} from "@/lib/production-v7";

// 12 Nov 2026 19:00 WIB = 12:00 UTC.
const NOW = Date.parse("2026-11-12T12:00:00Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

let seq = 0;
function ticket(over: Partial<ProductionTicketView> = {}): ProductionTicketView {
  seq += 1;
  return {
    ticketNo: `T-${String(seq).padStart(3, "0")}`,
    orderId: `order-${seq}`,
    orderNo: `POS-${seq}`,
    queueNo: seq,
    customerName: null,
    identity: `Antrian #${seq}`,
    table: "Meja 08",
    channel: "pos",
    station: "Bar",
    status: "queue",
    createdAt: at(1),
    acceptedAt: null,
    readyAt: null,
    targetMinutes: 15,
    claimedByName: null,
    handoverAt: null,
    handoverByName: null,
    issueReason: null,
    addonSequence: 1,
    chitPrintedAt: null,
    pendingCancel: null,
    legacy: false,
    pendingBatchNos: [],
    fifoOverride: null,
    items: [{ id: `i-${seq}`, label: "Iced Latte", qty: 2, note: null, status: "waiting", batchId: null, batchNo: null }],
    ...over,
  };
}

describe("FIFO", () => {
  it("urut waktu masuk server; seri diputus nomor tiket; urutan input tidak berpengaruh", () => {
    const a = ticket({ ticketNo: "T-B", createdAt: at(10) });
    const b = ticket({ ticketNo: "T-A", createdAt: at(10) });
    const c = ticket({ ticketNo: "T-C", createdAt: at(20) });
    expect(fifoSort([a, b, c]).map((t) => t.ticketNo)).toEqual(["T-C", "T-A", "T-B"]);
    expect(fifoSort([c, b, a]).map((t) => t.ticketNo)).toEqual(["T-C", "T-A", "T-B"]);
  });

  it("override resmi mendahului FIFO; antar-override urut waktu override", () => {
    const old = ticket({ ticketNo: "T-OLD", createdAt: at(30) });
    const vip1 = ticket({ ticketNo: "T-V1", createdAt: at(5), fifoOverride: { at: at(2), byName: "Owner", reason: "tamu menunggu lama" } });
    const vip2 = ticket({ ticketNo: "T-V2", createdAt: at(8), fifoOverride: { at: at(1), byName: "Owner", reason: "salah input" } });
    expect(fifoSort([old, vip2, vip1]).map((t) => t.ticketNo)).toEqual(["T-V1", "T-V2", "T-OLD"]);
  });

  it("posisi FIFO dihitung per station pada antrean MENUNGGU saja", () => {
    const bar1 = ticket({ station: "Bar", createdAt: at(9) });
    const bar2 = ticket({ station: "Bar", createdAt: at(4) });
    const food1 = ticket({ station: "Food", createdAt: at(7) });
    const cooking = ticket({ station: "Bar", status: "cooking", createdAt: at(20) });
    const pos = fifoPositions([bar2, food1, cooking, bar1]);
    expect(pos.get(bar1.ticketNo)).toBe(1);
    expect(pos.get(bar2.ticketNo)).toBe(2);
    expect(pos.get(food1.ticketNo)).toBe(1);
    expect(pos.has(cooking.ticketNo)).toBe(false);
  });
});

describe("keadilan FIFO untuk batch", () => {
  it("menghitung pesanan menunggu yang masuk lebih dulu tetapi tidak ikut batch", () => {
    const older = ticket({ ticketNo: "T-OLD", createdAt: at(20) });
    const inBatchA = ticket({ ticketNo: "T-A", createdAt: at(10) });
    const inBatchB = ticket({ ticketNo: "T-B", createdAt: at(5) });
    const otherStation = ticket({ ticketNo: "T-FOOD", station: "Food", createdAt: at(30) });
    const cooking = ticket({ ticketNo: "T-COOK", status: "cooking", createdAt: at(40) });
    const all = [inBatchB, older, otherStation, cooking, inBatchA];
    const result = batchFifoAhead({ station: "Bar", ticketNos: ["T-A", "T-B"] }, all);
    expect(result.count).toBe(1);
    expect(result.first?.ticketNo).toBe("T-OLD");
  });

  it("batch yang memuat pesanan terdepan tidak melompati siapa pun", () => {
    const head = ticket({ ticketNo: "T-HEAD", createdAt: at(20) });
    const later = ticket({ ticketNo: "T-LATER", createdAt: at(5) });
    expect(batchFifoAhead({ station: "Bar", ticketNos: ["T-HEAD"] }, [later, head])).toEqual({ count: 0, first: null });
    // Tiket batch sudah tidak menunggu (sedang diproses) → tidak ada yang dilompati.
    expect(batchFifoAhead({ station: "Bar", ticketNos: ["T-GONE"] }, [later, head]).count).toBe(0);
  });
});

describe("kolom papan — tidak ada tiket aktif yang hilang", () => {
  it("jumlah keempat daftar = jumlah tiket; tiket lama & SIAP berhari-hari tetap ada", () => {
    const tickets = [
      ticket({ status: "queue", createdAt: at(60 * 30) }), // menunggu 30 jam
      ticket({ status: "cooking", createdAt: at(200), acceptedAt: at(190) }),
      ticket({ status: "ready", createdAt: at(30), readyAt: at(10) }),
      ticket({ status: "ready", createdAt: at(60 * 50), readyAt: at(60 * 49) }), // siap 2 hari lalu
    ];
    const cols = boardColumns(tickets, NOW);
    expect(cols.waiting).toHaveLength(1);
    expect(cols.processing).toHaveLength(1);
    expect(cols.ready).toHaveLength(1);
    expect(cols.readyEarlier).toHaveLength(1);
    expect(cols.waiting.length + cols.processing.length + cols.ready.length + cols.readyEarlier.length).toBe(tickets.length);
  });

  it("100 tiket: semua tetap ada dan urutan FIFO utuh", () => {
    const many = Array.from({ length: 100 }, (_, i) => ticket({ createdAt: at(200 - i), status: i % 3 === 0 ? "cooking" : "queue" }));
    const shuffled = [...many].reverse();
    const cols = boardColumns(shuffled, NOW);
    expect(cols.waiting.length + cols.processing.length).toBe(100);
    const times = cols.waiting.map((t) => Date.parse(t.createdAt));
    expect(times).toEqual([...times].sort((x, y) => x - y));
  });

  it("hari operasional WIB: 23:30 WIB dan 00:30 WIB berbeda hari", () => {
    expect(wibDay("2026-11-12T16:30:00Z")).toBe("2026-11-12"); // 23:30 WIB
    expect(wibDay("2026-11-12T17:30:00Z")).toBe("2026-11-13"); // 00:30 WIB
  });
});

describe("tampilan kartu", () => {
  it("nomor antrean stabil 4 digit; tanpa nomor = null (tidak dikarang)", () => {
    expect(queueLabel(12)).toBe("#0012");
    expect(queueLabel(null)).toBeNull();
    expect(queueLabel(0)).toBeNull();
  });

  it("nomor meja jumbo dari label tiket; tanpa meja = Takeaway/Delivery", () => {
    expect(jumboTable("Meja 8")).toEqual({ kind: "table", value: "08" });
    expect(jumboTable("T-12")).toEqual({ kind: "table", value: "12" });
    expect(jumboTable("Takeaway")).toEqual({ kind: "pickup", value: "TAKEAWAY" });
    expect(jumboTable("Delivery")).toEqual({ kind: "pickup", value: "DELIVERY" });
  });

  it("progres order hanya dari item yang benar-benar siap", () => {
    const bar = ticket({
      orderId: "o-1",
      station: "Bar",
      status: "cooking",
      items: [
        { id: "a", label: "Iced Latte", qty: 2, note: null, status: "ready", batchId: null, batchNo: null },
        { id: "b", label: "Americano", qty: 2, note: null, status: "processing", batchId: null, batchNo: null },
      ],
    });
    expect(orderProgress([bar])).toMatchObject({ readyQty: 2, totalQty: 4, percent: 50 });
    const food = ticket({ orderId: "o-1", station: "Food", status: "ready", items: [{ id: "c", label: "Nasi Goreng", qty: 1, note: null, status: "waiting", batchId: null, batchNo: null }] });
    // Tiket siap = seluruh porsinya siap; Bar siap ≠ seluruh order siap.
    expect(orderProgress([bar, food])).toMatchObject({ readyQty: 3, totalQty: 5, percent: 60 });
    expect(orderProgress([]).percent).toBe(0);
  });
});

describe("KPI", () => {
  it("dihitung dari tiket nyata; tanpa antrean = null (bukan 0 menit)", () => {
    const tickets = [
      ticket({ status: "queue", createdAt: at(20), targetMinutes: 15 }), // lewat target
      ticket({ status: "queue", createdAt: at(2), fifoOverride: { at: at(1), byName: "Owner", reason: "uji" } }),
      ticket({ status: "cooking", createdAt: at(5), acceptedAt: at(4) }),
      ticket({ status: "ready", createdAt: at(9), readyAt: at(1) }),
    ];
    const kpi = productionKpis({ tickets, batches: [{ station: "Bar" }], suggestions: [], now: NOW });
    expect(kpi).toMatchObject({ waiting: 2, processing: 1, ready: 1, overdue: 1, activeBatches: 1 });
    // Terlama dihitung dari waktu masuk, bukan dari override.
    expect(kpi.oldestWaitingMinutes).toBe(20);
    expect(productionKpis({ tickets: [], batches: [], suggestions: [], now: NOW }).oldestWaitingMinutes).toBeNull();
  });
});

describe("indikator cerdas", () => {
  const base = { suggestions: [], load: [], now: NOW };
  const codes = (list: ReturnType<typeof productionIndicators>) => list.map((i) => i.code);

  it("papan kosong: tanpa indikator (tidak ada angka karangan)", () => {
    expect(productionIndicators({ ...base, tickets: [] })).toEqual([]);
  });

  it("lewat target, giliran berikutnya, dan urutan tingkat (kritis dulu)", () => {
    const late = ticket({ createdAt: at(25), targetMinutes: 15 });
    const fresh = ticket({ createdAt: at(1) });
    const list = productionIndicators({ ...base, tickets: [fresh, late] });
    expect(list[0]).toMatchObject({ code: "OVERDUE", level: "critical", kind: "hitungan", ticketNos: [late.ticketNo] });
    const next = list.find((i) => i.code === "OLDEST_WAITING_Bar")!;
    expect(next.ticketNos).toEqual([late.ticketNo]);
    expect(next.kind).toBe("fakta");
  });

  it("konflik FIFO: tiket yang masuk belakangan diproses saat yang lebih awal masih menunggu", () => {
    const early = ticket({ createdAt: at(12), status: "queue" });
    const lateStarted = ticket({ createdAt: at(4), status: "cooking", acceptedAt: at(3) });
    expect(codes(productionIndicators({ ...base, tickets: [early, lateStarted] }))).toContain("FIFO_CONFLICT_Bar");
    // Didahulukan secara resmi → bukan konflik.
    const official = { ...lateStarted, fifoOverride: { at: at(3), byName: "Owner", reason: "tamu VIP" } };
    const list = productionIndicators({ ...base, tickets: [early, official] });
    expect(codes(list)).not.toContain("FIFO_CONFLICT_Bar");
    expect(codes(list)).toContain("FIFO_OVERRIDE");
    // Station berbeda tidak saling konflik.
    const kitchen = { ...lateStarted, station: "Food" as const, fifoOverride: null };
    expect(codes(productionIndicators({ ...base, tickets: [early, kitchen] }))).not.toContain("FIFO_CONFLICT_Bar");
  });

  it("diproses sangat lama, siap tertahan, dan siap dari hari sebelumnya", () => {
    const stuck = ticket({ status: "cooking", createdAt: at(50), acceptedAt: at(45), targetMinutes: 10 });
    const held = ticket({ status: "ready", createdAt: at(30), readyAt: at(12) });
    const carried = ticket({ status: "ready", createdAt: at(60 * 40), readyAt: at(60 * 39) });
    const list = codes(productionIndicators({ ...base, tickets: [stuck, held, carried] }));
    expect(list).toEqual(expect.arrayContaining(["STUCK", "READY_HOLD", "SHIFT_CARRYOVER"]));
  });

  it("kesiapan lintas station: Bar siap tidak berarti order siap", () => {
    const bar = ticket({ orderId: "o-9", station: "Bar", status: "ready", readyAt: at(1) });
    const food = ticket({ orderId: "o-9", station: "Food", status: "cooking", acceptedAt: at(2) });
    const item = productionIndicators({ ...base, tickets: [bar, food] }).find((i) => i.code === "MULTI_STATION_WAIT")!;
    expect(item.ticketNos).toEqual([food.ticketNo]);
  });

  it("batch, mode ramai, bottleneck, batal, data kurang, dan papan terpotong", () => {
    const a = ticket({ pendingCancel: { approvalId: "APP-VOID-1", kind: "order", summary: "batal" } });
    const noItems = ticket({ items: [] });
    const list = productionIndicators({
      tickets: [a, noItems],
      now: NOW,
      suggestions: [
        { key: "k", station: "Bar", itemLabel: "Iced Latte", menuItemId: "m", variantId: "cold", note: null, totalQty: 6, oldestAt: at(5), items: [{ id: "1", ticketNo: a.ticketNo, identity: "", table: "Meja 08", orderNo: "POS-1", qty: 2 }] },
      ],
      load: [
        { station: "Bar", waiting: 9, processing: 1, ready: 0, oldestWaitingMinutes: 9, avgProductionMinutes: null, slaRisk: 0 },
        { station: "Food", waiting: 0, processing: 0, ready: 0, oldestWaitingMinutes: null, avgProductionMinutes: null, slaRisk: 0 },
      ],
      truncated: { shown: 600, total: 640 },
    });
    expect(codes(list)).toEqual(expect.arrayContaining(["BATCH_OPPORTUNITY", "STATION_BUSY_Bar", "BOTTLENECK", "PENDING_CANCEL", "MISSING_ITEMS", "TRUNCATED"]));
    expect(list[0].level).toBe("critical");
    expect(list.find((i) => i.code === "BATCH_OPPORTUNITY")!.kind).toBe("saran");
  });

  it("setiap indikator menjelaskan apa, kenapa, dan tindakan; bahasa tidak menuduh", () => {
    const list = productionIndicators({
      ...base,
      tickets: [ticket({ createdAt: at(40), targetMinutes: 10 }), ticket({ status: "cooking", createdAt: at(3), acceptedAt: at(2) })],
    });
    expect(list.length).toBeGreaterThan(0);
    for (const item of list) {
      expect(item.title.length).toBeGreaterThan(5);
      expect(item.why.length).toBeGreaterThan(5);
      expect(item.action.length).toBeGreaterThan(5);
      expect(`${item.title} ${item.why} ${item.action}`).not.toMatch(/lalai|malas|salah staf|ceroboh/i);
    }
  });
});

describe("status sinkron", () => {
  it("offline, menyambung ulang (error / data basi), terhubung", () => {
    expect(syncHealth({ online: false, streamConnected: false, lastError: null, lastSyncAt: NOW, now: NOW })).toMatchObject({ state: "offline", stale: true });
    expect(syncHealth({ online: true, streamConnected: true, lastError: "HTTP 502", lastSyncAt: NOW - 5_000, now: NOW })).toMatchObject({ state: "reconnecting", stale: true });
    expect(syncHealth({ online: true, streamConnected: true, lastError: null, lastSyncAt: NOW - 90_000, now: NOW })).toMatchObject({ state: "reconnecting", stale: true, ageSeconds: 90 });
    expect(syncHealth({ online: true, streamConnected: true, lastError: null, lastSyncAt: NOW - 4_000, now: NOW })).toMatchObject({ state: "connected", stale: false, label: "TERHUBUNG" });
    expect(syncHealth({ online: true, streamConnected: false, lastError: null, lastSyncAt: NOW - 4_000, now: NOW }).label).toBe("TERHUBUNG (POLL)");
  });
});
