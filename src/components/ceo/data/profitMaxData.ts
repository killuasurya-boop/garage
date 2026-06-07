import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BadgePercent, Calculator, CircleDollarSign, Gauge, PackageSearch, ReceiptText, TrendingUp } from "lucide-react";

export type ProfitMaxTone = "red" | "amber" | "success" | "chrome";

export type ProfitMaxMetric = {
  title: string;
  value: number;
  change: number;
  trend: "up" | "down" | "warning" | "flat";
  prefix?: string;
  suffix?: string;
  format?: "currency" | "percent" | "number";
  accent: ProfitMaxTone;
  icon: LucideIcon;
  sparkline: number[];
};

export type ProfitMaxMenu = {
  code: string;
  name: string;
  category: string;
  hpp: number;
  price: number;
  oldPrice?: number;
  estimatedDailySales: number;
  status: "OK" | "NAIK" | "BARU" | "RUGI";
  note: string;
};

export type ProfitMaxScenario = {
  visitors: number;
  dailyRevenue: number;
  monthlyNetProfit: number;
  bepMonths: number;
};

export type ProfitMaxIngredient = {
  code: string;
  name: string;
  unit: string;
  buyUnit: string;
  buyPrice: number;
  pricePerUnit: number;
  category: string;
  stock: number;
  minimumStock: number;
};

export type ProfitMaxRecipe = {
  code: string;
  name: string;
  serving: string;
  prepMinutes: number;
  ingredients: Array<{
    name: string;
    qty: number;
    unit: string;
    cost: number;
  }>;
  steps: string[];
  qualityNotes: string;
};

export type ProfitMaxEmployee = {
  id: string;
  name: string;
  position: string;
  baseSalary: number;
  allowance: number;
  deduction: number;
};

export type ProfitMaxOverhead = {
  name: string;
  amount: number;
  category: string;
};

export type ProfitMaxBundle = {
  code: string;
  name: string;
  itemCodes: string[];
  hpp: number;
  normalPrice: number;
  bundlePrice: number;
  sold: number;
};

export type ProfitMaxHealthIndicator = {
  name: string;
  actual: number;
  target: number;
  unit: "idr" | "percent" | "number";
  status: "HEALTHY" | "WARNING" | "DANGER" | "ON_TRACK";
  note: string;
};

const dailyRevenueTarget = 3_750_000;
const dashboardDailyRevenue = 12_480_000;
const monthlyRevenueTarget = 112_500_000;
const fixedMonthlyCost = 16_900_000 + 833_333 + 2_500_000 + 1_500_000;
const initialCapital = 200_000_000;
const targetHppRatio = 45;
const actualHppRatio = 43.5;
const grossProfitToday = dailyRevenueTarget * (1 - targetHppRatio / 100);
const netProfitPerMonth = 40_141_667;
const capitalRecovered = 80_283_334;
const avgTicketSize = 25_000;
const avgVariableCost = avgTicketSize * (targetHppRatio / 100);

function calculateBep(fixedCost: number, sellingPrice: number, variableCost: number) {
  const contributionMargin = sellingPrice - variableCost;
  if (contributionMargin <= 0) return { units: 0, revenue: 0 };
  const units = Math.ceil(fixedCost / contributionMargin);
  return { units, revenue: units * sellingPrice };
}

function calculateMargin(price: number, hpp: number) {
  const profit = price - hpp;
  return {
    profit,
    margin: price > 0 ? Number(((profit / price) * 100).toFixed(1)) : 0,
  };
}

function suggestSellingPrice(hpp: number, targetMarginPercent: number) {
  return Math.ceil(hpp / (1 - targetMarginPercent / 100) / 500) * 500;
}

const bep = calculateBep(fixedMonthlyCost, avgTicketSize, avgVariableCost);

