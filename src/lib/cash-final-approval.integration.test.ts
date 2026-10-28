import { createOTP } from "@better-auth/utils/otp";
import { symmetricEncrypt } from "better-auth/crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cashCount } from "@/lib/test-helpers/cash-count";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// B4 (PRD §10.8, §13, AC-F20/F23–F26): hitung ulang ganda saat tutup shift + final
// closing Owner dengan TOTP terikat hash ringkasan & nonce sekali pakai.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let acc: typeof import("@/lib/cashier-accountability");
let fin: typeof import("@/lib/cash-final-approval");
let outletId = "";
const KASIR = "user-b4-kasir";
const MANAJER = "user-b4-manajer";
const OWNER = "user-b4-owner";
const OWNER_NO_2FA = "user-b4-owner-no2fa";
const PIN = "582014";
const TOTP_SECRET = "b4-owner-totp-secret-0123456789ab";

function as(userId: string, role: Role): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => as(KASIR, "Kasir");
const manajer = () => as(MANAJER, "Manajer");
const owner = () => as(OWNER, "Owner");
const totp = () => createOTP(TOTP_SECRET, { period: 30, digits: 6 }).totp();
const wrongCode = async () => {
  const good = await totp();
  return String((Number(good) + 1) % 1_000_000).padStart(6, "0");
};

async function row(id: string) {
  const { eq } = await import("drizzle-orm");
  const [found] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.id, id));
  return found;
}

/** Buka shift modal 100rb lalu tutup dengan hitungan #1 = #2 = `counted`. */
async function closedShift(counted = 100_000) {
  const opened: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
  await svc.closeCashSession(
    opened.id,
    { actualCash: counted, denominations: cashCount(counted), recountDenominations: cashCount(counted) },
    kasir(),
  );
  return opened.id as string;
}

