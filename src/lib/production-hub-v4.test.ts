import { describe, expect, it } from "vitest";

import {
  fitItems,
  hubStatusOf,
  isPickupTicket,
  primaryActionOf,
  readyLabel,
  resolveGrid,
  slaLevelOf,
  sortHubTickets,
  stabilizeOrder,
} from "@/lib/production-hub-v4";
import {
  buildCompletionTicketContent,
  canAutoPrintJob,
  completionRetryDelayMs,
  isOrderProductionComplete,
  reprintAllowed,
  statusAfterDefiniteFailure,
} from "@/lib/production-completion-print-rules";

const NOW = new Date("2026-11-02T10:00:00+07:00").getTime();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

type T = {
  ticketNo: string;
  status: string;
  table: string;
  channel: string;
  createdAt: string;
  handoverAt: string | null;
  readyAt: string | null;
  targetMinutes: number;
};

function ticket(over: Partial<T> = {}): T {
  return {
    ticketNo: "KT-1",
    status: "queue",
    table: "Meja 06",
    channel: "dine-in",
    createdAt: ago(1),
    handoverAt: null,
    readyAt: null,
    targetMinutes: 10,
    ...over,
  };
}

describe("status & aksi utama", () => {
  it("satu aksi per status; dine-in diantar", () => {
    expect(primaryActionOf(ticket({ status: "queue" }))?.action).toBe("start");
    expect(primaryActionOf(ticket({ status: "cooking" }))?.action).toBe("finish");
    expect(primaryActionOf(ticket({ status: "ready" }))?.action).toBe("call");
    expect(primaryActionOf(ticket({ status: "ready", handoverAt: ago(1) }))?.action).toBe("deliver_done");
    expect(primaryActionOf(ticket({ status: "delivered" }))).toBeNull();
  });

  it("pickup tidak pernah memakai aksi antar, bahkan setelah dipanggil", () => {
    const pickup = ticket({ status: "ready", table: "Takeaway", channel: "takeaway" });
    expect(isPickupTicket(pickup)).toBe(true);
    expect(primaryActionOf(pickup)?.action).toBe("serve");
    expect(readyLabel(pickup)).toBe("Siap Diambil");
    const called = { ...pickup, handoverAt: ago(1) };
    expect(hubStatusOf(called)).toBe("ready");
    expect(primaryActionOf(called)?.action).toBe("serve");
    expect(readyLabel(ticket({ status: "delivered", table: "Takeaway" }))).toBe("Sudah Diambil");
    expect(readyLabel(ticket({ status: "ready", handoverAt: ago(1) }))).toBe("Sedang Diantar");
    expect(readyLabel(ticket({ status: "ready" }))).toBe("Siap Antar");
  });
});

describe("SLA & urutan prioritas", () => {
  it("SLA mengikuti target tiket; tiket siap tidak pernah kritis", () => {
    expect(slaLevelOf(ticket({ createdAt: ago(2) }), NOW)).toBe("ok");
    expect(slaLevelOf(ticket({ createdAt: ago(7) }), NOW)).toBe("warn");
    expect(slaLevelOf(ticket({ createdAt: ago(11) }), NOW)).toBe("critical");
    expect(slaLevelOf(ticket({ status: "ready", createdAt: ago(30) }), NOW)).toBe("ok");
  });

  it("kritis dulu, lalu menunggu terlama, lalu proses, lalu siap", () => {
    const list = [
      ticket({ ticketNo: "ready", status: "ready", createdAt: ago(20) }),
      ticket({ ticketNo: "cook-old", status: "cooking", createdAt: ago(8) }),
      ticket({ ticketNo: "wait-new", status: "queue", createdAt: ago(1) }),
      ticket({ ticketNo: "wait-old", status: "queue", createdAt: ago(5) }),
      ticket({ ticketNo: "late-cook", status: "cooking", createdAt: ago(15) }),
    ];
    expect(sortHubTickets(list, NOW).map((t) => t.ticketNo)).toEqual([
      "late-cook",
      "wait-old",
      "wait-new",
      "cook-old",
      "ready",
    ]);
    expect(sortHubTickets(list, NOW, "newest")[0].ticketNo).toBe("wait-new");
    expect(sortHubTickets(list, NOW, "oldest")[0].ticketNo).toBe("ready");
  });

  it("kartu yang sedang dipakai tetap di posisinya", () => {
    const prev = ["a", "b", "c", "d"];
    const next = ["x", "c", "a", "d", "b"];
    expect(stabilizeOrder(prev, next, ["b"])).toEqual(["x", "b", "c", "a", "d"]);
    expect(stabilizeOrder(prev, next, [])).toEqual(next);
    expect(stabilizeOrder(prev, ["c", "d"], ["a"])).toEqual(["c", "d"]);
  });
});

