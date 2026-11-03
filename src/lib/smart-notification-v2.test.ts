import { beforeEach, describe, expect, it } from "vitest";

import { hubSoundEvents, lateToneKey, soundAreaFor, type HubSoundTicket } from "@/lib/hub-sound-rules";
import { paymentNoticeLabel } from "@/lib/payment-notice";
import { claimInLedger, resetSoundClaimsForTest, SOUND_CLAIM_TTL_MS, SOUND_LEDGER_KEY } from "@/lib/sound-claim";
import { audiencesFor } from "@/lib/staff-notifications";

// Smart Notification V2 — aturan murni (routing stasiun, bunyi sekali, label bayar).

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    raw: map,
  };
}

function ticket(over: Partial<HubSoundTicket> & Pick<HubSoundTicket, "ticketNo" | "station">): HubSoundTicket {
  return {
    orderId: "ord-1",
    orderNo: "POS-0001",
    status: "queue",
    table: "Meja 07",
    channel: "POS",
    readyAt: null,
    handoverAt: null,
    ...over,
  };
}

const notOnline = () => false;

describe("routing audience per stasiun (F-01)", () => {
  it("Bar hanya bar, Dapur hanya dapur; keduanya tetap 'production' (lama)", () => {
    const bar = audiencesFor({ role: "Kasir", workstation: "bar" });
    const dapur = audiencesFor({ role: "Kasir", workstation: "helper_dapur" });
    expect(bar).toEqual(expect.arrayContaining(["production", "bar"]));
    expect(bar).not.toContain("dapur");
    expect(dapur).toEqual(expect.arrayContaining(["production", "dapur"]));
    expect(dapur).not.toContain("bar");
    expect(audiencesFor({ role: "Kasir", workstation: "all" })).toEqual(expect.arrayContaining(["bar", "dapur"]));
  });

  it("kasir depan, waiter, kurir, manajemen tidak menerima pekerjaan stasiun", () => {
    for (const profile of [
      { role: "Kasir", workstation: null },
      { role: "Waiter", workstation: null },
      { role: "Waiter", workstation: "kurir" },
      { role: "Owner", workstation: null },
      { role: "Manajer", workstation: null },
    ]) {
      const audiences = audiencesFor(profile);
      expect(audiences).not.toContain("bar");
      expect(audiences).not.toContain("dapur");
    }
    // Stasiun tidak memegang uang → tidak menerima notifikasi kas/pembayaran.
    expect(audiencesFor({ role: "Kasir", workstation: "bar" })).not.toContain("cashier");
    expect(audiencesFor({ role: "Kasir", workstation: "bar" })).not.toContain("management");
  });
});

describe("bunyi sekali per perangkat (F-06, skenario 5 & 6)", () => {
  beforeEach(() => resetSoundClaimsForTest());

  it("kunci yang sama hanya lolos sekali selama TTL (tab lain / refresh)", () => {
    const store = memoryStore();
    const now = 1_000_000;
    expect(claimInLedger(store, "notif:service:1", now)).toBe(true);
    expect(claimInLedger(store, "notif:service:1", now + 1_000)).toBe(false); // tab kedua
    expect(claimInLedger(store, "notif:service:1", now + 60_000)).toBe(false); // refresh / reconnect
    expect(claimInLedger(store, "notif:service:2", now + 2_000)).toBe(true); // event lain tetap bunyi
    expect(claimInLedger(store, "notif:service:1", now + SOUND_CLAIM_TTL_MS + 1)).toBe(true);
  });

  it("TTL khusus lebih pendek dihormati dan ledger lama dibuang", () => {
    const store = memoryStore();
    expect(claimInLedger(store, "voice:approval-bump-2", 0, 120_000)).toBe(true);
    expect(claimInLedger(store, "voice:approval-bump-2", 119_000, 120_000)).toBe(false);
    expect(claimInLedger(store, "voice:approval-bump-2", 121_000, 120_000)).toBe(true);
    claimInLedger(store, "baru", SOUND_CLAIM_TTL_MS * 3);
    const ledger = JSON.parse(store.raw.get(SOUND_LEDGER_KEY) ?? "{}");
    expect(Object.keys(ledger)).toEqual(["baru"]);
  });

  it("tanpa storage tetap dedup di memori; ledger rusak tidak memblokir", () => {
    expect(claimInLedger(null, "x", 0)).toBe(true);
    expect(claimInLedger(null, "x", 10)).toBe(false);
    const broken = memoryStore();
    broken.setItem(SOUND_LEDGER_KEY, "{bukan json");
    expect(claimInLedger(broken, "y", 0)).toBe(true);
  });
});