async function verifiedShift(counted = 100_000) {
  const id = await closedShift(counted);
  const discrepancy = counted !== 100_000;
  await acc.reviewCashSession(
    id,
    discrepancy
      ? { status: "verified", acknowledgeDiscrepancy: true, note: "Selisih diakui pemeriksa." }
      : { status: "verified" },
    manajer(),
  );
  return id;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  acc = await import("@/lib/cashier-accountability");
  fin = await import("@/lib/cash-final-approval");
  const { hashPin } = await import("@/lib/attendance");
  const { auth } = await import("@/lib/auth");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: MANAJER, name: "Manajer B4", email: `${MANAJER}@garage.id` },
    { id: OWNER, name: "Owner B4", email: `${OWNER}@garage.id`, twoFactorEnabled: true },
    { id: OWNER_NO_2FA, name: "Owner tanpa 2FA", email: `${OWNER_NO_2FA}@garage.id` },
  ] as any);
  await d
    .insert(t.schema.staffProfiles)
    .values([
      { userId: KASIR, outletId, role: "Kasir", status: "active" },
      { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(PIN) },
      { userId: OWNER, outletId, role: "Owner", status: "active" },
      { userId: OWNER_NO_2FA, outletId, role: "Owner", status: "active" },
    ])
    .onConflictDoNothing();
  const ctx = await auth.$context;
  await d.insert(t.schema.twoFactor).values({
    id: "tf-b4-owner",
    userId: OWNER,
    secret: await symmetricEncrypt({ key: ctx.secretConfig, data: TOTP_SECRET }),
    backupCodes: await symmetricEncrypt({ key: ctx.secretConfig, data: "[]" }),
    verified: true,
  } as any);
  // Sesi bawaan seedGarageBasics: tutup supaya kasir bisa membuka shift baru.
  const open = await d.select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.status, "open"));
  for (const s of open) {
    await d.update(t.schema.cashSessions).set({ status: "closed", closedAt: new Date() }).where(eq(t.schema.cashSessions.id, s.id));
  }
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("Tutup shift — hitung ulang ganda (AC-F20)", () => {
  it("tanpa hitungan #2 ditolak; hitungan #2 tidak boleh diabaikan", async () => {
    const opened: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    await expect(
      svc.closeCashSession(opened.id, { actualCash: 100_000, denominations: cashCount(100_000) }, kasir()),
    ).rejects.toThrow(/hitungan #2/);
    expect((await row(opened.id)).status).toBe("open");
    await svc.closeCashSession(
      opened.id,
      { actualCash: 100_000, denominations: cashCount(100_000), recountDenominations: cashCount(100_000) },
      kasir(),
    );
  });

  it("#1 ≠ #2 per pecahan (total sama pun) → wajib #3; #3 menjadi hitungan sah & semua tersimpan", async () => {
    const { eq, asc } = await import("drizzle-orm");
    const opened: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    const first = { "50000": 2 };
    const second = { "100000": 1 }; // total sama, pecahan beda
    const error: any = await svc
      .closeCashSession(opened.id, { actualCash: 100_000, denominations: first, recountDenominations: second }, kasir())
      .catch((e) => e);
    expect(error).toBeInstanceOf(svc.CashSessionCountMismatchError);
    expect(error.mismatches.map((m: any) => m.key).sort()).toEqual(["100000", "50000"]);

    const third = { "50000": 1, "20000": 2, "10000": 1 }; // 100rb
    const closed: any = await svc.closeCashSession(
      opened.id,
      { actualCash: 0, denominations: first, recountDenominations: second, thirdCountDenominations: third },
      kasir(),
    );
    expect(closed).toMatchObject({ status: "closed", actualCash: 100_000, discrepancy: 0 });
    expect((await row(opened.id)).denominations).toEqual(third);
    const counts = await t
      .getDb()
      .select()
      .from(t.schema.cashSessionCounts)
      .where(eq(t.schema.cashSessionCounts.cashSessionId, opened.id))
      .orderBy(asc(t.schema.cashSessionCounts.createdAt));
    expect(counts.map((c: any) => [c.kind, c.total])).toEqual([
      ["count_1", 100_000],
      ["count_2", 100_000],
      ["count_3", 100_000],
    ]);
  });

  it("hitungan tidak bisa diubah atau dihapus (append-only)", async () => {
    const { eq } = await import("drizzle-orm");
    const id = await closedShift();
    const table = t.schema.cashSessionCounts;
    await expect(t.getDb().update(table).set({ total: 1 }).where(eq(table.cashSessionId, id))).rejects.toThrow();
    await expect(t.getDb().delete(table).where(eq(table.cashSessionId, id))).rejects.toThrow();
  });

  it("pengaturan dimatikan → hitungan #2 opsional (perilaku lama)", async () => {
    await t.getDb().insert(t.schema.appSettings).values({ key: "shiftRequireDoubleCount", valueJson: false, outletId: null } as any);
    try {
      const opened: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
      const closed: any = await svc.closeCashSession(
        opened.id,
        { actualCash: 100_000, denominations: cashCount(100_000) },
        kasir(),
      );
      expect(closed.status).toBe("closed");
    } finally {
      const { eq } = await import("drizzle-orm");
      await t.getDb().delete(t.schema.appSettings).where(eq(t.schema.appSettings.key, "shiftRequireDoubleCount"));
    }
  });
});

describe("Final closing Owner (AC-F23–F26)", () => {
  // Tiap tes memakai kode TOTP yang sama dalam jendela 30 detik; jejak replay antar-tes dibersihkan
  // (perlindungan replay sendiri diuji eksplisit di "kode TOTP yang sama tidak bisa dipakai ulang").
  beforeEach(async () => {
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.stepUpChallenges).set({ codeHash: null }).where(eq(t.schema.stepUpChallenges.userId, OWNER));
  });

  it("tutup kasir & verifikasi Manajer bukan final; final sebelum verifikasi ditolak", async () => {
    const id = await closedShift();
    expect((await row(id)).finalStatus).toBe("pending");
    await expect(fin.getFinalApprovalPreview(id, owner())).rejects.toMatchObject({ code: "MANAGER_REVIEW_REQUIRED" });
  });

  it("Manajer / Kasir tidak bisa final (backend), walau punya PIN", async () => {
    const id = await verifiedShift();
    await expect(fin.getFinalApprovalPreview(id, manajer())).rejects.toMatchObject({ code: "OWNER_ONLY" });
    await expect(
      fin.decideFinalApproval(id, { decision: "approve", challengeId: crypto.randomUUID(), nonce: "x".repeat(20), code: "123456" }, kasir()),
    ).rejects.toMatchObject({ code: "OWNER_ONLY" });
  });

  it("Owner tanpa 2FA aktif ditolak", async () => {
    const id = await verifiedShift();
    const preview = await fin.getFinalApprovalPreview(id, as(OWNER_NO_2FA, "Owner"));
    await expect(
      fin.decideFinalApproval(
        id,
        { decision: "approve", challengeId: preview.challengeId, nonce: preview.nonce, code: "123456" },
        as(OWNER_NO_2FA, "Owner"),
      ),
    ).rejects.toMatchObject({ code: "TOTP_NOT_ENABLED" });
  });

  it("kode salah ditolak tanpa menghabiskan tantangan; kode benar → APPROVED, audit tanpa kode", async () => {
    const { eq } = await import("drizzle-orm");
    const id = await verifiedShift();
    const preview = await fin.getFinalApprovalPreview(id, owner());
    expect(preview.exceptions).toEqual([]);
    await expect(
      fin.decideFinalApproval(id, { decision: "approve", challengeId: preview.challengeId, nonce: preview.nonce, code: await wrongCode() }, owner()),
    ).rejects.toMatchObject({ code: "INVALID_CODE" });
    await expect(
      fin.decideFinalApproval(id, { decision: "approve", challengeId: preview.challengeId, nonce: "salah".repeat(5), code: await totp() }, owner()),
    ).rejects.toMatchObject({ code: "CHALLENGE_NOT_FOUND" });

    const code = await totp();
    const result = await fin.decideFinalApproval(
      id,
      { decision: "approve", challengeId: preview.challengeId, nonce: preview.nonce, code },
      owner(),
    );
    expect(result).toMatchObject({ finalStatus: "approved", finalVersion: 1, summaryHash: preview.summaryHash });
    const saved = await row(id);
    expect(saved).toMatchObject({ finalStatus: "approved", finalDecidedBy: OWNER, finalSummaryHash: preview.summaryHash });

    const audits = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.action, "Final closing disetujui"));
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits)).not.toContain(code);
    expect(JSON.stringify(audits)).not.toContain(preview.nonce);

    // Tantangan sekali pakai & shift final tidak bisa diputuskan ulang.
    await expect(
      fin.decideFinalApproval(id, { decision: "approve", challengeId: preview.challengeId, nonce: preview.nonce, code }, owner()),
    ).rejects.toMatchObject({ code: "ALREADY_FINAL" });
  });

  it("kode TOTP yang sama tidak bisa dipakai ulang untuk tantangan lain", async () => {
    const a = await verifiedShift();
    const b = await verifiedShift();
    const pa = await fin.getFinalApprovalPreview(a, owner());
    const pb = await fin.getFinalApprovalPreview(b, owner());
    const code = await totp();
    await fin.decideFinalApproval(a, { decision: "approve", challengeId: pa.challengeId, nonce: pa.nonce, code }, owner());
    await expect(
      fin.decideFinalApproval(b, { decision: "approve", challengeId: pb.challengeId, nonce: pb.nonce, code }, owner()),
    ).rejects.toMatchObject({ code: "CODE_REUSED" });
    // Tantangan shift lain tidak bisa dipakai untuk shift ini.
    await expect(
      fin.decideFinalApproval(b, { decision: "approve", challengeId: pa.challengeId, nonce: pa.nonce, code: await totp() }, owner()),
    ).rejects.toMatchObject({ code: "CHALLENGE_NOT_FOUND" });
  });

  it("tantangan kedaluwarsa ditolak", async () => {
    const { eq } = await import("drizzle-orm");
    const id = await verifiedShift();
    const preview = await fin.getFinalApprovalPreview(id, owner());
    await t
      .getDb()
      .update(t.schema.stepUpChallenges)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(t.schema.stepUpChallenges.id, preview.challengeId));
    await expect(
      fin.decideFinalApproval(id, { decision: "approve", challengeId: preview.challengeId, nonce: preview.nonce, code: await totp() }, owner()),
    ).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
  });

  it("data berubah setelah ringkasan dibuka → STALE (AC-F25)", async () => {
    const id = await verifiedShift();
    const preview = await fin.getFinalApprovalPreview(id, owner());
    // Pemeriksa menghitung ulang setelah Owner membuka ringkasan.
    await acc.reviewCashSession(
      id,
      { status: "verified", recountDenominations: cashCount(100_000), note: "Hitung ulang kedua" },
      manajer(),
    );
    await expect(
      fin.decideFinalApproval(id, { decision: "approve", challengeId: preview.challengeId, nonce: preview.nonce, code: await totp() }, owner()),
    ).rejects.toMatchObject({ code: "STALE" });
    expect((await row(id)).finalStatus).toBe("pending");
  });

  it("ada selisih → wajib 'dengan pengecualian' + catatan", async () => {
    const id = await verifiedShift(95_000);
    const preview = await fin.getFinalApprovalPreview(id, owner());
    expect(preview.exceptions.join(" ")).toMatch(/Selisih laci/);
    await expect(
      fin.decideFinalApproval(id, { decision: "approve", challengeId: preview.challengeId, nonce: preview.nonce, code: await totp() }, owner()),
    ).rejects.toMatchObject({ code: "EXCEPTION_REQUIRED" });
    await expect(
      fin.decideFinalApproval(
        id,
        { decision: "approve_with_exception", challengeId: preview.challengeId, nonce: preview.nonce, code: await totp() },
        owner(),
      ),
    ).rejects.toMatchObject({ code: "NOTE_REQUIRED" });
    const result = await fin.decideFinalApproval(
      id,
      {
        decision: "approve_with_exception",
        note: "Kurang Rp5.000 — kasus kasir tetap dibuka.",
        challengeId: preview.challengeId,
        nonce: preview.nonce,
        code: await totp(),
      },
      owner(),
    );
    expect(result.finalStatus).toBe("approved_with_exception");
    expect((await row(id)).discrepancy).toBe(-5_000); // angka tidak diubah oleh keputusan
  });

  it("kembalikan → ke pemeriksa; setelah diverifikasi ulang Owner bisa memutuskan lagi", async () => {
    const id = await verifiedShift();
    const first = await fin.getFinalApprovalPreview(id, owner());
    await fin.decideFinalApproval(
      id,
      { decision: "return", note: "Cek ulang setoran parkir.", challengeId: first.challengeId, nonce: first.nonce, code: await totp() },
      owner(),
    );
    expect(await row(id)).toMatchObject({ finalStatus: "returned", reviewStatus: "needs_followup", finalVersion: 1 });
    await expect(fin.getFinalApprovalPreview(id, owner())).rejects.toMatchObject({ code: "MANAGER_REVIEW_REQUIRED" });

    await acc.reviewCashSession(id, { status: "verified", note: "Setoran parkir sudah dicek." }, manajer());
    const second = await fin.getFinalApprovalPreview(id, owner());
    expect(second.summary.finalVersion).toBe(1);
    // Kode baru (jendela replay) — tunggu bila kode sama dengan yang dipakai "return".
    let code = await totp();
    const { eq, and, isNotNull } = await import("drizzle-orm");
    const used = await t
      .getDb()
      .select()
      .from(t.schema.stepUpChallenges)
      .where(and(eq(t.schema.stepUpChallenges.userId, OWNER), isNotNull(t.schema.stepUpChallenges.codeHash)));
    if (used.length) {
      // Bersihkan jejak replay untuk tes ini saja (kode sama dalam satu jendela 30 detik).
      await t.getDb().update(t.schema.stepUpChallenges).set({ codeHash: null }).where(eq(t.schema.stepUpChallenges.userId, OWNER));
      code = await totp();
    }
    const result = await fin.decideFinalApproval(
      id,
      { decision: "approve", challengeId: second.challengeId, nonce: second.nonce, code },
      owner(),
    );
    expect(result).toMatchObject({ finalStatus: "approved", finalVersion: 2 });
  });

  it("dua keputusan bersamaan → hanya satu yang tercatat (AC-F26)", async () => {
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.stepUpChallenges).set({ codeHash: null }).where(eq(t.schema.stepUpChallenges.userId, OWNER));
    const id = await verifiedShift();
    const p1 = await fin.getFinalApprovalPreview(id, owner());
    const p2 = await fin.getFinalApprovalPreview(id, owner());
    const code = await totp();
    const results = await Promise.allSettled([
      fin.decideFinalApproval(id, { decision: "approve", challengeId: p1.challengeId, nonce: p1.nonce, code }, owner()),
      fin.decideFinalApproval(id, { decision: "approve", challengeId: p2.challengeId, nonce: p2.nonce, code }, owner()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await row(id)).finalVersion).toBe(1);
  });
});
