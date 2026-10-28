import { describe, expect, it } from "vitest";

import { ownerOfficialQuery } from "@/lib/owner-reports-query";

describe("query laporan resmi Owner", () => {
  it("menerima bentuk yang dipakai panel Owner 360", () => {
    for (const query of [
      { type: "closing", date: "2026-10-28" },
      { type: "closing", date: "2026-10-28", format: "pdf" },
      { type: "monthly", month: "2026-10" },
      { type: "monthly", from: "2026-10-01", to: "2026-10-15", format: "pdf" },
      { type: "ledger", month: "2026-10" },
      { type: "ledger", month: "2026-10", format: "xlsx" },
      { type: "case", caseId: "1a2b3c4d-0000-4000-8000-000000000000", format: "pdf" },
    ]) {
      expect(ownerOfficialQuery.safeParse(query).success, JSON.stringify(query)).toBe(true);
    }
  });

  it("menolak bentuk salah", () => {
    for (const query of [
      { type: "monthly", month: "2026-1" },
      { type: "ledger", month: "Okt" },
      { type: "closing", date: "28-10-2026" },
      { type: "case", caseId: "x" },
      { type: "ledger", month: "2026-10", format: "csv" },
      { type: "lainnya" },
    ]) {
      expect(ownerOfficialQuery.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });
});
