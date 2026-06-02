// Mock data for GARAGE Control Dashboard. All numbers are illustrative.
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Coins,
  Flame,
  Gauge,
  LineChart,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";

export type Trend = "up" | "down" | "warning" | "flat";
export type Severity = "low" | "medium" | "high" | "critical";
export type InsightType = "opportunity" | "warning" | "action-needed" | "insight" | "prediction";

export type KpiKey =
  | "totalRevenue"
  | "profitMargin"
  | "cashFlow"
  | "mrr"
  | "burnRate"
  | "companyValuation"
  | "kpiHealthScore"
  | "targetAchievement";

export type KpiEntry = {
  key: KpiKey;
  title: string;
  value: number;
  change: number;
  trend: Trend;
  prefix?: string;
  suffix?: string;
  format?: "currency" | "percent" | "number";
  icon: LucideIcon;
  accent: "red" | "amber" | "chrome" | "success";
  sparkline: number[];
};

export const kpiData: KpiEntry[] = [
  {
    key: "totalRevenue",
    title: "Omzet Total",
    value: 12_480_000,
    change: 18.4,
    trend: "up",
    prefix: "Rp ",
    format: "currency",
    icon: Banknote,
    accent: "red",
    sparkline: [6.2, 6.8, 7.1, 7.8, 8.4, 9.2, 9.6, 10.1, 10.9, 11.4, 12.0, 12.48],
  },
  {
    key: "profitMargin",
    title: "Margin Laba",
    value: 34.2,
    change: 2.1,
    trend: "up",
    suffix: "%",
    format: "percent",
    icon: TrendingUp,
    accent: "success",
    sparkline: [28, 29, 30, 30.5, 31, 31.8, 32.4, 33, 33.4, 33.7, 34, 34.2],
  },
  {
    key: "cashFlow",
    title: "Arus Kas",
    value: 3_240_000,
    change: -4.3,
    trend: "down",
    prefix: "Rp ",
    format: "currency",
    icon: Wallet,
    accent: "amber",
    sparkline: [3.6, 3.55, 3.5, 3.48, 3.42, 3.4, 3.38, 3.36, 3.34, 3.3, 3.26, 3.24],
  },
  {
    key: "mrr",
    title: "Pendapatan Rutin",
    value: 1_040_000,
    change: 12.7,
    trend: "up",
    prefix: "Rp ",
    format: "currency",
    icon: LineChart,
    accent: "chrome",
    sparkline: [0.78, 0.82, 0.84, 0.86, 0.88, 0.9, 0.93, 0.95, 0.97, 1.0, 1.02, 1.04],
  },
  {
    key: "burnRate",
    title: "Biaya Jalan",
    value: 680_000,
    change: 5.2,
    trend: "warning",
    prefix: "Rp ",
    format: "currency",
    icon: Flame,
    accent: "amber",
    sparkline: [560, 570, 580, 590, 600, 610, 620, 640, 650, 660, 670, 680],
  },
  {
    key: "companyValuation",
    title: "Nilai Bisnis",
    value: 94_000_000,
    change: 22.0,
    trend: "up",
    prefix: "Rp ",
    format: "currency",
    icon: Coins,
    accent: "red",
    sparkline: [62, 65, 68, 72, 75, 78, 82, 85, 87, 89, 92, 94],
  },
  {
    key: "kpiHealthScore",
    title: "Skor Kesehatan",
    value: 82,
    change: 3,
    trend: "up",
    suffix: "/100",
    format: "number",
    icon: Gauge,
    accent: "success",
    sparkline: [70, 71, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82],
  },
  {
    key: "targetAchievement",
    title: "Pencapaian Target",
    value: 78,
    change: -2,
    trend: "down",
    suffix: "%",
    format: "percent",
    icon: Target,
    accent: "amber",
    sparkline: [82, 82, 81, 81, 80, 80, 79, 79, 79, 78, 78, 78],
  },
];

export const revenueData = [
  { month: "Jan", revenue: 8_200_000, expenses: 5_100_000, profit: 3_100_000 },
  { month: "Feb", revenue: 8_900_000, expenses: 5_400_000, profit: 3_500_000 },
  { month: "Mar", revenue: 9_400_000, expenses: 5_650_000, profit: 3_750_000 },
  { month: "Apr", revenue: 9_100_000, expenses: 5_700_000, profit: 3_400_000 },
  { month: "May", revenue: 10_200_000, expenses: 6_100_000, profit: 4_100_000 },
  { month: "Jun", revenue: 10_800_000, expenses: 6_350_000, profit: 4_450_000 },
  { month: "Jul", revenue: 11_200_000, expenses: 6_500_000, profit: 4_700_000 },
  { month: "Aug", revenue: 11_500_000, expenses: 6_650_000, profit: 4_850_000 },
  { month: "Sep", revenue: 11_300_000, expenses: 6_800_000, profit: 4_500_000 },
  { month: "Oct", revenue: 11_900_000, expenses: 7_000_000, profit: 4_900_000 },
  { month: "Nov", revenue: 12_200_000, expenses: 7_150_000, profit: 5_050_000 },
  { month: "Dec", revenue: 12_480_000, expenses: 7_300_000, profit: 5_180_000 },
];

