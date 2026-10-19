import { describe, expect, it } from "vitest";

import { currentStepIndex, ticketToChit } from "@/components/garage/pos-production-panel";
import type { KitchenOrder } from "@/lib/garage-api-types";

const base: KitchenOrder = {
  id: "KDS-1",
  table: "Meja 06",
  channel: "dine-in",
  station: "Bar",
  status: "queue",
  elapsed: 0,
  items: ["2x Coffee Latte Cold", "1x Choco Kiss"],
  itemNotes: { "1x Choco Kiss": "less sugar" },
  internalNotes: null,
  priority: "normal",
  targetMinutes: 10,
  targetGroup: "bar",
  acceptedAt: null,
  acceptedByName: null,
  readyAt: null,
  readyByName: null,
  deliveredAt: null,
  deliveredByName: null,
  createdAt: "2026-10-19T12:00:00.000Z",
  customerName: "Andi",
  orderNo: "POS-0001",
};

describe("panel Bar & Dapur POS", () => {
  it("langkah status mengikuti cap waktu tiket", () => {
    expect(currentStepIndex(base)).toBe(0);
    expect(currentStepIndex({ ...base, status: "cooking", acceptedAt: "2026-10-19T12:01:00.000Z" })).toBe(1);
    const called = { ...base, status: "ready", acceptedAt: "x", readyAt: "y", handoverAt: "2026-10-19T12:08:00.000Z" };
    expect(currentStepIndex(called)).toBe(3);
    expect(currentStepIndex({ ...called, claimedAt: "2026-10-19T12:09:00.000Z" })).toBe(4);
    expect(currentStepIndex({ ...called, status: "completed", deliveredAt: "2026-10-19T12:12:00.000Z" })).toBe(5);
  });

  it("tiket jadi chit: qty dipisah, catatan ikut, station Bar/Dapur", () => {
    const chit = ticketToChit(base);
    expect(chit.items).toEqual([
      { name: "Coffee Latte Cold", qty: 2, note: null, station: "Bar" },
      { name: "Choco Kiss", qty: 1, note: "less sugar", station: "Bar" },
    ]);
    expect(chit.customerName).toBe("Andi");
    expect(ticketToChit({ ...base, station: "Food" }).items[0].station).toBe("Dapur");
  });
});
