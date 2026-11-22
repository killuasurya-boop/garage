import { describe, expect, it } from "vitest";

import { platformCookies } from "@/lib/event-site";
import { matchBudgetLine, planContracts, planIncidents, planLedger, platformDate } from "@/lib/platform-import-rules";

const line = (code: string, name: string) => ({ code, name, budget: 0, purpose: "", pic: "", needsVendor: true, contracted: 0, stage: "belum-dipesan" as const });

describe("impor Dashboard Penyelenggara: buku dana", () => {
  it("hanya yang SAH & tidak batal; kode pos harus dikenal; dobel dilewati", () => {
    const plan = planLedger(
      [
        { id: 1, kind: "masuk", declared_amount: 500000, approved_at: "2026-11-17 15:00:00", participant_name: "Kopi Sponsor" },
        { id: 2, kind: "masuk", declared_amount: 300000, approved_at: null },
        { id: 3, kind: "keluar", declared_amount: 1000000, approved_at: "2026-11-18 02:00:00", budget_code: "02", business_name: "Sound Jaya", pay_kind: "dp", contact: "Rafly" },
        { id: 4, kind: "keluar", declared_amount: 200000, approved_at: "2026-11-18 02:00:00", budget_code: "99" },
        { id: 5, kind: "masuk", declared_amount: 900000, approved_at: "2026-11-18 02:00:00", voided_at: "2026-11-19 00:00:00" },
        { id: 6, kind: "masuk", declared_amount: 100000, approved_at: "2026-11-16 03:00:00", business_name: "Lama" },
        "bukan objek",
      ],
      { incomes: [{ date: "2026-11-16", from: "Lama", amount: 100000 }], expenses: [], budgetLines: [line("02", "Sound")] },
    );
    expect(plan.incomes).toEqual([{ date: "2026-11-17", from: "Kopi Sponsor", amount: 500000 }]);
    expect(plan.expenses).toEqual([{ date: "2026-11-18", code: "02", description: "ke Sound Jaya · Rafly", payKind: "dp", amount: 1000000 }]);
    expect(plan.skipped).toMatchObject({ waiting: 1, voided: 1, duplicate: 1, unknownCode: ["99"] });
  });

  it("tanggal WIB dari stempel UTC platform", () => {
    expect(platformDate("2026-11-17 18:30:00")).toBe("2026-11-18");
    expect(platformDate("bukan tanggal")).toBeNull();
  });
});

describe("impor Dashboard Penyelenggara: kontrak & kejadian", () => {
  it("kontrak dipetakan & dicocokkan ke pos lewat catatan RAB lalu nama pos", () => {
    const { items, invalid } = planContracts([
      { id: 7, budgetCode: "02", vendor: "Sound Jaya", value: 10000000, status: "dipesan", pic: "Rafly", terms: "Termasuk lighting" },
      { id: 8, budgetCode: "05", vendor: "Tempat", value: "1.200.000", status: "selesai", doneNote: "Sudah dipakai" },
      { id: 9, vendor: "x" },
    ]);
    expect(invalid).toBe(1);
    expect(items[0]).toMatchObject({ platformRef: "contract:7", status: "aktif", value: 10000000 });
    expect(items[1]).toMatchObject({ status: "selesai", value: 1200000, doneNote: "Sudah dipakai" });
    const lines = [
      { id: "a", title: "Sound (LIGHTING + DRUM + STAGE)", notes: "RAB platform GIGS #02 · PIC Rafly", status: "aktif" },
      { id: "b", title: "Sewa Tempat", notes: null, status: "aktif" },
      { id: "c", title: "Lama", notes: "RAB platform GIGS #09", status: "arsip" },
    ];
    const rab = new Map([["05", "Sewa Tempat"]]);
    expect(matchBudgetLine("02", lines, rab)).toBe("a");
    expect(matchBudgetLine("05", lines, rab)).toBe("b");
    expect(matchBudgetLine("09", lines, rab)).toBeNull();
  });

  it("log kejadian: jenis & tingkat dipetakan, yang ditangani ikut selesai", () => {
    const { items } = planIncidents([
      { id: 3, type: "keamanan", severity: "kritis", message: "Ribut dekat pintu", at: "2026-12-31 14:00:00", created_by: "Ace", resolved: true, resolved_by: "Rafly", resolved_note: "Diamankan" },
      { id: 4, type: "insiden", severity: "normal", message: "Kabel lepas", at: "2026-12-31 14:05:00" },
    ]);
    expect(items[0]).toMatchObject({ platformRef: "log:3", type: "keamanan", severity: "tinggi", reportedByName: "Ace", resolution: "Rafly: Diamankan" });
    expect(items[0].resolvedAt).not.toBeNull();
    expect(items[1]).toMatchObject({ type: "lainnya", severity: "sedang", resolvedAt: null });
  });
});

describe("penerus ke platform tidak membawa cookie Garage OS", () => {
  it("cookie sesi staf, member, mitra, outlet dibuang; cookie platform tetap", () => {
    expect(platformCookies("better-auth.session_token=a; __Secure-better-auth.session_token=b; garage_member_access=c; garage_partner_session=d; garage_active_outlet=e; gigs_session=f")).toBe("gigs_session=f");
    expect(platformCookies(null)).toBe("");
  });
});
