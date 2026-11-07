// Living Intelligence Dashboard (Batch 6) — model murni jaringan 16 domain Garage OS (registry asli
// `GARAGE_DOMAINS`). Tiga informasi DIPISAH: koneksi (browser/server), kesehatan modul (sinyal data),
// aktivitas bisnis (event nyata terakhir). Hijau hanya bila sinyal datanya benar-benar terbaca.
import { GARAGE_DOMAINS, type GarageDomainId } from "@/lib/mcp-tool-registry";

export type NetworkGroup = "operasional" | "bisnis" | "manajemen" | "infrastruktur";
export type NodeHealth = "ok" | "attention" | "critical" | "unverified";

export const GROUP_LABEL: Record<NetworkGroup, string> = {
  operasional: "Operasional",
  bisnis: "Bisnis",
  manajemen: "Manajemen",
  infrastruktur: "Infrastruktur",
};

export const DOMAIN_GROUP: Record<GarageDomainId, NetworkGroup> = {
  pos: "operasional",
  dapur_bar: "operasional",
  meja_qr: "operasional",
  shift_kas: "operasional",
  keuangan: "bisnis",
  gudang: "bisnis",
  produk_harga: "bisnis",
  bahan_resep: "bisnis",
  member_crm: "bisnis",
  karyawan: "manajemen",
  marketing: "manajemen",
  event: "manajemen",
  dokumen: "manajemen",
  dashboard: "infrastruktur",
  notifikasi: "infrastruktur",
  sistem: "infrastruktur",
};

/** Halaman modul tujuan saat node diklik. */
export const DOMAIN_HREF: Partial<Record<GarageDomainId, string>> = {
  pos: "/os?module=pos",
  dapur_bar: "/control/kitchen-ops",
  meja_qr: "/os?module=pos",
  shift_kas: "/control/cash-closing",
  keuangan: "/control/decision",
  gudang: "/warehouse",
  produk_harga: "/control/menu-engineering",
  bahan_resep: "/control/menu-engineering",
  member_crm: "/control/customers",
  karyawan: "/control/hr",
  marketing: "/control/sales",
  event: "/os?module=events",
  dashboard: "/control",
  sistem: "/control/ai-connect",
};

export type DomainSignal = {
  id: GarageDomainId;
  label: string;
  group: NetworkGroup;
  health: NodeHealth;
  reason: string;
  metric: { label: string; value: number } | null;
  lastActivityAt: string | null;
  dataAsOf: string | null;
  href: string | null;
  toolCount: number;
};

export type IntelligenceSnapshot = {
  generatedAt: string;
  domains: DomainSignal[];
  approvals: { pending: number; highRisk: number; failedExecution: number };
  aya: { investigating: boolean; openCases: number; lastCaseAt: string | null };
  activity: Array<{ at: string; domain: GarageDomainId | null; action: string }>;
};

export const ACTIVE_WINDOW_MS = 2 * 60_000;

export function isRecentlyActive(lastActivityAt: string | null, now: number, windowMs = ACTIVE_WINDOW_MS) {
  if (!lastActivityAt) return false;
  const t = new Date(lastActivityAt).getTime();
  return Number.isFinite(t) && now - t >= 0 && now - t <= windowMs;
}

/** Ambang sederhana: ≥ critical → kritis, ≥ attention → perlu perhatian, selain itu aman. */
export function healthFromCount(count: number | null, thresholds: { attention: number; critical?: number }): NodeHealth {
  if (count === null) return "unverified";
  if (thresholds.critical !== undefined && count >= thresholds.critical) return "critical";
  if (count >= thresholds.attention) return "attention";
  return "ok";
}

export const HEALTH_LABEL: Record<NodeHealth, string> = {
  ok: "Normal",
  attention: "Perlu perhatian",
  critical: "Kritis",
  unverified: "Belum terverifikasi",
};

export function baseSignal(id: GarageDomainId, toolCount: number): DomainSignal {
  const domain = GARAGE_DOMAINS.find((d) => d.id === id)!;
  return {
    id,
    label: domain.label,
    group: DOMAIN_GROUP[id],
    health: "unverified",
    reason: "Belum ada sinyal data langsung untuk modul ini.",
    metric: null,
    lastActivityAt: null,
    dataAsOf: null,
    href: DOMAIN_HREF[id] ?? null,
    toolCount,
  };
}

/** Urutan masalah prioritas: kritis → perhatian, lalu nama. */
export function priorityProblems(domains: DomainSignal[]) {
  const rank: Record<NodeHealth, number> = { critical: 0, attention: 1, unverified: 3, ok: 4 };
  return domains.filter((d) => d.health === "critical" || d.health === "attention").sort((a, b) => rank[a.health] - rank[b.health] || a.label.localeCompare(b.label));
}
