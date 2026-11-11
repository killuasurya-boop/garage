// =============================================================================
// Katalog awal Smart Partner Hub — PRD V1.0 bagian 05 "Master Data Awal dan Harga Resmi Rancangan".
// Angka diambil apa adanya dari PRD (rupiah per unit/porsi). Diimpor sebagai mitra DRAFT dan produk NONAKTIF:
// tidak bisa dijual sampai Owner melengkapi syarat aktivasi dan menyetujui tiap produk (PRD 05.3).
// Dimsum: identitas & kontrak mitra belum dikonfirmasi; HPP perlu dicek ulang bersama supplier (PRD 05.2).
// =============================================================================

export type CatalogProduct = { code: string; name: string; unitCost: number; sellPrice: number };
export type CatalogPartner = {
  code: string;
  name: string;
  category: string;
  productKind: string;
  phone: string | null;
  address: string | null;
  payoutSchedule: string | null;
  lastOrderByDay: Record<string, string | null>;
  terms: string;
  products: CatalogProduct[];
};

const SUN_TO_FRI_2145_SAT_2245 = { "0": "21:45", "1": "21:45", "2": "21:45", "3": "21:45", "4": "21:45", "5": "21:45", "6": "22:45" };

export const PRD_PARTNER_CATALOG: CatalogPartner[] = [
  {
    code: "PAU",
    name: "Es Krim Pokat Au",
    category: "Es Krim",
    productKind: "Es krim & alpukat",
    phone: "085139649855",
    address: "Jl. Veteran No. 34, Tebing Tinggi",
    payoutSchedule: "Transfer setelah tutup operasional, setelah rekonsiliasi",
    lastOrderByDay: SUN_TO_FRI_2145_SAT_2245,
    terms: "Data awal PRD 05.1: HPP sesuai kesepakatan dengan mitra. Periksa ulang sebelum aktivasi.",
    products: [
      { code: "PAU-001", name: "Es Krim Only", unitCost: 19_000, sellPrice: 22_000 },
      { code: "PAU-002", name: "Es Krim Pokat", unitCost: 19_000, sellPrice: 22_000 },
      { code: "PAU-003", name: "Pokat Only", unitCost: 25_000, sellPrice: 30_000 },
      { code: "PAU-004", name: "Extra Double Pokat", unitCost: 25_000, sellPrice: 30_000 },
    ],
  },
  {
    code: "DSM",
    name: "Mitra Dimsum (nama belum ditetapkan)",
    category: "Dimsum",
    productKind: "Dimsum & gorengan",
    phone: null,
    address: null,
    payoutSchedule: null,
    lastOrderByDay: {},
    terms:
      "Data awal PRD 05.2: harga jual = HPP + Rp3.000. Identitas, kontrak, dan HPP WAJIB dikonfirmasi dengan mitra sebelum aktivasi. Ejaan \"Pancake isi lapan\" perlu dikonfirmasi.",
    products: [
      { code: "DSM-001", name: "Dimsum Ayam", unitCost: 22_000, sellPrice: 25_000 },
      { code: "DSM-002", name: "Dimsum Udang", unitCost: 22_000, sellPrice: 25_000 },
      { code: "DSM-003", name: "Dimsum Kepiting", unitCost: 22_000, sellPrice: 25_000 },
      { code: "DSM-004", name: "Dimsum Rumput Laut", unitCost: 22_000, sellPrice: 25_000 },
      { code: "DSM-005", name: "Dimsum Mix", unitCost: 24_000, sellPrice: 27_000 },
      { code: "DSM-006", name: "Dimsum Mentai", unitCost: 24_000, sellPrice: 27_000 },
      { code: "DSM-007", name: "Lumpia Udang", unitCost: 22_000, sellPrice: 25_000 },
      { code: "DSM-008", name: "Kulit Tahu", unitCost: 22_000, sellPrice: 25_000 },
      { code: "DSM-009", name: "Pempek Kapal Selam", unitCost: 25_000, sellPrice: 28_000 },
      { code: "DSM-010", name: "Pempek Mix", unitCost: 25_000, sellPrice: 28_000 },
      { code: "DSM-011", name: "Cireng", unitCost: 15_000, sellPrice: 18_000 },
      { code: "DSM-012", name: "Udang Keju", unitCost: 22_000, sellPrice: 25_000 },
      { code: "DSM-013", name: "Risol Mix", unitCost: 15_000, sellPrice: 18_000 },
      { code: "DSM-014", name: "Bola Udang", unitCost: 22_000, sellPrice: 25_000 },
      { code: "DSM-015", name: "Tahu Walik", unitCost: 15_000, sellPrice: 18_000 },
      { code: "DSM-016", name: "Pancake isi lapan", unitCost: 15_000, sellPrice: 18_000 },
      { code: "DSM-017", name: "Pancake Roll", unitCost: 20_000, sellPrice: 23_000 },
      { code: "DSM-018", name: "Crumble Ayam Keju", unitCost: 22_000, sellPrice: 25_000 },
      { code: "DSM-019", name: "Telur Gulung", unitCost: 12_000, sellPrice: 15_000 },
      { code: "DSM-020", name: "Pangsit Goreng", unitCost: 22_000, sellPrice: 25_000 },
    ],
  },
];

/** Ringkasan untuk ditampilkan sebelum impor (dicek tes terhadap simulasi PRD 05.2). */
export function catalogTotals(partner: CatalogPartner) {
  const cost = partner.products.reduce((sum, p) => sum + p.unitCost, 0);
  const sell = partner.products.reduce((sum, p) => sum + p.sellPrice, 0);
  return { count: partner.products.length, cost, sell, margin: sell - cost };
}
