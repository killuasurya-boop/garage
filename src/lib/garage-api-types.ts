import type {
  GarageMenuItem,
  MenuCategory,
  Role,
} from "@/lib/garage-data";

export type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

export type HealthData = {
  ok: boolean;
  database: {
    configured: boolean;
    status: string;
  };
};

export type Tone = "good" | "watch" | "warn" | "risk";
export type CartLine = {
  itemId: string;
  variantId: string;
  qty: number;
  // Catatan per line: "less ice", "no garlic", "extra spicy" — dikirim ke kitchen
  note?: string;
};
export type MenuItem = GarageMenuItem;
export type MenuVariant = MenuItem["variants"][number];
export type MenuGroup = "Dapur" | "Bar" | "Lainnya";
export type MenuFilter = "All" | MenuGroup | MenuCategory;

export const MENU_GROUP_CATEGORIES: Record<MenuGroup, MenuCategory[]> = {
  Dapur: ["Makanan", "Cemilan"],
  Bar: ["Coffee", "Non-Coffee"],
  Lainnya: ["Minuman Botol", "Rokok"],
};

/**
 * Kelompok POS sebuah produk: dari master kategori (item.menuGroup) bila ada,
 * lalu daftar bawaan; kategori baru tanpa info grup → "Lainnya" (tetap terlihat).
 */
export function menuGroupForCategory(category: MenuCategory, group?: MenuGroup | null): MenuGroup {
  if (group) return group;
  if (MENU_GROUP_CATEGORIES.Lainnya.includes(category)) return "Lainnya";
  if (MENU_GROUP_CATEGORIES.Dapur.includes(category)) return "Dapur";
  if (MENU_GROUP_CATEGORIES.Bar.includes(category)) return "Bar";
  return "Lainnya";
}

export function menuFilterMatches(filter: MenuFilter, category: MenuCategory, group?: MenuGroup | null): boolean {
  if (filter === "All") return true;
  if (filter === "Dapur" || filter === "Bar" || filter === "Lainnya") {
    return menuGroupForCategory(category, group) === filter;
  }
  return filter === category;
}

/** Sub-kategori per kelompok POS dari menu yang sedang aktif (urut master kategori). */
export function menuSubCategoriesFrom(
  items: Array<{ category: MenuCategory; menuGroup?: MenuGroup; categorySortOrder?: number }>,
): Record<MenuGroup, MenuCategory[]> {
  const order = new Map<string, { group: MenuGroup; sort: number }>();
  for (const item of items) {
    if (order.has(item.category)) continue;
    order.set(item.category, {
      group: menuGroupForCategory(item.category, item.menuGroup),
      sort: item.categorySortOrder ?? 9999,
    });
  }
  const result: Record<MenuGroup, MenuCategory[]> = { Dapur: [], Bar: [], Lainnya: [] };
  for (const [category, info] of [...order.entries()].sort((a, b) => a[1].sort - b[1].sort || a[0].localeCompare(b[0]))) {
    result[info.group].push(category);
  }
  return result;
}

export type OrderType = "dine-in" | "takeaway" | "delivery";

export type DashboardMetric = {
  id: "revenue" | "cash" | "orders" | "approvals";
  label: string;
  value: string;
  delta: string;
  tone: Tone;
};

export type DashboardData = {
  headlineMetrics: DashboardMetric[];
  salesTrend: Array<{ hour: string; sales: number }>;
  operationalSignals: Array<{ label: string; value: string; status: string }>;
};

export type KitchenOrder = {
  id: string;
  table: string;
  channel: string;
  station: string;
  status: string;
  elapsed: number;
  items: string[];
  itemNotes: Record<string, string>;
  internalNotes: string | null;
  priority: string;
  targetMinutes: number;
  targetGroup: string;
  acceptedAt: string | null;
  acceptedByName: string | null;
  readyAt: string | null;
  readyByName: string | null;
  deliveredAt: string | null;
  deliveredByName: string | null;
  claimedBy?: string | null;
  claimedByName?: string | null;
  createdAt: string;
  // Sequence dalam session meja yang sama: 1 = order pertama, 2+ = add-on
  addonSequence?: number;
  // Nomor antrian harian (cocok dengan struk) — untuk ditampilkan di papan Siap.
  queueNo?: number | null;
  // Identitas Production Hub: Nama + Meja + Order ID tidak boleh hilang.
  customerName?: string | null;
  orderNo?: string | null;
  orderId?: string | null;
  claimedAt?: string | null;
  issueReason?: string | null;
  // Serah-terima: helper Bar/Dapur ACC & memanggil waiter (claimedBy = waiter
  // yang dipanggil; null = siapa saja).
  handoverAt?: string | null;
  handoverByName?: string | null;
};

// ─── Production Hub ─────────────────────────────────────────────────────────

export type ProductionItemView = {
  id: string;
  label: string;
  qty: number;
  note: string | null;
  status: "waiting" | "processing" | "ready" | string;
  batchId: string | null;
  batchNo: string | null;
};

