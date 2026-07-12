import {
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
} from "lucide-react";

export type Role =
  | "Owner / CEO"
  | "Admin"
  | "Manager Operasional"
  | "Finance / CFO"
  | "Kasir"
  | "Barista"
  | "Koki"
  | "Asisten Koki"
  | "Waiter 1"
  | "Waiter 2"
  | "Kitchen / Barista"
  | "Gudang"
  | "Supervisor Shift"
  | "Delivery Admin";

export type ModuleId =
  | "dashboard"
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
  | "payroll-owner"
  | "whatsapp";

export type MenuCategory = "Makanan" | "Cemilan" | "Coffee" | "Non-Coffee";

export type GarageMenuItem = {
  id: string;
  sku?: string;
  name: string;
  category: MenuCategory;
  section: string;
  variants: Array<{
    id: string;
    label: string;
    price: number;
    baseCost?: number;
  }>; 
  stock: "ready" | "limited" | "sold_out";
  status?: "active" | "archived";
  prep: string;
  tags: string[];
  imageUrl?: string;
  promoActive?: boolean;
  promoPrice?: number;
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

export const roles: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Finance / CFO",
  "Kasir",
  "Barista",
  "Koki",
  "Asisten Koki",
  "Waiter 1",
  "Waiter 2",
  "Kitchen / Barista",
  "Gudang",
  "Supervisor Shift",
  "Delivery Admin",
];

export const roleNotes: Record<Role, string> = {
  "Owner / CEO": "Dashboard penuh, approval akhir, semua laporan",
  Admin: "Kontrol operasional, POS, KDS, inventory, dan approval shift",
  "Manager Operasional": "Outlet, shift, SOP, incident, dan queue",
  "Finance / CFO": "Cash control, refund, void, expense, closing",
  Kasir: "POS transaksi, membership lookup, dan payment",
  Barista: "KDS minuman, station queue, dan status order coffee",
  Koki: "KDS makanan, station queue, dan status order kitchen",
  "Asisten Koki": "Bantu Koki: prep, plating, dan status ticket dapur",
  "Waiter 1": "Order meja, table service, dan handoff ke kasir",
  "Waiter 2": "Order meja, table service, dan handoff ke kasir",
  "Kitchen / Barista": "KDS, station queue, dan status order",
  Gudang: "Produk manajemen, stok Gudang, opname, dan reorder",
  "Supervisor Shift": "Checklist, approval operasional, handover",
  "Delivery Admin": "Delivery queue, status, dan complaint",
};

