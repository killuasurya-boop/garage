// Pure helper functions extract dari garage-app.tsx untuk turunkan source size.
// File ini SENGAJA hanya berisi pure functions + const data (tanpa JSX/state)
// supaya garage-app.tsx bisa fokus ke React component logic.

import type {
  AiAgentReportPeriod,
  CartLine,
  CustomerOrder,
  OrderReceipt,
  OrderType,
  TableLiveRow,
} from "@/lib/garage-api-types";
import type { Role } from "@/lib/garage-data";

// --- POS customer mode ----------------------------------------------------

export type PosCustomerMode = "guest" | "member";

// --- Payment methods + types -----------------------------------------------

export const paymentMethods = ["Cash", "QRIS", "Bank Transfer", "E-Wallet"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const paymentBrandConfig = {
  qrisImagePath: "/payments/qris-garage.png",
  deliveryWhatsapp: "081396186251",
  social: {
    instagram: "GARAGE Coffee & Motor",
    facebook: "GARAGE Coffee & Motor",
    tiktok: "GARAGE Coffee & Motor",
    youtube: "GARAGE Coffee & Motor",
  },
};

export const bankAccounts = [
  { id: "BCA", bank: "BCA", accountName: "GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "BRI", bank: "BRI", accountName: "GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "BNI", bank: "BNI", accountName: "GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "BANK SUMUT", bank: "BANK SUMUT", accountName: "GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
];

export const eWalletAccounts = [
  { id: "DANA", provider: "DANA", accountName: "GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "OVO", provider: "OVO", accountName: "GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "ShopeePay", provider: "ShopeePay", accountName: "GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "Bank Jago", provider: "Bank Jago", accountName: "GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "Lainnya", provider: "Lainnya", accountName: "GARAGE Coffee & Motor", accountNumber: "Manual kasir" },
];

export function defaultPaymentProvider(method: PaymentMethod) {
  if (method === "QRIS") {
    return "QRIS GARAGE";
  }

  if (method === "Bank Transfer") {
    return bankAccounts[0].id;
  }

  if (method === "E-Wallet") {
    return eWalletAccounts[0].id;
  }

  return "";
}

// --- Table availability ----------------------------------------------------

export type TableAvailability = "ready" | "bill" | "paid" | "cleaning" | "full" | "unknown";

export const occupiedTableStatuses = new Set([
  "pending",
  "accepted",
  "awaiting_payment",
  "ready",
  "mixed",
]);

export function tableNeedsCleaning(table: TableLiveRow | null | undefined) {
  return Boolean(table?.needsCleaning || table?.status === "needs_cleaning");
}

export function hasAwaitingTableBill(table: TableLiveRow | null | undefined) {
  return Boolean(
    table?.status === "awaiting_payment" ||
      table?.bills?.some((bill) => bill.status === "awaiting_payment"),
  );
}

export function hasOpenTableBill(table: TableLiveRow | null | undefined) {
  if (!table) return false;
  return (
    (table.openBillCount ?? 0) > 0 ||
    table.status === "pending" ||
    table.status === "accepted" ||
    table.status === "awaiting_payment" ||
    table.status === "ready" ||
    table.status === "mixed"
  );
}

export function isPaidOnlyTable(table: TableLiveRow | null | undefined) {
  if (!table) return false;
  return (
    !hasOpenTableBill(table) &&
    ((table.paidBillCount ?? 0) > 0 || table.status === "paid")
  );
}

export function tableHasLiveSession(table: TableLiveRow | null | undefined) {
  if (!table) return false;
  return (
    table.status !== "empty" ||
    tableNeedsCleaning(table) ||
    Boolean(table.currentOrderId) ||
    hasOpenTableBill(table) ||
    isPaidOnlyTable(table)
  );
}

export function tableAvailabilityState(
  table: TableLiveRow | null | undefined,
  liveDataReady: boolean,
): TableAvailability {
  if (!table || !liveDataReady) return "unknown";
  if (tableNeedsCleaning(table)) return "cleaning";
  if (hasAwaitingTableBill(table) || hasOpenTableBill(table)) return "bill";
  if (isPaidOnlyTable(table)) return "paid";
  if (table.status === "empty" && !table.needsCleaning) return "ready";
  if (occupiedTableStatuses.has(table.status) || Boolean(table.currentOrderId)) return "full";

  return "unknown";
}

export function tableAvailabilityLabel(availability: TableAvailability) {
  if (availability === "ready") return "Ready";
  if (availability === "bill") return "Belum bayar";
  if (availability === "paid") return "Lunas";
  if (availability === "cleaning") return "Cleaning";
  if (availability === "full") return "Penuh";
  return "Belum sinkron";
}

// --- Role-based capability checks -----------------------------------------

const kitchenPerformanceRoles = new Set<Role>([
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Supervisor Shift",
  "Barista",
  "Koki",
  "Kitchen / Barista",
]);

export function canViewKitchenPerformance(role: Role) {
  return kitchenPerformanceRoles.has(role);
}

export function isWaiterRole(role: Role) {
  return role === "Waiter 1" || role === "Waiter 2";
}

export function canConfirmCustomerPayment(role: Role) {
  return (
    role === "Owner / CEO" ||
    role === "Admin" ||
    role === "Manager Operasional" ||
    role === "Kasir" ||
    role === "Supervisor Shift"
  );
}

// --- Customer order payment/invoice helpers --------------------------------

export function customerOrderPaymentMethod(order: CustomerOrder) {
  return order.paymentMethod?.trim() || "Cash";
}

export function customerOrderPaymentProvider(order: CustomerOrder) {
  const method = customerOrderPaymentMethod(order);
  if (order.paymentProvider?.trim()) return order.paymentProvider;
  if (method === "QRIS") return "QRIS GARAGE";
  if (method === "Bank Transfer") return bankAccounts[0].id;
  return "";
}

export function customerOrderPaymentReference(order: CustomerOrder) {
  return order.paymentReference?.trim() || "";
}

export function customerOrderPaymentLabel(order: CustomerOrder) {
  const method = customerOrderPaymentMethod(order);
  if (method === "Cash" && order.channel.toLowerCase().includes("delivery")) return "COD";
  if (method === "Cash" && order.channel.toLowerCase().includes("take")) return "Bayar Saat Ambil";
  if (method === "Cash") return "Bayar di Meja / Kasir";
  if (method === "QRIS") return "QRIS";
  if (method === "Bank Transfer") return "Transfer";
  return method;
}

export function customerOrderPaymentStatusLabel(order: CustomerOrder) {
  if (order.status === "paid" || order.paymentStatus === "captured") return "Lunas";
  if (order.cashFlowStatus === "cash_discrepancy") return "Selisih / Perlu Dicek";
  if (order.cashFlowStatus === "handed_to_cashier") return "Menunggu Konfirmasi Kasir";
  if (order.cashFlowStatus === "held_by_waiter") return "Cash Diterima Waiter";
  if (order.cashFlowStatus === "waiting_customer_cash") return "Menunggu Cash Meja";
  if (order.status === "awaiting_payment") return "Menunggu Pembayaran";
  return "Belum Dibayar";
}

export function customerOrderInvoiceNo(order: CustomerOrder) {
  return order.invoiceNo?.trim() || `INV-${order.orderNo}`;
}

export function customerOrderInvoiceStatusLabel(order: CustomerOrder) {
  if (order.invoiceStatus === "issued" || order.status === "paid") return "Invoice Tercatat";
  return "Invoice Pending";
}

export function customerOrderNeedsWaiterCash(order: CustomerOrder) {
  return (
    customerOrderPaymentMethod(order) === "Cash" &&
    order.channel.toLowerCase().includes("qr table") &&
    (order.cashFlowStatus === "held_by_waiter" ||
      order.cashFlowStatus === "handed_to_cashier" ||
      order.cashFlowStatus === "cash_discrepancy")
  );
}

export function canAcceptCustomerOrder(order: CustomerOrder) {
  return order.status === "pending_cashier" || order.status === "awaiting_payment";
}

export function canRejectCustomerOrder(order: CustomerOrder) {
  return order.status === "pending_cashier" || order.status === "awaiting_payment";
}

export function canFinalizeCustomerOrder(order: CustomerOrder) {
  return (
    order.status === "pending_cashier" ||
    order.status === "awaiting_payment" ||
    order.status === "accepted"
  );
}

// --- Misc utilities --------------------------------------------------------

export function initialsForProfile(name: string, fallback: string) {
  const source = name.trim() || fallback.trim();
  const parts = source
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (parts[0]?.[0] ?? "G")
    .concat(parts[1]?.[0] ?? "")
    .toUpperCase();
}

export function generateTemporaryMemberPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// --- Table number / label helpers -----------------------------------------

export const tableNumbers = Array.from({ length: 50 }, (_, index) =>
  String(index + 1).padStart(2, "0"),
);

export function tablesInRange(start: string, end: string) {
  const startNumber = Number(start);
  const endNumber = Number(end);
  const min = Math.min(startNumber, endNumber);
  const max = Math.max(startNumber, endNumber);

  return tableNumbers.filter((table) => {
    const tableNumber = Number(table);
    return tableNumber >= min && tableNumber <= max;
  });
}

export function compactTableNumber(tableLabel: string) {
  const match = tableLabel.match(/\d+/);
  return match ? match[0].padStart(2, "0") : tableLabel;
}

export function fallbackTableLiveRow(tableNumber: string): TableLiveRow {
  return {
    tableNumber,
    tableLabel: `Meja ${tableNumber}`,
    status: "empty",
    currentOrderId: null,
    orderNo: null,
    customerName: null,
    customerPhone: null,
    total: 0,
    timerMinutes: 0,
    kitchenStatus: null,
    needsCleaning: false,
    lastStatusAt: null,
  };
}

export function tableLiveStatusLabel(table: TableLiveRow | null | undefined) {
  if (!table) return "Belum sinkron";
  if (tableNeedsCleaning(table)) return "Perlu dibersihkan";
  if (table.status === "mixed") return "Mixed bill";
  if (hasAwaitingTableBill(table)) return "Tagihan";
  if (hasOpenTableBill(table)) return "Belum Bayar";
  if (isPaidOnlyTable(table)) return "Lunas";
  if (table.status === "empty") return "Kosong";
  if (occupiedTableStatuses.has(table.status)) return "Terisi";
  return table.status.replace(/_/g, " ");
}

export function tableLiveStatusTone(table: TableLiveRow | null | undefined) {
  if (!table) return "border-[#4a4a54] bg-white/[0.06] text-[#d4d4d8]";
  if (tableNeedsCleaning(table)) {
    return "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]";
  }
  if (hasAwaitingTableBill(table)) {
    return "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]";
  }
  if (hasOpenTableBill(table)) {
    return "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]";
  }
  if (isPaidOnlyTable(table)) return "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#dcfce7]";
  if (table.status === "empty") return "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#dcfce7]";
  if (occupiedTableStatuses.has(table.status)) {
    return "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]";
  }
  return "border-[#4a4a54] bg-white/[0.06] text-[#d4d4d8]";
}

// --- Auth session check ---------------------------------------------------

export type AuthSessionCheck = {
  session?: unknown;
  user?: unknown;
} | null;

export function hasActiveAuthSession(payload: AuthSessionCheck) {
  return Boolean(payload?.session && payload.user);
}

export async function fetchAuthSessionCheck() {
  const response = await fetch(
    "/api/auth/get-session?disableCookieCache=true&disableRefresh=true",
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Session check failed.");
  }

  return (await response.json()) as AuthSessionCheck;
}

// --- Agent report date helpers --------------------------------------------

export function todayInputParts() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return { year, month, day };
}

export function defaultAgentReportDate(period: AiAgentReportPeriod) {
  const { year, month, day } = todayInputParts();

  if (period === "yearly") {
    return year;
  }

  if (period === "monthly") {
    return `${year}-${month}`;
  }

  return `${year}-${month}-${day}`;
}

export function agentReportInputType(period: AiAgentReportPeriod) {
  if (period === "yearly") {
    return "number";
  }

  if (period === "monthly") {
    return "month";
  }

  return "date";
}

export function agentReportDateLabel(period: AiAgentReportPeriod) {
  if (period === "yearly") {
    return "Tahun";
  }

  if (period === "monthly") {
    return "Bulan";
  }

  return "Tanggal";
}

// --- POS localStorage I/O -------------------------------------------------
// Pure localStorage I/O dgn SSR-safe guard (typeof window) + try/catch quota.

export type ParkedOrder = {
  id: string;
  label: string;
  cart: CartLine[];
  orderType: OrderType;
  selectedTableNumber: string;
  posCustomerMode: PosCustomerMode;
  guestName: string;
  guestPhone: string;
  memberPhone: string;
  voucherCode: string;
  itemCount: number;
  estimatedTotal: number;
  parkedAt: string;
};

const PARKED_ORDERS_STORAGE_KEY = "garage:pos:parked-orders";

export function loadParkedOrders(): ParkedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PARKED_ORDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ParkedOrder[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function persistParkedOrders(orders: ParkedOrder[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PARKED_ORDERS_STORAGE_KEY, JSON.stringify(orders.slice(0, 20)));
  } catch {
    // Quota exceeded — biarkan saja
  }
}

// Sold-Out flag (DB-source-of-truth; localStorage cache untuk fallback)
const SOLD_OUT_STORAGE_KEY = "garage:pos:sold-out-items";

// Reserved untuk fallback offline cache; sengaja di-export meski belum dipakai.
export function loadSoldOutIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SOLD_OUT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function persistSoldOutIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SOLD_OUT_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Quota — biarkan
  }
}

