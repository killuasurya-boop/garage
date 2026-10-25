import { describe, expect, it } from "vitest";
import { twoFactorChallengeError } from "./two-factor-challenge-error";
describe("2FA challenge recovery", () => {
  it("distinguishes an expired login cookie from wrong TOTP", () => {
    expect(twoFactorChallengeError({code:"INVALID_TWO_FACTOR_COOKIE",message:"Invalid two factor cookie"},"totp")).toMatchObject({restartRequired:true});
    expect(twoFactorChallengeError({code:"INVALID_TWO_FACTOR_COOKIE"},"backup").message).toContain("Login ulang");
    expect(twoFactorChallengeError({code:"INVALID_CODE"},"totp")).toMatchObject({restartRequired:false});
  });
  it("handles legacy message-only cookie errors without blaming the code", () => {
    const result=twoFactorChallengeError({message:"Invalid two factor cookie"},"totp");
    expect(result.restartRequired).toBe(true);expect(result.message).toContain("belum dinyatakan salah");
  });
  it("keeps used backup code and rate limiting distinct", () => {
    expect(twoFactorChallengeError({code:"INVALID_BACKUP_CODE"},"backup").message).toContain("sudah pernah dipakai");
    expect(twoFactorChallengeError({status:429},"totp").message).toContain("Terlalu banyak");
  });
  it("does not infer session expiry from an arbitrary expired error or display server internals", () => {
    expect(twoFactorChallengeError({message:"internal secret token expired"},"totp")).toEqual({restartRequired:false,message:"Verifikasi belum berhasil. Coba kembali; bila berulang, login ulang untuk membuat sesi verifikasi baru."});
  });
});
