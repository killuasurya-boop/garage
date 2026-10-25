import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// P6 saldo pembuka: entri lama (isian migrasi) = legacy_unverified sampai Owner mengesahkan
// saldo nyata; selisih = satu baris `opening_balance`; T25 backup → restore utuh.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let opening: typeof import("@/lib/cash-opening");
let ledger: typeof import("@/lib/cash-ledger");
let outletId = "";
const OWNER = "user-op-owner";
const MANAJER = "user-op-manajer";

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
const owner = () => as(OWNER, "Owner");
const manajer = () => as(MANAJER, "Manajer");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

async function sql(query: string) {
  return (t.getPgPool() as any).query(query);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: "user-op-kasir" }));
  opening = await import("@/lib/cash-opening");
  ledger = await import("@/lib/cash-ledger");
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: OWNER, name: "Owner OP", email: `${OWNER}@garage.id` },
    { id: MANAJER, name: "Manajer OP", email: `${MANAJER}@garage.id` },
  ]);
  // Isian migrasi 0159/0160 (request_hash 'legacy'): saldo laci shift lama + petty lama.
  await sql(`INSERT INTO cash_ledger_entries (idempotency_key, request_hash, business_date, outlet_id, from_account, to_account, amount, source_type, source_ref)
    VALUES ('legacy_opening:test', 'legacy', '2026-10-25', '${outletId}', 'external', 'drawer', 120000, 'legacy_opening', 'SHIFT-LAMA'),
           ('petty_legacy:test', 'legacy', '2026-10-20', '${outletId}', 'external', 'petty', 200000, 'petty_topup', 'PC-LAMA')`);
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("Saldo pembuka disahkan Owner (P6)", () => {
  it("entri lama legacy_unverified → Owner mengesahkan petty & rekening; selisih jadi satu baris", async () => {
    const before = await opening.getOpeningStatus();
    const petty = before.scopes.find((scope) => scope.account === "petty" && scope.outletId === outletId)!;
    expect(petty).toMatchObject({ ledgerBalance: 200_000, legacyEntries: 1, legacyTotal: 200_000, certification: null });
    expect(before.scopes.map((scope) => scope.scopeKey)).toEqual(expect.arrayContaining(["bank_jago:all", "bank_bni:all"]));
    expect(before.drawerLegacy).toEqual({ entries: 1, total: 120_000 });
    expect(before.legacyUnverified).toEqual({ entries: 2, total: 320_000 });
    expect(before.pending).toBe(before.scopes.length);

    const input = { account: "petty" as const, outletId, countedBalance: 150_000, expectedLedgerBalance: 200_000, evidenceRef: "Hitung fisik 25/10" };
    await expect(opening.certifyOpeningBalance(input, manajer())).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(opening.certifyOpeningBalance({ ...input, expectedLedgerBalance: 190_000 }, owner())).rejects.toMatchObject({ code: "LEDGER_CHANGED" });
    await expect(opening.certifyOpeningBalance({ ...input, outletId: null }, owner())).rejects.toMatchObject({ code: "OUTLET_REQUIRED" });

    const cert = await opening.certifyOpeningBalance(input, owner());
    expect(cert).toMatchObject({ scopeKey: `petty:${outletId}`, ledgerBalance: 200_000, countedBalance: 150_000, adjustment: -50_000, legacyEntries: 1 });
    expect(await ledger.accountBalance("petty", outletId)).toBe(150_000);
    const [row] = (await sql(`SELECT * FROM cash_ledger_entries WHERE id = '${cert.adjustmentEntryId}'`)).rows as any[];
    expect(row).toMatchObject({ from_account: "petty", to_account: "external", amount: 50_000, source_type: "opening_balance", source_ref: "Hitung fisik 25/10" });
    // Baris lama tidak diubah.
    const [legacyRow] = (await sql(`SELECT amount FROM cash_ledger_entries WHERE idempotency_key = 'petty_legacy:test'`)).rows as any[];
    expect(legacyRow.amount).toBe(200_000);

    await expect(opening.certifyOpeningBalance({ ...input, expectedLedgerBalance: 150_000 }, owner())).rejects.toMatchObject({ code: "ALREADY_CERTIFIED" });

    // Rekening: buku kas Rp0 → saldo mutasi Rp1.250.000; BNI sama dengan buku kas → tanpa baris.
    const jago = await opening.certifyOpeningBalance(
      { account: "bank_jago", outletId, countedBalance: 1_250_000, expectedLedgerBalance: 0, evidenceRef: "Mutasi Jago 25/10" },
      owner(),
    );
    expect(jago).toMatchObject({ scopeKey: "bank_jago:all", outletId: null, adjustment: 1_250_000 });
    const bni = await opening.certifyOpeningBalance({ account: "bank_bni", countedBalance: 0, expectedLedgerBalance: 0, evidenceRef: "Mutasi BNI 25/10" }, owner());
    expect(bni.adjustmentEntryId).toBeNull();

    const after = await opening.getOpeningStatus();
    expect(after.pending).toBe(0);
    expect(after.legacyUnverified).toEqual({ entries: 1, total: 120_000 }); // laci shift lama tetap berlabel
    expect(after.scopes.find((scope) => scope.account === "petty")?.certification).toMatchObject({ countedBalance: 150_000, certifiedByName: "Owner OP" });

    // Pengawasan Kas: rekening yang disahkan = saldo, bukan arus bersih.
    const { getCashOversight } = await import("@/lib/cash-oversight");
    const view = await getCashOversight({ fromDate: today(), toDate: today() });
    const jagoBalance = view.balances.find((balance) => balance.account === "bank_jago")!;
    expect(jagoBalance.balance).toBe(1_250_000);
    expect(jagoBalance.certifiedAt).not.toBeNull();
    expect(jagoBalance.label).toContain("saldo");
    expect(view.balances.find((balance) => balance.account === "petty")?.certifiedAt).not.toBeNull();

    // Pengesahan tidak bisa diubah/dihapus.
    await expect(sql(`UPDATE cash_opening_certifications SET counted_balance = 1 WHERE id = '${cert.id}'`)).rejects.toThrow(/tidak bisa diubah/);
    await expect(sql(`DELETE FROM cash_opening_certifications WHERE id = '${cert.id}'`)).rejects.toThrow(/tidak bisa diubah/);

    const audit = (await sql(`SELECT metadata FROM audit_logs WHERE action = 'Saldo pembuka disahkan'`)).rows as any[];
    expect(audit).toHaveLength(3);
  });

  it("T25: backup dipulihkan di lingkungan uji → saldo, referensi dan riwayat utuh", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const source = t.getPgPool() as any;
    const fingerprint = await opening.cashLedgerFingerprint();
    expect(fingerprint.entries).toBeGreaterThanOrEqual(4);
    expect(fingerprint.certifications).toBe(3);

    const restored = new PGlite({ loadDataDir: await source.dumpDataDir("gzip") });
    try {
      const restoredDb = drizzle(restored, { schema: t.schema }) as any;
      expect(await opening.cashLedgerFingerprint(restoredDb)).toEqual(fingerprint);
      for (const account of ["petty", "bank_jago", "bank_bni", "drawer"] as const) {
        expect(await ledger.accountBalance(account, null, undefined, restoredDb)).toBe(await ledger.accountBalance(account, null));
      }
      // Referensi pengesahan → baris penyesuaian tetap tersambung.
      const joined = await restored.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM cash_opening_certifications c JOIN cash_ledger_entries l ON l.id = c.adjustment_entry_id`,
      );
      expect(joined.rows[0].n).toBe(2);
      // Kontrol ikut terpulihkan: trigger immutable & satu pengesahan per akun.
      await expect(restored.query(`UPDATE cash_ledger_entries SET amount = 1`)).rejects.toThrow(/tidak bisa diubah/);
      await expect(
        restored.query(`INSERT INTO cash_opening_certifications (scope_key, account, as_of, ledger_balance, counted_balance, adjustment, evidence_ref, certified_by)
          VALUES ('bank_jago:all', 'bank_jago', now(), 0, 0, 0, 'dobel', '${OWNER}')`),
      ).rejects.toThrow();
      const status = await opening.getOpeningStatus(restoredDb);
      expect(status.pending).toBe(0);
      expect(status.fingerprint.digest).toBe(fingerprint.digest);
    } finally {
      await restored.close();
    }
  });
});
