import { freshClosingChecklist } from "@/lib/cash-closing";
import {
  Bike,
  Activity,
  BadgeCheck,
  BarChart3,
  BellRing,
  BookOpen,
  Boxes,
  ChefHat,
  ClipboardCheck,
  Coffee,
  CreditCard,
  Gauge,
  Radar,
  History,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Mic,
  Monitor,
  FileStack,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
  WalletCards,
  PartyPopper,
} from "lucide-react";

export type Role = "Owner" | "Manajer" | "Kasir" | "Waiter";

export type ModuleId =
  | "dashboard"
  | "ops-center"
  | "events"
  | "courier"
  | "pos"
  | "ai-agent"
  | "kitchen"
  | "waiter"
  | "produk"
  | "inventory"
  | "finance"
  | "crm"
  | "membership"
  | "marketing"
  | "approvals"
  | "website"
  | "company-control"
  | "earnings"
  | "audit"
  | "chat"
  | "smart-notif"
  | "team-management"
  | "settings"
  | "training"
  | "recruitment"
  | "absensi-v2"
  | "wallet-gaji"
  | "wallet-fee"
  | "payroll-owner";

// "Minuman Botol" & "Rokok" (owner, Okt 2026): produk jadi, diserahkan langsung kasir —
// tidak membuat tiket Bar/Dapur (lihat isDirectHandoverMenu).
// Kategori kini dinamis (tabel product_categories, Okt 2026): nama bawaan di bawah
// hanya untuk autocomplete/seed; kategori baru buatan owner juga valid.
export type BuiltInMenuCategory = "Makanan" | "Cemilan" | "Coffee" | "Non-Coffee" | "Minuman Botol" | "Rokok";
export type MenuCategory = BuiltInMenuCategory | (string & {});
export type MenuGroupName = "Dapur" | "Bar" | "Lainnya";

export type GarageMenuItem = {
  id: string;
  sku?: string;
  name: string;
  category: MenuCategory;
  categoryId?: string;
  // Kelompok POS (Dapur/Bar/Lainnya) dari master kategori.
  menuGroup?: MenuGroupName;
  categorySortOrder?: number;
  productType?: "menu" | "retail" | "bundle";
  brand?: string;
  barcode?: string;
  section: string;
  variants: Array<{
    id: string;
    label: string;
    price: number;
    baseCost?: number;
    sku?: string;
    barcode?: string;
    sellUnit?: string;
    unitContents?: number;
  }>;
  stock: "ready" | "limited" | "sold_out";
  status?: "active" | "archived";
  prep: string;
  tags: string[];
  imageUrl?: string;
  // Deskripsi singkat untuk menu digital (opsional).
  description?: string;
  promoActive?: boolean;
  promoPrice?: number;
  // Production Hub: override station (null = otomatis dari kategori).
  station?: "bar" | "dapur" | "none" | null;
  batchEligible?: boolean;
  // Menu digital: false = disembunyikan dari QR order; featured = banner unggulan.
  showInDigitalMenu?: boolean;
  featured?: boolean;
  recipeCost?: number;
  recipes?: Array<{
    variantId: string;
    inventorySku: string;
    inventoryName?: string;
    qty: number;
    unit: string;
    wastePct: number;
    unitCost?: number;
    lineCost?: number;
  }>;
};

export const roles: Role[] = ["Owner", "Manajer", "Kasir", "Waiter"];

export const roleNotes: Record<Role, string> = {
  Owner: "Dashboard penuh, approval akhir, kontrol sistem, dan semua laporan",
  Manajer:
    "Akses operasional setara Owner — POS, KDS, inventory, finance, approval, payroll — kecuali kelola akun Owner dan setting sistem inti",
  Kasir: "POS transaksi, KDS dapur/bar, stok gudang, payment, dan membership lookup",
  Waiter: "Order meja, table service, antar pesanan, dan handoff ke kasir",
};