// Cashier POS settings (text size, density, auto-lock, dst)
const CASHIER_SETTINGS_STORAGE_KEY = "garage:pos:cashier-settings";

export type PosTextSize = "normal" | "large";
export type PosCardDensity = "compact" | "large";
export type PosAutoLockDelay = "off" | "1" | "3" | "5";
export type PosReceiptPrintMode = "auto" | "manual";
export type PosQrSoundMode = "on" | "airport" | "off";
export type PosBillLayout = "right" | "bottom";
export type CashierPosSettings = {
  textSize: PosTextSize;
  cardDensity: PosCardDensity;
  autoLockDelay: PosAutoLockDelay;
  receiptPrintMode: PosReceiptPrintMode;
  qrSoundMode: PosQrSoundMode;
  billLayout: PosBillLayout;
};

export const defaultCashierPosSettings: CashierPosSettings = {
  textSize: "normal",
  cardDensity: "compact",
  autoLockDelay: "off",
  receiptPrintMode: "auto",
  qrSoundMode: "airport",
  billLayout: "right",
};

function isCashierPosSettings(value: unknown): value is Partial<CashierPosSettings> {
  return Boolean(value && typeof value === "object");
}

export function loadCashierPosSettings(): CashierPosSettings {
  if (typeof window === "undefined") return defaultCashierPosSettings;
  try {
    const raw = localStorage.getItem(CASHIER_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultCashierPosSettings;
    const parsed = JSON.parse(raw) as unknown;
    if (!isCashierPosSettings(parsed)) return defaultCashierPosSettings;

    return {
      textSize: parsed.textSize === "large" ? "large" : "normal",
      cardDensity: parsed.cardDensity === "large" ? "large" : "compact",
      autoLockDelay: ["1", "3", "5"].includes(String(parsed.autoLockDelay))
        ? (parsed.autoLockDelay as PosAutoLockDelay)
        : "off",
      receiptPrintMode: parsed.receiptPrintMode === "manual" ? "manual" : "auto",
      qrSoundMode:
        parsed.qrSoundMode === "off"
          ? "off"
          : parsed.qrSoundMode === "airport"
            ? "airport"
            : "on",
      billLayout: parsed.billLayout === "bottom" ? "bottom" : "right",
    };
  } catch {
    return defaultCashierPosSettings;
  }
}

export function persistCashierPosSettings(settings: CashierPosSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CASHIER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Local device settings are convenience-only.
  }
}

// Receipt history (untuk Reprint Struk Shift)
const RECEIPT_HISTORY_STORAGE_KEY = "garage:pos:receipt-history";
const RECEIPT_HISTORY_MAX = 20;

export function loadReceiptHistory(): OrderReceipt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECEIPT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrderReceipt[];
    return Array.isArray(parsed) ? parsed.slice(0, RECEIPT_HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

export function persistReceiptHistory(history: OrderReceipt[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      RECEIPT_HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, RECEIPT_HISTORY_MAX)),
    );
  } catch {
    // Quota — buang yang paling lama supaya muat
    try {
      localStorage.setItem(
        RECEIPT_HISTORY_STORAGE_KEY,
        JSON.stringify(history.slice(0, 5)),
      );
    } catch {
      // Menyerah
    }
  }
}