export const modules = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Owner command center",
    icon: LayoutDashboard,
  },
  { id: "pos", label: "POS", description: "Tablet cashier", icon: ShoppingCart },
  {
    id: "ai-agent",
    label: "GARAGE AI",
    description: "Operating intelligence",
    icon: Sparkles,
  },
  { id: "kitchen", label: "Kitchen", description: "Live KDS", icon: ChefHat },
  {
    id: "waiter",
    label: "Waiter",
    description: "Antar pesanan & status meja",
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

export const menuItems: GarageMenuItem[] = [
  {
    id: "snack-kentang-goreng",
    name: "Kentang Goreng",
    category: "Cemilan",
    section: "Cemilan",
    variants: [{ id: "regular", label: "Regular", price: 10000 }],
    stock: "ready",
    prep: "6m",
    tags: ["Snack", "Bestseller"],
  },
  {
    id: "snack-sosis",
    name: "Sosis",
    category: "Cemilan",
    section: "Cemilan",
    variants: [{ id: "regular", label: "Regular", price: 10000 }],
    stock: "ready",
    prep: "6m",
    tags: ["Snack"],
  },
  {
    id: "snack-nugget",
    name: "Nugget",
    category: "Cemilan",
    section: "Cemilan",
    variants: [{ id: "regular", label: "Regular", price: 10000 }],
    stock: "ready",
    prep: "6m",
    tags: ["Snack"],
  },
  {
    id: "burger-garage",
    name: "Burger Garage",
    category: "Cemilan",
    section: "Burger",
    variants: [
      { id: "telur", label: "Telur", price: 8000, baseCost: 4080 },
      { id: "telur-keju", label: "Telur Keju", price: 12000, baseCost: 4980 },
      { id: "telur-ayam", label: "Telur Ayam", price: 10000, baseCost: 9280 },
      { id: "telur-sosis", label: "Telur Sosis", price: 15000, baseCost: 6330 },
      { id: "telur-nugget", label: "Telur Nugget", price: 12000, baseCost: 6880 },
      { id: "telur-crispy", label: "Telur Crispy", price: 15000, baseCost: 9670 },
      { id: "telur-keju-crispy", label: "Telur Keju Crispy", price: 18000, baseCost: 10570 },
      { id: "spesial-komplit", label: "Spesial Komplit", price: 25000, baseCost: 15970 },
    ],
    stock: "ready",
    prep: "12m",
    tags: ["Burger", "Garage", "Bestseller"],
  },
  {
    id: "kebab-garage",
    name: "Kebab Garage",
    category: "Cemilan",
    section: "Kebab",
    variants: [
      { id: "telur", label: "Telur", price: 10000, baseCost: 8780 },
      { id: "telur-ayam", label: "Telur Ayam", price: 12000, baseCost: 12680 },
      { id: "telur-sosis", label: "Telur Sosis", price: 17000, baseCost: 11030 },
      { id: "telur-nugget", label: "Telur Nugget", price: 17000, baseCost: 12380 },
      { id: "telur-ayam-sosis", label: "Telur Ayam Sosis", price: 20000, baseCost: 14930 },
      { id: "telur-ayam-nugget", label: "Telur Ayam Nugget", price: 20000, baseCost: 16280 },
      { id: "spesial-komplit", label: "Spesial Komplit", price: 28000, baseCost: 18530 },
    ],
    stock: "ready",
    prep: "12m",
    tags: ["Kebab", "Garage", "Bestseller"],
  },
  {
    id: "burger-telur",
    name: "Burger + Telur",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 8000 }],
    stock: "ready",
    prep: "10m",
    tags: ["Burger", "Bestseller"],
  },
  {
    id: "burger-telur-ayam",
    name: "Burger + Telur + Ayam",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 10000 }],
    stock: "ready",
    prep: "10m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-ayam-sosis",
    name: "Burger + Telur + Ayam + Sosis",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 13000 }],
    stock: "ready",
    prep: "11m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-ayam-nugget-stick",
    name: "Burger + Telur + Ayam + Nugget Stick",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 13000 }],
    stock: "ready",
    prep: "11m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-ayam-sosis-nugget-stick",
    name: "Burger + Telur + Ayam + Sosis + Nugget Stick",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 16000 }],
    stock: "ready",
    prep: "12m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-sosis",
    name: "Burger + Telur + Sosis",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 15000 }],
    stock: "ready",
    prep: "11m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-sosis-nugget",
    name: "Burger + Telur + Sosis + Nugget",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 14000 }],
    stock: "ready",
    prep: "11m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-nugget",
    name: "Burger + Telur + Nugget",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 12000 }],
    stock: "ready",
    prep: "10m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-keju",
    name: "Burger + Telur + Keju",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 12000 }],
    stock: "ready",
    prep: "10m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-keju-ayam",
    name: "Burger + Telur + Keju + Ayam",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 15000 }],
    stock: "ready",
    prep: "11m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-keju-ayam-sosis",
    name: "Burger + Telur + Keju + Ayam + Sosis",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 17000 }],
    stock: "ready",
    prep: "12m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-keju-ayam-nugget-stick",
    name: "Burger + Telur + Keju + Ayam + Nugget Stick",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 17000 }],
    stock: "ready",
    prep: "12m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-keju-ayam-sosis-nugget-stick",
    name: "Burger + Telur + Keju + Ayam + Sosis + Nugget Stick",
    category: "Cemilan",
    section: "Burger Telur",
    variants: [{ id: "regular", label: "Regular", price: 19000 }],
    stock: "ready",
    prep: "13m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-crispy",
    name: "Burger + Telur + Crispy",
    category: "Cemilan",
    section: "Burger Crispy",
    variants: [{ id: "regular", label: "Regular", price: 15000 }],
    stock: "ready",
    prep: "11m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-crispy-sosis",
    name: "Burger + Telur + Crispy + Sosis",
    category: "Cemilan",
    section: "Burger Crispy",
    variants: [{ id: "regular", label: "Regular", price: 17000 }],
    stock: "ready",
    prep: "12m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-crispy-nugget",
    name: "Burger + Telur + Crispy + Nugget",
    category: "Cemilan",
    section: "Burger Crispy",
    variants: [{ id: "regular", label: "Regular", price: 17000 }],
    stock: "ready",
    prep: "12m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-keju-crispy",
    name: "Burger + Telur + Keju + Crispy",
    category: "Cemilan",
    section: "Burger Crispy",
    variants: [{ id: "regular", label: "Regular", price: 18000 }],
    stock: "ready",
    prep: "12m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-crispy-sosis-nugget",
    name: "Burger + Telur + Crispy + Sosis + Nugget",
    category: "Cemilan",
    section: "Burger Crispy",
    variants: [{ id: "regular", label: "Regular", price: 20000 }],
    stock: "ready",
    prep: "13m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-keju-crispy-sosis",
    name: "Burger + Telur + Keju + Crispy + Sosis",
    category: "Cemilan",
    section: "Burger Crispy",
    variants: [{ id: "regular", label: "Regular", price: 19000 }],
    stock: "ready",
    prep: "13m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-keju-crispy-nugget",
    name: "Burger + Telur + Keju + Crispy + Nugget",
    category: "Cemilan",
    section: "Burger Crispy",
    variants: [{ id: "regular", label: "Regular", price: 19000 }],
    stock: "ready",
    prep: "13m",
    tags: ["Burger"],
  },
  {
    id: "burger-telur-keju-crispy-sosis-nugget",
    name: "Burger + Telur + Keju + Crispy + Sosis + Nugget",
    category: "Cemilan",
    section: "Burger Crispy",
    variants: [{ id: "regular", label: "Regular", price: 22000 }],
    stock: "ready",
    prep: "14m",
    tags: ["Burger"],
  },
  {
    id: "burger-spesial-komplit",
    name: "Burger Spesial Komplit",
    category: "Cemilan",
    section: "Burger Spesial",
    variants: [{ id: "regular", label: "Regular", price: 25000 }],
    stock: "limited",
    prep: "15m",
    tags: ["Spesial"],
  },
  {
    id: "kebab-telur",
    name: "Kebab + Telur",
    category: "Cemilan",
    section: "Kebab",
    variants: [{ id: "regular", label: "Regular", price: 10000 }],
    stock: "ready",
    prep: "9m",
    tags: ["Kebab"],
  },
  {
    id: "kebab-telur-ayam",
    name: "Kebab + Telur + Ayam",
    category: "Cemilan",
    section: "Kebab",
    variants: [{ id: "regular", label: "Regular", price: 12000 }],
    stock: "ready",
    prep: "9m",
    tags: ["Kebab"],
  },
  {
    id: "kebab-telur-ayam-sosis",
    name: "Kebab + Telur + Ayam + Sosis",
    category: "Cemilan",
    section: "Kebab",
    variants: [{ id: "regular", label: "Regular", price: 20000 }],
    stock: "ready",
    prep: "10m",
    tags: ["Kebab"],
  },
  {
    id: "kebab-telur-ayam-nugget",
    name: "Kebab + Telur + Ayam + Nugget",
    category: "Cemilan",
    section: "Kebab",
    variants: [{ id: "regular", label: "Regular", price: 20000 }],
    stock: "ready",
    prep: "10m",
    tags: ["Kebab"],
  },
  {
    id: "kebab-telur-ayam-sosis-nugget",
    name: "Kebab + Telur + Ayam + Sosis + Nugget",
    category: "Cemilan",
    section: "Kebab",
    variants: [{ id: "regular", label: "Regular", price: 22000 }],
    stock: "ready",
    prep: "11m",
    tags: ["Kebab"],
  },
  {
    id: "kebab-telur-sosis",
    name: "Kebab + Telur + Sosis",
    category: "Cemilan",
    section: "Kebab",
    variants: [{ id: "regular", label: "Regular", price: 17000 }],
    stock: "ready",
    prep: "10m",
    tags: ["Kebab"],
  },
  {
    id: "kebab-telur-sosis-nugget",
    name: "Kebab + Telur + Sosis + Nugget",
    category: "Cemilan",
    section: "Kebab",
    variants: [{ id: "regular", label: "Regular", price: 20000 }],
    stock: "ready",
    prep: "10m",
    tags: ["Kebab"],
  },
  {
    id: "kebab-telur-nugget",
    name: "Kebab + Telur + Nugget",
    category: "Cemilan",
    section: "Kebab",
    variants: [{ id: "regular", label: "Regular", price: 17000 }],
    stock: "ready",
    prep: "10m",
    tags: ["Kebab"],
  },
  {
    id: "kebab-spesial-komplit",
    name: "Kebab Spesial Komplit",
    category: "Cemilan",
    section: "Kebab Spesial",
    variants: [{ id: "regular", label: "Regular", price: 28000 }],
    stock: "limited",
    prep: "12m",
    tags: ["Spesial"],
  },
  {
    id: "coffee-espresso-single",
    name: "Espresso Single",
    category: "Coffee",
    section: "Coffee",
    variants: [{ id: "hot", label: "Hot", price: 10000 }],
    stock: "ready",
    prep: "3m",
    tags: ["Espresso"],
  },
  {
    id: "coffee-espresso-double",
    name: "Espresso Double",
    category: "Coffee",
    section: "Coffee",
    variants: [{ id: "hot", label: "Hot", price: 15000 }],
    stock: "ready",
    prep: "3m",
    tags: ["Espresso"],
  },
  {
    id: "coffee-americano",
    name: "Americano",
    category: "Coffee",
    section: "Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 15000 },
      { id: "hot", label: "Hot", price: 13000 },
    ],
    stock: "ready",
    prep: "4m",
    tags: ["Coffee", "Bestseller"],
  },
  {
    id: "coffee-americano-honey",
    name: "Americano Honey",
    category: "Coffee",
    section: "Coffee",
    variants: [{ id: "cold", label: "Cold", price: 20000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Coffee"],
  },
  {
    id: "coffee-v60",
    name: "V 60",
    category: "Coffee",
    section: "Coffee",
    variants: [{ id: "hot", label: "Hot", price: 25000 }],
    stock: "ready",
    prep: "7m",
    tags: ["Manual brew"],
  },
  {
    id: "coffee-long-black",
    name: "Long Black",
    category: "Coffee",
    section: "Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 17000 },
      { id: "hot", label: "Hot", price: 14000 },
    ],
    stock: "ready",
    prep: "4m",
    tags: ["Coffee"],
  },
  {
    id: "coffee-ice-japanese",
    name: "Ice Japanese",
    category: "Coffee",
    section: "Coffee",
    variants: [{ id: "cold", label: "Cold", price: 25000 }],
    stock: "ready",
    prep: "7m",
    tags: ["Manual brew"],
  },
  {
    id: "coffee-vietnam-drip",
    name: "Vietnam Drip",
    category: "Coffee",
    section: "Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 16000 },
      { id: "hot", label: "Hot", price: 14000 },
    ],
    stock: "ready",
    prep: "5m",
    tags: ["Coffee"],
  },
  {
    id: "coffee-sanger",
    name: "Sanger",
    category: "Coffee",
    section: "Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 12000 },
      { id: "hot", label: "Hot", price: 10000 },
    ],
    stock: "ready",
    prep: "4m",
    tags: ["Coffee"],
  },
  {
    id: "coffee-latte",
    name: "Coffee Latte",
    category: "Coffee",
    section: "Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 17000 },
      { id: "hot", label: "Hot", price: 15000 },
    ],
    stock: "ready",
    prep: "4m",
    tags: ["Latte", "Bestseller"],
  },
  {
    id: "coffee-gula-aren",
    name: "Coffe Gula Aren",
    category: "Coffee",
    section: "Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 17000 },
      { id: "hot", label: "Hot", price: 15000 },
    ],
    stock: "ready",
    prep: "4m",
    tags: ["Latte"],
  },
  {
    id: "coffee-butterscotch-latte",
    name: "Butterscotch Coffee Latte",
    category: "Coffee",
    section: "Flavor Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 23000 },
      { id: "hot", label: "Hot", price: 20000 },
    ],
    stock: "ready",
    prep: "5m",
    tags: ["Flavor"],
  },
  {
    id: "coffee-butterscotch-toast",
    name: "Butterscotch Coffee (TOAST)",
    category: "Coffee",
    section: "Flavor Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 25000 },
      { id: "hot", label: "Hot", price: 23000 },
    ],
    stock: "ready",
    prep: "5m",
    tags: ["Flavor"],
  },
  {
    id: "coffee-vanilla-latte",
    name: "Vanilla Coffee Latte",
    category: "Coffee",
    section: "Flavor Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 20000 },
      { id: "hot", label: "Hot", price: 18000 },
    ],
    stock: "ready",
    prep: "5m",
    tags: ["Flavor"],
  },
  {
    id: "coffee-caramel-latte",
    name: "Caramel Coffee Latte",
    category: "Coffee",
    section: "Flavor Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 20000 },
      { id: "hot", label: "Hot", price: 18000 },
    ],
    stock: "ready",
    prep: "5m",
    tags: ["Flavor"],
  },
  {
    id: "coffee-mocca-latte",
    name: "Mocca Coffee Latte",
    category: "Coffee",
    section: "Flavor Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 20000 },
      { id: "hot", label: "Hot", price: 18000 },
    ],
    stock: "ready",
    prep: "5m",
    tags: ["Flavor"],
  },
  {
    id: "coffee-strawberry-latte",
    name: "Strawberry Coffee Latte",
    category: "Coffee",
    section: "Flavor Coffee",
    variants: [{ id: "cold", label: "Cold", price: 20000 }],
    stock: "ready",
    prep: "5m",
    tags: ["Flavor"],
  },
  {
    id: "coffee-hazelnut-latte",
    name: "Hazelnut Coffee Latte",
    category: "Coffee",
    section: "Flavor Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 20000 },
      { id: "hot", label: "Hot", price: 18000 },
    ],
    stock: "ready",
    prep: "5m",
    tags: ["Flavor"],
  },
  {
    id: "coffee-bon-bon",
    name: "Bon Bon",
    category: "Coffee",
    section: "Flavor Coffee",
    variants: [
      { id: "cold", label: "Cold", price: 18000 },
      { id: "hot", label: "Hot", price: 16000 },
    ],
    stock: "ready",
    prep: "5m",
    tags: ["Flavor"],
  },
  {
    id: "coffee-americano-lemonade",
    name: "Americano Lemonade",
    category: "Coffee",
    section: "Flavor Coffee",
    variants: [{ id: "cold", label: "Cold", price: 19000 }],
    stock: "ready",
    prep: "5m",
    tags: ["Flavor"],
  },
  {
    id: "coffee-honey",
    name: "Coffee Honey",
    category: "Coffee",
    section: "Flavor Coffee",
    variants: [{ id: "cold", label: "Cold", price: 20000 }],
    stock: "ready",
    prep: "5m",
    tags: ["Flavor"],
  },
  {
    id: "food-indomie-kuah",
    name: "Indomie Kuah",
    category: "Makanan",
    section: "Indomie",
    variants: [{ id: "regular", label: "Regular", price: 12000 }],
    stock: "ready",
    prep: "8m",
    tags: ["Indomie"],
  },
  {
    id: "food-indomie-goreng",
    name: "Indomie Goreng",
    category: "Makanan",
    section: "Indomie",
    variants: [{ id: "regular", label: "Regular", price: 12000 }],
    stock: "ready",
    prep: "8m",
    tags: ["Indomie"],
  },
  {
    id: "food-nasi-goreng-telur",
    name: "Nasi Goreng Telur",
    category: "Makanan",
    section: "Nasi Goreng",
    variants: [
      { id: "sedang", label: "Sedang", price: 12000 },
      { id: "pedas", label: "Pedas", price: 13000 },
    ],
    stock: "ready",
    prep: "12m",
    tags: ["Nasi goreng"],
  },
  {
    id: "food-nasi-goreng-ayam",
    name: "Nasi Goreng Ayam",
    category: "Makanan",
    section: "Nasi Goreng",
    variants: [
      { id: "sedang", label: "Sedang", price: 15000 },
      { id: "pedas", label: "Pedas", price: 16000 },
    ],
    stock: "ready",
    prep: "12m",
    tags: ["Nasi goreng"],
  },
  {
    id: "food-nasi-goreng-kampung",
    name: "Nasi Goreng Kampung",
    category: "Makanan",
    section: "Nasi Goreng",
    variants: [
      { id: "sedang", label: "Sedang", price: 17000 },
      { id: "pedas", label: "Pedas", price: 18000 },
    ],
    stock: "ready",
    prep: "13m",
    tags: ["Nasi goreng"],
  },
  {
    id: "food-nasi-goreng-komplit",
    name: "Nasi Goreng Komplit",
    category: "Makanan",
    section: "Nasi Goreng",
    variants: [
      { id: "sedang", label: "Sedang", price: 20000 },
      { id: "pedas", label: "Pedas", price: 21000 },
    ],
    stock: "ready",
    prep: "14m",
    tags: ["Nasi goreng"],
  },
  {
    id: "food-ayam-richeese-utuh",
    name: "Ayam Richeese Utuh Paket 4 Orang + Nasi",
    category: "Makanan",
    section: "Ayam Richeese",
    variants: [
      { id: "barbeque", label: "Barbeque", price: 80000 },
      { id: "balado", label: "Balado", price: 80000 },
      { id: "campur", label: "Campur", price: 85000 },
    ],
    stock: "limited",
    prep: "18m",
    tags: ["Paket"],
  },
  {
    id: "food-ayam-richeese-half",
    name: "Ayam Richeese 1/2 Paket 2 Orang + Nasi",
    category: "Makanan",
    section: "Ayam Richeese",
    variants: [
      { id: "barbeque", label: "Barbeque", price: 42000 },
      { id: "balado", label: "Balado", price: 42000 },
      { id: "campur", label: "Campur", price: 47000 },
    ],
    stock: "ready",
    prep: "16m",
    tags: ["Paket"],
  },
  {
    id: "food-ayam-richeese-quarter",
    name: "Ayam Richeese 1/4 Paket 1 Orang + Nasi",
    category: "Makanan",
    section: "Ayam Richeese",
    variants: [
      { id: "barbeque", label: "Barbeque", price: 25000 },
      { id: "balado", label: "Balado", price: 25000 },
      { id: "campur", label: "Campur", price: 30000 },
    ],
    stock: "ready",
    prep: "14m",
    tags: ["Paket"],
  },
  {
    id: "noncoffee-cappucino",
    name: "Cappucino",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-manggo",
    name: "Manggo",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-avocado",
    name: "Avocado",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-milk-tea",
    name: "Milk Tea",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-taro",
    name: "Taro",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-cotton-candy",
    name: "Cotton Candy",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-strawberry",
    name: "Strawberry",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-lemon-tea",
    name: "Lemon Tea",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-permen-karet",
    name: "Permen Karet",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-red-velvet",
    name: "Red Velvet",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-chocolate",
    name: "Chocolate",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-cookies-cream",
    name: "Cookies & Cream",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
  {
    id: "noncoffee-matcha-green-tea",
    name: "Matcha Green Tea",
    category: "Non-Coffee",
    section: "Non-Coffee",
    variants: [{ id: "cold", label: "Cold", price: 12000 }],
    stock: "ready",
    prep: "4m",
    tags: ["Cold"],
  },
];

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
    items: ["Americano Cold", "V 60 Hot"],
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