export const modules = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Owner command center",
    icon: LayoutDashboard,
  },
  {
    id: "ops-center",
    label: "Control Center",
    description: "Operasional real-time",
    icon: Radar,
  },
  {
    id: "events",
    label: "Undangan Digital",
    description: "Grand Opening, tamu & RSVP",
    icon: PartyPopper,
  },
  { id: "pos", label: "POS", description: "Tablet cashier", icon: ShoppingCart },
  {
    id: "ai-agent",
    label: "GARAGE AI",
    description: "Operating intelligence",
    icon: Sparkles,
  },
  { id: "kitchen", label: "Production", description: "Bar & Dapur", icon: ChefHat },
  { id: "courier", label: "Kurir", description: "Antar pesanan delivery", icon: Bike },
  {
    id: "waiter",
    label: "Waiter",
    description: "Meja & pesanan",
    icon: BellRing,
  },
  { id: "produk", label: "Produk", description: "Menu & harga jual", icon: Coffee },
  { id: "inventory", label: "Warehouse", description: "Gudang bahan baku (WMS)", icon: Boxes },
  { id: "finance", label: "Finance", description: "Cash closing", icon: CreditCard },
  { id: "crm", label: "CRM", description: "Members", icon: Users },
  {
    id: "membership",
    label: "Membership",
    description: "Premium card vault",
    icon: WalletCards,
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Campaign engine",
    icon: Megaphone,
  },
  {
    id: "approvals",
    label: "Approvals",
    description: "Risk gate",
    icon: ClipboardCheck,
  },
  { id: "website", label: "Website", description: "Landing hero", icon: Monitor },
  {
    id: "company-control",
    label: "CEO Control",
    description: "Owner vault",
    icon: FileStack,
  },
  {
    id: "earnings",
    label: "Fee Saya",
    description: "Saldo fee & payout",
    icon: Wallet,
  },
  { id: "audit", label: "Audit", description: "Immutable log", icon: History },
  {
    id: "smart-notif",
    label: "Smart Notif",
    description: "Voice & trigger center",
    icon: Mic,
  },
  { id: "chat", label: "Chat Internal", description: "Komunikasi tim", icon: MessageCircle },
  {
    id: "settings",
    label: "Pengaturan",
    description: "Konfigurasi outlet & sistem",
    icon: Settings,
  },
  {
    id: "team-management",
    label: "Manajemen Tim",
    description: "HR, SOP & Shift",
    icon: Users,
  },
  {
    id: "training",
    label: "Buku Pintar",
    description: "Tutorial & SOP Karyawan",
    icon: BookOpen,
  },
  {
    id: "recruitment",
    label: "Recruitment",
    description: "Open hiring & kandidat",
    icon: UserPlus,
  },
  // --- Payroll V2 modules ---
  {
    id: "absensi-v2",
    label: "Absensi",
    description: "PIN + Selfie + GPS",
    icon: ClipboardCheck,
  },
  {
    id: "wallet-gaji",
    label: "Wallet Gaji",
    description: "Saldo upah harian",
    icon: Wallet,
  },
  {
    id: "wallet-fee",
    label: "Wallet Fee",
    description: "Pool Rp 200/produk",
    icon: Wallet,
  },
  {
    id: "payroll-owner",
    label: "Payroll",
    description: "Dashboard + settings + payout",
    icon: FileStack,
  },
] satisfies Array<{
  id: ModuleId;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}>;

export const headlineMetrics = [
  {
    label: "Revenue hari ini",
    value: "Rp 18,72 jt",
    delta: "+12.4%",
    tone: "good",
    icon: BarChart3,
  },
  {
    label: "Selisih kas",
    value: "Rp 18 rb",
    delta: "0.096%",
    tone: "watch",
    icon: Gauge,
  },
  {
    label: "Order aktif",
    value: "42",
    delta: "7 terlambat",
    tone: "warn",
    icon: Activity,
  },
  {
    label: "Approval pending",
    value: "9",
    delta: "3 finansial",
    tone: "risk",
    icon: ShieldAlert,
  },
] as const;

export const salesTrend = [
  { hour: "08", sales: 1.2 },
  { hour: "09", sales: 2.4 },
  { hour: "10", sales: 4.1 },
  { hour: "11", sales: 7.8 },
  { hour: "12", sales: 10.6 },
  { hour: "13", sales: 8.9 },
  { hour: "14", sales: 6.1 },
  { hour: "15", sales: 7.4 },
  { hour: "16", sales: 9.2 },
  { hour: "17", sales: 12.4 },
  { hour: "18", sales: 14.8 },
  { hour: "19", sales: 16.2 },
];

export const operationalSignals = [
  { label: "Kitchen SLA", value: "91%", status: "4 order melewati 12 menit" },
  { label: "Stock accuracy", value: "99.1%", status: "2 item butuh opname" },
  { label: "Offline queue", value: "0", status: "Auto sync standby" },
  { label: "Fraud alerts", value: "3", status: "Void berulang di shift sore" },
];

