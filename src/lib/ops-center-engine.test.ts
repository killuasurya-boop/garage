import { describe, expect, it } from "vitest";

import type { ProductionBatchSuggestionView } from "@/lib/garage-api-types";
import { buildBatchSuggestions, type BatchCandidateItem } from "@/lib/garage-production-rules";
import {
  batchScore,
  buildAlerts,
  buildInsights,
  changePct,
  detectBottlenecks,
  forecastNext60,
  nextBestAction,
  opsStatus,
  servingLoadPct,
  stationLoadPct,
  type EngineTicket,
} from "@/lib/ops-center-engine";

// Skenario penerimaan Garage Control Center (WIB 19:01–19:08).
const at = (hhmm: string) => `2026-10-05T${hhmm}:00+07:00`;

type Line = { no: string; time: string; item: string; label: string; station: "Bar" | "Food"; qty: number; note?: string };
const LINES: Line[] = [
  { no: "101", time: "19:01", item: "kopi-susu", label: "Kopi Susu", station: "Bar", qty: 2 },
  { no: "102", time: "19:03", item: "nasi-goreng", label: "Nasi Goreng", station: "Food", qty: 2 },
  { no: "103", time: "19:04", item: "kopi-susu", label: "Kopi Susu", station: "Bar", qty: 1 },
  { no: "104", time: "19:05", item: "lemon-tea", label: "Lemon Tea", station: "Bar", qty: 2 },
  { no: "105", time: "19:07", item: "nasi-goreng", label: "Nasi Goreng", station: "Food", qty: 1 },
  { no: "106", time: "19:08", item: "kopi-susu", label: "Kopi Susu", station: "Bar", qty: 2 },
];

function candidates(lines: Line[]): BatchCandidateItem[] {
  return lines.map((l) => ({
    id: `i-${l.no}-${l.item}`,
    ticketNo: `T${l.no}-${l.station}`,
    station: l.station,
    menuItemId: l.item,
    variantId: "regular",
    itemName: l.label,
    variantLabel: "Regular",
    qty: l.qty,
    note: l.note ?? null,
    batchEligible: true,
    customerName: null,
    tableLabel: `Meja ${l.no.slice(1)}`,
    orderNo: `#${l.no}`,
    createdAt: at(l.time),
  }));
}

function suggestionsFor(lines: Line[], windowSec = 600): ProductionBatchSuggestionView[] {
  return buildBatchSuggestions(candidates(lines), { windowSec }).map((s) => ({
    key: s.key,
    station: s.station,
    itemLabel: s.itemLabel,
    note: s.note,
    totalQty: s.totalQty,
    oldestAt: s.oldestAt,
    items: s.items.map((i) => ({
      id: i.id,
      ticketNo: i.ticketNo,
      identity: i.tableLabel,
      table: i.tableLabel,
      orderNo: i.orderNo,
      qty: i.qty,
    })),
  }));
}

function tickets(lines: Line[]): EngineTicket[] {
  const map = new Map<string, EngineTicket>();
  for (const l of lines) {
    const ticketNo = `T${l.no}-${l.station}`;
    const t = map.get(ticketNo) ?? {
      ticketNo,
      orderNo: `#${l.no}`,
      station: l.station,
      status: "queue",
      createdAt: at(l.time),
      acceptedAt: null,
      readyAt: null,
      handoverAt: null,
      targetMinutes: l.station === "Bar" ? 5 : 15,
      table: `Meja ${l.no.slice(1)}`,
      identity: `Meja ${l.no.slice(1)}`,
      items: [],
    };
    t.items.push({ id: `i-${l.no}-${l.item}`, label: l.label, qty: l.qty, note: l.note ?? null, status: "waiting", batchId: null, batchNo: null });
    map.set(ticketNo, t);
  }
  return [...map.values()];
}

