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
    expect(blocked.error).toMatch(/kode klaim di kasir/);

    const ok = await registerMember({ name: "Pelanggan Lama", phone: "081277770005", password: "123456", phoneVerified: true });
    expect(ok.data?.customer.points).toBe(120);
    expect(ok.data?.customer.waVerifiedAt).toBeTruthy();

    // Nomor baru tanpa riwayat tetap boleh (perilaku lama saat OTP belum aktif).
    const fresh = await registerMember({ name: "Baru", phone: "081277770006", password: "123456" });
    expect(fresh.data?.customer.waVerifiedAt).toBeNull();
  });

  it("kode klaim kasir: hash, satu kode aktif, terikat nomor, lalu menyambungkan riwayat POS", async () => {
    const otp = await import("@/lib/member-otp");
    const { registerMember } = await import("@/lib/member-service");
    const db = t.getDb();
    const [customer] = await db
      .insert(t.schema.customers)
      .values({ name: "Langganan Kasir", phone: "081277770020", tier: "Silver", points: 80, visits: 3 })
      .returning();

    const first = await otp.issueCashierClaimCode({ customerId: customer.id });
    expect(first.code).toMatch(/^\d{6}$/);
    const rows: Array<{ deliveryStatus: string; codeHash: string; phone: string }> = await db
      .select()
      .from(t.schema.memberOtpChallenges);
    const stored = rows.find((row) => row.deliveryStatus === "cashier");
    expect(stored?.codeHash).not.toContain(first.code);
    expect(stored?.phone).toBe("081277770020");

    // Kode baru mematikan kode lama.
    const second = await otp.issueCashierClaimCode({ customerId: customer.id });
    if (first.code !== second.code) {
      await expect(otp.claimWithCashierCode({ phone: "081277770020", code: first.code })).rejects.toThrow(/salah/);
    }
    // Kode tidak berlaku untuk nomor lain.
    await expect(otp.claimWithCashierCode({ phone: "081277770021", code: second.code })).rejects.toThrow(/tidak ditemukan/);

    const claimed = await otp.claimWithCashierCode({ phone: "+62 812-7777-0020", code: second.code });
    const token = await otp.findValidOtpToken({ phone: "081277770020", token: claimed.verificationToken });
    expect(token).not.toBeNull();
    const reg = await registerMember({ name: "Langganan Kasir", phone: "081277770020", password: "123456", phoneVerified: Boolean(token) });
    expect(reg.data?.customer.points).toBe(80);
    expect(await otp.consumeOtpToken(token!.id)).toBe(true);

    // Sudah punya akun → kasir tidak bisa membuat kode lagi.
    await expect(otp.issueCashierClaimCode({ customerId: customer.id })).rejects.toThrow(/sudah punya akun/);
  });

  it("kode klaim kasir terkunci setelah 5 kali salah", async () => {
    const otp = await import("@/lib/member-otp");
    const [customer] = await t
      .getDb()
      .insert(t.schema.customers)
      .values({ name: "Coba Tebak", phone: "081277770030", tier: "Silver", points: 10, visits: 1 })
      .returning();
    const issued = await otp.issueCashierClaimCode({ customerId: customer.id });
    const wrong = issued.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) {
      await expect(otp.claimWithCashierCode({ phone: "081277770030", code: wrong })).rejects.toThrow();
    }
    await expect(otp.claimWithCashierCode({ phone: "081277770030", code: issued.code })).rejects.toThrow(/percobaan/);
  });
});