// Bahan bar dari "HPP BAR.xlsx" + "NON COFFEE.xlsx" (sheet Bahan Baku, owner Sep
// 2026) — satuan ml/gr/pcs, isi per kemasan (Qty), Harga Beli & Harga HPP sheet.
// Keputusan owner: HPP bahan = HARGA BELI ASLI ÷ isi kemasan (bukan kolom Harga HPP
// yang sudah ditambah buffer). Ongkir dicatat sebagai biaya tambahan saat barang
// masuk; susut lewat % susut di resep. Harga HPP sheet disimpan sebagai referensi
// dan hanya dipakai bila harga beli kosong (Biang Teh diseduh sendiri).
// [sku, nama, nama alternatif, kategori, satuan, qty per kemasan, kemasan, harga beli, harga HPP sheet]
const barIngredientSource = [
  ["BAR-001", "Drip Strawberry", "Sirup Drip strawberry", "Bar · Syrup & Sauce", "ml", 760, "botol", 110000, 115000],
  ["BAR-002", "Drip Caramel", "Sirup Drip caramel", "Bar · Syrup & Sauce", "ml", 760, "botol", 110000, 115000],
  ["BAR-003", "Drip Lychee", "Sirup Drip leci", "Bar · Syrup & Sauce", "ml", 760, "botol", 110000, 115000],
  ["BAR-004", "Drip Lemon", "Sirup Drip lemon", "Bar · Syrup & Sauce", "ml", 760, "botol", 110000, 115000],
  ["BAR-005", "Drip Vanilla", "Sirup Drip vanila", "Bar · Syrup & Sauce", "ml", 760, "botol", 110000, 115000],
  ["BAR-006", "Drip Strawberry Jam", "Selai stroberi Drip", "Bar · Syrup & Sauce", "ml", 760, "botol", 110000, 115000],
  ["BAR-007", "Delifru Peach", "Sirup Delifru peach", "Bar · Syrup & Sauce", "ml", 1000, "botol", 110000, 115000],
  ["BAR-008", "Delifru Butterscotch", "Sirup Delifru butterscotch", "Bar · Syrup & Sauce", "ml", 1000, "botol", 110000, 115000],
  ["BAR-009", "Delifru Aren", "Sirup Delifru gula aren / palm sugar", "Bar · Syrup & Sauce", "ml", 1000, "botol", 110000, 115000],
  ["BAR-010", "Delifru Hazelnut", "Sirup Delifru hazelnut", "Bar · Syrup & Sauce", "ml", 1000, "botol", 110000, 115000],
  ["BAR-011", "Delifru Strawberry", "Sirup Delifru strawberry", "Bar · Syrup & Sauce", "ml", 1000, "botol", 110000, 115000],
  ["BAR-012", "Drip Powder Red Velvet", "Bubuk red velvet Drip", "Bar · Powder & Topping", "gr", 760, "pack", 145000, 150000],
  ["BAR-013", "Drip Powder Matcha", "Bubuk matcha Drip", "Bar · Powder & Topping", "gr", 760, "pack", 215000, 220000],
  // Owner: harga dasar powder coklat = Rp220.000 (angka 145.000 di kolom beli keliru).
  ["BAR-014", "Drip Powder Coklat", "Bubuk cokelat Drip", "Bar · Powder & Topping", "gr", 760, "pack", 220000, 220000],
  ["BAR-015", "Denali Powder Taro", "Bubuk taro Denali", "Bar · Powder & Topping", "gr", 800, "pack", 100000, 105000],
  ["BAR-016", "Multibev Creamer", "Krimer bubuk Multibev", "Bar · Susu & Krimer", "gr", 1000, "pack", 60000, 65000],
  ["BAR-017", "Gula", "Gula cair / simple syrup", "Bar · Syrup & Sauce", "ml", 600, "botol", 11000, 11000],
  // Owner: 1 dus = 24 pcs × 946 ml = 22.704 ml, harga beli Rp276.500/dus
  // (Harga HPP sheet Rp23.800/1000 ml tidak dipakai → 0).
  ["BAR-018", "Fresh Milk", "Susu segar / UHT (dus 24 × 946 ml)", "Bar · Susu & Krimer", "ml", 22704, "dus", 276500, 0],
  ["BAR-019", "Madu TJ", "Madu Tresno Joyo", "Bar · Syrup & Sauce", "gr", 500, "botol", 50000, 55000],
  ["BAR-020", "Diamond Juice Cranberry", "Jus cranberry Diamond", "Bar · Jus & Buah", "gr", 946, "botol", 46000, 50000],
  ["BAR-021", "Gold Label", "Krimer kental manis Gold Label (GL)", "Bar · Susu & Krimer", "gr", 901, "kaleng", 58000, 62000],
  ["BAR-022", "Biscoff", "Biskuit Lotus Biscoff", "Bar · Powder & Topping", "pcs", 32, "pack", 53000, 55000],
  ["BAR-023", "Jungle Juice", "Jus Jungle Juice", "Bar · Jus & Buah", "ml", 1000, "botol", 32000, 37000],
  ["BAR-024", "Skippy", "Selai kacang Skippy", "Bar · Powder & Topping", "gr", 340, "toples", 47000, 52000],
  ["BAR-025", "Davinci Sauce Caramel", "Saus karamel Davinci", "Bar · Syrup & Sauce", "ml", 2000, "botol", 269000, 274000],
  ["BAR-026", "Dairy Champ", "Susu kental manis (SKM) Dairy Champ", "Bar · Susu & Krimer", "gr", 1000, "kaleng", 25000, 30000],
  ["BAR-027", "Espresso Blend", "Biji kopi espresso blend (beans HB)", "Bar · Kopi", "gr", 1000, "pack", 180000, 185000],
  ["BAR-028", "Espresso Full", "Biji kopi espresso full (beans full)", "Bar · Kopi", "gr", 1000, "pack", 185000, 190000],
  ["BAR-029", "Prendjak Teh", "Teh celup Prendjak", "Bar · Powder & Topping", "pcs", 25, "box", 6500, 10000],
  ["BAR-030", "Sedotan", "Sedotan minuman bar", "Bar · Kemasan", "pcs", 150, "pack", 30000, 33000],
  ["BAR-031", "Cup", "Cup minuman bar", "Bar · Kemasan", "pcs", 50, "pack", 22000, 25000],
  // Owner: 1 karung (Rp20.000) = es untuk 50 cup minuman coffee / non-coffee.
  ["BAR-032", "Es Batu", "Es batu — 1 karung untuk 50 cup", "Bar · Es Batu", "cup", 50, "karung", 20000, 20000],
  ["BAR-033", "Buavita Cranberry", "Jus Buavita cranberry", "Bar · Jus & Buah", "ml", 245, "kotak", 12000, 12000],
  ["BAR-034", "Buavita Jeruk", "Jus Buavita jeruk", "Bar · Jus & Buah", "ml", 245, "kotak", 12000, 12000],
  // Owner Okt 2026: biang teh Prendjak dibeli jadi, 1 kotak = 1000 ml (Rp3/ml → Rp3.000/kotak;
  // ubah harga beli di Inventory bila berbeda). Es Teh 250 ml → 1 kotak = 4 porsi.
  ["BAR-035", "Biang Teh Prendjak", "Biang teh Prendjak (kotak 1000 ml)", "Bar · Powder & Topping", "ml", 1000, "kotak", 3000, 3000],
  ["BAR-036", "Longan Sunlee", "Buah longan kaleng Sunlee", "Bar · Jus & Buah", "pcs", 43, "kaleng", 31000, 35000],
] as const;

