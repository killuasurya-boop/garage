// =============================================================================
// PRODUCTION HUB — aturan murni (tanpa DB) yang dipakai server & UI.
// Acuan: GARAGE OS Production Hub v1.0 + Workflow Operasional v1.0 (Sep 2026).
//   - Auto routing dari master produk (BR-04).
//   - READY oleh workstation produksi, kasir POS, atau Owner/Manajer (BR-07/BR-08; kasir ditambah owner Okt 2026).
//   - Smart Batch menggabung pekerjaan, BUKAN identitas customer (BR-05).
// =============================================================================

import type { Role } from "@/lib/garage-data";

// Nilai station tiket di DB tetap "Bar" / "Food" (data lama); UI menyebut
// Food sebagai DAPUR.
export type ProductionStation = "Bar" | "Food";
// Produksi: bar | dapur | all. Helper (serah-terima saja, tidak memproduksi):
// helper_bar | helper_dapur | helper_all.
export type Workstation =
  | "bar"
  | "dapur"
  | "all"
  | "helper_bar"
  | "helper_dapur"
  | "helper_all"
  | "kurir";

export const WORKSTATION_VALUES: Workstation[] = [
  "bar",
  "dapur",
  "all",
  "helper_bar",
  "helper_dapur",
  "helper_all",
  "kurir",
];

export const WORKSTATION_OPTIONS: Array<{ value: Workstation | ""; label: string }> = [
  { value: "", label: "Tidak ditugaskan produksi" },
  { value: "bar", label: "Produksi BAR" },
  { value: "dapur", label: "Produksi DAPUR" },
  { value: "all", label: "Produksi BAR + DAPUR" },
  { value: "helper_bar", label: "Helper BAR (serah-terima)" },
  { value: "helper_dapur", label: "Helper DAPUR (serah-terima)" },
  { value: "helper_all", label: "Helper BAR + DAPUR (serah-terima)" },
  { value: "kurir", label: "Kurir delivery (akun Waiter)" },
];

/** Akun kurir delivery = role Waiter dengan workstation "kurir". */
export function isCourierProfile(profile: { role: string; workstation?: string | null }) {
  return profile.role === "Waiter" && normalizeWorkstation(profile.workstation) === "kurir";
}

export function workstationLabel(value: string | null | undefined) {
  const ws = normalizeWorkstation(value);
  return WORKSTATION_OPTIONS.find((option) => option.value === (ws ?? ""))?.label ?? "Tidak ditugaskan";
}

const BAR_CATEGORIES = new Set(["Coffee", "Non-Coffee"]);

/** Station produksi untuk satu produk: override master produk, lalu kategori. */
export function productionStationFor(menu: {
  station?: string | null;
  category?: string | null;
}): ProductionStation {
  const override = menu.station?.trim().toLowerCase();
  if (override === "bar") return "Bar";
  if (override === "dapur") return "Food";
  return BAR_CATEGORIES.has(menu.category ?? "") ? "Bar" : "Food";
}

export function normalizeProductionStation(value: string | null | undefined): ProductionStation {
  const v = (value ?? "").toLowerCase();
  return v === "bar" ? "Bar" : "Food";
}

export function productionStationLabel(station: string | null | undefined) {
  return normalizeProductionStation(station) === "Bar" ? "BAR" : "DAPUR";
}

export function normalizeWorkstation(value: string | null | undefined): Workstation | null {
  const v = (value ?? "").trim().toLowerCase();
  return (WORKSTATION_VALUES as string[]).includes(v) ? (v as Workstation) : null;
}

export function isHelperWorkstation(value: string | null | undefined) {
  return normalizeWorkstation(value)?.startsWith("helper_") ?? false;
}

/** Workstation PRODUKSI mencakup station ini (helper tidak dihitung). */
export function workstationCovers(
  workstation: string | null | undefined,
  station: string | null | undefined,
) {
  const ws = normalizeWorkstation(workstation);
  if (!ws || ws.startsWith("helper_")) return false;
  if (ws === "all") return true;
  return ws === (normalizeProductionStation(station) === "Bar" ? "bar" : "dapur");
}

function helperCovers(workstation: string | null | undefined, station: string | null | undefined) {
  const ws = normalizeWorkstation(workstation);
  if (!ws?.startsWith("helper_")) return false;
  if (ws === "helper_all") return true;
  return ws === (normalizeProductionStation(station) === "Bar" ? "helper_bar" : "helper_dapur");
}

/**
 * Kasir POS (role Kasir tanpa workstation produksi/helper). Owner Okt 2026:
 * kasir ikut memproses pesanan Bar & Dapur untuk mengontrol pesanan masuk.
 */
function isPosCashier(role: Role, workstation: string | null | undefined) {
  return role === "Kasir" && normalizeWorkstation(workstation) === null;
}

/**
 * Boleh MULAI / READY / batch di station ini? Owner & Manajer selalu boleh
 * (override manajemen, tercatat audit). Kasir POS (tanpa workstation) boleh di
 * semua station; barista/koki hanya di workstation yang ditugaskan; helper
 * tidak. Waiter tidak pernah boleh (BR-08).
 */