export const funnelData = [
  { stage: "Prospek", value: 12_400 },
  { stage: "Terseleksi", value: 7_820 },
  { stage: "Penawaran", value: 3_940 },
  { stage: "Negosiasi", value: 1_870 },
  { stage: "Deal", value: 940 },
];

export const departmentPerformance = [
  { dept: "POS / Bar", score: 92, target: 90 },
  { dept: "Dapur", score: 88, target: 88 },
  { dept: "Stok", score: 74, target: 85 },
  { dept: "Keuangan", score: 86, target: 90 },
  { dept: "Tim", score: 81, target: 80 },
  { dept: "Marketing", score: 79, target: 85 },
  { dept: "Pembelian", score: 71, target: 80 },
];

export const paymentMix = [
  { name: "QRIS", value: 42, color: "var(--garage-amber)" },
  { name: "Tunai", value: 28, color: "var(--garage-silver)" },
  { name: "Debit", value: 18, color: "var(--garage-red-bright)" },
  { name: "Transfer", value: 12, color: "color-mix(in srgb, var(--garage-red) 68%, black)" },
];

export const channelData = [
  { channel: "Organik", value: 38 },
  { channel: "Iklan", value: 22 },
  { channel: "Referral", value: 16 },
  { channel: "Sosial", value: 14 },
  { channel: "Email", value: 10 },
];

export const hrMetrics = {
  headcount: 64,
  attendanceRate: 96.4,
  satisfaction: 4.2,
  openRoles: 5,
  attritionRate: 8.3,
  pendingTraining: 12,
};

export const hiringFunnel = [
  { stage: "Melamar", value: 312 },
  { stage: "Screened", value: 148 },
  { stage: "Interview", value: 56 },
  { stage: "Offer", value: 14 },
  { stage: "Diterima", value: 9 },
];

export const departmentSatisfaction = [
  { dept: "POS / Bar", score: 4.4 },
  { dept: "Dapur", score: 4.1 },
  { dept: "Stok", score: 3.9 },
  { dept: "Keuangan", score: 4.3 },
  { dept: "Tim", score: 4.5 },
  { dept: "Marketing", score: 4.0 },
  { dept: "Pembelian", score: 3.7 },
];

export const customerMetrics = {
  activeUsers: 18_420,
  churnRate: 3.4,
  nps: 62,
  csat: 91,
  supportOpen: 14,
  supportSla: 96,
};

export const customerSegments = [
  { name: "Langganan", value: 48, color: "var(--garage-red-bright)" },
  { name: "Walk-in", value: 28, color: "var(--garage-amber)" },
  { name: "Korporat", value: 14, color: "var(--garage-silver)" },
  { name: "Online", value: 10, color: "color-mix(in srgb, var(--garage-red) 68%, black)" },
];

export const clvBySegment = [
  { segment: "Langganan", clv: 4_800_000 },
  { segment: "Korporat", clv: 12_400_000 },
  { segment: "Walk-in", clv: 720_000 },
  { segment: "Online", clv: 1_950_000 },
];

export const activeUsersTrend = [
  { week: "W1", users: 15_200 },
  { week: "W2", users: 15_800 },
  { week: "W3", users: 16_400 },
  { week: "W4", users: 16_900 },
  { week: "W5", users: 17_300 },
  { week: "W6", users: 17_900 },
  { week: "W7", users: 18_200 },
  { week: "W8", users: 18_420 },
];

export type RiskAlert = {
  id: string;
  title: string;
  level: Severity;
  description: string;
  department: string;
  timestamp: string; // ISO
  probability: number; // 0..1
  impact: number; // 0..1
};