// Label kemasan yang lebih jelas dibaca staf saat opname / barang masuk.
const packageLabelOverride: Partial<Record<(typeof barIngredientSource)[number][0], string>> = {
  "BAR-018": "dus 24 × 946 ml",
};

export const inventoryItems = barIngredientSource.map(
  ([sku, name, alternativeName, category, unit, packQty, packName, buyPrice, sheetHppPrice]) => ({
    sku,
    name,
    alternativeName,
    category,
    usageArea: "bar" as const,
    unit,
    packageSize: packageLabelOverride[sku] ?? `${packName} ${packQty} ${unit}`,
    // Harga beli per kemasan + isi kemasan → HPP per satuan (dapat diubah di Inventory).
    purchasePrice: buyPrice > 0 ? buyPrice : sheetHppPrice,
    packageQty: packQty,
    unitCost: Math.round(((buyPrice > 0 ? buyPrice : sheetHppPrice) / packQty) * 10_000) / 10_000,
    onHand: 0,
    // Stok minimum awal = 1 kemasan (bisa diubah owner di Gudang).
    min: packQty,
    status: "low",
    movement: "",
  }),
);

type BarLine = readonly [sku: (typeof barIngredientSource)[number][0], qty: number];

const barIngredientBySku = new Map(inventoryItems.map((item) => [item.sku, item]));
// Es batu + cup + sedotan: pelengkap standar minuman dingin di sheet HPP.
const ICED_PACK: BarLine[] = [["BAR-032", 1], ["BAR-031", 1], ["BAR-030", 1]];
// Minuman panas di sheet HPP: cup + sedotan, tanpa es.
const HOT_PACK: BarLine[] = [["BAR-031", 1], ["BAR-030", 1]];

// Harga jual = kolom HARGA JUAL sheet HHP dibulatkan ke Rp500 terdekat; Caramel
// Macchiato, Mocca Peanut, Biscoff dinaikkan atas permintaan owner (Sep 2026).
// HPP TIDAK ditulis di sini: dihitung live di DB = Σ(qty resep × HPP bahan terkini)
// oleh syncRecipeBaseCosts (src/lib/menu-recipe-cost.ts) — sama dengan TOTAL BASIC
// COST sheet (tanpa OPS & OVERHEAD 40%). Qty resep = kolom ML/GR sheet.
function barDrink(
  id: string,
  name: string,
  section: string,
  variants: Array<{ id: "cold" | "hot"; price: number; lines: BarLine[] }>,
  category: "Coffee" | "Non-Coffee" = "Coffee",
): GarageMenuItem {
  const single = variants.length === 1;
  return {
    id,
    name,
    category,
    section,
    variants: variants.map((variant) => ({
      id: variant.id,
      label: variant.id === "hot" ? "Hot" : "Cold",
      price: variant.price,
    })),
    stock: "ready",
    prep: "4m",
    tags: [category],
    recipes: variants.flatMap((variant) =>
      variant.lines.map(([sku, qty]) => ({
        variantId: single ? "all" : variant.id,
        inventorySku: sku,
        qty,
        unit: barIngredientBySku.get(sku)?.unit ?? "pcs",
        wastePct: 0,
      })),
    ),
  };
}