describe("suara Production Hub (F-04, F-05, skenario 1–4, 7)", () => {
  it("muat pertama tidak pernah berbunyi", () => {
    expect(hubSoundEvents(null, [ticket({ ticketNo: "T1", station: "Bar" })], "Bar", notOnline)).toEqual([]);
  });

  it("perangkat Bar tidak bersuara untuk tiket Dapur walau tampilan 'Semua'", () => {
    const area = soundAreaFor("Bar", "all");
    expect(area).toBe("Bar");
    const events = hubSoundEvents(new Map(), [ticket({ ticketNo: "T2", station: "Food" })], area, notOnline);
    expect(events).toEqual([]);
    expect(soundAreaFor("all", "Food")).toBe("Food"); // manajemen mengikuti tampilan
  });

  it("order campuran: Bar dapat 1 event Bar, Dapur dapat 1 event Dapur", () => {
    const tickets = [ticket({ ticketNo: "T1", station: "Bar" }), ticket({ ticketNo: "T2", station: "Food" })];
    const bar = hubSoundEvents(new Map(), tickets, "Bar", notOnline);
    const dapur = hubSoundEvents(new Map(), tickets, "Food", notOnline);
    expect(bar).toEqual([expect.objectContaining({ type: "new", station: "Bar", ticketNos: ["T1"] })]);
    expect(dapur).toEqual([expect.objectContaining({ type: "new", station: "Food", ticketNos: ["T2"] })]);
  });

  it("5 order sekaligus = SATU event per stasiun, kunci stabil (tidak hilang, tidak dobel)", () => {
    const tickets = Array.from({ length: 5 }, (_, i) =>
      ticket({ ticketNo: `B${i}`, station: "Bar", orderId: `o${i}`, orderNo: `POS-${i}` }),
    );
    const events = hubSoundEvents(new Map(), tickets, "Bar", notOnline);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "new", ticketNos: ["B0", "B1", "B2", "B3", "B4"], table: null });
    const again = hubSoundEvents(new Map(), [...tickets].reverse(), "Bar", notOnline);
    expect(again[0].key).toBe(events[0].key);
  });

  it("'pesanan siap' hanya saat semua stasiun siap, sekali, di stasiun yang terakhir", () => {
    const prev = new Map([
      ["T1", "cooking"],
      ["T2", "cooking"],
    ]);
    const barReady = [
      ticket({ ticketNo: "T1", station: "Bar", status: "ready", readyAt: "2026-11-03T10:00:00Z" }),
      ticket({ ticketNo: "T2", station: "Food", status: "cooking" }),
    ];
    expect(hubSoundEvents(prev, barReady, "Bar", notOnline).filter((e) => e.type === "order_ready")).toEqual([]);

    const prev2 = new Map([
      ["T1", "ready"],
      ["T2", "cooking"],
    ]);
    const allReady = [barReady[0], ticket({ ticketNo: "T2", station: "Food", status: "ready", readyAt: "2026-11-03T10:03:00Z" })];
    expect(hubSoundEvents(prev2, allReady, "Bar", notOnline)).toEqual([]); // Bar tidak mengulang
    const dapur = hubSoundEvents(prev2, allReady, "Food", notOnline).filter((e) => e.type === "order_ready");
    expect(dapur).toHaveLength(1);
    // Perangkat manajemen ("all") melihat dua tiket siap bersamaan → tetap satu event.
    const both = hubSoundEvents(prev, allReady, "all", notOnline).filter((e) => e.type === "order_ready");
    expect(both).toHaveLength(1);
  });

  it("tiket yang sudah diantar hilang dari papan → tidak memicu apa pun (pengingat berhenti)", () => {
    const prev = new Map([["T1", "ready"]]);
    expect(hubSoundEvents(prev, [], "Bar", notOnline)).toEqual([]);
  });

  it("tone telat: satu kunci per gelombang, hanya tiket di area suara", () => {
    expect(lateToneKey(new Set(), new Set(["T1", "T9"]), new Set(["T1"]))).toBe("hub:late:T1");
    expect(lateToneKey(new Set(["T1"]), new Set(["T1"]), new Set(["T1"]))).toBeNull();
  });
});

describe("label pembayaran notifikasi (F-08, skenario 9)", () => {
  it("QRIS/transfer belum lunas tidak pernah terbaca lunas", () => {
    expect(paymentNoticeLabel("QRIS", "pending")).toBe("QRIS · menunggu verifikasi kasir");
    expect(paymentNoticeLabel("Transfer BNI", "pending")).toBe("Transfer BNI · menunggu verifikasi kasir");
    expect(paymentNoticeLabel("QRIS", "pending")).not.toMatch(/lunas|paid|berhasil/i);
    expect(paymentNoticeLabel("Cash", "pending")).toBe("Cash · belum dibayar");
    expect(paymentNoticeLabel(null, "pending")).toBe("Metode belum dipilih · belum dibayar");
  });

  it("lunas non-tunai = verifikasi manual kasir (tidak ada verifikasi otomatis)", () => {
    expect(paymentNoticeLabel("QRIS", "paid")).toBe("QRIS · lunas (verifikasi manual kasir)");
    expect(paymentNoticeLabel("Tunai", "paid")).toBe("Tunai · lunas");
    expect(paymentNoticeLabel("QRIS", "refund")).toBe("QRIS · refund");
  });
});