export const profitMaxOverview = {
  dailyRevenueTarget,
  dashboardDailyRevenue,
  monthlyRevenueTarget,
  grossProfitToday,
  netProfitPerMonth,
  fixedMonthlyCost,
  initialCapital,
  capitalRecovered,
  bepProgressPercent: Number(((capitalRecovered / initialCapital) * 100).toFixed(1)),
  targetHppRatio,
  actualHppRatio,
  avgTicketSize,
  bepDailyUnits: Math.ceil(bep.units / 30),
  bepDailyRevenue: Math.ceil(bep.revenue / 30),
  bepMonthlyRevenue: bep.revenue,
  estimatedBepDate: "1 November 2026",
  roiAnnualPercent: Number((((netProfitPerMonth * 12 - initialCapital) / initialCapital) * 100).toFixed(1)),
};

export const profitMaxMetrics: ProfitMaxMetric[] = [
  {
    title: "Target Omzet Harian",
    value: dailyRevenueTarget,
    change: 0,
    trend: "flat",
    prefix: "Rp ",
    format: "currency",
    accent: "red",
    icon: CircleDollarSign,
    sparkline: [2.5, 2.8, 3.0, 3.2, 3.4, 3.55, 3.75],
  },
  {
    title: "Gross Profit Harian",
    value: grossProfitToday,
    change: 55,
    trend: "up",
    prefix: "Rp ",
    format: "currency",
    accent: "success",
    icon: TrendingUp,
    sparkline: [1.25, 1.42, 1.56, 1.68, 1.82, 1.96, 2.06],
  },
  {
    title: "HPP Ratio",
    value: actualHppRatio,
    change: -1.5,
    trend: "up",
    suffix: "%",
    format: "percent",
    accent: "success",
    icon: PackageSearch,
    sparkline: [46.2, 45.8, 45.2, 44.9, 44.3, 43.9, 43.5],
  },
  {
    title: "Progress BEP",
    value: profitMaxOverview.bepProgressPercent,
    change: 40.1,
    trend: "up",
    suffix: "%",
    format: "percent",
    accent: "amber",
    icon: Gauge,
    sparkline: [8, 14, 19, 25, 31, 36, 40.1],
  },
];

export const profitMaxMenus: ProfitMaxMenu[] = [
  {
    code: "C-01",
    name: "Espresso Single",
    category: "Coffee Dasar",
    hpp: 1_710,
    price: 10_000,
    estimatedDailySales: 28,
    status: "OK",
    note: "Margin kuat; pertahankan sebagai menu cepat dengan upsell pastry.",
  },
  {
    code: "C-12",
    name: "Sanger",
    category: "Coffee Dasar",
    hpp: 3_525,
    oldPrice: 12_000,
    price: 14_000,
    estimatedDailySales: 34,
    status: "NAIK",
    note: "Harga sudah naik; pantau volume agar tidak turun setelah penyesuaian.",
  },
  {
    code: "CN-01",
    name: "Dirty Matcha",
    category: "Coffee Baru Signature",
    hpp: 8_120,
    price: 24_000,
    estimatedDailySales: 18,
    status: "BARU",
    note: "Secret menu margin sehat; cocok didorong sebagai signature campaign.",
  },
  {
    code: "SN-07",
    name: "Nugget Goreng",
    category: "Snack",
    hpp: 13_600,
    price: 12_500,
    estimatedDailySales: 12,
    status: "RUGI",
    note: "Dijual di bawah modal; naikkan harga atau ganti porsi/resep.",
  },
];