export const riskAlerts: RiskAlert[] = [
  {
    id: "r-001",
    title: "Selisih kas > Rp 1.2jt",
    level: "critical",
    description: "Tutup shift POS tidak cocok pada 2 shift beruntun. Perlu approval owner.",
    department: "Keuangan",
    timestamp: "2026-06-01T03:12:00Z",
    probability: 0.85,
    impact: 0.9,
  },
  {
    id: "r-002",
    title: "Susu UHT stock < 7-day cover",
    level: "high",
    description: "Pemakaian harian naik 18%, lead time supplier 5 hari.",
    department: "Stok",
    timestamp: "2026-06-01T01:48:00Z",
    probability: 0.7,
    impact: 0.65,
  },
  {
    id: "r-003",
    title: "Anomali geofence - 3 absen",
    level: "medium",
    description: "Tiga absen kemarin tercatat lebih dari 300m dari area outlet.",
    department: "Tim",
    timestamp: "2026-05-31T22:10:00Z",
    probability: 0.5,
    impact: 0.4,
  },
  {
    id: "r-004",
    title: "CAC marketing naik +14%",
    level: "medium",
    description: "Biaya akuisisi iklan naik selama 14 hari terakhir dibanding benchmark.",
    department: "Marketing",
    timestamp: "2026-05-31T17:00:00Z",
    probability: 0.6,
    impact: 0.45,
  },
  {
    id: "r-005",
    title: "Refresh SOP jatuh tempo (Barista L2)",
    level: "low",
    description: "Refresh SOP kuartalan dibuka minggu depan. 8 staff belum konfirmasi.",
    department: "Training",
    timestamp: "2026-05-30T09:30:00Z",
    probability: 0.3,
    impact: 0.2,
  },
];

export type ActivityEvent = {
  id: string;
  time: string; // ISO
  user: string;
  action: string;
  department: string;
};

export const activityTimeline: ActivityEvent[] = [
  { id: "a-001", time: "2026-06-01T04:02:00Z", user: "Rian", action: "Approval PO #PO-2241 disetujui (Rp 4.2jt)", department: "Pembelian" },
  { id: "a-002", time: "2026-06-01T03:48:00Z", user: "Dewi", action: "Tutup shift 03 - selisih Rp 12.000", department: "POS" },
  { id: "a-003", time: "2026-06-01T03:12:00Z", user: "System", action: "Batas selisih kas terlewati - alert dibuat", department: "Keuangan" },
  { id: "a-004", time: "2026-06-01T02:30:00Z", user: "Yusuf", action: "Promo menu baru - Es Kopi Aren Premium", department: "Marketing" },
  { id: "a-005", time: "2026-06-01T01:55:00Z", user: "Sari", action: "Recount stok dikirim - 14 SKU disesuaikan", department: "Stok" },
  { id: "a-006", time: "2026-06-01T01:10:00Z", user: "Aditya", action: "1 barista baru onboarding - training plan dibuat", department: "Tim" },
  { id: "a-007", time: "2026-05-31T23:40:00Z", user: "GARAGE AI", action: "Anomali payment mix +9% ke QRIS ditandai", department: "Analitik" },
  { id: "a-008", time: "2026-05-31T22:10:00Z", user: "System", action: "Anomali geofence - 3 absen di luar area", department: "Tim" },
  { id: "a-009", time: "2026-05-31T20:00:00Z", user: "Ratna", action: "Laporan finance harian diposting - net Rp 5.18jt", department: "Keuangan" },
  { id: "a-010", time: "2026-05-31T18:25:00Z", user: "Bayu", action: "SOP Barista L2 v3.1 diperbarui", department: "Operasional" },
];

export type AiInsight = {
  id: string;
  type: InsightType;
  title: string;
  summary: string;
  action: string;
};

export const aiInsights: AiInsight[] = [
  {
    id: "i-001",
    type: "opportunity",
    title: "Dorong bundle Es Kopi Aren - proyeksi +Rp 9.4jt / bulan",
    summary: "Menu top 3 punya attach rate snack 38%. Bundle Rp 35k bisa menaikkan basket size.",
    action: "Buat draft promo",
  },
  {
    id: "i-002",
    type: "warning",
    title: "Susu UHT berisiko habis dalam 4 hari",
    summary: "Pemakaian +18% vs rata-rata 30 hari. Lead time 5 hari. Reorder 24 karton hari ini.",
    action: "Approval PO",
  },
  {
    id: "i-003",
    type: "action-needed",
    title: "2 shift selisih kas - cek POS 2",
    summary: "Kasir sama muncul di dua shift flagged. Rekomendasi recount wajib dan review CCTV.",
    action: "Buka kasus",
  },
  {
    id: "i-004",
    type: "prediction",
    title: "Omzet Desember mengarah Rp 12.8jt (+2.6% vs target)",
    summary: "Traffic akhir pekan naik dan bundle baru menarik transaksi. Confidence 78%.",
    action: "Lihat model",
  },
  {
    id: "i-005",
    type: "insight",
    title: "QRIS sudah 42% payment mix - negosiasi ulang MDR",
    summary: "Volume melewati ambang tier-2. Estimasi hemat Rp 1.1jt / bulan.",
    action: "Hubungi bank",
  },
];

