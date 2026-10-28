import { describe, expect, it } from "vitest";

import { buildCashLedgerReport, type LedgerEntryInput } from "@/lib/cash-ledger-report";

// B7c (F38/F35): buku kas rinci per akun + arus kas Owner.

function entry(overrides: Partial<LedgerEntryInput>): LedgerEntryInput {
  return {
    id: "e-0000",
    seq: 1,
    at: "2026-10-05T03:00:00.000Z",
    businessDate: "2026-10-05",
    fromAccount: "external",
    toAccount: "drawer",
    amount: 100_000,
    sourceType: "opening",
    sourceRef: null,
    sourceId: null,
    note: null,
    reversesId: null,
    legacy: false,
    actorName: "Kasir A",
    approverName: null,
    sessionCode: "SHF-1",
    outletCode: "TT",
    ...overrides,
  };
}

const entries: LedgerEntryInput[] = [
  entry({ id: "e-open", seq: 1 }),
  entry({ id: "e-sale", seq: 2, at: "2026-10-05T04:00:00.000Z", fromAccount: "external", toAccount: "drawer", amount: 50_000, sourceType: "sale", sourceRef: "ORD-1" }),
  entry({ id: "e-out", seq: 3, at: "2026-10-05T05:00:00.000Z", fromAccount: "drawer", toAccount: "external", amount: 20_000, sourceType: "drawer_out" }),
  entry({ id: "e-rev", seq: 4, at: "2026-10-05T05:30:00.000Z", fromAccount: "external", toAccount: "drawer", amount: 20_000, sourceType: "drawer_reversal", reversesId: "e-out" }),
  entry({ id: "e-dep", seq: 5, at: "2026-10-05T10:00:00.000Z", fromAccount: "drawer", toAccount: "deposit_transit", amount: 100_000, sourceType: "drawer_out", sourceRef: "KAS-1" }),
  entry({ id: "e-bank", seq: 6, at: "2026-10-06T02:00:00.000Z", businessDate: "2026-10-06", fromAccount: "deposit_transit", toAccount: "bank_bni", amount: 100_000, sourceType: "deposit_confirm" }),
  entry({ id: "e-petty", seq: 7, at: "2026-10-06T03:00:00.000Z", businessDate: "2026-10-06", fromAccount: "bank_bni", toAccount: "petty", amount: 300_000, sourceType: "petty_topup", legacy: true }),
];

describe("buku kas rinci", () => {
  const r = buildCashLedgerReport({
    from: "2026-10-01",
    to: "2026-10-31",
    outletName: "Tebing Tinggi",
    opening: { drawer: 0, bank_bni: 500_000, petty: 10_000 },
    closing: { drawer: 50_000, bank_bni: 300_000, petty: 310_000, deposit_transit: 0 },
    entries: [...entries].reverse(),
    generatedAt: "2026-11-01T00:00:00.000Z",
  });
  const acc = (account: string) => r.accounts.find((a) => a.account === account)!;

  it("saldo berjalan per akun urut waktu & seq; awal + masuk − keluar = akhir", () => {
    const drawer = acc("drawer");
    expect(drawer.lines.map((l) => l.running)).toEqual([100_000, 150_000, 130_000, 150_000, 50_000]);
    expect(drawer).toMatchObject({ opening: 0, inflow: 170_000, outflow: 120_000, closing: 50_000, reconciled: true });
    expect(acc("bank_bni")).toMatchObject({ opening: 500_000, inflow: 100_000, outflow: 300_000, closing: 300_000, reconciled: true });
    expect(acc("deposit_transit")).toMatchObject({ inflow: 100_000, outflow: 100_000, closing: 0 });
  });

  it("baris pembalik terhubung dua arah; data lama ditandai", () => {
    const drawer = acc("drawer");
    expect(drawer.lines.find((l) => l.id === "e-out")?.reversedById).toBe("e-rev");
    expect(drawer.lines.find((l) => l.id === "e-rev")?.reversesId).toBe("e-out");
    expect(r.totals).toMatchObject({ entries: 7, reversals: 1, legacyRows: 1, unreconciled: [] });
  });

  it("arus pihak luar (non-laci) dipisah dan tidak punya saldo", () => {
    expect(r.accounts.map((a) => a.account)).not.toContain("external");
    expect(r.external.inflow).toBe(170_000);
    expect(r.external.outflow).toBe(20_000);
  });

  it("rincian per jenis & meta", () => {
    expect(acc("drawer").bySource.find((s) => s.sourceType === "drawer_out")).toMatchObject({ count: 2, outflow: 120_000 });
    expect(r.meta.reportId).toMatch(/^LED-20261001-20261031-[0-9A-F]{8}$/);
    expect(r.meta.fileBase).toBe("GARAGE_TEBING_TINGGI_CASH_LEDGER_2026-10-01_2026-10-31");
  });

  it("saldo akhir DB berbeda → ditandai tidak cocok", () => {
    const bad = buildCashLedgerReport({
      from: "2026-10-01",
      to: "2026-10-31",
      outletName: null,
      opening: {},
      closing: { drawer: 49_000 },
      entries,
      generatedAt: "x",
    });
    expect(bad.totals.unreconciled).toEqual(["drawer"]);
    expect(bad.accounts.find((a) => a.account === "drawer")?.reconciled).toBe(false);
    expect(bad.meta.fileBase).toBe("GARAGE_OUTLET_CASH_LEDGER_2026-10-01_2026-10-31");
  });
});