export const profitMaxIngredients: ProfitMaxIngredient[] = [
  {
    code: "ING-001",
    name: "Biji Kopi Robusta/Mandailing",
    unit: "gram",
    buyUnit: "1 kg",
    buyPrice: 90_000,
    pricePerUnit: 90,
    category: "Kopi",
    stock: 4_200,
    minimumStock: 500,
  },
  {
    code: "ING-002",
    name: "Susu UHT Full Cream",
    unit: "ml",
    buyUnit: "1 liter",
    buyPrice: 22_000,
    pricePerUnit: 22,
    category: "Susu/Dairy",
    stock: 28_000,
    minimumStock: 10_000,
  },
  {
    code: "ING-003",
    name: "Susu Kental Manis",
    unit: "gram",
    buyUnit: "385 gram",
    buyPrice: 15_000,
    pricePerUnit: 39,
    category: "Susu/Dairy",
    stock: 1_900,
    minimumStock: 2_000,
  },
  {
    code: "ING-004",
    name: "Gula Aren Cair",
    unit: "ml",
    buyUnit: "1 liter",
    buyPrice: 50_000,
    pricePerUnit: 50,
    category: "Gula/Pemanis",
    stock: 6_800,
    minimumStock: 2_000,
  },
  {
    code: "ING-013",
    name: "Es Batu Grosir",
    unit: "gram",
    buyUnit: "1 kg",
    buyPrice: 3_000,
    pricePerUnit: 3,
    category: "Lainnya",
    stock: 40_000,
    minimumStock: 15_000,
  },
  {
    code: "ING-016",
    name: "Ayam Ras",
    unit: "gram",
    buyUnit: "1 kg",
    buyPrice: 38_000,
    pricePerUnit: 38,
    category: "Makanan Basah",
    stock: 2_400,
    minimumStock: 3_000,
  },
  {
    code: "ING-021",
    name: "Cup + Sedotan + Lid",
    unit: "pcs",
    buyUnit: "100 pcs",
    buyPrice: 70_000,
    pricePerUnit: 700,
    category: "Kemasan",
    stock: 1_840,
    minimumStock: 500,
  },
];

export const profitMaxRecipes: ProfitMaxRecipe[] = [
  {
    code: "C-05",
    name: "Kopi Susu Gula Aren",
    serving: "1 cup 16oz",
    prepMinutes: 3,
    ingredients: [
      { name: "Biji Kopi Espresso Shot", qty: 18, unit: "gram", cost: 1_620 },
      { name: "Susu UHT Full Cream", qty: 150, unit: "ml", cost: 3_300 },
      { name: "Gula Aren Cair", qty: 30, unit: "ml", cost: 1_500 },
      { name: "Es Batu", qty: 100, unit: "gram", cost: 300 },
      { name: "Cup + Sedotan + Lid", qty: 1, unit: "pcs", cost: 700 },
    ],
    steps: [
      "Tarik 1 shot espresso.",
      "Tuang gula aren di dasar cup.",
      "Isi es batu hingga dua pertiga cup.",
      "Tuang susu perlahan.",
      "Tuang espresso terakhir untuk layering.",
    ],
    qualityNotes: "Espresso harus crema tebal; ulang shot jika terlalu watery.",
  },
  {
    code: "CN-01",
    name: "Dirty Matcha",
    serving: "1 cup 16oz",
    prepMinutes: 4,
    ingredients: [
      { name: "Biji Kopi Espresso Shot", qty: 18, unit: "gram", cost: 1_620 },
      { name: "Bubuk Matcha", qty: 18, unit: "gram", cost: 2_160 },
      { name: "Susu UHT Full Cream", qty: 160, unit: "ml", cost: 3_520 },
      { name: "Es Batu", qty: 100, unit: "gram", cost: 300 },
      { name: "Cup + Sedotan + Lid", qty: 1, unit: "pcs", cost: 700 },
    ],
    steps: [
      "Larutkan matcha sampai tidak menggumpal.",
      "Tuang matcha dan susu ke cup.",
      "Tambahkan es batu.",
      "Tarik espresso lalu tuang pelan di atas susu.",
    ],
    qualityNotes: "Warna layer harus kontras; jangan overmix sebelum disajikan.",
  },
  {
    code: "F-03",
    name: "Nugget Goreng",
    serving: "1 porsi",
    prepMinutes: 5,
    ingredients: [
      { name: "Nugget ayam", qty: 8, unit: "pcs", cost: 9_800 },
      { name: "Minyak goreng", qty: 80, unit: "ml", cost: 1_520 },
      { name: "Saus dan kemasan", qty: 1, unit: "set", cost: 980 },
    ],
    steps: [
      "Panaskan minyak sampai stabil.",
      "Goreng nugget sampai golden brown.",
      "Tiriskan dan sajikan dengan saus.",
    ],
    qualityNotes: "Item ini rugi pada harga sekarang; perlu perubahan harga atau porsi.",
  },
];

