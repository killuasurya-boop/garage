import { describe, expect, it } from "vitest";

import type { ProductionTicketView } from "@/lib/garage-api-types";
import {
  chitCustomerName,
  chitStationLabel,
  combineChits,
  rawbtUrl,
  testChitContent,
  ticketChitContent,
  toEscPosBytes,
} from "@/lib/station-print";

function ticket(overrides: Partial<ProductionTicketView> = {}): ProductionTicketView {
  return {
    ticketNo: "K-TEST01",
    orderId: "o1",
    orderNo: "POS-100",
    queueNo: 7,
    customerName: "Budi",
    identity: "Budi",
    table: "T-05",
    channel: "dine-in",
    station: "Bar",
    status: "queue",
    createdAt: "2026-09-29T10:00:00.000Z",
    acceptedAt: null,
    readyAt: null,
    targetMinutes: 8,
    claimedByName: null,
    handoverAt: null,
    handoverByName: null,
    issueReason: null,
    addonSequence: 1,
    chitPrintedAt: null,
    legacy: false,
    pendingBatchNos: [],
    items: [
      { id: "i1", label: "Coffee Latte (Cold)", qty: 2, note: "less ice", status: "waiting", batchId: null, batchNo: null },
      { id: "i2", label: "Matcha", qty: 1, note: null, status: "waiting", batchId: null, batchNo: null },
    ],
    ...overrides,
  };
}

describe("cetak stasiun", () => {
  it("chit Bar memuat stasiun, meja, item, dan catatan — tanpa harga", () => {
    const text = ticketChitContent(ticket());
    expect(text).toContain("*** BAR ***");
    expect(text).toContain("T-05");
    expect(text).toContain("2x COFFEE LATTE (COLD)");
    expect(text).toContain(">> less ice");
    expect(text).not.toMatch(/Rp|IDR|total/i);
  });

  it("setiap chit memuat NAMA pemesan + nomor MEJA besar", () => {
    const text = ticketChitContent(ticket({ table: "Meja 05", identity: "Budi" }));
    expect(text).toMatch(/>>> MEJA 0?5 <<</);
    expect(text).toContain("NAMA: BUDI");
    // Tanpa nama (identity = meja) → baris NAMA tidak dicetak.
    expect(ticketChitContent(ticket({ table: "Meja 05", identity: "Meja 05" }))).not.toContain("NAMA:");
  });

  it("order waiter \"Meja 5 · Andi · Waiter 1\" → NAMA: ANDI · WAITER 1", () => {
    expect(chitCustomerName({ identity: "Meja 05 · Andi · Waiter 1", table: "Meja 05" })).toBe("Andi · Waiter 1");
    expect(chitCustomerName({ identity: "Meja 5 · Waiter 1", table: "Meja 05" })).toBe("Waiter 1");
    expect(chitCustomerName({ identity: "Meja 05", table: "Meja 05" })).toBeNull();
    expect(chitCustomerName({ identity: "Budi", table: "Meja 05" })).toBe("Budi");
  });

  it("stasiun internal 'Food' tampil sebagai DAPUR", () => {
    expect(chitStationLabel("Food")).toBe("Dapur");
    expect(ticketChitContent(ticket({ station: "Food" }))).toContain("*** DAPUR ***");
  });

  it("byte ESC/POS diawali reset printer dan diakhiri umpan kertas", () => {
    const bytes = toEscPosBytes("HALO\r\n", 3);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(bytes.slice(-3))).toEqual([0x0a, 0x0a, 0x0a]);
    expect(String.fromCharCode(...bytes.slice(2, 6))).toBe("HALO");
  });

  it("karakter di luar latin1 diganti '?' agar printer tidak mencetak sampah", () => {
    const bytes = toEscPosBytes("A☕B", 0);
    expect(Array.from(bytes.slice(2))).toEqual([0x41, 0x3f, 0x42]);
  });

  it("tautan RawBT: base64 utama dan intent cadangan membawa data yang sama", () => {
    const bytes = toEscPosBytes("TES", 1);
    const b64 = btoa(String.fromCharCode(...bytes));
    expect(rawbtUrl(bytes, "base64")).toBe(`rawbt:base64,${b64}`);
    expect(rawbtUrl(bytes, "intent")).toBe(
      `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`,
    );
  });

  it("chit besar (banyak tiket) tetap bisa dikodekan tanpa error", () => {
    const many = combineChits(Array.from({ length: 60 }, () => ticketChitContent(ticket())));
    const url = rawbtUrl(toEscPosBytes(many), "base64");
    expect(url.startsWith("rawbt:base64,")).toBe(true);
    expect(url.length).toBeGreaterThan(1000);
  });

  it("chit uji terbaca dan menyebut stasiun", () => {
    expect(testChitContent("Bar").toUpperCase()).toContain("TES PRINTER BAR");
  });
});