export function canOperateStation(
  role: Role,
  workstation: string | null | undefined,
  station: string | null | undefined,
) {
  if (role === "Owner" || role === "Manajer") return true;
  if (role !== "Kasir") return false;
  return isPosCashier(role, workstation) || workstationCovers(workstation, station);
}

/**
 * Boleh ACC serah-terima & memanggil waiter untuk produk READY di station ini?
 * Helper station tsb (utama), workstation produksi station tsb (cadangan saat
 * helper tidak ada), dan Owner/Manajer. Waiter tidak.
 */
export function canHandoverStation(
  role: Role,
  workstation: string | null | undefined,
  station: string | null | undefined,
) {
  if (role === "Owner" || role === "Manajer") return true;
  if (role !== "Kasir") return false;
  return isPosCashier(role, workstation) || helperCovers(workstation, station) || workstationCovers(workstation, station);
}

/** Station yang bisa dioperasikan akun ini (untuk filter default UI). */
export function operableStations(role: Role, workstation: string | null | undefined) {
  return (["Bar", "Food"] as const).filter((station) =>
    canOperateStation(role, workstation, station),
  );
}

export function normalizeProductionNote(note: string | null | undefined) {
  return (note ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Smart Batch — kandidat
// ---------------------------------------------------------------------------

export type BatchCandidateItem = {
  id: string;
  ticketNo: string;
  station: string;
  menuItemId: string | null;
  variantId: string | null;
  itemName: string;
  variantLabel: string;
  qty: number;
  note: string | null;
  batchEligible: boolean;
  customerName: string | null;
  tableLabel: string;
  orderNo: string | null;
  createdAt: string;
};

export type BatchSuggestion = {
  key: string;
  station: ProductionStation;
  itemLabel: string;
  note: string | null;
  totalQty: number;
  oldestAt: string;
  items: BatchCandidateItem[];
};

export function productionItemLabel(itemName: string, variantLabel: string) {
  return variantLabel && variantLabel !== "Regular" ? `${itemName} ${variantLabel}` : itemName;
}

/**
 * Kunci kompatibilitas batch: produk + varian + catatan produksi. Catatan beda
 * = cara buat beda → sub-batch terpisah (dokumen §8.3).
 */
export function batchKeyFor(item: Pick<
  BatchCandidateItem,
  "station" | "menuItemId" | "variantId" | "note"
>) {
  return [
    normalizeProductionStation(item.station),
    item.menuItemId ?? "",
    item.variantId ?? "",
    normalizeProductionNote(item.note),
  ].join("|");
}

/**
 * Kelompokkan porsi WAITING yang kompatibel. Batch window = rentang waktu
 * maksimal antar porsi dalam satu batch (0 = tanpa batas). Batch hanya saran:
 * tidak ada order yang ditahan menunggu batch (SLA tetap aman).
 */
export function buildBatchSuggestions(
  items: BatchCandidateItem[],
  options: { windowSec: number },
): BatchSuggestion[] {
  const groups = new Map<string, BatchCandidateItem[]>();
  for (const item of items) {
    if (!item.batchEligible || !item.menuItemId) continue;
    const key = batchKeyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const windowMs = Math.max(0, options.windowSec) * 1000;
  const suggestions: BatchSuggestion[] = [];
  for (const [key, groupItems] of groups) {
    const sorted = [...groupItems].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    let cluster: BatchCandidateItem[] = [];
    const flush = () => {
      // Batch bermakna bila ≥ 2 porsi dari ≥ 2 tiket berbeda.
      const tickets = new Set(cluster.map((item) => item.ticketNo));
      if (cluster.length >= 2 && tickets.size >= 2) {
        const first = cluster[0];
        suggestions.push({
          key: `${key}|${first.id}`,
          station: normalizeProductionStation(first.station),
          itemLabel: productionItemLabel(first.itemName, first.variantLabel),
          note: first.note?.trim() || null,
          totalQty: cluster.reduce((sum, item) => sum + item.qty, 0),
          oldestAt: first.createdAt,
          items: cluster,
        });
      }
      cluster = [];
    };
    for (const item of sorted) {
      if (
        cluster.length &&
        windowMs > 0 &&
        new Date(item.createdAt).getTime() - new Date(cluster[0].createdAt).getTime() > windowMs
      ) {
        flush();
      }
      cluster.push(item);
    }
    flush();
  }

  return suggestions.sort(
    (a, b) => new Date(a.oldestAt).getTime() - new Date(b.oldestAt).getTime(),
  );
}

/** Coverage allocation batch (BR-06): complete hanya bila semua porsi ter-allocate. */
export function allocationCoverage(
  allocations: Array<{ qty: number; allocated: boolean }>,
  totalQty: number,
) {
  const allocatedQty = allocations
    .filter((row) => row.allocated)
    .reduce((sum, row) => sum + row.qty, 0);
  return {
    allocatedQty,
    unallocatedQty: Math.max(0, totalQty - allocatedQty),
    complete: allocatedQty === totalQty && totalQty > 0,
  };
}

/** Identitas tampil: nama customer, fallback nomor antrian (BR-02). */
export function productionIdentityName(
  customerName: string | null | undefined,
  queueNo?: number | null,
) {
  const name = customerName?.trim();
  if (name && name !== "Guest Customer") return name;
  return queueNo ? `Antrian #${queueNo}` : "Tamu";
}