const inventorySource = [
  ["Protein/Frozen", "Patty burger", "Daging burger, patty sapi", "pack", "1 kg"],
  ["Protein/Frozen", "Daging kebab slice", "Daging kebab ayam/sapi", "pack", "1 kg"],
  ["Protein/Frozen", "Fillet ayam beku", "Ayam crispy", "pack", "1 kg"],
  ["Protein/Frozen", "Nugget ayam", "Nugget", "pack", "1 kg"],
  ["Protein/Frozen", "Nugget stick", "-", "pack", "500 g"],
  ["Protein/Frozen", "Sosis ayam", "Sosis sapi", "pack", "1 kg"],
  ["Protein/Frozen", "Ayam potong", "Ayam utuh potong 1/2/1/4", "ekor/kg", "1 ekor (~1,2 kg)"],
  ["Protein/Frozen", "Telur ayam", "-", "pcs", "isi 30"],
  ["Protein/Frozen", "Ikan teri", "Teri nasi", "kg", "1 kg"],
  ["Sayuran", "Selada", "Lettuce", "kg", "1 kg"],
  ["Sayuran", "Kol (kubis)", "-", "kg", "1 kg"],
  ["Sayuran", "Timun", "Ketimun", "kg", "1 kg"],
  ["Sayuran", "Tomat", "-", "kg", "1 kg"],
  ["Sayuran", "Bawang bombay", "-", "kg", "1 kg"],
  ["Sayuran", "Daun bawang", "Daun prei / scallion", "kg", "0.5 kg"],
  ["Sayuran", "Cabai rawit", "Cabai kecil", "kg", "0.5 kg"],
  ["Sayuran", "Bawang merah", "-", "kg", "1 kg"],
  ["Sayuran", "Bawang putih", "-", "kg", "1 kg"],
  ["Sayuran", "Acar", "Mentimun, wortel", "pack", "100 g"],
  ["Bumbu & Saus", "Saus sambal", "Sambal", "botol", "600 ml"],
  ["Bumbu & Saus", "Saus tomat", "-", "botol", "600 ml"],
  ["Bumbu & Saus", "Mayones", "-", "stoples", "250 g"],
  ["Bumbu & Saus", "Saus BBQ", "Saus barbekyu", "stoples", "250 g"],
  ["Bumbu & Saus", "Saus keju", "-", "sachet", "200 g"],
  ["Bumbu & Saus", "Kecap manis", "Kecap asin", "botol", "600 ml"],
  ["Bumbu & Saus", "Minyak goreng", "Minyak sayur", "liter", "2 L"],
  ["Bumbu & Saus", "Margarin", "Mentega", "pack", "200 g"],
  ["Bumbu & Saus", "Garam", "Garam dapur", "kg", "1 kg"],
  ["Bumbu & Saus", "Gula pasir", "Gula", "kg", "1 kg"],
  ["Bumbu & Saus", "Kaldu bubuk", "Bubuk kaldu ayam", "pack", "100 g"],
  ["Bumbu & Saus", "Penyedap rasa", "Micin / MSG", "pack", "100 g"],
  ["Bumbu & Saus", "Bubuk cabe", "Cabe bubuk", "pack", "100 g"],
  ["Bumbu & Saus", "Lada hitam bubuk", "Merica bubuk", "pack", "100 g"],
  ["Bumbu & Saus", "Bon Cabe", "Cabe bubuk instan", "pack", "15 g"],
  ["Karbohidrat & Roti", "Roti burger", "Burger bun", "pack", "10 pcs"],
  ["Karbohidrat & Roti", "Tortilla kebab", "Roti pita", "pack", "10 pcs"],
  ["Karbohidrat & Roti", "Nasi", "Beras", "kg", "5 kg"],
  ["Karbohidrat & Roti", "Indomie goreng", "Mie instan goreng", "pack", "5 pcs"],
  ["Karbohidrat & Roti", "Indomie kuah", "Mie instan kuah", "pack", "5 pcs"],
  ["Karbohidrat & Roti", "Kentang beku", "French fries beku", "kg", "1 kg"],
  ["Karbohidrat & Roti", "Kerupuk", "Krupuk udang", "kg", "0.5 kg"],
  ["Dairy & Susu", "Susu UHT", "Susu cair", "liter", "1 L"],
  ["Dairy & Susu", "Susu evaporasi", "Susu kotak / susu kental manis", "kaleng", "370 ml"],
  ["Dairy & Susu", "Krimer kental manis", "-", "kaleng", "370 g"],
  ["Dairy & Susu", "Krimer bubuk", "Krimer non-dairy", "pack", "500 g"],
  ["Dairy & Susu", "Keju slice", "Keju lembaran", "pack", "200 g"],
  ["Dairy & Susu", "Bubuk keju", "Serbuk keju", "pack", "200 g"],
  ["Syrup & Flavorings", "Butterscotch syrup", "Sirup butterscotch", "botol", "1 L"],
  ["Syrup & Flavorings", "Vanilla syrup", "Sirup vanila", "botol", "1 L"],
  ["Syrup & Flavorings", "Caramel syrup", "Sirup karamel", "botol", "1 L"],
  ["Syrup & Flavorings", "Mocca syrup", "Sirup moka", "botol", "1 L"],
  ["Syrup & Flavorings", "Strawberry syrup", "Sirup stroberi", "botol", "1 L"],
  ["Syrup & Flavorings", "Hazelnut syrup", "Sirup hazelnut", "botol", "1 L"],
  ["Syrup & Flavorings", "Lemon syrup", "Sirup lemon", "botol", "1 L"],
  ["Syrup & Flavorings", "Madu", "Madu bunga/lebah", "botol", "500 ml"],
  ["Dry Goods & Seasonings", "Tepung crispy", "Tepung roti kasar", "kg", "5 kg"],
  ["Dry Goods & Seasonings", "Tepung bumbu", "Tepung bumbu ayam", "kg", "5 kg"],
  ["Dry Goods & Seasonings", "Tepung panir", "Tepung roti halus", "kg", "5 kg"],
  ["Dry Goods & Seasonings", "Bubuk cappuccino", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk mangga", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk alpukat", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk milk tea", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk taro", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk cotton candy", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk strawberry", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk lemon tea", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk permen karet", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk red velvet", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk cokelat", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk cookies & cream", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Bubuk matcha", "-", "pack", "500 g"],
  ["Dry Goods & Seasonings", "Kopi bubuk (espresso)", "Biji kopi robusta/arabika", "kg", "1 kg"],
  ["Dry Goods & Seasonings", "Kopi bubuk (arabika)", "Kopi V60", "kg", "1 kg"],
  ["Dry Goods & Seasonings", "Kopi bubuk Vietnam", "-", "pack", "250 g"],
  ["Dry Goods & Seasonings", "Bawang goreng", "-", "pack", "100 g"],
  ["Dry Goods & Seasonings", "Oregano", "-", "pack", "50 g"],
  ["Dry Goods & Seasonings", "Parsley", "-", "pack", "50 g"],
  ["Packaging & Consumables", "Kertas burger", "Kertas roti burger", "pack", "100 pcs"],
  ["Packaging & Consumables", "Kertas kebab", "Kertas roti kebab", "pack", "100 pcs"],
  ["Packaging & Consumables", "Kotak burger", "Box burger", "pack", "100 pcs"],
  ["Packaging & Consumables", "Box nasi goreng", "Box nasi", "pack", "100 pcs"],
  ["Packaging & Consumables", "Cup plastik", "Gelas plastik", "pack", "100 pcs"],
  ["Packaging & Consumables", "Tutup cup", "Tutup gelas plastik", "pack", "100 pcs"],
  ["Packaging & Consumables", "Sedotan", "Sedotan plastik", "pack", "500 pcs"],
  ["Packaging & Consumables", "Plastik take-away", "Plastik kresek", "pack", "100 pcs"],
  ["Packaging & Consumables", "Tisu", "-", "pack", "200 lembar"],
  ["Packaging & Consumables", "Sarung tangan plastik", "Sarung tangan sekali pakai", "box", "100 pcs"],
  ["Packaging & Consumables", "Filter kertas V60", "Kertas saring V60", "pack", "100 pcs"],
  ["Operasional/Cleaning", "Gas LPG", "Tabung gas", "unit", "3 kg"],
  ["Operasional/Cleaning", "Sabun cuci piring", "Sabun detergen", "liter", "1 L"],
  ["Operasional/Cleaning", "Sabun tangan", "Sabun cair", "liter", "500 ml"],
  ["Operasional/Cleaning", "Spons", "Spons cuci", "pack", "10 pcs"],
  ["Operasional/Cleaning", "Lap microfiber", "Lap kain", "pack", "5 pcs"],
  ["Operasional/Cleaning", "Hand sanitizer", "-", "liter", "500 ml"],
  ["Operasional/Cleaning", "Tisu roll", "Tisu gulung", "roll", "6 roll"],
  ["Operasional/Cleaning", "Plastik sampah", "Kantong sampah", "roll", "50 pcs"],
  ["Operasional/Cleaning", "Kertas struk", "Kertas kasir", "roll", "80x80 mm"],
  ["Operasional/Cleaning", "Stiker logo", "-", "pack", "100 pcs"],
  ["Operasional/Cleaning", "Air galon", "Galon air mineral", "pcs", "1 galon"],
  ["Operasional/Cleaning", "Es batu", "-", "kg", "10 kg"],
] as const;