export type ProductionTicketView = {
  ticketNo: string;
  orderId: string | null;
  orderNo: string | null;
  queueNo: number | null;
  customerName: string | null;
  identity: string;
  table: string;
  channel: string;
  station: "Bar" | "Food";
  status: "queue" | "cooking" | "ready" | string;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  targetMinutes: number;
  claimedByName: string | null;
  handoverAt: string | null;
  handoverByName: string | null;
  issueReason: string | null;
  addonSequence: number;
  // Waktu chit tercetak di printer stasiun (null = belum dicetak).
  chitPrintedAt: string | null;
  items: ProductionItemView[];
  // Tiket lama tanpa porsi terstruktur (dibuat sebelum Production Hub).
  legacy: boolean;
  pendingBatchNos: string[];
};

export type ProductionAllocationView = {
  id: string;
  ticketNo: string | null;
  orderNo: string | null;
  customerName: string | null;
  identity: string;
  table: string;
  qty: number;
  note: string | null;
  allocated: boolean;
};

export type ProductionBatchView = {
  id: string;
  batchNo: string;
  station: "Bar" | "Food";
  itemLabel: string;
  note: string | null;
  totalQty: number;
  status: string;
  startedAt: string;
  startedByName: string | null;
  allocations: ProductionAllocationView[];
};

export type ProductionBatchSuggestionView = {
  key: string;
  station: "Bar" | "Food";
  itemLabel: string;
  note: string | null;
  totalQty: number;
  oldestAt: string;
  items: Array<{
    id: string;
    ticketNo: string;
    identity: string;
    table: string;
    orderNo: string | null;
    qty: number;
  }>;
};

export type ProductionStationLoad = {
  station: "Bar" | "Food";
  waiting: number;
  processing: number;
  ready: number;
  oldestWaitingMinutes: number | null;
  avgProductionMinutes: number | null;
  slaRisk: number;
};

export type ProductionBoard = {
  generatedAt: string;
  batchWindowSec: number;
  tickets: ProductionTicketView[];
  batches: ProductionBatchView[];
  suggestions: ProductionBatchSuggestionView[];
  load: ProductionStationLoad[];
  canOperate: { Bar: boolean; Food: boolean };
  // Helper/serah-terima: boleh ACC & panggil waiter untuk produk READY.
  canHandover: { Bar: boolean; Food: boolean };
  // Waiter yang sedang login (urut paling sedikit antaran berjalan).
  waiters: Array<{ id: string; name: string; activeDeliveries: number }>;
  // Tiket yang dibatalkan (order di-void) dalam 15 menit terakhir — tanda
  // "hentikan produksi" untuk Bar/Dapur.
  cancelled: Array<{
    ticketNo: string;
    orderNo: string | null;
    identity: string;
    table: string;
    station: "Bar" | "Food";
    reason: string | null;
    cancelledAt: string;
    items: string[];
  }>;
};

export type KitchenPerformanceRow = {
  staffName: string;
  stations: string[];
  totalTickets: number;
  totalProducts: number;
  onTimeProducts: number;
  onTimeTickets: number;
  lateTickets: number;
  lateRate: number;
  score: number;
  bonusPoints: number;
  warningLevel: "Aman" | "SP1" | "SP2" | "SP3" | "Data Belum Cukup";
  avgProductionMinutes: number | null;
};

export type KitchenPerformanceData = {
  range: "today" | "month";
  generatedAt: string;
  summary: {
    onTimeTickets: number;
    lateTickets: number;
    totalTickets: number;
    totalProducts: number;
    bonusPoints: number;
    avgScore: number | null;
    avgProductionMinutes: number | null;
    activeTickets: number;
  };
  rows: KitchenPerformanceRow[];
};

export type KitchenShiftReport = {
  date: string;
  generatedAt: string;
  shifts: Array<{
    sessionId: string;
    shiftNumber: number;
    shiftLabel: string;
    cashierName: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    foodTickets: number;
    readyTickets: number;
    activeTickets: number;
    totalItems: number;
    totalFee: number;
    kitchenFee: number;
  }>;
  totals: {
    shifts: number;
    foodTickets: number;
    readyTickets: number;
    activeTickets: number;
    totalItems: number;
    totalFee: number;
    kitchenFee: number;
  };
};

export type InventoryItem = {
  sku: string;
  name: string;
  alternativeName: string;
  category: string;
  usageArea: string;
  onHand: number;
  min: number;
  unit: string;
  packageSize: string;
  unitCost?: number;
  status: string;
  stage?: string;
  movement: string;
};

export type PaymentBreakdown = {
  method: string;
  amount: number;
  share: number;
};

export type ClosingChecklistItem = {
  label: string;
  done: boolean;
};

export type Customer = {
  id?: string;
  name: string;
  phone: string;
  tier: string;
  points: number;
  visits: number;
  lastOrder: string;
  flag: string;
  annualSpend?: number;
  memberCode?: string | null;
  cardTier?: string | null;
  membershipSince?: Date | string | null;
  ultraCandidate?: boolean | null;
  ultraApprovedAt?: Date | string | null;
  ultraApprovedBy?: string | null;
  staffNote?: string | null;
  birthday?: string | null;
  referralCode?: string | null;
  referredByCode?: string | null;
  address?: string | null;
  photoUrl?: string | null;
  expiresAt?: Date | string | null;
  createdAt?: Date | string | null;
  isMember?: boolean;
};