describe("kepadatan & item", () => {
  it("1920×1080 → 15 (5×3); 18 padat bila muat; tablet → 8 (4×2)", () => {
    expect(resolveGrid("auto", 1560, 880)).toMatchObject({ cols: 5, rows: 3 });
    expect(resolveGrid("auto", 1008, 620)).toMatchObject({ cols: 4, rows: 2 });
    expect(resolveGrid("auto", 2224, 1290)).toMatchObject({ cols: 6, rows: 4 });
    expect(resolveGrid("15", 1560, 880)).toMatchObject({ cols: 5, rows: 3, clamped: false });
    expect(resolveGrid("18", 1560, 880)).toMatchObject({ cols: 6, rows: 3, clamped: false });
    expect(resolveGrid("8", 1000, 600)).toMatchObject({ cols: 4, rows: 2, clamped: false });
  });

  it("preset yang tidak terbaca diturunkan (tidak pernah memaksa teks mengecil)", () => {
    const grid = resolveGrid("24", 1100, 600);
    expect(grid.clamped).toBe(true);
    expect(grid.cols * grid.rows).toBeLessThan(24);
  });

  it("+N item lainnya saat item melebihi kartu; catatan memakan baris", () => {
    const items = [{ note: null }, { note: "less sugar" }, { note: null }, { note: null }, { note: null }];
    expect(fitItems(items, 4)).toMatchObject({ hidden: 3 });
    expect(fitItems(items, 5)).toMatchObject({ hidden: 2 });
    expect(fitItems(items, 6)).toMatchObject({ hidden: 0 });
    expect(fitItems(items.slice(0, 1), 1)).toMatchObject({ hidden: 0 });
  });
});

describe("aturan tiket SELESAI", () => {
  it("selesai bila semua tiket hidup siap/diantar; batal diabaikan", () => {
    expect(isOrderProductionComplete(["ready", "delivered"])).toBe(true);
    expect(isOrderProductionComplete(["ready", "cooking"])).toBe(false);
    expect(isOrderProductionComplete(["ready", "cancelled"])).toBe(true);
    expect(isOrderProductionComplete(["cancelled"])).toBe(false);
  });

  it("gagal pasti diulang dengan backoff sampai batas; job tua tidak dicetak otomatis", () => {
    expect(statusAfterDefiniteFailure(1)).toBe("pending");
    expect(statusAfterDefiniteFailure(5)).toBe("failed");
    expect(completionRetryDelayMs(0)).toBe(0);
    expect(completionRetryDelayMs(3)).toBe(20_000);
    expect(completionRetryDelayMs(10)).toBe(60_000);
    const job = { status: "pending", attempts: 1, updatedAt: ago(0), createdAt: ago(1) };
    expect(canAutoPrintJob(job, NOW)).toBe(false);
    expect(canAutoPrintJob({ ...job, updatedAt: ago(1) }, NOW)).toBe(true);
    expect(canAutoPrintJob({ ...job, attempts: 0, createdAt: ago(7 * 60) }, NOW)).toBe(false);
    expect(canAutoPrintJob({ ...job, status: "printing" }, NOW)).toBe(false);
  });

  it("cetak ulang: kasir dibatasi, Owner/Manajer bebas", () => {
    expect(reprintAllowed("Kasir", 2).ok).toBe(true);
    expect(reprintAllowed("Kasir", 3).ok).toBe(false);
    expect(reprintAllowed("Manajer", 10).ok).toBe(true);
  });

  it("tiket SELESAI memuat order, meja, item per station, catatan, dan tanda cetak ulang", () => {
    const text = buildCompletionTicketContent(
      {
        orderId: "o1",
        orderNo: "GC-0105",
        queueNo: 12,
        tableLabel: "Meja 08",
        channel: "dine-in",
        customerName: "Andi",
        orderedAt: ago(10),
        completedAt: ago(0),
        items: [
          { station: "Bar", label: "Latte Cold", qty: 2, note: "less ice" },
          { station: "Dapur", label: "Nasi Goreng", qty: 1, note: null },
        ],
        stations: [
          { station: "Bar", readyAt: ago(2), readyByName: "Bima" },
          { station: "Dapur", readyAt: ago(0), readyByName: null },
        ],
        reprint: { sequence: 1, reason: "kertas sobek", byName: "Rina" },
      },
      32,
    );
    for (const part of [
      "PESANAN SELESAI",
      "CETAK ULANG KE-1",
      "ANTRIAN #12",
      "GC-0105",
      "MEJA 08",
      "NAMA: ANDI",
      "[BAR]",
      "2x Latte Cold",
      "* less ice",
      "[DAPUR]",
      "1x Nasi Goreng",
    ]) {
      expect(text).toContain(part);
    }
    expect(text.split("\n").every((line) => line.length <= 32)).toBe(true);
  });

  it("nama petugas panjang tidak terpotong di kertas 32 kolom", () => {
    const text = buildCompletionTicketContent(
      {
        orderId: "o2",
        orderNo: "GC-0106",
        queueNo: null,
        tableLabel: "Takeaway",
        channel: "takeaway",
        customerName: null,
        orderedAt: ago(5),
        completedAt: ago(0),
        items: [{ station: "Bar", label: "Latte", qty: 1, note: null }],
        stations: [{ station: "Bar", readyAt: ago(0), readyByName: "Owner Garage Coffee Tebing" }],
      },
      32,
    );
    expect(text.replace(/\s+/g, " ")).toContain("Owner Garage Coffee Tebing");
    expect(text.split("\n").every((line) => line.length <= 32)).toBe(true);
  });
});

describe("pengelompokan order", () => {
  it("tiket Bar & Dapur satu order berdampingan, urutan order tetap", async () => {
    const { groupSiblings } = await import("@/lib/production-hub-v4");
    const list = [
      { no: "a-bar", order: "A" },
      { no: "b-bar", order: "B" },
      { no: "a-dapur", order: "A" },
      { no: "x", order: null },
      { no: "b-dapur", order: "B" },
    ];
    expect(groupSiblings(list, (t) => t.order).map((t) => t.no)).toEqual(["a-bar", "a-dapur", "b-bar", "b-dapur", "x"]);
  });
});