export type Deal = {
  id: string;
  name: string;
  company: string;
  stage: "Qualified" | "Proposal" | "Negotiation" | "Closed Won" | "Closed Lost";
  value: number;
  owner: string;
  probability: number;
};

export const topDeals: Deal[] = [
  { id: "d-001", name: "Office Pantry — Q3 Bundle", company: "PT Sinar Karya", stage: "Negotiation", value: 24_500_000, owner: "Yusuf", probability: 70 },
  { id: "d-002", name: "Catering 200 pax", company: "Bank Mandiri Cab. Cibubur", stage: "Proposal", value: 18_200_000, owner: "Dewi", probability: 55 },
  { id: "d-003", name: "Coffee Cart Event", company: "Tokopedia HQ", stage: "Qualified", value: 12_800_000, owner: "Rian", probability: 30 },
  { id: "d-004", name: "Weekly Drop-shipping", company: "WeWork Sudirman", stage: "Closed Won", value: 9_400_000, owner: "Sari", probability: 100 },
  { id: "d-005", name: "Roastery Wholesale", company: "Kopi Kenangan SP", stage: "Negotiation", value: 32_000_000, owner: "Yusuf", probability: 65 },
  { id: "d-006", name: "Corporate Loyalty Pilot", company: "Gojek", stage: "Proposal", value: 28_500_000, owner: "Dewi", probability: 50 },
  { id: "d-007", name: "Workshop Sponsorship", company: "Niagahoster", stage: "Qualified", value: 6_400_000, owner: "Aditya", probability: 35 },
  { id: "d-008", name: "Annual Pantry Renewal", company: "PT Astra Honda", stage: "Closed Won", value: 41_000_000, owner: "Ratna", probability: 100 },
  { id: "d-009", name: "Pop-up Booth", company: "Jakarta Coffee Week", stage: "Negotiation", value: 14_200_000, owner: "Bayu", probability: 60 },
  { id: "d-010", name: "Subscription Beans", company: "PT Telkom Akses", stage: "Proposal", value: 22_800_000, owner: "Sari", probability: 45 },
];

export type Notification = {
  id: string;
  category: "critical" | "warning" | "info";
  title: string;
  detail: string;
  time: string;
  read: boolean;
};

export const seedNotifications: Notification[] = [
  { id: "n-001", category: "critical", title: "Selisih kas Rp 1.2jt", detail: "POS 2 - Shift 03", time: "2026-06-01T03:12:00Z", read: false },
  { id: "n-002", category: "warning", title: "Susu UHT < 7-day cover", detail: "Reorder 24 cartons", time: "2026-06-01T01:48:00Z", read: false },
  { id: "n-003", category: "warning", title: "Anomali geofence", detail: "3 absen > 300m", time: "2026-05-31T22:10:00Z", read: false },
  { id: "n-004", category: "info", title: "PO #PO-2241 disetujui", detail: "Rp 4.2jt - Pembelian", time: "2026-06-01T04:02:00Z", read: true },
  { id: "n-005", category: "info", title: "Digest mingguan GARAGE AI siap", detail: "Lihat highlight", time: "2026-05-31T18:00:00Z", read: true },
];

export const budgetVsActual = [
  { name: "HPP", budget: 4_200_000, actual: 4_410_000 },
  { name: "Payroll Tim", budget: 1_800_000, actual: 1_780_000 },
  { name: "Marketing", budget: 600_000, actual: 720_000 },
  { name: "Operasional", budget: 500_000, actual: 480_000 },
  { name: "Lainnya", budget: 300_000, actual: 340_000 },
];

export const projectProgress = [
  { project: "Rollout POS v2", owner: "Bayu", progress: 82, status: "Aman" },
  { project: "Pilot KDS dapur", owner: "Sari", progress: 56, status: "Perlu perhatian" },
  { project: "Refresh SOP baru", owner: "Aditya", progress: 91, status: "Aman" },
  { project: "Program loyalty", owner: "Yusuf", progress: 34, status: "Tertinggal" },
  { project: "Launch cold-brew", owner: "Dewi", progress: 67, status: "Aman" },
];

export const complianceChecklist = [
  { item: "Audit food safety Q2", status: "passed" as const },
  { item: "Lapor pajak Mei 2026", status: "passed" as const },
  { item: "Refill APAR", status: "pending" as const },
  { item: "Review kontrak karyawan", status: "passed" as const },
  { item: "SOP privasi data", status: "pending" as const },
  { item: "POS PCI scan", status: "passed" as const },
];

// Decorative icon list used by various sections
export const sectionIcons: Record<string, LucideIcon> = {
  insight: Sparkles,
  risk: ShieldAlert,
  alert: AlertTriangle,
  health: BadgeCheck,
  activity: Activity,
};