export const profitMaxEmployees: ProfitMaxEmployee[] = [
  { id: "EMP-001", name: "Rizky Pratama", position: "Manajer", baseSalary: 2_000_000, allowance: 150_000, deduction: 0 },
  { id: "EMP-002", name: "Bayu Santoso", position: "Koki Utama", baseSalary: 2_000_000, allowance: 100_000, deduction: 0 },
  { id: "EMP-003", name: "Dwi Astuti", position: "Asisten Koki", baseSalary: 1_500_000, allowance: 75_000, deduction: 0 },
  { id: "EMP-004", name: "Reno Hardiansyah", position: "Barista", baseSalary: 1_800_000, allowance: 100_000, deduction: 50_000 },
  { id: "EMP-005", name: "Sari Mulyani", position: "Barista", baseSalary: 1_800_000, allowance: 100_000, deduction: 0 },
  { id: "EMP-006", name: "Indra Permana", position: "Kasir", baseSalary: 1_800_000, allowance: 100_000, deduction: 0 },
  { id: "EMP-007", name: "Pak Slamet", position: "Satpam", baseSalary: 1_500_000, allowance: 50_000, deduction: 0 },
  { id: "EMP-008", name: "Tono Wijaya", position: "Waiters", baseSalary: 1_500_000, allowance: 75_000, deduction: 25_000 },
  { id: "EMP-009", name: "Fina Maharani", position: "Waiters", baseSalary: 1_500_000, allowance: 75_000, deduction: 0 },
  { id: "EMP-010", name: "Adi Kurniawan", position: "Waiters", baseSalary: 1_500_000, allowance: 75_000, deduction: 0 },
];

export const profitMaxOverheads: ProfitMaxOverhead[] = [
  { name: "Gaji 10 Karyawan", amount: 16_900_000, category: "SDM" },
  { name: "Sewa Tempat", amount: 833_333, category: "Tempat" },
  { name: "Listrik", amount: 1_200_000, category: "Utilitas" },
  { name: "Air", amount: 400_000, category: "Utilitas" },
  { name: "Wifi/Internet", amount: 900_000, category: "Utilitas" },
  { name: "Pemeliharaan Alat", amount: 1_500_000, category: "Operasional" },
  { name: "Marketing", amount: 600_000, category: "Marketing" },
  { name: "Kebersihan dan ATK", amount: 350_000, category: "Operasional" },
];

export const profitMaxBundles: ProfitMaxBundle[] = [
  { code: "PK-01", name: "Garage Starter", itemCodes: ["C-05", "S-02"], hpp: 10_820, normalPrice: 28_000, bundlePrice: 25_000, sold: 48 },
  { code: "PK-02", name: "Full Tank", itemCodes: ["F-01", "C-12"], hpp: 11_525, normalPrice: 32_000, bundlePrice: 28_000, sold: 32 },
  { code: "PK-05", name: "Nongkrong Sore", itemCodes: ["N-02", "S-01", "S-05"], hpp: 10_760, normalPrice: 39_000, bundlePrice: 28_000, sold: 42 },
  { code: "PK-06", name: "Richeese Combo", itemCodes: ["F-02", "C-02"], hpp: 14_820, normalPrice: 31_500, bundlePrice: 28_000, sold: 21 },
];

export const profitMaxScenarios: ProfitMaxScenario[] = [
  { visitors: 100, dailyRevenue: 2_500_000, monthlyNetProfit: 22_000_000, bepMonths: 9.1 },
  { visitors: 150, dailyRevenue: 3_750_000, monthlyNetProfit: 40_141_667, bepMonths: 4.98 },
  { visitors: 200, dailyRevenue: 5_000_000, monthlyNetProfit: 58_000_000, bepMonths: 3.45 },
];