const barMenuItems: GarageMenuItem[] = [
  barDrink("bar-butterscotch-sea-salt", "Butterscotch Sea Salt", "Kopi Susu", [
    { id: "cold", price: 28000, lines: [["BAR-002", 18], ["BAR-021", 40], ["BAR-018", 90], ["BAR-008", 5], ["BAR-027", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-caramel-macchiato", "Caramel Macchiato", "Kopi Susu", [
    { id: "cold", price: 28000, lines: [["BAR-005", 10], ["BAR-002", 10], ["BAR-021", 40], ["BAR-018", 90], ["BAR-025", 10], ["BAR-027", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-spanish-latte", "Spanish Latte", "Kopi Susu", [
    { id: "cold", price: 26000, lines: [["BAR-026", 30], ["BAR-018", 100], ["BAR-027", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-gula-aren", "Gula Aren", "Kopi Susu", [
    { id: "cold", price: 23000, lines: [["BAR-009", 15], ["BAR-018", 60], ["BAR-016", 10], ["BAR-021", 20], ["BAR-027", 18], ...ICED_PACK] },
    { id: "hot", price: 23000, lines: [["BAR-009", 15], ["BAR-018", 60], ["BAR-016", 10], ["BAR-021", 20], ["BAR-027", 18], ...HOT_PACK] },
  ]),
  barDrink("bar-creamy-nutty", "Creamy Nutty", "Kopi Susu", [
    { id: "cold", price: 28000, lines: [["BAR-024", 15], ["BAR-021", 40], ["BAR-018", 90], ["BAR-010", 18], ["BAR-027", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-coffee-latte", "Coffee Latte", "Kopi Susu", [
    { id: "cold", price: 20000, lines: [["BAR-018", 120], ["BAR-028", 18], ...ICED_PACK] },
    { id: "hot", price: 18000, lines: [["BAR-018", 200], ["BAR-028", 18], ...HOT_PACK] },
  ]),
  barDrink("bar-cappuccino", "Cappuccino", "Kopi Susu", [
    { id: "cold", price: 25000, lines: [["BAR-028", 18], ["BAR-018", 90], ["BAR-021", 40], ...ICED_PACK] },
    { id: "hot", price: 23000, lines: [["BAR-018", 200], ["BAR-028", 18], ...HOT_PACK] },
  ]),
  barDrink("bar-dirty-latte", "Dirty Latte", "Kopi Susu", [
    { id: "cold", price: 25000, lines: [["BAR-018", 90], ["BAR-021", 30], ["BAR-027", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-mont-blanc", "Mont Blanc", "Kopi Susu", [
    { id: "cold", price: 23000, lines: [["BAR-033", 70], ["BAR-021", 20], ["BAR-018", 10], ["BAR-005", 5], ["BAR-028", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-sanger", "Sanger", "Kopi Susu", [
    { id: "cold", price: 16000, lines: [["BAR-026", 25], ["BAR-016", 10], ["BAR-027", 16], ...ICED_PACK] },
    { id: "hot", price: 15000, lines: [["BAR-026", 25], ["BAR-016", 10], ["BAR-027", 16], ...HOT_PACK] },
  ]),
  barDrink("bar-biscoff", "Biscoff", "Kopi Susu", [
    { id: "cold", price: 31000, lines: [["BAR-022", 2], ["BAR-021", 40], ["BAR-018", 90], ["BAR-016", 10], ["BAR-025", 15], ["BAR-027", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-hazelnut-latte", "Hazelnut Latte", "Kopi Susu", [
    { id: "cold", price: 23000, lines: [["BAR-010", 20], ["BAR-021", 20], ["BAR-018", 90], ["BAR-027", 18], ...ICED_PACK] },
    { id: "hot", price: 23000, lines: [["BAR-010", 20], ["BAR-021", 20], ["BAR-018", 90], ["BAR-027", 18], ...HOT_PACK] },
  ]),
  barDrink("bar-vanilla-latte", "Vanilla Latte", "Kopi Susu", [
    { id: "cold", price: 23000, lines: [["BAR-005", 20], ["BAR-021", 20], ["BAR-018", 90], ["BAR-027", 18], ...ICED_PACK] },
    { id: "hot", price: 23000, lines: [["BAR-005", 20], ["BAR-021", 20], ["BAR-018", 90], ["BAR-027", 18], ...HOT_PACK] },
  ]),
  barDrink("bar-mocca-peanut", "Mocca Peanut", "Kopi Susu", [
    { id: "cold", price: 30000, lines: [["BAR-014", 20], ["BAR-010", 20], ["BAR-018", 100], ["BAR-027", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-americano-peach", "Americano Peach", "Americano", [
    { id: "cold", price: 23000, lines: [["BAR-023", 50], ["BAR-007", 18], ["BAR-028", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-americano-berry", "Americano Berry", "Americano", [
    { id: "cold", price: 23000, lines: [["BAR-011", 18], ["BAR-017", 10], ["BAR-028", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-americano-cranberry", "Americano Cranberry", "Americano", [
    { id: "cold", price: 23000, lines: [["BAR-005", 10], ["BAR-020", 50], ["BAR-028", 18], ["BAR-011", 5], ["BAR-021", 30], ...ICED_PACK] },
  ]),
  barDrink("bar-americano-pongah", "Americano Pongah", "Americano", [
    { id: "cold", price: 23000, lines: [["BAR-019", 15], ["BAR-006", 15], ["BAR-028", 18], ...ICED_PACK] },
  ]),
  barDrink("bar-americano", "Americano", "Americano", [
    { id: "cold", price: 15000, lines: [["BAR-028", 18], ...ICED_PACK] },
    { id: "hot", price: 15000, lines: [["BAR-028", 18], ...HOT_PACK] },
  ]),
  // --- Non-Coffee ("NON COFFEE.xlsx", sheet HHP bagian NON COFFEE) ---
  barDrink("bar-matcha", "Matcha", "Milk Series", [
    { id: "cold", price: 22000, lines: [["BAR-013", 20], ["BAR-018", 100], ...ICED_PACK] },
    { id: "hot", price: 20000, lines: [["BAR-013", 20], ["BAR-018", 100], ...HOT_PACK] },
  ], "Non-Coffee"),
  // Sheet Coklat belum berharga (POWDER/UHT tanpa referensi); disusun sama dengan
  // Matcha di sebelahnya: Drip Powder Coklat 20 gr + Fresh Milk 100 ml.
  barDrink("bar-coklat", "Coklat", "Milk Series", [
    { id: "cold", price: 22000, lines: [["BAR-014", 20], ["BAR-018", 100], ...ICED_PACK] },
    { id: "hot", price: 20000, lines: [["BAR-014", 20], ["BAR-018", 100], ...HOT_PACK] },
  ], "Non-Coffee"),
  barDrink("bar-strawberry-milk", "Strawberry Milk", "Milk Series", [
    { id: "cold", price: 20000, lines: [["BAR-011", 15], ["BAR-021", 20], ["BAR-018", 80], ["BAR-006", 10], ...ICED_PACK] },
  ], "Non-Coffee"),
  barDrink("bar-choco-cloud", "Choco Cloud", "Milk Series", [
    { id: "cold", price: 26000, lines: [["BAR-014", 20], ["BAR-018", 100], ["BAR-021", 30], ...ICED_PACK] },
  ], "Non-Coffee"),
  barDrink("bar-matcha-strawberry", "Matcha Strawberry", "Milk Series", [
    { id: "cold", price: 25000, lines: [["BAR-011", 15], ["BAR-006", 15], ["BAR-013", 20], ["BAR-018", 100], ...ICED_PACK] },
  ], "Non-Coffee"),
  barDrink("bar-matcha-butterscotch", "Matcha Butterscotch", "Milk Series", [
    { id: "cold", price: 26000, lines: [["BAR-013", 20], ["BAR-018", 100], ["BAR-021", 30], ["BAR-008", 18], ...ICED_PACK] },
  ], "Non-Coffee"),
  barDrink("bar-lychee-tea", "Lychee Tea", "Tea Series", [
    { id: "cold", price: 15000, lines: [["BAR-003", 20], ["BAR-035", 100], ["BAR-036", 1], ...ICED_PACK] },
  ], "Non-Coffee"),
  // Sheet menulis "POWDER" tapi merujuk Drip Lemon (sirup, ml).
  barDrink("bar-lemon-tea", "Lemon Tea", "Tea Series", [
    { id: "cold", price: 15000, lines: [["BAR-004", 25], ["BAR-035", 30], ...ICED_PACK] },
    { id: "hot", price: 15000, lines: [["BAR-004", 25], ["BAR-035", 30], ...HOT_PACK] },
  ], "Non-Coffee"),
  barDrink("bar-peach-tea", "Peach Tea", "Tea Series", [
    { id: "cold", price: 15000, lines: [["BAR-007", 20], ["BAR-035", 100], ["BAR-017", 15], ...ICED_PACK] },
    { id: "hot", price: 15000, lines: [["BAR-007", 20], ["BAR-035", 100], ["BAR-017", 15], ...HOT_PACK] },
  ], "Non-Coffee"),
  barDrink("bar-ice-tea", "Ice Tea", "Tea Series", [
    { id: "cold", price: 8000, lines: [["BAR-017", 20], ["BAR-035", 130], ...ICED_PACK] },
    { id: "hot", price: 8000, lines: [["BAR-017", 20], ["BAR-035", 130], ...HOT_PACK] },
  ], "Non-Coffee"),
  // Menu Event GARAGE (owner, Okt 2026): belum ada resep → HPP 0 sampai resep diisi.
  barDrink("bar-red-velvet", "Red Velvet", "Milk Series", [
    { id: "cold", price: 22000, lines: [] },
    { id: "hot", price: 20000, lines: [] },
  ], "Non-Coffee"),
  barDrink("bar-taro", "Taro", "Milk Series", [
    { id: "cold", price: 22000, lines: [] },
    { id: "hot", price: 20000, lines: [] },
  ], "Non-Coffee"),
  barDrink("bar-tea-pahit", "Tea Pahit", "Tea Series", [
    { id: "cold", price: 8000, lines: [] },
    { id: "hot", price: 8000, lines: [] },
  ], "Non-Coffee"),
  barDrink("bar-strawberry-tea", "Strawberry Tea", "Tea Series", [
    { id: "cold", price: 15000, lines: [] },
    { id: "hot", price: 8000, lines: [] },
  ], "Non-Coffee"),
];

// Menu aktif (owner, Sep 2026): 10 produk makanan & cemilan + 19 minuman bar.
// HPP selalu dari bahan baku resep (bukan patokan persen): makanan/cemilan HPP 0
// sampai owner mengisi resepnya; minuman bar dari resep "HPP BAR.xlsx".
const MENU_PHOTO_IDS = new Set([
  "bar-biscoff",
  "bar-butterscotch-sea-salt",
  "bar-cappuccino",
  "bar-caramel-macchiato",
  "bar-choco-cloud",
  "bar-coffee-latte",
  "bar-coklat",
  "bar-creamy-nutty",
  "bar-dirty-latte",
  "bar-gula-aren",
  "bar-hazelnut-latte",
  "bar-ice-tea",
  "bar-lemon-tea",
  "bar-lychee-tea",
  "bar-matcha",
  "bar-matcha-butterscotch",
  "bar-matcha-strawberry",
  "bar-mocca-peanut",
  "bar-mont-blanc",
  "bar-peach-tea",
  "bar-sanger",
  "bar-spanish-latte",
  "bar-strawberry-milk",
  "bar-vanilla-latte",
  "cemilan-kentang-balado",
  "cemilan-kentang-ori",
  "cemilan-mix-plater",
  "cemilan-nugget",
  "cemilan-sosis",
  "makanan-ayam-penyet",
  "makanan-indomie-goreng",
  "makanan-indomie-kuah",
  "makanan-nasi",
  "makanan-nasi-goreng",
]);

export const menuItems: GarageMenuItem[] = ([
  {
    id: "makanan-indomie-kuah",
    name: "Indomie Kuah",
    category: "Makanan",
    section: "Indomie",
    variants: [{ id: "regular", label: "Regular", price: 12000 }],
    stock: "ready",
    prep: "8m",
    tags: ["Indomie"],
  },
  {
    id: "makanan-indomie-goreng",
    name: "Indomie Goreng",
    category: "Makanan",
    section: "Indomie",
    variants: [{ id: "regular", label: "Regular", price: 12000 }],
    stock: "ready",
    prep: "8m",
    tags: ["Indomie"],
  },
  {
    id: "makanan-nasi-goreng",
    name: "Nasi Goreng",
    category: "Makanan",
    section: "Nasi Goreng",
    variants: [{ id: "regular", label: "Regular", price: 15000 }],
    stock: "ready",
    prep: "12m",
    tags: ["Nasi goreng"],
  },
  {
    id: "makanan-ayam-penyet",
    name: "Ayam Penyet",
    category: "Makanan",
    section: "Ayam Penyet",
    variants: [{ id: "regular", label: "Regular", price: 18000 }],
    stock: "ready",
    prep: "15m",
    tags: ["Ayam"],
  },
  {
    id: "makanan-nasi",
    name: "Nasi",
    category: "Makanan",
    section: "Nasi",
    variants: [{ id: "regular", label: "Regular", price: 5000 }],
    stock: "ready",
    prep: "2m",
    tags: ["Nasi"],
  },
  {
    id: "cemilan-nugget",
    name: "Nugget",
    category: "Cemilan",
    section: "Cemilan",
    variants: [{ id: "regular", label: "Regular", price: 12000 }],
    stock: "ready",
    prep: "6m",
    tags: ["Snack"],
  },
  {
    id: "cemilan-sosis",
    name: "Sosis",
    category: "Cemilan",
    section: "Cemilan",
    variants: [{ id: "regular", label: "Regular", price: 12000 }],
    stock: "ready",
    prep: "6m",
    tags: ["Snack"],
  },
  {
    id: "cemilan-kentang-ori",
    name: "Kentang Ori",
    category: "Cemilan",
    section: "Kentang",
    variants: [{ id: "regular", label: "Regular", price: 12000 }],
    stock: "ready",
    prep: "7m",
    tags: ["Kentang"],
  },
  {
    id: "cemilan-kentang-balado",
    name: "Kentang Balado",
    category: "Cemilan",
    section: "Kentang",
    variants: [{ id: "regular", label: "Regular", price: 14000 }],
    stock: "ready",
    prep: "8m",
    tags: ["Kentang"],
  },
  {
    id: "cemilan-mix-plater",
    name: "Mix Plater",
    category: "Cemilan",
    section: "Cemilan",
    variants: [{ id: "regular", label: "Regular", price: 18000 }],
    stock: "ready",
    prep: "10m",
    tags: ["Snack"],
  },
  ...barMenuItems,
  // Minuman Bar baru (owner, 19 Okt 2026) — harga tunggal, resep/HPP menyusul.
  {
    id: "noncoffee-choco-kiss",
    name: "Choco Kiss",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "regular", label: "Regular", price: 16000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Non-Coffee"],
  },
  {
    id: "noncoffee-dark-charm",
    name: "Dark Charm",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "regular", label: "Regular", price: 15000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Non-Coffee"],
  },
  // Produk jadi (owner, 19 Okt 2026) — tanpa resep/HPP, tanpa tiket produksi.
  {
    id: "minuman-mineral",
    name: "Mineral",
    category: "Minuman Botol",
    section: "Minuman Botol",
    variants: [{ id: "regular", label: "Regular", price: 5000 }],
    stock: "ready",
    prep: "0m",
    tags: ["Minuman"],
  },
  {
    id: "rokok-apel-djarum",
    name: "Apel Djarum",
    category: "Rokok",
    section: "Rokok",
    variants: [{ id: "regular", label: "Regular", price: 18000 }],
    stock: "ready",
    prep: "0m",
    tags: ["Rokok"],
    showInDigitalMenu: false,
  },
  {
    id: "rokok-black-matcha",
    name: "Black Matcha",
    category: "Rokok",
    section: "Rokok",
    variants: [{ id: "regular", label: "Regular", price: 18000 }],
    stock: "ready",
    prep: "0m",
    tags: ["Rokok"],
    showInDigitalMenu: false,
  },
  {
    id: "rokok-la-purple",
    name: "LA Purple",
    category: "Rokok",
    section: "Rokok",
    variants: [{ id: "regular", label: "Regular", price: 37000 }],
    stock: "ready",
    prep: "0m",
    tags: ["Rokok"],
    showInDigitalMenu: false,
  },
  // Menu Event GARAGE (owner, Okt 2026).
  {
    id: "rokok-la-manggo",
    name: "LA Manggo",
    category: "Rokok",
    section: "Rokok",
    variants: [{ id: "regular", label: "Regular", price: 37000 }],
    stock: "ready",
    prep: "0m",
    tags: ["Rokok"],
    showInDigitalMenu: false,
  },
] satisfies GarageMenuItem[]).map((item): GarageMenuItem =>
  // Foto produk owner (Okt 2026) di public/menu-photos/<id>.webp.
  MENU_PHOTO_IDS.has(item.id) ? { ...item, imageUrl: `/menu-photos/${item.id}.webp` } : item,
);

export const cartSeed: { itemId: string; variantId: string; qty: number }[] = [];

export const kitchenOrders = [
  {
    id: "K-2408",
    table: "T-12",
    channel: "Dine in",
    station: "Food",
    status: "queue",
    elapsed: 5,
    items: ["Burger Spesial Komplit", "Kentang Goreng"],
    priority: "normal",
  },
  {
    id: "K-2409",
    table: "DLV-07",
    channel: "Delivery",
    station: "Packaging",
    status: "cooking",
    elapsed: 13,
    items: ["Nasi Goreng Komplit"],
    priority: "late",
  },
  {
    id: "K-2410",
    table: "T-03",
    channel: "Dine in",
    station: "Bar",
    status: "ready",
    elapsed: 8,
    items: ["Americano Cold", "Cappuccino Hot"],
    priority: "normal",
  },
  {
    id: "K-2411",
    table: "TA-18",
    channel: "Take away",
    station: "Food",
    status: "delivered",
    elapsed: 17,
    items: ["Cookies & Cream"],
    priority: "late",
  },
  {
    id: "K-2412",
    table: "T-09",
    channel: "Dine in",
    station: "Food",
    status: "cooking",
    elapsed: 9,
    items: ["Burger + Telur + Ayam", "Kebab Spesial Komplit"],
    priority: "normal",
  },
] as const;

export const stockMovements = [
  "16:12 Auto deduction: Nasi Goreng Telur paid, -beras, -telur ayam, -bumbu dasar",
  "15:48 Receiving: Kopi bubuk (espresso) +4 kg by Gudang",
  "15:21 Waste: Selada -0.4 kg, trimming prep shift sore",
  "14:52 Low stock: Nugget stick dan saus keju masuk daftar belanja",
  "14:18 Transfer request: Cup plastik + tutup cup ke counter bar",
];

export const paymentBreakdown = [
  { method: "QRIS", amount: 8620000, share: 46 },
  { method: "Cash", amount: 3240000, share: 17 },
  { method: "E-wallet", amount: 4110000, share: 22 },
  { method: "Card", amount: 2750000, share: 15 },
];

// Checklist tutup shift (lihat src/lib/cash-closing.ts).
export const closingChecklist = freshClosingChecklist();

export const customers = [
  {
    name: "Alya Putri",
    phone: "0813-9618-6251",
    tier: "Gold",
    points: 1280,
    visits: 34,
    lastOrder: "Cold Brew Garage",
    flag: "Birthday promo ready",
  },
  {
    name: "Raka Mahendra",
    phone: "0821-4408-9002",
    tier: "Silver",
    points: 640,
    visits: 18,
    lastOrder: "Signature Burger",
    flag: "Repeat buyer",
  },
  {
    name: "Nadia Sari",
    phone: "0878-2244-1031",
    tier: "Platinum",
    points: 2460,
    visits: 51,
    lastOrder: "V60",
    flag: "Voucher unused",
  },
  {
    name: "Bima Ardi",
    phone: "0852-7810-4339",
    tier: "Member",
    points: 210,
    visits: 7,
    lastOrder: "Brisket Rice",
    flag: "Winback segment",
  },
];

export const approvals = [
  {
    id: "APR-901",
    type: "Void transaksi",
    requester: "Kasir - Dita",
    requesterPhone: "081234567801",
    amount: "Rp 186.000",
    reason: "Double input table T-12",
    risk: "high",
    age: "7m",
  },
  {
    id: "APR-902",
    type: "Diskon manual",
    requester: "Supervisor - Hendra",
    requesterPhone: "081234567802",
    amount: "18%",
    reason: "Service recovery complaint",
    risk: "medium",
    age: "12m",
  },
  {
    id: "APR-903",
    type: "Stock adjustment",
    requester: "Gudang - Sinta",
    requesterPhone: "081234567803",
    amount: "-4.8 kg",
    reason: "Expired chocolate couverture",
    risk: "medium",
    age: "24m",
  },
  {
    id: "APR-904",
    type: "Refund",
    requester: "Finance - Reza",
    requesterPhone: "081234567804",
    amount: "Rp 92.000",
    reason: "Payment captured twice",
    risk: "high",
    age: "31m",
  },
];

export const auditLogs = [
  {
    time: "16:04:21",
    actor: "Dita / Kasir",
    action: "Create order POS-88021",
    object: "Table T-12",
    device: "POS-TAB-03",
    status: "recorded",
  },
  {
    time: "16:02:11",
    actor: "Hendra / Supervisor",
    action: "Request manual discount",
    object: "POS-88018",
    device: "WEB-OPS-01",
    status: "approval_required",
  },
  {
    time: "15:58:09",
    actor: "Sinta / Gudang",
    action: "Stock movement adjustment",
    object: "INV-044",
    device: "WAREHOUSE-02",
    status: "approval_required",
  },
  {
    time: "15:47:36",
    actor: "Kitchen Station",
    action: "Order marked ready",
    object: "K-2410",
    device: "KDS-BAR-01",
    status: "recorded",
  },
  {
    time: "15:39:12",
    actor: "System",
    action: "Offline sync completed",
    object: "sync_queue",
    device: "EDGE-OUTLET-A",
    status: "recorded",
  },
];

export const serviceRules = [
  { label: "Cash gap", value: "<= 0.1%", icon: BadgeCheck },
  { label: "POS SLA", value: "< 30 detik", icon: Gauge },
  { label: "Offline sync", value: "< 60 detik", icon: Activity },
];

export const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

// HPP per satuan bahan (Rp/ml, Rp/gr) sering pecahan — tampilkan s.d. 2 desimal.
export const unitCostCurrency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
