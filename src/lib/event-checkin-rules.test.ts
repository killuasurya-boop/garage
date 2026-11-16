import { describe, expect, it } from "vitest";

import { attendanceSummary, checkinDecision, defaultCheckinPax, parseCheckinCode } from "@/lib/event-checkin-rules";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("isi QR", () => {
  it("URL undangan, jalur relatif, token mentah; selain itu null", () => {
    expect(parseCheckinCode(`https://garagecoffee.id/undangan/${TOKEN}`)).toBe(TOKEN);
    expect(parseCheckinCode(`https://garagecoffee.id/undangan/${TOKEN}?utm=wa#rsvp`)).toBe(TOKEN);
    expect(parseCheckinCode(`/undangan/${TOKEN}/kalender`)).toBe(TOKEN);
    expect(parseCheckinCode(`  ${TOKEN}  `)).toBe(TOKEN);
    expect(parseCheckinCode(`https://garagecoffee.id/undangan/${TOKEN}x`)).toBeNull();
    expect(parseCheckinCode('{"v":1,"id":"member"}')).toBeNull();
    expect(parseCheckinCode("")).toBeNull();
  });
});

describe("keputusan check-in", () => {
  const base = {
    invitationStatus: "shared",
    guestStatus: "active",
    eventStatus: "published",
    invitationEventId: "e1",
    selectedEventId: "e1",
    maxPax: 3,
    rsvp: { response: "attending", pax: 2 },
    activeCheckin: null,
  };

  it("undangan sah, dalam batas → boleh", () => {
    expect(checkinDecision(base, 2)).toEqual({ allowed: true, block: null, warnings: [] });
  });

  it("dobel masuk, dicabut, event lain, tamu dihapus, arsip, kelebihan orang → ditolak", () => {
    expect(checkinDecision({ ...base, activeCheckin: { checkedInAt: "x", byName: "A", pax: 2 } }, 2).block).toBe("ALREADY_CHECKED_IN");
    expect(checkinDecision({ ...base, invitationStatus: "revoked" }, 1).block).toBe("REVOKED");
    expect(checkinDecision({ ...base, selectedEventId: "e2" }, 1).block).toBe("OTHER_EVENT");
    expect(checkinDecision({ ...base, guestStatus: "archived" }, 1).block).toBe("GUEST_ARCHIVED");
    expect(checkinDecision({ ...base, eventStatus: "archived" }, 1).block).toBe("EVENT_ARCHIVED");
    expect(checkinDecision(base, 4).block).toBe("PAX_TOO_MANY");
    expect(checkinDecision(base, 0).block).toBe("PAX_INVALID");
  });

  it("peringatan (tetap boleh): RSVP tidak hadir, belum RSVP, lebih dari RSVP", () => {
    expect(checkinDecision({ ...base, rsvp: { response: "declined", pax: 0 } }, 1)).toMatchObject({ allowed: true, warnings: ["RSVP_DECLINED"] });
    expect(checkinDecision({ ...base, rsvp: null }, 1)).toMatchObject({ allowed: true, warnings: ["NO_RSVP"] });
    expect(checkinDecision(base, 3)).toMatchObject({ allowed: true, warnings: ["PAX_ABOVE_RSVP"] });
  });

  it("jumlah bawaan = RSVP hadir, minimal 1, maksimal batas undangan", () => {
    expect(defaultCheckinPax(3, { response: "attending", pax: 2 })).toBe(2);
    expect(defaultCheckinPax(3, { response: "declined", pax: 0 })).toBe(1);
    expect(defaultCheckinPax(2, { response: "attending", pax: 5 })).toBe(2);
    expect(defaultCheckinPax(1, null)).toBe(1);
  });
});

describe("rekap kehadiran", () => {
  it("baris batal tidak dihitung; walk-in terpisah; persentase dari RSVP", () => {
    const s = attendanceSummary({
      invitedGuests: 10,
      rsvpAttendingGuests: 6,
      rsvpAttendingPax: 12,
      checkins: [
        { kind: "invited", pax: 2, undoneAt: null },
        { kind: "invited", pax: 4, undoneAt: null },
        { kind: "invited", pax: 3, undoneAt: "2026-11-16T10:00:00Z" },
        { kind: "walkin", pax: 5, undoneAt: null },
      ],
    });
    expect(s).toMatchObject({ arrivedInvitations: 2, arrivedInvitedPax: 6, walkinPax: 5, totalPax: 11, notArrivedInvitations: 8, rsvpShowRatePct: 50 });
    expect(attendanceSummary({ invitedGuests: 0, rsvpAttendingGuests: 0, rsvpAttendingPax: 0, checkins: [] }).rsvpShowRatePct).toBeNull();
  });
});
