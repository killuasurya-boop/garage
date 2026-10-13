// Laporan Rekonsiliasi Kas & QRIS per shift kasir (tutup shift dalam periode).
// Angka diambil apa adanya dari closing shift: kas seharusnya, hitung fisik
// (blind count), selisih, pencocokan QRIS, setoran & sisa laci.
import { and, eq, gte, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { cashSessions, user } from "@/db/schema";
import { formatRupiah, periodLabelFor, sumRows, type ReportColumn, type ReportDoc, type ReportRow } from "@/lib/report-engine";
import { rangeBounds, wibKey, wibTime, type ReportRange } from "@/lib/reports/common";

const DISCREPANCY_LABEL: Record<string, string> = {
  ok: "Wajar (≤ Rp10.000)",
  review: "Perlu review",
  critical: "Kritis",
  missing: "Belum dihitung",
};

export async function buildReconciliationReport(input: {
  outletId: string;
  outletName?: string | null;
  range: ReportRange;
}): Promise<ReportDoc> {
  const { start, end } = rangeBounds(input.range);
  const rows = await getDb()
    .select({
      code: cashSessions.code,
      openedAt: cashSessions.openedAt,
      closedAt: cashSessions.closedAt,
      cashier: user.name,
      openingCash: cashSessions.openingCash,
      expectedCash: cashSessions.expectedCash,
      actualCash: cashSessions.actualCash,
      discrepancy: cashSessions.discrepancy,
      discrepancyStatus: cashSessions.discrepancyStatus,
      qrisRecorded: cashSessions.qrisRecorded,
      qrisCounted: cashSessions.qrisCounted,
      qrisDiscrepancy: cashSessions.qrisDiscrepancy,
      depositAmount: cashSessions.depositAmount,
      floatLeft: cashSessions.floatLeft,
    })
    .from(cashSessions)
    .leftJoin(user, eq(user.id, cashSessions.openedBy))
    .where(
      and(
        eq(cashSessions.outletId, input.outletId),
        eq(cashSessions.status, "closed"),
        gte(cashSessions.closedAt, start),
        lt(cashSessions.closedAt, end),
      ),
    )
    .orderBy(cashSessions.closedAt);

  const columns: ReportColumn[] = [
    { key: "date", label: "Tgl tutup", type: "date" },
    { key: "shift", label: "Shift", type: "text", weight: 1.2 },
    { key: "cashier", label: "Kasir", type: "text", weight: 1.1 },
    { key: "hours", label: "Jam", type: "text", weight: 0.9 },
    { key: "opening", label: "Modal", type: "money" },
    { key: "expected", label: "Tunai seharusnya", type: "money" },
    { key: "actual", label: "Tunai dihitung", type: "money" },
    { key: "discrepancy", label: "Selisih tunai", type: "money" },
    { key: "status", label: "Status selisih", type: "text" },
    { key: "qrisRecorded", label: "QRIS sistem", type: "money" },
    { key: "qrisCounted", label: "QRIS mutasi", type: "money" },
    { key: "qrisDiscrepancy", label: "Selisih QRIS", type: "money" },
    { key: "deposit", label: "Disetor", type: "money" },
    { key: "floatLeft", label: "Sisa laci", type: "money" },
  ];
  const data: ReportRow[] = rows.map((row) => ({
    date: wibKey(row.closedAt ?? row.openedAt),
    shift: row.code,
    cashier: row.cashier ?? "-",
    hours: `${wibTime(row.openedAt)}–${row.closedAt ? wibTime(row.closedAt) : "?"}`,
    opening: row.openingCash,
    expected: row.expectedCash,
    actual: row.actualCash,
    discrepancy: row.discrepancy,
    status: DISCREPANCY_LABEL[row.discrepancyStatus] ?? row.discrepancyStatus,
    qrisRecorded: row.qrisRecorded,
    qrisCounted: row.qrisCounted,
    qrisDiscrepancy: row.qrisDiscrepancy,
    deposit: row.depositAmount,
    floatLeft: row.floatLeft,
  }));
  const sum = (key: string) => data.reduce((s, r) => s + Number(r[key] ?? 0), 0);
  const unmatchedQris = data.filter((r) => r.qrisCounted === null || r.qrisCounted === undefined).length;

  return {
    title: "Laporan Rekonsiliasi Kas & QRIS",
    division: null,
    periodLabel: periodLabelFor(input.range.from, input.range.to),
    outletName: input.outletName ?? null,
    generatedAt: new Date().toISOString(),
    summary: [
      { label: "Shift ditutup", value: String(data.length) },
      { label: "Tunai seharusnya", value: formatRupiah(sum("expected")) },
      { label: "Tunai dihitung", value: formatRupiah(sum("actual")) },
      { label: "Selisih tunai", value: formatRupiah(sum("discrepancy")) },
      { label: "Selisih QRIS", value: formatRupiah(sum("qrisDiscrepancy")) },
      { label: "Total disetor", value: formatRupiah(sum("deposit")) },
      { label: "QRIS belum dicocokkan", value: `${unmatchedQris} shift` },
    ],
    tables: [{ title: "Rekonsiliasi per shift", columns, rows: data, totals: data.length ? sumRows(data, columns, { key: "date", text: "TOTAL" }) : undefined }],
    notes: [
      "Selisih tunai = tunai dihitung − tunai seharusnya (minus = kurang). Selisih QRIS = mutasi BNI − QRIS tercatat sistem.",
      "Shift dihitung pada tanggal tutup shift (WIB).",
    ],
  };
}
