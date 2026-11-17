import { describe, expect, it } from "vitest";

import { checkinDecision, clockDot, extractInvitationToken, minutesSinceEventDay, stageState } from "@/lib/event-day-rules";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("extractInvitationToken", () => {
  it("tautan undangan, token polos; selain itu null", () => {
    expect(extractInvitationToken(`https://garagecoffee.id/undangan/${TOKEN}`)).toBe(TOKEN);
    expect(extractInvitationToken(`https://x.id/undangan/${TOKEN}?a=1`)).toBe(TOKEN);
    expect(extractInvitationToken(` ${TOKEN} `)).toBe(TOKEN);
    expect(extractInvitationToken("https://x.id/order?table=1")).toBeNull();
    expect(extractInvitationToken("")).toBeNull();
  });
});

describe("checkinDecision", () => {
  it("batas undangan, sudah penuh, kapasitas", () => {
    expect(checkinDecision({ pax: 2, alreadyForInvitation: 0, maxPax: 2, totalActive: 0, capacity: null })).toEqual({ ok: true });
    expect(checkinDecision({ pax: 2, alreadyForInvitation: 1, maxPax: 2, totalActive: 0, capacity: null })).toMatchObject({ ok: false, code: "PAX_EXCEEDS_INVITATION" });
    expect(checkinDecision({ pax: 1, alreadyForInvitation: 2, maxPax: 2, totalActive: 0, capacity: null })).toMatchObject({ ok: false, code: "ALREADY_CHECKED_IN" });
    expect(checkinDecision({ pax: 3, alreadyForInvitation: 0, maxPax: null, totalActive: 98, capacity: 100 })).toMatchObject({ ok: false, code: "CAPACITY_FULL" });
    expect(checkinDecision({ pax: 2, alreadyForInvitation: 0, maxPax: null, totalActive: 98, capacity: 100 })).toEqual({ ok: true });
  });
});

describe("stageState", () => {
  const at = (hhmm: string, day = "2026-12-20") => new Date(`${day}T${hhmm}:00+07:00`);
  it("sedang tampil, berikutnya, telat & proyeksi; lewat tengah malam", () => {
    const state = stageState(
      [
        { id: "a", name: "A", slot: 1, startAbs: 23 * 60, endAbs: 23 * 60 + 30, actualStart: at("23:00"), actualEnd: at("23:30") },
        { id: "b", name: "B", slot: 2, startAbs: 23 * 60 + 30, endAbs: 24 * 60, actualStart: at("23:45"), actualEnd: null },
        { id: "c", name: "C", slot: 3, startAbs: 24 * 60, endAbs: 24 * 60 + 45, actualStart: null, actualEnd: null },
      ],
      "2026-12-20",
    );
    expect(state).toMatchObject({ liveId: "b", nextId: "c", delayMinutes: 15, done: 1, total: 3 });
    expect(state.projected).toEqual([{ id: "c", projectedStartAbs: 24 * 60 + 15 }]);
    expect(clockDot(24 * 60 + 15)).toBe("00.15");
    expect(minutesSinceEventDay("2026-12-20", at("00:10", "2026-12-21"))).toBe(24 * 60 + 10);
  });

  it("jam nyata di luar tanggal event: telat tidak dihitung", () => {
    const state = stageState([{ id: "a", name: "A", slot: 1, startAbs: 19 * 60, endAbs: null, actualStart: new Date("2026-11-17T13:52:00+07:00"), actualEnd: null }], "2026-10-24");
    expect(state).toMatchObject({ delayMinutes: 0, offDay: true, liveId: "a" });
  });
});
