// Halaman event platform GIGS dari Garage OS, bagian tambahan (Owner 19 Nov 2026, satu pintu): sponsor & kreator yang
// disetujui (participants), kesiapan acara (readiness) dan laporan akhir (closeout). Aturan murni: membentuk data dalam
// bentuk yang dibaca app.js platform. Semua angka dari data nyata Garage; yang tidak ada datanya ditandai tidak tersedia.
import { lineupKey } from "@/lib/gigs-lineup";

// ─── Sponsor & kreator ──────────────────────────────────────────────────────

export type PublicSponsor = { name: string; category: string; support: "kas" | "nonkas"; supportNote: string; logo: string };
export type PublicCreator = { id: string; name: string; category: string; description: string; instagram: string; portfolio: string; address: string; logo: string };

/** Data platform (pendaftaran lama yang disetujui di platform) + Garage; nama sama (lineupKey) tidak dobel — Garage dulu. */
export function mergeParticipants(
  platform: { sponsors?: unknown; creators?: unknown; sponsorCounts?: unknown } | null,
  garage: { sponsors: PublicSponsor[]; creators: PublicCreator[] },
) {
  const dedupe = <T extends { name: string }>(first: T[], rest: unknown): T[] => {
    const seen = new Set(first.map((x) => lineupKey(x.name)));
    const extra = (Array.isArray(rest) ? (rest as T[]) : []).filter((x) => {
      if (!x || typeof x.name !== "string") return false;
      const key = lineupKey(x.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [...first, ...extra];
  };
  return {
    sponsors: dedupe(garage.sponsors, platform?.sponsors),
    creators: dedupe(garage.creators, platform?.creators),
    sponsorCounts: platform?.sponsorCounts ?? { committed: garage.sponsors.length, nonkas: garage.sponsors.filter((s) => s.support === "nonkas").length, verified: 0, cancelled: 0 },
  };
}

/** Sponsor tanpa nilai uang tetapi punya sponsor barang → "nonkas" (catatan = barang, ≤80 karakter). */
export function sponsorSupport(agreedAmount: number, inkindItems: string[]): { support: "kas" | "nonkas"; supportNote: string } {
  if (agreedAmount > 0 || !inkindItems.length) return { support: "kas", supportNote: "" };
  return { support: "nonkas", supportNote: inkindItems.join(", ").slice(0, 80) };
}

// ─── Kesiapan acara ─────────────────────────────────────────────────────────

/** Checklist operasional yang masuk Gate C (siap tampil); sisanya Gate A (kelayakan venue & izin). */
const GATE_C_KEYS = new Set(["soundcheck"]);

export type ReadinessInput = {
  ops: Array<{ key: string; done: boolean }>;
  finance: { target: number; income: number; committedCount: number; budgetLines: Array<{ stage: string; needsVendor: boolean }> } | null;
  performers: Array<{ hasTime: boolean }>;
  activeCrew: number;
  obligations: { done: number; total: number };
};

export function buildReadiness(input: ReadinessInput, decision: unknown = null) {
  const opsA = input.ops.filter((o) => !GATE_C_KEYS.has(o.key));
  const opsC = input.ops.filter((o) => GATE_C_KEYS.has(o.key));
  const f = input.finance;
  const gateA = { gate: "A", done: opsA.filter((o) => o.done).length, total: opsA.length };
  const bItems = [Boolean(f && f.target > 0), Boolean(f && f.budgetLines.length > 0), Boolean(f && (f.income > 0 || f.committedCount > 0))];
  const gateB = { gate: "B", done: bItems.filter(Boolean).length, total: bItems.length };
  const cItems = [input.performers.length > 0, input.performers.length > 0 && input.performers.every((p) => p.hasTime), input.activeCrew > 0, ...opsC.map((o) => o.done)];
  const gateC = { gate: "C", done: cItems.filter(Boolean).length, total: cItems.length };
  const gates = [gateA, gateB, gateC];

  const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);
  const vendorLines = f?.budgetLines ?? [];
  const components = [
    { key: "dana", label: "Dana terkumpul", weight: 30, available: Boolean(f && f.target > 0), percent: f && f.target > 0 ? Math.min(100, Math.round((f.income / f.target) * 100)) : 0 },
    {
      key: "vendor",
      label: "Vendor & pos RAB",
      weight: 25,
      available: vendorLines.length > 0,
      percent: pct(vendorLines.filter((l) => !l.needsVendor || l.stage !== "belum-dipesan").length, vendorLines.length),
    },
    { key: "checklist", label: "Checklist Gate A/B/C", weight: 20, available: true, percent: pct(gates.reduce((s, g) => s + g.done, 0), gates.reduce((s, g) => s + g.total, 0)) },
    { key: "lineup", label: "Lineup & slot", weight: 10, available: true, percent: pct(input.performers.filter((p) => p.hasTime).length, input.performers.length) },
    { key: "sponsor", label: "Hak sponsor", weight: 10, available: input.obligations.total > 0, percent: pct(input.obligations.done, input.obligations.total) },
    // Konten belum dicatat di Garage → tidak ikut dihitung (bukan 0 palsu).
    { key: "konten", label: "Konten", weight: 0, available: false, percent: 0 },
  ];
  const counted = components.filter((c) => c.available && c.weight > 0);
  const weight = counted.reduce((s, c) => s + c.weight, 0);
  const total = weight > 0 ? Math.round(counted.reduce((s, c) => s + c.weight * c.percent, 0) / weight) : 0;
  return { total, components, gates, decision: decision ?? null };
}

// ─── Laporan akhir ──────────────────────────────────────────────────────────

export type CloseoutText = {
  published: boolean;
  publishedAt: string | null;
  evaluation: string;
  recommendations: string;
  surplusDecision: string;
  incidentsTotal: number;
  incidentsResolved: number;
};

/** ISO → "YYYY-MM-DD HH:MM:SS" (UTC), format waktu yang dibaca halaman event. */
export function platformTimestamp(iso: string) {
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
}

export function buildCloseout(input: {
  closeout: CloseoutText;
  event: { name: string; venue: string };
  finance: { income: number; expense: number; target: number };
  attendance: number;
  program: Array<{ name: string; actualStart: string | null; actualEnd: string | null }>;
  sponsors: Array<{ name: string; support: "kas" | "nonkas" }>;
  obligations: { done: number; total: number; sponsors: number };
}) {
  if (!input.closeout.published || !input.closeout.publishedAt) return null;
  return {
    publishedAt: platformTimestamp(input.closeout.publishedAt),
    event: input.event,
    finance: {
      income: input.finance.income,
      target: input.finance.target,
      expense: input.finance.expense,
      corrections: 0,
      balance: input.finance.income - input.finance.expense,
      pendingPayments: 0,
    },
    attendance: input.attendance,
    incidents: { total: input.closeout.incidentsTotal, resolved: Math.min(input.closeout.incidentsResolved, input.closeout.incidentsTotal) },
    program: input.program.map((p) => ({ name: p.name, performer: "", actualStart: p.actualStart, actualEnd: p.actualEnd })),
    sponsors: input.sponsors.map((s) => ({ name: s.name, support: s.support })),
    benefits: { hak: { done: input.obligations.done, total: input.obligations.total }, konten: { done: 0, total: 0 }, sponsors: input.obligations.sponsors },
    evaluation: input.closeout.evaluation,
    recommendations: input.closeout.recommendations,
    surplusDecision: input.closeout.surplusDecision,
  };
}