const inventoryStatusCycle = [
  "safe",
  "safe",
  "watch",
  "safe",
  "low",
  "safe",
  "watch",
] as const;

function minimumStockFor(unit: string, index: number) {
  switch (unit) {
    case "kg":
      return Number((3 + (index % 5) * 1.5).toFixed(1));
    case "liter":
      return 4 + (index % 4) * 2;
    case "botol":
    case "kaleng":
    case "stoples":
    case "sachet":
      return 3 + (index % 5);
    case "pcs":
      return 24 + (index % 6) * 12;
    case "roll":
    case "unit":
    case "box":
      return 2 + (index % 4);
    case "ekor/kg":
      return 5 + (index % 3);
    default:
      return 6 + (index % 8);
  }
}

function stockOnHandFor(min: number, status: (typeof inventoryStatusCycle)[number], unit: string) {
  const multiplier = status === "low" ? 0.62 : status === "watch" ? 1.08 : 2.35;
  const raw = min * multiplier;
  const wholeUnit = ["pcs", "pack", "roll", "unit", "box", "botol", "kaleng", "stoples", "sachet"].includes(unit);

  return Number(raw.toFixed(wholeUnit ? 0 : 1));
}

function movementFor(name: string, category: string, status: (typeof inventoryStatusCycle)[number], unit: string) {
  if (status === "low") {
    return `Low stock: ${name} masuk daftar belanja hari ini`;
  }

  if (status === "watch") {
    return `Watch: ${category} mendekati minimum, cek opname shift malam`;
  }

  return `Auto deduction: pemakaian POS tercatat dalam ${unit}`;
}

export const inventoryItems = inventorySource.map(
  ([category, name, alternativeName, unit, packageSize], index) => {
    const status = inventoryStatusCycle[index % inventoryStatusCycle.length];
    const min = minimumStockFor(unit, index);
    const onHand = stockOnHandFor(min, status, unit);

    return {
      sku: `INV-${String(index + 1).padStart(3, "0")}`,
      name,
      alternativeName,
      category,
      onHand,
      min,
      unit,
      packageSize,
      status,
      movement: movementFor(name, category, status, unit),
    };
  },
);

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

export const closingChecklist = [
  { label: "Opening cash verified", done: true },
  { label: "Cash in/out approved", done: true },
  { label: "Payment settlement matched", done: true },
  { label: "Cash drawer counted", done: false },
  { label: "Manager sign off", done: false },
];

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
