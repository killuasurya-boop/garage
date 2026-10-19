import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  INVITATION_TOKEN_PATTERN,
  decryptInvitationToken,
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/event-invitation-token";
import { buildInvitationWhatsappMessage } from "@/lib/whatsapp-link";

const original = process.env.BETTER_AUTH_SECRET;
beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "unit-secret-0123456789abcdef";
});
afterAll(() => {
  process.env.BETTER_AUTH_SECRET = original;
});

describe("token undangan", () => {
  it("acak, 32 karakter huruf+angka (aman di WhatsApp), hash & enkripsi bolak-balik", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a.token).toMatch(INVITATION_TOKEN_PATTERN);
    for (let i = 0; i < 200; i++) expect(generateInvitationToken().token).toMatch(/^[A-Za-z0-9]{32}$/);
    // Token lama (base64url dengan "_"/"-") tetap dikenali.
    expect("Ab_9-".padEnd(32, "x")).toMatch(INVITATION_TOKEN_PATTERN);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashInvitationToken(a.token));
    expect(a.tokenEnc).not.toContain(a.token);
    expect(decryptInvitationToken(a.tokenEnc)).toBe(a.token);
    expect(a.tokenRef).toBe(a.token.slice(0, 6));
  });

  it("enkripsi yang diubah ditolak (GCM auth tag)", () => {
    const { tokenEnc } = generateInvitationToken();
    const parts = tokenEnc.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(() => decryptInvitationToken(parts.join("."))).toThrow();
  });

  it("pesan WA undangan berisi nama, waktu, tempat, link — tanpa klaim terkirim", () => {
    const text = buildInvitationWhatsappMessage({
      guestName: "Budi",
      eventTitle: "Grand Opening Garage Coffee",
      dateLabel: "Sabtu, 24 Oktober 2026",
      timeLabel: "15.00–23.00 WIB",
      venue: "Garage Coffee",
      url: "https://garagecoffee.id/undangan/abc",
    });
    expect(text).toContain("Halo Budi");
    expect(text).toContain("Sabtu, 24 Oktober 2026");
    expect(text).toContain("15.00–23.00 WIB");
    expect(text).toContain("https://garagecoffee.id/undangan/abc");
  });
});
