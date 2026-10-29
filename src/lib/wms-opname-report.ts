// Laporan Loss Control (harian / mingguan / bulanan) → satu ReportDoc untuk JSON, PDF, XLSX, CSV.
import { periodLabelFor, type ReportDoc } from "@/lib/report-engine";
import type { getWmsLossReport } from "@/lib/wms-loss";

export type LossPeriod = "daily" | "weekly" | "monthly";

const JAKARTA_OFFSET_MS = 7 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Rentang periode WIB → [from, to) UTC. Mingguan = Senin–Minggu yang memuat tanggal acuan;
 * bulanan = bulan kalender. `dateKey` format YYYY-MM-DD (tanggal operasional WIB).
 */
export function resolveLossPeriod(period: LossPeriod, dateKey: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) throw new Error("Tanggal harus format YYYY-MM-DD.");
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (key(day) !== dateKey) throw new Error("Tanggal tidak valid.");
  let start = day;
  let end: Date;
  if (period === "daily") {
    end = new Date(day.getTime() + 86_400_000);
  } else if (period === "weekly") {
    const dow = (day.getUTCDay() + 6) % 7; // Senin = 0
    start = new Date(day.getTime() - dow * 86_400_000);
    end = new Date(start.getTime() + 7 * 86_400_000);
  } else {
    start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
  }
  const lastDay = new Date(end.getTime() - 86_400_000);
  return {
    from: new Date(start.getTime() - JAKARTA_OFFSET_MS),
    to: new Date(end.getTime() - JAKARTA_OFFSET_MS),
    fromKey: key(start),
    toKey: key(lastDay),
  };
}

const PERIOD_LABEL: Record<LossPeriod, string> = { daily: "Harian", weekly: "Mingguan", monthly: "Bulanan" };
const WASTE_REASON: Record<string, string> = { expired: "Kedaluwarsa", damaged: "Rusak", spill: "Tumpah", prep_loss: "Susut prep", other: "Lainnya" };
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const pctText = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("id-ID")}%`);

export function buildLossReportDoc(
  data: Awaited<ReturnType<typeof getWmsLossReport>>,
  meta: { period: LossPeriod; fromKey: string; toKey: string; warehouseLabel: string; generatedBy: string; outletName?: string | null },
): ReportDoc {
  const s = data.summary;
  const item = [
    { key: "sku", label: "Kode", type: "text" as const },
    { key: "name", label: "Bahan", type: "text" as const, weight: 2 },
    { key: "warehouseName", label: "Ruang", type: "text" as const },
    { key: "unit", label: "Satuan", type: "text" as const },
  ];
  return {
    title: `Loss Control ${PERIOD_LABEL[meta.period]}`,
    division: meta.warehouseLabel,
    periodLabel: periodLabelFor(meta.fromKey, meta.toKey),
    outletName: meta.outletName ?? null,
    generatedAt: new Date().toISOString(),
    generatedBy: meta.generatedBy,
    showLogo: true,
    orientation: "landscape",
    summary: [
      { label: "Opname disetujui", value: String(data.opnameCount) },
      { label: "Kekurangan (gross)", value: rp(s.grossShortage) },
      { label: "Kelebihan (gross)", value: rp(s.grossSurplus) },
      { label: "Waste tercatat", value: rp(s.recordedWaste) },
      { label: "Kekurangan tak terjelaskan", value: rp(s.unexplained) },
      { label: "Selisih bersih", value: rp(s.net) },
      { label: "Total kerugian (waste + tak terjelaskan)", value: rp(s.totalLoss) },
      { label: "Akurasi hitung", value: pctText(s.accuracyPct) },
      { label: "Akurasi nilai", value: pctText(s.valueAccuracyPct) },
      { label: "Cakupan hitung", value: `${pctText(s.coveragePct)} (${s.coveredPairs}/${s.activePairs})` },
    ],
    filters: [`Periode: ${PERIOD_LABEL[meta.period]}`, `Ruang: ${meta.warehouseLabel}`],
    notes: [
      "Zona waktu Asia/Jakarta (WIB). Nilai dari biaya rata-rata yang diposting ledger saat opname disetujui.",
      "Laporan manajerial: tidak membuat beban/jurnal baru (pembelian sudah dibebankan saat penerimaan).",
      "Kekurangan tak terjelaskan = kekurangan opname yang tidak tercatat sebagai waste; kelebihan bahan lain tidak dipakai untuk menutupinya.",
      data.disclaimer,
    ],
    tables: [
      {
        title: "10 kerugian terbesar",
        columns: [...item, { key: "events", label: "Kejadian", type: "int" }, { key: "shortageValue", label: "Kurang (Rp)", type: "money" }, { key: "wasteValue", label: "Waste (Rp)", type: "money" }],
        rows: data.top10,
      },
      {
        title: "Selisih per bahan",
        columns: [
          ...item,
          { key: "shortageQty", label: "Kurang", type: "qty", noSum: true },
          { key: "surplusQty", label: "Lebih", type: "qty", noSum: true },
          { key: "shortageValue", label: "Kurang (Rp)", type: "money" },
          { key: "surplusValue", label: "Lebih (Rp)", type: "money" },
          { key: "wasteValue", label: "Waste (Rp)", type: "money" },
        ],
        rows: data.rows,
        maxLines: 3,
      },
      {
        title: "Waste per alasan",
        columns: [{ key: "reason", label: "Alasan", type: "text" }, { key: "value", label: "Nilai", type: "money" }],
        rows: Object.entries(data.wasteByReason).map(([reason, value]) => ({ reason: WASTE_REASON[reason] ?? reason, value })),
      },
    ],
  };
}