describe("Smart Batch + skenario penerimaan", () => {
  const sugg = suggestionsFor(LINES);

  it("Bar: Kopi Susu ×5 (#101, #103, #106); Dapur: Nasi Goreng ×3 (#102, #105); Lemon Tea tidak di-batch", () => {
    const kopi = sugg.find((s) => s.itemLabel === "Kopi Susu")!;
    expect(kopi.totalQty).toBe(5);
    expect(kopi.items.map((i) => i.orderNo)).toEqual(["#101", "#103", "#106"]);
    const nasi = sugg.find((s) => s.itemLabel === "Nasi Goreng")!;
    expect(nasi.station).toBe("Food");
    expect(nasi.totalQty).toBe(3);
    expect(nasi.items.map((i) => i.orderNo)).toEqual(["#102", "#105"]);
    expect(sugg.find((s) => s.itemLabel === "Lemon Tea")).toBeUndefined();
  });

  it("kustomisasi berbeda (less ice) tidak digabung", () => {
    const withNote = LINES.map((l) => (l.no === "103" ? { ...l, note: "Less Ice" } : l));
    const kopi = suggestionsFor(withNote).find((s) => s.itemLabel === "Kopi Susu" && !s.note)!;
    expect(kopi.items.map((i) => i.orderNo)).toEqual(["#101", "#106"]);
    expect(suggestionsFor(withNote).some((s) => s.note === "Less Ice")).toBe(false); // 1 porsi = bukan batch
  });

  it("FIFO: #101 tetap order pertama di Bar", () => {
    const nba = nextBestAction("Bar", tickets(LINES), sugg, new Date(at("19:09")));
    expect(nba.kind).toBe("batch");
    if (nba.kind === "batch") {
      expect(nba.suggestion.items[0].orderNo).toBe("#101");
      expect(nba.reason).toBe("SMART_BATCH");
    }
  });

  it("#101 mendekati SLA & tidak tercakup batch → LINDUNGI SLA walau batch lain lebih efisien", () => {
    // #101 diganti Espresso (tidak bisa di-batch) — batch Kopi Susu (#103, #106) tetap ada.
    const lines = LINES.map((l) => (l.no === "101" ? { ...l, item: "espresso", label: "Espresso" } : l));
    const nba = nextBestAction("Bar", tickets(lines), suggestionsFor(lines), new Date(at("19:06")));
    expect(nba.kind).toBe("ticket");
    if (nba.kind === "ticket") {
      expect(nba.reason).toBe("SLA_PROTECTION");
      expect(nba.ticket.orderNo).toBe("#101");
    }
  });

  it("order tertua aman & tidak ada batch layak → FIFO", () => {
    const lines = LINES.filter((l) => l.no === "104");
    const nba = nextBestAction("Bar", tickets(lines), [], new Date(at("19:06")));
    expect(nba.kind === "ticket" && nba.reason === "FIFO").toBe(true);
    expect(nextBestAction("Food", [], [], new Date()).kind).toBe("idle");
  });
});

describe("Batch Score", () => {
  it("4 order ×7 porsi, masih segar → TINGGI (83)", () => {
    const s = {
      oldestAt: at("19:00"),
      totalQty: 7,
      items: ["a", "b", "c", "d"].map((t) => ({ id: t, ticketNo: t, identity: "", table: "", orderNo: null, qty: 2 })),
    };
    const score = batchScore(s, 10, new Date(at("19:02")));
    expect(score).toMatchObject({ score: 83, label: "TINGGI", orders: 4, setupsSaved: 6, slaRisk: "AMAN" });
  });

  it("order tertua ≥80% target → poin SLA 0, label turun", () => {
    const s = { oldestAt: at("19:00"), totalQty: 2, items: [1, 2].map((n) => ({ id: `${n}`, ticketNo: `${n}`, identity: "", table: "", orderNo: null, qty: 1 })) };
    expect(batchScore(s, 5, new Date(at("19:04"))).slaRisk).toBe("BERISIKO");
    expect(batchScore(s, 5, new Date(at("19:04"))).label).toBe("RENDAH");
  });
});