export const profitMaxHealthIndicators: ProfitMaxHealthIndicator[] = [
  {
    name: "Revenue Harian",
    actual: dailyRevenueTarget,
    target: dailyRevenueTarget,
    unit: "idr",
    status: "HEALTHY",
    note: "Baseline ProfitMax selaras dengan target 150 pengunjung x Rp25.000.",
  },
  {
    name: "Rata-rata Margin",
    actual: 55.2,
    target: 50,
    unit: "percent",
    status: "HEALTHY",
    note: "Margin operasional masih di atas ambang aman.",
  },
  {
    name: "HPP Ratio",
    actual: actualHppRatio,
    target: targetHppRatio,
    unit: "percent",
    status: "HEALTHY",
    note: "Rasio HPP di bawah target maksimum 45%.",
  },
  {
    name: "Menu Rugi",
    actual: profitMaxMenus.filter((menu) => menu.status === "RUGI").length,
    target: 0,
    unit: "number",
    status: "DANGER",
    note: "Nugget Goreng harus masuk approval perubahan harga.",
  },
  {
    name: "Progress BEP",
    actual: profitMaxOverview.bepProgressPercent,
    target: 100,
    unit: "percent",
    status: "ON_TRACK",
    note: `Estimasi balik modal ${profitMaxOverview.estimatedBepDate}.`,
  },
];

export const profitMaxActions = [
  {
    title: "Naikkan harga Nugget Goreng",
    owner: "Menu Engineering",
    impact: "Stop rugi Rp 1.100 per porsi",
    tone: "red" as ProfitMaxTone,
    icon: AlertTriangle,
  },
  {
    title: "Kunci HPP bahan kopi dan susu",
    owner: "Inventory",
    impact: "Jaga HPP <= 45%",
    tone: "amber" as ProfitMaxTone,
    icon: PackageSearch,
  },
  {
    title: "Dorong signature Dirty Matcha",
    owner: "Sales",
    impact: "Margin 66,2%",
    tone: "success" as ProfitMaxTone,
    icon: BadgePercent,
  },
  {
    title: "Review BEP mingguan",
    owner: "Owner",
    impact: "BEP 40,1% dari modal",
    tone: "chrome" as ProfitMaxTone,
    icon: Calculator,
  },
];

export const profitMaxSummaryCard = {
  title: "GARAGE ProfitMax",
  subtitle: "HPP, margin, pricing, BEP, dan ROI dari data produk manajemen.",
  value: profitMaxOverview.bepProgressPercent,
  unit: "%",
  label: "progress BEP",
  icon: ReceiptText,
};

export function enrichProfitMaxMenu(menu: ProfitMaxMenu) {
  const margin = calculateMargin(menu.price, menu.hpp);
  const suggested50 = suggestSellingPrice(menu.hpp, 50);
  const dailyProfit = margin.profit * menu.estimatedDailySales;
  return {
    ...menu,
    profit: margin.profit,
    margin: margin.margin,
    suggested50,
    dailyProfit,
  };
}

export function calculateProfitMaxPayroll(employee: ProfitMaxEmployee) {
  return {
    ...employee,
    totalSalary: employee.baseSalary + employee.allowance - employee.deduction,
  };
}

export function calculateBundleMargin(bundle: ProfitMaxBundle) {
  const profit = bundle.bundlePrice - bundle.hpp;
  return {
    ...bundle,
    discountValue: bundle.normalPrice - bundle.bundlePrice,
    discountPercent: Number((((bundle.normalPrice - bundle.bundlePrice) / bundle.normalPrice) * 100).toFixed(1)),
    profit,
    margin: Number(((profit / bundle.bundlePrice) * 100).toFixed(1)),
  };
}