export type MemberProfile = {
  id?: string;
  name: string;
  phone: string;
  level: string;
  tier: string;
  totalPoints: number;
  points: number;
  visits: number;
  lastOrder: string;
  flag: string;
  multiplier: number;
  perks: string[];
  annualSpend?: number;
  birthday?: string | null;
  referralCode?: string | null;
  referredByCode?: string | null;
  progress: {
    currentLevel: string;
    nextLevel: string | null;
    min: number;
    next: number | null;
    percent: number;
    remaining: number;
  };
};

export type PosMemberLookupResponse = {
  accountStatus: string;
  customerId: string;
  member: MemberProfile;
};

export type PosMemberCreateResponse = PosMemberLookupResponse & {
  temporaryPin: string;
};

export type MemberReward = {
  memberName: string;
  level: string;
  pointsEarned: number;
  totalPoints: number;
  upgradeNotification: string | null;
};

export type Approval = {
  id: string;
  type: string;
  requester: string;
  amount: string;
  reason: string;
  risk: string;
  age: string;
  status?: string;
};

export type AuditLog = {
  time: string;
  actor: string;
  action: string;
  object: string;
  device: string;
  status: string;
};

export type ServiceRule = {
  label: string;
  value: string;
};

export type SiteAsset = {
  slot: string;
  publicUrl: string;
  width: number;
  height: number;
  alt: string;
  sizeBytes: number;
  mimeType: string;
  version: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CashSession = {
  id: string | null;
  code: string;
  /** ISO waktu buka shift (untuk peringatan shift lupa ditutup). */
  openedAt?: string;
  openingCash: number;
  expectedCash: number;
  actualCash: number | null;
  discrepancy: number;
  discrepancyStatus?: string;
  status: string;
  checklist: ClosingChecklistItem[];
  denominations?: Record<string, number>;
  closingNote?: string | null;
  managerSignOffAt?: string | null;
  qrisRecorded?: number | null;
  qrisCounted?: number | null;
  qrisDiscrepancy?: number | null;
  floatLeft?: number | null;
  depositAmount?: number | null;
  resetTables?: {
    requested: boolean;
    mode?: "none" | "completed" | "all";
    count: number;
  };
};

export type GarageMe = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  role: Role;
  outlet: {
    id: string;
    code: string;
    name: string;
    timezone: string;
  };
  shift: string;
  device: string;
  // Workstation Production Hub ("bar" | "dapur" | "all" | null).
  workstation?: string | null;
};

export type GarageBootstrapData = {
  me: GarageMe;
  dashboard: DashboardData;
  cartSeed: CartLine[];
  menuItems: MenuItem[];
  kitchenOrders: KitchenOrder[];
  inventoryItems: InventoryItem[];
  stockMovements: string[];
  paymentBreakdown: PaymentBreakdown[];
  cashSession: CashSession;
  /** Shift milik user yang login di outlet ini (POS). Owner/Manajer: bukan shift terbaru outlet. */
  posCashSession?: CashSession;
  closingChecklist: ClosingChecklistItem[];
  customers: Customer[];
  approvals: Approval[];
  auditLogs: AuditLog[];
  serviceRules: ServiceRule[];
  settings: AppSettings;
};

// Single source of truth — re-export dari garage-app-settings-types.ts.
// Dulu type ini duplikat & ketinggalan saat key baru ditambah; sekarang sinkron.
// Import + re-export (bukan cuma re-export) supaya bisa dipake di file ini juga.
import type { AppSettings as _AppSettings } from "./garage-app-settings-types";
export type AppSettings = _AppSettings;

