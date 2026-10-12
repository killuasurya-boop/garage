import { describe, expect, it } from "vitest";

import {
  MEMBER_REDEEM_TOKEN_TTL_MS,
  isPhoneLikeMemberIdentifier,
  issueMemberRedeemToken,
  verifyMemberRedeemToken,
} from "@/lib/member-redeem-token";

describe("token pakai poin (scan QR member)", () => {
  const now = Date.UTC(2026, 9, 12, 8);
  const { token } = issueMemberRedeemToken({ customerId: "c1", userId: "u1", now });

  it("valid hanya untuk member & kasir yang sama, sebelum kedaluwarsa", () => {
    expect(verifyMemberRedeemToken(token, { customerId: "c1", userId: "u1", now })).toBe(true);
    expect(verifyMemberRedeemToken(token, { customerId: "c2", userId: "u1", now })).toBe(false);
    expect(verifyMemberRedeemToken(token, { customerId: "c1", userId: "u2", now })).toBe(false);
    const late = now + MEMBER_REDEEM_TOKEN_TTL_MS + 1;
    expect(verifyMemberRedeemToken(token, { customerId: "c1", userId: "u1", now: late })).toBe(false);
    // Order offline yang baru tersinkron tetap diterima.
    expect(verifyMemberRedeemToken(token, { customerId: "c1", userId: "u1", now: late, offlineSync: true })).toBe(true);
  });

  it("token diubah/kosong ditolak", () => {
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ c: "c9", u: "u1", e: now + 1e9 })).toString("base64url");
    expect(verifyMemberRedeemToken(`${forged}.${sig}`, { customerId: "c9", userId: "u1", now })).toBe(false);
    expect(verifyMemberRedeemToken(`${body}.x${sig}`, { customerId: "c1", userId: "u1", now })).toBe(false);
    expect(verifyMemberRedeemToken(undefined, { customerId: "c1", userId: "u1", now })).toBe(false);
  });

  it("nomor HP bukan QR member", () => {
    expect(isPhoneLikeMemberIdentifier("081234567890")).toBe(true);
    expect(isPhoneLikeMemberIdentifier('{"phone":"+6281234567890"}')).toBe(true);
    expect(isPhoneLikeMemberIdentifier('{"v":1,"id":"5b0c6f1e-1111-4222-8333-444455556666"}')).toBe(false);
    expect(isPhoneLikeMemberIdentifier("GRG-AB12CD")).toBe(false);
  });
});