describe("Beban & status", () => {
  it("beban % = menit kerja ÷ kapasitas staf; durasi kerja nyata bila sampel cukup", () => {
    const t = tickets(LINES);
    // Tanpa sampel: 50% target. Bar: 4 tiket × 2,5 mnt = 10 mnt ÷ (1 × 30) → 33%.
    expect(stationLoadPct(t, "Bar", 1)).toBe(33);
    expect(stationLoadPct(t, "Bar", 2)).toBe(17);
    // Dapur: 2 × 7,5 = 15 mnt → 50% (dua order nasi goreng ≠ RUSH).
    expect(stationLoadPct(t, "Food", 1)).toBe(50);
    // Sampel nyata (≥5): rata-rata produksi 12 mnt → 2 × 12 = 24 → 80%.
    expect(stationLoadPct(t, "Food", 1, { avgMinutes: 12, samples: 6 })).toBe(80);
    // Sampel kurang → tetap fallback.
    expect(stationLoadPct(t, "Food", 1, { avgMinutes: 12, samples: 2 })).toBe(50);
    expect(servingLoadPct(6, 2)).toBe(75);
  });

  it("status NORMAL → SIBUK → RUSH → KRITIS", () => {
    const base = { waiting: 1, overSla: 0, slaRisk: 0, readyDelayed: 0, oldestWaitingMinutes: 1, oldestTargetMinutes: 5, maxLoadPct: 20 };
    expect(opsStatus(base).label).toBe("NORMAL");
    expect(opsStatus({ ...base, readyDelayed: 1 }).label).toBe("SIBUK");
    expect(opsStatus({ ...base, overSla: 1 }).label).toBe("RUSH");
    expect(opsStatus({ ...base, overSla: 3 }).label).toBe("KRITIS");
    expect(opsStatus({ ...base, oldestWaitingMinutes: 11 }).label).toBe("KRITIS");
    expect(opsStatus({ ...base, overSla: 3 }).reasons[0]).toContain("lewat SLA");
  });
});

describe("Alert, bottleneck, insight, forecast", () => {
  const stations = [
    { station: "Bar" as const, loadPct: 40, waiting: 2, oldestMinutes: 2, slaRisk: 0, overSla: 0, topBatchLabel: null },
    { station: "Food" as const, loadPct: 95, waiting: 5, oldestMinutes: 17, slaRisk: 1, overSla: 2, topBatchLabel: "Nasi Goreng ×3" },
  ];

  it("alert urut kritis dulu, bahasa tanpa menyalahkan staf", () => {
    const alerts = buildAlerts({
      stations,
      readyDelayed: [{ ticketNo: "x", table: "Meja 05", minutes: 6 }],
      batchOpportunities: 2,
      lowStock: [{ name: "Susu UHT" }],
      batchStockRisks: [],
    });
    expect(alerts[0].severity).toBe("critical");
    expect(alerts.map((a) => a.id)).toEqual(
      expect.arrayContaining(["sla-over-Food", "bottleneck-Food", "ready-delay", "low-stock", "batch-available"]),
    );
    expect(alerts.every((a) => !/staf|barista|koki|salah/i.test(a.title))).toBe(true);
  });

  it("bottleneck Dapur + stok", () => {
    const b = detectBottlenecks(stations, { loadPct: 20, delayed: 0, oldestReadyMinutes: null }, 3);
    expect(b.map((x) => x.area)).toEqual(["Dapur", "Stok"]);
    expect(b[0].recommendation).toContain("Nasi Goreng");
  });

  it("forecast: < 2 minggu ber-data → belum cukup; cukup → rentang nyata", () => {
    expect(forecastNext60([{ orders: 10, barTickets: 8, foodTickets: 3 }, { orders: 0, barTickets: 0, foodTickets: 0 }]))
      .toEqual({ status: "insufficient", weeksWithData: 1 });
    const f = forecastNext60([
      { orders: 18, barTickets: 14, foodTickets: 6 },
      { orders: 25, barTickets: 16, foodTickets: 9 },
      { orders: 0, barTickets: 0, foodTickets: 0 },
    ]);
    expect(f).toMatchObject({ status: "ok", expectedMin: 18, expectedMax: 25, weeksWithData: 2, bar: "TINGGI", kitchen: "SEDANG" });
  });

  it("insight hanya bila datanya cukup", () => {
    expect(buildInsights({ ordersByHour7d: Array(24).fill(0), topBatched: null, stationAvg: [] })).toEqual([]);
    const hours = Array(24).fill(0);
    hours[19] = 30;
    hours[20] = 20;
    hours[12] = 10;
    const insights = buildInsights({
      ordersByHour7d: hours,
      topBatched: { label: "Kopi Susu", qty: 12 },
      stationAvg: [{ station: "Food", today: 12, week: 9, samplesToday: 6 }],
    });
    expect(insights[0].title).toBe("Jam tersibuk 19:00–21:00");
    expect(insights.map((i) => i.id)).toEqual(["peak", "top-batch", "trend-Food"]);
    expect(changePct(12, 9)).toBe(33.3);
    expect(changePct(5, null)).toBeNull();
  });
});
