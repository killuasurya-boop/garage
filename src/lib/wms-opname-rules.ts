// Aturan deterministik Smart Stock Opname (client-safe, tanpa DB). Semua angka dapat dikonfigurasi
// lewat app_settings `wms.opname.tolerance` / `wms.opname.risk`; default di bawah = kebijakan awal.

export type OpnameClass = "match" | "minor" | "recount" | "manager" | "owner";

export const OPNAME_CLASS_META: Record<OpnameClass, { label: string; tone: "green" | "gray" | "amber" | "purple" | "red"; rank: number }> = {
  match: { label: "Sesuai", tone: "green", rank: 0 },
  minor: { label: "Selisih kecil", tone: "gray", rank: 1 },
  recount: { label: "Perlu hitung ulang", tone: "amber", rank: 2 },
  manager: { label: "Review Manajer", tone: "purple", rank: 3 },
  owner: { label: "Eskalasi Owner", tone: "red", rank: 4 },
};

export type ToleranceConfig = {
  /** Selisih ≤ batas absolut per satuan dasar dianggap "selisih kecil" (mis. sisa timbangan). */
  absoluteByUnit: Record<string, number>;
  /** Default batas absolut untuk satuan yang tidak terdaftar. */
  absoluteDefault: number;
  /** Persen selisih terhadap stok sistem yang memicu hitung ulang. */
  recountPct: number;
  /** Nilai rupiah |selisih × HPP| yang wajib direview Manajer. */
  managerValue: number;
  /** Nilai rupiah yang wajib dieskalasi ke Owner. */
  ownerValue: number;
  /** Jumlah kejadian selisih (non-sesuai) dalam 90 hari yang dianggap berulang → eskalasi Owner. */
  repeatEvents: number;
  /** Persen per kategori/jenis bahan (mis. bahan mahal lebih ketat). Kunci = nama kategori. */
  recountPctByCategory: Record<string, number>;
};

export const DEFAULT_TOLERANCE: ToleranceConfig = {
  absoluteByUnit: { gram: 5, gr: 5, g: 5, ml: 5, pcs: 0, bks: 0, btl: 0, cup: 0, pack: 0 },
  absoluteDefault: 0,
  recountPct: 5,
  managerValue: 50_000,
  ownerValue: 250_000,
  repeatEvents: 3,
  recountPctByCategory: {},
};

export type VarianceInput = {
  systemQty: number;
  physicalQty: number;
  unit: string;
  /** Biaya per satuan dasar (moving average saat ini). */
  rate: number;
  category?: string;
  /** Kejadian selisih (non-sesuai) bahan ini di ruang yang sama dalam 90 hari terakhir. */
  priorVarianceEvents?: number;
  /** Sudah dihitung ulang setidaknya sekali (hasil terbaru tetap berbeda). */
  recounted?: boolean;
};

export type VarianceResult = {
  variance: number;
  /** null bila stok sistem 0 (tidak dibagi nol) — gunakan batas absolut & nilai. */
  variancePct: number | null;
  value: number;
  classification: OpnameClass;
  reasons: string[];
};

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Klasifikasi selisih: kombinasi batas absolut per satuan, persen (hanya bila sistem > 0),
 * nilai rupiah, dan riwayat berulang. Urutan keputusan dari yang paling berat.
 */
export function classifyVariance(input: VarianceInput, cfg: ToleranceConfig = DEFAULT_TOLERANCE): VarianceResult {
  const variance = r4(input.physicalQty - input.systemQty);
  const abs = Math.abs(variance);
  const value = Math.round(variance * Math.max(0, input.rate));
  const absValue = Math.abs(value);
  const variancePct = input.systemQty > 0 ? r4((variance / input.systemQty) * 100) : null;
  const reasons: string[] = [];
  if (abs < 1e-9) return { variance: 0, variancePct: input.systemQty > 0 ? 0 : null, value: 0, classification: "match", reasons: ["Fisik = sistem"] };

  const absLimit = cfg.absoluteByUnit[input.unit.toLowerCase()] ?? cfg.absoluteDefault;
  const pctLimit = input.category ? (cfg.recountPctByCategory[input.category] ?? cfg.recountPct) : cfg.recountPct;
  const repeated = (input.priorVarianceEvents ?? 0) >= cfg.repeatEvents;

  if (absValue >= cfg.ownerValue) reasons.push(`Nilai selisih ≥ Rp${cfg.ownerValue.toLocaleString("id-ID")}`);
  if (repeated) reasons.push(`Selisih berulang (${input.priorVarianceEvents}× dalam 90 hari)`);
  if (reasons.length) return { variance, variancePct, value, classification: "owner", reasons };

  if (absValue >= cfg.managerValue) {
    return { variance, variancePct, value, classification: "manager", reasons: [`Nilai selisih ≥ Rp${cfg.managerValue.toLocaleString("id-ID")}`] };
  }
  const withinAbs = abs <= absLimit;
  // Stok sistem 0 tapi fisik ada (atau sebaliknya tak terhitung persen): pakai batas absolut.
  const overPct = variancePct === null ? !withinAbs : Math.abs(variancePct) > pctLimit && !withinAbs;
  if (overPct && !input.recounted) {
    return {
      variance,
      variancePct,
      value,
      classification: "recount",
      reasons: [variancePct === null ? "Stok sistem 0 — hitung ulang untuk memastikan" : `Selisih ${Math.abs(variancePct)}% > ${pctLimit}%`],
    };
  }
  if (overPct && input.recounted) {
    return { variance, variancePct, value, classification: "manager", reasons: ["Sudah dihitung ulang, selisih tetap di atas toleransi"] };
  }
  return { variance, variancePct, value, classification: "minor", reasons: [withinAbs ? `Dalam batas ±${absLimit} ${input.unit}` : `Dalam toleransi ${pctLimit}%`] };
}