export type OrderReceipt = {
  /** Struk khusus Delivery (null/undefined untuk order biasa). */
  delivery?: {
    customerName?: string | null;
    customerPhone?: string | null;
    address?: string | null;
    courierName?: string | null;
    fee?: number | null;
  } | null;
  invoiceNo: string;
  invoiceStatus: string;
  orderNo: string;
  queueNo?: number | null;
  ticketNo: string;
  ticketNos: string[];
  createdAt: string;
  outlet: {
    code: string;
    name: string;
  };
  cashier: {
    name: string;
    role: Role;
    device: string;
  };
  tableLabel: string;
  channel: string;
  payment: {
    method: string;
    provider: string | null;
    reference: string | null;
    cashReceived: number | null;
    change: number | null;
  };
  customer?: {
    name: string | null;
    phone: string | null;
  };
  invoicePdfUrl?: string | null;
  invoiceWebUrl?: string | null;
  whatsappInvoiceUrl?: string | null;
  items: Array<{
    name: string;
    variant: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  service: number;
  tax: number;
  discount: number;
  total: number;
  settings?: Pick<
    AppSettings,
    | "serviceChargePct"
    | "taxPct"
    | "defaultPrinterName"
    | "receiptCopies"
    | "brandName"
    | "brandTagline"
    | "outletAddress"
    | "outletPhone"
    | "npwp"
    | "receiptFooter"
  >;
  // Diset client-side saat reprint dari Riwayat Struk; struk akan menampilkan
  // badge "CETAK ULANG" untuk audit & mencegah double-spending receipt.
  isReprint?: boolean;
  reprintAt?: string;
  memberReward: MemberReward | null;
  brand: {
    deliveryWhatsapp: string;
    social: {
      instagram: string;
      facebook: string;
      tiktok: string;
      youtube: string;
    };
  };
};

export type OrderCreateResponse = {
  orderId?: string;
  orderNo: string;
  ticketNo: string;
  ticketNos: string[];
  subtotal: number;
  service: number;
  tax: number;
  discount: number;
  total: number;
  memberReward: MemberReward | null;
  invoicePdfUrl?: string | null;
  invoiceWebUrl?: string | null;
  whatsappInvoiceUrl?: string | null;
  receipt: OrderReceipt;
};

/** Cuplikan paket event di baris order (tanpa HPP — aman untuk respons publik). */
export type OrderItemPackage = {
  groupId: string;
  entryName: string;
  packagePrice: number;
  entryQuantity: number;
};

export type CustomerOrderItem = {
  id: string;
  menuItemId?: string | null;
  itemName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  note?: string | null;
  package?: OrderItemPackage | null;
};

export type CustomerOrder = {
  eventId?: string | null;
  eventTitle?: string | null;
  id: string;
  orderNo: string;
  queueNo?: number | null;
  tableLabel: string;
  channel: string;
  status: "pending_cashier" | "awaiting_payment" | "accepted" | "paid" | "rejected" | string;
  orderSource: "qr_table" | "qr_takeaway" | "instagram" | "campaign" | string;
  customerMode: "guest" | "member" | string;
  customerName: string | null;
  customerPhone: string | null;
  customerNote: string | null;
  campaign: string | null;
  // Order online: "dine-in" | "takeaway" | "delivery" (null = lama/POS).
  fulfillment?: "dine-in" | "takeaway" | "delivery" | string | null;
  deliveryAddress?: string | null;
  deliveryFee?: number;
  deliveryStatus?: "preparing" | "picked_up" | "on_the_way" | "delivered" | string | null;
  courierUserId?: string | null;
  courierName?: string | null;
  courierLocationAt?: string | null;
  deliveredAt?: string | null;
  deliveryProofUrl?: string | null;
  paymentProofUrl?: string | null;
  paymentProofAt?: string | null;
  whatsappInvoiceStatus: "not_sent" | "sent" | "failed" | string;
  whatsappInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  invoiceWebUrl: string | null;
  invoicePdfGeneratedAt: string | null;
  subtotal: number;
  service: number;
  tax: number;
  discount: number;
  total: number;
  createdAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  paymentMethod: string | null;
  paymentProvider: string | null;
  paymentReference: string | null;
  paymentStatus: string | null;
  invoiceNo: string | null;
  invoiceStatus: string | null;
  invoiceIssuedAt: string | null;
  cashFlowStatus: string | null;
  cashReceived: number | null;
  cashDeposited: number | null;
  cashHeldBy: string | null;
  cashReceivedAt: string | null;
  cashDepositedAt: string | null;
  cashierConfirmedAt: string | null;
  items: CustomerOrderItem[];
};

export type CustomerOrderCreateResponse = {
  order: CustomerOrder;
  whatsapp: {
    status: string;
    url: string | null;
  };
  memberCta: string;
  /** Kode gabung meja (dine-in) untuk teman semeja. */
  joinCode?: string | null;
};

export type CustomerOrderActionResponse = {
  order: CustomerOrder;
  ticketNos: string[];
};

export type PublicOrderStatus = {
  id: string | null;
  orderNo: string;
  tableLabel: string;
  orderStatus: string;
  kitchenStatus: "waiting_cashier" | "queue" | "cooking" | "ready" | "delivered" | "rejected" | "completed";
  estimatedMinutes: number | null;
  stations?: Array<{
    station: string;
    status: string;
    etaSeconds: number | null;
    targetSeconds: number;
    cookingStartedAt: string | null;
    verb?: string;
  }>;
  fulfillment?: "dine-in" | "takeaway" | "delivery";
  deliveryStatus?: string | null;
  deliveryFee?: number;
  rejectionReason?: string | null;
  steps?: Array<{ key: string; label: string; hint: string; state: "done" | "current" | "todo" }>;
  courier?: {
    name: string;
    lat: number | null;
    lng: number | null;
    locationAt: string | null;
    distanceKm: number | null;
  } | null;
  message: string;
  invoicePdfUrl?: string | null;
  invoiceWebUrl?: string | null;
  whatsappInvoiceUrl?: string | null;
  tableJoin?: { tableNumber: string; tableLabel: string; joinCode: string } | null;
  updatedAt: string;
};

export type TableLiveBill = {
  id: string;
  orderNo: string;
  status: string;
  total: number;
  createdAt: string;
};

export type TableHistoryBill = TableLiveBill & {
  customerName: string | null;
};

export type TableHistoryResponse = {
  tableNumber: string;
  tableLabel: string;
  bills: TableHistoryBill[];
};

export type TableOrderItemLine = {
  id: string;
  itemName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  note: string | null;
  // Station dapur item (Dapur = makanan/cemilan, Bar = minuman).
  station: "Dapur" | "Bar";
};

// Status tiket dapur per station untuk satu order. Status per item tidak ada
// di data — item mewarisi status tiket station-nya. status null = belum masuk dapur.
export type TableOrderStation = {
  station: "Dapur" | "Bar";
  status: string | null;
  ticketNo: string;
  ticketNos: string[];
  targetMinutes: number;
};

export type TableOrderBill = {
  id: string;
  orderNo: string;
  status: string;
  total: number;
  createdAt: string;
  customerName: string | null;
  customerPhone?: string | null;
  customerNote: string | null;
  // Link invoice publik (/invoice/{token}) untuk dikirim lewat WhatsApp.
  invoiceUrl?: string | null;
  // Bill hasil pisah bill per produk menunjuk ke order meja asalnya.
  parentOrderId?: string | null;
  canSplit?: boolean;
  canPay?: boolean;
  stations: TableOrderStation[];
  items: TableOrderItemLine[];
};

export type TableOrderItemsResponse = {
  tableNumber: string;
  tableLabel: string;
  bills: TableOrderBill[];
};

export type TableLiveRow = {
  tableNumber: string;
  tableLabel: string;
  status:
    | "empty"
    | "pending"
    | "awaiting_payment"
    | "accepted"
    | "paid"
    | "ready"
    | "mixed"
    | "needs_cleaning"
    | "cleaning"
    | "reserved"
    | "rejected"
    | string;
  currentOrderId: string | null;
  orderNo: string | null;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  timerMinutes: number;
  kitchenStatus: string | null;
  needsCleaning: boolean;
  lastStatusAt: string | null;
  bills?: TableLiveBill[];
  paidBillCount?: number;
  openBillCount?: number;
  /** Area dari menu Atur Meja (mis. "Indoor"). Kosong bila belum diatur. */
  area?: string;
  capacity?: number;
  active?: boolean;
  /** Bill belum lunas dari hari sebelumnya → perlu dicek kasir. */
  staleFromPreviousDay?: boolean;
  /** Total semua bill sesi (lunas + belum). */
  billTotal?: number;
  /** Meja sedang dipilih pelanggan di menu digital sampai waktu ini. */
  heldUntil?: string | null;
  /** Menit sejak aktivitas terakhir meja (0 bila kosong). */
  idleMinutes?: number;
  /** Meja terisi melewati batas "meja lupa ditutup" (Pengaturan → Meja). */
  idleWarning?: boolean;
};

export type OutletTableConfig = {
  tableNumber: string;
  tableLabel: string;
  area: string;
  capacity: number;
  active: boolean;
};

export type OutletTablesData = {
  outletId: string | null;
  configured: boolean;
  maxTableNumber: number;
  tables: OutletTableConfig[];
};

export type PublicTableLiveRow = {
  tableNumber: string;
  tableLabel: string;
  status: "empty" | "pending" | "occupied" | "needs_cleaning" | "unavailable" | string;
  available: boolean;
  needsCleaning: boolean;
  lastStatusAt: string | null;
};

export type VoucherValidation = {
  valid: boolean;
  code: string;
  title: string | null;
  discount: number;
  message: string;
};

export type VoucherRecord = {
  id: string;
  code: string;
  title: string;
  type: string;
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  audience: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  createdAt: string;
};

export type PrintJob = {
  id: string;
  jobType: string;
  target: string;
  status: string;
  orderId: string | null;
  ticketNo: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  printedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DisplayQueueOrder = {
  ticketNo: string;
  orderNo: string | null;
  tableLabel: string;
  station: string;
  status: string;
  targetGroup: string;
  elapsed: number;
  targetMinutes: number;
  createdAt: string;
};

export type ShiftHandoverReport = {
  id: string;
  status: string;
  summary: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
};

export type QrControlInsights = {
  generatedAt: string;
  rangeLabel: string;
  pendingSlaMinutes: number;
  filters: {
    status: string;
    source: string;
    table: string;
  };
  summary: {
    total: number;
    pending: number;
    awaitingPayment: number;
    accepted: number;
    paid: number;
    rejected: number;
    totalSales: number;
    averageProcessingMinutes: number | null;
    pendingOverSla: number;
    uniqueCustomers: number;
    repeatGuests: number;
  };
  topTables: Array<{
    tableLabel: string;
    total: number;
    paid: number;
    rejected: number;
    revenue: number;
  }>;
  pendingAlerts: Array<{
    orderId: string;
    orderNo: string;
    tableLabel: string;
    customerName: string | null;
    customerPhone: string | null;
    minutesWaiting: number;
    total: number;
  }>;
  repeatCustomers: Array<{
    name: string;
    phone: string;
    label: string;
    isMember: boolean;
    totalOrders: number;
    totalSpend: number;
    lastVisit: string;
    favoriteItem: string;
    suggestedAction: string;
    whatsapp: {
      receiptUrl: string | null;
      promoUrl: string;
      reviewUrl: string;
      memberUrl: string;
    };
  }>;
  rejectedReasons: Array<{
    reason: string;
    count: number;
  }>;
  recentOrders: CustomerOrder[];
  shiftReport: {
    gate: "GO" | "WATCH";
    lines: string[];
  };
};

export type AiAgentIntent =
  | "cart_review"
  | "upsell"
  | "inventory_warning"
  | "kitchen_warning"
  | "finance_check"
  | "approval_assist"
  | "daily_brief"
  | "sop_knowledge"
  | "owner_ceo_brain"
  | "shift_copilot"
  | "general_assist";

export type AiDataAccessLevel = "basic" | "operational" | "financial" | "executive";

export type AiProviderProfile = "fast" | "manager" | "finance" | "async";

export type AiChatMode = "operational" | "owner_free_chat";

export type AiSubAgentId =
  | "supervisor"
  | "pos_agent"
  | "inventory_agent"
  | "kitchen_agent"
  | "finance_guard_agent"
  | "approval_agent"
  | "sop_knowledge_agent"
  | "daily_brief_agent";

export type AiAutonomyMode = "read_only" | "draft" | "controlled";

export type AiSafetyLevel = "safe" | "draft" | "critical";

export type AiRiskLevel = "low" | "medium" | "high";

export type AiApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

export type AiAgentHandoff = {
  from: AiSubAgentId;
  to: AiSubAgentId;
  reason: string;
};

export type AiAgentPlanStep = {
  agentId: AiSubAgentId;
  title: string;
  detail: string;
  status: "planned" | "completed" | "blocked";
};

export type AiSupervisorDecision = {
  autonomyMode: AiAutonomyMode;
  agentsUsed: AiSubAgentId[];
  handoffs: AiAgentHandoff[];
  agentPlan: AiAgentPlanStep[];
  riskLevel: AiRiskLevel;
  approvalRequired: boolean;
  approvalStatus: AiApprovalStatus;
  reason: string;
};

export type AiActionDraft = {
  id?: string;
  type: "approval" | "inventory" | "kitchen" | "finance" | "pos" | "sop";
  actionType?: string;
  agentId?: AiSubAgentId;
  title: string;
  detail: string;
  risk: "low" | "medium" | "high";
  riskLevel?: AiRiskLevel;
  safetyLevel?: AiSafetyLevel;
  approvalStatus?: AiApprovalStatus;
  approvalRequired: boolean;
  createdAt?: string;
};

export type AiTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AiBusinessFreshness = {
  generatedAt: string;
  dataSourcesUsed: string[];
  staleSources: string[];
  knowledgeBaseConfigured: boolean;
  lastAgentRunAt: string | null;
  lastReportGeneratedAt: string | null;
};

export type AiPosAgentResponse = {
  runId?: string;
  ownerChatHistoryId?: string;
  mode?: AiChatMode;
  response: string;
  intent: AiAgentIntent;
  urgency: "low" | "medium" | "high";
  confidence: number;
  requiresApproval: boolean;
  requiresHumanApproval?: boolean;
  suggestedActions: string[];
  operationalWarnings: string[];
  contextUsed: string[];
  nextStep: string;
  dataAccessLevel?: AiDataAccessLevel;
  actionDrafts?: AiActionDraft[];
  profile?: AiProviderProfile;
  contextIntent?: AiAgentIntent;
  providerUsed?: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  latencyMs?: number;
  tokenUsage?: AiTokenUsage | null;
  agentsUsed?: AiSubAgentId[];
  handoffs?: AiAgentHandoff[];
  agentPlan?: AiAgentPlanStep[];
  riskLevel?: AiRiskLevel;
  approvalRequired?: boolean;
  approvalStatus?: AiApprovalStatus;
  businessFreshness?: AiBusinessFreshness;
};

export type AiOwnerChatHistoryRecord = {
  id: string;
  runId: string | null;
  prompt: string;
  response: string;
  provider: string | null;
  model: string | null;
  profile: string | null;
  tool: string | null;
  dataAccessLevel: string | null;
  latencyMs: number | null;
  tokenUsage: AiTokenUsage | null;
  createdAt: string;
};

export type AiOwnerChatHistoryListResponse = {
  history: AiOwnerChatHistoryRecord[];
};

export type AiOwnerChatHistoryDetailResponse = {
  history: AiOwnerChatHistoryRecord;
};

export type AiOwnerChatHistoryMutationResponse = {
  deleted: number;
};

export type AiAgentConfigPublic = {
  agentId: AiSubAgentId;
  label: string;
  description: string;
  enabled: boolean;
  autonomyMode: AiAutonomyMode;
  maxRiskLevel: AiRiskLevel;
  allowedIntents: string[];
  sortOrder: number;
  updatedAt: string | null;
};

export type AiAgentsResponse = {
  agents: AiAgentConfigPublic[];
  autonomyModes: AiAutonomyMode[];
  riskLevels: AiRiskLevel[];
};

export type AiAgentReportPeriod = "daily" | "monthly" | "yearly";

export type AiAgentReportResponse = {
  fileName: string;
  generatedAt: string;
  days: number;
  period: AiAgentReportPeriod;
  date: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  rowCounts: {
    configs: number;
    runs: number;
    drafts: number;
    events: number;
    orders: number;
    orderItems: number;
    payments: number;
    cashSessions: number;
    inventory: number;
    stockMovements: number;
    kitchenTickets: number;
    approvals: number;
    customers: number;
  };
  downloadUrl: string;
  driveFileId: string | null;
  driveWebUrl: string | null;
  drive: {
    configured: boolean;
    uploaded: boolean;
    authMode?: "service_account" | "google_oauth" | "missing";
    fileId: string | null;
    name: string | null;
    webViewLink: string | null;
    webContentLink: string | null;
    message: string;
  };
};

export type GoogleDriveConnectionStatusResponse = {
  configured: boolean;
  authMode: "service_account" | "google_oauth" | "missing";
  oauthClientConfigured: boolean;
  oauthConnected: boolean;
  oauthEmail: string | null;
  oauthName: string | null;
  connectedAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastUploadAt: string | null;
  folderIdConfigured: boolean;
  serviceAccountConfigured: boolean;
  serviceAccountEmail: string | null;
  redirectUri: string;
  message: string;
};

export type GoogleDriveDisconnectResponse = {
  disconnected: boolean;
};

export type AiLogCleanupResponse = {
  policy: {
    retentionDays: number;
    intervalDays: number;
  };
  result?: {
    retentionDays: number;
    intervalDays: number;
    cutoff: string;
    deleted: {
      auditLogs: number;
      agentRuns: number;
      agentEvents: number;
      expiredSnapshots: number;
    };
    totalDeleted: number;
    skipped: boolean;
    reason: "manual" | "interval" | "recently_checked";
  };
};

export type AiKnowledgeUploadFileResult = {
  fileName: string;
  size: number;
  status: "completed" | "failed" | "in_progress" | "skipped";
  message: string;
  openAiFileId: string | null;
  vectorStoreFileId: string | null;
};

export type AiKnowledgeUploadResponse = {
  vectorStoreConfigured: boolean;
  vectorStoreId: string | null;
  uploadedCount: number;
  failedCount: number;
  files: AiKnowledgeUploadFileResult[];
};

export type AiKnowledgeFileRecord = {
  vectorStoreFileId: string;
  openAiFileId: string | null;
  fileName: string;
  status: "completed" | "failed" | "in_progress" | "cancelled" | "unknown";
  sizeBytes: number | null;
  createdAt: string | null;
  lastError: string | null;
};

export type AiKnowledgeListResponse = {
  vectorStoreConfigured: boolean;
  vectorStoreId: string | null;
  status: "ready" | "empty" | "missing" | "error";
  message: string;
  files: AiKnowledgeFileRecord[];
};

export type AiKnowledgeDeleteResponse = {
  deleted: boolean;
  vectorStoreFileId: string;
  openAiFileId: string | null;
  message: string;
};

export type AiJobsStatusResponse = {
  auth: {
    configured: boolean;
  };
  drive: {
    configured: boolean;
    folderIdConfigured: boolean;
    serviceAccountConfigured: boolean;
    serviceAccountEmail: string | null;
    oauthClientConfigured?: boolean;
    oauthConnected?: boolean;
    oauthEmail?: string | null;
    oauthName?: string | null;
    authMode?: "service_account" | "google_oauth" | "missing";
    lastStatus?: string | null;
    lastError?: string | null;
    lastUploadAt?: string | null;
    redirectUri?: string;
    message?: string;
  };
  report: {
    path: string;
    schedule: string;
    localTimeLabel: string;
    timeZone: string;
    offsetDays: number;
  };
  cleanup: {
    path: string;
    schedule: string;
    localTimeLabel: string;
    retentionDays: number;
    intervalDays: number;
  };
  doctor: {
    path: string;
    schedule: string;
    localTimeLabel: string;
    autoHeal: boolean;
  };
  shiftCopilot?: {
    path: string;
    schedule: string;
    localTimeLabel: string;
    mode: string;
    description: string;
  };
};

export type AiActionRegistryPublic = {
  actionType: string;
  label: string;
  description: string;
  safetyLevel: AiSafetyLevel;
  requiresApproval: boolean;
  enabled: boolean;
  allowedRoles: Role[];
  updatedAt: string | null;
};

export type AiActionDraftRecord = {
  id: string;
  runId: string | null;
  actionType: string;
  agentId: AiSubAgentId;
  title: string;
  detail: string;
  riskLevel: AiRiskLevel;
  safetyLevel: AiSafetyLevel;
  approvalStatus: AiApprovalStatus;
  payload: Record<string, unknown>;
  createdBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiActionsResponse = {
  actions: AiActionDraftRecord[];
  registry: AiActionRegistryPublic[];
};

export type AiOperationalAlertPriority = "low" | "medium" | "high";

export type AiWhatsappAlertTarget = {
  phone: string;
  url: string;
  roleGroup: string;
};

export type AiStaffSupervisionKind = "mistake" | "correction" | "coaching";

export type AiOperationalAlert = {
  id: string;
  actionType: string;
  agentId: string;
  title: string;
  detail: string;
  priority: AiOperationalAlertPriority;
  targetRoles: string[];
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
  runId: string | null;
  approvalStatus: AiApprovalStatus;
  source: string;
  fingerprint: string;
  whatsappTargets: AiWhatsappAlertTarget[];
  category: "staff_supervision" | "operational";
  supervisionKind: AiStaffSupervisionKind | null;
  staffGroup: "floor" | "kitchen" | "inventory" | "control" | null;
  fixAction: string | null;
};

export type AiAutopilotStatusResponse = {
  active: boolean;
  withinHours: boolean;
  hoursLabel: string;
  whatsappHighAlerts: boolean;
  message: string;
};

export type AiAlertsResponse = {
  alerts: AiOperationalAlert[];
  unreadCount: number;
  lastAutopilotAt: string | null;
};

export type AiShiftCopilotRunResponse = {
  runId: string;
  signalCount: number;
  created: number;
  skipped: number;
  generatedAt: string;
  latencyMs: number;
};

export type AiActionDecisionResponse = {
  action: AiActionDraftRecord;
};

export type AiProviderId = string;

export type AiProviderStatus =
  | "ready"
  | "missing"
  | "limited"
  | "error"
  | "untested";

export type AiProviderHealth = {
  requestCount: number;
  errorRate: number;
  rateLimitCount: number;
  fallbackCount: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  estimatedCostUsd: number | null;
};

export type AiProviderTemplate = {
  provider: AiProviderId;
  label: string;
  baseUrl: string;
  model: string;
  priority: number;
  category: "primary" | "aggregator" | "direct" | "local" | "custom";
  note: string;
};

export type AiProviderPublicConfig = {
  provider: AiProviderId;
  label: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  priority: number;
  keyStatus: "configured" | "missing" | "locked";
  maskedKey: string | null;
  lastStatus: AiProviderStatus;
  lastError: string | null;
  lastLatencyMs: number | null;
  health?: AiProviderHealth;
  isBuiltIn?: boolean;
  updatedAt: string | null;
};

export type AiProvidersResponse = {
  providers: AiProviderPublicConfig[];
  templates?: AiProviderTemplate[];
  connectionTest?: AiProviderConnectionTestResult | null;
};

export type AiProviderTestResponse = {
  provider: AiProviderId;
  status: AiProviderStatus;
  latencyMs: number | null;
  message: string;
  model: string;
};

export type AiProviderConnectionTestResult = {
  provider: AiProviderId;
  status: "ready" | "failed";
  ok: boolean;
  providerStatus: AiProviderStatus;
  latencyMs: number | null;
  message: string;
  model: string;
  code?: string;
};

export type AiProviderAutoFixResponse = {
  providers: AiProviderPublicConfig[];
  fixes: Array<{
    provider: AiProviderId;
    title: string;
    detail: string;
    status: "completed" | "skipped";
  }>;
};

export type AiSystemDoctorSeverity = "healthy" | "watch" | "critical";

export type AiSystemDoctorIssueSeverity = "info" | "warning" | "critical";

export type AiSystemDoctorIssue = {
  id: string;
  area:
    | "database"
    | "provider"
    | "agents"
    | "jobs"
    | "knowledge"
    | "logs"
    | "security"
    | "actions";
  title: string;
  detail: string;
  severity: AiSystemDoctorIssueSeverity;
  autoFixAvailable: boolean;
  autoFixed: boolean;
  nextStep: string;
};

export type AiSystemDoctorFix = {
  id: string;
  title: string;
  status: "completed" | "skipped" | "failed";
  detail: string;
};

export type AiSystemDoctorExecutionLog = {
  step: string;
  status: "running" | "completed" | "skipped" | "failed";
  detail: string;
  timestamp: string;
};

export type AiSystemDoctorDeveloperDiagnosis = {
  area: string;
  severity: AiSystemDoctorIssueSeverity;
  finding: string;
  recommendedFix: string;
};

export type AiSystemDoctorResponse = {
  generatedAt: string;
  status: AiSystemDoctorSeverity;
  healthColor: "green" | "yellow" | "red";
  score: number;
  autoHealMode: boolean;
  summary: {
    providerReady: number;
    providerConfigured: number;
    agentActive: number;
    pendingCriticalActions: number;
    recentAiErrors: number;
    driveReady: boolean;
    jobSecretReady: boolean;
    knowledgeReady: boolean;
  };
  issues: AiSystemDoctorIssue[];
  fixes: AiSystemDoctorFix[];
  guardrails: string[];
  executionLog?: AiSystemDoctorExecutionLog[];
  developerDiagnosis?: AiSystemDoctorDeveloperDiagnosis[];
};

export type AiGarageAiHealthResponse = {
  ok: boolean;
  generatedAt: string;
  status: "ready" | "watch" | "critical";
  setup: Array<{
    id:
      | "provider"
      | "knowledge"
      | "drive"
      | "cron"
      | "encryption"
      | "database"
      | "auto_fix";
    label: string;
    status: "ready" | "setup" | "error";
    detail: string;
    nextStep: string;
  }>;
  observability: {
    providerRequestCount: number;
    providerFallbackCount: number;
    providerErrorRate: number;
    p95LatencyMs: number | null;
    tokenUsageTotal: number;
    reportGeneratedCount: number;
    reportUploadedCount: number;
    knowledgeUploadCount: number;
    autoFixEventCount: number;
  };
  drive: AiJobsStatusResponse["drive"];
  knowledgeBase: {
    configured: boolean;
    vectorStoreId: string | null;
  };
  providers: {
    total: number;
    configured: number;
    ready: number;
  };
};
