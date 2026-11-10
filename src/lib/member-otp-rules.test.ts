import { describe, expect, it } from "vitest";

import {
  buildOtpTemplateMessage,
  checkOtpChallenge,
  customerHasHistory,
  generateOtpCode,
  OTP_MAX_ATTEMPTS,
  otpHash,
  otpSendBlockReason,
  resolveOtpConfig,
} from "@/lib/member-otp-rules";

const now = new Date("2026-11-07T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("OTP rules", () => {
  it("kode 6 digit, hash terikat nomor & tujuan", () => {
    expect(generateOtpCode()).toMatch(/^\d{6}$/);
    const a = otpHash("s", "code", "0812", "register", "123456");
    expect(a).not.toBe(otpHash("s", "code", "0813", "register", "123456"));
    expect(a).not.toBe(otpHash("s", "token", "0812", "register", "123456"));
    expect(a).not.toContain("123456");
  });

  it("batas kirim: jeda 60 dtk, 3/15 menit, 8/hari", () => {
    expect(otpSendBlockReason([], now)).toBeNull();
    expect(otpSendBlockReason([ago(30_000)], now)).toMatch(/Tunggu 30 detik/);
    expect(otpSendBlockReason([ago(2 * 60_000), ago(5 * 60_000), ago(9 * 60_000)], now)).toMatch(/15 menit/);
    expect(otpSendBlockReason(Array.from({ length: 8 }, (_, i) => ago((i + 1) * 3_600_000)), now)).toMatch(/hari ini/);
  });

  it("cek kode: salah mengurangi sisa, terkunci setelah maks, kedaluwarsa, sekali pakai", () => {
    const base = { codeHash: otpHash("s", "code", "0812", "register", "111111"), attempts: 0, expiresAt: new Date(now.getTime() + 60_000), verifiedAt: null };
    expect(checkOtpChallenge(base, otpHash("s", "code", "0812", "register", "111111"), now)).toEqual({ ok: true });
    expect(checkOtpChallenge(base, otpHash("s", "code", "0812", "register", "222222"), now)).toMatchObject({ code: "WRONG_CODE", attemptsLeft: 4 });
    expect(checkOtpChallenge({ ...base, attempts: OTP_MAX_ATTEMPTS - 1 }, "00", now)).toMatchObject({ code: "LOCKED" });
    expect(checkOtpChallenge({ ...base, attempts: OTP_MAX_ATTEMPTS }, base.codeHash, now)).toMatchObject({ code: "LOCKED" });
    expect(checkOtpChallenge({ ...base, expiresAt: ago(1) }, base.codeHash, now)).toMatchObject({ code: "EXPIRED" });
    expect(checkOtpChallenge({ ...base, verifiedAt: now }, base.codeHash, now)).toMatchObject({ code: "ALREADY_USED" });
    expect(checkOtpChallenge(null, "x", now)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("payload template AUTHENTICATION: kode di body + tombol salin", () => {
    const msg = buildOtpTemplateMessage({ to: "6281200000000", template: "garage_otp", language: "id", code: "123456" });
    expect(msg.template.components[0].parameters[0].text).toBe("123456");
    expect(msg.template.components[1]).toMatchObject({ type: "button", sub_type: "url", index: "0" });
  });

  it("konfigurasi: aktif hanya bila provider lengkap; dev-echo tidak pernah di produksi", () => {
    expect(resolveOtpConfig({}).enabled).toBe(false);
    const full = { WHATSAPP_CLOUD_PHONE_NUMBER_ID: "1", WHATSAPP_CLOUD_API_TOKEN: "t", WHATSAPP_OTP_TEMPLATE: "garage_otp" };
    expect(resolveOtpConfig(full)).toMatchObject({ enabled: true, mode: "whatsapp", language: "id" });
    expect(resolveOtpConfig({ ...full, WHATSAPP_CLOUD_API_TOKEN: "" }, true).enabled).toBe(true);
    expect(resolveOtpConfig({ ...full, MEMBER_OTP_ENABLED: "false" }).enabled).toBe(false);
    expect(resolveOtpConfig({ MEMBER_OTP_DEV_ECHO: "1", NODE_ENV: "test" }).mode).toBe("dev_echo");
    expect(resolveOtpConfig({ MEMBER_OTP_DEV_ECHO: "1", NODE_ENV: "production" }).enabled).toBe(false);
  });

  it("riwayat customer", () => {
    expect(customerHasHistory({ points: 0, visits: 0 })).toBe(false);
    expect(customerHasHistory({ points: 5, visits: 0 })).toBe(true);
    expect(customerHasHistory({ points: 0, visits: 1 })).toBe(true);
  });
});