/** Kelas terberat dari sekumpulan baris (menentukan siapa yang boleh menyetujui sesi). */
export function worstClass(classes: Array<OpnameClass | null | undefined>): OpnameClass {
  let worst: OpnameClass = "match";
  for (const c of classes) if (c && OPNAME_CLASS_META[c].rank > OPNAME_CLASS_META[worst].rank) worst = c;
  return worst;
}

// ---------------------------------------------------------------------------
// Skor risiko (prioritas hitung). Formula terdokumentasi, bukan prediksi:
//   skor = Σ bobot_i × nilai_i  (setiap nilai_i dinormalisasi 0..1 terhadap maksimum ruang)
// Komponen:
//   value      = nilai stok sekarang (qty × HPP)
//   usage      = jumlah mutasi keluar (jual/produksi/transfer) 30 hari
//   events     = jumlah kejadian selisih opname 90 hari
//   lossValue  = total |nilai selisih| opname 90 hari
//   expiry     = kedekatan kedaluwarsa batch terdekat (≤ 0 hari = 1, ≥ 30 hari = 0)
//   staleness  = hari sejak terakhir dihitung (≥ 30 hari / belum pernah = 1)
// ---------------------------------------------------------------------------

export type RiskWeights = { value: number; usage: number; events: number; lossValue: number; expiry: number; staleness: number };
export const DEFAULT_RISK_WEIGHTS: RiskWeights = { value: 0.25, usage: 0.2, events: 0.15, lossValue: 0.15, expiry: 0.1, staleness: 0.15 };

export type RiskFactors = {
  stockValue: number;
  usageCount30d: number;
  varianceEvents90d: number;
  varianceLoss90d: number;
  daysToExpiry: number | null;
  daysSinceCount: number | null;
};

export function riskScores<T extends { factors: RiskFactors }>(items: T[], weights: RiskWeights = DEFAULT_RISK_WEIGHTS) {
  const max = (pick: (f: RiskFactors) => number) => Math.max(1e-9, ...items.map((i) => pick(i.factors)));
  const mValue = max((f) => f.stockValue);
  const mUsage = max((f) => f.usageCount30d);
  const mEvents = max((f) => f.varianceEvents90d);
  const mLoss = max((f) => f.varianceLoss90d);
  return items
    .map((i) => {
      const f = i.factors;
      const parts = {
        value: f.stockValue / mValue,
        usage: f.usageCount30d / mUsage,
        events: f.varianceEvents90d / mEvents,
        lossValue: f.varianceLoss90d / mLoss,
        expiry: f.daysToExpiry === null ? 0 : Math.min(1, Math.max(0, (30 - f.daysToExpiry) / 30)),
        staleness: f.daysSinceCount === null ? 1 : Math.min(1, f.daysSinceCount / 30),
      };
      const score = (Object.keys(parts) as Array<keyof RiskWeights>).reduce((s, k) => s + weights[k] * parts[k], 0);
      const top = (Object.entries(parts) as Array<[keyof RiskWeights, number]>)
        .map(([k, v]) => [k, weights[k] * v] as const)
        .sort((a, b) => b[1] - a[1])
        .filter(([, v]) => v > 0)
        .slice(0, 2)
        .map(([k]) => RISK_REASON[k]);
      return { ...i, score: Math.round(score * 1000) / 10, parts, reasons: top };
    })
    .sort((a, b) => b.score - a.score);
}

const RISK_REASON: Record<keyof RiskWeights, string> = {
  value: "nilai stok tinggi",
  usage: "sering dipakai",
  events: "sering selisih",
  lossValue: "kerugian selisih besar",
  expiry: "mendekati kedaluwarsa",
  staleness: "lama tidak dihitung",
};

/** Total fisik dari kemasan utuh × isi + sisa kemasan terbuka (satuan dasar). */
export function countFromPacks(input: { packs?: number; factor?: number; loose?: number }) {
  const packs = Math.max(0, Number(input.packs ?? 0));
  const factor = Math.max(0, Number(input.factor ?? 0));
  const loose = Math.max(0, Number(input.loose ?? 0));
  return r4(packs * factor + loose);
}
