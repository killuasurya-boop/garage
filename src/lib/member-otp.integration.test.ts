import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// OTP WhatsApp member (mode dev-echo: tanpa provider, hanya non-produksi).
let t: GarageTestDb;

beforeAll(async () => {
  process.env.MEMBER_OTP_DEV_ECHO = "1";
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: "user-itest-otp" });
}, 120_000);

afterAll(async () => {
  delete process.env.MEMBER_OTP_DEV_ECHO;
  await teardownGarageTestDb(t);
});

describe("OTP WhatsApp member", () => {
  it("kode tersimpan sebagai hash; salah → percobaan berkurang; benar → token sekali pakai", async () => {
    const otp = await import("@/lib/member-otp");
    const sent = await otp.requestMemberOtp({ phone: "081277770001" });
    expect(sent.devCode).toMatch(/^\d{6}$/);
    const [row] = await t.getDb().select().from(t.schema.memberOtpChallenges);
    expect(row.codeHash).not.toContain(sent.devCode!);
    expect(row.phone).toBe("081277770001");

    const wrong = sent.devCode === "000000" ? "111111" : "000000";
    await expect(otp.checkMemberOtpCode({ challengeId: sent.challengeId, code: wrong })).rejects.toThrow(/Sisa 4/);
    const ok = await otp.checkMemberOtpCode({ challengeId: sent.challengeId, code: sent.devCode! });
    await expect(otp.checkMemberOtpCode({ challengeId: sent.challengeId, code: sent.devCode! })).rejects.toThrow(/sudah dipakai/);

    const valid = await otp.findValidOtpToken({ phone: "0812-7777-0001", token: ok.verificationToken });
    expect(valid?.id).toBe(sent.challengeId);
    expect(await otp.findValidOtpToken({ phone: "081277770002", token: ok.verificationToken })).toBeNull();
    expect(await otp.consumeOtpToken(valid!.id)).toBe(true);
    expect(await otp.consumeOtpToken(valid!.id)).toBe(false);
    expect(await otp.findValidOtpToken({ phone: "081277770001", token: ok.verificationToken })).toBeNull();
  });

  it("jeda kirim ulang per nomor", async () => {
    const otp = await import("@/lib/member-otp");
    await otp.requestMemberOtp({ phone: "081277770009" });
    await expect(otp.requestMemberOtp({ phone: "081277770009" })).rejects.toThrow(/Tunggu/);
  });

  it("penulisan nomor berbeda untuk nomor WhatsApp yang sama berbagi kuota", async () => {
    const otp = await import("@/lib/member-otp");
    expect(otp.otpPhoneKey("81277770010")).toBe("081277770010");
    expect(otp.otpPhoneKey("+6281277770010")).toBe("081277770010");
    expect(otp.otpPhoneKey("0812+77770010")).toBe("081277770010");
    await otp.requestMemberOtp({ phone: "081277770010" });
    await expect(otp.requestMemberOtp({ phone: "81277770010" })).rejects.toThrow(/Tunggu/);
    await expect(otp.requestMemberOtp({ phone: "+62 812-7777-0010" })).rejects.toThrow(/Tunggu/);
  });

  it("permintaan bersamaan untuk satu nomor hanya mengirim satu kode", async () => {
    const otp = await import("@/lib/member-otp");
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => otp.requestMemberOtp({ phone: "081277770011" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("data customer POS dengan riwayat hanya bisa diklaim setelah OTP", async () => {
    const { registerMember } = await import("@/lib/member-service");
    await t.getDb().insert(t.schema.customers).values({ name: "Pelanggan Lama", phone: "081277770005", tier: "Silver", points: 120, visits: 4 });
    const blocked = await registerMember({ name: "Penyerobot", phone: "081277770005", password: "123456" });
    expect(blocked.data).toBeNull();
    expect(blocked.error).toMatch(/kode WhatsApp/);

    const ok = await registerMember({ name: "Pelanggan Lama", phone: "081277770005", password: "123456", phoneVerified: true });
    expect(ok.data?.customer.points).toBe(120);
    expect(ok.data?.customer.waVerifiedAt).toBeTruthy();

    // Nomor baru tanpa riwayat tetap boleh (perilaku lama saat OTP belum aktif).
    const fresh = await registerMember({ name: "Baru", phone: "081277770006", password: "123456" });
    expect(fresh.data?.customer.waVerifiedAt).toBeNull();
  });
});
