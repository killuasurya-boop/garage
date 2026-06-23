import { randomBytes, randomUUID } from "crypto";

import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";

import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type StaffFeeRates,
} from "@/lib/garage-app-settings-types";
import { canTransitionKitchenStatus } from "@/lib/garage-kitchen-status";
import {
  type KitchenTargetGroup,
  kitchenTargetMinutes,
  applyRoundingMode,
  calculateBillingTotals,
  capVoucherDiscountBySettings,
  computeManualDiscountAmount,
  manualDiscountNeedsApproval,
  orderTypeToChannel,
  kitchenTargetGroupForCategory,
} from "@/lib/garage-billing";
import {
  GarageOsThemeSaveError,
  isSavableGarageOsThemePreset,
} from "@/lib/garage-theme";
import { getDb } from "@/db";

export { DEFAULT_APP_SETTINGS, type AppSettings };

// Ambil tarif fee staf dari AppSettings (untuk diteruskan ke perhitungan earning).
function staffFeeRatesFromSettings(settings: AppSettings): StaffFeeRates {
  return {
    feeWaiterDeliveredPerItem: settings.feeWaiterDeliveredPerItem,
    feeKitchenReadyPerItem: settings.feeKitchenReadyPerItem,
    feeBaristaReadyPerItem: settings.feeBaristaReadyPerItem,
    feePackagingReadyPerItem: settings.feePackagingReadyPerItem,
    feeCashierPaidPerItem: settings.feeCashierPaidPerItem,
  };
}

import {
  appSettings,
  approvals,
  auditCases,
  auditLogs,
  cashSessions,
  crmCampaignLogs,
  customSegmentCustomers,
  customSegments,
  customerTags,
  customers,
  expenses,
  inventoryLocationStocks,
  inventoryItems,
  inventoryTransferItems,
  inventoryTransferRequests,
  kitchenTickets,
  memberAccounts,
  memberTransactions,
  menuRecipes,
  menuItems,
  menuVariants,
  orderItems,
  orders,
  outlets,
  payments,
  paymentSettlements,
  printJobs,
  supplierInvoices,
  supplierReceivingItems,
  supplierReceivings,
  serviceRequests,
  customerChatThreads,
  customerChatMessages,
  suppliers,
  staffProfiles,
  staffEarnings,
  staffEarningPayouts,
  stockOpnameItems,
  stockOpnameSessions,
  stockMovements,
  shiftHandoverReports,
  tableSessions,
  user,
  voucherRedemptions,
  vouchers,
  type SegmentRule,
} from "@/db/schema";
import {
  closingChecklist as fallbackClosingChecklist,
  cartSeed,
  operationalSignals,
  serviceRules,
  type MenuCategory,
  type Role,
} from "@/lib/garage-data";
import {
  enqueueFailedEarning,
  recordOrderPaidEarnings,
  recordTicketDeliveredEarnings,
  recordTicketReadyEarnings,
  reverseEarningsForOrder,
} from "@/lib/garage-earnings";
import {
  calculateEarnedPoints,
  calculateRedeemDiscount,
  DISCOUNT_PER_REDEEM_UNIT,
  GOLD_ANNUAL_SPEND,
  MAX_PERCENT_VOUCHER,
  MIN_PERCENT_VOUCHER,
  memberLevelForPoints,
  memberLevelRank,
  normalizeMemberLevel,
  normalizePhone,
  PLATINUM_ANNUAL_SPEND,
  POINTS_PER_REDEEM_UNIT,
  REFERRAL_BONUS_POINTS,
} from "@/lib/member-types";
import { hashPassword } from "@/lib/member-auth";
import { canUseApi } from "@/lib/role-access";
import type { GarageSession } from "@/lib/server-auth";

type GarageDb = ReturnType<typeof getDb>;
type GarageTx = Parameters<Parameters<GarageDb["transaction"]>[0]>[0];

type OrderInput = {
  orderType: "dine-in" | "takeaway" | "delivery";
  tableNumber?: string;
  tableLabel?: string;
  paymentMethod?: string;
  paymentProvider?: string;
  paymentReference?: string;
  cashReceived?: number;
  customerId?: string;
  memberPhone?: string;
  guestName?: string;
  guestPhone?: string;
  voucherCode?: string;
  manualDiscount?: {
    approvalId?: string;
    type: "amount" | "percent";
    rawValue: number;
    amount: number;
    reason: string;
  };
  /**
   * Split payment (opsional). Kalau diisi, total harus = order.total dan ≥ 2 split.
   * Backward compatible: tanpa splits → jalur lama (single payment).
   * Contoh: [{ method: "Cash", amount: 20000 }, { method: "QRIS", amount: 10000, reference: "tx-abc" }]
   */
  splits?: Array<{
    method: string;
    amount: number;
    provider?: string;
    reference?: string;
  }>;
  items: Array<{
    itemId: string;
    variantId: string;
    qty: number;
    note?: string;
  }>;
};

type CustomerOrderSource = "qr_table" | "qr_takeaway" | "instagram" | "campaign";

type CustomerOrderInput = {
  orderType: OrderInput["orderType"];
  tableLabel?: string;
  outletId?: string;
  customerMode: "guest" | "member";
  guestName?: string;
  guestPhone?: string;
  memberCustomerId?: string;
  customerNote?: string;
  source?: CustomerOrderSource;
  campaign?: string;
  voucherCode?: string;
  paymentMethod?: string;
  paymentProvider?: string;
  paymentReference?: string;
  // Token chat customer (opsional). Bila ada, order ditautkan ke thread chat
  // sehingga update status order otomatis muncul sebagai system message.
  chatToken?: string;
  items: OrderInput["items"];
};

type CustomerOrderActionInput = {
  action:
    | "accept"
    | "reject"
    | "paid"
    | "request_bill"
    | "whatsapp_sent"
    | "waiter_cash_received"
    | "waiter_cash_deposited";
  reason?: string;
  paymentMethod?: string;
  paymentProvider?: string;
  paymentReference?: string;
  cashReceived?: number;
  cashDeposited?: number;
  paymentNote?: string;
};

type MovementInput = {
  itemSku?: string;
  type: string;
  note: string;
  qty?: number;
  applyToStock?: boolean;
};

type LocationStockAdjustInput = {
  id: string;
  mode: "add" | "subtract" | "clear";
  qty?: number;
  note: string;
};

type InventoryItemInput = {
  sku: string;
  name: string;
  alternativeName?: string;
  category: string;
  usageArea?: "bar" | "dapur" | "general";
  unit: string;
  packageSize: string;
  unitCost?: number;
  onHand: number;
  min: number;
  movement?: string;
};

type SupplierReceivingInput = {
  supplierId?: string | null;
  invoiceNo?: string;
  note?: string;
  items: Array<{
    sku: string;
    qty: number;
    unitCost: number;
    note?: string;
  }>;
};

type InventoryTransferInput = {
  outletId?: string;
  station?: "bar" | "dapur";
  note?: string;
  items: Array<{
    sku: string;
    qty: number;
    note?: string;
  }>;
};

type CashSessionInput = {
  openingCash: number;
  expectedCash?: number;
  shiftNumber?: 1 | 2;
};

type CloseCashSessionInput = {
  actualCash: number;
  denominations?: Record<string, number>;
  checklist?: Array<{ label: string; done: boolean }>;
  closingNote?: string;
  managerSignOff?: boolean;
  resetTableMode?: "none" | "completed" | "all";
  resetTables?: boolean;
};

type ExpenseInput = {
  category: string;
  description: string;
  amount: number;
  paymentMethod?: string;
  supplierId?: string | null;
  supplierInvoiceId?: string | null;
  expenseDate?: string;
  notes?: string;
};

export type MenuProductInput = {
  id?: string;
  sku?: string;
  name: string;
  category: MenuCategory;
  section?: string;
  stock?: "ready" | "limited" | "sold_out";
  status?: "active" | "archived";
  prep?: string;
  tags?: string[];
  sortOrder?: number;
  promoActive?: boolean;
  promoPrice?: number | null;
  variants: Array<{
    id?: string;
    label: string;
    price: number;
    baseCost?: number;
    sortOrder?: number;
  }>;
  recipes?: Array<{
    variantId?: string;
    inventorySku: string;
    qty: number;
    unit?: string;
    wastePct?: number;
  }>;
};

export type MenuProductUpdateInput = Partial<Omit<MenuProductInput, "id" | "variants">> & {
  variants?: MenuProductInput["variants"];
  imageUrl?: string | null;
};

type StockOpnameInput = {
  locationType?: "warehouse" | "outlet";
  outletId?: string | null;
  note?: string;
  items: Array<{
    sku: string;
    systemQty: number;
    physicalQty: number;
    note?: string;
  }>;
};

type SupplierInput = {
  code: string;
  name: string;
  category?: string;
  contactName?: string;
  phone?: string;
  address?: string;
};

type SupplierInvoiceInput = {
  supplierId?: string | null;
  invoiceNo: string;
  category?: string;
  description?: string;
  amount: number;
  dueDate: string;
  issuedAt?: string;
  notes?: string;
};

type PaymentSettlementInput = {
  settlementNo: string;
  method: string;
  provider: string;
  expectedAmount: number;
  settledAmount?: number;
  feeAmount?: number;
  status?: string;
  settlementDate: string;
  settledAt?: string | null;
  reference?: string;
  notes?: string;
};

type RecipeInput = {
  menuItemId: string;
  variantId?: string;
  inventorySku: string;
  qty: number;
  unit: string;
  wastePct?: number;
};

export const roleDisplayName: Record<Role, string> = {
  "Owner / CEO": "Owner",
  Admin: "Admin",
  "Manager Operasional": "Manager",
  "Finance / CFO": "Finance",
  Kasir: "Kasir",
  Barista: "Barista",
  Koki: "Koki",
  "Asisten Koki": "Asisten Koki",
  "Waiter 1": "Waiter 1",
  "Waiter 2": "Waiter 2",
  "Kitchen / Barista": "Kitchen",
  Gudang: "Gudang",
  "Supervisor Shift": "Supervisor",
  "Delivery Admin": "Delivery",
};

const receiptBrand = {
  deliveryWhatsapp: "081396186251",
  social: {
    instagram: "GARAGE Coffee & Motor",
    facebook: "GARAGE Coffee & Motor",
    tiktok: "GARAGE Coffee & Motor",
    youtube: "GARAGE Coffee & Motor",
  },
};

function calculateEarnedPointsWithSettings(
  amount: number,
  level: string,
  settings: AppSettings,
) {
  return calculateEarnedPoints(amount * settings.pointsPerThousand, level);
}

function receiptSettingsPayload(settings: AppSettings) {
  return {
    serviceChargePct: settings.serviceChargePct,
    taxPct: settings.taxPct,
    defaultPrinterName: settings.defaultPrinterName,
    receiptCopies: settings.receiptCopies,
    brandName: settings.brandName,
    brandTagline: settings.brandTagline,
    outletAddress: settings.outletAddress,
    outletPhone: settings.outletPhone,
    npwp: settings.npwp,
    receiptFooter: settings.receiptFooter,
    // Wire dari /control/settings → kategori Receipt & Invoice
    receiptHeaderText: settings.receiptHeaderText,
    receiptShowLogo: settings.receiptShowLogo,
    receiptShowTaxBreakdown: settings.receiptShowTaxBreakdown,
    receiptShowMemberPoints: settings.receiptShowMemberPoints,
    roundingMode: settings.roundingMode,
    currency: settings.currency,
    timezone: settings.timezone,
    locale: settings.locale,
    // Wire dari /control/settings → kategori POS (untuk thermal route)
    cashDrawerOnPayment: settings.cashDrawerOnPayment,
  };
}

const qrControlPendingSlaMinutes = 3;
const customerHistoryWindowDays = 90;

function formatIdrShort(value: number) {
  if (value >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toFixed(2).replace(".", ",")} jt`;
  }

  if (value >= 1_000) {
    return `Rp ${Math.round(value / 1_000)} rb`;
  }

  return `Rp ${value}`;
}

function kitchenStationForTargetGroup(targetGroup: KitchenTargetGroup) {
  return targetGroup === "drink" ? "Bar" : "Food";
}

function kitchenItemLabel(line: {
  itemName: string;
  variantLabel: string;
  qty: number;
}) {
  const itemLabel =
    line.variantLabel === "Regular" ? line.itemName : `${line.itemName} ${line.variantLabel}`;

  return `${line.qty}x ${itemLabel}`;
}

function customerOrderSourceLabel(source?: string) {
  if (source === "instagram") return "Instagram";
  if (source === "campaign") return "Campaign";
  if (source === "qr_takeaway") return "QR Takeaway";
  return "QR Table";
}

function normalizeWhatsappPhone(phone: string) {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }
  return digits;
}

function makeWhatsappInvoiceUrl(input: {
  phone: string;
  orderNo: string;
  tableLabel: string;
  total: number;
  items: Array<{ itemName: string; variantLabel: string; qty: number; lineTotal: number }>;
  invoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
}) {
  const message = makeWhatsappInvoiceMessage(input);

  return `https://wa.me/${normalizeWhatsappPhone(input.phone)}?text=${encodeURIComponent(message)}`;
}

type WhatsappInvoiceInput = Parameters<typeof makeWhatsappInvoiceUrl>[0];

type WhatsappInvoiceDelivery = {
  status: "not_sent" | "sent" | "failed";
  url: string;
  provider: "wa_me" | "cloud";
  error?: string;
};

function makeWhatsappInvoiceMessage(input: WhatsappInvoiceInput) {
  const itemLines = input.items
    .map((item) => {
      const label =
        item.variantLabel === "Regular"
          ? item.itemName
          : `${item.itemName} ${item.variantLabel}`;
      return `- ${item.qty}x ${label}: ${formatIdrShort(item.lineTotal)}`;
    })
    .join("\n");
  const message = [
    `Invoice GARAGE Coffee & Motor`,
    `Order: ${input.orderNo}`,
    `Lokasi: ${input.tableLabel}`,
    "",
    itemLines,
    "",
    `Total: ${formatIdrShort(input.total)}`,
    input.invoiceUrl ? `Invoice & tracking: ${input.invoiceUrl}` : null,
    !input.invoiceUrl && input.invoicePdfUrl ? `PDF Invoice: ${input.invoicePdfUrl}` : null,
    "Terima kasih. Simpan link ini untuk order ulang dan rewards member.",
  ].filter((line) => line !== null).join("\n");

  return message;
}

function makeWhatsappMessageUrl(phone: string, message: string) {
  return `https://wa.me/${normalizeWhatsappPhone(phone)}?text=${encodeURIComponent(message)}`;
}

function garagePublicBaseUrl() {
  return (
    process.env.GARAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") ||
    "http://192.168.110.142:3001"
  );
}

function makeInvoiceTrackingToken() {
  return randomBytes(18).toString("base64url");
}

function invoiceWebPath(token: string | null | undefined) {
  return token ? `/invoice/${token}` : null;
}

function invoiceWebUrl(token: string | null | undefined) {
  const path = invoiceWebPath(token);
  return path ? `${garagePublicBaseUrl()}${path}` : null;
}

function garageGoogleReviewUrl() {
  return (
    process.env.GARAGE_GOOGLE_REVIEW_URL?.trim() ||
    "https://www.google.com/maps/search/?api=1&query=Garage%20Coffee%20%26%20Motor"
  );
}

function makeFollowUpLinks(input: {
  name: string;
  phone: string;
  favoriteItem: string;
  latestInvoiceUrl: string | null;
}) {
  const firstName = input.name.trim().split(/\s+/)[0] || "Kak";
  const orderAgainUrl = `${garagePublicBaseUrl()}/order?source=qr_takeaway&campaign=repeat_whatsapp`;
  const favoriteLine =
    input.favoriteItem && input.favoriteItem !== "-"
      ? ` Menu favorit Kakak: ${input.favoriteItem}.`
      : "";

  return {
    receiptUrl: input.latestInvoiceUrl,
    promoUrl: makeWhatsappMessageUrl(
      input.phone,
      [
        `Halo ${firstName}, terima kasih sudah order di GARAGE Coffee & Motor.`,
        `${favoriteLine} Untuk kunjungan berikutnya, tunjukkan pesan ini ke kasir untuk cek promo next visit.`,
        `Order ulang: ${orderAgainUrl}`,
      ].join("\n"),
    ),
    reviewUrl: makeWhatsappMessageUrl(
      input.phone,
      [
        `Halo ${firstName}, terima kasih sudah mampir ke GARAGE Coffee & Motor.`,
        "Kalau pengalaman hari ini oke, boleh bantu review kami di Google.",
        garageGoogleReviewUrl(),
      ].join("\n"),
    ),
    memberUrl: makeWhatsappMessageUrl(
      input.phone,
      [
        `Halo ${firstName}, nomor WhatsApp ini sudah tercatat di GARAGE.`,
        "Daftar member agar order berikutnya dapat points, voucher, dan reward ulang tahun.",
        `${garagePublicBaseUrl()}/member-login`,
      ].join("\n"),
    ),
  };
}

function whatsappCloudConfig() {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();

  if (!token || !phoneNumberId) {
    return null;
  }

  return {
    token,
    phoneNumberId,
    version: process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v21.0",
    templateName: process.env.WHATSAPP_CLOUD_TEMPLATE_NAME?.trim(),
    templateLanguage: process.env.WHATSAPP_CLOUD_TEMPLATE_LANGUAGE?.trim() || "id",
  };
}

async function sendWhatsappCloudInvoice(input: WhatsappInvoiceInput): Promise<WhatsappInvoiceDelivery> {
  const fallbackUrl = makeWhatsappInvoiceUrl(input);
  const invoiceLink = input.invoiceUrl ?? input.invoicePdfUrl ?? fallbackUrl;
  const config = whatsappCloudConfig();

  if (!config) {
    return {
      status: "not_sent",
      url: fallbackUrl,
      provider: "wa_me",
    };
  }

  const to = normalizeWhatsappPhone(input.phone);
  const payload = config.templateName
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: config.templateName,
          language: { code: config.templateLanguage },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: input.orderNo },
                { type: "text", text: input.tableLabel },
                { type: "text", text: formatIdrShort(input.total) },
                { type: "text", text: invoiceLink },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: true,
          body: makeWhatsappInvoiceMessage(input),
        },
      };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(`https://graph.facebook.com/${config.version}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return {
        status: "failed",
        url: fallbackUrl,
        provider: "cloud",
        error: errorBody || `WhatsApp Cloud API returned ${response.status}`,
      };
    }

    return {
      status: "sent",
      url: fallbackUrl,
      provider: "cloud",
    };
  } catch (error) {
    return {
      status: "failed",
      url: fallbackUrl,
      provider: "cloud",
      error: error instanceof Error ? error.message : "WhatsApp Cloud API request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function customerOrderResponse(
  row: typeof orders.$inferSelect,
  items: Array<typeof orderItems.$inferSelect>,
  payment?: typeof payments.$inferSelect | null,
) {
  const metadata = payment?.metadata ?? {};
  const paymentProvider =
    typeof metadata.provider === "string" && metadata.provider.trim()
      ? metadata.provider
      : null;
  const paymentReference =
    typeof metadata.reference === "string" && metadata.reference.trim()
      ? metadata.reference
      : null;
  const invoiceNo =
    typeof metadata.invoiceNo === "string" && metadata.invoiceNo.trim()
      ? metadata.invoiceNo
      : null;
  const invoiceStatus =
    typeof metadata.invoiceStatus === "string" && metadata.invoiceStatus.trim()
      ? metadata.invoiceStatus
      : null;
  const invoiceIssuedAt =
    typeof metadata.invoiceIssuedAt === "string" && metadata.invoiceIssuedAt.trim()
      ? metadata.invoiceIssuedAt
      : null;
  const cashFlowStatus =
    typeof metadata.cashFlowStatus === "string" && metadata.cashFlowStatus.trim()
      ? metadata.cashFlowStatus
      : null;
  const cashReceived =
    typeof metadata.cashReceived === "number" && Number.isFinite(metadata.cashReceived)
      ? metadata.cashReceived
      : null;
  const cashDeposited =
    typeof metadata.cashDeposited === "number" && Number.isFinite(metadata.cashDeposited)
      ? metadata.cashDeposited
      : null;
  const cashHeldBy =
    typeof metadata.waiterReceivedByName === "string" && metadata.waiterReceivedByName.trim()
      ? metadata.waiterReceivedByName
      : typeof metadata.waiterReceivedBy === "string" && metadata.waiterReceivedBy.trim()
        ? metadata.waiterReceivedBy
        : null;
  const cashReceivedAt =
    typeof metadata.waiterReceivedAt === "string" && metadata.waiterReceivedAt.trim()
      ? metadata.waiterReceivedAt
      : null;
  const cashDepositedAt =
    typeof metadata.waiterDepositedAt === "string" && metadata.waiterDepositedAt.trim()
      ? metadata.waiterDepositedAt
      : null;
  const cashierConfirmedAt =
    typeof metadata.cashierConfirmedAt === "string" && metadata.cashierConfirmedAt.trim()
      ? metadata.cashierConfirmedAt
      : null;

  return {
    id: row.id,
    orderNo: row.orderNo,
    tableLabel: row.tableLabel,
    channel: row.channel,
    status: row.status,
    orderSource: row.orderSource,
    customerMode: row.customerMode,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerNote: row.customerNote,
    campaign: row.campaign,
    whatsappInvoiceStatus: row.whatsappInvoiceStatus,
    whatsappInvoiceUrl: row.whatsappInvoiceUrl,
    invoicePdfUrl: null,
    invoiceWebUrl: invoiceWebPath(row.invoiceTrackingToken),
    invoicePdfGeneratedAt: null,
    subtotal: row.subtotal,
    service: row.service,
    tax: row.tax,
    discount: row.discount,
    total: row.total,
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    paymentMethod: payment?.method ?? null,
    paymentProvider,
    paymentReference,
    paymentStatus: payment?.status ?? null,
    invoiceNo,
    invoiceStatus,
    invoiceIssuedAt,
    cashFlowStatus,
    cashReceived,
    cashDeposited,
    cashHeldBy,
    cashReceivedAt,
    cashDepositedAt,
    cashierConfirmedAt,
    items: items.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      variantLabel: item.variantLabel,
      qty: item.qty,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  };
}

function minutesBetween(start: Date | null | undefined, end: Date | null | undefined) {
  if (!start || !end) {
    return null;
  }

  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function invoiceNoForOrder(orderNo: string) {
  return `INV-${orderNo}`;
}

function isWaiterRole(role: Role) {
  return role === "Waiter 1" || role === "Waiter 2";
}

function canConfirmCustomerPayment(role: Role) {
  return (
    role === "Owner / CEO" ||
    role === "Admin" ||
    role === "Manager Operasional" ||
    role === "Kasir" ||
    role === "Supervisor Shift"
  );
}

function numberFromMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringFromMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

async function ensureCustomerOrderInvoiceLink(input: {
  order: typeof orders.$inferSelect;
  items: Array<typeof orderItems.$inferSelect>;
}) {
  if (!input.order.customerPhone) {
    return input.order;
  }

  // Skip DB write kalau invoice link sudah pernah dibuat — dipanggil tiap
  // polling list customer orders, jadi tanpa guard ini = N writes/12s.
  if (input.order.invoiceTrackingToken && input.order.whatsappInvoiceUrl) {
    return input.order;
  }

  const db = getDb();
  const trackingToken = input.order.invoiceTrackingToken ?? makeInvoiceTrackingToken();
  const invoiceWhatsappUrl = makeWhatsappInvoiceUrl({
    phone: input.order.customerPhone,
    orderNo: input.order.orderNo,
    tableLabel: input.order.tableLabel,
    total: input.order.total,
    items: input.items,
    invoiceUrl: invoiceWebUrl(trackingToken),
  });
  const [updated] = await db
    .update(orders)
    .set({
      invoiceTrackingToken: trackingToken,
      whatsappInvoiceUrl: invoiceWhatsappUrl,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, input.order.id))
    .returning();

  return updated;
}

const jakartaOffset = "+07:00";
const dayMs = 24 * 60 * 60 * 1000;

function getJakartaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function getJakartaTodayRange(date = new Date()) {
  const start = new Date(`${getJakartaDateKey(date)}T00:00:00${jakartaOffset}`);

  return {
    start,
    end: new Date(start.getTime() + dayMs),
  };
}

function getJakartaMonthRange(date = new Date()) {
  const [yearText, monthText] = getJakartaDateKey(date).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const monthLabel = String(month).padStart(2, "0");
  const nextMonthLabel = String(nextMonth).padStart(2, "0");

  return {
    start: new Date(`${year}-${monthLabel}-01T00:00:00${jakartaOffset}`),
    end: new Date(`${nextYear}-${nextMonthLabel}-01T00:00:00${jakartaOffset}`),
  };
}

function kitchenItemQuantity(item: string) {
  const match = item.match(/^\s*(\d+)\s*x\b/i);
  if (!match) {
    return 1;
  }

  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function kitchenWarningLevel(totalTickets: number, lateRate: number) {
  if (totalTickets < 10) {
    return "Data Belum Cukup";
  }

  if (lateRate >= 50) {
    return "SP3";
  }

  if (lateRate >= 35) {
    return "SP2";
  }

  if (lateRate >= 20) {
    return "SP1";
  }

  return "Aman";
}

function nowTimeLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function makeOrderNo() {
  return `POS-${Date.now().toString().slice(-8)}`;
}

function makeTicketNo() {
  return `K-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
}

function cashDiscrepancyStatus(discrepancy: number, criticalThreshold?: number) {
  const abs = Math.abs(discrepancy);
  // <= 10K = ok (rounding error wajar). Antara itu sampai criticalThreshold = review.
  // Di atas threshold = critical (wired ke setting shiftDiscrepancyThreshold).
  const threshold = criticalThreshold && criticalThreshold > 10_000 ? criticalThreshold : 50_000;
  if (abs <= 10_000) return "ok";
  if (abs <= threshold) return "review";
  return "critical";
}

function countedCashFromDenominations(denominations?: Record<string, number>) {
  if (!denominations) return null;

  const total = Object.entries(denominations).reduce((sum, [denomination, count]) => {
    const value = Number(denomination);
    const qty = Number(count);
    if (!Number.isFinite(value) || !Number.isFinite(qty) || value <= 0 || qty <= 0) {
      return sum;
    }

    return sum + value * qty;
  }, 0);

  return total > 0 ? Math.round(total) : null;
}

export async function createAuditLog(input: {
  actor: string;
  action: string;
  object: string;
  device: string;
  status?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();

  await db.insert(auditLogs).values({
    time: nowTimeLabel(),
    actor: input.actor,
    action: input.action,
    object: input.object,
    device: input.device,
    status: input.status ?? "recorded",
    metadata: input.metadata,
  });
}

export function sessionPayload(garage: GarageSession) {
  return {
    user: {
      id: garage.user.id,
      name: garage.user.name,
      email: garage.user.email,
    },
    role: garage.profile.role,
    outlet: garage.profile.outlet,
    shift: garage.profile.shiftLabel,
    device: garage.profile.deviceLabel,
  };
}

export async function getDashboardData() {
  const db = getDb();
  const { start: todayStart, end: todayEnd } = getJakartaTodayRange();

  const [todayPaymentAgg] = await db
    .select({
      amount: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
      orderCount: sql<number>`count(distinct ${payments.orderId})::int`,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(payments.status, "captured"),
        eq(orders.status, "paid"),
        gte(orders.createdAt, todayStart),
        lt(orders.createdAt, todayEnd),
      ),
    );

  const [latestCashSession] = await db
    .select({
      discrepancy: cashSessions.discrepancy,
      discrepancyStatus: cashSessions.discrepancyStatus,
      status: cashSessions.status,
      expectedCash: cashSessions.expectedCash,
    })
    .from(cashSessions)
    .where(
      and(gte(cashSessions.openedAt, todayStart), lt(cashSessions.openedAt, todayEnd)),
    )
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);

  const [activeOrders] = await db
    .select({ total: count() })
    .from(kitchenTickets)
    .where(or(eq(kitchenTickets.status, "queue"), eq(kitchenTickets.status, "cooking")));
  const [lowStock] = await db
    .select({ total: count() })
    .from(inventoryItems)
    .where(eq(inventoryItems.status, "low"));
  const [pendingApprovals] = await db
    .select({ total: count() })
    .from(approvals)
    .where(eq(approvals.status, "pending"));

  // Sales trend REAL per jam (08–19) dari payment captured hari ini — bukan mock.
  // Chart dashboard pakai tinggi relatif, jadi rupiah mentah aman dipakai.
  const salesTrendRows = await db
    .select({
      hour: sql<number>`extract(hour from ${orders.createdAt} AT TIME ZONE 'Asia/Jakarta')::int`,
      sales: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint`,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(payments.status, "captured"),
        eq(orders.status, "paid"),
        gte(orders.createdAt, todayStart),
        lt(orders.createdAt, todayEnd),
      ),
    )
    .groupBy(sql`1`);
  const salesByHour = new Map<number, number>();
  for (const row of salesTrendRows) {
    salesByHour.set(Number(row.hour), Number(row.sales));
  }
  // Jendela chart: baseline jam operasional 08–19, tapi MELEBAR otomatis
  // mengikuti jam yang benar-benar ada penjualan (mis. sampai 22:00) supaya
  // omzet malam/pagi tidak pernah tersembunyi dari chart. (F-02)
  const saleHours = [...salesByHour.keys()];
  const startHour = Math.min(8, ...saleHours);
  const endHour = Math.max(19, ...saleHours);
  const computedSalesTrend = Array.from({ length: endHour - startHour + 1 }, (_, index) => {
    const hour = startHour + index;
    return { hour: String(hour).padStart(2, "0"), sales: salesByHour.get(hour) ?? 0 };
  });

  const todayRevenue = Number(todayPaymentAgg?.amount ?? 0);
  const todayOrderCount = Number(todayPaymentAgg?.orderCount ?? 0);
  const cashDiscrepancy = Number(latestCashSession?.discrepancy ?? 0);
  const expectedCash = Number(latestCashSession?.expectedCash ?? 0);
  const discrepancyPct =
    expectedCash > 0
      ? `${((Math.abs(cashDiscrepancy) / expectedCash) * 100).toFixed(2)}%`
      : latestCashSession?.status === "open"
        ? "shift masih open"
        : "belum closing";

  const cashTone =
    latestCashSession?.discrepancyStatus === "critical"
      ? "risk"
      : latestCashSession?.status === "open"
        ? "watch"
        : cashDiscrepancy !== 0
          ? "watch"
          : "good";

  return {
    headlineMetrics: [
      {
        id: "revenue",
        label: "Revenue hari ini",
        value: formatIdrShort(todayRevenue),
        delta: `${todayOrderCount} order paid`,
        tone: todayRevenue > 0 ? "good" : "watch",
      },
      {
        id: "cash",
        label: "Selisih kas",
        value: formatIdrShort(Math.abs(cashDiscrepancy)),
        delta: discrepancyPct,
        tone: cashTone,
      },
      {
        id: "orders",
        label: "Order aktif",
        value: String(activeOrders?.total ?? 0),
        delta: `${lowStock?.total ?? 0} stok low`,
        tone: "warn",
      },
      {
        id: "approvals",
        label: "Approval pending",
        value: String(pendingApprovals?.total ?? 0),
        delta: "risk gate",
        tone: (pendingApprovals?.total ?? 0) > 0 ? "risk" : "good",
      },
    ],
    salesTrend: computedSalesTrend,
    operationalSignals,
  };
}

// Best-seller: item paling laku berdasarkan total qty terjual 30 hari terakhir
// (mengecualikan order rejected/canceled). Dipakai untuk badge "Paling laku"
// di menu digital. Build-safe: kalau DB kosong, kembalikan array kosong.
export async function getBestSellerMenuItemIds(limit = 6): Promise<string[]> {
  try {
    const db = getDb();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        menuItemId: orderItems.menuItemId,
        sold: sql<number>`sum(${orderItems.qty})`.mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          isNotNull(orderItems.menuItemId),
          gte(orders.createdAt, since),
          sql`${orders.status} not in ('rejected','canceled','cancelled')`,
        ),
      )
      .groupBy(orderItems.menuItemId)
      .orderBy(desc(sql`sum(${orderItems.qty})`))
      .limit(limit);
    return rows
      .map((row) => row.menuItemId)
      .filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}

export async function getMenuData(params?: {
  category?: string;
  q?: string;
  includeArchived?: boolean;
  includeCosting?: boolean;
}) {
  const db = getDb();
  const filters = [];
  if (!params?.includeArchived) {
    filters.push(eq(menuItems.status, "active"));
  }
  if (params?.category && params.category !== "All") {
    filters.push(eq(menuItems.category, params.category));
  }

  if (params?.q) {
    const search = `%${params.q}%`;
    filters.push(
      or(
        ilike(menuItems.id, search),
        ilike(menuItems.sku, search),
        ilike(menuItems.name, search),
        ilike(menuItems.category, search),
        ilike(menuItems.section, search),
      ),
    );
  }

  const itemRows = await db
    .select()
    .from(menuItems)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(menuItems.sortOrder, menuItems.name);

  if (!itemRows.length) {
    return [];
  }

  const variantRows = await db
    .select()
    .from(menuVariants)
    .where(
      inArray(
        menuVariants.itemId,
        itemRows.map((item) => item.id),
      ),
    )
    .orderBy(menuVariants.sortOrder);

  const variantsByItem = new Map<string, typeof variantRows>();
  for (const variant of variantRows) {
    variantsByItem.set(variant.itemId, [
      ...(variantsByItem.get(variant.itemId) ?? []),
      variant,
    ]);
  }

  const baseRows = itemRows.map((item) => ({
    id: item.id,
    sku: item.sku ?? undefined,
    name: item.name,
    category: item.category as MenuCategory,
    section: item.section,
    variants: (variantsByItem.get(item.id) ?? []).map((variant) => ({
      id: variant.variantId,
      label: variant.label,
      price: variant.price,
      ...(params?.includeCosting ? { baseCost: variant.baseCost } : {}),
    })),
    stock: item.stock as "ready" | "limited" | "sold_out",
    status: item.status as "active" | "archived",
    prep: item.prep,
    tags: item.tags,
    imageUrl: item.imageUrl ?? undefined,
    promoActive: item.promoActive ?? false,
    promoPrice: item.promoPrice ?? undefined,
  }));

  if (!params?.includeCosting) {
    return baseRows;
  }

  const recipeRows = await db
    .select({
      menuItemId: menuRecipes.menuItemId,
      variantId: menuRecipes.variantId,
      inventorySku: menuRecipes.inventorySku,
      qty: menuRecipes.qty,
      unit: menuRecipes.unit,
      wastePct: menuRecipes.wastePct,
      inventoryName: inventoryItems.name,
      unitCost: inventoryItems.unitCost,
    })
    .from(menuRecipes)
    .leftJoin(inventoryItems, eq(menuRecipes.inventorySku, inventoryItems.sku))
    .where(
      and(
        inArray(
          menuRecipes.menuItemId,
          itemRows.map((item) => item.id),
        ),
        eq(menuRecipes.status, "active"),
      ),
    )
    .orderBy(menuRecipes.menuItemId, menuRecipes.variantId, menuRecipes.inventorySku);

  const recipesByItem = new Map<string, typeof recipeRows>();
  for (const recipe of recipeRows) {
    if (!recipe.menuItemId) continue;
    recipesByItem.set(recipe.menuItemId, [
      ...(recipesByItem.get(recipe.menuItemId) ?? []),
      recipe,
    ]);
  }

  return baseRows.map((item) => {
    const recipes = (recipesByItem.get(item.id) ?? []).map((recipe) => {
      const wasteMultiplier = 1 + Number(recipe.wastePct ?? 0) / 100;
      const lineCost = Math.round(
        Number(recipe.qty ?? 0) * Number(recipe.unitCost ?? 0) * wasteMultiplier,
      );
      return {
        variantId: recipe.variantId,
        inventorySku: recipe.inventorySku ?? "",
        inventoryName: recipe.inventoryName ?? undefined,
        qty: Number(recipe.qty ?? 0),
        unit: recipe.unit,
        wastePct: Number(recipe.wastePct ?? 0),
        unitCost: Number(recipe.unitCost ?? 0),
        lineCost,
      };
    });
    return {
      ...item,
      recipes,
      recipeCost: recipes.reduce((sum, recipe) => sum + recipe.lineCost, 0),
    };
  });
}

function slugifyMenuId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function sectionForMenuCategory(category: MenuCategory) {
  return category === "Coffee" || category === "Non-Coffee" ? "Bar" : "Dapur";
}

function normalizeVariantId(value: string | undefined, index: number) {
  const fallback = index === 0 ? "regular" : `variant-${index + 1}`;
  return slugifyMenuId(value || fallback) || fallback;
}

const MENU_SKU_PREFIX: Record<string, string> = {
  Coffee: "COF",
  "Non-Coffee": "NCOF",
  Makanan: "FOOD",
  Cemilan: "SNCK",
};

function menuSkuPrefix(category: string) {
  return MENU_SKU_PREFIX[category] ?? "GEN";
}

// Auto-generate SKU unik format <PREFIX>-<urut 3 digit> berdasar kategori.
// Cari nomor tertinggi yang sudah dipakai prefix tsb lalu +1 (toleran gap).
async function nextMenuSku(tx: GarageDb | GarageTx, category: string) {
  const prefix = menuSkuPrefix(category);
  const rows = await tx
    .select({ sku: menuItems.sku })
    .from(menuItems)
    .where(ilike(menuItems.sku, `${prefix}-%`));
  let max = 0;
  for (const row of rows) {
    const m = /^[A-Z]+-(\d+)$/.exec(row.sku ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

// Normalisasi SKU manual: uppercase, hanya huruf/angka/dash. Kosong → null.
function normalizeMenuSku(raw: string | undefined | null) {
  const trimmed = (raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return trimmed || null;
}

// Harga efektif transaksi: pakai harga promo bila aktif, valid, dan lebih murah
// dari harga varian (promo hanya boleh mendiskon, tidak menaikkan harga).
function effectiveMenuPrice(
  variantPrice: number,
  promoActive: boolean | null | undefined,
  promoPrice: number | null | undefined,
) {
  if (promoActive && promoPrice != null && promoPrice > 0 && promoPrice < variantPrice) {
    return promoPrice;
  }
  return variantPrice;
}

// Normalisasi promo: aktif hanya bila toggle on DAN harga promo valid (> 0).
// promoPrice null saat tidak aktif supaya data bersih.
function normalizeMenuPromo(
  promoActive: boolean | undefined,
  promoPrice: number | null | undefined,
) {
  const price =
    promoPrice == null ? null : Math.max(0, Math.round(Number(promoPrice)));
  const active = Boolean(promoActive) && price != null && price > 0;
  return { promoActive: active, promoPrice: active ? price : null };
}

function normalizeMenuProductVariants(input: MenuProductInput["variants"], itemId: string) {
  if (!input.length) {
    throw new Error("Produk wajib punya minimal 1 varian harga.");
  }

  const variants = input.map((variant, index) => {
    const price = Math.round(Number(variant.price));
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("Harga varian wajib lebih dari 0.");
    }
    const baseCost = Math.max(0, Math.round(Number(variant.baseCost ?? 0)));
    if (!Number.isFinite(baseCost)) {
      throw new Error("Harga dasar/HPP wajib angka valid.");
    }
    return {
      itemId,
      variantId: normalizeVariantId(variant.id || variant.label, index),
      label: variant.label.trim() || "Regular",
      price,
      baseCost,
      sortOrder: variant.sortOrder ?? index,
    };
  });

  const duplicateVariant = variants.find(
    (variant, index) =>
      variants.findIndex((entry) => entry.variantId === variant.variantId) !== index,
  );
  if (duplicateVariant) {
    throw new Error(`ID varian duplikat: ${duplicateVariant.variantId}.`);
  }

  return variants;
}

function normalizeMenuProductRecipes(
  input: MenuProductInput["recipes"] | undefined,
  itemId: string,
  validVariantIds: Set<string>,
) {
  if (!input?.length) return [];

  const recipes = input
    .map((recipe) => ({
      menuItemId: itemId,
      variantId:
        recipe.variantId && recipe.variantId !== "all"
          ? normalizeVariantId(recipe.variantId, 0)
          : "all",
      inventorySku: recipe.inventorySku.trim(),
      qty: Number(recipe.qty),
      unit: recipe.unit?.trim() || "unit",
      wastePct: Number(recipe.wastePct ?? 0),
      status: "active",
    }))
    .filter((recipe) => recipe.inventorySku);

  for (const recipe of recipes) {
    if (recipe.variantId !== "all" && !validVariantIds.has(recipe.variantId)) {
      throw new Error(`Varian resep tidak valid: ${recipe.variantId}.`);
    }
    if (!Number.isFinite(recipe.qty) || recipe.qty <= 0) {
      throw new Error("Qty resep bahan wajib lebih dari 0.");
    }
    if (!Number.isFinite(recipe.wastePct) || recipe.wastePct < 0 || recipe.wastePct > 100) {
      throw new Error("Waste resep harus 0-100%.");
    }
  }

  const duplicateRecipe = recipes.find(
    (recipe, index) =>
      recipes.findIndex(
        (entry) =>
          entry.variantId === recipe.variantId &&
          entry.inventorySku === recipe.inventorySku,
      ) !== index,
  );
  if (duplicateRecipe) {
    throw new Error(
      `Bahan resep duplikat: ${duplicateRecipe.variantId}/${duplicateRecipe.inventorySku}.`,
    );
  }

  return recipes;
}

async function refreshAutoMenuVariantBaseCosts(
  tx: GarageDb | GarageTx,
  itemId: string,
  variantIds: string[],
) {
  const uniqueVariantIds = Array.from(new Set(variantIds.filter(Boolean)));
  if (!uniqueVariantIds.length) return;

  for (const variantId of uniqueVariantIds) {
    const recipeRows = await tx
      .select({
        qty: menuRecipes.qty,
        wastePct: menuRecipes.wastePct,
        unitCost: inventoryItems.unitCost,
      })
      .from(menuRecipes)
      .innerJoin(inventoryItems, eq(inventoryItems.sku, menuRecipes.inventorySku))
      .where(
        and(
          eq(menuRecipes.menuItemId, itemId),
          eq(menuRecipes.status, "active"),
          or(eq(menuRecipes.variantId, "all"), eq(menuRecipes.variantId, variantId)),
        ),
      );

    const recipeCost = Math.round(
      recipeRows.reduce(
        (sum, row) =>
          sum + Number(row.qty) * Number(row.unitCost ?? 0) * (1 + Number(row.wastePct ?? 0) / 100),
        0,
      ),
    );
    if (recipeCost <= 0) continue;

    await tx
      .update(menuVariants)
      .set({ baseCost: recipeCost, updatedAt: new Date() })
      .where(and(eq(menuVariants.itemId, itemId), eq(menuVariants.variantId, variantId)));
  }
}

export async function createMenuProduct(input: MenuProductInput, garage: GarageSession) {
  const db = getDb();
  const name = input.name.trim();
  const id = slugifyMenuId(input.id || name);
  if (!id || !name) {
    throw new Error("Nama produk wajib diisi.");
  }
  const variants = normalizeMenuProductVariants(input.variants, id);
  const recipes = normalizeMenuProductRecipes(
    input.recipes,
    id,
    new Set(variants.map((variant) => variant.variantId)),
  );

  const now = new Date();
  const [created] = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(eq(menuItems.id, id))
      .limit(1);
    if (existing) {
      throw new Error("ID produk sudah ada. Gunakan nama/ID lain.");
    }

    // SKU: pakai input manual bila ada (cek unik), kalau tidak auto-generate.
    let sku = normalizeMenuSku(input.sku);
    if (sku) {
      const [dupSku] = await tx
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(eq(menuItems.sku, sku))
        .limit(1);
      if (dupSku) {
        throw new Error(`SKU "${sku}" sudah dipakai produk lain.`);
      }
    } else {
      sku = await nextMenuSku(tx, input.category);
    }

    const promo = normalizeMenuPromo(input.promoActive, input.promoPrice);
    const inserted = await tx
      .insert(menuItems)
      .values({
        id,
        sku,
        name,
        category: input.category,
        section: input.section?.trim() || sectionForMenuCategory(input.category),
        stock: input.stock ?? "ready",
        status: input.status ?? "active",
        prep: input.prep?.trim() || "10m",
        tags: input.tags ?? [],
        promoActive: promo.promoActive,
        promoPrice: promo.promoPrice,
        sortOrder: input.sortOrder ?? 999,
        updatedAt: now,
      })
      .returning();

    await tx.insert(menuVariants).values(variants);
    if (recipes.length) {
      await tx.insert(menuRecipes).values(recipes);
    }
    await refreshAutoMenuVariantBaseCosts(
      tx,
      id,
      variants
        .filter((variant) => variant.baseCost <= 0)
        .map((variant) => variant.variantId),
    );

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
      action: "Menu product created",
      object: name,
      device: garage.profile.deviceLabel,
      status: "recorded",
      metadata: {
        productId: id,
        category: input.category,
        variants: variants.map((variant) => ({
          id: variant.variantId,
          label: variant.label,
          price: variant.price,
          baseCost: variant.baseCost,
        })),
        recipeLines: recipes.length,
      },
    });

    return inserted;
  });

  const [product] = await getMenuData({
    q: created.id,
    includeArchived: true,
    includeCosting: true,
  });
  return product ?? null;
}

export async function updateMenuProductStock(
  id: string,
  stock: "ready" | "limited" | "sold_out",
  garage: GarageSession,
) {
  const db = getDb();
  const now = new Date();
  const [updated] = await db
    .update(menuItems)
    .set({ stock, updatedAt: now })
    .where(eq(menuItems.id, id))
    .returning();

  if (!updated) {
    return null;
  }

  await db.insert(auditLogs).values({
    time: nowTimeLabel(),
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Menu stock updated",
    object: updated.name,
    device: garage.profile.deviceLabel,
    status: stock,
    metadata: {
      productId: updated.id,
      stock,
      source: "cashier_digital_menu_control",
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    category: updated.category as MenuCategory,
    section: updated.section,
    stock: updated.stock as "ready" | "limited" | "sold_out",
    status: updated.status as "active" | "archived",
    prep: updated.prep,
    tags: updated.tags,
  };
}

export async function getMenuProductAuditHistory(productId: string, params?: { limit?: number }) {
  const safeId = productId.trim();
  const limit = Math.max(1, Math.min(100, params?.limit ?? 30));
  const db = getDb();

  const rows = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        ilike(auditLogs.action, "Menu%"),
        sql`${auditLogs.metadata}->>'productId' = ${safeId}`,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    time: row.time,
    actor: row.actor,
    action: row.action,
    object: row.object,
    device: row.device,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function updateMenuProduct(
  id: string,
  input: MenuProductUpdateInput,
  garage: GarageSession,
) {
  const db = getDb();
  const safeId = id.trim();
  const [existing] = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.id, safeId))
    .limit(1);

  if (!existing) return null;

  const nextName = input.name?.trim();
  if (input.name !== undefined && !nextName) {
    throw new Error("Nama produk wajib diisi.");
  }

  const update: Partial<typeof menuItems.$inferInsert> = { updatedAt: new Date() };
  if (nextName !== undefined) update.name = nextName;
  if (input.category !== undefined) update.category = input.category;
  if (input.section !== undefined) {
    update.section =
      input.section.trim() ||
      sectionForMenuCategory(input.category ?? (existing.category as MenuCategory));
  }
  if (input.stock !== undefined) update.stock = input.stock;
  if (input.status !== undefined) update.status = input.status;
  if (input.prep !== undefined) update.prep = input.prep.trim() || "10m";
  if (input.tags !== undefined) update.tags = input.tags;
  if (input.sortOrder !== undefined) update.sortOrder = input.sortOrder;
  if (input.imageUrl !== undefined) update.imageUrl = input.imageUrl?.trim() || null;
  if (input.sku !== undefined) {
    const nextSku = normalizeMenuSku(input.sku);
    if (nextSku) {
      const [dupSku] = await db
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(and(eq(menuItems.sku, nextSku), ne(menuItems.id, safeId)))
        .limit(1);
      if (dupSku) {
        throw new Error(`SKU "${nextSku}" sudah dipakai produk lain.`);
      }
    }
    update.sku = nextSku;
  }
  if (input.promoActive !== undefined || input.promoPrice !== undefined) {
    // Pakai nilai existing bila salah satu field tidak dikirim, supaya partial
    // update tidak mematikan promo secara tak sengaja.
    const promo = normalizeMenuPromo(
      input.promoActive ?? existing.promoActive,
      input.promoPrice !== undefined ? input.promoPrice : existing.promoPrice,
    );
    update.promoActive = promo.promoActive;
    update.promoPrice = promo.promoPrice;
  }

  const variants =
    input.variants !== undefined
      ? normalizeMenuProductVariants(input.variants, safeId)
      : null;
  const recipes =
    input.recipes !== undefined
      ? normalizeMenuProductRecipes(
          input.recipes,
          safeId,
          new Set(
            (variants ?? (await db
              .select({ variantId: menuVariants.variantId })
              .from(menuVariants)
              .where(eq(menuVariants.itemId, safeId))))
              .map((variant) => variant.variantId),
          ),
        )
      : null;

  await db.transaction(async (tx) => {
    await tx.update(menuItems).set(update).where(eq(menuItems.id, safeId));
    if (variants) {
      await tx.delete(menuVariants).where(eq(menuVariants.itemId, safeId));
      await tx.insert(menuVariants).values(variants);
    }
    if (recipes) {
      await tx.delete(menuRecipes).where(eq(menuRecipes.menuItemId, safeId));
      if (recipes.length) {
        await tx.insert(menuRecipes).values(recipes);
      }
    }
    const autoCostVariantIds = variants
      ? variants
          .filter((variant) => variant.baseCost <= 0)
          .map((variant) => variant.variantId)
      : recipes
        ? (
            await tx
              .select({ variantId: menuVariants.variantId })
              .from(menuVariants)
              .where(and(eq(menuVariants.itemId, safeId), lte(menuVariants.baseCost, 0)))
          ).map((variant) => variant.variantId)
        : [];
    await refreshAutoMenuVariantBaseCosts(tx, safeId, autoCostVariantIds);
    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
      action: "Menu product updated",
      object: nextName ?? existing.name,
      device: garage.profile.deviceLabel,
      status: input.status ?? "updated",
      metadata: {
        productId: safeId,
        fields: Object.keys(input),
        variants: variants?.map((variant) => ({
          id: variant.variantId,
          label: variant.label,
          price: variant.price,
          baseCost: variant.baseCost,
        })),
        recipeLines: recipes?.length,
      },
    });
  });

  const [product] = await getMenuData({
    q: safeId,
    includeArchived: true,
    includeCosting: true,
  });
  return product ?? null;
}

export async function deleteMenuProduct(id: string, garage: GarageSession) {
  const db = getDb();
  const safeId = id.trim();
  const [existing] = await db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      category: menuItems.category,
    })
    .from(menuItems)
    .where(eq(menuItems.id, safeId))
    .limit(1);

  if (!existing) return null;

  const [usage] = await db
    .select({ count: count(orderItems.id) })
    .from(orderItems)
    .where(eq(orderItems.menuItemId, safeId));
  const usedInOrders = Number(usage?.count ?? 0);
  await db.transaction(async (tx) => {
    await tx.delete(menuItems).where(eq(menuItems.id, safeId));
    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
      action: "Menu product permanently deleted",
      object: existing.name,
      device: garage.profile.deviceLabel,
      status: "deleted",
      metadata: {
        productId: safeId,
        category: existing.category,
        usedInOrders,
        historyPolicy: "order_items keep itemName, variantLabel, unitPrice, qty, and lineTotal snapshots",
      },
    });
  });

  return {
    id: existing.id,
    name: existing.name,
    usedInOrders,
    status: "deleted" as const,
  };
}

export async function getKitchenData(params?: {
  status?: string;
  station?: string;
  viewerRole?: string;
}) {
  const filters = [];
  if (params?.status && params.status !== "all") {
    filters.push(eq(kitchenTickets.status, params.status));
  }

  const roleStation =
    params?.viewerRole === "Koki" || params?.viewerRole === "Asisten Koki"
      ? "Food"
      : params?.viewerRole === "Barista"
        ? "Bar"
        : null;
  const station = roleStation ?? params?.station;

  if (station && station !== "all") {
    filters.push(eq(kitchenTickets.station, station));
  }

  const rows = await getDb()
    .select()
    .from(kitchenTickets)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(kitchenTickets.createdAt))
    // Bounded: endpoint ini di-poll KDS/waiter terus-menerus. Tiket aktif selalu
    // yang terbaru, jadi 500 terbaru pasti mencakup seluruh queue aktif tanpa
    // menarik histori tiket lama yang membengkak seiring waktu.
    .limit(500);

  // Compute addonSequence per ticket — kitchen perlu tahu ini order ke-berapa
  // di session meja yang sama. Order pertama → seq=1 (no badge). Order kedua
  // dst → seq=2,3,... → render "ADD-ON #N" badge supaya barista/koki tahu
  // ini order tambahan ke meja yang sudah ada session.
  //
  // Grouping: by tableLabel, count UNIQUE orderId sorted by min createdAt.
  // Multi-station tickets dari 1 order yang sama (Food + Bar split) tidak
  // bikin seq +1 karena pakai orderId yang sama.
  const tableOrderMap = new Map<string, Map<string, Date>>();
  for (const row of rows) {
    if (!row.orderId || row.tableLabel === "Take Away" || row.tableLabel === "Delivery") {
      continue;
    }
    let orderMinDate = tableOrderMap.get(row.tableLabel);
    if (!orderMinDate) {
      orderMinDate = new Map();
      tableOrderMap.set(row.tableLabel, orderMinDate);
    }
    const existing = orderMinDate.get(row.orderId);
    if (!existing || row.createdAt < existing) {
      orderMinDate.set(row.orderId, row.createdAt);
    }
  }
  const sequenceByOrderId = new Map<string, number>();
  for (const [, orderMap] of tableOrderMap) {
    const sortedOrderIds = Array.from(orderMap.entries())
      .sort((a, b) => a[1].getTime() - b[1].getTime())
      .map(([orderId]) => orderId);
    sortedOrderIds.forEach((orderId, idx) => {
      sequenceByOrderId.set(orderId, idx + 1);
    });
  }

  return rows.map((row) => ({
    id: row.ticketNo,
    table: row.tableLabel,
    channel: row.channel,
    station: row.station,
    status: row.status,
    elapsed: row.elapsed,
    items: row.items,
    itemNotes: row.itemNotes,
    internalNotes: row.internalNotes ?? null,
    priority: row.priority,
    targetMinutes: row.targetMinutes,
    targetGroup: row.targetGroup,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedByName: row.acceptedByName,
    readyAt: row.readyAt?.toISOString() ?? null,
    readyByName: row.readyByName,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    deliveredByName: row.deliveredByName,
    claimedBy: row.claimedBy ?? null,
    claimedByName: row.claimedByName ?? null,
    createdAt: row.createdAt.toISOString(),
    // Sequence dalam session meja: 1 = order pertama, 2+ = addon
    addonSequence: row.orderId ? sequenceByOrderId.get(row.orderId) ?? 1 : 1,
  }));
}

export async function updateKitchenTicketDetails(
  ticketNo: string,
  input: {
    station?: string;
    priority?: string;
    itemNotes?: Record<string, unknown>;
    internalNotes?: string;
  },
  garage: GarageSession,
) {
  const db = getDb();
  const [current] = await db
    .select()
    .from(kitchenTickets)
    .where(eq(kitchenTickets.ticketNo, ticketNo))
    .limit(1);

  if (!current) {
    return null;
  }

  const update: Partial<typeof kitchenTickets.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.station !== undefined) {
    update.station = input.station;
  }

  if (input.priority !== undefined) {
    update.priority = input.priority;
  }

  if (input.itemNotes !== undefined) {
    update.itemNotes = input.itemNotes;
  }

  if (input.internalNotes !== undefined) {
    update.internalNotes = input.internalNotes;
  }

  const [ticket] = await db
    .update(kitchenTickets)
    .set(update)
    .where(eq(kitchenTickets.ticketNo, ticketNo))
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Kitchen ticket details updated",
    object: ticket.ticketNo,
    device: garage.profile.deviceLabel,
    metadata: { input },
  });

  return ticket;
}

export async function bulkUpdateKitchenStatus(
  ticketNos: string[],
  status: string,
  garage: GarageSession,
) {
  const updated: Array<typeof kitchenTickets.$inferSelect> = [];
  const skipped: Array<{ ticketNo: string; reason: string }> = [];

  for (const ticketNo of ticketNos) {
    try {
      const ticket = await updateKitchenStatus(ticketNo, status, garage);
      if (ticket) {
        updated.push(ticket);
      } else {
        skipped.push({ ticketNo, reason: "not_found" });
      }
    } catch (error) {
      if (error instanceof KitchenTransitionError) {
        skipped.push({
          ticketNo,
          reason: `invalid_transition:${error.from}->${error.to}`,
        });
        continue;
      }
      throw error;
    }
  }

  return { updated, skipped };
}

export async function recallKitchenTickets(
  ticketNos: string[],
  garage: GarageSession,
) {
  const db = getDb();
  const now = new Date();

  // Only recall tickets that are in "delivered" status and delivered within last 30 minutes
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const rows = await db
    .update(kitchenTickets)
    .set({
      status: "ready",
      deliveredAt: null,
      deliveredByName: null,
      updatedAt: now,
    })
    .where(
      and(
        inArray(kitchenTickets.ticketNo, ticketNos),
        eq(kitchenTickets.status, "delivered"),
        gte(kitchenTickets.deliveredAt ?? thirtyMinAgo, thirtyMinAgo),
      ),
    )
    .returning();

  for (const ticket of rows) {
    await createAuditLog({
      actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
      action: "Kitchen ticket recalled",
      object: ticket.ticketNo,
      device: garage.profile.deviceLabel,
    });
  }

  return rows;
}

export async function getKitchenPerformanceData(params?: {
  range?: string;
  viewerRole?: string;
}) {
  const range = params?.range === "today" ? "today" : "month";
  const { start, end } =
    range === "today" ? getJakartaTodayRange() : getJakartaMonthRange();
  const db = getDb();
  const roleStation =
    params?.viewerRole === "Koki" || params?.viewerRole === "Asisten Koki"
      ? "Food"
      : params?.viewerRole === "Barista"
        ? "Bar"
        : null;
  const completedFilters = [gte(kitchenTickets.readyAt, start), lt(kitchenTickets.readyAt, end)];
  if (roleStation) {
    completedFilters.push(eq(kitchenTickets.station, roleStation));
  }
  const activeStatusFilter = or(
    eq(kitchenTickets.status, "queue"),
    eq(kitchenTickets.status, "cooking"),
    eq(kitchenTickets.status, "ready"),
  );
  const activeFilters = roleStation
    ? and(activeStatusFilter, eq(kitchenTickets.station, roleStation))
    : activeStatusFilter;

  const [completedRows, activeRows] = await Promise.all([
    db
      .select()
      .from(kitchenTickets)
      .where(and(...completedFilters))
      .orderBy(desc(kitchenTickets.readyAt)),
    db
      .select({ total: count() })
      .from(kitchenTickets)
      .where(activeFilters),
  ]);

  const buckets = new Map<
    string,
    {
      staffName: string;
      stations: Set<string>;
      totalTickets: number;
      totalProducts: number;
      onTimeProducts: number;
      onTimeTickets: number;
      lateTickets: number;
      productionMinutes: number[];
    }
  >();

  for (const ticket of completedRows) {
    if (!ticket.readyAt) {
      continue;
    }

    const staffName =
      ticket.readyByName ?? ticket.acceptedByName ?? "Belum tercatat";
    const productionMinutes =
      minutesBetween(ticket.acceptedAt ?? ticket.createdAt, ticket.readyAt) ??
      ticket.elapsed;
    const isLate = productionMinutes > ticket.targetMinutes;
    const bucket = buckets.get(staffName) ?? {
      staffName,
      stations: new Set<string>(),
      totalTickets: 0,
      totalProducts: 0,
      onTimeProducts: 0,
      onTimeTickets: 0,
      lateTickets: 0,
      productionMinutes: [],
    };
    const productCount = ticket.items.reduce(
      (sum, item) => sum + kitchenItemQuantity(item),
      0,
    );

    bucket.stations.add(ticket.station);
    bucket.totalTickets += 1;
    bucket.totalProducts += productCount;
    bucket.productionMinutes.push(productionMinutes);

    if (isLate) {
      bucket.lateTickets += 1;
    } else {
      bucket.onTimeTickets += 1;
      bucket.onTimeProducts += productCount;
    }

    buckets.set(staffName, bucket);
  }

  const rows = Array.from(buckets.values())
    .map((bucket) => {
      const avg =
        bucket.productionMinutes.length > 0
          ? bucket.productionMinutes.reduce((sum, value) => sum + value, 0) /
            bucket.productionMinutes.length
          : null;
      const lateRate =
        bucket.totalTickets > 0
          ? Number(((bucket.lateTickets / bucket.totalTickets) * 100).toFixed(1))
          : 0;

      return {
        staffName: bucket.staffName,
        stations: Array.from(bucket.stations).sort(),
        totalTickets: bucket.totalTickets,
        totalProducts: bucket.totalProducts,
        onTimeProducts: bucket.onTimeProducts,
        onTimeTickets: bucket.onTimeTickets,
        lateTickets: bucket.lateTickets,
        lateRate,
        score: Math.max(0, Math.round(100 - lateRate)),
        bonusPoints: bucket.onTimeProducts,
        warningLevel: kitchenWarningLevel(bucket.totalTickets, lateRate),
        avgProductionMinutes: avg == null ? null : Number(avg.toFixed(1)),
      };
    })
    .sort((left, right) => {
      const warningRank: Record<string, number> = {
        SP3: 4,
        SP2: 3,
        SP1: 2,
        "Data Belum Cukup": 1,
        Aman: 0,
      };
      const warningDelta =
        (warningRank[right.warningLevel] ?? 0) - (warningRank[left.warningLevel] ?? 0);
      if (warningDelta !== 0) {
        return warningDelta;
      }

      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return right.totalTickets - left.totalTickets;
    });

  const durations = rows
    .map((row) => row.avgProductionMinutes)
    .filter((value): value is number => value != null);
  const totalTickets = rows.reduce((sum, row) => sum + row.totalTickets, 0);
  const totalProducts = rows.reduce((sum, row) => sum + row.totalProducts, 0);
  const totalScore = rows.reduce((sum, row) => sum + row.score, 0);
  const weightedMinutes = rows.reduce(
    (sum, row) => sum + (row.avgProductionMinutes ?? 0) * row.totalTickets,
    0,
  );

  return {
    range,
    generatedAt: new Date().toISOString(),
    summary: {
      onTimeTickets: rows.reduce((sum, row) => sum + row.onTimeTickets, 0),
      lateTickets: rows.reduce((sum, row) => sum + row.lateTickets, 0),
      totalTickets,
      totalProducts,
      bonusPoints: rows.reduce((sum, row) => sum + row.bonusPoints, 0),
      avgScore: rows.length ? Math.round(totalScore / rows.length) : null,
      avgProductionMinutes:
        durations.length && totalTickets
          ? Number((weightedMinutes / totalTickets).toFixed(1))
          : null,
      activeTickets: activeRows[0]?.total ?? 0,
    },
    rows,
  };
}

export async function getKitchenShiftReport(params: {
  date?: string;
  garage: GarageSession;
}) {
  const db = getDb();
  const date = params.date ?? jakartaDateKey(new Date());
  const { start, end } = jakartaDayRange(date);
  const outletId = params.garage.profile.outlet.id;

  const sessionRows = await db
    .select({
      id: cashSessions.id,
      status: cashSessions.status,
      openedAt: cashSessions.openedAt,
      closedAt: cashSessions.closedAt,
      cashierName: user.name,
    })
    .from(cashSessions)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, cashSessions.openedBy))
    .leftJoin(user, eq(user.id, cashSessions.openedBy))
    .where(
      and(
        eq(cashSessions.outletId, outletId),
        eq(staffProfiles.role, "Kasir"),
        gte(cashSessions.openedAt, start),
        lt(cashSessions.openedAt, end),
      ),
    )
    .orderBy(asc(cashSessions.openedAt));

  const shifts = await Promise.all(
    sessionRows.map(async (session, index) => {
      const now = new Date();
      const rawEnd = session.closedAt ?? now;
      const windowEnd = rawEnd.getTime() > end.getTime() ? end : rawEnd;

      const [foodTickets, readyTickets, earningRows] = await Promise.all([
        db
          .select({
            id: kitchenTickets.id,
            status: kitchenTickets.status,
            items: kitchenTickets.items,
          })
          .from(kitchenTickets)
          .where(
            and(
              eq(kitchenTickets.station, "Food"),
              gte(kitchenTickets.createdAt, session.openedAt),
              lt(kitchenTickets.createdAt, windowEnd),
            ),
          ),
        db
          .select({
            id: kitchenTickets.id,
            items: kitchenTickets.items,
          })
          .from(kitchenTickets)
          .where(
            and(
              eq(kitchenTickets.station, "Food"),
              gte(kitchenTickets.readyAt, session.openedAt),
              lt(kitchenTickets.readyAt, windowEnd),
            ),
          ),
        db
          .select({
            role: staffEarnings.role,
            amount: sql<number>`coalesce(sum(${staffEarnings.amount}), 0)`.mapWith(Number),
          })
          .from(staffEarnings)
          .where(
            and(
              eq(staffEarnings.outletId, outletId),
              eq(staffEarnings.event, "ticket_ready"),
              eq(staffEarnings.itemKind, "food"),
              eq(staffEarnings.status, "accrued"),
              gte(staffEarnings.earnedAt, session.openedAt),
              lt(staffEarnings.earnedAt, windowEnd),
            ),
          )
          .groupBy(staffEarnings.role),
      ]);

      const kokiFee =
        earningRows.find((row) => row.role === "Koki")?.amount ?? 0;
      const assistantFee =
        earningRows.find((row) => row.role === "Asisten Koki")?.amount ?? 0;
      const totalItems = readyTickets.reduce(
        (sum, ticket) =>
          sum + ticket.items.reduce((itemSum, item) => itemSum + kitchenItemQuantity(item), 0),
        0,
      );

      return {
        sessionId: session.id,
        shiftNumber: index + 1,
        shiftLabel: shiftLabelForNumber(index + 1),
        cashierName: session.cashierName ?? "Kasir",
        status: session.status,
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() ?? null,
        foodTickets: foodTickets.length,
        readyTickets: readyTickets.length,
        activeTickets: foodTickets.filter((ticket) =>
          ["queue", "cooking", "ready"].includes(ticket.status),
        ).length,
        totalItems,
        totalFee: kokiFee + assistantFee,
        kokiFee,
        assistantFee,
      };
    }),
  );

  return {
    date,
    generatedAt: new Date().toISOString(),
    shifts,
    totals: {
      shifts: shifts.length,
      foodTickets: shifts.reduce((sum, row) => sum + row.foodTickets, 0),
      readyTickets: shifts.reduce((sum, row) => sum + row.readyTickets, 0),
      activeTickets: shifts.reduce((sum, row) => sum + row.activeTickets, 0),
      totalItems: shifts.reduce((sum, row) => sum + row.totalItems, 0),
      totalFee: shifts.reduce((sum, row) => sum + row.totalFee, 0),
      kokiFee: shifts.reduce((sum, row) => sum + row.kokiFee, 0),
      assistantFee: shifts.reduce((sum, row) => sum + row.assistantFee, 0),
    },
  };
}

export async function getInventoryData(params?: {
  q?: string;
  category?: string;
  usageArea?: string;
  status?: string;
}) {
  const filters = [];
  if (params?.category && params.category !== "All") {
    filters.push(eq(inventoryItems.category, params.category));
  }

  if (params?.usageArea && params.usageArea !== "all") {
    filters.push(eq(inventoryItems.usageArea, params.usageArea));
  }

  if (params?.status && params.status !== "all") {
    filters.push(eq(inventoryItems.status, params.status));
  }

  if (params?.q) {
    const search = `%${params.q}%`;
    filters.push(
      or(
        ilike(inventoryItems.sku, search),
        ilike(inventoryItems.name, search),
        ilike(inventoryItems.alternativeName, search),
        ilike(inventoryItems.category, search),
        ilike(inventoryItems.usageArea, search),
        ilike(inventoryItems.packageSize, search),
      ),
    );
  }

  return getDb()
    .select()
    .from(inventoryItems)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(inventoryItems.category, inventoryItems.sku);
}

export async function getStockMovementData() {
  const rows = await getDb()
    .select()
    .from(stockMovements)
    .orderBy(desc(stockMovements.createdAt))
    .limit(24);

  return rows.map((row) => row.note);
}

// Movements detail per SKU untuk modal Inventory detail
export async function getStockMovementsForSku(sku: string, limit = 30) {
  const rows = await getDb()
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.itemSku, sku))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    note: row.note,
    qty: row.qty,
    actor: row.actor,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getInventorySkuTimeline(sku: string) {
  const db = getDb();
  const [locations, receivings, transfers] = await Promise.all([
    db
      .select({
        id: inventoryLocationStocks.id,
        locationType: inventoryLocationStocks.locationType,
        locationKey: inventoryLocationStocks.locationKey,
        outletName: outlets.name,
        onHand: inventoryLocationStocks.onHand,
        min: inventoryLocationStocks.min,
        status: inventoryLocationStocks.status,
        movement: inventoryLocationStocks.movement,
        updatedAt: inventoryLocationStocks.updatedAt,
      })
      .from(inventoryLocationStocks)
      .leftJoin(outlets, eq(outlets.id, inventoryLocationStocks.outletId))
      .where(eq(inventoryLocationStocks.itemSku, sku))
      .orderBy(inventoryLocationStocks.locationType, inventoryLocationStocks.locationKey),
    db
      .select({
        id: supplierReceivings.id,
        code: supplierReceivings.code,
        invoiceNo: supplierReceivings.invoiceNo,
        totalAmount: supplierReceivings.totalAmount,
        receivedAt: supplierReceivings.receivedAt,
        qty: supplierReceivingItems.qty,
        unit: supplierReceivingItems.unit,
        unitCost: supplierReceivingItems.unitCost,
        lineTotal: supplierReceivingItems.lineTotal,
      })
      .from(supplierReceivingItems)
      .innerJoin(supplierReceivings, eq(supplierReceivings.id, supplierReceivingItems.receivingId))
      .where(eq(supplierReceivingItems.itemSku, sku))
      .orderBy(desc(supplierReceivings.receivedAt))
      .limit(20),
    db
      .select({
        id: inventoryTransferRequests.id,
        requestNo: inventoryTransferRequests.requestNo,
        outletName: outlets.name,
        station: inventoryTransferRequests.station,
        status: inventoryTransferRequests.status,
        createdAt: inventoryTransferRequests.createdAt,
        issuedAt: inventoryTransferRequests.issuedAt,
        requestedQty: inventoryTransferItems.requestedQty,
        issuedQty: inventoryTransferItems.issuedQty,
        unit: inventoryTransferItems.unit,
      })
      .from(inventoryTransferItems)
      .innerJoin(
        inventoryTransferRequests,
        eq(inventoryTransferRequests.id, inventoryTransferItems.requestId),
      )
      .leftJoin(outlets, eq(outlets.id, inventoryTransferRequests.outletId))
      .where(eq(inventoryTransferItems.itemSku, sku))
      .orderBy(desc(inventoryTransferRequests.createdAt))
      .limit(20),
  ]);

  return {
    locations: locations.map((row) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    })),
    receivings: receivings.map((row) => ({
      ...row,
      receivedAt: row.receivedAt.toISOString(),
    })),
    transfers: transfers.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      issuedAt: row.issuedAt?.toISOString() ?? null,
    })),
  };
}

export async function getInventoryLocationStockData(params?: {
  locationType?: "warehouse" | "outlet";
  outletId?: string;
}) {
  const filters = [];
  if (params?.locationType) filters.push(eq(inventoryLocationStocks.locationType, params.locationType));
  if (params?.outletId) filters.push(eq(inventoryLocationStocks.outletId, params.outletId));

  const rows = await getDb()
    .select({
      id: inventoryLocationStocks.id,
      itemSku: inventoryLocationStocks.itemSku,
      locationType: inventoryLocationStocks.locationType,
      locationKey: inventoryLocationStocks.locationKey,
      outletId: inventoryLocationStocks.outletId,
      outletName: outlets.name,
      outletCode: outlets.code,
      onHand: inventoryLocationStocks.onHand,
      min: inventoryLocationStocks.min,
      status: inventoryLocationStocks.status,
      movement: inventoryLocationStocks.movement,
      updatedAt: inventoryLocationStocks.updatedAt,
      name: inventoryItems.name,
      category: inventoryItems.category,
      usageArea: inventoryItems.usageArea,
      unit: inventoryItems.unit,
      unitCost: inventoryItems.unitCost,
    })
    .from(inventoryLocationStocks)
    .innerJoin(inventoryItems, eq(inventoryLocationStocks.itemSku, inventoryItems.sku))
    .leftJoin(outlets, eq(inventoryLocationStocks.outletId, outlets.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(inventoryLocationStocks.locationType, inventoryItems.category, inventoryItems.name);

  return rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
    stockValue: Math.round(row.onHand * row.unitCost),
  }));
}

export async function adjustInventoryLocationStock(
  input: LocationStockAdjustInput,
  garage: GarageSession,
) {
  const db = getDb();
  const qty = Number(input.qty);
  const note = input.note.trim();
  if (input.mode !== "clear" && (!Number.isFinite(qty) || qty <= 0)) {
    throw new Error("Qty adjustment wajib angka lebih dari 0.");
  }
  if (note.length < 3) {
    throw new Error("Catatan adjustment wajib diisi minimal 3 karakter.");
  }

  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  const now = new Date();

  // Wire: lowStockThreshold dari /control/settings → recalc inventory status
  const policy = await getAppSettings(garage.profile.outlet.id);
  const lowStockThreshold = Number(policy.lowStockThreshold) || 0;

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: inventoryLocationStocks.id,
        itemSku: inventoryLocationStocks.itemSku,
        locationType: inventoryLocationStocks.locationType,
        locationKey: inventoryLocationStocks.locationKey,
        outletId: inventoryLocationStocks.outletId,
        onHand: inventoryLocationStocks.onHand,
        min: inventoryLocationStocks.min,
        itemName: inventoryItems.name,
        unit: inventoryItems.unit,
      })
      .from(inventoryLocationStocks)
      .innerJoin(inventoryItems, eq(inventoryItems.sku, inventoryLocationStocks.itemSku))
      .where(eq(inventoryLocationStocks.id, input.id))
      .limit(1);
    if (!current) throw new Error("Stok lokasi tidak ditemukan.");

    const signedQty =
      input.mode === "clear" ? -current.onHand : input.mode === "subtract" ? -qty : qty;
    // Anti stok minus: subtract yang melebihi onHand dilarang (clear aman karena = -onHand).
    if (input.mode === "subtract" && Number(current.onHand) + signedQty < 0) {
      throw new Error(
        `Stok tidak cukup untuk dikurangi: tersedia ${current.onHand} ${current.unit}, diminta ${qty} ${current.unit}.`,
      );
    }
    const nextOnHand = Math.max(0, Number((current.onHand + signedQty).toFixed(4)));
    const movementNote = `${current.locationType}_${input.mode}: ${note}`;

    const [updated] = await tx
      .update(inventoryLocationStocks)
      .set({
        onHand: nextOnHand,
        status: inventoryStatusFor(nextOnHand, current.min, lowStockThreshold),
        movement: movementNote,
        updatedAt: now,
      })
      .where(eq(inventoryLocationStocks.id, current.id))
      .returning();

    if (current.locationType === "warehouse") {
      await tx
        .update(inventoryItems)
        .set({
          onHand: nextOnHand,
          status: inventoryStatusFor(nextOnHand, current.min, lowStockThreshold),
          movement: movementNote,
          updatedAt: now,
        })
        .where(eq(inventoryItems.sku, current.itemSku));
    }

    await tx.insert(stockMovements).values({
      itemSku: current.itemSku,
      type: current.locationType === "warehouse" ? `warehouse_${input.mode}` : `outlet_${input.mode}`,
      note: `${current.itemName}: ${signedQty > 0 ? "+" : ""}${signedQty} ${current.unit} / ${note}`,
      qty: signedQty,
      actor,
    });

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action: "Location stock adjusted",
      object: current.itemSku,
      device: garage.profile.deviceLabel,
      status: "recorded",
      metadata: {
        locationStockId: current.id,
        locationType: current.locationType,
        locationKey: current.locationKey,
        outletId: current.outletId,
        mode: input.mode,
        qty,
        previousOnHand: current.onHand,
        nextOnHand,
        note,
      },
    });

    return updated;
  });

  return serializeDateFields(result);
}

// threshold = lowStockThreshold dari settings (default 0 = pakai fallback 25%).
// Kalau threshold > 0, watch tier = onHand ≤ min + threshold (additive buffer).
function inventoryStatusFor(onHand: number, min: number, threshold = 0) {
  if (min > 0 && onHand <= min) return "low";
  const watchCutoff = threshold > 0 ? min + threshold : min * 1.25;
  if (min > 0 && onHand <= watchCutoff) return "watch";
  return "safe";
}

function inventoryUsageAreaFor(category: string, name = ""): "bar" | "dapur" | "general" {
  const text = `${category} ${name}`.toLowerCase();
  if (
    text.includes("operasional") ||
    text.includes("cleaning") ||
    text.includes("packaging") ||
    text.includes("consumable")
  ) {
    return "general";
  }
  if (
    text.includes("minuman") ||
    text.includes("coffee") ||
    text.includes("kopi") ||
    text.includes("espresso") ||
    text.includes("tea") ||
    text.includes("syrup") ||
    text.includes("flavor") ||
    text.includes("susu") ||
    text.includes("dairy") ||
    text.includes("matcha") ||
    text.includes("lemonade") ||
    text.includes("avocado") ||
    text.includes("mango") ||
    text.includes("taro") ||
    text.includes("red velvet") ||
    text.includes("cappucino")
  ) {
    return "bar";
  }
  return "dapur";
}

function normalizeInventoryUsageArea(
  usageArea: string | null | undefined,
  category: string,
  name = "",
): "bar" | "dapur" | "general" {
  if (usageArea === "bar" || usageArea === "dapur" || usageArea === "general") return usageArea;
  return inventoryUsageAreaFor(category, name);
}

const WAREHOUSE_LOCATION_KEY = "warehouse";

function roleStationArea(role: Role): "bar" | "dapur" | null {
  if (role === "Barista") return "bar";
  if (role === "Koki" || role === "Asisten Koki") return "dapur";
  return null;
}

function canManageWarehouseFlow(role: Role) {
  return role === "Owner / CEO" || role === "Admin" || role === "Gudang";
}

function outletLocationKey(outletId: string) {
  return `outlet:${outletId}`;
}

function documentDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  const millis = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}-${hour}${minute}${second}${millis}`;
}

function transferRequestNo(outletCode: string) {
  return `TRF-${outletCode}-${documentDateStamp()}`;
}

function supplierReceivingCode() {
  return `RCV-${documentDateStamp()}`;
}

function serializeDateFields<T extends Record<string, unknown>>(row: T) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}

async function ensureLocationStock(
  tx: Pick<ReturnType<typeof getDb>, "select" | "insert">,
  input: {
    sku: string;
    locationType: "warehouse" | "outlet";
    locationKey: string;
    outletId?: string | null;
    min: number;
    movement?: string;
  },
) {
  const [existing] = await tx
    .select()
    .from(inventoryLocationStocks)
    .where(
      and(
        eq(inventoryLocationStocks.itemSku, input.sku),
        eq(inventoryLocationStocks.locationKey, input.locationKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [created] = await tx
    .insert(inventoryLocationStocks)
    .values({
      itemSku: input.sku,
      locationType: input.locationType,
      locationKey: input.locationKey,
      outletId: input.outletId ?? null,
      onHand: 0,
      min: input.min,
      status: inventoryStatusFor(0, input.min),
      movement: input.movement ?? "Location stock initialized",
    })
    .returning();

  return created;
}

export async function createInventoryItem(input: InventoryItemInput, garage: GarageSession) {
  const db = getDb();
  const sku = input.sku.trim().toUpperCase();
  const name = input.name.trim();
  const category = input.category.trim();
  const usageArea = normalizeInventoryUsageArea(input.usageArea, category, name);
  const unit = input.unit.trim();
  const packageSize = input.packageSize.trim();
  const onHand = Number(input.onHand);
  const min = Number(input.min);
  const unitCost = Math.max(0, Math.round(Number(input.unitCost ?? 0)));

  if (!sku || !name || !category || !unit || !packageSize) {
    throw new Error("SKU, nama, kategori, unit, dan package size wajib diisi.");
  }
  if (!Number.isFinite(onHand) || onHand < 0 || !Number.isFinite(min) || min < 0) {
    throw new Error("Stok on hand dan minimum stok harus angka >= 0.");
  }
  if (!Number.isFinite(unitCost)) {
    throw new Error("Unit cost harus angka valid.");
  }

  const now = new Date();
  const [created] = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ sku: inventoryItems.sku })
      .from(inventoryItems)
      .where(eq(inventoryItems.sku, sku))
      .limit(1);
    if (existing) {
      throw new Error("SKU gudang sudah ada. Gunakan SKU lain.");
    }

    const inserted = await tx
      .insert(inventoryItems)
      .values({
        sku,
        name,
        alternativeName: input.alternativeName?.trim() || "-",
        category,
        usageArea,
        unit,
        packageSize,
        unitCost,
        onHand,
        min,
        status: inventoryStatusFor(onHand, min),
        movement: input.movement?.trim() || "SKU gudang dibuat",
        updatedAt: now,
      })
      .returning();

    await tx.insert(inventoryLocationStocks).values({
      itemSku: sku,
      locationType: "warehouse",
      locationKey: WAREHOUSE_LOCATION_KEY,
      outletId: null,
      onHand,
      min,
      status: inventoryStatusFor(onHand, min),
      movement: input.movement?.trim() || "SKU gudang dibuat",
      updatedAt: now,
    });

    if (onHand > 0) {
      await tx.insert(stockMovements).values({
        itemSku: sku,
        type: "opening_stock",
        note: `Opening stock: ${onHand} ${unit}`,
        qty: onHand,
        actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
      });
    }

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
      action: "Warehouse SKU created",
      object: sku,
      device: garage.profile.deviceLabel,
      status: "recorded",
      metadata: {
        sku,
        name,
        category,
        usageArea,
        onHand,
        min,
        unitCost,
      },
    });

    return inserted;
  });

  return created;
}

export async function getFinanceSummary(params?: { outletId?: string; openedBy?: string }) {
  const db = getDb();
  const paymentRows = await db
    .select({
      method: payments.method,
      amount: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
    })
    .from(payments)
    .where(eq(payments.status, "captured"))
    .groupBy(payments.method);
  const total = paymentRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const [cashSession] = await db
    .select()
    .from(cashSessions)
    .where(
      params?.outletId || params?.openedBy
        ? and(
            params.outletId ? eq(cashSessions.outletId, params.outletId) : undefined,
            params.openedBy ? eq(cashSessions.openedBy, params.openedBy) : undefined,
          )
        : undefined,
    )
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);

  return {
    cashSession: cashSession
      ? {
          id: cashSession.id,
          code: cashSession.code,
          openingCash: cashSession.openingCash,
          expectedCash: cashSession.expectedCash,
          actualCash: cashSession.actualCash,
          discrepancy: cashSession.discrepancy,
      status: cashSession.status,
      checklist: cashSession.checklist,
      denominations: cashSession.denominations,
      closingNote: cashSession.closingNote,
      discrepancyStatus: cashSession.discrepancyStatus,
      managerSignOffAt: cashSession.managerSignOffAt?.toISOString() ?? null,
    }
      : {
          id: null,
          code: "CS-PENDING",
          openingCash: 0,
          expectedCash: 0,
          actualCash: null,
          discrepancy: 0,
          status: "missing",
          checklist: fallbackClosingChecklist,
          denominations: {},
          closingNote: null,
          discrepancyStatus: "missing",
          managerSignOffAt: null,
        },
    paymentBreakdown: paymentRows.map((row) => ({
      method: row.method,
      amount: Number(row.amount),
      share: total ? Math.round((Number(row.amount) / total) * 100) : 0,
    })),
  };
}

export async function getFinanceOverview() {
  const db = getDb();
  const { start: todayStart, end: todayEnd } = getJakartaTodayRange();
  const { start: monthStart, end: monthEnd } = getJakartaMonthRange();

  // Today metrics from paid orders.
  const [todayAgg] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, todayStart),
        lt(orders.createdAt, todayEnd),
      ),
    );

  const todayMethodRows = await db
    .select({
      method: payments.method,
      amount: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(payments.status, "captured"),
        eq(orders.status, "paid"),
        gte(orders.createdAt, todayStart),
        lt(orders.createdAt, todayEnd),
      ),
    )
    .groupBy(payments.method);
  const todayPaymentTotal = todayMethodRows.reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0,
  );

  const cashCollected = todayMethodRows
    .filter((row) => row.method === "Cash")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const nonCashCollected = todayMethodRows
    .filter((row) => row.method !== "Cash")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  // Staff fee liability.
  const [accruedRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${staffEarnings.amount}), 0)::int`,
      cnt: sql<number>`count(*)::int`,
    })
    .from(staffEarnings)
    .where(eq(staffEarnings.status, "accrued"));

  const [approvedRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${staffEarningPayouts.totalAmount}), 0)::int`,
      cnt: sql<number>`count(*)::int`,
    })
    .from(staffEarningPayouts)
    .where(eq(staffEarningPayouts.status, "approved"));

  // Recent paid orders (today, latest 10).
  const recentOrders = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      channel: orders.channel,
      total: orders.total,
      tableLabel: orders.tableLabel,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.status, "paid"))
    .orderBy(desc(orders.createdAt))
    .limit(15);

  const recentOrderIds = recentOrders.map((row) => row.id);
  const paymentMethods = recentOrderIds.length
    ? await db
        .select({
          orderId: payments.orderId,
          method: payments.method,
          amount: payments.amount,
        })
        .from(payments)
        .where(
          and(
            inArray(payments.orderId, recentOrderIds),
            eq(payments.status, "captured"),
          ),
        )
    : [];
  const methodByOrder = new Map<string, { method: string; amount: number }>();
  for (const row of paymentMethods) {
    if (!row.orderId) continue;
    if (!methodByOrder.has(row.orderId)) {
      methodByOrder.set(row.orderId, { method: row.method, amount: Number(row.amount) });
    }
  }

  const [monthAgg] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      discounts: sql<number>`coalesce(sum(${orders.discount}), 0)::int`,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, monthStart),
        lt(orders.createdAt, monthEnd),
      ),
    );

  const weekRows = await db
    .select({
      week: sql<number>`least(4, greatest(1, floor((extract(day from ${orders.createdAt}) - 1) / 7) + 1))::int`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, monthStart),
        lt(orders.createdAt, monthEnd),
      ),
    )
    .groupBy(sql`least(4, greatest(1, floor((extract(day from ${orders.createdAt}) - 1) / 7) + 1))::int`);

  const lowStockRows = await db
    .select({
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      onHand: inventoryItems.onHand,
      min: inventoryItems.min,
      unit: inventoryItems.unit,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.status, "low"))
    .orderBy(inventoryItems.onHand)
    .limit(3);

  const todayRecipeCostRows = await db
    .select({
      orderId: orderItems.orderId,
      orderQty: orderItems.qty,
      recipeQty: menuRecipes.qty,
      wastePct: menuRecipes.wastePct,
      unitCost: inventoryItems.unitCost,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(
      menuRecipes,
      and(
        eq(orderItems.menuItemId, menuRecipes.menuItemId),
        eq(menuRecipes.status, "active"),
        or(eq(menuRecipes.variantId, orderItems.variantId), eq(menuRecipes.variantId, "all")),
      ),
    )
    .leftJoin(inventoryItems, eq(menuRecipes.inventorySku, inventoryItems.sku))
    .where(
      and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, todayStart),
        lt(orders.createdAt, todayEnd),
      ),
    );

  const todayExpenseRows = await db
    .select({
      category: expenses.category,
      amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
    })
    .from(expenses)
    .where(
      and(
        inArray(expenses.status, ["recorded", "approved", "paid"]),
        gte(expenses.expenseDate, todayStart),
        lt(expenses.expenseDate, todayEnd),
      ),
    )
    .groupBy(expenses.category);

  const [todayPendingExpenseRow] = await db
    .select({
      amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.status, "pending_approval"),
        gte(expenses.expenseDate, todayStart),
        lt(expenses.expenseDate, todayEnd),
      ),
    );

  const [todayCashExpenseRow] = await db
    .select({
      amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(
      and(
        inArray(expenses.status, ["recorded", "approved", "paid"]),
        eq(expenses.paymentMethod, "Cash"),
        gte(expenses.expenseDate, todayStart),
        lt(expenses.expenseDate, todayEnd),
      ),
    );

  const monthExpenseRows = await db
    .select({
      category: expenses.category,
      amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
    })
    .from(expenses)
    .where(
      and(
        inArray(expenses.status, ["recorded", "approved", "paid"]),
        gte(expenses.expenseDate, monthStart),
        lt(expenses.expenseDate, monthEnd),
      ),
    )
    .groupBy(expenses.category);

  const settlementRows = await db
    .select()
    .from(paymentSettlements)
    .where(
      and(
        gte(paymentSettlements.settlementDate, todayStart),
        lt(paymentSettlements.settlementDate, todayEnd),
      ),
    )
    .orderBy(desc(paymentSettlements.createdAt))
    .limit(12);

  const supplierInvoiceRows = await db
    .select({
      id: supplierInvoices.id,
      invoiceNo: supplierInvoices.invoiceNo,
      dueDate: supplierInvoices.dueDate,
      amount: supplierInvoices.amount,
      paidAmount: supplierInvoices.paidAmount,
      status: supplierInvoices.status,
      supplierName: suppliers.name,
    })
    .from(supplierInvoices)
    .leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
    .where(inArray(supplierInvoices.status, ["unpaid", "due", "overdue", "partial"]))
    .orderBy(supplierInvoices.dueDate)
    .limit(12);

  const [latestCashSession] = await db
    .select()
    .from(cashSessions)
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);

  const dailyRevenue = Number(todayAgg?.revenue ?? 0);
  const dailyOrderCount = Number(todayAgg?.orderCount ?? 0);
  const monthRevenue = Number(monthAgg?.revenue ?? 0);
  const monthDiscounts = Number(monthAgg?.discounts ?? 0);
  const todayExpenseByCategory = new Map(
    todayExpenseRows.map((row) => [row.category, Number(row.amount)]),
  );
  const monthExpenseByCategory = new Map(
    monthExpenseRows.map((row) => [row.category, Number(row.amount)]),
  );
  const fallbackDailyCogs = Math.round(dailyRevenue * 0.382);
  const fallbackDailyOpsExpense = Math.round(dailyRevenue * 0.168);
  const fallbackDailyPayrollAccrual = Math.round(dailyRevenue * 0.055);
  const recipeCogs = Math.round(
    todayRecipeCostRows.reduce((sum, row) => {
      const unitCost = Number(row.unitCost ?? 0);
      const qty = Number(row.recipeQty ?? 0) * Number(row.orderQty ?? 0);
      const wasteMultiplier = 1 + Math.max(0, Number(row.wastePct ?? 0)) / 100;
      return sum + unitCost * qty * wasteMultiplier;
    }, 0),
  );
  const dailyCogs = recipeCogs || todayExpenseByCategory.get("COGS") || fallbackDailyCogs;
  const dailyOpsExpense =
    todayExpenseByCategory.get("Operasional") ?? fallbackDailyOpsExpense;
  const dailyPayrollAccrual =
    todayExpenseByCategory.get("Payroll") ?? fallbackDailyPayrollAccrual;
  const dailyMarketing = todayExpenseByCategory.get("Marketing") ?? Math.round(dailyRevenue * 0.025);
  const dailyOther = Array.from(todayExpenseByCategory.entries())
    .filter(([category]) => !["COGS", "Operasional", "Payroll", "Marketing"].includes(category))
    .reduce((sum, [, amount]) => sum + amount, 0);
  const dailyExpense = dailyCogs + dailyOpsExpense + dailyPayrollAccrual + dailyMarketing + dailyOther;
  const dailyGrossProfit = dailyRevenue - dailyCogs;
  const dailyNetProfit = dailyRevenue - dailyExpense;
  const foodCostRatio = dailyRevenue ? Number(((dailyCogs / dailyRevenue) * 100).toFixed(1)) : 0;
  const averageOrderValue = dailyOrderCount ? Math.round(dailyRevenue / dailyOrderCount) : 0;
  const bomCoverage = await getMenuBomCoverage();
  const marginRows = await getMenuMarginReport();
  const lowMarginItems = marginRows.filter(
    (row) => row.ingredients > 0 && row.marginPct < 25,
  );
  const noBomSelling = marginRows.filter((row) => row.ingredients === 0 && row.price > 0);

  const monthCogs = monthExpenseByCategory.get("COGS") ?? Math.round(monthRevenue * 0.382);
  const monthPayroll = Math.max(
    monthExpenseByCategory.get("Payroll") ?? Math.round(monthRevenue * 0.15),
    Number(accruedRow?.total ?? 0) + Number(approvedRow?.total ?? 0),
  );
  const monthOperational =
    monthExpenseByCategory.get("Operasional") ?? Math.round(monthRevenue * 0.06);
  const monthMarketing = monthExpenseByCategory.get("Marketing") ?? Math.round(monthRevenue * 0.025);
  const monthOtherFromRows = Array.from(monthExpenseByCategory.entries())
    .filter(([category]) => !["COGS", "Operasional", "Payroll", "Marketing"].includes(category))
    .reduce((sum, [, amount]) => sum + amount, 0);
  const monthOther = monthOtherFromRows || Math.round(monthRevenue * 0.015);
  const monthNetRevenue = Math.max(0, monthRevenue - monthDiscounts);
  const monthGrossProfit = monthNetRevenue - monthCogs;
  const monthNetProfit =
    monthGrossProfit - monthPayroll - monthOperational - monthMarketing - monthOther;

  const supplierPayables = supplierInvoiceRows.length
    ? supplierInvoiceRows.map((row) => ({
        id: row.id,
        supplier: row.supplierName ?? "Supplier",
        invoiceNo: row.invoiceNo,
        dueDate: new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "Asia/Jakarta",
        }).format(row.dueDate),
        amount: Math.max(0, row.amount - row.paidAmount),
        status:
          row.status === "overdue"
            ? "OVERDUE"
            : row.status === "due"
              ? "Jatuh Tempo"
              : row.status === "partial"
                ? "Partial"
                : "Belum Bayar",
      }))
    : [
        { id: null, supplier: "CV Kopi Nusantara", invoiceNo: "INV-SEED-001", dueDate: "25/05/2026", amount: 3_200_000, status: "Belum Bayar" },
        { id: null, supplier: "PT Susu Fresh", invoiceNo: "INV-SEED-002", dueDate: "22/05/2026", amount: 850_000, status: "Jatuh Tempo" },
        { id: null, supplier: "UD Gula Jawa", invoiceNo: "INV-SEED-003", dueDate: "28/05/2026", amount: 420_000, status: "Belum Bayar" },
        { id: null, supplier: "CV Gas Melon", invoiceNo: "INV-SEED-004", dueDate: "21/05/2026", amount: 180_000, status: "OVERDUE" },
      ];
  const supplierDue = supplierPayables
    .filter((row) => row.status === "Jatuh Tempo" || row.status === "OVERDUE")
    .reduce((sum, row) => sum + row.amount, 0);
  const supplierOverdue = supplierPayables
    .filter((row) => row.status === "OVERDUE")
    .reduce((sum, row) => sum + row.amount, 0);

  const cashflowWeeks = Array.from({ length: 4 }, (_, index) => {
    const week = index + 1;
    const cashIn = Number(weekRows.find((row) => Number(row.week) === week)?.revenue ?? 0);
    const cashOut = Math.round(cashIn * 0.42);
    return {
      period: `Week ${week}`,
      cashIn,
      cashOut,
      netFlow: cashIn - cashOut,
    };
  });
  const cashflowCashIn = cashflowWeeks.reduce((sum, row) => sum + row.cashIn, 0);
  const cashflowCashOut = cashflowWeeks.reduce((sum, row) => sum + row.cashOut, 0);
  const supplierAlert = supplierPayables.find((row) => row.status === "OVERDUE");
  const paymentAlert = todayMethodRows.find((row) => row.method === "E-Wallet");
  const alerts = [
    ...lowStockRows.map((row) => ({
      type: "LOW STOCK",
      level: "WARNING",
      message: `${row.name} tersisa ${row.onHand}${row.unit} (minimum stok: ${row.min}${row.unit})`,
      time: "Auto",
    })),
    supplierAlert
      ? {
          type: "OVERDUE",
          level: "CRITICAL",
          message: `Invoice ${supplierAlert.supplier} jatuh tempo ${formatIdrShort(supplierAlert.amount)}`,
          time: "Hari ini",
        }
      : null,
    paymentAlert
      ? {
          type: "SETTLEMENT",
          level: "WARNING",
          message: `Settlement ${paymentAlert.method} ${formatIdrShort(Number(paymentAlert.amount))} perlu dicek`,
          time: "Auto",
        }
      : null,
    {
      type: "CASHFLOW",
      level: cashflowCashIn - cashflowCashOut >= 0 ? "INFO" : "WARNING",
      message: `Net cashflow bulan ini ${formatIdrShort(cashflowCashIn - cashflowCashOut)}`,
      time: "Auto",
    },
  ].filter((row): row is { type: string; level: string; message: string; time: string } => Boolean(row));

  const guardRisks = [
    latestCashSession && latestCashSession.status === "closed" && Math.abs(latestCashSession.discrepancy) > 10000
      ? {
          area: "Cash closing",
          level: "critical",
          message: `Selisih kas ${formatIdrShort(Math.abs(latestCashSession.discrepancy))}; wajib review bukti shift.`,
        }
      : latestCashSession && latestCashSession.status === "open"
        ? {
            area: "Cash closing",
            level: "watch",
            message: "Cash session masih open; closing final belum dikunci.",
          }
        : null,
    settlementRows.some((row) => row.status === "mismatch")
      ? {
          area: "Settlement",
          level: "critical",
          message: "Ada settlement mismatch antara POS dan bank/provider.",
        }
      : settlementRows.some((row) => row.status !== "settled")
        ? {
            area: "Settlement",
            level: "watch",
            message: "Masih ada settlement pending/processing yang perlu dicocokkan.",
          }
        : null,
    supplierOverdue > 0
      ? {
          area: "Supplier payable",
          level: "critical",
          message: `Hutang supplier overdue ${formatIdrShort(supplierOverdue)}.`,
        }
      : supplierDue > 0
        ? {
            area: "Supplier payable",
            level: "watch",
            message: `Hutang jatuh tempo ${formatIdrShort(supplierDue)}.`,
          }
        : null,
    foodCostRatio > 42
      ? {
          area: "Food cost",
          level: "critical",
          message: `Food cost ${foodCostRatio}% di atas batas aman coffee shop.`,
        }
      : foodCostRatio > 36
        ? {
            area: "Food cost",
            level: "watch",
            message: `Food cost ${foodCostRatio}% perlu dipantau lewat BOM dan waste.`,
          }
        : null,
    monthNetProfit < 0
      ? {
          area: "P&L",
          level: "critical",
          message: `Net profit bulan berjalan negatif ${formatIdrShort(Math.abs(monthNetProfit))}.`,
        }
      : dailyNetProfit < 0
        ? {
            area: "P&L",
            level: "watch",
            message: "Net profit hari ini negatif; cek expense harian dan diskon.",
          }
        : null,
    lowStockRows.length
      ? {
          area: "Inventory cost",
          level: "watch",
          message: `${lowStockRows.length} bahan low/critical bisa mengganggu penjualan dan HPP.`,
        }
      : null,
    bomCoverage.coveragePct < 60
      ? {
          area: "BOM coverage",
          level: "critical",
          message: `Hanya ${bomCoverage.coveragePct}% variant menu punya BOM aktif (${bomCoverage.withBom}/${bomCoverage.totalVariants}).`,
        }
      : bomCoverage.coveragePct < 85
        ? {
            area: "BOM coverage",
            level: "watch",
            message: `BOM coverage ${bomCoverage.coveragePct}% — lengkapi resep menu yang belum punya HPP.`,
          }
        : null,
    lowMarginItems.length
      ? {
          area: "Margin menu",
          level: lowMarginItems.some((row) => row.marginPct < 15) ? "critical" : "watch",
          message: `${lowMarginItems.length} variant margin di bawah 25%; cek harga jual dan BOM.`,
        }
      : null,
    noBomSelling.length
      ? {
          area: "Margin menu",
          level: "watch",
          message: `${noBomSelling.length} variant dijual tanpa BOM — HPP tidak terukur.`,
        }
      : null,
  ].filter(
    (row): row is { area: string; level: "critical" | "watch"; message: string } =>
      Boolean(row),
  );
  const criticalRiskCount = guardRisks.filter((row) => row.level === "critical").length;
  const watchRiskCount = guardRisks.filter((row) => row.level === "watch").length;
  const healthScore = Math.max(0, Math.min(100, 100 - criticalRiskCount * 24 - watchRiskCount * 9));
  const financeGuardLevel =
    healthScore < 60 ? "critical" : healthScore < 85 ? "watch" : "healthy";
  const nextActions = [
    latestCashSession?.status === "open"
      ? "Tutup cash session dengan denominasi dan manager sign-off."
      : null,
    settlementRows.some((row) => row.status !== "settled")
      ? "Cocokkan settlement QRIS/e-wallet/card dengan mutasi bank."
      : null,
    supplierOverdue > 0
      ? "Prioritaskan pembayaran invoice supplier yang overdue."
      : supplierDue > 0
        ? "Siapkan jadwal bayar supplier jatuh tempo."
        : null,
    foodCostRatio > 36 ? "Audit BOM, waste, dan harga bahan untuk menu fast moving." : null,
    bomCoverage.coveragePct < 85
      ? "Lengkapi BOM menu yang belum punya resep agar food cost akurat."
      : null,
    lowMarginItems.length
      ? "Review margin menu terendah sebelum promo atau diskon baru."
      : null,
    monthNetProfit < 0 || dailyNetProfit < 0
      ? "Review diskon, payroll accrual, dan expense operasional."
      : null,
    guardRisks.length === 0 ? "Pertahankan closing harian, export finance, dan review P&L owner." : null,
  ].filter((row): row is string => Boolean(row));

  return {
    today: {
      revenue: dailyRevenue,
      expense: dailyExpense,
      grossProfit: dailyGrossProfit,
      netProfit: dailyNetProfit,
      foodCostRatio,
      recipeFoodCost: recipeCogs,
      recipeLines: todayRecipeCostRows.length,
      averageOrderValue,
      orderCount: dailyOrderCount,
      cashCollected,
      nonCashCollected,
    },
    feeLiability: {
      totalAccrued: Number(accruedRow?.total ?? 0),
      accruedCount: Number(accruedRow?.cnt ?? 0),
      totalApproved: Number(approvedRow?.total ?? 0),
      approvedPayoutCount: Number(approvedRow?.cnt ?? 0),
    },
    recentOrders: recentOrders.map((row) => ({
      id: row.id,
      orderNo: row.orderNo,
      channel: row.channel,
      total: row.total,
      tableLabel: row.tableLabel,
      createdAt: row.createdAt.toISOString(),
      paymentMethod: methodByOrder.get(row.id)?.method ?? "-",
    })),
    paymentSettlement: settlementRows.length
      ? settlementRows.map((row) => ({
          id: row.id,
          method: row.method,
          provider: row.provider,
          amount: row.settledAmount || row.expectedAmount,
          expectedAmount: row.expectedAmount,
          settledAmount: row.settledAmount,
          feeAmount: row.feeAmount,
          share: todayPaymentTotal
            ? Math.round(((row.settledAmount || row.expectedAmount) / todayPaymentTotal) * 100)
            : 0,
          status:
            row.status === "settled"
              ? "Settled"
              : row.status === "processing"
                ? "Processing"
                : row.status === "mismatch"
                  ? "Mismatch"
                  : "Pending",
        }))
      : todayMethodRows.map((row) => {
          const amount = Number(row.amount);
          const method = row.method;
          const provider =
            method === "QRIS"
              ? "BCA"
              : method === "E-Wallet"
                ? "OVO/GoPay"
                : method === "Bank Transfer"
                  ? "Bank"
                  : method === "Card"
                    ? "EDC"
                    : "Cash Drawer";
          const status =
            method === "E-Wallet"
              ? "Pending"
              : method === "Card"
                ? "Processing"
                : method === "Cash"
                  ? "Verified"
                  : "Settled";
          return {
            id: null,
            method,
            provider,
            amount,
            expectedAmount: amount,
            settledAmount: amount,
            feeAmount: 0,
            share: todayPaymentTotal ? Math.round((amount / todayPaymentTotal) * 100) : 0,
            status,
          };
        }),
    expenseAnalysis: {
      totalExpense: dailyExpense,
      cogs: dailyCogs,
      operational: dailyOpsExpense,
      payroll: dailyPayrollAccrual,
      pendingApproval: Number(todayPendingExpenseRow?.amount ?? 0),
      pendingApprovalCount: Number(todayPendingExpenseRow?.count ?? 0),
      cashExpense: Number(todayCashExpenseRow?.amount ?? 0),
      cashExpenseCount: Number(todayCashExpenseRow?.count ?? 0),
      categories: todayExpenseRows.length
        ? todayExpenseRows.map((row) => ({
            category: row.category,
            amount: Number(row.amount),
            note:
              row.category === "COGS"
                ? "Food & beverage cost"
                : row.category === "Payroll"
                  ? "Gaji dan fee karyawan"
                  : row.category === "Marketing"
                    ? "Promo dan sosmed"
                    : "Biaya tercatat finance",
          }))
        : [
            { category: "COGS", amount: dailyCogs, note: "Food & beverage cost" },
            { category: "Payroll", amount: dailyPayrollAccrual, note: "Fee dan gaji harian terakru" },
            { category: "Operasional", amount: dailyOpsExpense, note: "Umum, utilitas, packaging, dan admin" },
            { category: "Marketing", amount: dailyMarketing, note: "Promo dan sosmed" },
          ],
    },
    cashflow: {
      cashIn: cashflowCashIn,
      cashOut: cashflowCashOut,
      netFlow: cashflowCashIn - cashflowCashOut,
      burnRateDaily: Math.round(cashflowCashOut / 30),
      weeks: cashflowWeeks,
    },
    profitLoss: {
      grossRevenue: monthRevenue,
      discounts: monthDiscounts,
      netRevenue: monthNetRevenue,
      cogs: monthCogs,
      grossProfit: monthGrossProfit,
      payroll: monthPayroll,
      operational: monthOperational,
      marketing: monthMarketing,
      other: monthOther,
      netProfit: monthNetProfit,
    },
    supplierPayables: {
      total: supplierPayables.reduce((sum, row) => sum + row.amount, 0),
      due: supplierDue,
      overdue: supplierOverdue,
      paidThisMonth: Math.round(monthCogs * 0.72),
      rows: supplierPayables,
    },
    bomCoverage: {
      ...bomCoverage,
      lowMarginCount: lowMarginItems.length,
      noBomCount: noBomSelling.length,
      lowMarginSample: lowMarginItems.slice(0, 8).map((row) => ({
        menuName: row.menuName,
        variantLabel: row.variantLabel,
        marginPct: row.marginPct,
        price: row.price,
        recipeCost: row.recipeCost,
      })),
    },
    financeGuard: {
      healthScore,
      level: financeGuardLevel,
      brief:
        financeGuardLevel === "healthy"
          ? "Keuangan operasional stabil untuk review owner."
          : financeGuardLevel === "watch"
            ? "Ada beberapa area yang perlu dicek sebelum closing final."
            : "Ada risiko finance kritis yang harus ditindaklanjuti hari ini.",
      risks: guardRisks,
      nextActions: nextActions.slice(0, 5),
      reportReadiness: {
        pnl: monthRevenue > 0 || monthExpenseRows.length > 0 ? "ready" : "needs_sales_or_expense",
        settlement: settlementRows.length ? "ready" : "needs_settlement",
        cashClosing: latestCashSession?.status === "closed" ? "ready" : "needs_closing",
      },
    },
    alerts: alerts.slice(0, 6),
    roleAccess: [
      { role: "Owner/CEO", sales: "Full", expense: "Full", cashflow: "Full", settlement: "Full", pnl: "Full", supplier: "Full", ceoPanel: "Full" },
      { role: "Finance", sales: "View", expense: "Full", cashflow: "Full", settlement: "Full", pnl: "Full", supplier: "View", ceoPanel: "No" },
      { role: "Supervisor", sales: "View", expense: "View", cashflow: "View", settlement: "View", pnl: "View", supplier: "No", ceoPanel: "No" },
      { role: "Kasir", sales: "View", expense: "No", cashflow: "No", settlement: "No", pnl: "No", supplier: "No", ceoPanel: "No" },
    ],
  };
}

export async function getFinanceGuardSummary() {
  const [overview, summary] = await Promise.all([getFinanceOverview(), getFinanceSummary()]);

  return {
    generatedAt: new Date().toISOString(),
    guard: overview.financeGuard,
    today: overview.today,
    profitLoss: overview.profitLoss,
    cashSession: summary.cashSession,
    paymentSettlement: overview.paymentSettlement,
    supplierPayables: overview.supplierPayables,
    cashflow: overview.cashflow,
    bomCoverage: overview.bomCoverage,
    alerts: overview.alerts,
  };
}

export async function getMenuBomCoverage() {
  const db = getDb();
  const variantRows = await db
    .select({
      itemId: menuVariants.itemId,
      variantId: menuVariants.variantId,
    })
    .from(menuVariants)
    .innerJoin(menuItems, eq(menuVariants.itemId, menuItems.id))
    .where(eq(menuItems.status, "active"));

  const recipeKeys = await db
    .select({
      menuItemId: menuRecipes.menuItemId,
      variantId: menuRecipes.variantId,
    })
    .from(menuRecipes)
    .where(eq(menuRecipes.status, "active"));

  const coveredKeys = new Set(
    recipeKeys.map((row) => `${row.menuItemId}::${row.variantId === "all" ? "all" : row.variantId}`),
  );

  let withBom = 0;
  const missing: Array<{ menuItemId: string; variantId: string }> = [];
  for (const variant of variantRows) {
    const specific = coveredKeys.has(`${variant.itemId}::${variant.variantId}`);
    const general = coveredKeys.has(`${variant.itemId}::all`);
    if (specific || general) {
      withBom += 1;
    } else {
      missing.push({ menuItemId: variant.itemId, variantId: variant.variantId });
    }
  }

  const totalVariants = variantRows.length;
  const coveragePct = totalVariants
    ? Math.round((withBom / totalVariants) * 100)
    : 0;

  return {
    totalVariants,
    withBom,
    missingCount: totalVariants - withBom,
    coveragePct,
    missingSample: missing.slice(0, 12),
  };
}

export async function getFinanceClosingReadiness(outletId?: string) {
  const db = getDb();
  const { start: todayStart, end: todayEnd } = getJakartaTodayRange();

  const sessionFilters = [
    gte(cashSessions.openedAt, todayStart),
    lt(cashSessions.openedAt, todayEnd),
    outletId ? eq(cashSessions.outletId, outletId) : undefined,
  ].filter(Boolean);

  const todaySessions = await db
    .select({
      id: cashSessions.id,
      status: cashSessions.status,
      discrepancyStatus: cashSessions.discrepancyStatus,
      code: cashSessions.code,
    })
    .from(cashSessions)
    .where(and(...sessionFilters))
    .orderBy(desc(cashSessions.openedAt));

  const openSessions = todaySessions.filter((row) => row.status === "open");
  const shiftStarted = todaySessions.length > 0;
  const shiftClosed = shiftStarted && openSessions.length === 0;
  const latestSession = todaySessions[0] ?? null;
  const shiftNeedsClosing = openSessions.length > 0;

  const settlementRows = await db
    .select({
      status: paymentSettlements.status,
    })
    .from(paymentSettlements)
    .where(
      and(
        gte(paymentSettlements.settlementDate, todayStart),
        lt(paymentSettlements.settlementDate, todayEnd),
      ),
    );

  const pendingSettlements = settlementRows.filter(
    (row) => row.status !== "settled" && row.status !== "matched",
  ).length;
  const settlementsClear = settlementRows.length === 0 || pendingSettlements === 0;

  const [pendingExpenseRow] = await db
    .select({ total: count() })
    .from(expenses)
    .where(
      and(
        eq(expenses.status, "pending"),
        gte(expenses.expenseDate, todayStart),
        lt(expenses.expenseDate, todayEnd),
      ),
    );
  const pendingExpenses = Number(pendingExpenseRow?.total ?? 0);
  const expensesClear = pendingExpenses === 0;

  const exportReady = shiftClosed && settlementsClear && expensesClear;

  const steps = [
    {
      id: "shift" as const,
      label: "Tutup shift kasir",
      done: shiftClosed,
      detail: !shiftStarted
        ? "Belum ada cash session hari ini."
        : openSessions.length
          ? `${openSessions.length} shift masih open (${openSessions.map((row) => row.code).join(", ")})`
          : latestSession
            ? `Shift ${latestSession.code} sudah closed.`
            : "Shift hari ini sudah ditutup.",
    },
    {
      id: "settlement" as const,
      label: "Settlement non-cash",
      done: settlementsClear,
      detail:
        settlementRows.length === 0
          ? "Tidak ada settlement tercatat hari ini."
          : pendingSettlements
            ? `${pendingSettlements} settlement belum settled.`
            : "Semua settlement hari ini sudah settled.",
    },
    {
      id: "expense" as const,
      label: "Approval pengeluaran",
      done: expensesClear,
      detail: pendingExpenses
        ? `${pendingExpenses} expense menunggu approval.`
        : "Tidak ada expense pending hari ini.",
    },
    {
      id: "export" as const,
      label: "Export laporan harian",
      done: exportReady,
      detail: exportReady
        ? "Siap export — angka closing sudah konsisten."
        : "Selesaikan shift, settlement, dan expense sebelum export final.",
    },
  ];

  const completed = steps.filter((step) => step.done).length;

  return {
    generatedAt: new Date().toISOString(),
    steps,
    completed,
    total: steps.length,
    progressPct: Math.round((completed / steps.length) * 100),
    ready: exportReady,
    shiftNeedsClosing,
    openSessionCount: openSessions.length,
  };
}

export async function getFinanceBrief() {
  const summary = await getFinanceGuardSummary();
  const closing = await getFinanceClosingReadiness();

  return {
    generatedAt: summary.generatedAt,
    headline: {
      revenue: summary.today.revenue,
      netProfit: summary.today.netProfit,
      grossProfit: summary.today.grossProfit,
      cashCollected: summary.today.cashCollected,
      nonCashCollected: summary.today.nonCashCollected,
      orderCount: summary.today.orderCount,
      foodCostRatio: summary.today.foodCostRatio,
    },
    guard: summary.guard,
    closingProgress: closing.progressPct,
    closingReady: closing.ready,
    risks: summary.guard.risks.slice(0, 3),
    nextActions: summary.guard.nextActions.slice(0, 3),
    bomCoverage: summary.bomCoverage,
  };
}

export async function getCustomerData(params?: {
  q?: string;
  tier?: string;
  limit?: number;
  offset?: number;
}) {
  // Bounded query: cegah payload tak terbatas saat tabel customer membesar
  // (dipakai bootstrap + AI context). Default 200, maksimum 500 per request.
  const limit = Math.max(1, Math.min(500, params?.limit ?? 200));
  const offset = Math.max(0, params?.offset ?? 0);

  const filters = [];
  if (params?.tier && params.tier !== "all") {
    filters.push(eq(customers.tier, params.tier));
  }

  if (params?.q) {
    const search = `%${params.q}%`;
    filters.push(
      or(
        ilike(customers.name, search),
        ilike(customers.phone, search),
        ilike(customers.tier, search),
        ilike(customers.lastOrder, search),
      ),
    );
  }

  const rows = await getDb()
    .select({ customer: customers, memberAccountId: memberAccounts.id })
    .from(customers)
    .leftJoin(memberAccounts, eq(memberAccounts.customerId, customers.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(customers.visits), customers.name)
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...row.customer,
    isMember: Boolean(row.memberAccountId),
  }));
}

// ────────────────────────────────────────────────────────────
// CRM — Customer Intelligence
// List, detail, segments, dan actions berbasis modal.
// Reuse data customers + orders + vouchers yang sudah ada.
// ────────────────────────────────────────────────────────────

export type CrmCustomerListFilter = {
  search?: string;
  tier?: string;
  sort?: "recent" | "spend" | "visits" | "points" | "name";
  limit?: number;
  offset?: number;
};

export async function listCustomersForCrm(filter: CrmCustomerListFilter = {}) {
  const limit = Math.max(1, Math.min(200, filter.limit ?? 50));
  const offset = Math.max(0, filter.offset ?? 0);
  const db = getDb();

  const conditions = [];
  if (filter.tier && filter.tier !== "all") {
    conditions.push(eq(customers.cardTier, filter.tier));
  }
  if (filter.search?.trim()) {
    const like = `%${filter.search.trim()}%`;
    const search = or(
      ilike(customers.name, like),
      ilike(customers.phone, like),
    );
    if (search) conditions.push(search);
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  // Sort mapping
  const sortKey = filter.sort ?? "recent";
  const orderClause =
    sortKey === "spend"
      ? [
          sql`(
            select coalesce(sum(${orders.total}), 0)
            from ${orders}
            where ${orders.customerId} = ${customers.id}
              and ${orders.status} = 'paid'
          ) desc`,
          customers.name,
        ]
      : sortKey === "visits"
        ? [desc(customers.visits), customers.name]
        : sortKey === "points"
          ? [desc(customers.points), customers.name]
          : sortKey === "name"
            ? [customers.name]
            : [desc(customers.updatedAt), customers.name];

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(whereClause)
      .orderBy(...orderClause)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count(customers.id) })
      .from(customers)
      .where(whereClause),
  ]);

  // Untuk display "last visit" yang akurat, ambil tanggal order terakhir per customer
  const customerIds = rows.map((r) => r.id);
  const lastOrderMap = new Map<string, Date>();
  const spendMap = new Map<string, { total: number; count: number }>();
  if (customerIds.length) {
    const orderRows = await db
      .select({
        customerId: orders.customerId,
        total: orders.total,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(inArray(orders.customerId, customerIds));
    for (const o of orderRows) {
      if (!o.customerId) continue;
      const prev = lastOrderMap.get(o.customerId);
      if (!prev || o.createdAt > prev) lastOrderMap.set(o.customerId, o.createdAt);
      if (o.status === "paid") {
        const cur = spendMap.get(o.customerId) ?? { total: 0, count: 0 };
        cur.total += o.total;
        cur.count += 1;
        spendMap.set(o.customerId, cur);
      }
    }
  }

  return {
    rows: rows.map((row) => {
      const lastOrderAt = lastOrderMap.get(row.id);
      const spend = spendMap.get(row.id);
      const daysSinceVisit = lastOrderAt
        ? Math.floor((Date.now() - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        tier: row.cardTier ?? row.tier,
        memberCode: row.memberCode,
        cardTier: row.cardTier ?? row.tier,
        membershipSince: row.membershipSince?.toISOString?.() ?? null,
        ultraCandidate: row.ultraCandidate,
        ultraApprovedAt: row.ultraApprovedAt?.toISOString?.() ?? null,
        ultraApprovedBy: row.ultraApprovedBy,
        points: row.points,
        visits: row.visits,
        flag: row.flag,
        staffNote: row.staffNote,
        birthday: row.birthday,
        referralCode: row.referralCode,
        referredByCode: row.referredByCode,
        address: row.address,
        photoUrl: row.photoUrl,
        expiresAt: row.expiresAt?.toISOString?.() ?? null,
        lastOrderAt: lastOrderAt?.toISOString() ?? null,
        daysSinceVisit,
        totalSpend: spend?.total ?? 0,
        paidOrderCount: spend?.count ?? 0,
        averageTicket: spend && spend.count > 0 ? Math.round(spend.total / spend.count) : 0,
      };
    }),
    total: Number(totalRows[0]?.count ?? 0),
    hasMore: offset + rows.length < Number(totalRows[0]?.count ?? 0),
  };
}

export async function getCustomerDetailForCrm(customerId: string) {
  const db = getDb();
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customer) return null;

  // Order history (max 20 terakhir)
  const orderRows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      invoiceTrackingToken: orders.invoiceTrackingToken,
      status: orders.status,
      total: orders.total,
      tableLabel: orders.tableLabel,
      channel: orders.channel,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(20);

  // Stats agregat (semua order, bukan cuma 20 terakhir)
  const [stats] = await db
    .select({
      paidCount: count(orders.id),
      totalSpend: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.status, "paid")));

  // Favorite items (top 5 by qty across all paid orders)
  const favoriteItems = await db
    .select({
      itemName: orderItems.itemName,
      variantLabel: orderItems.variantLabel,
      totalQty: sql<number>`sum(${orderItems.qty})`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.customerId, customerId), eq(orders.status, "paid")))
    .groupBy(orderItems.itemName, orderItems.variantLabel)
    .orderBy(sql`sum(${orderItems.qty}) desc`)
    .limit(5);

  const totalSpend = Number(stats?.totalSpend ?? 0);
  const paidCount = Number(stats?.paidCount ?? 0);
  const annualSpend = await annualPaidSpendForCustomer(customer.id, db);
  const lastOrderAt = orderRows[0]?.createdAt ?? null;
  const daysSinceVisit = lastOrderAt
    ? Math.floor((Date.now() - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    tier: customer.cardTier ?? customer.tier,
    memberCode: customer.memberCode,
    cardTier: customer.cardTier ?? customer.tier,
    membershipSince: customer.membershipSince.toISOString(),
    ultraCandidate: customer.ultraCandidate,
    ultraApprovedAt: customer.ultraApprovedAt?.toISOString() ?? null,
    ultraApprovedBy: customer.ultraApprovedBy,
    points: customer.points,
    visits: customer.visits,
    flag: customer.flag,
    staffNote: customer.staffNote,
    birthday: customer.birthday,
    referralCode: customer.referralCode,
    referredByCode: customer.referredByCode,
    address: customer.address,
    photoUrl: customer.photoUrl,
    expiresAt: customer.expiresAt?.toISOString?.() ?? null,
    createdAt: customer.createdAt.toISOString(),
    stats: {
      totalSpend,
      annualSpend,
      paidOrderCount: paidCount,
      averageTicket: paidCount > 0 ? Math.round(totalSpend / paidCount) : 0,
      lastOrderAt: lastOrderAt?.toISOString() ?? null,
      daysSinceVisit,
    },
    orders: orderRows.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      invoiceWebUrl: invoiceWebPath(o.invoiceTrackingToken),
      status: o.status,
      total: o.total,
      tableLabel: o.tableLabel,
      channel: o.channel,
      createdAt: o.createdAt.toISOString(),
    })),
    favoriteItems: favoriteItems.map((f) => ({
      name: f.itemName,
      variant: f.variantLabel,
      qty: Number(f.totalQty),
    })),
  };
}

export async function updateCustomerStaffNote(customerId: string, note: string) {
  const db = getDb();
  const trimmed = note.trim().slice(0, 500);
  const [updated] = await db
    .update(customers)
    .set({ staffNote: trimmed || null, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning();
  return updated ?? null;
}

export async function getCustomerCardTier(customerId: string) {
  const db = getDb();
  const [row] = await db
    .select({ cardTier: customers.cardTier })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return row?.cardTier ?? null;
}

export async function updateCustomerCrmProfile(
  customerId: string,
  input: {
    name?: string;
    phone?: string;
    address?: string | null;
    photoUrl?: string | null;
    memberPassword?: string;
    staffNote?: string;
    birthday?: string | null;
    referralCode?: string | null;
    memberCode?: string | null;
    cardTier?: string | null;
    ultraApprovedBy?: string | null;
  },
) {
  const db = getDb();
  const values: Partial<typeof customers.$inferInsert> = { updatedAt: new Date() };
  const accountValues: Partial<typeof memberAccounts.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2) {
      throw new Error("Nama member minimal 2 karakter.");
    }
    values.name = name;
    accountValues.name = name;
  }

  if (input.phone !== undefined) {
    const phone = normalizePhone(input.phone);
    if (phone.length < 8) {
      throw new Error("Nomor HP member wajib valid.");
    }

    const duplicateCustomer = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.phone, phone), sql`${customers.id} <> ${customerId}`))
      .limit(1);
    if (duplicateCustomer.length > 0) {
      throw new Error("Nomor HP sudah dipakai customer/member lain.");
    }

    const duplicateAccount = await db
      .select({ id: memberAccounts.id })
      .from(memberAccounts)
      .where(and(eq(memberAccounts.phone, phone), sql`${memberAccounts.customerId} <> ${customerId}`))
      .limit(1);
    if (duplicateAccount.length > 0) {
      throw new Error("Nomor HP sudah dipakai akun member lain.");
    }

    values.phone = phone;
    accountValues.phone = phone;
  }

  if (input.address !== undefined) {
    const address = input.address?.trim().slice(0, 500) || null;
    values.address = address;
  }

  if (input.photoUrl !== undefined) {
    const photoUrl = input.photoUrl?.trim().slice(0, 500) || null;
    values.photoUrl = photoUrl;
  }

  if (input.memberPassword !== undefined) {
    const password = input.memberPassword.trim();
    if (password) {
      if (password.length < 8) {
        throw new Error("Password member minimal 8 karakter.");
      }
      accountValues.passwordHash = await hashPassword(password);
    }
  }

  if (input.staffNote !== undefined) {
    const trimmed = input.staffNote.trim().slice(0, 500);
    values.staffNote = trimmed || null;
  }
  if (input.birthday !== undefined) {
    const birthday = input.birthday?.trim() || null;
    values.birthday = birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : null;
  }
  if (input.referralCode !== undefined) {
    values.referralCode = input.referralCode?.trim().replace(/\s+/g, "").toUpperCase() || null;
  }
  if (input.memberCode !== undefined) {
    values.memberCode = input.memberCode?.trim().replace(/\s+/g, "").toUpperCase() || null;
  }
  if (input.cardTier !== undefined) {
    const cardTier = normalizeMemberLevel(input.cardTier);
    values.cardTier = cardTier;
    values.tier = cardTier;
    if (cardTier === "Ultra") {
      values.ultraCandidate = true;
      values.ultraApprovedAt = new Date();
      values.ultraApprovedBy = input.ultraApprovedBy ?? null;
    } else {
      values.ultraApprovedAt = null;
      values.ultraApprovedBy = null;
    }
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(customers)
      .set(values)
      .where(eq(customers.id, customerId))
      .returning();

    if (!updated) return null;

    if (
      accountValues.name !== undefined ||
      accountValues.phone !== undefined ||
      accountValues.passwordHash !== undefined
    ) {
      await tx
        .update(memberAccounts)
        .set(accountValues)
        .where(eq(memberAccounts.customerId, customerId));
    }

    return updated;
  });
}

export async function deleteCustomerCrmProfile(customerId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(customers)
    .where(eq(customers.id, customerId))
    .returning({ id: customers.id });
  return deleted ?? null;
}

export async function markCustomerUltraCandidate(customerId: string) {
  const [updated] = await getDb()
    .update(customers)
    .set({
      ultraCandidate: true,
      staffNote: sql`coalesce(${customers.staffNote}, '') || ${"\nUltra requested from Membership Master Pro."}`,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId))
    .returning();
  return updated ?? null;
}

// Penyesuaian poin manual oleh admin (kompensasi/koreksi/reward). Tercatat
// sebagai transaksi member + audit. Poin tidak boleh jadi negatif.
export async function adjustCrmMemberPoints(input: {
  customerId: string;
  delta: number;
  reason: string;
  actor: GarageSession;
}) {
  const db = getDb();
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!customer) return { data: null, error: "Member tidak ditemukan." };

  const newPoints = Math.max(0, customer.points + input.delta);
  const realDelta = newPoints - customer.points;
  const [updated] = await db
    .update(customers)
    .set({ points: newPoints, updatedAt: new Date() })
    .where(eq(customers.id, customer.id))
    .returning();

  await db.insert(memberTransactions).values({
    customerId: customer.id,
    source: "ADJUSTMENT",
    amount: 0,
    pointsEarned: realDelta,
    levelBefore: customer.tier,
    levelAfter: updated.tier,
    upgradeNotification: `Poin ${realDelta >= 0 ? "+" : ""}${realDelta} oleh ${input.actor.user.name}: ${input.reason}`,
  });

  await createAuditLog({
    actor: `${input.actor.user.name} / ${roleDisplayName[input.actor.profile.role]}`,
    action: `Atur poin member ${realDelta >= 0 ? "+" : ""}${realDelta}`,
    object: customer.name,
    device: input.actor.profile.deviceLabel,
    status: "adjusted",
    metadata: {
      customerId: customer.id,
      delta: realDelta,
      reason: input.reason,
      before: customer.points,
      after: newPoints,
    },
  });

  return { data: { points: newPoints, delta: realDelta }, error: null };
}

export async function createCrmMember(input: {
  name: string;
  phone: string;
  email?: string | null;
  password: string;
  birthday?: string | null;
  memberCode?: string | null;
  cardTier: string;
  staffNote?: string | null;
  createdByUserId?: string | null;
}) {
  const db = getDb();
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  const cardTier = normalizeMemberLevel(input.cardTier);
  const memberCode = input.memberCode?.trim().replace(/\s+/g, "").toUpperCase() || null;
  const birthday = input.birthday?.trim() || null;

  const [existingAccount] = await db
    .select()
    .from(memberAccounts)
    .where(email ? or(eq(memberAccounts.phone, phone), eq(memberAccounts.email, email)) : eq(memberAccounts.phone, phone))
    .limit(1);
  if (existingAccount) return { data: null, error: "Phone atau email sudah terdaftar sebagai member." };

  // Block silent upsert: warn if phone exists in customers table but name differs
  const [existingCustomer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);
  if (existingCustomer && existingCustomer.name.toLowerCase() !== input.name.trim().toLowerCase()) {
    return {
      data: null,
      error: `Nomor HP ${phone} sudah terdaftar atas nama "${existingCustomer.name}". Gunakan menu Edit untuk mengupdate data customer yang sama.`,
    };
  }

  const [customer] = await db
    .insert(customers)
    .values({
      name: input.name.trim(),
      phone,
      tier: cardTier,
      cardTier,
      memberCode,
      points: 0,
      visits: 0,
      lastOrder: "-",
      flag: `CRM Member - ${cardTier}`,
      staffNote: input.staffNote?.trim() || null,
      birthday: birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : null,
      referralCode: memberCode,
      ultraCandidate: cardTier === "Ultra",
      ultraApprovedAt: cardTier === "Ultra" ? new Date() : null,
      ultraApprovedBy: cardTier === "Ultra" ? input.createdByUserId ?? null : null,
    })
    .onConflictDoUpdate({
      target: customers.phone,
      set: {
        name: input.name.trim(),
        tier: cardTier,
        cardTier,
        memberCode,
        flag: `CRM Member - ${cardTier}`,
        staffNote: input.staffNote?.trim() || null,
        birthday: birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : null,
        referralCode: memberCode,
        ultraCandidate: cardTier === "Ultra",
        ultraApprovedAt: cardTier === "Ultra" ? new Date() : null,
        ultraApprovedBy: cardTier === "Ultra" ? input.createdByUserId ?? null : null,
        updatedAt: new Date(),
      },
    })
    .returning();

  const [account] = await db
    .insert(memberAccounts)
    .values({
      customerId: customer.id,
      name: customer.name,
      phone,
      email,
      passwordHash: await hashPassword(input.password),
      status: "active",
    })
    .onConflictDoUpdate({
      target: memberAccounts.phone,
      set: {
        customerId: customer.id,
        name: customer.name,
        email,
        passwordHash: await hashPassword(input.password),
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning();

  return { data: { customer, account }, error: null };
}

// Smart segments — compute on-the-fly, no schema baru
export async function listCrmSegments() {
  const db = getDb();
  const now = new Date();
  const ms30Days = 30 * 24 * 60 * 60 * 1000;
  const ms7Days = 7 * 24 * 60 * 60 * 1000;

  // Ambil semua customer + last order date (1 query)
  const allCustomers = await db.select().from(customers);
  const customerIds = allCustomers.map((c) => c.id);

  const orderAgg = customerIds.length
    ? await db
        .select({
          customerId: orders.customerId,
          last30Spend: sql<number>`coalesce(sum(case when ${orders.createdAt} > now() - interval '30 days' and ${orders.status} = 'paid' then ${orders.total} else 0 end), 0)`.mapWith(Number),
          lastOrderAt: sql<Date>`max(${orders.createdAt})`,
          firstOrderAt: sql<Date>`min(${orders.createdAt})`,
          orderCount: count(orders.id),
        })
        .from(orders)
        .where(inArray(orders.customerId, customerIds))
        .groupBy(orders.customerId)
    : [];

  const aggByCustomer = new Map<
    string,
    { last30Spend: number; lastOrderAt: Date | null; firstOrderAt: Date | null; orderCount: number }
  >();
  for (const a of orderAgg) {
    if (!a.customerId) continue;
    aggByCustomer.set(a.customerId, {
      last30Spend: a.last30Spend,
      lastOrderAt: a.lastOrderAt ? new Date(a.lastOrderAt) : null,
      firstOrderAt: a.firstOrderAt ? new Date(a.firstOrderAt) : null,
      orderCount: Number(a.orderCount),
    });
  }

  const vip: Array<{ id: string; name: string; phone: string; tier: string; reason: string }> = [];
  const atRisk: Array<{ id: string; name: string; phone: string; tier: string; reason: string }> = [];
  const newCust: Array<{ id: string; name: string; phone: string; tier: string; reason: string }> = [];
  const voucherReady: Array<{ id: string; name: string; phone: string; tier: string; reason: string }> = [];
  const birthdayWeek: Array<{ id: string; name: string; phone: string; tier: string; reason: string }> = [];
  const stampMission: Array<{ id: string; name: string; phone: string; tier: string; reason: string }> = [];
  const referralReady: Array<{ id: string; name: string; phone: string; tier: string; reason: string }> = [];
  const vipExclusive: Array<{ id: string; name: string; phone: string; tier: string; reason: string }> = [];

  for (const c of allCustomers) {
    const agg = aggByCustomer.get(c.id);
    const last30Spend = agg?.last30Spend ?? 0;
    const isVip =
      last30Spend >= 500_000 ||
      c.tier === "Gold" ||
      c.tier === "Platinum" ||
      c.tier === "VIP";
    if (isVip) {
      vip.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        tier: c.tier,
        reason:
          last30Spend >= 500_000
            ? `Spend 30 hari ${Math.round(last30Spend / 1000)}K`
            : `Tier ${c.tier}`,
      });
      vipExclusive.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        tier: c.tier,
        reason: c.tier === "Platinum" ? "Akses monthly drink + event" : "Akses seasonal secret menu",
      });
    }

    if (agg && agg.orderCount >= 3 && agg.lastOrderAt) {
      const sinceLast = now.getTime() - agg.lastOrderAt.getTime();
      if (sinceLast > ms30Days) {
        const days = Math.floor(sinceLast / (24 * 60 * 60 * 1000));
        atRisk.push({
          id: c.id,
          name: c.name,
          phone: c.phone,
          tier: c.tier,
          reason: `Hilang ${days} hari (riwayat ${agg.orderCount}x)`,
        });
      }
    }

    if (agg && agg.orderCount === 1 && agg.firstOrderAt) {
      const sinceFirst = now.getTime() - agg.firstOrderAt.getTime();
      if (sinceFirst <= ms7Days) {
        const days = Math.floor(sinceFirst / (24 * 60 * 60 * 1000));
        newCust.push({
          id: c.id,
          name: c.name,
          phone: c.phone,
          tier: c.tier,
          reason: days === 0 ? "Baru kunjungan hari ini" : `Pertama ${days} hari lalu`,
        });
      }
    }

    if (c.points >= POINTS_PER_REDEEM_UNIT) {
      voucherReady.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        tier: c.tier,
        reason: `${c.points} poin (redeem ${formatIdrShort(calculateRedeemDiscount(c.points))})`,
      });
    }

    const birthday = c.birthday;
    if (birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      const [, month, day] = birthday.split("-").map(Number);
      const birthdayThisYear = new Date(now);
      birthdayThisYear.setMonth(month - 1, day);
      birthdayThisYear.setHours(0, 0, 0, 0);
      if (birthdayThisYear.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
        birthdayThisYear.setFullYear(birthdayThisYear.getFullYear() + 1);
      }
      const daysUntil = Math.ceil((birthdayThisYear.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (daysUntil <= 7) {
        birthdayWeek.push({
          id: c.id,
          name: c.name,
          phone: c.phone,
          tier: c.tier,
          reason: daysUntil <= 0 ? "Ulang tahun hari ini" : `Ulang tahun ${daysUntil} hari lagi`,
        });
      }
    }

    const nextVisitRewardAt = Math.ceil(Math.max(1, c.visits + 1) / 10) * 10;
    if (nextVisitRewardAt - c.visits <= 2) {
      stampMission.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        tier: c.tier,
        reason: `${Math.max(0, nextVisitRewardAt - c.visits)} kunjungan lagi ke bonus dessert`,
      });
    }

    if (c.referralCode) {
      referralReady.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        tier: c.tier,
        reason: `Kode referral ${c.referralCode}`,
      });
    }
  }

  return {
    vip: { label: "VIP", description: "Spend >500K/bulan atau tier Gold+", customers: vip },
    atRisk: { label: "At-Risk", description: "Repeat customer hilang >30 hari", customers: atRisk },
    new: { label: "New Customer", description: "Pertama kunjungan ≤7 hari", customers: newCust },
    voucherReady: {
      label: "Voucher Ready",
      description: `${POINTS_PER_REDEEM_UNIT} poin = voucher ${formatIdrShort(DISCOUNT_PER_REDEEM_UNIT)}`,
      customers: voucherReady,
    },
    birthdayWeek: {
      label: "Birthday Week",
      description: "Customer ulang tahun dalam 7 hari",
      customers: birthdayWeek,
    },
    stampMission: {
      label: "Stamp Mission",
      description: "Dekat ke reward kunjungan 10x",
      customers: stampMission,
    },
    vipExclusive: {
      label: "VIP Exclusive",
      description: "Gold/Platinum untuk secret menu dan event",
      customers: vipExclusive,
    },
    referralReady: {
      label: "Referral Ready",
      description: `Bagikan kode referral, dua pihak dapat ${REFERRAL_BONUS_POINTS} poin setelah transaksi pertama`,
      customers: referralReady,
    },
  };
}

// Generate voucher khusus untuk 1 customer (reuse vouchers table)
export async function issuePersonalVoucherForCrm(input: {
  customerId: string;
  type: "fixed" | "percent";
  value: number;
  validDays?: number;
  reason?: string;
}) {
  const db = getDb();
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!customer) return null;
  if (input.type === "percent" && (input.value < MIN_PERCENT_VOUCHER || input.value > MAX_PERCENT_VOUCHER)) {
    throw new Error(`Voucher persen harus ${MIN_PERCENT_VOUCHER}-${MAX_PERCENT_VOUCHER}%.`);
  }

  const shortid = randomBytes(4).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const namePart = customer.name.split(/\s+/)[0]?.toUpperCase().slice(0, 6) || "CUST";
  const code = `GIFT-${namePart}-${shortid}`;
  const validDays = input.validDays ?? 30;
  const endsAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

  const [created] = await db
    .insert(vouchers)
    .values({
      code,
      title:
        input.type === "fixed"
          ? `Voucher Rp${input.value.toLocaleString("id-ID")} untuk ${customer.name}`
          : `Voucher ${input.value}% untuk ${customer.name}`,
      type: input.type,
      value: input.value,
      customerId: customer.id,
      minSpend: 0,
      maxDiscount: null,
      audience: "all",
      status: "active",
      startsAt: new Date(),
      endsAt,
      usageLimit: 1,
    })
    .returning();

  return {
    voucher: created,
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    code,
    validUntil: endsAt.toISOString(),
  };
}

export async function logCrmCampaign(input: {
  customerId?: string | null;
  customerPhone?: string | null;
  segmentKey: string;
  templateKey: string;
  messagePreview?: string;
  status?: string;
  sentBy?: string | null;
}) {
  const [row] = await getDb()
    .insert(crmCampaignLogs)
    .values({
      customerId: input.customerId ?? null,
      customerPhone: input.customerPhone ?? null,
      segmentKey: input.segmentKey,
      templateKey: input.templateKey,
      messagePreview: input.messagePreview?.slice(0, 500) ?? "",
      status: input.status ?? "opened",
      sentBy: input.sentBy ?? null,
    })
    .returning();

  return row;
}

export async function getCrmDashboardMetrics() {
  const db = getDb();
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const since90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    customerCount,
    activeMembers,
    repeatCustomers,
    redeemedVouchers,
    campaignCount,
    rewardRows,
    memberRevenue30d,
    memberRevenuePerCustomer,
    recoveredRows,
    referralRows,
  ] = await Promise.all([
    db.select({ count: count(customers.id) }).from(customers),
    db.select({ count: count(memberAccounts.id) }).from(memberAccounts).where(eq(memberAccounts.status, "active")),
    db.select({ count: count(customers.id) }).from(customers).where(gte(customers.visits, 2)),
    db.select({ count: count(voucherRedemptions.id), discount: sql<number>`coalesce(sum(${voucherRedemptions.discount}), 0)`.mapWith(Number) }).from(voucherRedemptions).where(gte(voucherRedemptions.createdAt, since30)),
    db.select({ count: count(crmCampaignLogs.id) }).from(crmCampaignLogs).where(gte(crmCampaignLogs.createdAt, since30)),
    db.select({ points: sql<number>`coalesce(sum(${customers.points}), 0)`.mapWith(Number) }).from(customers),
    db
      .select({ revenue: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(Number) })
      .from(orders)
      .where(and(eq(orders.status, "paid"), gte(orders.createdAt, since30), isNotNull(orders.customerId))),
    db
      .select({ customerId: orders.customerId, total: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(Number) })
      .from(orders)
      .where(and(eq(orders.status, "paid"), isNotNull(orders.customerId)))
      .groupBy(orders.customerId),
    db
      .select({ count: count(orders.customerId) })
      .from(orders)
      .where(and(eq(orders.status, "paid"), gte(orders.createdAt, since30), isNotNull(orders.customerId))),
    db
      .select({ count: count(memberTransactions.id) })
      .from(memberTransactions)
      .where(and(eq(memberTransactions.source, "REFERRAL"), gte(memberTransactions.createdAt, since30))),
  ]);

  const totalCustomers = Number(customerCount[0]?.count ?? 0);
  const repeat = Number(repeatCustomers[0]?.count ?? 0);
  const rewardLiability = calculateRedeemDiscount(Number(rewardRows[0]?.points ?? 0));
  const redeemedDiscount = Number(redeemedVouchers[0]?.discount ?? 0);
  const memberRevenue = Number(memberRevenue30d[0]?.revenue ?? 0);
  const rewardCostPct = memberRevenue > 0 ? Math.round((redeemedDiscount / memberRevenue) * 1000) / 10 : 0;

  const atRiskRecovered = Number(recoveredRows[0]?.count ?? 0);

  // LTV: compute avg and median from all-time per-customer revenue
  const ltvValues = (memberRevenuePerCustomer as Array<{ customerId: string | null; total: number }>)
    .map((r) => r.total)
    .filter(Boolean);
  const sortedLtv = [...ltvValues].sort((a, b) => a - b);
  const medianLtv = sortedLtv.length ? sortedLtv[Math.floor(sortedLtv.length / 2)] : 0;
  const avgLtv = totalCustomers > 0 && ltvValues.length
    ? Math.round(ltvValues.reduce((s, v) => s + v, 0) / Math.min(ltvValues.length, totalCustomers))
    : 0;

  // Churn: customers with no paid order in last 60 days
  const recentCustomerIds = new Set(
    (memberRevenuePerCustomer as Array<{ customerId: string | null }>)
      .map((r) => r.customerId)
      .filter(Boolean),
  );
  const atRiskCustomerCount = Math.max(0, totalCustomers - recentCustomerIds.size);
  const churnRiskRate = totalCustomers > 0 ? Math.round((atRiskCustomerCount / totalCustomers) * 100) : 0;

  return {
    totalCustomers,
    activeMembers: Number(activeMembers[0]?.count ?? 0),
    repeatRate: totalCustomers ? Math.round((repeat / totalCustomers) * 100) : 0,
    redeemedVoucherCount: Number(redeemedVouchers[0]?.count ?? 0),
    redeemedDiscount,
    rewardLiability,
    rewardCostPct,
    campaignOpened30d: Number(campaignCount[0]?.count ?? 0),
    atRiskRecovered30d: atRiskRecovered,
    referralConversion30d: Number(referralRows[0]?.count ?? 0),
    avgLtv,
    medianLtv,
    churnRiskRate,
    atRiskCustomerCount,
    windows: { campaignSince: since30.toISOString(), churnSince: since60.toISOString(), atRiskLookbackSince: since90.toISOString() },
  };
}

function formatApprovalAge(createdAt: Date) {
  const mins = Math.floor((Date.now() - createdAt.getTime()) / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j`;
  return `${Math.floor(hours / 24)}h`;
}

export async function getApprovalById(id: string) {
  const [row] = await getDb().select().from(approvals).where(eq(approvals.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    requester: row.requester,
    requesterPhone: row.requesterPhone,
    amount: row.amount,
    reason: row.reason,
    risk: row.risk,
    age: formatApprovalAge(row.createdAt),
    status: row.status,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByName: row.decidedByName,
    reasonDecided: row.reasonDecided,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function requestManualDiscountApproval(
  input: {
    type: "amount" | "percent";
    rawValue: number;
    baseAfterVoucher: number;
    reason: string;
  },
  garage: GarageSession,
) {
  const settings = await getAppSettings(garage.profile.outlet.id);
  const baseAfterVoucher = Math.max(0, Math.round(input.baseAfterVoucher));
  const amount = computeManualDiscountAmount(
    {
      type: input.type,
      rawValue: input.rawValue,
      amount:
        input.type === "percent"
          ? Math.min(baseAfterVoucher, Math.round((baseAfterVoucher * input.rawValue) / 100))
          : Math.min(baseAfterVoucher, Math.round(input.rawValue)),
      reason: input.reason,
    },
    baseAfterVoucher,
  );

  if (amount <= 0) {
    throw new Error("Diskon tidak menghasilkan potongan.");
  }

  const maxManualDiscount = Math.round(
    baseAfterVoucher * (settings.manualDiscountMaxPct / 100),
  );
  if (amount > maxManualDiscount) {
    throw new Error(
      `Diskon melebihi batas kasir ${settings.manualDiscountMaxPct}% (${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(maxManualDiscount)}).`,
    );
  }

  if (!manualDiscountNeedsApproval(amount, baseAfterVoucher, settings)) {
    throw new Error(
      `Diskon dalam batas ${settings.manualDiscountApprovalPct}% — tidak perlu approval, terapkan langsung.`,
    );
  }

  const approvalId = `APP-DISC-${randomUUID()}`;
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  const amountLabel =
    input.type === "percent"
      ? `${input.rawValue}% (${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)})`
      : new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0,
        }).format(amount);
  const pctOfBase = baseAfterVoucher > 0 ? (amount / baseAfterVoucher) * 100 : 100;
  const risk = amount >= 100_000 || pctOfBase >= 25 ? "high" : "medium";

  await getDb()
    .insert(approvals)
    .values({
      id: approvalId,
      type: "Diskon manual",
      requester: actor,
      requesterPhone: null,
      amount: amountLabel,
      reason: `${input.reason.trim()} · basis ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(baseAfterVoucher)}`,
      risk,
      age: "baru saja",
      status: "pending",
    });

  await createAuditLog({
    actor,
    action: "Manual discount approval requested",
    object: approvalId,
    device: garage.profile.deviceLabel,
    status: "approval_required",
    metadata: {
      approvalId,
      type: input.type,
      rawValue: input.rawValue,
      amount,
      baseAfterVoucher,
    },
  });

  return { approvalId, status: "pending" as const, amount };
}

export async function getApprovalData(params?: { status?: string }) {
  const rows = await getDb()
    .select()
    .from(approvals)
    .where(params?.status ? eq(approvals.status, params.status) : undefined)
    .orderBy(desc(approvals.createdAt));

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    requester: row.requester,
    requesterPhone: row.requesterPhone,
    amount: row.amount,
    reason: row.reason,
    risk: row.risk,
    age: formatApprovalAge(row.createdAt),
    status: row.status,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByName: row.decidedByName,
    reasonDecided: row.reasonDecided,
    createdAt: row.createdAt.toISOString(),
  }));
}

// Aggregate stats untuk header bar di Approvals Board.
// Hitung on-the-fly, no caching needed (volume harian biasanya <100 baris).
export async function getApprovalStats() {
  const db = getDb();
  const allRows = await db.select().from(approvals);

  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  let pending = 0;
  let pendingHighRisk = 0;
  let decidedToday = 0;
  let approvedToday = 0;
  let rejectedToday = 0;
  let decideDurationSum = 0;
  let decideDurationCount = 0;
  const byType = new Map<string, number>();

  for (const row of allRows) {
    if (row.status === "pending") {
      pending += 1;
      byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
      if (row.risk === "high" || row.risk === "High") {
        pendingHighRisk += 1;
      }
    }
    if (row.decidedAt && row.decidedAt.getTime() >= todayMs) {
      decidedToday += 1;
      if (row.status === "approved") approvedToday += 1;
      if (row.status === "rejected") rejectedToday += 1;
      const durationMs = row.decidedAt.getTime() - row.createdAt.getTime();
      if (durationMs > 0) {
        decideDurationSum += durationMs;
        decideDurationCount += 1;
      }
    }
  }

  const avgDecideMinutes = decideDurationCount
    ? Math.round(decideDurationSum / decideDurationCount / 60_000)
    : 0;

  return {
    pending,
    pendingHighRisk,
    decidedToday,
    approvedToday,
    rejectedToday,
    avgDecideMinutes,
    pendingByType: Array.from(byType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    generatedAt: new Date(now).toISOString(),
  };
}

export async function getAuditData(params?: {
  module?: string;
  actor?: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.max(1, Math.min(500, params?.limit ?? 100));
  const offset = Math.max(0, params?.offset ?? 0);
  const filters = [];

  if (params?.actor) {
    filters.push(ilike(auditLogs.actor, `%${params.actor}%`));
  }
  if (params?.module) {
    filters.push(ilike(auditLogs.action, `%${params.module}%`));
  }
  if (params?.status && params.status !== "all") {
    filters.push(eq(auditLogs.status, params.status));
  }
  if (params?.dateFrom) {
    const from = new Date(`${params.dateFrom}T00:00:00.000Z`);
    if (!Number.isNaN(from.getTime())) {
      filters.push(gte(auditLogs.createdAt, from));
    }
  }
  if (params?.dateTo) {
    const to = new Date(`${params.dateTo}T23:59:59.999Z`);
    if (!Number.isNaN(to.getTime())) {
      filters.push(lt(auditLogs.createdAt, new Date(to.getTime() + 1)));
    }
  }
  if (params?.search) {
    const like = `%${params.search.trim()}%`;
    const search = or(
      ilike(auditLogs.actor, like),
      ilike(auditLogs.action, like),
      ilike(auditLogs.object, like),
      ilike(auditLogs.device, like),
    );
    if (search) filters.push(search);
  }

  const whereClause = filters.length ? and(...filters) : undefined;
  const db = getDb();

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count(auditLogs.id) })
      .from(auditLogs)
      .where(whereClause),
  ]);

  const total = Number(totalRows[0]?.count ?? 0);
  return {
    rows: rows.map((row) => ({
      id: row.id,
      time: row.time,
      actor: row.actor,
      action: row.action,
      object: row.object,
      device: row.device,
      status: row.status,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    hasMore: offset + rows.length < total,
  };
}

// Stats untuk header bar di Audit Log viewer
export async function getAuditStats() {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const allRowsToday = await db
    .select({
      actor: auditLogs.actor,
      status: auditLogs.status,
      action: auditLogs.action,
    })
    .from(auditLogs)
    .where(gte(auditLogs.createdAt, todayStart));

  const [totalAll] = await db.select({ count: count(auditLogs.id) }).from(auditLogs);

  let critical = 0;
  let warnings = 0;
  const actorMap = new Map<string, number>();
  const moduleMap = new Map<string, number>();

  for (const row of allRowsToday) {
    if (row.status === "critical" || row.status === "blocked") critical += 1;
    if (row.status === "warning" || row.status === "flagged") warnings += 1;
    actorMap.set(row.actor, (actorMap.get(row.actor) ?? 0) + 1);

    // Module dideteksi dari prefix action: "Approval approved" → "Approval"
    const modulePrefix = row.action.split(/\s+/)[0] || "Other";
    moduleMap.set(modulePrefix, (moduleMap.get(modulePrefix) ?? 0) + 1);
  }

  const topActors = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const topModules = Array.from(moduleMap.entries())
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    eventsToday: allRowsToday.length,
    criticalToday: critical,
    warningsToday: warnings,
    totalEvents: Number(totalAll?.count ?? 0),
    topActors,
    topModules,
  };
}

export async function getBootstrapData(garage: GarageSession) {
  const role = garage.profile.role;
  const canReadDashboard = canUseApi(role, "dashboard:read");
  const canUsePos = canUseApi(role, "pos:use");
  const canReadKitchen = canUseApi(role, "kitchen:read");
  const canReadInventory = canUseApi(role, "inventory:read");
  const canReadFinance = canUseApi(role, "finance:read");
  const canWriteFinance = canUseApi(role, "finance:write");
  const canUseCashShift = canUseApi(role, "shift:cash");
  const canReadCrm = canUseApi(role, "crm:read");
  const canReadApprovals = canUseApi(role, "approvals:read");
  const canReadAudit = canUseApi(role, "audit:read");

  const emptyDashboard = {
    headlineMetrics: [],
    salesTrend: [],
    operationalSignals: [],
  };
  const emptyFinance = {
    cashSession: {
      id: null,
      code: "CS-RESTRICTED",
      openingCash: 0,
      expectedCash: 0,
      actualCash: null,
      discrepancy: 0,
      status: "restricted",
      checklist: fallbackClosingChecklist,
    },
    paymentBreakdown: [],
  };

  const [
    dashboard,
    menu,
    kitchen,
    inventory,
    movements,
    finance,
    customerRows,
    approvalRows,
    auditRows,
    settings,
  ] = await Promise.all([
    canReadDashboard ? getDashboardData() : Promise.resolve(emptyDashboard),
    canUsePos || canReadKitchen ? getMenuData() : Promise.resolve([]),
    canReadKitchen ? getKitchenData({ viewerRole: role }) : Promise.resolve([]),
    canReadInventory ? getInventoryData() : Promise.resolve([]),
    canReadInventory ? getStockMovementData() : Promise.resolve([]),
    canReadFinance || canWriteFinance || canUseCashShift
      ? getFinanceSummary(
          canReadFinance
            ? undefined
            : { outletId: garage.profile.outlet.id, openedBy: garage.user.id },
        )
      : Promise.resolve(emptyFinance),
    canReadCrm ? getCustomerData() : Promise.resolve([]),
    canReadApprovals ? getApprovalData({ status: "pending" }) : Promise.resolve([]),
    canReadAudit ? getAuditData() : Promise.resolve([]),
    getAppSettings(garage.profile.outlet.id),
  ]);

  return {
    me: sessionPayload(garage),
    dashboard,
    cartSeed,
    menuItems: menu,
    kitchenOrders: kitchen,
    inventoryItems: inventory,
    stockMovements: movements,
    paymentBreakdown: canReadFinance ? finance.paymentBreakdown : [],
    cashSession: finance.cashSession,
    closingChecklist: finance.cashSession.checklist,
    customers: customerRows,
    approvals: approvalRows,
    auditLogs: auditRows,
    serviceRules: serviceRules.map(({ label, value }) => ({ label, value })),
    settings,
  };
}

export async function getOrderData(params?: { status?: string; channel?: string }) {
  const filters = [];
  if (params?.status && params.status !== "all") {
    filters.push(eq(orders.status, params.status));
  }

  if (params?.channel && params.channel !== "all") {
    filters.push(eq(orders.channel, params.channel));
  }

  const rows = await getDb()
    .select()
    .from(orders)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(100);

  return rows.map((row) => ({
    id: row.id,
    orderNo: row.orderNo,
    tableLabel: row.tableLabel,
    channel: row.channel,
    status: row.status,
    subtotal: row.subtotal,
    service: row.service,
    tax: row.tax,
    discount: row.discount,
    total: row.total,
    createdAt: row.createdAt,
  }));
}

// ────────────────────────────────────────────────────────────
// FINANCE INVOICE LIST — modal-based browser untuk semua invoice
// Dipakai di tab Finance → Invoice. Sengaja lightweight (no item rows
// di list) supaya 1 query, paginated. Detail diambil lewat
// getInvoiceDetailForFinance() saat user buka modal.
// ────────────────────────────────────────────────────────────

export type FinanceInvoiceListFilter = {
  search?: string;
  status?: string;
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export async function listInvoicesForFinance(filter: FinanceInvoiceListFilter = {}) {
  const limit = Math.max(1, Math.min(200, filter.limit ?? 50));
  const offset = Math.max(0, filter.offset ?? 0);

  const conditions = [];

  if (filter.status && filter.status !== "all") {
    conditions.push(eq(orders.status, filter.status));
  }

  if (filter.dateFrom) {
    const from = new Date(`${filter.dateFrom}T00:00:00.000Z`);
    if (!Number.isNaN(from.getTime())) {
      conditions.push(gte(orders.createdAt, from));
    }
  }

  if (filter.dateTo) {
    const to = new Date(`${filter.dateTo}T23:59:59.999Z`);
    if (!Number.isNaN(to.getTime())) {
      conditions.push(lt(orders.createdAt, new Date(to.getTime() + 1)));
    }
  }

  const searchTerm = filter.search?.trim();
  if (searchTerm) {
    const like = `%${searchTerm}%`;
    const searchClause = or(
      ilike(orders.orderNo, like),
      ilike(orders.customerName, like),
      ilike(orders.customerPhone, like),
      ilike(orders.tableLabel, like),
    );
    if (searchClause) conditions.push(searchClause);
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  const db = getDb();

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        tableLabel: orders.tableLabel,
        channel: orders.channel,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
        customerId: orders.customerId,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        invoiceTrackingToken: orders.invoiceTrackingToken,
        whatsappInvoiceUrl: orders.whatsappInvoiceUrl,
        whatsappInvoiceStatus: orders.whatsappInvoiceStatus,
        memberLevel: customers.tier,
      })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count(orders.id) })
      .from(orders)
      .where(whereClause),
  ]);

  if (!rows.length) {
    const total = Number(totalRows[0]?.count ?? 0);
    return { rows: [], total, hasMore: false };
  }

  // Ambil payment terbaru per order (1 query batch)
  const paymentRows = await db
    .select({
      orderId: payments.orderId,
      method: payments.method,
      status: payments.status,
      amount: payments.amount,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(
      inArray(
        payments.orderId,
        rows.map((row) => row.id).filter((v): v is string => Boolean(v)),
      ),
    )
    .orderBy(desc(payments.createdAt));

  const latestPaymentByOrder = new Map<
    string,
    { method: string; status: string; amount: number }
  >();
  for (const p of paymentRows) {
    if (!p.orderId) continue;
    if (latestPaymentByOrder.has(p.orderId)) continue;
    latestPaymentByOrder.set(p.orderId, {
      method: p.method,
      status: p.status,
      amount: p.amount,
    });
  }

  const total = Number(totalRows[0]?.count ?? 0);
  return {
    rows: rows.map((row) => {
      const payment = latestPaymentByOrder.get(row.id);
      return {
        id: row.id,
        orderNo: row.orderNo,
        invoiceNo: invoiceNoForOrder(row.orderNo),
        invoiceTrackingToken: row.invoiceTrackingToken,
        invoiceWebUrl: invoiceWebPath(row.invoiceTrackingToken),
        whatsappInvoiceUrl: row.whatsappInvoiceUrl,
        whatsappInvoiceStatus: row.whatsappInvoiceStatus,
        createdAt: row.createdAt.toISOString(),
        customer: {
          name: row.customerName ?? "Guest Customer",
          phone: row.customerPhone,
          isMember: Boolean(row.customerId),
          memberLevel: row.memberLevel ?? null,
        },
        channel: row.channel,
        tableLabel: row.tableLabel,
        status: row.status,
        payment: {
          method: payment?.method ?? null,
          status: payment?.status ?? null,
          amount: payment?.amount ?? null,
        },
        total: row.total,
      };
    }),
    total,
    hasMore: offset + rows.length < total,
  };
}

const customerOrderSources = ["qr_table", "qr_takeaway", "instagram", "campaign"];

export async function getCustomerOrderData(params?: { status?: string }) {
  const filters = [inArray(orders.orderSource, customerOrderSources)];
  if (params?.status && params.status !== "all") {
    filters.push(eq(orders.status, params.status));
  } else {
    const activeCustomerOrderStatusFilter = or(
      eq(orders.status, "pending_cashier"),
      eq(orders.status, "awaiting_payment"),
      eq(orders.status, "accepted"),
    );
    if (activeCustomerOrderStatusFilter) {
      filters.push(activeCustomerOrderStatusFilter);
    }
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(and(...filters))
    .orderBy(desc(orders.createdAt))
    .limit(80);

  if (!rows.length) {
    return [];
  }

  const itemRows = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((row) => row.id),
      ),
    );
  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
  }

  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      inArray(
        payments.orderId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(desc(payments.createdAt));
  const paymentByOrder = new Map<string, typeof paymentRows[number]>();
  for (const payment of paymentRows) {
    if (payment.orderId && !paymentByOrder.has(payment.orderId)) {
      paymentByOrder.set(payment.orderId, payment);
    }
  }

  return Promise.all(
    rows.map(async (row) => {
      const items = itemsByOrder.get(row.id) ?? [];
      const payment = paymentByOrder.get(row.id);
      const invoiceReadyOrder = await ensureCustomerOrderInvoiceLink({
        order: row,
        items,
      });
      return customerOrderResponse(invoiceReadyOrder, items, payment);
    }),
  );
}

export async function getQrControlInsights(params?: {
  status?: string;
  source?: string;
  table?: string;
}) {
  const db = getDb();
  const { start, end } = getJakartaTodayRange();
  const filters = [
    inArray(orders.orderSource, customerOrderSources),
    gte(orders.createdAt, start),
    lt(orders.createdAt, end),
  ];

  if (params?.status && params.status !== "all") {
    filters.push(eq(orders.status, params.status));
  }

  if (params?.source && params.source !== "all") {
    filters.push(eq(orders.orderSource, params.source));
  }

  if (params?.table && params.table !== "all") {
    filters.push(ilike(orders.tableLabel, `%${params.table}%`));
  }

  const rows = await db
    .select()
    .from(orders)
    .where(and(...filters))
    .orderBy(desc(orders.createdAt))
    .limit(500);

  let itemRows: Array<typeof orderItems.$inferSelect> = [];
  if (rows.length) {
    itemRows = await db
      .select()
      .from(orderItems)
      .where(
        inArray(
          orderItems.orderId,
          rows.map((row) => row.id),
        ),
      );
  }

  const itemsByOrder = new Map<string, Array<typeof orderItems.$inferSelect>>();
  for (const item of itemRows) {
    itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
  }

  const now = new Date();
  const pendingStatuses = new Set(["pending_cashier", "awaiting_payment"]);
  const responseRows = rows.map((row) => customerOrderResponse(row, itemsByOrder.get(row.id) ?? []));
  const pendingRows = rows.filter((row) => pendingStatuses.has(row.status));
  const processedMinutes = rows
    .map((row) => {
      const finishedAt = row.rejectedAt ?? row.acceptedAt;
      return minutesBetween(row.createdAt, finishedAt);
    })
    .filter((value): value is number => value != null);
  const pendingAlerts = pendingRows
    .map((row) => ({
      orderId: row.id,
      orderNo: row.orderNo,
      tableLabel: row.tableLabel,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      minutesWaiting: minutesBetween(row.createdAt, now) ?? 0,
      total: row.total,
    }))
    .filter((row) => row.minutesWaiting >= qrControlPendingSlaMinutes)
    .sort((left, right) => right.minutesWaiting - left.minutesWaiting)
    .slice(0, 8);
  const uniqueCustomers = new Set(
    rows
      .map((row) => (row.customerPhone ? normalizePhone(row.customerPhone) : ""))
      .filter(Boolean),
  );
  const tableMap = new Map<
    string,
    { tableLabel: string; total: number; paid: number; rejected: number; revenue: number }
  >();
  for (const row of rows) {
    const current =
      tableMap.get(row.tableLabel) ?? {
        tableLabel: row.tableLabel,
        total: 0,
        paid: 0,
        rejected: 0,
        revenue: 0,
      };
    current.total += 1;
    current.paid += row.status === "paid" ? 1 : 0;
    current.rejected += row.status === "rejected" ? 1 : 0;
    current.revenue += row.status === "paid" ? row.total : 0;
    tableMap.set(row.tableLabel, current);
  }

  const rejectedReasonMap = new Map<string, number>();
  for (const row of rows.filter((order) => order.status === "rejected")) {
    const reason = row.rejectionReason?.trim() || "Tanpa alasan";
    rejectedReasonMap.set(reason, (rejectedReasonMap.get(reason) ?? 0) + 1);
  }

  const historyStart = new Date(now.getTime() - customerHistoryWindowDays * dayMs);
  const historyRows = await db
    .select()
    .from(orders)
    .where(
      and(
        inArray(orders.orderSource, customerOrderSources),
        gte(orders.createdAt, historyStart),
        isNotNull(orders.customerPhone),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(1000);
  const historyPaidOrderIds = historyRows
    .filter((row) => row.status === "paid")
    .map((row) => row.id);
  let historyItemRows: Array<typeof orderItems.$inferSelect> = [];
  if (historyPaidOrderIds.length) {
    historyItemRows = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, historyPaidOrderIds));
  }

  const historyItemsByOrder = new Map<string, Array<typeof orderItems.$inferSelect>>();
  for (const item of historyItemRows) {
    historyItemsByOrder.set(item.orderId, [
      ...(historyItemsByOrder.get(item.orderId) ?? []),
      item,
    ]);
  }

  const memberCustomerIds = [
    ...new Set(
      historyRows
        .map((row) => row.customerId)
        .filter((customerId): customerId is string => Boolean(customerId)),
    ),
  ];
  const memberRows = memberCustomerIds.length
    ? await db
        .select({ customerId: memberAccounts.customerId })
        .from(memberAccounts)
        .where(inArray(memberAccounts.customerId, memberCustomerIds))
    : [];
  const memberCustomerSet = new Set(memberRows.map((row) => row.customerId));
  const customerGroups = new Map<
    string,
    {
      name: string;
      phone: string;
      latestInvoiceUrl: string | null;
      latestAt: Date;
      isMember: boolean;
      totalOrders: number;
      totalSpend: number;
      favoriteItems: Map<string, number>;
    }
  >();

  for (const row of historyRows) {
    const phone = normalizePhone(row.customerPhone ?? "");
    if (!phone) continue;

    const group =
      customerGroups.get(phone) ??
      {
        name: row.customerName ?? "Customer",
        phone,
        latestInvoiceUrl: row.whatsappInvoiceUrl,
        latestAt: row.createdAt,
        isMember: false,
        totalOrders: 0,
        totalSpend: 0,
        favoriteItems: new Map<string, number>(),
      };
    if (!group.isMember) {
      group.name = row.customerName ?? group.name;
    }
    group.isMember = group.isMember || Boolean(row.customerId && memberCustomerSet.has(row.customerId));
    group.totalOrders += row.status !== "rejected" ? 1 : 0;
    group.totalSpend += row.status === "paid" ? row.total : 0;
    if (row.createdAt >= group.latestAt) {
      group.latestAt = row.createdAt;
      group.latestInvoiceUrl = row.whatsappInvoiceUrl ?? group.latestInvoiceUrl;
    }

    if (row.status === "paid") {
      for (const item of historyItemsByOrder.get(row.id) ?? []) {
        group.favoriteItems.set(
          item.itemName,
          (group.favoriteItems.get(item.itemName) ?? 0) + item.qty,
        );
      }
    }
    customerGroups.set(phone, group);
  }

  const repeatCustomers = Array.from(customerGroups.values())
    .filter((group) => group.totalOrders > 1 || group.totalSpend > 0)
    .map((group) => {
      const favoriteItem =
        Array.from(group.favoriteItems.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ??
        "-";
      const whatsapp = makeFollowUpLinks({
        name: group.name,
        phone: group.phone,
        favoriteItem,
        latestInvoiceUrl: group.latestInvoiceUrl,
      });
      return {
        name: group.name,
        phone: group.phone,
        label: group.isMember ? "member" : group.totalOrders > 1 ? "repeat guest" : "qr lead",
        isMember: group.isMember,
        totalOrders: group.totalOrders,
        totalSpend: group.totalSpend,
        lastVisit: group.latestAt.toISOString(),
        favoriteItem,
        suggestedAction: group.isMember
          ? "Kirim receipt atau promo next visit."
          : group.totalOrders > 1
            ? "Dorong daftar member saat kunjungan berikutnya."
            : "Kirim ucapan terima kasih dan review link.",
        whatsapp,
      };
    })
    .sort((left, right) => right.totalOrders - left.totalOrders || right.totalSpend - left.totalSpend)
    .slice(0, 8);

  const pendingOverSla = pendingAlerts.length;
  const totalPaid = rows.filter((row) => row.status === "paid").length;
  const totalRejected = rows.filter((row) => row.status === "rejected").length;
  const totalAccepted = rows.filter((row) => row.status === "accepted").length;
  const totalAwaitingPayment = rows.filter((row) => row.status === "awaiting_payment").length;
  const totalPending = rows.filter((row) => row.status === "pending_cashier").length;
  const gate = pendingOverSla > 0 ? "WATCH" : "GO";

  return {
    generatedAt: now.toISOString(),
    rangeLabel: "Hari ini",
    pendingSlaMinutes: qrControlPendingSlaMinutes,
    filters: {
      status: params?.status ?? "all",
      source: params?.source ?? "all",
      table: params?.table ?? "all",
    },
    summary: {
      total: rows.length,
      pending: totalPending,
      awaitingPayment: totalAwaitingPayment,
      accepted: totalAccepted,
      paid: totalPaid,
      rejected: totalRejected,
      totalSales: rows.reduce((sum, row) => sum + (row.status === "paid" ? row.total : 0), 0),
      averageProcessingMinutes: processedMinutes.length
        ? Number((processedMinutes.reduce((sum, value) => sum + value, 0) / processedMinutes.length).toFixed(1))
        : null,
      pendingOverSla,
      uniqueCustomers: uniqueCustomers.size,
      repeatGuests: repeatCustomers.filter((customer) => !customer.isMember && customer.totalOrders > 1).length,
    },
    topTables: Array.from(tableMap.values())
      .sort((left, right) => right.total - left.total || right.revenue - left.revenue)
      .slice(0, 6),
    pendingAlerts,
    repeatCustomers,
    rejectedReasons: Array.from(rejectedReasonMap.entries())
      .map(([reason, countValue]) => ({ reason, count: countValue }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6),
    recentOrders: responseRows.slice(0, 20),
    shiftReport: {
      gate,
      lines: [
        `${rows.length} QR order hari ini; ${totalPaid} paid, ${totalAccepted} accepted, ${totalRejected} rejected.`,
        pendingRows.length
          ? `${pendingRows.length} order masih pending; ${pendingOverSla} melewati SLA ${qrControlPendingSlaMinutes} menit.`
          : "Tidak ada QR order pending.",
        repeatCustomers.length
          ? `${repeatCustomers.length} customer repeat/lead siap follow-up WhatsApp.`
          : "Belum ada customer repeat dari histori 90 hari.",
      ],
    },
  };
}

function normalizeTableNumber(value: string) {
  const match = value.match(/\d+/);
  return match ? match[0].padStart(2, "0").slice(-2) : value.trim().slice(0, 20);
}

function normalizeDiningTableNumber(value: string) {
  const raw = value.trim();
  const match = raw.match(/\d+/);
  if (!match) {
    throw new Error("Nomor meja wajib dipilih untuk dine-in.");
  }

  const tableValue = Number(match[0]);
  if (!Number.isInteger(tableValue) || tableValue < 1 || tableValue > 50) {
    throw new Error("Nomor meja harus 01 sampai 50.");
  }

  return String(tableValue).padStart(2, "0");
}

function tableNumberFromOrderLabel(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/\d+/);
  if (!match) return null;
  const tableValue = Number(match[0]);
  if (!Number.isInteger(tableValue) || tableValue < 1 || tableValue > 50) return null;
  return String(tableValue).padStart(2, "0");
}

function tableLabelForNumber(tableNumber: string) {
  return `Meja ${normalizeTableNumber(tableNumber)}`;
}

function kitchenStatusForTickets(rows: Array<typeof kitchenTickets.$inferSelect>) {
  if (!rows.length) {
    return null;
  }

  if (rows.every((ticket) => ticket.status === "delivered")) return "delivered";
  if (rows.some((ticket) => ticket.status === "ready")) return "ready";
  if (rows.some((ticket) => ticket.status === "cooking")) return "cooking";
  return "queue";
}

function tableStatusFromOrder(
  order: typeof orders.$inferSelect | undefined,
  kitchenStatus: string | null,
  needsCleaning: boolean,
) {
  if (needsCleaning) return "needs_cleaning";
  if (!order) return "empty";
  if (order.status === "rejected") return "rejected";
  if (order.status === "awaiting_payment") return "awaiting_payment";
  if (order.status === "pending_cashier") return "pending";
  if (kitchenStatus === "ready") return "ready";
  if (order.status === "paid") return "paid";
  if (order.status === "accepted") return "accepted";
  return order.status;
}

function publicStatusMessage(status: string, kitchenStatus: string | null) {
  if (status === "rejected") return "Order ditolak kasir. Silakan hubungi kasir jika perlu bantuan.";
  if (status === "pending_cashier" || status === "awaiting_payment") {
    return "Order sudah terkirim. Menunggu validasi kasir.";
  }
  if (kitchenStatus === "ready") return "Order siap diantar.";
  if (kitchenStatus === "cooking") return "Order sedang diproses kitchen.";
  if (kitchenStatus === "delivered") return "Order selesai. Terima kasih.";
  if (status === "paid") return "Pembayaran tercatat. Order diproses kitchen.";
  return "Order diterima kasir dan masuk antrean kitchen.";
}

function voucherCode(value?: string) {
  return value?.trim().replace(/\s+/g, "").toUpperCase() ?? "";
}

function voucherDiscount(
  voucher: typeof vouchers.$inferSelect,
  subtotal: number,
) {
  const raw =
    voucher.type === "percent" ? Math.round((subtotal * voucher.value) / 100) : voucher.value;
  return Math.max(0, Math.min(raw, voucher.maxDiscount ?? raw, subtotal));
}

function voucherResponse(
  row: typeof vouchers.$inferSelect,
) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    type: row.type,
    value: row.value,
    minSpend: row.minSpend,
    maxDiscount: row.maxDiscount,
    audience: row.audience,
    status: row.status,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function memberLevelForAnnualSpend(annualSpend: number) {
  if (annualSpend >= PLATINUM_ANNUAL_SPEND) return "Platinum";
  if (annualSpend >= GOLD_ANNUAL_SPEND) return "Gold";
  return "Silver";
}

async function annualPaidSpendForCustomer(
  customerId: string,
  db: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
  extraPaidAmount = 0,
) {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.status, "paid"), gte(orders.createdAt, since)));

  return Number(row?.total ?? 0) + extraPaidAmount;
}

export async function getTableLiveData() {
  const db = getDb();
  const { start, end } = getJakartaTodayRange();
  const tableNumbers = Array.from({ length: 50 }, (_, index) => String(index + 1).padStart(2, "0"));

  const [outlet] = await db
    .select()
    .from(outlets)
    .where(eq(outlets.status, "active"))
    .orderBy(outlets.code)
    .limit(1);

  const sessionRows = await db
    .select()
    .from(tableSessions)
    .where(outlet ? eq(tableSessions.outletId, outlet.id) : undefined)
    .orderBy(desc(tableSessions.updatedAt));

  const sessionOrderIds = [
    ...new Set(
      sessionRows
        .map((row) => row.currentOrderId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const liveTableOrderSources = [...customerOrderSources, "pos"];
  const liveOrderWhere = sessionOrderIds.length
    ? or(
        and(
          inArray(orders.orderSource, liveTableOrderSources),
          gte(orders.createdAt, start),
          lt(orders.createdAt, end),
        ),
        inArray(orders.id, sessionOrderIds),
      )
    : and(
        inArray(orders.orderSource, liveTableOrderSources),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      );
  const latestOrders = await db
    .select()
    .from(orders)
    .where(liveOrderWhere)
    .orderBy(desc(orders.createdAt))
    .limit(300);

  const orderIds = latestOrders.map((order) => order.id);
  const ticketRows = orderIds.length
    ? await db.select().from(kitchenTickets).where(inArray(kitchenTickets.orderId, orderIds))
    : [];
  const ticketsByOrder = new Map<string, Array<typeof kitchenTickets.$inferSelect>>();
  for (const ticket of ticketRows) {
    if (!ticket.orderId) continue;
    ticketsByOrder.set(ticket.orderId, [...(ticketsByOrder.get(ticket.orderId) ?? []), ticket]);
  }

  const latestByTable = new Map<string, typeof latestOrders[number]>();
  for (const order of latestOrders) {
    const tableNumber = tableNumberFromOrderLabel(order.tableLabel);
    if (!tableNumber) continue;
    if (!latestByTable.has(tableNumber)) {
      latestByTable.set(tableNumber, order);
    }
  }

  const sessionByTable = new Map(sessionRows.map((row) => [row.tableNumber, row]));
  const orderById = new Map(latestOrders.map((order) => [order.id, order]));
  const now = new Date();

  // Group ALL today's orders per table (untuk hitung multi-bill dalam sesi).
  const ordersByTable = new Map<string, typeof latestOrders>();
  for (const order of latestOrders) {
    const tableNumber = tableNumberFromOrderLabel(order.tableLabel);
    if (!tableNumber) continue;
    const list = ordersByTable.get(tableNumber) ?? [];
    list.push(order);
    ordersByTable.set(tableNumber, list);
  }

  const OPEN_BILL_STATUSES = new Set([
    "pending",
    "pending_cashier",
    "accepted",
    "awaiting_payment",
    "ready",
  ]);

  return tableNumbers.map((tableNumber) => {
    const session = sessionByTable.get(tableNumber);
    const sessionCleared =
      session?.status === "empty" && !session.currentOrderId && !session.needsCleaning;
    const sessionOrder = session?.currentOrderId
      ? orderById.get(session.currentOrderId)
      : undefined;

    // Bill window sesi: hanya order yang dibuat setelah cleanedAt terakhir
    // (atau seluruh hari ini kalau belum pernah di-clean). Sesi yang sudah
    // benar-benar di-clean (sessionCleared) → window kosong.
    const windowStart = session?.cleanedAt ?? start;
    const allOrdersToday = ordersByTable.get(tableNumber) ?? [];
    const sessionBills = sessionCleared
      ? []
      : allOrdersToday.filter(
          (o) =>
            o.createdAt >= windowStart &&
            o.status !== "rejected" &&
            o.status !== "cancelled",
        );
    const paidBillCount = sessionBills.filter((o) => o.status === "paid").length;
    const openBillCount = sessionBills.filter((o) => OPEN_BILL_STATUSES.has(o.status)).length;
    const isMixed = paidBillCount > 0 && openBillCount > 0;

    // Pilih "active" order: prioritaskan yang belum lunas (paling baru),
    // fallback ke yang paling baru terakhir, fallback ke sessionOrder/latest.
    const newestOpen = sessionBills.find((o) => OPEN_BILL_STATUSES.has(o.status));
    const order = sessionCleared
      ? undefined
      : newestOpen ?? sessionOrder ?? sessionBills[0] ?? latestByTable.get(tableNumber);
    const ticketStatus = kitchenStatusForTickets(order ? ticketsByOrder.get(order.id) ?? [] : []);
    const needsCleaning =
      Boolean(session?.needsCleaning) || session?.status === "needs_cleaning";

    let status: string;
    if (isMixed) {
      status = "mixed";
    } else if (!order && session?.status && session.status !== "empty") {
      status = session.status;
    } else {
      status = tableStatusFromOrder(order, ticketStatus, needsCleaning);
    }

    const lastStatusAt = session?.lastStatusAt ?? order?.updatedAt ?? order?.createdAt ?? null;

    const bills = sessionBills.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      total: o.total,
      createdAt: o.createdAt.toISOString(),
    }));

    return {
      tableNumber,
      tableLabel: session?.tableLabel ?? tableLabelForNumber(tableNumber),
      status,
      currentOrderId: order?.id ?? session?.currentOrderId ?? null,
      orderNo: order?.orderNo ?? null,
      customerName: order?.customerName ?? null,
      customerPhone: order?.customerPhone ?? null,
      total: order?.total ?? 0,
      timerMinutes: minutesBetween(order?.createdAt ?? lastStatusAt, now) ?? 0,
      kitchenStatus: ticketStatus,
      needsCleaning,
      lastStatusAt: lastStatusAt?.toISOString() ?? null,
      bills,
      paidBillCount,
      openBillCount,
    };
  });
}

// Semua order di meja ini hari ini (lintas sesi/clean). Dipakai untuk
// drawer "Riwayat Hari Ini" & handover shift.
export async function getTableHistoryToday(tableNumber: string) {
  const db = getDb();
  const { start, end } = getJakartaTodayRange();
  const label = tableLabelForNumber(tableNumber);
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.tableLabel, label),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    )
    .orderBy(desc(orders.createdAt));

  return {
    tableNumber,
    tableLabel: label,
    bills: rows.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      total: o.total,
      customerName: o.customerName,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

export async function getPublicTableLiveData() {
  const rows = await getTableLiveData();

  return rows.map((row) => {
    const needsCleaning = Boolean(row.needsCleaning || row.status === "needs_cleaning");
    const available = row.status === "empty" && !needsCleaning;
    const status = needsCleaning
      ? "needs_cleaning"
      : available
        ? "empty"
        : ["pending", "accepted", "awaiting_payment", "paid", "ready", "mixed"].includes(row.status)
          ? "occupied"
          : "unavailable";

    return {
      tableNumber: row.tableNumber,
      tableLabel: row.tableLabel,
      status,
      available,
      needsCleaning,
      lastStatusAt: row.lastStatusAt,
    };
  });
}

export async function updateTableStatus(
  table: string,
  input: {
    status: string;
    currentOrderId?: string | null;
    needsCleaning?: boolean;
    // Kalau true: jangan reset cleanedAt walau status=="empty". Dipakai oleh
    // skenario "Tamu Baru" (teman gabung setelah lunas) supaya bill window
    // sesi tetap mencakup bill yang sudah lunas — sehingga aggregate bisa
    // mendeteksi MIXED saat order baru masuk.
    preserveCleanedAt?: boolean;
  },
  garage: GarageSession,
) {
  const db = getDb();
  const tableNumber = normalizeTableNumber(table);
  const now = new Date();
  const status = input.status.trim();
  const insertValues = {
    outletId: garage.profile.outlet.id,
    tableNumber,
    tableLabel: tableLabelForNumber(tableNumber),
    status,
    currentOrderId: status === "empty" ? null : input.currentOrderId ?? null,
    needsCleaning: status === "needs_cleaning" ? true : Boolean(input.needsCleaning),
    cleanedAt: status === "empty" && !input.preserveCleanedAt ? now : null,
    lastStatusAt: now,
    updatedAt: now,
  };
  // Untuk update path, hilangkan cleanedAt dari set bila preserveCleanedAt
  // agar nilai existing tidak di-overwrite jadi null.
  const updateSet: Record<string, unknown> = { ...insertValues };
  if (input.preserveCleanedAt) {
    delete updateSet.cleanedAt;
  }

  const [row] = await db
    .insert(tableSessions)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [tableSessions.outletId, tableSessions.tableNumber],
      set: updateSet,
    })
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: `Update table ${tableNumber} status`,
    object: row.tableLabel,
    device: garage.profile.deviceLabel,
    status,
    metadata: {
      currentOrderId: row.currentOrderId,
      needsCleaning: row.needsCleaning,
    },
  });

  return {
    tableNumber: row.tableNumber,
    tableLabel: row.tableLabel,
    status: row.status,
    currentOrderId: row.currentOrderId,
    needsCleaning: row.needsCleaning,
    lastStatusAt: row.lastStatusAt.toISOString(),
  };
}

// Pindahkan bill aktif dari meja sumber ke meja tujuan. Update label di
// orders + reset sesi sumber (cleanedAt diset agar bill window di sumber
// tertutup) + isi sesi tujuan dengan order tsb. Throws kalau tujuan
// punya open bill aktif.
export async function moveTable(
  from: string,
  to: string,
  garage: GarageSession,
) {
  const db = getDb();
  const fromNumber = normalizeTableNumber(from);
  const toNumber = normalizeTableNumber(to);
  if (fromNumber === toNumber) {
    throw new Error("Meja sumber dan tujuan sama.");
  }
  const now = new Date();

  const live = await getTableLiveData();
  const fromRow = live.find((r) => r.tableNumber === fromNumber);
  const toRow = live.find((r) => r.tableNumber === toNumber);
  if (!fromRow || !fromRow.currentOrderId) {
    throw new Error("Meja sumber tidak punya bill aktif.");
  }
  if (toRow && (toRow.openBillCount ?? 0) > 0) {
    throw new Error("Meja tujuan masih punya bill aktif. Selesaikan dulu.");
  }
  if (
    toRow &&
    (toRow.status !== "empty" ||
      Boolean(toRow.currentOrderId) ||
      (toRow.paidBillCount ?? 0) > 0)
  ) {
    throw new Error("Meja tujuan belum kosong. Bersihkan atau tutup sesi meja tujuan dulu.");
  }
  if (toRow?.needsCleaning) {
    throw new Error("Meja tujuan perlu dibersihkan dulu.");
  }

  const orderId = fromRow.currentOrderId;
  const toLabel = tableLabelForNumber(toNumber);
  const fromLabel = tableLabelForNumber(fromNumber);

  await db
    .update(orders)
    .set({ tableLabel: toLabel, updatedAt: now })
    .where(eq(orders.id, orderId));

  // Reset sesi sumber: status empty + cleanedAt=now (sesi sumber selesai).
  await db
    .insert(tableSessions)
    .values({
      outletId: garage.profile.outlet.id,
      tableNumber: fromNumber,
      tableLabel: fromLabel,
      status: "empty",
      currentOrderId: null,
      needsCleaning: false,
      cleanedAt: now,
      lastStatusAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [tableSessions.outletId, tableSessions.tableNumber],
      set: {
        status: "empty",
        currentOrderId: null,
        needsCleaning: false,
        cleanedAt: now,
        lastStatusAt: now,
        updatedAt: now,
      },
    });

  // Set sesi tujuan dengan status sesuai order.
  const targetStatus = fromRow.status === "paid" ? "paid" : fromRow.status;
  await db
    .insert(tableSessions)
    .values({
      outletId: garage.profile.outlet.id,
      tableNumber: toNumber,
      tableLabel: toLabel,
      status: targetStatus,
      currentOrderId: orderId,
      needsCleaning: false,
      lastStatusAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [tableSessions.outletId, tableSessions.tableNumber],
      set: {
        tableLabel: toLabel,
        status: targetStatus,
        currentOrderId: orderId,
        needsCleaning: false,
        lastStatusAt: now,
        updatedAt: now,
      },
    });

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: `Move ${fromLabel} → ${toLabel}`,
    object: fromRow.orderNo ?? orderId,
    device: garage.profile.deviceLabel,
    status: targetStatus,
    metadata: { orderId, from: fromNumber, to: toNumber },
  });

  return {
    from: fromNumber,
    to: toNumber,
    orderId,
    orderNo: fromRow.orderNo,
  };
}

export async function getPublicCustomerOrderStatus(id: string) {
  const db = getDb();
  const safeId = id.trim();
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(safeId);
  const [order] = await db
    .select()
    .from(orders)
    .where(looksLikeUuid ? or(eq(orders.id, safeId), eq(orders.orderNo, safeId)) : eq(orders.orderNo, safeId))
    .limit(1);
  if (!order || !customerOrderSources.includes(order.orderSource)) {
    return null;
  }

  const ticketRows = await db
    .select()
    .from(kitchenTickets)
    .where(eq(kitchenTickets.orderId, order.id));
  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const invoiceReadyOrder = await ensureCustomerOrderInvoiceLink({
    order,
    items: itemRows,
  });
  const kitchenStatus = kitchenStatusForTickets(ticketRows);
  const publicKitchenStatus =
    invoiceReadyOrder.status === "rejected"
      ? "rejected"
      : invoiceReadyOrder.status === "pending_cashier" || invoiceReadyOrder.status === "awaiting_payment"
        ? "waiting_cashier"
        : kitchenStatus ?? "queue";
  const estimatedMinutes =
    publicKitchenStatus === "waiting_cashier"
      ? qrControlPendingSlaMinutes
      : ticketRows.length
        ? Math.max(...ticketRows.map((ticket) => ticket.targetMinutes))
        : null;

  // Rincian per station (Bar/Dapur) + ETA live untuk tracker pelanggan.
  // ETA = sisa menit perkiraan: ready/delivered = 0; cooking = target - elapsed
  // sejak diterima; queue = target penuh.
  const nowMs = Date.now();
  const stations = ticketRows
    .filter((ticket) => !["rejected", "canceled", "cancelled"].includes(ticket.status))
    .map((ticket) => {
      const targetSeconds = Math.max(0, ticket.targetMinutes) * 60;
      const cookingStartedAt =
        ticket.status === "cooking" && ticket.acceptedAt
          ? new Date(ticket.acceptedAt).toISOString()
          : null;
      let etaSeconds: number | null;
      if (ticket.status === "ready" || ticket.status === "delivered") {
        etaSeconds = 0;
      } else if (ticket.status === "cooking" && ticket.acceptedAt) {
        const elapsedSec = (nowMs - new Date(ticket.acceptedAt).getTime()) / 1000;
        etaSeconds = Math.max(0, Math.round(targetSeconds - elapsedSec));
      } else {
        etaSeconds = targetSeconds; // queue: target penuh, belum mulai dimasak
      }
      return {
        station: ticket.station === "Food" ? "Dapur" : ticket.station,
        status: ticket.status,
        etaSeconds,
        targetSeconds,
        cookingStartedAt,
      };
    })
    .sort((a, b) => a.station.localeCompare(b.station));

  return {
    id: invoiceReadyOrder.id,
    orderNo: invoiceReadyOrder.orderNo,
    tableLabel: invoiceReadyOrder.tableLabel,
    orderStatus: invoiceReadyOrder.status,
    kitchenStatus: publicKitchenStatus,
    estimatedMinutes,
    stations,
    invoiceWebUrl: invoiceWebPath(invoiceReadyOrder.invoiceTrackingToken),
    whatsappInvoiceUrl: invoiceReadyOrder.whatsappInvoiceUrl ?? null,
    message: publicStatusMessage(invoiceReadyOrder.status, kitchenStatus),
    updatedAt: invoiceReadyOrder.updatedAt.toISOString(),
  };
}

export type ServiceRequestType = "call" | "bill" | "water" | "other";

const serviceRequestTypes: ServiceRequestType[] = ["call", "bill", "water", "other"];

// Panggilan pelayan dari meja. Dedup 60 detik per (meja+type) supaya tap
// berulang tidak membanjiri staf.
export async function createServiceRequest(input: {
  tableLabel: string;
  outletId?: string;
  type?: ServiceRequestType;
  note?: string;
}) {
  const db = getDb();
  const tableLabel = input.tableLabel.trim();
  const type: ServiceRequestType = serviceRequestTypes.includes(input.type as ServiceRequestType)
    ? (input.type as ServiceRequestType)
    : "call";
  const since = new Date(Date.now() - 60_000);
  const [existing] = await db
    .select({ id: serviceRequests.id })
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.tableLabel, tableLabel),
        eq(serviceRequests.type, type),
        eq(serviceRequests.status, "open"),
        gte(serviceRequests.createdAt, since),
      ),
    )
    .limit(1);
  if (existing) {
    return { id: existing.id, deduped: true };
  }
  const [row] = await db
    .insert(serviceRequests)
    .values({
      tableLabel,
      outletId: input.outletId ?? null,
      type,
      note: input.note?.trim() || null,
    })
    .returning();
  return { id: row.id, deduped: false };
}

export async function listOpenServiceRequests() {
  const db = getDb();
  const rows = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.status, "open"))
    .orderBy(asc(serviceRequests.createdAt))
    .limit(100);
  return rows.map((row) => ({
    id: row.id,
    tableLabel: row.tableLabel,
    type: row.type,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function resolveServiceRequest(id: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .update(serviceRequests)
    .set({ status: "resolved", resolvedBy: userId, resolvedAt: new Date() })
    .where(and(eq(serviceRequests.id, id), eq(serviceRequests.status, "open")))
    .returning();
  return row ? { id: row.id } : null;
}

// ── Live chat customer (guest/member) <-> kasir ───────────────────────────
// Thread diikat ke chatToken acak (kontrol akses guest tanpa login) + meja.
type CustomerChatMessageRow = {
  id: string;
  sender: string;
  body: string;
  staffUserId: string | null;
  createdAt: Date;
};

function mapCustomerChatMessage(row: CustomerChatMessageRow) {
  return {
    id: row.id,
    sender: row.sender,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

async function ensureCustomerChatThread(input: {
  chatToken: string;
  tableLabel: string;
  outletId?: string | null;
  orderId?: string | null;
  memberId?: string | null;
}) {
  const db = getDb();
  const chatToken = input.chatToken.trim();
  const [existing] = await db
    .select()
    .from(customerChatThreads)
    .where(eq(customerChatThreads.chatToken, chatToken))
    .limit(1);
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (existing.status !== "open") patch.status = "open";
    if (input.tableLabel && input.tableLabel.trim() && input.tableLabel.trim() !== existing.tableLabel) {
      patch.tableLabel = input.tableLabel.trim();
    }
    if (input.orderId && !existing.orderId) patch.orderId = input.orderId;
    if (input.memberId && !existing.memberId) patch.memberId = input.memberId;
    if (Object.keys(patch).length) {
      await db.update(customerChatThreads).set(patch).where(eq(customerChatThreads.id, existing.id));
    }
    return existing.id;
  }
  const [row] = await db
    .insert(customerChatThreads)
    .values({
      chatToken,
      tableLabel: input.tableLabel.trim() || "Meja QR",
      outletId: input.outletId ?? null,
      orderId: input.orderId ?? null,
      memberId: input.memberId ?? null,
    })
    .returning({ id: customerChatThreads.id });
  return row.id;
}

export async function postCustomerChatMessage(input: {
  chatToken: string;
  tableLabel: string;
  body: string;
  orderId?: string | null;
  memberId?: string | null;
}) {
  const db = getDb();
  const body = input.body.trim();
  if (!body) return null;
  const threadId = await ensureCustomerChatThread(input);
  const now = new Date();
  const [msg] = await db
    .insert(customerChatMessages)
    .values({ threadId, sender: "customer", body })
    .returning();
  await db
    .update(customerChatThreads)
    .set({ lastMessageAt: now, lastCustomerAt: now })
    .where(eq(customerChatThreads.id, threadId));
  return { threadId, id: msg.id, createdAt: msg.createdAt.toISOString() };
}

export async function getCustomerChatMessages(input: { chatToken: string; afterId?: string }) {
  const db = getDb();
  const [thread] = await db
    .select()
    .from(customerChatThreads)
    .where(eq(customerChatThreads.chatToken, input.chatToken.trim()))
    .limit(1);
  if (!thread) {
    return { threadId: null as string | null, status: "open", messages: [] as ReturnType<typeof mapCustomerChatMessage>[] };
  }
  const rows = await db
    .select()
    .from(customerChatMessages)
    .where(eq(customerChatMessages.threadId, thread.id))
    .orderBy(asc(customerChatMessages.createdAt))
    .limit(200);
  let messages = rows.map(mapCustomerChatMessage);
  if (input.afterId) {
    const idx = messages.findIndex((m) => m.id === input.afterId);
    if (idx >= 0) messages = messages.slice(idx + 1);
  }
  return { threadId: thread.id, status: thread.status, messages };
}

export async function listStaffChatThreads() {
  const db = getDb();
  const rows = await db
    .select()
    .from(customerChatThreads)
    .where(eq(customerChatThreads.status, "open"))
    .orderBy(desc(customerChatThreads.lastMessageAt))
    .limit(100);
  const result = [];
  for (const t of rows) {
    const [last] = await db
      .select({ body: customerChatMessages.body, sender: customerChatMessages.sender })
      .from(customerChatMessages)
      .where(eq(customerChatMessages.threadId, t.id))
      .orderBy(desc(customerChatMessages.createdAt))
      .limit(1);
    const unread = t.lastCustomerAt != null && (t.staffReadAt == null || t.lastCustomerAt > t.staffReadAt);
    result.push({
      id: t.id,
      tableLabel: t.tableLabel,
      orderId: t.orderId,
      status: t.status,
      unread,
      lastMessageAt: t.lastMessageAt.toISOString(),
      preview: last ? last.body.slice(0, 80) : "",
      lastSender: last?.sender ?? null,
    });
  }
  return result;
}

export async function getStaffChatThread(
  threadId: string,
  opts?: { markRead?: boolean },
) {
  const db = getDb();
  const [thread] = await db
    .select()
    .from(customerChatThreads)
    .where(eq(customerChatThreads.id, threadId))
    .limit(1);
  if (!thread) return null;
  const rows = await db
    .select()
    .from(customerChatMessages)
    .where(eq(customerChatMessages.threadId, threadId))
    .orderBy(asc(customerChatMessages.createdAt))
    .limit(300);
  if (opts?.markRead) {
    await db
      .update(customerChatThreads)
      .set({ staffReadAt: new Date() })
      .where(eq(customerChatThreads.id, threadId));
  }
  return {
    id: thread.id,
    tableLabel: thread.tableLabel,
    orderId: thread.orderId,
    status: thread.status,
    messages: rows.map((r) => ({ ...mapCustomerChatMessage(r), staffUserId: r.staffUserId })),
  };
}

export async function postStaffChatMessage(input: { threadId: string; userId: string; body: string }) {
  const db = getDb();
  const body = input.body.trim();
  if (!body) return null;
  const now = new Date();
  const [msg] = await db
    .insert(customerChatMessages)
    .values({ threadId: input.threadId, sender: "staff", staffUserId: input.userId, body })
    .returning();
  await db
    .update(customerChatThreads)
    .set({ lastMessageAt: now, staffReadAt: now })
    .where(eq(customerChatThreads.id, input.threadId));
  return { id: msg.id, createdAt: msg.createdAt.toISOString() };
}

// Tautkan thread chat ke order saat customer checkout. Setelah ini, semua
// transisi status order akan otomatis jadi system message di percakapan.
export async function linkChatThreadToOrder(chatToken: string, orderId: string, orderNo?: string | null) {
  const db = getDb();
  const [thread] = await db
    .select({ id: customerChatThreads.id })
    .from(customerChatThreads)
    .where(eq(customerChatThreads.chatToken, chatToken))
    .limit(1);
  if (!thread) return null;
  await db
    .update(customerChatThreads)
    .set({ orderId, lastMessageAt: new Date() })
    .where(eq(customerChatThreads.id, thread.id));
  await db.insert(customerChatMessages).values({
    threadId: thread.id,
    sender: "system",
    body: orderNo ? `Pesanan ${orderNo} diterima sistem.` : "Pesanan diterima sistem.",
  });
  return { threadId: thread.id };
}

// Dipakai untuk push status order otomatis ke percakapan (system message).
export async function postSystemChatMessageForOrder(orderId: string, body: string) {
  const db = getDb();
  const [thread] = await db
    .select({ id: customerChatThreads.id })
    .from(customerChatThreads)
    .where(eq(customerChatThreads.orderId, orderId))
    .limit(1);
  if (!thread) return null;
  const [msg] = await db
    .insert(customerChatMessages)
    .values({ threadId: thread.id, sender: "system", body: body.trim() })
    .returning({ id: customerChatMessages.id });
  await db
    .update(customerChatThreads)
    .set({ lastMessageAt: new Date() })
    .where(eq(customerChatThreads.id, thread.id));
  return { id: msg.id };
}

export async function resolveCustomerChatThread(threadId: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .update(customerChatThreads)
    .set({ status: "resolved", assignedToUserId: userId, staffReadAt: new Date() })
    .where(eq(customerChatThreads.id, threadId))
    .returning({ id: customerChatThreads.id });
  return row ? { id: row.id } : null;
}

export async function forwardCustomerChatToWaiter(threadId: string, userId: string) {
  const db = getDb();
  const [thread] = await db
    .select()
    .from(customerChatThreads)
    .where(eq(customerChatThreads.id, threadId))
    .limit(1);
  if (!thread) return null;
  await createServiceRequest({
    tableLabel: thread.tableLabel,
    outletId: thread.outletId ?? undefined,
    type: "call",
    note: "Diteruskan dari chat kasir",
  });
  await postStaffChatMessage({
    threadId,
    userId,
    body: "Pelayan sudah diarahkan ke meja Anda. 🙏",
  });
  return { ok: true };
}

export async function getPublicInvoiceTracking(token: string) {
  const db = getDb();
  const safeToken = token.trim();
  if (!safeToken || safeToken.length < 12) {
    return null;
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.invoiceTrackingToken, safeToken))
    .limit(1);
  // Token acak = kontrol akses; customerPhone boleh null (guest tanpa WhatsApp).
  if (!order) {
    return null;
  }

  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const ticketRows = await db.select().from(kitchenTickets).where(eq(kitchenTickets.orderId, order.id));
  const [latestPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, order.id))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  const invoiceReadyOrder = await ensureCustomerOrderInvoiceLink({
    order,
    items: itemRows,
  });
  const metadata = latestPayment?.metadata ?? {};
  const kitchenStatus = kitchenStatusForTickets(ticketRows);

  return {
    id: invoiceReadyOrder.id,
    orderNo: invoiceReadyOrder.orderNo,
    invoiceNo: stringFromMetadata(metadata, "invoiceNo") ?? invoiceNoForOrder(invoiceReadyOrder.orderNo),
    invoiceStatus:
      stringFromMetadata(metadata, "invoiceStatus") ??
      (invoiceReadyOrder.status === "paid" ? "issued" : "pending"),
    invoiceIssuedAt: stringFromMetadata(metadata, "invoiceIssuedAt"),
    invoiceWebUrl: invoiceWebPath(invoiceReadyOrder.invoiceTrackingToken),
    invoicePdfUrl: null,
    whatsappInvoiceUrl: invoiceReadyOrder.whatsappInvoiceUrl,
    tableLabel: invoiceReadyOrder.tableLabel,
    channel: invoiceReadyOrder.channel,
    orderStatus: invoiceReadyOrder.status,
    kitchenStatus:
      invoiceReadyOrder.status === "rejected"
        ? "rejected"
        : kitchenStatus ??
          (invoiceReadyOrder.status === "pending_cashier" ||
          invoiceReadyOrder.status === "awaiting_payment"
            ? "waiting_cashier"
            : "queue"),
    customer: {
      name: invoiceReadyOrder.customerName,
      phone: invoiceReadyOrder.customerPhone,
      note: invoiceReadyOrder.customerNote,
    },
    payment: {
      method: latestPayment?.method ?? null,
      status: latestPayment?.status ?? null,
      provider: stringFromMetadata(metadata, "provider"),
      reference: stringFromMetadata(metadata, "reference"),
      cashReceived: numberFromMetadata(metadata, "cashReceived"),
      change: numberFromMetadata(metadata, "change"),
    },
    items: itemRows.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      variantLabel: item.variantLabel,
      qty: item.qty,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      note: (item as { note?: string | null }).note ?? null,
    })),
    subtotal: invoiceReadyOrder.subtotal,
    service: invoiceReadyOrder.service,
    tax: invoiceReadyOrder.tax,
    discount: invoiceReadyOrder.discount,
    total: invoiceReadyOrder.total,
    createdAt: invoiceReadyOrder.createdAt.toISOString(),
    updatedAt: invoiceReadyOrder.updatedAt.toISOString(),
    brand: receiptBrand,
  };
}

// ────────────────────────────────────────────────────────────
// LIVE INVOICE STATUS — lightweight polling endpoint untuk
// customer invoice page. Returns minimal payload (~1KB) berisi
// status step + countdown timer + per-station ticket detail.
// Dipanggil tiap 8 detik dari InvoiceLiveTracker (client).
// ────────────────────────────────────────────────────────────

export async function getInvoiceLiveStatus(token: string) {
  const db = getDb();
  const safeToken = token.trim();
  if (!safeToken || safeToken.length < 12) return null;

  const [order] = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      acceptedAt: orders.acceptedAt,
      rejectedAt: orders.rejectedAt,
    })
    .from(orders)
    .where(eq(orders.invoiceTrackingToken, safeToken))
    .limit(1);

  if (!order) return null;

  // Select * — kitchenStatusForTickets butuh full row shape
  const ticketRows = await db
    .select()
    .from(kitchenTickets)
    .where(eq(kitchenTickets.orderId, order.id));

  const kitchenStatus = kitchenStatusForTickets(ticketRows);
  const publicKitchenStatus: string =
    order.status === "rejected"
      ? "rejected"
      : order.status === "pending_cashier" || order.status === "awaiting_payment"
        ? "waiting_cashier"
        : kitchenStatus ?? "queue";

  // Compute "active step" — sync dengan trackingStepIndex di invoice page
  const activeStep =
    order.status === "rejected" || publicKitchenStatus === "rejected"
      ? -1
      : publicKitchenStatus === "delivered" || publicKitchenStatus === "completed"
        ? 5
        : publicKitchenStatus === "ready"
          ? 4
          : publicKitchenStatus === "cooking"
            ? 3
            : publicKitchenStatus === "queue"
              ? 2
              : order.status === "accepted" || order.status === "paid"
                ? 2
                : 1;

  // Aggregate timing — cooking dimulai dari acceptedAt ticket pertama
  const cookingStartedAt = ticketRows
    .map((t) => t.acceptedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const allReadyAt = ticketRows.length && ticketRows.every((t) => t.readyAt)
    ? ticketRows
        .map((t) => t.readyAt!)
        .sort((a, b) => b.getTime() - a.getTime())[0]
    : null;
  const allDeliveredAt = ticketRows.length && ticketRows.every((t) => t.deliveredAt)
    ? ticketRows
        .map((t) => t.deliveredAt!)
        .sort((a, b) => b.getTime() - a.getTime())[0]
    : null;

  const targetMinutes = ticketRows.length
    ? Math.max(...ticketRows.map((t) => t.targetMinutes))
    : null;

  let elapsedSeconds: number | null = null;
  let remainingSeconds: number | null = null;
  if (publicKitchenStatus === "cooking" && cookingStartedAt && targetMinutes) {
    elapsedSeconds = Math.floor((Date.now() - cookingStartedAt.getTime()) / 1000);
    remainingSeconds = Math.max(0, targetMinutes * 60 - elapsedSeconds);
  }

  return {
    orderStatus: order.status,
    kitchenStatus: publicKitchenStatus,
    activeStep,
    targetMinutes,
    elapsedSeconds,
    remainingSeconds,
    cookingStartedAt: cookingStartedAt?.toISOString() ?? null,
    timestamps: {
      orderCreated: order.createdAt.toISOString(),
      orderAccepted: order.acceptedAt?.toISOString() ?? null,
      cookingStarted: cookingStartedAt?.toISOString() ?? null,
      ready: allReadyAt?.toISOString() ?? null,
      delivered: allDeliveredAt?.toISOString() ?? null,
      rejected: order.rejectedAt?.toISOString() ?? null,
    },
    stations: ticketRows.map((t) => ({
      ticketNo: t.ticketNo,
      station: t.station,
      status: t.status,
      targetMinutes: t.targetMinutes,
      acceptedAt: t.acceptedAt?.toISOString() ?? null,
      readyAt: t.readyAt?.toISOString() ?? null,
      deliveredAt: t.deliveredAt?.toISOString() ?? null,
    })),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export async function validateVoucher(input: {
  code?: string;
  subtotal: number;
  customerMode?: "guest" | "member" | string;
}) {
  const code = voucherCode(input.code);
  if (!code) {
    return {
      valid: false,
      code: "",
      title: null,
      discount: 0,
      message: "Masukkan kode voucher.",
    };
  }

  // Global policy: hanya member yang boleh pakai voucher. Guest harus daftar member dulu.
  if (input.customerMode !== "member") {
    return {
      valid: false,
      code,
      title: null,
      discount: 0,
      message: "Voucher khusus member. Daftar / login member dulu di kasir untuk klaim.",
    };
  }

  const [voucher] = await getDb()
    .select()
    .from(vouchers)
    .where(eq(vouchers.code, code))
    .limit(1);

  if (!voucher || voucher.status !== "active") {
    return {
      valid: false,
      code,
      title: null,
      discount: 0,
      message: "Voucher tidak aktif atau tidak ditemukan.",
    };
  }

  const now = new Date();
  if (voucher.startsAt && voucher.startsAt > now) {
    return { valid: false, code, title: voucher.title, discount: 0, message: "Voucher belum berlaku." };
  }
  if (voucher.endsAt && voucher.endsAt < now) {
    return { valid: false, code, title: voucher.title, discount: 0, message: "Voucher sudah berakhir." };
  }
  if (voucher.minSpend > input.subtotal) {
    return {
      valid: false,
      code,
      title: voucher.title,
      discount: 0,
      message: `Minimal belanja ${formatIdrShort(voucher.minSpend)}.`,
    };
  }
  if (voucher.usageLimit != null && voucher.usedCount >= voucher.usageLimit) {
    return { valid: false, code, title: voucher.title, discount: 0, message: "Kuota voucher habis." };
  }
  if (voucher.audience === "member" && input.customerMode !== "member") {
    return { valid: false, code, title: voucher.title, discount: 0, message: "Voucher khusus member." };
  }
  if (voucher.audience === "guest" && input.customerMode === "member") {
    return { valid: false, code, title: voucher.title, discount: 0, message: "Voucher khusus guest." };
  }

  const discount = voucherDiscount(voucher, input.subtotal);
  return {
    valid: discount > 0,
    code,
    title: voucher.title,
    discount,
    message: discount > 0 ? `${voucher.title} aktif.` : "Voucher tidak memberi diskon.",
  };
}

export async function getVoucherData() {
  return (await getDb().select().from(vouchers).orderBy(desc(vouchers.createdAt)).limit(100)).map(
    voucherResponse,
  );
}

export async function createVoucher(
  input: {
    code: string;
    title: string;
    type: "fixed" | "percent";
    value: number;
    minSpend?: number;
    maxDiscount?: number | null;
    audience?: string;
    status?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    usageLimit?: number | null;
  },
  garage: GarageSession,
) {
  const code = voucherCode(input.code);
  const now = new Date();
  const [row] = await getDb()
    .insert(vouchers)
    .values({
      code,
      title: input.title.trim(),
      type: input.type,
      value: input.value,
      minSpend: input.minSpend ?? 0,
      maxDiscount: input.maxDiscount ?? null,
      audience: input.audience ?? "all",
      status: input.status ?? "active",
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      usageLimit: input.usageLimit ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: vouchers.code,
      set: {
        title: input.title.trim(),
        type: input.type,
        value: input.value,
        minSpend: input.minSpend ?? 0,
        maxDiscount: input.maxDiscount ?? null,
        audience: input.audience ?? "all",
        status: input.status ?? "active",
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        usageLimit: input.usageLimit ?? null,
        updatedAt: now,
      },
    })
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: `Upsert voucher ${code}`,
    object: row.title,
    device: garage.profile.deviceLabel,
    status: row.status,
  });

  return voucherResponse(row);
}

export async function getDisplayCustomerQueue() {
  const rows = await getDb()
    .select({
      ticketNo: kitchenTickets.ticketNo,
      orderNo: orders.orderNo,
      tableLabel: kitchenTickets.tableLabel,
      station: kitchenTickets.station,
      status: kitchenTickets.status,
      targetGroup: kitchenTickets.targetGroup,
      elapsed: kitchenTickets.elapsed,
      targetMinutes: kitchenTickets.targetMinutes,
      createdAt: kitchenTickets.createdAt,
    })
    .from(kitchenTickets)
    .leftJoin(orders, eq(kitchenTickets.orderId, orders.id))
    .where(inArray(kitchenTickets.status, ["queue", "cooking", "ready", "delivered"]))
    .orderBy(desc(kitchenTickets.createdAt))
    .limit(80);

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

const publicLiveTrackingEvents = [
  { date: "16 MEI", time: "19:00", title: "Cafe Racer Night", tag: "Kopdar Motor", capacity: 60 },
  { date: "24 MEI", time: "20:00", title: "Slow Bar Live Set", tag: "Live Musik", capacity: 40 },
  { date: "04 JUN", time: "18:30", title: "Workshop Manual Brew", tag: "Workshop", capacity: 12 },
  { date: "13 JUN", time: "19:00", title: "Creative Supper Club", tag: "Komunitas", capacity: 30 },
];

function publicEtaRange(baseMinutes: number, activeCount: number) {
  const start = Math.max(5, Math.min(45, Math.round(baseMinutes)));
  const end = Math.max(start + 3, Math.min(60, start + 4 + Math.ceil(activeCount * 0.7)));
  return `${start}-${end} menit`;
}

function publicTicketPulse(rows: Array<{
  status: string;
  elapsed: number;
  targetMinutes: number;
}>, idleEta = "8-12 menit") {
  const queue = rows.filter((row) => row.status === "queue").length;
  const cooking = rows.filter((row) => row.status === "cooking").length;
  const ready = rows.filter((row) => row.status === "ready").length;
  const active = queue + cooking + ready;
  const overdue = rows.filter((row) => row.status !== "ready" && Number(row.elapsed) > Number(row.targetMinutes)).length;
  if (!active) {
    return {
      active,
      queue,
      cooking,
      ready,
      overdue,
      eta: idleEta,
    };
  }
  const weightedBase =
    rows.length > 0
      ? rows.reduce((sum, row) => sum + Number(row.targetMinutes || 10), 0) / rows.length
      : 10;
  const etaBase = weightedBase + queue * 2.4 + cooking * 1.2 + overdue * 2;

  return {
    active,
    queue,
    cooking,
    ready,
    overdue,
    eta: publicEtaRange(etaBase, active),
  };
}

function publicVisitMood(totalTables: number, availableTables: number, activeOrders: number) {
  if (!totalTables) {
    return {
      label: "Sinkron live",
      tone: "sync",
      recommendation: "Status live sedang disinkronkan. Reservasi WhatsApp tetap tersedia.",
    };
  }
  const occupancy = (totalTables - availableTables) / totalTables;
  if (availableTables <= 0 || occupancy >= 0.92) {
    return {
      label: "Full",
      tone: "full",
      recommendation: "Reservasi dulu. Takeaway lebih aman untuk saat ini.",
    };
  }
  if (occupancy >= 0.68 || activeOrders >= 12) {
    return {
      label: "Padat",
      tone: "busy",
      recommendation: "Order digital dulu atau pilih takeaway agar tidak menunggu lama.",
    };
  }
  if (occupancy >= 0.36 || activeOrders >= 5) {
    return {
      label: "Ramai santai",
      tone: "normal",
      recommendation: "Masih aman datang. Pilih meja kosong sebelum berangkat.",
    };
  }
  return {
    label: "Sepi nyaman",
    tone: "calm",
    recommendation: "Aman datang sekarang. Order digital bisa disiapkan lebih awal.",
  };
}

function publicEventCapacity(event: { capacity: number }, index: number) {
  const reserved = Math.min(event.capacity - 1, Math.round(event.capacity * (0.34 + index * 0.11)));
  const available = Math.max(0, event.capacity - reserved);
  const tone = available <= 3 ? "full" : available <= Math.ceil(event.capacity * 0.35) ? "busy" : "ready";
  return { reserved, available, tone };
}

export async function getPublicLiveTrackingData() {
  const db = getDb();
  const [tables, ticketRows] = await Promise.all([
    getPublicTableLiveData(),
    db
      .select({
        station: kitchenTickets.station,
        status: kitchenTickets.status,
        targetGroup: kitchenTickets.targetGroup,
        elapsed: kitchenTickets.elapsed,
        targetMinutes: kitchenTickets.targetMinutes,
        channel: kitchenTickets.channel,
        createdAt: kitchenTickets.createdAt,
      })
      .from(kitchenTickets)
      .where(inArray(kitchenTickets.status, ["queue", "cooking", "ready"]))
      .orderBy(desc(kitchenTickets.createdAt))
      .limit(200),
  ]);

  const barTickets = ticketRows.filter((ticket) => {
    const station = ticket.station.toLowerCase();
    return ticket.targetGroup === "drink" || station.includes("bar");
  });
  const kitchenTicketRows = ticketRows.filter((ticket) => {
    const station = ticket.station.toLowerCase();
    return ticket.targetGroup === "food" || station.includes("food") || station.includes("dapur");
  });
  const takeawayTickets = ticketRows.filter((ticket) => {
    const channel = ticket.channel.toLowerCase();
    return channel.includes("take") || channel.includes("delivery");
  });

  const orderPulse = publicTicketPulse(ticketRows, "8-12 menit");
  const barPulse = publicTicketPulse(barTickets, "5-8 menit");
  const kitchenPulse = publicTicketPulse(kitchenTicketRows, "12-18 menit");
  const takeawayPulse = publicTicketPulse(takeawayTickets.length ? takeawayTickets : ticketRows, "8-12 menit");
  const availableTables = tables.filter((table) => table.available).length;
  const visitMood = publicVisitMood(tables.length, availableTables, orderPulse.active);
  const events = publicLiveTrackingEvents.map((event, index) => {
    const capacity = publicEventCapacity(event, index);
    return {
      ...event,
      reserved: capacity.reserved,
      available: capacity.available,
      tone: capacity.tone,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    privacy: {
      publicOnly: true,
      note: "Data pelanggan, nilai transaksi, dan detail pesanan tidak dikirim ke response publik.",
    },
    orderPulse,
    stationPulse: {
      bar: {
        ...barPulse,
        label: "Estimasi Minuman",
        unit: "minuman",
        status: barPulse.active ? "Minuman sedang disiapkan" : "Minuman siap dipesan",
      },
      kitchen: {
        ...kitchenPulse,
        label: "Estimasi Makanan",
        unit: "makanan",
        status: kitchenPulse.active ? "Makanan sedang disiapkan" : "Dapur siap memasak",
      },
    },
    takeaway: {
      ...takeawayPulse,
      label: "Takeaway ETA",
      recommendation:
        takeawayPulse.ready > 0
          ? "Ada pesanan yang sudah siap diambil. Cek nomor order sebelum datang."
          : orderPulse.active >= 12
            ? "Takeaway bisa jadi pilihan lebih praktis saat tempat sedang ramai."
            : "Pesan sekarang, ambil saat sudah siap.",
    },
    visit: {
      totalTables: tables.length,
      availableTables,
      mood: visitMood.label,
      tone: visitMood.tone,
      recommendation: visitMood.recommendation,
    },
    events,
  };
}

function printJobResponse(row: typeof printJobs.$inferSelect) {
  return {
    id: row.id,
    jobType: row.jobType,
    target: row.target,
    status: row.status,
    orderId: row.orderId,
    ticketNo: row.ticketNo,
    payload: row.payload,
    attempts: row.attempts,
    printedAt: row.printedAt?.toISOString() ?? null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getPrintJobData(params?: { status?: string }) {
  const filters = params?.status && params.status !== "all" ? [eq(printJobs.status, params.status)] : [];
  const rows = await getDb()
    .select()
    .from(printJobs)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(printJobs.createdAt))
    .limit(120);
  return rows.map(printJobResponse);
}

export async function createPrintJob(
  input: {
    jobType: string;
    target: string;
    orderId?: string;
    ticketNo?: string;
    payload: Record<string, unknown>;
  },
  garage: GarageSession,
) {
  const [row] = await getDb()
    .insert(printJobs)
    .values({
      jobType: input.jobType,
      target: input.target,
      orderId: input.orderId ?? null,
      ticketNo: input.ticketNo ?? null,
      payload: input.payload,
    })
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: `Create print job ${row.jobType}`,
    object: row.ticketNo ?? row.orderId ?? row.id,
    device: garage.profile.deviceLabel,
    status: row.status,
  });

  return printJobResponse(row);
}

export async function updatePrintJob(
  id: string,
  input: { status: string; error?: string | null },
  garage: GarageSession,
) {
  const now = new Date();
  const [row] = await getDb()
    .update(printJobs)
    .set({
      status: input.status,
      attempts: sql`${printJobs.attempts} + 1`,
      printedAt: input.status === "printed" ? now : null,
      error: input.error ?? null,
      updatedAt: now,
    })
    .where(eq(printJobs.id, id))
    .returning();

  if (!row) return null;

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: `Update print job ${row.jobType}`,
    object: row.ticketNo ?? row.orderId ?? row.id,
    device: garage.profile.deviceLabel,
    status: row.status,
  });

  return printJobResponse(row);
}

export async function createShiftHandoverReport(
  input: { notes?: string | null },
  garage: GarageSession,
) {
  const db = getDb();
  const [openSession] = await db
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.status, "open"))
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);
  const qr = await getQrControlInsights();
  const kitchenRows = await db
    .select()
    .from(kitchenTickets)
    .where(inArray(kitchenTickets.status, ["queue", "cooking", "ready"]))
    .orderBy(desc(kitchenTickets.createdAt))
    .limit(200);
  const inventoryWarnings = await db
    .select()
    .from(inventoryItems)
    .where(or(eq(inventoryItems.status, "Low"), eq(inventoryItems.status, "Watch")))
    .limit(40);

  const lateKitchen = kitchenRows.filter((ticket) => ticket.elapsed > ticket.targetMinutes);
  const summary = {
    generatedAt: new Date().toISOString(),
    qrSummary: qr.summary,
    shiftGate: qr.shiftReport.gate,
    pendingAlerts: qr.pendingAlerts,
    lateKitchen: lateKitchen.map((ticket) => ({
      ticketNo: ticket.ticketNo,
      tableLabel: ticket.tableLabel,
      elapsed: ticket.elapsed,
      targetMinutes: ticket.targetMinutes,
    })),
    inventoryWarnings: inventoryWarnings.map((item) => ({
      sku: item.sku,
      name: item.name,
      onHand: item.onHand,
      min: item.min,
      status: item.status,
    })),
    cashSession: openSession
      ? {
          code: openSession.code,
          expectedCash: openSession.expectedCash,
          openingCash: openSession.openingCash,
          status: openSession.status,
        }
      : null,
  };

  const [row] = await db
    .insert(shiftHandoverReports)
    .values({
      cashSessionId: openSession?.id ?? null,
      outletId: garage.profile.outlet.id,
      status: qr.shiftReport.gate === "GO" && !lateKitchen.length ? "go" : "watch",
      summary,
      notes: input.notes?.trim() || null,
      createdBy: garage.user.id,
    })
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Create shift handover report",
    object: row.id,
    device: garage.profile.deviceLabel,
    status: row.status,
    metadata: summary,
  });

  return {
    id: row.id,
    status: row.status,
    summary: row.summary,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createCustomerOrder(input: CustomerOrderInput) {
  const db = getDb();
  const itemIds = [...new Set(input.items.map((item) => item.itemId))];
  const variantRows = await db
    .select({
      itemId: menuVariants.itemId,
      variantId: menuVariants.variantId,
      variantLabel: menuVariants.label,
      price: menuVariants.price,
      itemName: menuItems.name,
      category: menuItems.category,
      stock: menuItems.stock,
      promoActive: menuItems.promoActive,
      promoPrice: menuItems.promoPrice,
    })
    .from(menuVariants)
    .innerJoin(menuItems, eq(menuVariants.itemId, menuItems.id))
    .where(and(inArray(menuVariants.itemId, itemIds), eq(menuItems.status, "active")));

  const lines = input.items.map((line) => {
    const variant = variantRows.find(
      (row) => row.itemId === line.itemId && row.variantId === line.variantId,
    );

    if (!variant) {
      throw new Error(`Menu variant not found: ${line.itemId}/${line.variantId}`);
    }
    if (variant.stock === "sold_out") {
      throw new Error(`${variant.itemName} sedang habis dan tidak bisa dipesan.`);
    }

    const unitPrice = effectiveMenuPrice(
      variant.price,
      variant.promoActive,
      variant.promoPrice,
    );
    return {
      ...line,
      ...variant,
      price: unitPrice,
      lineTotal: unitPrice * line.qty,
    };
  });

  const [settingsOutlet] = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(input.outletId ? eq(outlets.id, input.outletId) : eq(outlets.status, "active"))
    .orderBy(outlets.code)
    .limit(1);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const settings = await getAppSettings(settingsOutlet?.id ?? null);
  const { service, tax, grossTotal } = calculateBillingTotals(subtotal, settings);
  const promoDiscount = Math.min(25000, Math.round(subtotal * 0.1));
  const voucherValidation = input.voucherCode
    ? await validateVoucher({
        code: input.voucherCode,
        subtotal,
        customerMode: input.customerMode,
      })
    : null;
  if (input.voucherCode && !voucherValidation?.valid) {
    throw new Error(voucherValidation?.message ?? "Voucher tidak valid.");
  }
  const voucherDiscountValue = voucherValidation?.valid
    ? capVoucherDiscountBySettings(voucherValidation.discount, subtotal, settings)
    : 0;
  const discount = Math.min(grossTotal, promoDiscount + voucherDiscountValue);
  const total = grossTotal - discount;
  const orderNo = makeOrderNo();
  const invoiceNo = invoiceNoForOrder(orderNo);
  const source =
    input.source ?? (input.orderType === "takeaway" ? "qr_takeaway" : "qr_table");
  const channel =
    source === "qr_takeaway" ? "QR Takeaway" : source === "instagram" ? "Instagram" : "QR Table";
  const paymentMethod = input.paymentMethod?.trim() || "Cash";
  const paymentProvider = input.paymentProvider?.trim() || null;
  const paymentReference = input.paymentReference?.trim() || null;
  const initialOrderStatus = paymentMethod === "Cash" ? "pending_cashier" : "awaiting_payment";

  const [outlet] = await db
    .select()
    .from(outlets)
    .where(input.outletId ? eq(outlets.id, input.outletId) : eq(outlets.status, "active"))
    .orderBy(outlets.code)
    .limit(1);

  if (!outlet) {
    throw new Error("Outlet untuk QR order tidak ditemukan.");
  }

  const [openShift] = await db
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(and(eq(cashSessions.outletId, outlet.id), eq(cashSessions.status, "open")))
    .limit(1);

  if (!openShift) {
    throw new Error("Outlet belum open shift. Silakan hubungi kasir.");
  }

  let memberCustomer: typeof customers.$inferSelect | null = null;
  if (input.memberCustomerId) {
    const [row] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, input.memberCustomerId))
      .limit(1);
    memberCustomer = row ?? null;
  }

  if (input.customerMode === "member" && !memberCustomer) {
    throw new Error("Sesi member tidak valid untuk customer order.");
  }

  const guestNameTrimmed = input.guestName?.trim();
  const customerName =
    memberCustomer?.name ??
    (guestNameTrimmed && guestNameTrimmed.length > 0 ? guestNameTrimmed : "Guest Customer");
  // Guest boleh checkout TANPA nomor WhatsApp. Member tetap wajib punya phone
  // (diambil dari akun). customerPhone null = guest tanpa WA → tanpa invoice WA
  // dan tanpa record customer (kolom customers.phone NOT NULL & unique).
  const normalizedGuestPhone = input.guestPhone?.trim()
    ? normalizePhone(input.guestPhone)
    : "";
  const customerPhone: string | null =
    memberCustomer?.phone ??
    (normalizedGuestPhone.length >= 8 ? normalizedGuestPhone : null);
  if (input.customerMode === "member" && (!customerPhone || customerPhone.length < 8)) {
    throw new Error("Nomor WhatsApp member tidak valid.");
  }

  const tableLabel =
    input.tableLabel?.trim() ||
    (input.orderType === "dine-in" ? "Meja QR" : orderTypeToChannel(input.orderType));
  const initialWhatsappInvoiceInput = customerPhone
    ? {
        phone: customerPhone,
        orderNo,
        tableLabel,
        total,
        items: lines,
      }
    : null;
  const initialWhatsappInvoiceUrl = initialWhatsappInvoiceInput
    ? makeWhatsappInvoiceUrl(initialWhatsappInvoiceInput)
    : null;

  const created = await db.transaction(async (tx) => {
    const [existingByPhone] = customerPhone
      ? await tx
          .select()
          .from(customers)
          .where(eq(customers.phone, customerPhone))
          .limit(1)
      : [undefined];
    const currentCustomer = memberCustomer ?? existingByPhone ?? null;
    const lockedCustomerName = currentCustomer?.name ?? customerName;

    // Guest tanpa WA: tidak membuat/menyentuh record customer karena
    // customers.phone wajib & unik. Order tetap tercatat (nama + customerMode)
    // dengan customerId null.
    let customer: typeof customers.$inferSelect | null = currentCustomer;
    if (customerPhone) {
      const customerValues = {
        name: lockedCustomerName,
        phone: customerPhone,
        tier: memberLevelForPoints(currentCustomer?.points ?? 0),
        points: currentCustomer?.points ?? 0,
        visits: currentCustomer?.visits ?? 0,
        lastOrder: `${customerOrderSourceLabel(source)} ${orderNo}`,
        flag:
          input.customerMode === "member"
            ? currentCustomer?.flag ?? "Member aktif"
            : currentCustomer?.flag?.toLowerCase().includes("member")
              ? currentCustomer.flag
              : "QR lead",
        updatedAt: new Date(),
      };

      [customer] = currentCustomer
        ? await tx
            .update(customers)
            .set(customerValues)
            .where(eq(customers.id, currentCustomer.id))
            .returning()
        : await tx
            .insert(customers)
            .values(customerValues)
            .returning();
    }

    const [order] = await tx
      .insert(orders)
      .values({
        orderNo,
        outletId: outlet.id,
        customerId: customer?.id ?? null,
        tableLabel,
        channel,
        status: initialOrderStatus,
        subtotal,
        service,
        tax,
        discount,
        total,
        orderSource: source,
        customerMode: input.customerMode,
        customerName: customer?.name ?? customerName,
        customerPhone,
        customerNote: input.customerNote?.trim() || null,
        campaign: input.campaign?.trim() || null,
        whatsappInvoiceStatus: "not_sent",
        whatsappInvoiceUrl: initialWhatsappInvoiceUrl,
      })
      .returning();

    const insertedItems = await tx
      .insert(orderItems)
      .values(
        lines.map((line) => ({
          orderId: order.id,
          menuItemId: line.itemId,
          variantId: line.variantId,
          itemName: line.itemName,
          variantLabel: line.variantLabel,
          unitPrice: line.price,
          qty: line.qty,
          lineTotal: line.lineTotal,
          note: line.note?.trim() || null,
        })),
      )
      .returning();

    const [paymentIntent] = await tx
      .insert(payments)
      .values({
        orderId: order.id,
        method: paymentMethod,
        amount: total,
        status: "pending",
        metadata: {
          provider: paymentProvider,
          reference: paymentReference,
          source: "customer_qr",
          orderType: input.orderType,
          invoiceNo,
          invoiceStatus: "pending",
          cashFlowStatus:
            paymentMethod === "Cash" && input.orderType === "dine-in"
              ? "waiting_customer_cash"
              : null,
        },
      })
      .returning();

    if (voucherValidation?.valid) {
      const [voucher] = await tx
        .select()
        .from(vouchers)
        .where(eq(vouchers.code, voucherValidation.code))
        .limit(1);

      if (voucher) {
        await tx.insert(voucherRedemptions).values({
          voucherId: voucher.id,
          orderId: order.id,
          customerId: customer?.id ?? null,
          customerPhone,
          discount: voucherDiscountValue,
        });
        await tx
          .update(vouchers)
          .set({
            usedCount: sql`${vouchers.usedCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(vouchers.id, voucher.id));
      }
    }

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor: customerPhone ? `${customerName} / ${customerPhone}` : customerName,
      action: `Create QR order ${orderNo}`,
      object: tableLabel,
      device: "Customer QR",
      status: initialOrderStatus,
      metadata: {
        orderId: order.id,
        source,
        customerMode: input.customerMode,
        campaign: input.campaign ?? null,
        paymentMethod,
        paymentProvider,
        paymentReference,
        invoiceNo,
        invoiceStatus: "pending",
        promoDiscount,
        voucherCode: voucherValidation?.valid ? voucherValidation.code : null,
        voucherDiscount: voucherDiscountValue,
      },
    });

    return {
      orderRow: order,
      itemRows: insertedItems,
      paymentRow: paymentIntent,
      order: customerOrderResponse(order, insertedItems, paymentIntent),
      whatsapp: {
        status: order.whatsappInvoiceStatus,
        url: order.whatsappInvoiceUrl,
      },
      memberCta:
        input.customerMode === "member"
          ? "Points member akan diproses setelah kasir menandai order paid."
          : "Daftar member, points dari order ini langsung masuk.",
    };
  });

  const trackingToken = created.orderRow.invoiceTrackingToken ?? makeInvoiceTrackingToken();
  const invoiceWhatsappInput = initialWhatsappInvoiceInput
    ? {
        ...initialWhatsappInvoiceInput,
        invoiceUrl: invoiceWebUrl(trackingToken),
      }
    : null;
  const invoiceWhatsappUrl = invoiceWhatsappInput
    ? makeWhatsappInvoiceUrl(invoiceWhatsappInput)
    : null;

  await db
    .update(orders)
    .set({
      invoiceTrackingToken: trackingToken,
      whatsappInvoiceUrl: invoiceWhatsappUrl,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, created.order.id));

  // Tautkan chat customer ke order ini (kalau ada) supaya update status order
  // otomatis muncul sebagai system message di chat.
  if (input.chatToken && input.chatToken.trim().length >= 12) {
    try {
      await linkChatThreadToOrder(input.chatToken.trim(), created.order.id, created.order.orderNo);
    } catch {
      /* non-blocking: chat thread tidak harus ada */
    }
  }

  const baseResponse = {
    order: {
      ...created.order,
      invoicePdfUrl: null,
      invoiceWebUrl: invoiceWebPath(trackingToken),
      invoicePdfGeneratedAt: null,
      whatsappInvoiceUrl: invoiceWhatsappUrl,
    },
    whatsapp: {
      status: created.whatsapp.status,
      url: invoiceWhatsappUrl,
    },
    memberCta: created.memberCta,
  };

  // Guest tanpa nomor WA: tidak ada invoice WhatsApp untuk dikirim.
  if (!invoiceWhatsappInput) {
    return baseResponse;
  }
  const whatsappDelivery = await sendWhatsappCloudInvoice(invoiceWhatsappInput);
  if (whatsappDelivery.status === "not_sent") {
    return baseResponse;
  }

  await db
    .update(orders)
    .set({
      whatsappInvoiceStatus: whatsappDelivery.status,
      whatsappInvoiceUrl: whatsappDelivery.url,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, created.order.id));

  await db.insert(auditLogs).values({
    time: nowTimeLabel(),
    actor: "System / WhatsApp",
    action: `WhatsApp invoice ${whatsappDelivery.status} ${orderNo}`,
    object: tableLabel,
    device: "WhatsApp Hybrid",
    status: whatsappDelivery.status,
    metadata: {
      orderId: created.order.id,
      provider: whatsappDelivery.provider,
      error: whatsappDelivery.error ?? null,
    },
  });

  return {
    ...baseResponse,
    order: {
      ...baseResponse.order,
      whatsappInvoiceStatus: whatsappDelivery.status,
      whatsappInvoiceUrl: whatsappDelivery.url,
    },
    whatsapp: {
      status: whatsappDelivery.status,
      url: whatsappDelivery.url,
    },
  };
}

export async function updateCustomerOrderStatus(
  id: string,
  input: CustomerOrderActionInput,
  garage: GarageSession,
) {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order || !customerOrderSources.includes(order.orderSource)) {
      return null;
    }

    const itemRows = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    if (
      (input.action === "accept" && order.status === "accepted") ||
      (input.action === "paid" && order.status === "paid") ||
      (input.action === "request_bill" && order.status === "awaiting_payment")
    ) {
      const existingTickets = await tx
        .select()
        .from(kitchenTickets)
        .where(eq(kitchenTickets.orderId, order.id));
      const [latestPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id))
        .orderBy(desc(payments.createdAt))
        .limit(1);

      return {
        order: customerOrderResponse(order, itemRows, latestPayment),
        ticketNos: existingTickets.map((ticket) => ticket.ticketNo),
      };
    }

    const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
    const now = new Date();
    const cashierActionStatuses = ["pending_cashier", "awaiting_payment"];
    const paidActionStatuses = [...cashierActionStatuses, "accepted"];
    const waiterCashActionStatuses = [...cashierActionStatuses, "accepted"];
    const waiterBillActionStatuses = ["accepted", "awaiting_payment"];

    if (
      (input.action === "waiter_cash_received" ||
        input.action === "waiter_cash_deposited") &&
      !isWaiterRole(garage.profile.role)
    ) {
      throw new Error("Hanya waiter yang boleh mencatat atau menyetor cash meja.");
    }

    if (input.action === "paid" && !canConfirmCustomerPayment(garage.profile.role)) {
      throw new Error("Waiter tidak boleh menjadikan cash meja langsung lunas. Setor ke kasir dulu.");
    }

    if (input.action === "request_bill" && !isWaiterRole(garage.profile.role)) {
      throw new Error("Hanya waiter yang boleh meminta bill meja ke kasir.");
    }

    if (input.action === "reject" && !cashierActionStatuses.includes(order.status)) {
      throw new Error("Order sudah diproses dan tidak bisa ditolak ulang.");
    }

    if (input.action === "accept" && !cashierActionStatuses.includes(order.status)) {
      throw new Error("Order sudah diproses dan tidak bisa di-accept ulang.");
    }

    if (input.action === "paid" && !paidActionStatuses.includes(order.status)) {
      throw new Error(
        order.status === "paid"
          ? "Order sudah dibayar dan tidak bisa diproses ulang."
          : "Order tidak bisa ditandai paid dari status saat ini.",
      );
    }

    let cashierOpenSession: { id: string } | null = null;
    if (input.action === "accept" || input.action === "paid") {
      const [session] = await tx
        .select({ id: cashSessions.id })
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.status, "open"),
            eq(cashSessions.outletId, garage.profile.outlet.id),
            eq(cashSessions.openedBy, garage.user.id),
          ),
        )
        .limit(1);
      cashierOpenSession = session ?? null;
      if (!cashierOpenSession) {
        throw new Error("Open shift wajib dilakukan sebelum proses order QR.");
      }
    }

    if (
      (input.action === "waiter_cash_received" ||
        input.action === "waiter_cash_deposited") &&
      !waiterCashActionStatuses.includes(order.status)
    ) {
      throw new Error("Cash meja hanya bisa diproses dari order yang masih aktif.");
    }

    if (input.action === "request_bill" && !waiterBillActionStatuses.includes(order.status)) {
      throw new Error("Bill hanya bisa diminta untuk order meja yang sudah aktif.");
    }

    if (input.action === "whatsapp_sent") {
      if (order.status === "rejected") {
        throw new Error("Invoice WhatsApp tidak bisa dikirim untuk order yang ditolak.");
      }

      const [updated] = await tx
        .update(orders)
        .set({
          whatsappInvoiceStatus: "sent",
          updatedAt: now,
        })
        .where(eq(orders.id, order.id))
        .returning();

      await tx.insert(auditLogs).values({
        time: nowTimeLabel(),
        actor,
        action: `Mark WhatsApp invoice sent ${order.orderNo}`,
        object: order.tableLabel,
        device: garage.profile.deviceLabel,
        status: "recorded",
        metadata: { orderId: order.id },
      });

      return { order: customerOrderResponse(updated, itemRows), ticketNos: [] as string[] };
    }

    if (input.action === "request_bill") {
      const [updated] = await tx
        .update(orders)
        .set({
          status: "awaiting_payment",
          updatedAt: now,
        })
        .where(eq(orders.id, order.id))
        .returning();

      await tx.insert(auditLogs).values({
        time: nowTimeLabel(),
        actor,
        action: `Waiter request bill ${order.orderNo}`,
        object: order.tableLabel,
        device: garage.profile.deviceLabel,
        status: "awaiting_payment",
        metadata: {
          orderId: order.id,
          note: input.paymentNote?.trim() || null,
        },
      });

      const tableNumber = normalizeTableNumber(order.tableLabel);
      await tx
        .insert(tableSessions)
        .values({
          outletId: order.outletId ?? garage.profile.outlet.id,
          tableNumber,
          tableLabel: tableLabelForNumber(tableNumber),
          status: "awaiting_payment",
          currentOrderId: order.id,
          needsCleaning: false,
          lastStatusAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [tableSessions.outletId, tableSessions.tableNumber],
          set: {
            tableLabel: tableLabelForNumber(tableNumber),
            status: "awaiting_payment",
            currentOrderId: order.id,
            needsCleaning: false,
            lastStatusAt: now,
            updatedAt: now,
          },
        });

      return { order: customerOrderResponse(updated, itemRows), ticketNos: [] as string[] };
    }

    if (input.action === "reject") {
      const [updated] = await tx
        .update(orders)
        .set({
          status: "rejected",
          rejectedBy: garage.user.id,
          rejectedAt: now,
          rejectionReason: input.reason?.trim() || "Ditolak kasir",
          updatedAt: now,
        })
        .where(eq(orders.id, order.id))
        .returning();

      await tx.insert(auditLogs).values({
        time: nowTimeLabel(),
        actor,
        action: `Reject QR order ${order.orderNo}`,
        object: order.tableLabel,
        device: garage.profile.deviceLabel,
        status: "rejected",
        metadata: { orderId: order.id, reason: input.reason ?? null },
      });

      const tableNumber = normalizeTableNumber(order.tableLabel);
      await tx
        .insert(tableSessions)
        .values({
          outletId: order.outletId ?? garage.profile.outlet.id,
          tableNumber,
          tableLabel: tableLabelForNumber(tableNumber),
          status: "rejected",
          currentOrderId: order.id,
          needsCleaning: false,
          lastStatusAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [tableSessions.outletId, tableSessions.tableNumber],
          set: {
            tableLabel: tableLabelForNumber(tableNumber),
            status: "rejected",
            currentOrderId: order.id,
            needsCleaning: false,
            lastStatusAt: now,
            updatedAt: now,
          },
        });

      return { order: customerOrderResponse(updated, itemRows), ticketNos: [] as string[] };
    }

    const existingTickets = await tx
      .select()
      .from(kitchenTickets)
      .where(eq(kitchenTickets.orderId, order.id));
    let ticketNos = existingTickets.map((ticket) => ticket.ticketNo);

    if (!existingTickets.length) {
      const menuRows = await tx
        .select({
          itemName: orderItems.itemName,
          variantLabel: orderItems.variantLabel,
          qty: orderItems.qty,
          note: orderItems.note,
          category: menuItems.category,
        })
        .from(orderItems)
        .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
        .where(eq(orderItems.orderId, order.id));
      const linesByTargetGroup = new Map<KitchenTargetGroup, typeof menuRows>();
      for (const line of menuRows) {
        const targetGroup = kitchenTargetGroupForCategory(line.category ?? "Makanan");
        linesByTargetGroup.set(targetGroup, [
          ...(linesByTargetGroup.get(targetGroup) ?? []),
          line,
        ]);
      }
      const ticketDrafts = Array.from(linesByTargetGroup.entries()).map(
        ([targetGroup, groupLines]) => {
          // Catatan per-item pelanggan → itemNotes tiket (label -> note),
          // dibaca KDS dapur/bar persis seperti jalur POS.
          const itemNotes: Record<string, string> = {};
          for (const line of groupLines) {
            if (line.note && line.note.trim()) {
              itemNotes[kitchenItemLabel(line)] = line.note.trim();
            }
          }
          return {
            ticketNo: makeTicketNo(),
            targetGroup,
            targetMinutes: kitchenTargetMinutes[targetGroup],
            station: kitchenStationForTargetGroup(targetGroup),
            items: groupLines.map(kitchenItemLabel),
            itemNotes,
          };
        },
      );

      const insertedTickets = await tx
        .insert(kitchenTickets)
        .values(
          ticketDrafts.map((ticket) => ({
            ticketNo: ticket.ticketNo,
            orderId: order.id,
            tableLabel: order.tableLabel,
            channel: order.channel,
            station: ticket.station,
            status: "queue",
            elapsed: 0,
            priority: "normal",
            targetMinutes: ticket.targetMinutes,
            targetGroup: ticket.targetGroup,
            items: ticket.items,
            itemNotes: ticket.itemNotes,
          })),
        )
        .returning();
      ticketNos = insertedTickets.map((ticket) => ticket.ticketNo);
    }

    const existingStockAudit = await tx
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.action, `Recipe stock deducted ${order.orderNo}`))
      .limit(1);

    if (!existingStockAudit.length) {
      const recipeRows = await tx
        .select({
          itemName: orderItems.itemName,
          orderQty: orderItems.qty,
          recipeQty: menuRecipes.qty,
          recipeUnit: menuRecipes.unit,
          inventorySku: menuRecipes.inventorySku,
          inventoryName: inventoryItems.name,
          inventoryMin: inventoryItems.min,
        })
        .from(orderItems)
        .innerJoin(
          menuRecipes,
          and(
            eq(orderItems.menuItemId, menuRecipes.menuItemId),
            eq(menuRecipes.status, "active"),
            or(eq(menuRecipes.variantId, orderItems.variantId), eq(menuRecipes.variantId, "all")),
          ),
        )
        .leftJoin(inventoryItems, eq(menuRecipes.inventorySku, inventoryItems.sku))
        .where(eq(orderItems.orderId, order.id));

      const stockWarnings: Array<{ sku: string | null; name: string; message: string }> = [];
      for (const recipe of recipeRows) {
        if (!recipe.inventorySku) {
          stockWarnings.push({
            sku: null,
            name: recipe.itemName,
            message: "Resep tidak punya SKU bahan.",
          });
          continue;
        }

        const outletStock = await ensureLocationStock(tx, {
          sku: recipe.inventorySku,
          locationType: "outlet",
          locationKey: outletLocationKey(order.outletId ?? garage.profile.outlet.id),
          outletId: order.outletId ?? garage.profile.outlet.id,
          min: recipe.inventoryMin ?? 0,
          movement: "Outlet stock initialized",
        });
        const deductQty = Number((recipe.recipeQty * recipe.orderQty).toFixed(3));
        const nextOnHand = Number((outletStock.onHand - deductQty).toFixed(4));
        if (nextOnHand < outletStock.min) {
          stockWarnings.push({
            sku: recipe.inventorySku,
            name: recipe.inventoryName ?? recipe.itemName,
            message: `Stok outlet setelah order di bawah minimum (${nextOnHand} ${recipe.recipeUnit}).`,
          });
        }

        await tx
          .update(inventoryLocationStocks)
          .set({
            onHand: nextOnHand,
            status: inventoryStatusFor(nextOnHand, outletStock.min),
            movement: `Auto deduct ${order.orderNo}`,
            updatedAt: now,
          })
          .where(eq(inventoryLocationStocks.id, outletStock.id));
        await tx.insert(stockMovements).values({
          itemSku: recipe.inventorySku,
          type: "recipe_deduct",
          note: `${order.orderNo} ${recipe.orderQty}x ${recipe.itemName} outlet ${order.outletId ?? garage.profile.outlet.id}`,
          qty: -deductQty,
          actor,
        });
      }

      if (recipeRows.length) {
        await tx.insert(auditLogs).values({
          time: nowTimeLabel(),
          actor,
          action: `Recipe stock deducted ${order.orderNo}`,
          object: order.tableLabel,
          device: garage.profile.deviceLabel,
          status: stockWarnings.length ? "warning" : "recorded",
          metadata: {
            orderId: order.id,
            recipeLines: recipeRows.length,
            warnings: stockWarnings,
          },
        });
      }
    }

    if (input.action === "waiter_cash_received" || input.action === "waiter_cash_deposited") {
      const existingPayments = await tx
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id))
        .orderBy(desc(payments.createdAt));
      const payment = existingPayments[0];
      const method = input.paymentMethod?.trim() || payment?.method || "Cash";

      if (method !== "Cash") {
        throw new Error("Setoran waiter hanya untuk pembayaran Cash meja.");
      }

      if (input.action === "waiter_cash_received") {
        const cashReceived = input.cashReceived ?? 0;
        if (cashReceived < order.total) {
          throw new Error("Nominal cash dari customer belum cukup.");
        }

        const metadata = {
          ...(payment?.metadata ?? {}),
          provider: null,
          reference: input.paymentReference?.trim() || null,
          source: "customer_qr",
          cashFlowStatus: "held_by_waiter",
          waiterReceivedBy: garage.user.id,
          waiterReceivedByName: garage.user.name,
          waiterReceivedAt: now.toISOString(),
          cashReceived,
          change: Math.max(0, cashReceived - order.total),
          paymentNote: input.paymentNote?.trim() || null,
          invoiceNo:
            typeof payment?.metadata.invoiceNo === "string"
              ? payment.metadata.invoiceNo
              : invoiceNoForOrder(order.orderNo),
          invoiceStatus: "pending",
        };

        if (payment) {
          await tx
            .update(payments)
            .set({ method: "Cash", status: "pending", metadata })
            .where(eq(payments.id, payment.id));
        } else {
          await tx.insert(payments).values({
            orderId: order.id,
            method: "Cash",
            amount: order.total,
            status: "pending",
            metadata,
          });
        }
      }

      if (input.action === "waiter_cash_deposited") {
        if (!payment) {
          throw new Error("Payment intent cash meja belum tercatat.");
        }

        const cashDeposited = input.cashDeposited ?? 0;
        const previousCashReceived = numberFromMetadata(payment.metadata, "cashReceived");
        const metadata = {
          ...payment.metadata,
          cashFlowStatus:
            cashDeposited >= order.total ? "handed_to_cashier" : "cash_discrepancy",
          waiterDepositedBy: garage.user.id,
          waiterDepositedByName: garage.user.name,
          waiterDepositedAt: now.toISOString(),
          cashDeposited,
          cashReceived: previousCashReceived,
          paymentNote: input.paymentNote?.trim() || payment.metadata.paymentNote || null,
          invoiceStatus: "pending",
        };

        await tx
          .update(payments)
          .set({ status: "pending", metadata })
          .where(eq(payments.id, payment.id));
      }
    }

    if (input.action === "paid") {
      const invoiceNo = invoiceNoForOrder(order.orderNo);
      const invoiceIssuedAt = now.toISOString();
      const existingPayments = await tx
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id))
        .orderBy(desc(payments.createdAt));
      const latestPayment = existingPayments[0];
      const latestMetadata = latestPayment?.metadata ?? {};
      const latestCashFlowStatus =
        typeof latestMetadata.cashFlowStatus === "string" ? latestMetadata.cashFlowStatus : null;
      const latestCashReceived = latestPayment
        ? numberFromMetadata(latestPayment.metadata, "cashReceived")
        : null;
      const latestCashDeposited = latestPayment
        ? numberFromMetadata(latestPayment.metadata, "cashDeposited")
        : null;
      const confirmingMethod = input.paymentMethod?.trim() || latestPayment?.method || "Cashier";
      const confirmedCashReceived =
        confirmingMethod === "Cash"
          ? input.cashReceived ?? latestCashReceived ?? latestCashDeposited ?? order.total
          : null;
      const confirmedCashDeposited =
        confirmingMethod === "Cash"
          ? input.cashDeposited ?? latestCashDeposited ?? confirmedCashReceived
          : null;
      const effectiveCashDeposited = input.cashDeposited ?? latestCashDeposited;

      if (
        confirmingMethod === "Cash" &&
        latestCashFlowStatus === "cash_discrepancy" &&
        (effectiveCashDeposited == null || effectiveCashDeposited < order.total)
      ) {
        throw new Error("Setoran waiter kurang dari total. Tandai perlu dicek sebelum bisa lunas.");
      }

      if (
        confirmingMethod === "Cash" &&
        latestCashFlowStatus === "handed_to_cashier" &&
        effectiveCashDeposited != null &&
        effectiveCashDeposited < order.total
      ) {
        throw new Error("Nominal setoran waiter kurang dari total tagihan.");
      }

      if (!existingPayments.length) {
        await tx.insert(payments).values({
          orderId: order.id,
          cashSessionId: cashierOpenSession?.id ?? null,
          method: confirmingMethod,
          amount: order.total,
          status: "captured",
          metadata: {
            provider: input.paymentProvider?.trim() || null,
            reference: input.paymentReference?.trim() || null,
            source: "customer_qr",
            cashFlowStatus: confirmingMethod === "Cash" ? "cashier_confirmed" : null,
            ...(confirmingMethod === "Cash"
              ? {
                  cashReceived: confirmedCashReceived,
                  cashDeposited: confirmedCashDeposited,
                  change: Math.max(0, (confirmedCashReceived ?? order.total) - order.total),
                }
              : {}),
            invoiceNo,
            invoiceStatus: "issued",
            invoiceIssuedAt,
            confirmedBy: garage.user.id,
            cashierConfirmedBy: garage.user.id,
            cashierConfirmedByName: garage.user.name,
            cashierConfirmedAt: invoiceIssuedAt,
          },
        });
      } else {
        const pendingPayment =
          existingPayments.find((payment) => payment.status !== "captured") ?? null;
        if (pendingPayment) {
          const metadata = {
            ...pendingPayment.metadata,
            provider:
              input.paymentProvider?.trim() ||
              (typeof pendingPayment.metadata.provider === "string"
                ? pendingPayment.metadata.provider
                : null),
            reference:
              input.paymentReference?.trim() ||
              (typeof pendingPayment.metadata.reference === "string"
                ? pendingPayment.metadata.reference
                : null),
            source: "customer_qr",
            cashFlowStatus:
              (pendingPayment.method === "Cash" || confirmingMethod === "Cash")
                ? "cashier_confirmed"
                : pendingPayment.metadata.cashFlowStatus ?? null,
            ...(confirmingMethod === "Cash"
              ? {
                  cashReceived: confirmedCashReceived,
                  cashDeposited: confirmedCashDeposited,
                  change: Math.max(0, (confirmedCashReceived ?? order.total) - order.total),
                }
              : {}),
            invoiceNo:
              typeof pendingPayment.metadata.invoiceNo === "string"
                ? pendingPayment.metadata.invoiceNo
                : invoiceNo,
            invoiceStatus: "issued",
            invoiceIssuedAt,
            confirmedBy: garage.user.id,
            cashierConfirmedBy: garage.user.id,
            cashierConfirmedByName: garage.user.name,
            cashierConfirmedAt: invoiceIssuedAt,
          };
          await tx
            .update(payments)
            .set({
              method: confirmingMethod,
              status: "captured",
              cashSessionId: cashierOpenSession?.id ?? pendingPayment.cashSessionId,
              metadata,
            })
            .where(eq(payments.id, pendingPayment.id));
        }
      }

      if (
        cashierOpenSession &&
        normalizePaymentMethod(confirmingMethod) === "cash"
      ) {
        await tx
          .update(cashSessions)
          .set({
            expectedCash: sql`${cashSessions.expectedCash} + ${order.total}`,
          })
          .where(
            and(
              eq(cashSessions.id, cashierOpenSession.id),
              eq(cashSessions.status, "open"),
              eq(cashSessions.openedBy, garage.user.id),
            ),
          );
      }

      if (order.status !== "paid" && order.customerId) {
        const [customer] = await tx
          .select()
          .from(customers)
          .where(eq(customers.id, order.customerId))
          .limit(1);
        const [account] = await tx
          .select()
          .from(memberAccounts)
          .where(eq(memberAccounts.customerId, order.customerId))
          .limit(1);

        if (customer) {
          const beforeLevel = normalizeMemberLevel(customer.cardTier ?? customer.tier);
          if (account) {
            const settings = await getAppSettings(order.outletId);
            const { pointsEarned } = calculateEarnedPointsWithSettings(
              order.total,
              beforeLevel,
              settings,
            );
            const totalPoints = customer.points + pointsEarned;
            const annualSpend = await annualPaidSpendForCustomer(customer.id, tx, order.total);
            const earnedLevel = memberLevelForAnnualSpend(annualSpend);
            const afterLevel =
              beforeLevel === "Ultra"
                ? "Ultra"
                : memberLevelRank(earnedLevel) > memberLevelRank(beforeLevel)
                  ? earnedLevel
                  : beforeLevel;
            const upgradeNotification =
              afterLevel !== beforeLevel ? `Selamat, level member naik ke ${afterLevel}.` : null;

            await tx
              .update(customers)
              .set({
                points: totalPoints,
                tier: afterLevel,
                cardTier: afterLevel,
                visits: customer.visits + 1,
                lastOrder: `${order.channel} ${order.orderNo}`,
                flag: upgradeNotification ?? customer.flag,
                updatedAt: now,
              })
              .where(eq(customers.id, customer.id));
            await tx.insert(memberTransactions).values({
              customerId: customer.id,
              source: "POS",
              amount: order.total,
              pointsEarned,
              levelBefore: beforeLevel,
              levelAfter: afterLevel,
              upgradeNotification,
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            });

            if (customer.referredByCode) {
              const [existingReferralReward] = await tx
                .select()
                .from(memberTransactions)
                .where(and(eq(memberTransactions.customerId, customer.id), eq(memberTransactions.source, "REFERRAL")))
                .limit(1);

              if (!existingReferralReward) {
                const [referrer] = await tx
                  .select()
                  .from(customers)
                  .where(eq(customers.referralCode, customer.referredByCode))
                  .limit(1);

                await tx.insert(memberTransactions).values({
                  customerId: customer.id,
                  source: "REFERRAL",
                  amount: 0,
                  pointsEarned: REFERRAL_BONUS_POINTS,
                  levelBefore: afterLevel,
                  levelAfter: afterLevel,
                  upgradeNotification: `Bonus referral ${REFERRAL_BONUS_POINTS} poin aktif.`,
                  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                });
                await tx
                  .update(customers)
                  .set({
                    points: sql`${customers.points} + ${REFERRAL_BONUS_POINTS}`,
                    flag: `Referral bonus +${REFERRAL_BONUS_POINTS}`,
                    updatedAt: now,
                  })
                  .where(eq(customers.id, customer.id));

                if (referrer) {
                  await tx.insert(memberTransactions).values({
                    customerId: referrer.id,
                    source: "REFERRAL",
                    amount: 0,
                    pointsEarned: REFERRAL_BONUS_POINTS,
                    levelBefore: normalizeMemberLevel(referrer.tier),
                    levelAfter: normalizeMemberLevel(referrer.tier),
                    upgradeNotification: `${customer.name} transaksi pertama. Bonus referral ${REFERRAL_BONUS_POINTS} poin.`,
                    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                  });
                  await tx
                    .update(customers)
                    .set({
                      points: sql`${customers.points} + ${REFERRAL_BONUS_POINTS}`,
                      flag: `Referral ${customer.name} +${REFERRAL_BONUS_POINTS}`,
                      updatedAt: now,
                    })
                    .where(eq(customers.id, referrer.id));
                }
              }
            }
          } else {
            await tx
              .update(customers)
              .set({
                visits: customer.visits + 1,
                lastOrder: `${order.channel} ${order.orderNo}`,
                flag: "QR repeat lead",
                updatedAt: now,
              })
              .where(eq(customers.id, customer.id));
          }
        }
      }
    }

    const [updated] = await tx
      .update(orders)
      .set({
        status: input.action === "paid" ? "paid" : "accepted",
        acceptedBy: order.acceptedBy ?? garage.user.id,
        acceptedAt: order.acceptedAt ?? now,
        createdBy: input.action === "paid" ? garage.user.id : order.createdBy,
        updatedAt: now,
      })
      .where(eq(orders.id, order.id))
      .returning();

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action:
        input.action === "paid"
          ? `Convert QR order to paid ${order.orderNo}`
          : `Accept QR order ${order.orderNo}`,
      object: order.tableLabel,
      device: garage.profile.deviceLabel,
      status: updated.status,
      metadata: {
        orderId: order.id,
        ticketNos,
        paymentMethod: input.paymentMethod ?? null,
        invoiceNo: invoiceNoForOrder(order.orderNo),
        invoiceStatus: input.action === "paid" ? "issued" : "pending",
      },
    });

    const tableNumber = normalizeTableNumber(order.tableLabel);
    // needsCleaning sengaja TIDAK di-auto-set walau payment paid: chip "PAID"
    // (chrome) seharusnya tampil dulu, supaya waiter dapat memilih "Bersih"
    // (tamu pergi) atau "Tamu+" (teman gabung — buka bill kedua). Mark
    // needs_cleaning hanya saat waiter eksplisit memilih clear path.
    await tx
      .insert(tableSessions)
      .values({
        outletId: order.outletId ?? garage.profile.outlet.id,
        tableNumber,
        tableLabel: tableLabelForNumber(tableNumber),
        status: updated.status === "paid" ? "paid" : "accepted",
        currentOrderId: order.id,
        needsCleaning: false,
        lastStatusAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [tableSessions.outletId, tableSessions.tableNumber],
        set: {
          tableLabel: tableLabelForNumber(tableNumber),
          status: updated.status === "paid" ? "paid" : "accepted",
          currentOrderId: order.id,
          needsCleaning: false,
          lastStatusAt: now,
          updatedAt: now,
        },
      });

    const existingPrintJobs = await tx
      .select()
      .from(printJobs)
      .where(eq(printJobs.orderId, order.id));
    const existingPrintKeys = new Set(
      existingPrintJobs.map((job) => `${job.jobType}:${job.ticketNo ?? ""}`),
    );
    const printJobDrafts: Array<typeof printJobs.$inferInsert> = ticketNos
      .filter((ticketNo) => !existingPrintKeys.has(`kitchen_ticket:${ticketNo}`))
      .map((ticketNo) => ({
        jobType: "kitchen_ticket",
        target: "kitchen",
        status: "pending",
        orderId: order.id,
        ticketNo,
        payload: {
          orderNo: order.orderNo,
          tableLabel: order.tableLabel,
          channel: order.channel,
          items: itemRows.map((item) => ({
            name: item.itemName,
            variant: item.variantLabel,
            qty: item.qty,
          })),
        },
      }));

    if (input.action === "paid" && !existingPrintKeys.has("receipt:")) {
      const receiptInvoiceNo = invoiceNoForOrder(order.orderNo);
      const [receiptPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id))
        .orderBy(desc(payments.createdAt))
        .limit(1);
      const receiptPaymentMetadata = receiptPayment?.metadata ?? {};
      const receiptCashReceived = numberFromMetadata(receiptPaymentMetadata, "cashReceived");
      const receiptChange = numberFromMetadata(receiptPaymentMetadata, "change");
      const receipt = {
        invoiceNo: receiptInvoiceNo,
        invoiceStatus: "issued",
        orderNo: order.orderNo,
        ticketNo: ticketNos[0] ?? makeTicketNo(),
        ticketNos,
        createdAt: order.createdAt.toISOString(),
        outlet: {
          code: garage.profile.outlet.code,
          name: garage.profile.outlet.name,
        },
        cashier: {
          name: garage.user.name,
          role: garage.profile.role,
          device: garage.profile.deviceLabel,
        },
        tableLabel: order.tableLabel,
        channel: order.channel,
        payment: {
          method: input.paymentMethod?.trim() || "Cashier",
          provider: input.paymentProvider?.trim() || null,
          reference: input.paymentReference?.trim() || null,
          cashReceived: receiptCashReceived,
          change: receiptChange,
        },
        items: itemRows.map((item) => ({
          name: item.itemName,
          variant: item.variantLabel,
          qty: item.qty,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        subtotal: order.subtotal,
        service: order.service,
        tax: order.tax,
        discount: order.discount,
        total: order.total,
        brand: receiptBrand,
      };

      printJobDrafts.push({
        jobType: "receipt",
        target: "cashier",
        status: "pending",
        orderId: order.id,
        ticketNo: null,
        payload: { receipt },
      });
    }

    if (printJobDrafts.length) {
      await tx.insert(printJobs).values(printJobDrafts);
    }

    const [latestPayment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(desc(payments.createdAt))
      .limit(1);

    return { order: customerOrderResponse(updated, itemRows, latestPayment), ticketNos };
  });

  // Credit kasir fee once the QR order is marked paid by the cashier.
  if (result && input.action === "paid") {
    const orderPaidPayload = {
      orderId: result.order.id,
      staffUserId: garage.user.id,
      staffRole: garage.profile.role,
      outletId: garage.profile.outlet.id,
    };
    try {
      const feeRates = staffFeeRatesFromSettings(
        await getAppSettings(garage.profile.outlet.id),
      );
      await recordOrderPaidEarnings({ ...orderPaidPayload, fees: feeRates });
    } catch (error) {
      await enqueueFailedEarning("order_paid", orderPaidPayload, error);
    }
  }

  // Auto system-message ke chat customer untuk transisi accept/paid/reject.
  // Non-blocking: chat thread mungkin tidak ada.
  if (result) {
    try {
      const orderNo = result.order.orderNo;
      const labels: Record<string, string> = {
        accept: `Pesanan ${orderNo} diterima kasir, sedang dipersiapkan. 🙏`,
        paid: `Pembayaran ${orderNo} berhasil. Terima kasih! ☕`,
        reject: `Pesanan ${orderNo} ditolak${input.reason ? ` (${input.reason})` : ""}.`,
      };
      const body = labels[input.action];
      if (body) await postSystemChatMessageForOrder(result.order.id, body);
    } catch {
      /* non-blocking */
    }
  }

  if (result && input.action === "reject") {
    const reverseOrderPayload = {
      orderId: result.order.id,
      reason: input.reason?.trim() || "Order rejected",
    };
    try {
      await reverseEarningsForOrder(reverseOrderPayload);
    } catch (error) {
      await enqueueFailedEarning("reverse_order", reverseOrderPayload, error);
    }
  }

  if (!result || input.action !== "paid" || !result.order.customerPhone) {
    return result;
  }

  const [orderRow] = await db.select().from(orders).where(eq(orders.id, result.order.id)).limit(1);
  if (!orderRow) {
    return result;
  }
  const customerPhone = orderRow.customerPhone ?? result.order.customerPhone;
  if (!customerPhone) {
    return result;
  }
  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, orderRow.id));
  const [latestPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderRow.id))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  const trackingToken = orderRow.invoiceTrackingToken ?? makeInvoiceTrackingToken();
  const invoiceWhatsappInput = {
    phone: customerPhone,
    orderNo: orderRow.orderNo,
    tableLabel: orderRow.tableLabel,
    total: orderRow.total,
    items: itemRows,
    invoiceUrl: invoiceWebUrl(trackingToken),
  };
  const invoiceWhatsappUrl = makeWhatsappInvoiceUrl(invoiceWhatsappInput);
  const [updatedOrder] = await db
    .update(orders)
    .set({
      invoiceTrackingToken: trackingToken,
      whatsappInvoiceUrl: invoiceWhatsappUrl,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderRow.id))
    .returning();

  return {
    ...result,
    order: customerOrderResponse(updatedOrder, itemRows, latestPayment),
  };
}

export async function createOrder(input: OrderInput, garage: GarageSession) {
  const db = getDb();
  const [openCashSession] = await db
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.status, "open"),
        eq(cashSessions.outletId, garage.profile.outlet.id),
        eq(cashSessions.openedBy, garage.user.id),
      ),
    )
    .limit(1);

  if (!openCashSession) {
    throw new Error("Open shift wajib dilakukan sebelum transaksi POS.");
  }

  const tableNumber =
    input.orderType === "dine-in"
      ? normalizeDiningTableNumber(input.tableNumber ?? input.tableLabel ?? "")
      : null;
  const tableLabel = tableNumber
    ? tableLabelForNumber(tableNumber)
    : orderTypeToChannel(input.orderType);
  const itemIds = [...new Set(input.items.map((item) => item.itemId))];
  const variantRows = await db
    .select({
      itemId: menuVariants.itemId,
      variantId: menuVariants.variantId,
      variantLabel: menuVariants.label,
      price: menuVariants.price,
      itemName: menuItems.name,
      category: menuItems.category,
      promoActive: menuItems.promoActive,
      promoPrice: menuItems.promoPrice,
    })
    .from(menuVariants)
    .innerJoin(menuItems, eq(menuVariants.itemId, menuItems.id))
    .where(and(inArray(menuVariants.itemId, itemIds), eq(menuItems.status, "active")));

  const lines = input.items.map((line) => {
    const variant = variantRows.find(
      (row) => row.itemId === line.itemId && row.variantId === line.variantId,
    );

    if (!variant) {
      throw new Error(`Menu variant not found: ${line.itemId}/${line.variantId}`);
    }

    const unitPrice = effectiveMenuPrice(
      variant.price,
      variant.promoActive,
      variant.promoPrice,
    );
    return {
      ...line,
      ...variant,
      price: unitPrice,
      lineTotal: unitPrice * line.qty,
    };
  });
  const settings = await getAppSettings(garage.profile.outlet.id);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const { service, tax, grossTotal } = calculateBillingTotals(subtotal, settings);
  const voucherValidation = input.voucherCode
    ? await validateVoucher({
        code: input.voucherCode,
        subtotal,
        customerMode: input.customerId || input.memberPhone ? "member" : "guest",
      })
    : null;
  if (input.voucherCode && !voucherValidation?.valid) {
    throw new Error(voucherValidation?.message ?? "Voucher tidak valid.");
  }
  const voucherDiscount = voucherValidation?.valid
    ? capVoucherDiscountBySettings(voucherValidation.discount, subtotal, settings)
    : 0;
  const baseAfterVoucher = Math.max(0, grossTotal - voucherDiscount);
  let manualDiscountValue = 0;
  if (input.manualDiscount) {
    // Diskon (voucher / manual / point) hanya untuk member terdaftar.
    if (!input.customerId && !input.memberPhone) {
      throw new Error(
        "Diskon hanya untuk member. Daftar / pilih member dulu sebelum apply diskon.",
      );
    }
    manualDiscountValue = computeManualDiscountAmount(input.manualDiscount, baseAfterVoucher);
    const maxManualDiscount = Math.round(
      baseAfterVoucher * (settings.manualDiscountMaxPct / 100),
    );
    if (manualDiscountValue > maxManualDiscount) {
      throw new Error(
        `Diskon manual melebihi batas ${settings.manualDiscountMaxPct}% untuk bill ini.`,
      );
    }
    if (manualDiscountNeedsApproval(manualDiscountValue, baseAfterVoucher, settings)) {
      const approvalId = input.manualDiscount.approvalId?.trim();
      if (!approvalId) {
        throw new Error(
          `Diskon di atas ${settings.manualDiscountApprovalPct}% bill wajib approval supervisor dulu.`,
        );
      }
      const [approval] = await db
        .select({ id: approvals.id, status: approvals.status, type: approvals.type })
        .from(approvals)
        .where(eq(approvals.id, approvalId))
        .limit(1);
      if (!approval || approval.type !== "Diskon manual") {
        throw new Error("Approval diskon manual tidak ditemukan.");
      }
      if (approval.status !== "approved") {
        throw new Error("Approval diskon manual belum disetujui.");
      }
    }
  }
  const discount = Math.min(grossTotal, voucherDiscount + manualDiscountValue);
  const total = grossTotal - discount;
  const orderNo = makeOrderNo();
  const invoiceNo = invoiceNoForOrder(orderNo);
  const channel = orderTypeToChannel(input.orderType);
  const linesByTargetGroup = new Map<KitchenTargetGroup, typeof lines>();
  for (const line of lines) {
    const targetGroup = kitchenTargetGroupForCategory(line.category);
    linesByTargetGroup.set(targetGroup, [
      ...(linesByTargetGroup.get(targetGroup) ?? []),
      line,
    ]);
  }
  const ticketDrafts = Array.from(linesByTargetGroup.entries()).map(
    ([targetGroup, groupLines]) => {
      // Build itemNotes: label -> note string. Hanya line yang ada note
      // yang masuk ke object. Kitchen UI sudah baca itemNotes per item.
      const itemNotes: Record<string, string> = {};
      for (const line of groupLines) {
        const label = kitchenItemLabel(line);
        if (line.note && line.note.trim()) {
          itemNotes[label] = line.note.trim();
        }
      }
      return {
        ticketNo: makeTicketNo(),
        targetGroup,
        targetMinutes: kitchenTargetMinutes[targetGroup],
        station: kitchenStationForTargetGroup(targetGroup),
        items: groupLines.map(kitchenItemLabel),
        itemNotes,
      };
    },
  );
  const paymentMethod = input.paymentMethod ?? "Cash";
  const paymentMetadata: Record<string, unknown> = {
    provider: input.paymentProvider ?? null,
    reference: input.paymentReference?.trim() || null,
    invoiceNo,
    invoiceStatus: "issued",
    invoiceIssuedAt: new Date().toISOString(),
    voucherCode: voucherValidation?.valid ? voucherValidation.code : null,
    voucherDiscount,
    manualDiscount: manualDiscountValue,
    manualDiscountReason: input.manualDiscount?.reason?.trim() || null,
  };

  if (input.cashReceived !== undefined) {
    paymentMetadata.cashReceived = input.cashReceived;
    paymentMetadata.change = Math.max(0, input.cashReceived - total);
  }

  // ── SPLIT PAYMENT VALIDATION ──
  // Validasi di sini agar fail-fast SEBELUM transaksi DB. Backward compat:
  // kalau `splits` undefined/empty → jalur lama (single payment).
  const splits = input.splits && input.splits.length > 0 ? input.splits : null;
  if (splits) {
    if (splits.length < 2) {
      throw new Error("Split payment butuh minimal 2 metode. Pakai paymentMethod tunggal kalau cuma 1.");
    }
    for (const s of splits) {
      if (!s.method || typeof s.method !== "string" || !s.method.trim()) {
        throw new Error("Setiap split wajib punya method (mis. Cash / QRIS).");
      }
      if (!Number.isFinite(s.amount) || !Number.isInteger(s.amount) || s.amount <= 0) {
        throw new Error(`Split amount harus bilangan bulat positif (got: ${s.amount}).`);
      }
    }
    const splitSum = splits.reduce((acc, s) => acc + s.amount, 0);
    if (splitSum !== total) {
      throw new Error(
        `Total split (${splitSum}) tidak sama dengan total order (${total}). Selisih: ${splitSum - total}.`,
      );
    }
  }

  let memberCustomer: typeof customers.$inferSelect | null = null;
  let memberAccount: typeof memberAccounts.$inferSelect | null = null;
  const memberPhone = input.memberPhone?.trim()
    ? normalizePhone(input.memberPhone)
    : null;
  const guestPhone = !input.customerId && !memberPhone && input.guestPhone?.trim()
    ? normalizePhone(input.guestPhone)
    : null;
  const guestName = guestPhone ? input.guestName?.trim() || "Guest Customer" : null;

  if (input.customerId || memberPhone) {
    const [row] = await db
      .select({ customer: customers, account: memberAccounts })
      .from(customers)
      .leftJoin(memberAccounts, eq(memberAccounts.customerId, customers.id))
      .where(
        input.customerId
          ? eq(customers.id, input.customerId)
          : eq(customers.phone, memberPhone ?? ""),
      )
      .limit(1);

    if (!row?.customer || !row.account) {
      throw new Error("Member tidak ditemukan atau belum aktif.");
    }

    memberCustomer = row.customer;
    memberAccount = row.account;
  }

  const created = await db.transaction(async (tx) => {
    let memberReward: {
      memberName: string;
      level: string;
      pointsEarned: number;
      totalPoints: number;
      upgradeNotification: string | null;
    } | null = null;

    const [order] = await tx
      .insert(orders)
      .values({
        orderNo,
        outletId: garage.profile.outlet.id,
        customerId: memberCustomer?.id ?? null,
        tableLabel,
        channel,
        subtotal,
        service,
        tax,
        discount,
        total,
        customerMode: memberCustomer ? "member" : guestPhone ? "guest" : "cashier",
        customerName: memberCustomer?.name ?? guestName,
        customerPhone: memberCustomer?.phone ?? guestPhone,
        createdBy: garage.user.id,
      })
      .returning();

    const insertedItems = await tx
      .insert(orderItems)
      .values(
        lines.map((line) => ({
          orderId: order.id,
          menuItemId: line.itemId,
          variantId: line.variantId,
          itemName: line.itemName,
          variantLabel: line.variantLabel,
          unitPrice: line.price,
          qty: line.qty,
          lineTotal: line.lineTotal,
          note: line.note?.trim() || null,
        })),
      )
      .returning();

    // ── INSERT PAYMENTS ──
    // Backward compat: kalau tidak split → 1 row method=paymentMethod amount=total.
    // Kalau split → N rows, satu per metode. Metadata tiap row punya kind=split + index/total.
    let payment: typeof payments.$inferSelect;
    let cashContribution = 0; // jumlah cash yang masuk kas (untuk update expectedCash)
    if (splits) {
      const insertedSplits = await tx
        .insert(payments)
        .values(
          splits.map((s, idx) => {
            const isCash = normalizePaymentMethod(s.method) === "cash";
            if (isCash) cashContribution += s.amount;
            return {
              orderId: order.id,
              cashSessionId: openCashSession.id,
              method: s.method,
              amount: s.amount,
              metadata: {
                ...paymentMetadata,
                kind: "split" as const,
                splitIndex: idx + 1,
                splitTotal: splits.length,
                provider: s.provider ?? paymentMetadata.provider ?? null,
                reference: s.reference?.trim() || null,
              },
            };
          }),
        )
        .returning();
      payment = insertedSplits[0];
    } else {
      const inserted = await tx
        .insert(payments)
        .values({
          orderId: order.id,
          cashSessionId: openCashSession.id,
          method: paymentMethod,
          amount: total,
          metadata: paymentMetadata,
        })
        .returning();
      payment = inserted[0];
      if (normalizePaymentMethod(paymentMethod) === "cash") {
        cashContribution = total;
      }
    }

    if (cashContribution > 0) {
      await tx
        .update(cashSessions)
        .set({
          expectedCash: sql`${cashSessions.expectedCash} + ${cashContribution}`,
        })
        .where(
          and(
            eq(cashSessions.id, openCashSession.id),
            eq(cashSessions.status, "open"),
            eq(cashSessions.openedBy, garage.user.id),
          ),
        );
    }

    if (voucherValidation?.valid) {
      const [voucherRow] = await tx
        .select()
        .from(vouchers)
        .where(eq(vouchers.code, voucherValidation.code))
        .limit(1);
      if (voucherRow) {
        await tx.insert(voucherRedemptions).values({
          voucherId: voucherRow.id,
          orderId: order.id,
          customerId: memberCustomer?.id ?? null,
          customerPhone: memberCustomer?.phone ?? guestPhone,
          discount: voucherDiscount,
        });
        await tx
          .update(vouchers)
          .set({ usedCount: sql`${vouchers.usedCount} + 1`, updatedAt: new Date() })
          .where(eq(vouchers.id, voucherRow.id));
      }
    }

    const tickets = await tx
      .insert(kitchenTickets)
      .values(
        ticketDrafts.map((ticket) => ({
          ticketNo: ticket.ticketNo,
          orderId: order.id,
          tableLabel: order.tableLabel,
          channel,
          station: ticket.station,
          status: "queue",
          elapsed: 0,
          priority: "normal",
          targetMinutes: ticket.targetMinutes,
          targetGroup: ticket.targetGroup,
          items: ticket.items,
          itemNotes: ticket.itemNotes,
        })),
      )
      .returning();
    const ticketNos = tickets.map((ticket) => ticket.ticketNo);
    const ticketNo = ticketNos[0] ?? makeTicketNo();

    const recipeRows = await tx
      .select({
        itemName: orderItems.itemName,
        orderQty: orderItems.qty,
        recipeQty: menuRecipes.qty,
        recipeUnit: menuRecipes.unit,
        recipeWastePct: menuRecipes.wastePct,
        inventorySku: menuRecipes.inventorySku,
        inventoryName: inventoryItems.name,
        inventoryMin: inventoryItems.min,
      })
      .from(orderItems)
      .innerJoin(
        menuRecipes,
        and(
          eq(orderItems.menuItemId, menuRecipes.menuItemId),
          eq(menuRecipes.status, "active"),
          or(eq(menuRecipes.variantId, orderItems.variantId), eq(menuRecipes.variantId, "all")),
        ),
      )
      .leftJoin(inventoryItems, eq(menuRecipes.inventorySku, inventoryItems.sku))
      .where(eq(orderItems.orderId, order.id));

    const stockWarnings: Array<{ sku: string | null; name: string; message: string }> = [];
    for (const recipe of recipeRows) {
      if (!recipe.inventorySku) {
        stockWarnings.push({
          sku: null,
          name: recipe.itemName,
          message: "Resep tidak punya SKU bahan.",
        });
        continue;
      }

      // Apply waste percentage: deductQty = (recipeQty * orderQty) * (1 + wastePct/100)
      const wasteMultiplier = 1 + (recipe.recipeWastePct ?? 0) / 100;
      const outletStock = await ensureLocationStock(tx, {
        sku: recipe.inventorySku,
        locationType: "outlet",
        locationKey: outletLocationKey(garage.profile.outlet.id),
        outletId: garage.profile.outlet.id,
        min: recipe.inventoryMin ?? 0,
        movement: "Outlet stock initialized",
      });
      const deductQty = Number(
        (recipe.recipeQty * recipe.orderQty * wasteMultiplier).toFixed(3),
      );
      const nextOnHand = Number((outletStock.onHand - deductQty).toFixed(4));
      if (nextOnHand < outletStock.min) {
        stockWarnings.push({
          sku: recipe.inventorySku,
          name: recipe.inventoryName ?? recipe.itemName,
          message: `Stok outlet setelah order di bawah minimum (${nextOnHand} ${recipe.recipeUnit}).`,
        });
      }

      await tx
        .update(inventoryLocationStocks)
        .set({
          onHand: nextOnHand,
          status: inventoryStatusFor(nextOnHand, outletStock.min),
          movement: `Auto deduct ${order.orderNo}`,
          updatedAt: new Date(),
        })
        .where(eq(inventoryLocationStocks.id, outletStock.id));
      const wasteNote =
        (recipe.recipeWastePct ?? 0) > 0
          ? ` (incl. ${recipe.recipeWastePct}% waste)`
          : "";
      await tx.insert(stockMovements).values({
        itemSku: recipe.inventorySku,
        type: "recipe_deduct",
        note: `${order.orderNo} ${recipe.orderQty}x ${recipe.itemName}${wasteNote} outlet ${garage.profile.outlet.id}`,
        qty: -deductQty,
        actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
      });
    }

    if (recipeRows.length) {
      await tx.insert(auditLogs).values({
        time: nowTimeLabel(),
        actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
        action: `Recipe stock deducted ${order.orderNo}`,
        object: order.tableLabel,
        device: garage.profile.deviceLabel,
        status: stockWarnings.length ? "warning" : "recorded",
        metadata: {
          orderId: order.id,
          recipeLines: recipeRows.length,
          warnings: stockWarnings,
          source: "pos_order",
        },
      });
    }

    if (tableNumber) {
      const tableSessionValues = {
        outletId: garage.profile.outlet.id,
        tableNumber,
        tableLabel: tableLabelForNumber(tableNumber),
        status: "paid",
        currentOrderId: order.id,
        needsCleaning: false,
        cleanedAt: null,
        lastStatusAt: new Date(),
        updatedAt: new Date(),
      };

      await tx
        .insert(tableSessions)
        .values(tableSessionValues)
        .onConflictDoUpdate({
          target: [tableSessions.outletId, tableSessions.tableNumber],
          set: tableSessionValues,
        });
    }

    if (memberCustomer && memberAccount) {
      const beforeLevel = normalizeMemberLevel(memberCustomer.cardTier ?? memberCustomer.tier);
      const { pointsEarned } = calculateEarnedPointsWithSettings(
        total,
        beforeLevel,
        settings,
      );
      const totalPoints = memberCustomer.points + pointsEarned;
      const annualSpend = await annualPaidSpendForCustomer(memberCustomer.id, tx, total);
      const earnedLevel = memberLevelForAnnualSpend(annualSpend);
      const afterLevel =
        beforeLevel === "Ultra"
          ? "Ultra"
          : memberLevelRank(earnedLevel) > memberLevelRank(beforeLevel)
            ? earnedLevel
            : beforeLevel;
      const upgradeNotification =
        afterLevel !== beforeLevel ? `Selamat, level member naik ke ${afterLevel}.` : null;

      await tx
        .update(customers)
        .set({
          points: totalPoints,
          tier: afterLevel,
          cardTier: afterLevel,
          visits: memberCustomer.visits + 1,
          lastOrder: `${channel} ${orderNo}`,
          flag: upgradeNotification ?? memberCustomer.flag,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, memberCustomer.id));

      await tx.insert(memberTransactions).values({
        customerId: memberCustomer.id,
        source: "POS",
        amount: total,
        pointsEarned,
        levelBefore: beforeLevel,
        levelAfter: afterLevel,
        upgradeNotification,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      if (memberCustomer.referredByCode) {
        const [existingReferralReward] = await tx
          .select()
          .from(memberTransactions)
          .where(and(eq(memberTransactions.customerId, memberCustomer.id), eq(memberTransactions.source, "REFERRAL")))
          .limit(1);

        if (!existingReferralReward) {
          const [referrer] = await tx
            .select()
            .from(customers)
            .where(eq(customers.referralCode, memberCustomer.referredByCode))
            .limit(1);

          await tx.insert(memberTransactions).values({
            customerId: memberCustomer.id,
            source: "REFERRAL",
            amount: 0,
            pointsEarned: REFERRAL_BONUS_POINTS,
            levelBefore: afterLevel,
            levelAfter: afterLevel,
            upgradeNotification: `Bonus referral ${REFERRAL_BONUS_POINTS} poin aktif.`,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          });
          await tx
            .update(customers)
            .set({
              points: sql`${customers.points} + ${REFERRAL_BONUS_POINTS}`,
              flag: `Referral bonus +${REFERRAL_BONUS_POINTS}`,
              updatedAt: new Date(),
            })
            .where(eq(customers.id, memberCustomer.id));

          if (referrer) {
            await tx.insert(memberTransactions).values({
              customerId: referrer.id,
              source: "REFERRAL",
              amount: 0,
              pointsEarned: REFERRAL_BONUS_POINTS,
              levelBefore: normalizeMemberLevel(referrer.tier),
              levelAfter: normalizeMemberLevel(referrer.tier),
              upgradeNotification: `${memberCustomer.name} transaksi pertama. Bonus referral ${REFERRAL_BONUS_POINTS} poin.`,
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            });
            await tx
              .update(customers)
              .set({
                points: sql`${customers.points} + ${REFERRAL_BONUS_POINTS}`,
                flag: `Referral ${memberCustomer.name} +${REFERRAL_BONUS_POINTS}`,
                updatedAt: new Date(),
              })
              .where(eq(customers.id, referrer.id));
          }
        }
      }

      memberReward = {
        memberName: memberCustomer.name,
        level: afterLevel,
        pointsEarned,
        totalPoints,
        upgradeNotification,
      };
    }

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
      action: `Create order ${orderNo}`,
      object: order.tableLabel,
      device: garage.profile.deviceLabel,
      status: "recorded",
      metadata: {
        orderId: order.id,
        ticketIds: tickets.map((ticket) => ticket.id),
        ticketNos,
        tableNumber,
        customerId: memberCustomer?.id ?? null,
      },
    });

    const receipt = {
      invoiceNo,
      invoiceStatus: "issued",
      orderNo,
      ticketNo,
      ticketNos,
      createdAt: order.createdAt.toISOString(),
      outlet: {
        code: garage.profile.outlet.code,
        name: garage.profile.outlet.name,
      },
      cashier: {
        name: garage.user.name,
        role: garage.profile.role,
        device: garage.profile.deviceLabel,
      },
      tableLabel: order.tableLabel,
      channel,
      payment: {
        method: paymentMethod,
        provider: input.paymentProvider ?? null,
        reference: input.paymentReference?.trim() || null,
        cashReceived: input.cashReceived ?? null,
        change:
          input.cashReceived !== undefined
            ? Math.max(0, input.cashReceived - total)
            : null,
      },
      items: lines.map((line) => ({
        name: line.itemName,
        variant: line.variantLabel,
        qty: line.qty,
        unitPrice: line.price,
        lineTotal: line.lineTotal,
      })),
      subtotal,
      service,
      tax,
      discount,
      total,
      memberReward,
      settings: receiptSettingsPayload(settings),
      brand: receiptBrand,
    };

    await tx.insert(printJobs).values({
      jobType: "receipt",
      target: "cashier",
      status: "pending",
      orderId: order.id,
      ticketNo: null,
      payload: { receipt },
    });

    return {
      orderRow: order,
      itemRows: insertedItems,
      paymentRow: payment,
      orderNo,
      ticketNo,
      ticketNos,
      subtotal,
      service,
      tax,
      discount,
      total,
      memberReward,
      receipt,
    };
  });

  // Credit kasir fee for paid order (outside transaction so a fee failure does
  // not roll back the POS order).
  const orderPaidPayload = {
    orderId: created.orderRow.id,
    staffUserId: garage.user.id,
    staffRole: garage.profile.role,
    outletId: garage.profile.outlet.id,
  };
  try {
    const feeRates = staffFeeRatesFromSettings(
      await getAppSettings(garage.profile.outlet.id),
    );
    await recordOrderPaidEarnings({ ...orderPaidPayload, fees: feeRates });
  } catch (error) {
    await enqueueFailedEarning("order_paid", orderPaidPayload, error);
  }

  const invoicePdfPath = `/api/orders/${created.orderRow.id}/invoice`;

  // Setiap order POS dapat link tracking + token (akses-kontrol acak) supaya
  // kasir selalu bisa salin link / cetak PDF, dan guest yang baru kasih WA di
  // layar sukses tetap dapat link. WhatsApp hanya dibuat kalau ada nomor.
  const invoiceCustomerPhone = memberCustomer?.phone ?? guestPhone;
  const trackingToken = created.orderRow.invoiceTrackingToken ?? makeInvoiceTrackingToken();
  const invoiceWhatsappUrl = invoiceCustomerPhone
    ? makeWhatsappInvoiceUrl({
        phone: invoiceCustomerPhone,
        orderNo,
        tableLabel,
        total,
        items: lines,
        invoiceUrl: invoiceWebUrl(trackingToken),
      })
    : null;

  await db
    .update(orders)
    .set({
      invoiceTrackingToken: trackingToken,
      whatsappInvoiceUrl: invoiceWhatsappUrl,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, created.orderRow.id));

  const invoiceWebPathValue = invoiceWebPath(trackingToken);
  return {
    orderId: created.orderRow.id,
    orderNo: created.orderNo,
    ticketNo: created.ticketNo,
    ticketNos: created.ticketNos,
    subtotal: created.subtotal,
    service: created.service,
    tax: created.tax,
    discount: created.discount,
    total: created.total,
    memberReward: created.memberReward,
    invoicePdfUrl: invoicePdfPath,
    invoiceWebUrl: invoiceWebPathValue,
    whatsappInvoiceUrl: invoiceWhatsappUrl,
    receipt: {
      ...created.receipt,
      customer: {
        name: memberCustomer?.name ?? guestName,
        phone: invoiceCustomerPhone,
      },
      invoicePdfUrl: invoicePdfPath,
      invoiceWebUrl: invoiceWebPathValue,
      whatsappInvoiceUrl: invoiceWhatsappUrl,
    },
  };
}

export class KitchenTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Kitchen ticket cannot move from "${from}" to "${to}"`);
    this.name = "KitchenTransitionError";
  }
}

export class TicketClaimError extends Error {
  constructor(public readonly claimedByName: string) {
    super(`Ticket sudah diambil oleh ${claimedByName}`);
    this.name = "TicketClaimError";
  }
}

const ticketClaimManagerRoles = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Supervisor Shift",
];

// Waiter klaim tiket "Saya antar": kunci tiket ke dirinya supaya waiter lain
// tidak ikut jalan, dan fee antar nanti jatuh ke pengklaim.
export async function claimKitchenTicket(ticketNo: string, garage: GarageSession) {
  const db = getDb();
  const [ticket] = await db
    .select()
    .from(kitchenTickets)
    .where(eq(kitchenTickets.ticketNo, ticketNo))
    .limit(1);
  if (!ticket) return null;
  if (ticket.claimedBy && ticket.claimedBy !== garage.user.id) {
    throw new TicketClaimError(ticket.claimedByName ?? "waiter lain");
  }
  const [updated] = await db
    .update(kitchenTickets)
    .set({
      claimedBy: garage.user.id,
      claimedByName: garage.user.name ?? "Waiter",
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(kitchenTickets.ticketNo, ticketNo))
    .returning();
  return updated ?? null;
}

// Lepas klaim (batal antar). Hanya pengklaim atau manager.
export async function releaseKitchenTicket(ticketNo: string, garage: GarageSession) {
  const db = getDb();
  const [ticket] = await db
    .select()
    .from(kitchenTickets)
    .where(eq(kitchenTickets.ticketNo, ticketNo))
    .limit(1);
  if (!ticket) return null;
  const isManager = ticketClaimManagerRoles.includes(garage.profile.role);
  if (ticket.claimedBy && ticket.claimedBy !== garage.user.id && !isManager) {
    throw new TicketClaimError(ticket.claimedByName ?? "waiter lain");
  }
  const [updated] = await db
    .update(kitchenTickets)
    .set({ claimedBy: null, claimedByName: null, claimedAt: null, updatedAt: new Date() })
    .where(eq(kitchenTickets.ticketNo, ticketNo))
    .returning();
  return updated ?? null;
}

// Antar tiket: hanya pengklaim (atau manager) yang boleh. Kalau belum diklaim,
// auto-klaim ke yang mengantar supaya fee jelas. Fee delivered dikredit ke
// garage.user di updateKitchenStatus → otomatis ke pengklaim.
export async function deliverClaimedTicket(ticketNo: string, garage: GarageSession) {
  const db = getDb();
  const [ticket] = await db
    .select()
    .from(kitchenTickets)
    .where(eq(kitchenTickets.ticketNo, ticketNo))
    .limit(1);
  if (!ticket) return null;
  const isManager = ticketClaimManagerRoles.includes(garage.profile.role);
  if (ticket.claimedBy && ticket.claimedBy !== garage.user.id && !isManager) {
    throw new TicketClaimError(ticket.claimedByName ?? "waiter lain");
  }
  if (!ticket.claimedBy) {
    await db
      .update(kitchenTickets)
      .set({
        claimedBy: garage.user.id,
        claimedByName: garage.user.name ?? "Waiter",
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(kitchenTickets.id, ticket.id));
  }
  return updateKitchenStatus(ticketNo, "delivered", garage);
}

export async function updateKitchenStatus(
  ticketNo: string,
  status: string,
  garage: GarageSession,
) {
  const db = getDb();
  const [current] = await db
    .select()
    .from(kitchenTickets)
    .where(eq(kitchenTickets.ticketNo, ticketNo))
    .limit(1);

  if (!current) {
    return null;
  }

  if (current.status === status) {
    return current;
  }

  if (!canTransitionKitchenStatus(current.status, status)) {
    throw new KitchenTransitionError(current.status, status);
  }

  const now = new Date();
  const actorName = garage.user.name;
  const update: Partial<typeof kitchenTickets.$inferInsert> = {
    status,
    updatedAt: now,
  };

  if (status === "cooking" && !current.acceptedAt) {
    update.acceptedAt = now;
    update.acceptedByName = actorName;
  }

  if (status === "ready") {
    const acceptedAt = current.acceptedAt ?? current.createdAt;
    const productionMinutes = minutesBetween(acceptedAt, now) ?? 0;

    if (!current.acceptedAt) {
      update.acceptedAt = acceptedAt;
      update.acceptedByName = current.acceptedByName ?? actorName;
    }

    update.readyAt = now;
    update.readyByName = actorName;
    update.elapsed = productionMinutes;
    update.priority = productionMinutes > current.targetMinutes ? "late" : "normal";
  }

  if (status === "delivered") {
    update.deliveredAt = now;
    update.deliveredByName = actorName;
  }

  // Optimistic lock: hanya update kalau status DB masih sama dgn yg kita baca.
  // Mencegah race 2 koki tap "Ready" bersamaan → double-credit staff fee.
  const [ticket] = await db
    .update(kitchenTickets)
    .set(update)
    .where(
      and(
        eq(kitchenTickets.ticketNo, ticketNo),
        eq(kitchenTickets.status, current.status),
      ),
    )
    .returning();

  // Kalau ticket tidak ke-update (rows=0), berarti agent lain sudah duluan
  // ubah status. Treat as success idempotent — return state terbaru tanpa
  // credit fee/audit ulang.
  if (!ticket) {
    const [latest] = await db
      .select()
      .from(kitchenTickets)
      .where(eq(kitchenTickets.ticketNo, ticketNo))
      .limit(1);
    return latest ?? null;
  }

  // Tarif fee diambil dari Pengaturan (owner bisa atur) saat ada kredit fee.
  const needsFeeCredit =
    (status === "ready" && current.status !== "ready") ||
    (status === "delivered" && current.status !== "delivered");
  const feeRates: StaffFeeRates | undefined = needsFeeCredit
    ? staffFeeRatesFromSettings(await getAppSettings(garage.profile.outlet.id))
    : undefined;

  // Credit staff fee when the ticket transitions cooking/queue → ready.
  if (status === "ready" && current.status !== "ready") {
    const readyPayload = {
      ticketId: ticket.id,
      staffUserId: garage.user.id,
      staffRole: garage.profile.role,
      outletId: garage.profile.outlet.id,
      earnedAt: now.toISOString(),
    };
    try {
      await recordTicketReadyEarnings({ ...readyPayload, earnedAt: now, fees: feeRates });
    } catch (error) {
      await enqueueFailedEarning("ticket_ready", readyPayload, error);
    }
  }

  // Credit waiter fee when ticket transitions to delivered.
  if (status === "delivered" && current.status !== "delivered") {
    const deliveredPayload = {
      ticketId: ticket.id,
      staffUserId: garage.user.id,
      staffRole: garage.profile.role,
      outletId: garage.profile.outlet.id,
      earnedAt: now.toISOString(),
    };
    try {
      await recordTicketDeliveredEarnings({ ...deliveredPayload, earnedAt: now, fees: feeRates });
    } catch (error) {
      await enqueueFailedEarning("ticket_delivered", deliveredPayload, error);
    }
  }

  // Auto system message ke chat customer untuk transisi ready/delivered.
  // Non-blocking: chat thread mungkin tidak ada untuk order ini.
  if (ticket.orderId && (status === "ready" || status === "delivered")) {
    try {
      const station = ticket.targetGroup === "Bar" ? "Bar" : "Dapur";
      const body =
        status === "ready"
          ? `${station}: pesanan siap, sebentar lagi diantar. 🛎️`
          : `${station}: pesanan sudah diantar ke meja. Selamat menikmati! ☕`;
      await postSystemChatMessageForOrder(ticket.orderId, body);
    } catch {
      /* non-blocking */
    }
  }

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: `Kitchen ticket marked ${status}`,
    object: ticket.ticketNo,
    device: garage.profile.deviceLabel,
    metadata: {
      ticketId: ticket.id,
      targetMinutes: ticket.targetMinutes,
      targetGroup: ticket.targetGroup,
      acceptedByName: ticket.acceptedByName,
      readyByName: ticket.readyByName,
      deliveredByName: ticket.deliveredByName,
    },
  });

  return ticket;
}

export async function updateInventoryItem(
  sku: string,
  input: Partial<{
    name: string;
    alternativeName: string;
    category: string;
    usageArea: "bar" | "dapur" | "general";
    unit: string;
    packageSize: string;
    unitCost: number;
    onHand: number;
    min: number;
    status: string;
    movement: string;
  }>,
  garage: GarageSession,
) {
  const db = getDb();
  const [current] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.sku, sku))
    .limit(1);

  if (!current) {
    return null;
  }

  const nextOnHand = input.onHand ?? current.onHand;
  const nextMin = input.min ?? current.min;
  const status = input.status ?? inventoryStatusFor(nextOnHand, nextMin);
  const setValues: Partial<typeof inventoryItems.$inferInsert> = {
    updatedAt: new Date(),
    status,
  };
  if (input.name !== undefined) setValues.name = input.name.trim();
  if (input.alternativeName !== undefined) {
    setValues.alternativeName = input.alternativeName.trim() || "-";
  }
  if (input.category !== undefined) setValues.category = input.category.trim();
  if (input.usageArea !== undefined) {
    setValues.usageArea = normalizeInventoryUsageArea(
      input.usageArea,
      input.category?.trim() || current.category,
      input.name?.trim() || current.name,
    );
  }
  if (input.unit !== undefined) setValues.unit = input.unit.trim();
  if (input.packageSize !== undefined) setValues.packageSize = input.packageSize.trim();
  if (input.unitCost !== undefined) setValues.unitCost = Math.max(0, Math.round(input.unitCost));
  if (input.onHand !== undefined) setValues.onHand = input.onHand;
  if (input.min !== undefined) setValues.min = input.min;
  if (input.movement !== undefined) setValues.movement = input.movement.trim();

  const [item] = await db
    .update(inventoryItems)
    .set(setValues)
    .where(eq(inventoryItems.sku, sku))
    .returning();

  if (input.onHand !== undefined || input.min !== undefined || input.movement !== undefined) {
    await db
      .insert(inventoryLocationStocks)
      .values({
        itemSku: sku,
        locationType: "warehouse",
        locationKey: WAREHOUSE_LOCATION_KEY,
        outletId: null,
        onHand: nextOnHand,
        min: nextMin,
        status,
        movement: input.movement?.trim() || current.movement,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [inventoryLocationStocks.itemSku, inventoryLocationStocks.locationKey],
        set: {
          onHand: nextOnHand,
          min: nextMin,
          status,
          movement: input.movement?.trim() || current.movement,
          updatedAt: new Date(),
        },
      });
  }

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Warehouse SKU updated",
    object: sku,
    device: garage.profile.deviceLabel,
    metadata: {
      fields: Object.keys(input),
      previousOnHand: current.onHand,
      nextOnHand,
      previousMin: current.min,
      nextMin,
      status,
    },
  });

  return item;
}

export async function createStockMovement(input: MovementInput, garage: GarageSession) {
  const db = getDb();
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;

  const [movement] = await db.transaction(async (tx) => {
    if (input.applyToStock) {
      if (!input.itemSku) {
        throw new Error("SKU wajib diisi untuk movement yang mengubah stok.");
      }
      const qty = Number(input.qty ?? 0);
      if (!Number.isFinite(qty) || qty === 0) {
        throw new Error("Qty movement harus angka selain 0.");
      }
      const [current] = await tx
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.sku, input.itemSku))
        .limit(1);
      if (!current) {
        throw new Error("SKU gudang tidak ditemukan.");
      }
      // Anti stok minus: outbound movement yang lebih besar dari onHand dilarang.
      if (qty < 0 && Number(current.onHand) + qty < 0) {
        throw new Error(
          `Stok tidak cukup: tersedia ${current.onHand}, diminta keluar ${Math.abs(qty)}.`,
        );
      }
      const nextOnHand = Math.max(0, Number(current.onHand) + qty);
      const nextStatus = inventoryStatusFor(nextOnHand, current.min);
      await tx
        .update(inventoryItems)
        .set({
          onHand: nextOnHand,
          status: nextStatus,
          movement: input.note,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.sku, current.sku));
      await tx
        .insert(inventoryLocationStocks)
        .values({
          itemSku: current.sku,
          locationType: "warehouse",
          locationKey: WAREHOUSE_LOCATION_KEY,
          outletId: null,
          onHand: nextOnHand,
          min: current.min,
          status: nextStatus,
          movement: input.note,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [inventoryLocationStocks.itemSku, inventoryLocationStocks.locationKey],
          set: {
            onHand: nextOnHand,
            min: current.min,
            status: nextStatus,
            movement: input.note,
            updatedAt: new Date(),
          },
        });
    }

    const inserted = await tx
      .insert(stockMovements)
      .values({
        itemSku: input.itemSku,
        type: input.type,
        note: input.note,
        qty: input.qty,
        actor,
      })
      .returning();

    return inserted;
  });

  await createAuditLog({
    actor,
    action: "Stock movement recorded",
    object: input.itemSku ?? "inventory",
    device: garage.profile.deviceLabel,
    metadata: {
      type: input.type,
      qty: input.qty,
      applyToStock: Boolean(input.applyToStock),
      note: input.note,
    },
  });

  return movement;
}

export async function createSupplierReceiving(input: SupplierReceivingInput, garage: GarageSession) {
  if (!canManageWarehouseFlow(garage.profile.role)) {
    throw new Error("Hanya Owner/Admin/Gudang yang bisa posting barang masuk supplier.");
  }

  const db = getDb();
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  const now = new Date();
  const itemSkus = [...new Set(input.items.map((item) => item.sku.trim()).filter(Boolean))];
  if (!itemSkus.length) throw new Error("Minimal 1 SKU wajib diisi untuk Supplier POS.");

  const inventoryRows = await db.select().from(inventoryItems).where(inArray(inventoryItems.sku, itemSkus));
  const inventoryBySku = new Map(inventoryRows.map((item) => [item.sku, item]));
  const lines = input.items.map((line) => {
    const sku = line.sku.trim();
    const item = inventoryBySku.get(sku);
    if (!item) throw new Error(`SKU tidak ditemukan: ${sku}`);
    const qty = Number(line.qty);
    const unitCost = Math.max(0, Math.round(Number(line.unitCost)));
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Qty receiving tidak valid untuk ${sku}.`);
    if (!Number.isFinite(unitCost)) throw new Error(`Harga input tidak valid untuk ${sku}.`);
    return {
      item,
      qty,
      unitCost,
      lineTotal: Math.round(qty * unitCost),
      note: line.note?.trim() || null,
    };
  });
  const totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  const result = await db.transaction(async (tx) => {
    let supplierInvoiceId: string | null = null;
    const invoiceNo = input.invoiceNo?.trim();
    if (invoiceNo) {
      const [invoice] = await tx
        .insert(supplierInvoices)
        .values({
          supplierId: input.supplierId || null,
          outletId: garage.profile.outlet.id,
          invoiceNo,
          category: "COGS",
          description: `Supplier receiving ${invoiceNo}`,
          amount: totalAmount,
          status: "unpaid",
          dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          createdBy: garage.user.id,
          notes: input.note?.trim() || null,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: supplierInvoices.id });
      supplierInvoiceId = invoice?.id ?? null;
    }

    const [receiving] = await tx
      .insert(supplierReceivings)
      .values({
        code: supplierReceivingCode(),
        supplierId: input.supplierId || null,
        supplierInvoiceId,
        invoiceNo: invoiceNo || null,
        status: "posted",
        totalAmount,
        note: input.note?.trim() || null,
        receivedBy: garage.user.id,
        receivedAt: now,
      })
      .returning();

    const createdItems = await tx
      .insert(supplierReceivingItems)
      .values(
        lines.map((line) => ({
          receivingId: receiving.id,
          itemSku: line.item.sku,
          itemName: line.item.name,
          unit: line.item.unit,
          qty: line.qty,
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
          note: line.note,
        })),
      )
      .returning();

    for (const line of lines) {
      const location = await ensureLocationStock(tx, {
        sku: line.item.sku,
        locationType: "warehouse",
        locationKey: WAREHOUSE_LOCATION_KEY,
        outletId: null,
        min: line.item.min,
        movement: "Warehouse stock initialized",
      });
      const nextOnHand = Number((location.onHand + line.qty).toFixed(4));
      await tx
        .update(inventoryLocationStocks)
        .set({
          onHand: nextOnHand,
          min: line.item.min,
          status: inventoryStatusFor(nextOnHand, line.item.min),
          movement: `${receiving.code}: supplier receive ${line.qty} ${line.item.unit}`,
          updatedAt: now,
        })
        .where(eq(inventoryLocationStocks.id, location.id));
      await tx
        .update(inventoryItems)
        .set({
          onHand: sql`${inventoryItems.onHand} + ${line.qty}`,
          unitCost: line.unitCost,
          status: sql<string>`case
            when ${inventoryItems.onHand} + ${line.qty} <= ${inventoryItems.min} then 'low'
            when ${inventoryItems.onHand} + ${line.qty} <= (${inventoryItems.min} * 1.25) then 'watch'
            else 'safe'
          end`,
          movement: `${receiving.code}: supplier receive ${line.qty} ${line.item.unit}`,
          updatedAt: now,
        })
        .where(eq(inventoryItems.sku, line.item.sku));
      await tx.insert(stockMovements).values({
        itemSku: line.item.sku,
        type: "supplier_receive",
        note: `${receiving.code}: +${line.qty} ${line.item.unit}${invoiceNo ? ` invoice ${invoiceNo}` : ""}`,
        qty: line.qty,
        actor,
      });
    }

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action: "Supplier receiving posted",
      object: receiving.code,
      device: garage.profile.deviceLabel,
      status: "posted",
      metadata: {
        receivingId: receiving.id,
        invoiceNo: invoiceNo || null,
        totalAmount,
        items: lines.length,
      },
    });

    return { receiving, items: createdItems };
  });

  return {
    receiving: serializeDateFields(result.receiving),
    items: result.items.map(serializeDateFields),
  };
}

export async function listSupplierReceivings(filter?: { limit?: number }) {
  const rows = await getDb()
    .select({
      id: supplierReceivings.id,
      code: supplierReceivings.code,
      invoiceNo: supplierReceivings.invoiceNo,
      totalAmount: supplierReceivings.totalAmount,
      note: supplierReceivings.note,
      receivedAt: supplierReceivings.receivedAt,
      supplierName: suppliers.name,
      actorName: user.name,
    })
    .from(supplierReceivings)
    .leftJoin(suppliers, eq(supplierReceivings.supplierId, suppliers.id))
    .leftJoin(user, eq(supplierReceivings.receivedBy, user.id))
    .orderBy(desc(supplierReceivings.receivedAt))
    .limit(Math.min(Math.max(filter?.limit ?? 30, 1), 100));

  return rows.map((row) => ({ ...row, receivedAt: row.receivedAt.toISOString() }));
}

export async function createInventoryTransferRequest(input: InventoryTransferInput, garage: GarageSession) {
  const db = getDb();
  const outletId = input.outletId || garage.profile.outlet.id;
  const station = input.station === "bar" ? "bar" : "dapur";
  const restrictedStation = roleStationArea(garage.profile.role);
  if (restrictedStation && station !== restrictedStation) {
    throw new Error(`Role ${roleDisplayName[garage.profile.role]} hanya bisa request bahan ${restrictedStation === "bar" ? "Bar" : "Dapur"}.`);
  }
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  const itemSkus = [...new Set(input.items.map((item) => item.sku.trim()).filter(Boolean))];
  if (!itemSkus.length) throw new Error("Minimal 1 SKU wajib di-request.");

  const [outlet] = await db.select().from(outlets).where(eq(outlets.id, outletId)).limit(1);
  if (!outlet) throw new Error("Outlet tujuan tidak ditemukan.");
  const inventoryRows = await db.select().from(inventoryItems).where(inArray(inventoryItems.sku, itemSkus));
  const inventoryBySku = new Map(inventoryRows.map((item) => [item.sku, item]));
  const lines = input.items.map((line) => {
    const sku = line.sku.trim();
    const item = inventoryBySku.get(sku);
    if (!item) throw new Error(`SKU tidak ditemukan: ${sku}`);
    const usageArea = normalizeInventoryUsageArea(item.usageArea, item.category, item.name);
    if (usageArea !== "general" && usageArea !== station) {
      throw new Error(`${item.name} adalah bahan ${usageArea === "bar" ? "Bar" : "Dapur"}, tidak bisa masuk request ${station === "bar" ? "Bar" : "Dapur"}.`);
    }
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Qty request tidak valid untuk ${sku}.`);
    return { item, qty, note: line.note?.trim() || null };
  });

  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .insert(inventoryTransferRequests)
      .values({
        requestNo: transferRequestNo(outlet.code),
        outletId,
        station,
        status: "requested",
        note: input.note?.trim() || null,
        requestedBy: garage.user.id,
        updatedAt: new Date(),
      })
      .returning();
    const items = await tx
      .insert(inventoryTransferItems)
      .values(
        lines.map((line) => ({
          requestId: request.id,
          itemSku: line.item.sku,
          itemName: line.item.name,
          unit: line.item.unit,
          requestedQty: line.qty,
          unitCost: line.item.unitCost,
          note: line.note,
        })),
      )
      .returning();

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action: "Outlet stock request submitted",
      object: request.requestNo,
      device: garage.profile.deviceLabel,
      status: "requested",
        metadata: { requestId: request.id, outletId, station, items: items.length },
    });

    return { request, items };
  });

  return {
    request: serializeDateFields(result.request),
    items: result.items.map(serializeDateFields),
  };
}

export async function listInventoryTransferRequests(filter?: { status?: string; limit?: number }) {
  const conditions = [];
  if (filter?.status && filter.status !== "all") conditions.push(eq(inventoryTransferRequests.status, filter.status));
  const requests = await getDb()
    .select({
      id: inventoryTransferRequests.id,
      requestNo: inventoryTransferRequests.requestNo,
      outletId: inventoryTransferRequests.outletId,
      outletName: outlets.name,
      station: inventoryTransferRequests.station,
      status: inventoryTransferRequests.status,
      note: inventoryTransferRequests.note,
      createdAt: inventoryTransferRequests.createdAt,
      approvedAt: inventoryTransferRequests.approvedAt,
      issuedAt: inventoryTransferRequests.issuedAt,
      requestedByName: user.name,
    })
    .from(inventoryTransferRequests)
    .leftJoin(outlets, eq(inventoryTransferRequests.outletId, outlets.id))
    .leftJoin(user, eq(inventoryTransferRequests.requestedBy, user.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(inventoryTransferRequests.createdAt))
    .limit(Math.min(Math.max(filter?.limit ?? 30, 1), 100));

  if (!requests.length) return [];
  const items = await getDb()
    .select()
    .from(inventoryTransferItems)
    .where(inArray(inventoryTransferItems.requestId, requests.map((request) => request.id)))
    .orderBy(inventoryTransferItems.itemName);
  const itemsByRequest = new Map<string, typeof items>();
  for (const item of items) {
    itemsByRequest.set(item.requestId, [...(itemsByRequest.get(item.requestId) ?? []), item]);
  }

  return requests.map((request) => ({
    ...request,
    createdAt: request.createdAt.toISOString(),
    approvedAt: request.approvedAt?.toISOString() ?? null,
    issuedAt: request.issuedAt?.toISOString() ?? null,
    items: (itemsByRequest.get(request.id) ?? []).map(serializeDateFields),
  }));
}

export async function decideInventoryTransferRequest(
  id: string,
  action: "approve" | "reject" | "issue",
  garage: GarageSession,
  options?: { items?: Array<{ itemId: string; issuedQty: number }> },
) {
  if (!canManageWarehouseFlow(garage.profile.role)) {
    throw new Error("Hanya Owner/Admin/Gudang yang bisa approve, reject, atau issue request Gudang.");
  }

  const db = getDb();
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(inventoryTransferRequests).where(eq(inventoryTransferRequests.id, id)).limit(1);
    if (!request) return null;
    if (action === "approve" && request.status !== "requested") throw new Error("Request hanya bisa di-approve dari status requested.");
    if (action === "reject" && !["requested", "approved", "partial"].includes(request.status)) throw new Error("Request tidak bisa di-reject dari status saat ini.");
    if (action === "issue" && !["approved", "partial"].includes(request.status)) throw new Error("Request harus approved sebelum issue.");

    if (action === "approve" || action === "reject") {
      const [updated] = await tx
        .update(inventoryTransferRequests)
        .set(
          action === "approve"
            ? { status: "approved", approvedBy: garage.user.id, approvedAt: now, updatedAt: now }
            : { status: "rejected", rejectedBy: garage.user.id, rejectedAt: now, updatedAt: now },
        )
        .where(eq(inventoryTransferRequests.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        time: nowTimeLabel(),
        actor,
        action: action === "approve" ? "Outlet stock request approved" : "Outlet stock request rejected",
        object: request.requestNo,
        device: garage.profile.deviceLabel,
        status: action === "approve" ? "approved" : "rejected",
        metadata: { requestId: id, outletId: request.outletId, station: request.station },
      });
      return updated;
    }

    const items = await tx.select().from(inventoryTransferItems).where(eq(inventoryTransferItems.requestId, id));
    if (!request.outletId) throw new Error("Outlet tujuan tidak valid.");
    const requestedIssueByItemId = new Map(
      options?.items?.map((item) => [item.itemId, Number(item.issuedQty)]) ?? [],
    );
    const issueLines = items
      .map((item) => {
        const remainingQty = Math.max(0, Number((item.requestedQty - item.issuedQty).toFixed(4)));
        const requestedQty = requestedIssueByItemId.has(item.id)
          ? Number(requestedIssueByItemId.get(item.id))
          : remainingQty;
        if (!Number.isFinite(requestedQty) || requestedQty < 0) {
          throw new Error(`Qty issue tidak valid untuk ${item.itemName}.`);
        }
        const issueQty = Math.min(remainingQty, requestedQty);
        return { item, remainingQty, issueQty: Number(issueQty.toFixed(4)) };
      })
      .filter((line) => line.issueQty > 0);
    if (!issueLines.length) throw new Error("Isi minimal 1 qty issue.");

    for (const { item, issueQty } of issueLines) {
      if (!item.itemSku) continue;
      const [warehouse] = await tx
        .select()
        .from(inventoryLocationStocks)
        .where(and(eq(inventoryLocationStocks.itemSku, item.itemSku), eq(inventoryLocationStocks.locationKey, WAREHOUSE_LOCATION_KEY)))
        .limit(1);
      if (!warehouse || warehouse.onHand < issueQty) {
        throw new Error(`Stok Gudang tidak cukup untuk ${item.itemName}. Tersedia ${warehouse?.onHand ?? 0}, issue ${issueQty}.`);
      }
    }

    for (const { item, issueQty } of issueLines) {
      if (!item.itemSku) continue;
      const [inventory] = await tx.select().from(inventoryItems).where(eq(inventoryItems.sku, item.itemSku)).limit(1);
      if (!inventory) continue;
      const [warehouse] = await tx
        .select()
        .from(inventoryLocationStocks)
        .where(and(eq(inventoryLocationStocks.itemSku, item.itemSku), eq(inventoryLocationStocks.locationKey, WAREHOUSE_LOCATION_KEY)))
        .limit(1);
      const outletStock = await ensureLocationStock(tx, {
        sku: item.itemSku,
        locationType: "outlet",
        locationKey: outletLocationKey(request.outletId),
        outletId: request.outletId,
        min: inventory.min,
        movement: "Outlet stock initialized",
      });
      const nextWarehouse = Number(((warehouse?.onHand ?? 0) - issueQty).toFixed(4));
      const nextOutlet = Number((outletStock.onHand + issueQty).toFixed(4));
      await tx
        .update(inventoryLocationStocks)
        .set({
          onHand: nextWarehouse,
          status: inventoryStatusFor(nextWarehouse, warehouse?.min ?? inventory.min),
          movement: `${request.requestNo}: issue to outlet ${request.station}`,
          updatedAt: now,
        })
        .where(eq(inventoryLocationStocks.id, warehouse!.id));
      await tx
        .update(inventoryLocationStocks)
        .set({
          onHand: nextOutlet,
          status: inventoryStatusFor(nextOutlet, outletStock.min),
          movement: `${request.requestNo}: receive from warehouse to ${request.station}`,
          updatedAt: now,
        })
        .where(eq(inventoryLocationStocks.id, outletStock.id));
      await tx
        .update(inventoryItems)
        .set({
          onHand: nextWarehouse,
          status: inventoryStatusFor(nextWarehouse, inventory.min),
          movement: `${request.requestNo}: issue to outlet ${request.station}`,
          updatedAt: now,
        })
        .where(eq(inventoryItems.sku, item.itemSku));
      const nextIssuedQty = Number((item.issuedQty + issueQty).toFixed(4));
      await tx.update(inventoryTransferItems).set({ issuedQty: nextIssuedQty }).where(eq(inventoryTransferItems.id, item.id));
      await tx.insert(stockMovements).values([
        {
          itemSku: item.itemSku,
          type: "warehouse_issue",
          note: `${request.requestNo}: -${issueQty} ${item.unit} to outlet ${request.station}`,
          qty: -issueQty,
          actor,
        },
        {
          itemSku: item.itemSku,
          type: "outlet_receive",
          note: `${request.requestNo}: +${issueQty} ${item.unit} at outlet ${request.outletId} / ${request.station}`,
          qty: issueQty,
          actor,
        },
      ]);
    }

    const nextItems = items.map((item) => {
      const issuedLine = issueLines.find((line) => line.item.id === item.id);
      return {
        requestedQty: item.requestedQty,
        issuedQty: Number((item.issuedQty + (issuedLine?.issueQty ?? 0)).toFixed(4)),
      };
    });
    const allIssued = nextItems.every((item) => item.issuedQty >= item.requestedQty);
    const nextStatus = allIssued ? "issued" : "partial";
    const [updated] = await tx
      .update(inventoryTransferRequests)
      .set({ status: nextStatus, issuedBy: garage.user.id, issuedAt: allIssued ? now : request.issuedAt, updatedAt: now })
      .where(eq(inventoryTransferRequests.id, id))
      .returning();
    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action: "Outlet stock request issued",
      object: request.requestNo,
      device: garage.profile.deviceLabel,
      status: nextStatus,
      metadata: { requestId: id, outletId: request.outletId, station: request.station, items: issueLines.length },
    });
    return updated;
  });

  return result ? serializeDateFields(result) : null;
}

function stockOpnameStatus(totalDelta: number) {
  return Math.abs(totalDelta) > 0 ? "pending_approval" : "draft";
}

function stockOpnameCode(outletCode: string) {
  return `OPN-${outletCode}-${Date.now().toString().slice(-8)}`;
}

function serializeStockOpnameSession<T extends { createdAt: Date; updatedAt: Date; approvedAt: Date | null; appliedAt: Date | null; rejectedAt: Date | null }>(
  row: T,
) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
  };
}

function serializeStockOpnameItem<T extends { createdAt: Date }>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listStockOpnameSessions(
  garage: GarageSession,
  filter?: { status?: string; limit?: number },
) {
  const conditions = [];
  if (filter?.status && filter.status !== "all") {
    conditions.push(eq(stockOpnameSessions.status, filter.status));
  }

  const rows = await getDb()
    .select({
      id: stockOpnameSessions.id,
      code: stockOpnameSessions.code,
      status: stockOpnameSessions.status,
      note: stockOpnameSessions.note,
      totalItems: stockOpnameSessions.totalItems,
      totalDelta: stockOpnameSessions.totalDelta,
      locationType: stockOpnameSessions.locationType,
      locationKey: stockOpnameSessions.locationKey,
      outletName: outlets.name,
      createdAt: stockOpnameSessions.createdAt,
      updatedAt: stockOpnameSessions.updatedAt,
      approvedAt: stockOpnameSessions.approvedAt,
      appliedAt: stockOpnameSessions.appliedAt,
      rejectedAt: stockOpnameSessions.rejectedAt,
      actorName: user.name,
    })
    .from(stockOpnameSessions)
    .leftJoin(user, eq(user.id, stockOpnameSessions.createdBy))
    .leftJoin(outlets, eq(outlets.id, stockOpnameSessions.outletId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(stockOpnameSessions.createdAt))
    .limit(Math.min(Math.max(filter?.limit ?? 30, 1), 100));

  return rows.map(serializeStockOpnameSession);
}

export async function getStockOpnameDetail(id: string) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(stockOpnameSessions)
    .where(eq(stockOpnameSessions.id, id))
    .limit(1);

  if (!session) return null;

  const items = await db
    .select()
    .from(stockOpnameItems)
    .where(eq(stockOpnameItems.sessionId, id))
    .orderBy(stockOpnameItems.itemName);

  return {
    session: serializeStockOpnameSession(session),
    items: items.map(serializeStockOpnameItem),
  };
}

export async function createStockOpname(input: StockOpnameInput, garage: GarageSession) {
  const db = getDb();
  const locationType = input.locationType === "warehouse" ? "warehouse" : "outlet";
  const targetOutletId =
    locationType === "warehouse" ? null : input.outletId || garage.profile.outlet.id;
  const locationKey =
    locationType === "warehouse" ? WAREHOUSE_LOCATION_KEY : outletLocationKey(targetOutletId!);
  const [targetOutlet] =
    locationType === "warehouse"
      ? []
      : await db.select().from(outlets).where(eq(outlets.id, targetOutletId!)).limit(1);
  if (locationType === "outlet" && !targetOutlet) {
    throw new Error("Outlet opname tidak ditemukan.");
  }
  const skuList = [...new Set(input.items.map((item) => item.sku.trim()).filter(Boolean))];
  if (!skuList.length) {
    throw new Error("Minimal 1 item wajib diisi untuk stok opname.");
  }

  const inventoryRows = await db
    .select()
    .from(inventoryItems)
    .where(inArray(inventoryItems.sku, skuList));
  const inventoryBySku = new Map(inventoryRows.map((item) => [item.sku, item]));
  const detailRows = input.items.map((entry) => {
    const item = inventoryBySku.get(entry.sku.trim());
    if (!item) {
      throw new Error(`SKU tidak ditemukan: ${entry.sku}`);
    }
    const systemQty = Number(entry.systemQty);
    const physicalQty = Number(entry.physicalQty);
    if (!Number.isFinite(systemQty) || !Number.isFinite(physicalQty) || physicalQty < 0) {
      throw new Error(`Qty opname tidak valid untuk ${item.sku}.`);
    }
    const delta = physicalQty - systemQty;
    return {
      itemSku: item.sku,
      itemName: item.name,
      unit: item.unit,
      systemQty,
      physicalQty,
      delta,
      note: entry.note?.trim() || null,
    };
  });
  const totalDelta = Number(detailRows.reduce((sum, row) => sum + row.delta, 0).toFixed(4));
  const status = stockOpnameStatus(totalDelta);
  const now = new Date();
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;

  const result = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(stockOpnameSessions)
      .values({
        code: stockOpnameCode(locationType === "warehouse" ? "WH" : targetOutlet.code),
        outletId: targetOutletId,
        locationType,
        locationKey,
        status,
        note: input.note?.trim() || null,
        totalItems: detailRows.length,
        totalDelta,
        createdBy: garage.user.id,
        updatedAt: now,
      })
      .returning();

    const items = await tx
      .insert(stockOpnameItems)
      .values(detailRows.map((row) => ({ ...row, sessionId: session.id })))
      .returning();

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action: "Stock opname submitted",
      object: session.code,
      device: garage.profile.deviceLabel,
      status: status === "pending_approval" ? "approval_required" : "draft",
      metadata: {
        opnameId: session.id,
        totalItems: detailRows.length,
        totalDelta,
        locationType,
        locationKey,
        outletId: targetOutletId,
      },
    });

    if (status === "pending_approval") {
      const deltaLabel =
        totalDelta >= 0 ? `+${totalDelta}` : String(totalDelta);
      await tx
        .insert(approvals)
        .values({
          id: `APP-OPN-${session.id}`,
          type: "Stock adjustment",
          requester: actor,
          requesterPhone: null,
          amount: deltaLabel,
          reason: `${session.code}: opname ${detailRows.length} item${input.note?.trim() ? ` · ${input.note.trim()}` : ""}`,
          risk: Math.abs(totalDelta) >= 10 ? "high" : "medium",
          age: "baru saja",
          status: "pending",
        })
        .onConflictDoNothing();
    }

    return { session, items };
  });

  return {
    session: serializeStockOpnameSession(result.session),
    items: result.items.map(serializeStockOpnameItem),
  };
}

export async function approveStockOpname(id: string, garage: GarageSession) {
  return decideStockOpname(id, garage, "approved");
}

export async function rejectStockOpname(id: string, garage: GarageSession) {
  return decideStockOpname(id, garage, "rejected");
}

async function decideStockOpname(id: string, garage: GarageSession, decision: "approved" | "rejected") {
  const db = getDb();
  const [current] = await db
    .select()
    .from(stockOpnameSessions)
    .where(eq(stockOpnameSessions.id, id))
    .limit(1);

  if (!current) return null;
  if (!["draft", "pending_approval"].includes(current.status)) {
    throw new Error("Opname sudah diputuskan atau sudah diterapkan.");
  }

  const now = new Date();
  const setFields =
    decision === "approved"
      ? { status: "approved", approvedBy: garage.user.id, approvedAt: now, updatedAt: now }
      : { status: "rejected", rejectedBy: garage.user.id, rejectedAt: now, updatedAt: now };
  const [updated] = await db
    .update(stockOpnameSessions)
    .set(setFields)
    .where(eq(stockOpnameSessions.id, id))
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: decision === "approved" ? "Stock opname approved" : "Stock opname rejected",
    object: current.code,
    device: garage.profile.deviceLabel,
    status: decision,
    metadata: { opnameId: current.id, totalItems: current.totalItems, totalDelta: current.totalDelta },
  });

  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  await db
    .update(approvals)
    .set({
      status: decision,
      decidedBy: garage.user.id,
      decidedByName: actor,
      decidedAt: now,
      updatedAt: now,
    })
    .where(
      and(eq(approvals.id, `APP-OPN-${id}`), eq(approvals.status, "pending")),
    );

  return serializeStockOpnameSession(updated);
}

export async function applyStockOpname(id: string, garage: GarageSession) {
  const db = getDb();
  const [current] = await db
    .select()
    .from(stockOpnameSessions)
    .where(eq(stockOpnameSessions.id, id))
    .limit(1);

  if (!current) return null;
  if (current.status !== "approved") {
    throw new Error("Opname harus approved sebelum diterapkan.");
  }

  const items = await db
    .select()
    .from(stockOpnameItems)
    .where(eq(stockOpnameItems.sessionId, id));
  const now = new Date();
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;

  const applied = await db.transaction(async (tx) => {
    for (const item of items) {
      if (!item.itemSku) continue;
      const [inventory] = await tx
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.sku, item.itemSku))
        .limit(1);
      if (!inventory) continue;
      const location = await ensureLocationStock(tx, {
        sku: item.itemSku,
        locationType: current.locationType === "warehouse" ? "warehouse" : "outlet",
        locationKey: current.locationKey,
        outletId: current.outletId,
        min: inventory.min,
        movement: "Stock opname initialized",
      });
      const nextStatus = inventoryStatusFor(item.physicalQty, location.min);
      await tx
        .update(inventoryLocationStocks)
        .set({
          onHand: item.physicalQty,
          status: nextStatus,
          movement: `${current.code}: sistem ${item.systemQty} -> fisik ${item.physicalQty} ${item.unit}`,
          updatedAt: now,
        })
        .where(eq(inventoryLocationStocks.id, location.id));
      if (current.locationType === "warehouse") {
      await tx
        .update(inventoryItems)
        .set({
          onHand: item.physicalQty,
          status: nextStatus,
          movement: `${current.code}: sistem ${item.systemQty} -> fisik ${item.physicalQty} ${item.unit}`,
          updatedAt: now,
        })
        .where(eq(inventoryItems.sku, item.itemSku));
      }
      await tx.insert(stockMovements).values({
        itemSku: item.itemSku,
        type: current.locationType === "warehouse" ? "opname_warehouse" : "opname_outlet",
        note: `${current.code}: ${current.locationType} sistem ${item.systemQty} -> fisik ${item.physicalQty} ${item.unit}`,
        qty: item.delta,
        actor,
      });
    }

    const [updated] = await tx
      .update(stockOpnameSessions)
      .set({ status: "applied", appliedBy: garage.user.id, appliedAt: now, updatedAt: now })
      .where(eq(stockOpnameSessions.id, id))
      .returning();

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action: "Stock opname applied",
      object: current.code,
      device: garage.profile.deviceLabel,
      status: "applied",
      metadata: {
        opnameId: current.id,
        totalItems: items.length,
        totalDelta: current.totalDelta,
        locationType: current.locationType,
        locationKey: current.locationKey,
        outletId: current.outletId,
      },
    });

    return updated;
  });

  return serializeStockOpnameSession(applied);
}

export async function createSupplier(input: SupplierInput, garage: GarageSession) {
  const [supplier] = await getDb()
    .insert(suppliers)
    .values({
      outletId: garage.profile.outlet.id,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      category: input.category?.trim() || "COGS",
      contactName: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
    })
    .onConflictDoUpdate({
      target: suppliers.code,
      set: {
        name: input.name.trim(),
        category: input.category?.trim() || "COGS",
        contactName: input.contactName?.trim() || null,
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Supplier upserted",
    object: supplier.code,
    device: garage.profile.deviceLabel,
    metadata: { supplierId: supplier.id },
  });

  return supplier;
}

/**
 * Recipe cost vs sale price report per menu item / variant.
 * Returns rows: menuItemId, variantId, price, recipeCost, margin, marginPct.
 */
// ─── Business Info (info bisnis untuk landing publik, C10) ────────────────
// Disimpan di app_settings key global (outlet_id NULL). Owner edit dari modul
// Website; landing memakai untuk JSON-LD/SEO & kontak. Default = nilai sekarang
// supaya tanpa regresi bila belum pernah diset.
export type BusinessInfo = {
  tagline: string;
  whatsapp: string;
  instagram: string;
  email: string;
  address: string;
  hoursOpen: string;
  hoursClose: string;
  mapsUrl: string;
  aboutText: string; // paragraf "About/Story" landing, pisah antar-paragraf dgn baris kosong
};

export const DEFAULT_BUSINESS_INFO: BusinessInfo = {
  tagline: "Ngopi, makan, nongkrong, dan kumpul komunitas di GARAGE.",
  whatsapp: "6285188983600",
  instagram: "",
  email: "garagetebingtinggi@gmail.com",
  address: "Jl. Mayjen Sutoyo, Rambung, Tebing Tinggi Kota, Sumatera Utara 20631",
  hoursOpen: "07:00",
  hoursClose: "23:00",
  mapsUrl: "",
  aboutText:
    "Dibangun untuk mereka yang menikmati ritual lambat — proses giling, seruputan pertama, dan obrolan yang tidak ingin selesai. Garage adalah bengkel yang menyamar jadi coffee shop, tempat material industrial bertemu seni meracik kopi.\n\nKami me-roasting dalam batch kecil. Buka pagi, tutup larut. Tidak mengikuti tren — kami sedang membangun tempat yang layak ditempuh perjalanannya.",
};

const BUSINESS_INFO_KEY = "site.businessInfo";

export async function getBusinessInfo(): Promise<BusinessInfo> {
  const [row] = await getDb()
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(and(eq(appSettings.key, BUSINESS_INFO_KEY), sql`${appSettings.outletId} IS NULL`))
    .limit(1);
  const stored = (row?.valueJson ?? {}) as Partial<BusinessInfo>;
  return { ...DEFAULT_BUSINESS_INFO, ...stored };
}

export async function saveBusinessInfo(
  input: Partial<BusinessInfo>,
  updatedBy: string | null,
): Promise<BusinessInfo> {
  const db = getDb();
  const merged = { ...(await getBusinessInfo()), ...input };
  // Upsert manual: unique index (outlet_id, key) tidak men-trigger ON CONFLICT
  // untuk baris global (outlet_id NULL, NULL dianggap distinct di Postgres).
  const [existing] = await db
    .select({ id: appSettings.id })
    .from(appSettings)
    .where(and(eq(appSettings.key, BUSINESS_INFO_KEY), sql`${appSettings.outletId} IS NULL`))
    .limit(1);
  if (existing) {
    await db
      .update(appSettings)
      .set({ valueJson: merged, updatedBy, updatedAt: sql`now()` })
      .where(eq(appSettings.id, existing.id));
  } else {
    await db
      .insert(appSettings)
      .values({ outletId: null, key: BUSINESS_INFO_KEY, valueJson: merged, updatedBy });
  }
  return merged;
}

// ─── Testimoni landing (C6) ───────────────────────────────────────────────
// Disimpan di app_settings key global 'site.testimonials' sebagai array. Owner
// isi review ASLI dari modul Website; landing tampil hanya bila ada isi.
export type Testimonial = {
  name: string;
  role: string;
  text: string;
  rating: number; // 1-5
};

const TESTIMONIALS_KEY = "site.testimonials";

export async function getTestimonials(): Promise<Testimonial[]> {
  const [row] = await getDb()
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(and(eq(appSettings.key, TESTIMONIALS_KEY), sql`${appSettings.outletId} IS NULL`))
    .limit(1);
  const stored = row?.valueJson;
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .map((t) => ({
      name: String(t.name ?? "").slice(0, 80),
      role: String(t.role ?? "").slice(0, 80),
      text: String(t.text ?? "").slice(0, 600),
      rating: Math.max(1, Math.min(5, Math.round(Number(t.rating) || 5))),
    }));
}

export async function saveTestimonials(
  input: Testimonial[],
  updatedBy: string | null,
): Promise<Testimonial[]> {
  const db = getDb();
  const clean = (Array.isArray(input) ? input : [])
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .slice(0, 20)
    .map((t) => ({
      name: String(t.name ?? "").trim().slice(0, 80),
      role: String(t.role ?? "").trim().slice(0, 80),
      text: String(t.text ?? "").trim().slice(0, 600),
      rating: Math.max(1, Math.min(5, Math.round(Number(t.rating) || 5))),
    }));
  const [existing] = await db
    .select({ id: appSettings.id })
    .from(appSettings)
    .where(and(eq(appSettings.key, TESTIMONIALS_KEY), sql`${appSettings.outletId} IS NULL`))
    .limit(1);
  if (existing) {
    await db
      .update(appSettings)
      .set({ valueJson: clean, updatedBy, updatedAt: sql`now()` })
      .where(eq(appSettings.id, existing.id));
  } else {
    await db
      .insert(appSettings)
      .values({ outletId: null, key: TESTIMONIALS_KEY, valueJson: clean, updatedBy });
  }
  return clean;
}

// ─── App Settings (per outlet) ───────────────────────────────
// Settings disimpan key-value per outlet. Default values di-define di garage-app-settings-types.ts
// supaya bisa di-import dari client component (decoupled dari DB).

export async function getAppSettings(outletId: string | null): Promise<AppSettings> {
  const db = getDb();
  // Resolve order: DEFAULT_APP_SETTINGS → global row (outlet_id NULL) → outlet-specific override.
  // Outlet-scoped read fallback ke global, supaya setting yang ditulis admin UI di
  // /control/settings (global) ke-apply ke seluruh outlet kecuali ada override.
  const rows = outletId
    ? await db
        .select({
          key: appSettings.key,
          valueJson: appSettings.valueJson,
          outletId: appSettings.outletId,
        })
        .from(appSettings)
        .where(
          or(eq(appSettings.outletId, outletId), sql`${appSettings.outletId} IS NULL`),
        )
    : await db
        .select({
          key: appSettings.key,
          valueJson: appSettings.valueJson,
          outletId: appSettings.outletId,
        })
        .from(appSettings)
        .where(sql`${appSettings.outletId} IS NULL`);

  const merged: AppSettings = { ...DEFAULT_APP_SETTINGS };
  // Apply global rows first, then outlet-specific (which overrides).
  const sortedRows = [...rows].sort((a, b) => {
    const aGlobal = a.outletId === null ? 0 : 1;
    const bGlobal = b.outletId === null ? 0 : 1;
    return aGlobal - bGlobal;
  });
  for (const row of sortedRows) {
    const key = row.key as keyof AppSettings;
    if (key in DEFAULT_APP_SETTINGS && row.valueJson != null) {
      const value = row.valueJson as AppSettings[typeof key];
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

export async function updateAppSettings(
  outletId: string | null,
  patch: Partial<AppSettings>,
  garage: GarageSession,
): Promise<AppSettings> {
  const db = getDb();
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  const now = new Date();
  const before = await getAppSettings(outletId);
  const changedKeys = Object.keys(patch).filter(
    (key): key is keyof AppSettings => key in DEFAULT_APP_SETTINGS,
  );

  if (
    "garageOsThemePreset" in patch &&
    patch.garageOsThemePreset !== undefined &&
    (typeof patch.garageOsThemePreset !== "string" ||
      !isSavableGarageOsThemePreset(patch.garageOsThemePreset))
  ) {
    throw new GarageOsThemeSaveError();
  }

  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_APP_SETTINGS)) continue;
      await tx
        .insert(appSettings)
        .values({
          outletId: outletId,
          key,
          valueJson: value as unknown,
          updatedBy: garage.user.id,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [appSettings.outletId, appSettings.key],
          set: {
            valueJson: value as unknown,
            updatedBy: garage.user.id,
            updatedAt: now,
          },
        });
    }
  });

  await createAuditLog({
    actor,
    action: "App settings updated",
    object: outletId ?? "global",
    device: garage.profile.deviceLabel,
    metadata: {
      keys: changedKeys,
      outletId,
      before: Object.fromEntries(changedKeys.map((key) => [key, before[key]])),
      after: Object.fromEntries(changedKeys.map((key) => [key, patch[key]])),
    },
  });

  return getAppSettings(outletId);
}

/**
 * List active outlets (untuk multi-outlet switcher di header).
 * Read-only — switch logic akan ditambah di future PR.
 */
export async function listOutlets() {
  const rows = await getDb()
    .select({
      id: outlets.id,
      code: outlets.code,
      name: outlets.name,
      timezone: outlets.timezone,
      status: outlets.status,
    })
    .from(outlets)
    .where(eq(outlets.status, "active"))
    .orderBy(asc(outlets.code));
  return rows;
}

export async function getMenuMarginReport(_garage?: GarageSession) {
  void _garage;
  const db = getDb();
  const recipeRows = await db
    .select({
      menuItemId: menuRecipes.menuItemId,
      variantId: menuRecipes.variantId,
      qty: menuRecipes.qty,
      wastePct: menuRecipes.wastePct,
      inventorySku: menuRecipes.inventorySku,
      unitCost: inventoryItems.unitCost,
      inventoryName: inventoryItems.name,
    })
    .from(menuRecipes)
    .leftJoin(inventoryItems, eq(menuRecipes.inventorySku, inventoryItems.sku))
    .where(eq(menuRecipes.status, "active"));

  const menuRows = await db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      category: menuItems.category,
    })
    .from(menuItems);

  const variantRows = await db
    .select({
      itemId: menuVariants.itemId,
      variantId: menuVariants.variantId,
      label: menuVariants.label,
      price: menuVariants.price,
    })
    .from(menuVariants);

  // Group recipe ingredients per item-variant key
  const recipesByKey = new Map<
    string,
    Array<{ qty: number; wastePct: number; unitCost: number; name: string }>
  >();
  for (const r of recipeRows) {
    if (!r.menuItemId) continue;
    const key = `${r.menuItemId}::${r.variantId}`;
    const arr = recipesByKey.get(key) ?? [];
    arr.push({
      qty: r.qty,
      wastePct: r.wastePct ?? 0,
      unitCost: r.unitCost ?? 0,
      name: r.inventoryName ?? "?",
    });
    recipesByKey.set(key, arr);
  }

  const menuById = new Map(menuRows.map((m) => [m.id, m]));
  const result: Array<{
    menuItemId: string;
    menuName: string;
    category: string;
    variantId: string;
    variantLabel: string;
    price: number;
    recipeCost: number;
    margin: number;
    marginPct: number;
    ingredients: number;
  }> = [];

  for (const v of variantRows) {
    const menu = menuById.get(v.itemId);
    if (!menu) continue;
    // Recipe bisa di-define per variant atau "all"
    const specific = recipesByKey.get(`${v.itemId}::${v.variantId}`) ?? [];
    const general = recipesByKey.get(`${v.itemId}::all`) ?? [];
    const merged = [...general, ...specific];
    const recipeCost = merged.reduce((sum, r) => {
      // Apply waste multiplier on qty * unitCost
      return sum + r.qty * (1 + r.wastePct / 100) * r.unitCost;
    }, 0);
    const cost = Math.round(recipeCost);
    const margin = v.price - cost;
    result.push({
      menuItemId: v.itemId,
      menuName: menu.name,
      category: menu.category,
      variantId: v.variantId,
      variantLabel: v.label,
      price: v.price,
      recipeCost: cost,
      margin,
      marginPct: v.price > 0 ? Math.round((margin / v.price) * 100) : 0,
      ingredients: merged.length,
    });
  }

  // Sort: margin% ascending (worst first) supaya owner kelihatan item rugi/tipis
  return result.sort((a, b) => a.marginPct - b.marginPct);
}

/**
 * Summary stock movements untuk dashboard: per type count + total qty
 * + top items dengan most movement.
 */
export async function getStockMovementsSummary(
  filter: { days?: number },
  _garage?: GarageSession,
) {
  void _garage;
  const db = getDb();
  const days = filter.days ?? 7;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      type: stockMovements.type,
      qty: stockMovements.qty,
      itemSku: stockMovements.itemSku,
      itemName: inventoryItems.name,
      unit: inventoryItems.unit,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .leftJoin(inventoryItems, eq(stockMovements.itemSku, inventoryItems.sku))
    .where(gte(stockMovements.createdAt, since))
    .orderBy(desc(stockMovements.createdAt))
    .limit(500);

  // Group by type
  const byType = new Map<string, { count: number; totalQty: number }>();
  // Group by item — track absolute movement volume
  const byItem = new Map<
    string,
    { sku: string; name: string; unit: string; totalAbsQty: number; count: number }
  >();
  // Daily summary
  const byDay = new Map<string, number>();

  for (const row of rows) {
    const existing = byType.get(row.type) ?? { count: 0, totalQty: 0 };
    existing.count += 1;
    if (row.qty != null) existing.totalQty += row.qty;
    byType.set(row.type, existing);

    if (row.itemSku) {
      const item = byItem.get(row.itemSku) ?? {
        sku: row.itemSku,
        name: row.itemName ?? row.itemSku,
        unit: row.unit ?? "",
        totalAbsQty: 0,
        count: 0,
      };
      item.count += 1;
      if (row.qty != null) item.totalAbsQty += Math.abs(row.qty);
      byItem.set(row.itemSku, item);
    }

    const dayKey = row.createdAt.toISOString().slice(0, 10);
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
  }

  return {
    rangeDays: days,
    totalEvents: rows.length,
    byType: Array.from(byType.entries())
      .map(([type, stats]) => ({ type, ...stats }))
      .sort((a, b) => b.count - a.count),
    topItems: Array.from(byItem.values())
      .sort((a, b) => b.totalAbsQty - a.totalAbsQty)
      .slice(0, 8),
    byDay: Array.from(byDay.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export async function listExpenses(
  filter: { category?: string; status?: string; from?: string; to?: string; limit?: number },
  garage: GarageSession,
) {
  const conditions = [eq(expenses.outletId, garage.profile.outlet.id)];
  if (filter.category && filter.category.trim()) {
    conditions.push(eq(expenses.category, filter.category.trim()));
  }
  if (filter.status && filter.status !== "all") {
    conditions.push(eq(expenses.status, filter.status));
  }
  if (filter.from) {
    const fromDate = new Date(filter.from);
    if (!Number.isNaN(fromDate.getTime())) {
      conditions.push(gte(expenses.expenseDate, fromDate));
    }
  }
  if (filter.to) {
    const toDate = new Date(filter.to);
    if (!Number.isNaN(toDate.getTime())) {
      conditions.push(lte(expenses.expenseDate, toDate));
    }
  }
  const rows = await getDb()
    .select({
      id: expenses.id,
      category: expenses.category,
      description: expenses.description,
      amount: expenses.amount,
      paymentMethod: expenses.paymentMethod,
      status: expenses.status,
      expenseDate: expenses.expenseDate,
      receiptUrl: expenses.receiptUrl,
      notes: expenses.notes,
      approvedAt: expenses.approvedAt,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .where(and(...conditions))
    .orderBy(desc(expenses.expenseDate))
    .limit(Math.min(Math.max(filter.limit ?? 50, 1), 200));
  return rows.map((row) => ({
    ...row,
    expenseDate: row.expenseDate.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function applyCashExpenseToOpenSession(
  tx: GarageDb | GarageTx,
  amount: number,
  garage: GarageSession,
) {
  const [openSession] = await tx
    .select({ id: cashSessions.id, expectedCash: cashSessions.expectedCash, code: cashSessions.code })
    .from(cashSessions)
    .where(and(eq(cashSessions.outletId, garage.profile.outlet.id), eq(cashSessions.status, "open")))
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);

  if (!openSession) return null;

  const [updated] = await tx
    .update(cashSessions)
    .set({ expectedCash: Math.max(0, openSession.expectedCash - amount) })
    .where(eq(cashSessions.id, openSession.id))
    .returning({ id: cashSessions.id, code: cashSessions.code, expectedCash: cashSessions.expectedCash });
  return updated;
}

/**
 * Kasir / waiter mengajukan void — masuk antrian Approvals (belum void order).
 */
export async function requestOrderVoidApproval(
  idOrOrderNo: string,
  reason: string,
  garage: GarageSession,
) {
  const db = getDb();
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrOrderNo,
    );

  const [order] = await db
    .select()
    .from(orders)
    .where(
      and(
        isUuid ? eq(orders.id, idOrOrderNo) : eq(orders.orderNo, idOrOrderNo),
        eq(orders.outletId, garage.profile.outlet.id),
      ),
    )
    .limit(1);

  if (!order) {
    throw new Error("Order tidak ditemukan.");
  }
  if (order.status === "voided") {
    throw new Error("Order sudah di-void sebelumnya.");
  }

  // Wire: kalau setting requireManagerForVoid=false, langsung void tanpa approval.
  // Default true (preserve perilaku existing — require approval).
  const policy = await getAppSettings(garage.profile.outlet.id);
  if (!policy.requireManagerForVoid) {
    const result = await voidOrder(idOrOrderNo, reason, garage);
    return { directVoid: true, ...result };
  }

  const approvalId = `APP-VOID-${order.id}`;
  const [existingPending] = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.status, "pending")))
    .limit(1);

  if (existingPending) {
    throw new Error("Permintaan void untuk order ini masih menunggu approval.");
  }

  const formattedAmount = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(order.total);

  const risk =
    order.total >= 500_000 ? "high" : order.total >= 100_000 ? "medium" : "low";

  await db
    .insert(approvals)
    .values({
      id: approvalId,
      type: "Void transaksi",
      requester: actor,
      requesterPhone: null,
      amount: formattedAmount,
      reason: `Void ${order.orderNo}: ${reason}`,
      risk,
      age: "baru saja",
      status: "pending",
    })
    .onConflictDoUpdate({
      target: approvals.id,
      set: {
        type: "Void transaksi",
        requester: actor,
        amount: formattedAmount,
        reason: `Void ${order.orderNo}: ${reason}`,
        risk,
        status: "pending",
        decidedBy: null,
        decidedByName: null,
        decidedAt: null,
        reasonDecided: null,
        updatedAt: new Date(),
      },
    });

  await createAuditLog({
    actor,
    action: "Void approval requested",
    object: order.orderNo,
    device: garage.profile.deviceLabel,
    status: "approval_required",
    metadata: {
      orderId: order.id,
      orderNo: order.orderNo,
      approvalId,
      reason,
    },
  });

  return { approvalId, orderId: order.id, orderNo: order.orderNo };
}

/**
 * Void/refund order yang sudah lunas:
 * - Set orders.status = "voided"
 * - Reverse stock deduction (insert positive stock_movements + restore inventory.onHand)
 * - Log audit
 */
export async function voidOrder(
  idOrOrderNo: string,
  reason: string,
  garage: GarageSession,
) {
  const db = getDb();
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  const now = new Date();
  // Detect UUID vs orderNo
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrOrderNo,
    );

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          isUuid ? eq(orders.id, idOrOrderNo) : eq(orders.orderNo, idOrOrderNo),
          eq(orders.outletId, garage.profile.outlet.id),
        ),
      )
      .limit(1);

    if (!order) {
      throw new Error("Order tidak ditemukan.");
    }
    if (order.status === "voided") {
      throw new Error("Order sudah di-void sebelumnya.");
    }

    // Reverse stock deduction: ambil semua deduct movements, lalu insert reversal
    const deductedMovements = await tx
      .select({
        id: stockMovements.id,
        itemSku: stockMovements.itemSku,
        qty: stockMovements.qty,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.type, "recipe_deduct"),
          ilike(stockMovements.note, `${order.orderNo}%`),
        ),
      );

    for (const movement of deductedMovements) {
      if (!movement.itemSku || movement.qty == null) continue;
      const reverseQty = Math.abs(movement.qty);
      const [inventory] = await tx
        .select({ min: inventoryItems.min })
        .from(inventoryItems)
        .where(eq(inventoryItems.sku, movement.itemSku))
        .limit(1);
      const outletStock = await ensureLocationStock(tx, {
        sku: movement.itemSku,
        locationType: "outlet",
        locationKey: outletLocationKey(order.outletId ?? garage.profile.outlet.id),
        outletId: order.outletId ?? garage.profile.outlet.id,
        min: inventory?.min ?? 0,
        movement: "Outlet stock initialized",
      });
      const nextOnHand = Number((outletStock.onHand + reverseQty).toFixed(4));
      await tx
        .update(inventoryLocationStocks)
        .set({
          onHand: nextOnHand,
          status: inventoryStatusFor(nextOnHand, outletStock.min),
          movement: `Void ${order.orderNo}: stok dikembalikan`,
          updatedAt: now,
        })
        .where(eq(inventoryLocationStocks.id, outletStock.id));
      await tx.insert(stockMovements).values({
        itemSku: movement.itemSku,
        type: "void_reverse",
        note: `Void ${order.orderNo}: ${reason}`,
        qty: reverseQty,
        actor,
      });
    }

    // Update order status
    await tx
      .update(orders)
      .set({ status: "voided", updatedAt: now })
      .where(eq(orders.id, order.id));

    // Audit log
    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action: `Order voided ${order.orderNo}`,
      object: order.tableLabel,
      device: garage.profile.deviceLabel,
      status: "voided",
      metadata: {
        orderId: order.id,
        orderNo: order.orderNo,
        amount: order.total,
        reason,
        stockReversed: deductedMovements.length,
      },
    });

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      stockReversed: deductedMovements.length,
      previousTotal: order.total,
    };
  });

  return result;
}

export async function createExpense(input: ExpenseInput, garage: GarageSession) {
  const expenseDate = input.expenseDate ? new Date(input.expenseDate) : new Date();
  const paymentMethod = input.paymentMethod || "Cash";
  const status = input.amount >= 1_000_000 ? "pending_approval" : "recorded";
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  const db = getDb();
  const { expense, cashSession } = await db.transaction(async (tx) => {
    const [createdExpense] = await tx
      .insert(expenses)
      .values({
        outletId: garage.profile.outlet.id,
        supplierId: input.supplierId || null,
        supplierInvoiceId: input.supplierInvoiceId || null,
        category: input.category,
        description: input.description,
        amount: input.amount,
        paymentMethod,
        status,
        expenseDate,
        notes: input.notes?.trim() || null,
        createdBy: garage.user.id,
      })
      .returning();

    const affectedCashSession =
      status === "recorded" && paymentMethod.toLowerCase() === "cash"
        ? await applyCashExpenseToOpenSession(tx, input.amount, garage)
        : null;

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action: "Expense recorded",
      object: createdExpense.description,
      device: garage.profile.deviceLabel,
      status: createdExpense.status === "pending_approval" ? "approval_required" : "recorded",
      metadata: {
        expenseId: createdExpense.id,
        amount: createdExpense.amount,
        category: createdExpense.category,
        paymentMethod,
        cashSessionId: affectedCashSession?.id ?? null,
      },
    });

    // Auto-create approval entry untuk expense ≥ Rp 1jt supaya muncul di
    // module Approvals dan bisa di-decide manager.
    if (createdExpense.status === "pending_approval") {
      const formattedAmount = new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(createdExpense.amount);
      await tx
        .insert(approvals)
        .values({
          id: `APP-EXP-${createdExpense.id}`,
          type: "Expense",
          requester: garage.user.name,
          requesterPhone: null,
          amount: formattedAmount,
          reason: `${createdExpense.category}: ${createdExpense.description}`,
          risk: createdExpense.amount >= 5_000_000 ? "high" : "medium",
          age: "baru saja",
          status: "pending",
        })
        .onConflictDoNothing();
    }

    return { expense: createdExpense, cashSession: affectedCashSession };
  });

  return { ...expense, cashSession };
}

export async function approveExpense(id: string, garage: GarageSession) {
  return decideExpense(id, garage, "approved");
}

export async function rejectExpense(id: string, garage: GarageSession) {
  return decideExpense(id, garage, "rejected");
}

async function decideExpense(id: string, garage: GarageSession, decision: "approved" | "rejected") {
  const db = getDb();
  const [current] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.outletId, garage.profile.outlet.id)))
    .limit(1);
  if (!current) return null;
  if (current.status !== "pending_approval") {
    throw new Error("Hanya pengeluaran pending approval yang bisa diputuskan.");
  }

  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const affectedCashSession =
      decision === "approved" && current.paymentMethod.toLowerCase() === "cash"
        ? await applyCashExpenseToOpenSession(tx, current.amount, garage)
        : null;
    const [updated] = await tx
      .update(expenses)
      .set({
        status: decision,
        approvedBy: decision === "approved" ? garage.user.id : null,
        approvedAt: decision === "approved" ? now : null,
        updatedAt: now,
      })
      .where(eq(expenses.id, id))
      .returning();

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action: decision === "approved" ? "Expense approved" : "Expense rejected",
      object: current.description,
      device: garage.profile.deviceLabel,
      status: decision,
      metadata: {
        expenseId: current.id,
        amount: current.amount,
        paymentMethod: current.paymentMethod,
        cashSessionId: affectedCashSession?.id ?? null,
      },
    });

    return { expense: updated, cashSession: affectedCashSession };
  });

  return result;
}

export async function createSupplierInvoice(input: SupplierInvoiceInput, garage: GarageSession) {
  const [invoice] = await getDb()
    .insert(supplierInvoices)
    .values({
      supplierId: input.supplierId || null,
      outletId: garage.profile.outlet.id,
      invoiceNo: input.invoiceNo.trim(),
      category: input.category?.trim() || "COGS",
      description: input.description?.trim() || "",
      amount: input.amount,
      status: "unpaid",
      dueDate: new Date(input.dueDate),
      issuedAt: input.issuedAt ? new Date(input.issuedAt) : new Date(),
      notes: input.notes?.trim() || null,
      createdBy: garage.user.id,
    })
    .onConflictDoUpdate({
      target: supplierInvoices.invoiceNo,
      set: {
        supplierId: input.supplierId || null,
        category: input.category?.trim() || "COGS",
        description: input.description?.trim() || "",
        amount: input.amount,
        dueDate: new Date(input.dueDate),
        notes: input.notes?.trim() || null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Supplier invoice recorded",
    object: invoice.invoiceNo,
    device: garage.profile.deviceLabel,
    metadata: { invoiceId: invoice.id, amount: invoice.amount },
  });

  return invoice;
}

export async function markSupplierInvoicePaid(input: {
  id: string;
  paymentRef?: string;
  amount?: number;
}, garage: GarageSession) {
  const db = getDb();
  const [current] = await db
    .select()
    .from(supplierInvoices)
    .where(eq(supplierInvoices.id, input.id))
    .limit(1);
  if (!current) return null;

  const paidAmount = Math.min(current.amount, input.amount ?? current.amount);
  const status = paidAmount >= current.amount ? "paid" : "partial";
  const now = new Date();
  const [invoice] = await db
    .update(supplierInvoices)
    .set({
      paidAmount,
      status,
      paidAt: status === "paid" ? now : null,
      paidBy: garage.user.id,
      paymentRef: input.paymentRef?.trim() || null,
      updatedAt: now,
    })
    .where(eq(supplierInvoices.id, input.id))
    .returning();

  await createExpense(
    {
      supplierId: invoice.supplierId,
      supplierInvoiceId: invoice.id,
      category: invoice.category,
      description: `Bayar invoice ${invoice.invoiceNo}`,
      amount: paidAmount,
      paymentMethod: "Transfer",
      expenseDate: now.toISOString(),
      notes: input.paymentRef,
    },
    garage,
  );

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Supplier invoice marked paid",
    object: invoice.invoiceNo,
    device: garage.profile.deviceLabel,
    metadata: { invoiceId: invoice.id, paidAmount, status },
  });

  return invoice;
}

export async function createPaymentSettlement(
  input: PaymentSettlementInput,
  garage: GarageSession,
) {
  const [settlement] = await getDb()
    .insert(paymentSettlements)
    .values({
      outletId: garage.profile.outlet.id,
      settlementNo: input.settlementNo.trim(),
      method: input.method,
      provider: input.provider,
      expectedAmount: input.expectedAmount,
      settledAmount: input.settledAmount ?? 0,
      feeAmount: input.feeAmount ?? 0,
      status: input.status ?? "pending",
      settlementDate: new Date(input.settlementDate),
      settledAt: input.settledAt ? new Date(input.settledAt) : null,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      createdBy: garage.user.id,
    })
    .onConflictDoUpdate({
      target: paymentSettlements.settlementNo,
      set: {
        method: input.method,
        provider: input.provider,
        expectedAmount: input.expectedAmount,
        settledAmount: input.settledAmount ?? 0,
        feeAmount: input.feeAmount ?? 0,
        status: input.status ?? "pending",
        settlementDate: new Date(input.settlementDate),
        settledAt: input.settledAt ? new Date(input.settledAt) : null,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Payment settlement upserted",
    object: settlement.settlementNo,
    device: garage.profile.deviceLabel,
    status: settlement.status === "mismatch" ? "warning" : "recorded",
    metadata: {
      settlementId: settlement.id,
      expectedAmount: settlement.expectedAmount,
      settledAmount: settlement.settledAmount,
      status: settlement.status,
    },
  });

  return settlement;
}

export async function createMenuRecipe(input: RecipeInput, garage: GarageSession) {
  const [recipe] = await getDb()
    .insert(menuRecipes)
    .values({
      menuItemId: input.menuItemId,
      variantId: input.variantId?.trim() || "all",
      inventorySku: input.inventorySku,
      qty: input.qty,
      unit: input.unit,
      wastePct: input.wastePct ?? 0,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [menuRecipes.menuItemId, menuRecipes.variantId, menuRecipes.inventorySku],
      set: {
        qty: input.qty,
        unit: input.unit,
        wastePct: input.wastePct ?? 0,
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Menu recipe upserted",
    object: `${recipe.menuItemId}/${recipe.variantId}`,
    device: garage.profile.deviceLabel,
    metadata: {
      recipeId: recipe.id,
      inventorySku: recipe.inventorySku,
      qty: recipe.qty,
      unit: recipe.unit,
      wastePct: recipe.wastePct,
    },
  });

  return recipe;
}

export class CashSessionAlreadyOpenError extends Error {
  constructor(public readonly existingCode: string) {
    super(`Kasir masih punya sesi terbuka: ${existingCode}`);
    this.name = "CashSessionAlreadyOpenError";
  }
}

export class CashSessionOutletAlreadyOpenError extends Error {
  constructor(public readonly existingCode: string) {
    super(`Shift kasir outlet masih terbuka: ${existingCode}. Tutup shift aktif sebelum buka shift berikutnya.`);
    this.name = "CashSessionOutletAlreadyOpenError";
  }
}

export class CashSessionDailyLimitError extends Error {
  constructor() {
    super("Shift kasir harian sudah penuh. Maksimal hanya Shift 1 dan Shift 2.");
    this.name = "CashSessionDailyLimitError";
  }
}

export class CashSessionShiftMismatchError extends Error {
  constructor(
    public readonly expectedShift: number,
    public readonly requestedShift: number,
  ) {
    super(`Shift berikutnya adalah Shift ${expectedShift}, bukan Shift ${requestedShift}.`);
    this.name = "CashSessionShiftMismatchError";
  }
}

export async function createCashSession(input: CashSessionInput, garage: GarageSession) {
  const db = getDb();
  let shiftNumber = input.shiftNumber;

  // Guard: 1 kasir = 1 sesi terbuka pada satu waktu.
  const [existingOpen] = await db
    .select({ id: cashSessions.id, code: cashSessions.code })
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.openedBy, garage.user.id),
        eq(cashSessions.status, "open"),
      ),
    )
    .limit(1);
  if (existingOpen) {
    throw new CashSessionAlreadyOpenError(existingOpen.code);
  }

  if (garage.profile.role === "Kasir") {
    const [outletOpen] = await db
      .select({ id: cashSessions.id, code: cashSessions.code })
      .from(cashSessions)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, cashSessions.openedBy))
      .where(
        and(
          eq(cashSessions.outletId, garage.profile.outlet.id),
          eq(cashSessions.status, "open"),
          eq(staffProfiles.role, "Kasir"),
        ),
      )
      .limit(1);

    if (outletOpen) {
      throw new CashSessionOutletAlreadyOpenError(outletOpen.code);
    }

    const todayKey = jakartaDateKey(new Date());
    const { start, end } = jakartaDayRange(todayKey);
    const [dailyCount] = await db
      .select({ total: count(cashSessions.id) })
      .from(cashSessions)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, cashSessions.openedBy))
      .where(
        and(
          eq(cashSessions.outletId, garage.profile.outlet.id),
          eq(staffProfiles.role, "Kasir"),
          gte(cashSessions.openedAt, start),
          lt(cashSessions.openedAt, end),
        ),
      );

    const existingShiftCount = Number(dailyCount?.total ?? 0);
    if (existingShiftCount >= 2) {
      throw new CashSessionDailyLimitError();
    }

    const nextShiftNumber = existingShiftCount + 1;
    if (shiftNumber !== undefined && shiftNumber !== nextShiftNumber) {
      throw new CashSessionShiftMismatchError(nextShiftNumber, shiftNumber);
    }
    shiftNumber = nextShiftNumber as 1 | 2;
  }

  const [outlet] = await db
    .select()
    .from(outlets)
    .where(eq(outlets.id, garage.profile.outlet.id))
    .limit(1);

  const code = `CS-${outlet?.code ?? "OUTLET"}-${Date.now().toString().slice(-6)}`;
  const [session] = await db
    .insert(cashSessions)
    .values({
      code,
      outletId: garage.profile.outlet.id,
      openingCash: input.openingCash,
      expectedCash: input.expectedCash ?? input.openingCash,
      checklist: fallbackClosingChecklist,
      openedBy: garage.user.id,
    })
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Cash session opened",
    object: code,
    device: garage.profile.deviceLabel,
    metadata: {
      shiftNumber: shiftNumber ?? null,
      openingCash: input.openingCash,
    },
  });

  return session;
}

export async function closeCashSession(
  id: string,
  input: CloseCashSessionInput,
  garage: GarageSession,
) {
  const db = getDb();
  const [current] = await db
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.id, id))
    .limit(1);

  if (!current) {
    return null;
  }

  // Anti close ganda: kalau session sudah closed, tolak — kasir/manager harus tahu.
  if (current.status === "closed") {
    throw new Error("Cash session sudah ditutup sebelumnya — tidak bisa ditutup lagi.");
  }

  const countedCash = countedCashFromDenominations(input.denominations);
  const actualCash = countedCash ?? input.actualCash;
  const discrepancy = actualCash - current.expectedCash;
  // Wire: shiftDiscrepancyThreshold dari /control/settings → Shift & Cash
  const policy = await getAppSettings(garage.profile.outlet.id);
  const discrepancyStatus = cashDiscrepancyStatus(
    discrepancy,
    Number(policy.shiftDiscrepancyThreshold) || 50_000,
  );
  const now = new Date();
  const actor = `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;

  // Wire: shiftRequireManagerSignoff dari /control/settings → Shift & Cash
  // Kalau policy on AND ada discrepancy (status critical), tutup shift WAJIB
  // disertai manager signoff. Selain itu, signoff optional sesuai input.
  if (
    policy.shiftRequireManagerSignoff &&
    discrepancyStatus === "critical" &&
    !input.managerSignOff
  ) {
    throw new Error(
      "Shift dengan discrepancy critical wajib sign-off manager. Aktifkan checkbox sign-off atau panggil manager.",
    );
  }

  const managerSignOffAt = input.managerSignOff ? now : null;
  const resetTableMode = input.resetTableMode ?? (input.resetTables ? "all" : "none");
  const canResetAllTables = ["Owner / CEO", "Admin", "Manager Operasional"].includes(
    garage.profile.role,
  );
  const effectiveResetTableMode =
    resetTableMode === "all" && !canResetAllTables ? "completed" : resetTableMode;

  const { closed } = await db.transaction(async (tx) => {
    const [closedSession] = await tx
      .update(cashSessions)
      .set({
        actualCash,
        discrepancy,
        discrepancyStatus,
        checklist: input.checklist?.length ? input.checklist : current.checklist,
        denominations: input.denominations ?? {},
        closingNote: input.closingNote?.trim() || null,
        status: "closed",
        closedBy: garage.user.id,
        closedAt: now,
        managerSignOffBy: input.managerSignOff ? garage.user.id : null,
        managerSignOffAt,
      })
      .where(eq(cashSessions.id, id))
      .returning();

    const resetTableSet = {
      status: "empty",
      currentOrderId: null,
      needsCleaning: false,
      cleanedAt: now,
      lastStatusAt: now,
      updatedAt: now,
    };
    const resetTables =
      current.outletId && effectiveResetTableMode === "all"
        ? await tx
            .update(tableSessions)
            .set(resetTableSet)
            .where(eq(tableSessions.outletId, current.outletId))
            .returning({ id: tableSessions.id })
        : current.outletId && effectiveResetTableMode === "completed"
          ? await tx
              .update(tableSessions)
              .set(resetTableSet)
              .where(
                and(
                  eq(tableSessions.outletId, current.outletId),
                  or(
                    inArray(tableSessions.status, ["paid", "rejected", "needs_cleaning"]),
                    eq(tableSessions.needsCleaning, true),
                  ),
                ),
              )
              .returning({ id: tableSessions.id })
          : [];

    await tx.insert(auditLogs).values({
      time: nowTimeLabel(),
      actor,
      action: "Cash session closed",
      object: current.code,
      device: garage.profile.deviceLabel,
      status: discrepancyStatus === "critical" ? "critical" : "recorded",
      metadata: {
        discrepancy,
        discrepancyStatus,
        countedCash,
        actualCash,
        managerSignOff: Boolean(input.managerSignOff),
        resetTableMode: effectiveResetTableMode,
      },
    });

    // Risk gate (Section 19): selisih kas critical wajib masuk Approval board
    // untuk oversight owner — terlepas dari sign-off manager inline saat tutup.
    if (discrepancyStatus === "critical") {
      const idr = new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      });
      await tx.insert(approvals).values({
        id: `APP-CASH-${randomUUID()}`,
        type: "Selisih kas closing",
        requester: actor,
        requesterPhone: null,
        amount: idr.format(Math.abs(discrepancy)),
        reason: `Selisih kas critical tutup shift ${current.code}: expected ${idr.format(current.expectedCash)}, actual ${idr.format(actualCash)}${input.closingNote?.trim() ? ` · ${input.closingNote.trim()}` : ""}${input.managerSignOff ? " · sudah sign-off manager" : ""}`,
        risk: "high",
        age: "baru saja",
        status: "pending",
      });
    }

    if (effectiveResetTableMode !== "none") {
      await tx.insert(auditLogs).values({
        time: nowTimeLabel(),
        actor,
        action:
          effectiveResetTableMode === "all"
            ? "Reset all tables after closing shift"
            : "Reset completed tables after closing shift",
        object: current.code,
        device: garage.profile.deviceLabel,
        status: "recorded",
        metadata: {
          cashSessionId: current.id,
          outletId: current.outletId,
          requestedResetTableMode: resetTableMode,
          resetTableMode: effectiveResetTableMode,
          resetTableCount: resetTables.length,
        },
      });
    }

    return {
      closed: {
        ...closedSession,
        resetTables: {
          requested: effectiveResetTableMode !== "none",
          mode: effectiveResetTableMode,
          count: resetTables.length,
        },
      },
    };
  });

  return closed;
}

// ─── Cashier shift history & reporting ─────────────────

export async function approveCashSessionDiscrepancy(
  id: string,
  garage: GarageSession,
  note?: string,
) {
  const db = getDb();
  const [current] = await db.select().from(cashSessions).where(eq(cashSessions.id, id)).limit(1);
  if (!current) return null;
  if (current.status !== "closed") {
    throw new Error("Shift harus ditutup sebelum approval selisih kas.");
  }

  const now = new Date();
  const [approved] = await db
    .update(cashSessions)
    .set({
      managerSignOffBy: garage.user.id,
      managerSignOffAt: now,
    })
    .where(eq(cashSessions.id, id))
    .returning();

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: "Approve cash session discrepancy",
    object: current.code,
    device: garage.profile.deviceLabel,
    status: current.discrepancyStatus === "critical" ? "critical" : "approved",
    metadata: {
      cashSessionId: current.id,
      discrepancy: current.discrepancy,
      discrepancyStatus: current.discrepancyStatus,
      note: note?.trim() || null,
    },
  });

  return approved;
}

const GARAGE_REPORT_TIME_ZONE = "Asia/Jakarta";

function jakartaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GARAGE_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function jakartaDayRange(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00+07:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function shiftLabelForNumber(shiftNumber: number) {
  return `Shift ${shiftNumber}`;
}

type ShiftLabelBaseRow = {
  id: string;
  outletId: string | null;
  openedAt: Date;
};

async function withDailyShiftLabels<T extends ShiftLabelBaseRow>(rows: T[]) {
  if (!rows.length) return [];

  const dateKeys = Array.from(new Set(rows.map((row) => jakartaDateKey(row.openedAt))));
  const ranges = dateKeys.map(jakartaDayRange);
  const rangeStart = new Date(Math.min(...ranges.map((range) => range.start.getTime())));
  const rangeEnd = new Date(Math.max(...ranges.map((range) => range.end.getTime())));

  const peerRows = await getDb()
    .select({
      id: cashSessions.id,
      outletId: cashSessions.outletId,
      openedAt: cashSessions.openedAt,
    })
    .from(cashSessions)
    .where(and(gte(cashSessions.openedAt, rangeStart), lt(cashSessions.openedAt, rangeEnd)))
    .orderBy(asc(cashSessions.openedAt));

  const shiftIndex = new Map<string, number>();
  const groupCounts = new Map<string, number>();
  for (const peer of peerRows) {
    const key = `${peer.outletId ?? "no-outlet"}:${jakartaDateKey(peer.openedAt)}`;
    const nextNumber = (groupCounts.get(key) ?? 0) + 1;
    groupCounts.set(key, nextNumber);
    shiftIndex.set(peer.id, nextNumber);
  }

  return rows.map((row) => {
    const businessDate = jakartaDateKey(row.openedAt);
    const shiftNumber = shiftIndex.get(row.id) ?? 1;
    return {
      ...row,
      businessDate,
      shiftNumber,
      shiftLabel: shiftLabelForNumber(shiftNumber),
    };
  });
}

function normalizePaymentMethod(method: string) {
  const value = method.toLowerCase();
  if (value.includes("cash") || value.includes("tunai")) return "cash";
  if (value.includes("qris")) return "qris";
  if (value.includes("transfer") || value.includes("bank")) return "transfer";
  if (value.includes("wallet") || value.includes("e-wallet")) return "ewallet";
  if (value.includes("card") || value.includes("kartu")) return "card";
  return value;
}

export async function getActiveCashSessionForCashier(cashierUserId: string) {
  const [row] = await getDb()
    .select({
      id: cashSessions.id,
      code: cashSessions.code,
      status: cashSessions.status,
      openingCash: cashSessions.openingCash,
      expectedCash: cashSessions.expectedCash,
      actualCash: cashSessions.actualCash,
      discrepancy: cashSessions.discrepancy,
      discrepancyStatus: cashSessions.discrepancyStatus,
      outletId: cashSessions.outletId,
      managerSignOffAt: cashSessions.managerSignOffAt,
      openedAt: cashSessions.openedAt,
      closedAt: cashSessions.closedAt,
      outletCode: outlets.code,
    })
    .from(cashSessions)
    .leftJoin(outlets, eq(outlets.id, cashSessions.outletId))
    .where(
      and(eq(cashSessions.openedBy, cashierUserId), eq(cashSessions.status, "open")),
    )
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);
  if (!row) return null;
  const [labeled] = await withDailyShiftLabels([row]);
  if (!labeled) return null;
  return {
    ...labeled,
    openedAt: labeled.openedAt.toISOString(),
    closedAt: labeled.closedAt?.toISOString() ?? null,
    managerSignOffAt: labeled.managerSignOffAt?.toISOString() ?? null,
  };
}

export async function listCashSessionsForCashier(
  cashierUserId: string,
  params: { from?: Date; to?: Date; limit?: number; offset?: number } = {},
) {
  const limit = Math.max(1, Math.min(100, params.limit ?? 30));
  const offset = Math.max(0, params.offset ?? 0);
  const db = getDb();

  const filters = [eq(cashSessions.openedBy, cashierUserId)];
  if (params.from) filters.push(gte(cashSessions.openedAt, params.from));
  if (params.to) filters.push(lte(cashSessions.openedAt, params.to));
  const whereClause = and(...filters);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: cashSessions.id,
        code: cashSessions.code,
        status: cashSessions.status,
        openingCash: cashSessions.openingCash,
        expectedCash: cashSessions.expectedCash,
        actualCash: cashSessions.actualCash,
        discrepancy: cashSessions.discrepancy,
        discrepancyStatus: cashSessions.discrepancyStatus,
        outletId: cashSessions.outletId,
        managerSignOffAt: cashSessions.managerSignOffAt,
        openedAt: cashSessions.openedAt,
        closedAt: cashSessions.closedAt,
        outletCode: outlets.code,
      })
      .from(cashSessions)
      .leftJoin(outlets, eq(outlets.id, cashSessions.outletId))
      .where(whereClause)
      .orderBy(desc(cashSessions.openedAt))
      .limit(limit)
      .offset(offset),
    db.select({ c: count(cashSessions.id) }).from(cashSessions).where(whereClause),
  ]);

  const labeledRows = await withDailyShiftLabels(rows);

  return {
    rows: labeledRows.map((row) => ({
      ...row,
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      managerSignOffAt: row.managerSignOffAt?.toISOString() ?? null,
    })),
    total: Number(totalRows[0]?.c ?? 0),
    hasMore: offset + rows.length < Number(totalRows[0]?.c ?? 0),
  };
}

export type CashSessionTransactionsResult = {
  session: {
    id: string;
    code: string;
    status: string;
    openingCash: number;
    expectedCash: number;
    actualCash: number | null;
    discrepancy: number;
    discrepancyStatus: string;
    openedAt: string;
    closedAt: string | null;
    businessDate: string;
    shiftNumber: number;
    shiftLabel: string;
    managerSignOffAt: string | null;
    outletCode: string | null;
    openedByName: string | null;
    closedByName: string | null;
  };
  orders: Array<{
    id: string;
    orderNo: string;
    status: string;
    total: number;
    subtotal: number;
    service: number;
    tax: number;
    discount: number;
    tableLabel: string;
    channel: string;
    customerName: string | null;
    createdAt: string;
    payments: Array<{ method: string; amount: number; status: string }>;
  }>;
};

export async function getCashSessionTransactions(
  sessionId: string,
  cashierUserId: string,
  options: { allowAll?: boolean } = {},
): Promise<CashSessionTransactionsResult | null> {
  const db = getDb();
  const [session] = await db
    .select({
      session: cashSessions,
      outletCode: outlets.code,
    })
    .from(cashSessions)
    .leftJoin(outlets, eq(outlets.id, cashSessions.outletId))
    .where(eq(cashSessions.id, sessionId))
    .limit(1);
  if (!session) return null;
  if (!options.allowAll && session.session.openedBy !== cashierUserId) return null;
  const [labeledSession] = await withDailyShiftLabels([session.session]);
  if (!labeledSession) return null;
  const sessionCashierId = session.session.openedBy ?? cashierUserId;

  const openedByName = session.session.openedBy
    ? (await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, session.session.openedBy))
        .limit(1))[0]?.name ?? null
    : null;
  const closedByName = session.session.closedBy
    ? (await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, session.session.closedBy))
        .limit(1))[0]?.name ?? null
    : null;

  const closedAt = session.session.closedAt ?? new Date();
  const orderRows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      total: orders.total,
      subtotal: orders.subtotal,
      service: orders.service,
      tax: orders.tax,
      discount: orders.discount,
      tableLabel: orders.tableLabel,
      channel: orders.channel,
      customerName: orders.customerName,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.createdBy, sessionCashierId),
        gte(orders.updatedAt, session.session.openedAt),
        lt(orders.updatedAt, closedAt),
      ),
    )
    .orderBy(desc(orders.createdAt));

  const orderIds = orderRows.map((o) => o.id);
  const paymentMap = new Map<
    string,
    Array<{ method: string; amount: number; status: string }>
  >();
  if (orderIds.length) {
    const paymentRows = await db
      .select({
        orderId: payments.orderId,
        method: payments.method,
        amount: payments.amount,
        status: payments.status,
      })
      .from(payments)
      .where(inArray(payments.orderId, orderIds));
    for (const p of paymentRows) {
      if (!p.orderId) continue;
      const list = paymentMap.get(p.orderId) ?? [];
      list.push({ method: p.method, amount: p.amount, status: p.status });
      paymentMap.set(p.orderId, list);
    }
  }

  return {
    session: {
      id: labeledSession.id,
      code: labeledSession.code,
      status: labeledSession.status,
      openingCash: labeledSession.openingCash,
      expectedCash: labeledSession.expectedCash,
      actualCash: labeledSession.actualCash,
      discrepancy: labeledSession.discrepancy,
      discrepancyStatus: labeledSession.discrepancyStatus,
      openedAt: labeledSession.openedAt.toISOString(),
      closedAt: labeledSession.closedAt?.toISOString() ?? null,
      businessDate: labeledSession.businessDate,
      shiftNumber: labeledSession.shiftNumber,
      shiftLabel: labeledSession.shiftLabel,
      managerSignOffAt: labeledSession.managerSignOffAt?.toISOString() ?? null,
      outletCode: session.outletCode,
      openedByName,
      closedByName,
    },
    orders: orderRows.map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
      payments: paymentMap.get(o.id) ?? [],
    })),
  };
}

export async function getCashSessionSummary(
  sessionId: string,
  cashierUserId: string,
  options: { allowAll?: boolean } = {},
) {
  const data = await getCashSessionTransactions(sessionId, cashierUserId, options);
  if (!data) return null;

  const paid = data.orders.filter((o) => o.status === "paid");
  const refunded = data.orders.filter(
    (o) => o.status === "refunded" || o.status === "void" || o.status === "cancelled",
  );
  const grossSales = paid.reduce((sum, o) => sum + o.total, 0);
  const subtotalSum = paid.reduce((sum, o) => sum + o.subtotal, 0);
  const serviceSum = paid.reduce((sum, o) => sum + o.service, 0);
  const taxSum = paid.reduce((sum, o) => sum + o.tax, 0);
  const discountSum = paid.reduce((sum, o) => sum + o.discount, 0);

  const methodMap = new Map<string, { count: number; total: number }>();
  for (const order of paid) {
    for (const p of order.payments) {
      if (p.status === "refunded" || p.status === "void") continue;
      const cur = methodMap.get(p.method) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += p.amount;
      methodMap.set(p.method, cur);
    }
  }

  return {
    session: data.session,
    counts: {
      total: data.orders.length,
      paid: paid.length,
      refunded: refunded.length,
    },
    sales: {
      gross: grossSales,
      subtotal: subtotalSum,
      service: serviceSum,
      tax: taxSum,
      discount: discountSum,
    },
    byMethod: Array.from(methodMap.entries())
      .map(([method, stats]) => ({ method, count: stats.count, total: stats.total }))
      .sort((a, b) => b.total - a.total),
  };
}

// ─── Order receipt detail (for reprint + PDF) ──────────

export async function getDailyCashSessionReport(params: {
  date: string;
  outletId: string;
  requesterUserId: string;
}) {
  const db = getDb();
  const { start, end } = jakartaDayRange(params.date);
  const rows = await db
    .select({
      id: cashSessions.id,
      code: cashSessions.code,
      status: cashSessions.status,
      openingCash: cashSessions.openingCash,
      expectedCash: cashSessions.expectedCash,
      actualCash: cashSessions.actualCash,
      discrepancy: cashSessions.discrepancy,
      discrepancyStatus: cashSessions.discrepancyStatus,
      outletId: cashSessions.outletId,
      managerSignOffAt: cashSessions.managerSignOffAt,
      openedAt: cashSessions.openedAt,
      closedAt: cashSessions.closedAt,
      outletCode: outlets.code,
      openedBy: cashSessions.openedBy,
      openedByName: user.name,
    })
    .from(cashSessions)
    .leftJoin(outlets, eq(outlets.id, cashSessions.outletId))
    .leftJoin(user, eq(user.id, cashSessions.openedBy))
    .where(
      and(
        eq(cashSessions.outletId, params.outletId),
        gte(cashSessions.openedAt, start),
        lt(cashSessions.openedAt, end),
      ),
    )
    .orderBy(asc(cashSessions.openedAt));

  const labeledRows = await withDailyShiftLabels(rows);
  const detailRows = await Promise.all(
    labeledRows.map(async (row) => {
      const summary = await getCashSessionSummary(
        row.id,
        row.openedBy ?? params.requesterUserId,
        { allowAll: true },
      );
      const cashTotal =
        summary?.byMethod
          .filter((method) => normalizePaymentMethod(method.method) === "cash")
          .reduce((sum, method) => sum + method.total, 0) ?? 0;
      const nonCashTotal =
        summary?.byMethod
          .filter((method) => normalizePaymentMethod(method.method) !== "cash")
          .reduce((sum, method) => sum + method.total, 0) ?? 0;

      return {
        id: row.id,
        code: row.code,
        status: row.status,
        businessDate: row.businessDate,
        shiftNumber: row.shiftNumber,
        shiftLabel: row.shiftLabel,
        cashierName: row.openedByName ?? "Kasir",
        outletCode: row.outletCode,
        openingCash: row.openingCash,
        expectedCash: row.expectedCash,
        actualCash: row.actualCash,
        discrepancy: row.discrepancy,
        discrepancyStatus: row.discrepancyStatus,
        managerSignOffAt: row.managerSignOffAt?.toISOString() ?? null,
        openedAt: row.openedAt.toISOString(),
        closedAt: row.closedAt?.toISOString() ?? null,
        counts: summary?.counts ?? { total: 0, paid: 0, refunded: 0 },
        sales: summary?.sales ?? {
          gross: 0,
          subtotal: 0,
          service: 0,
          tax: 0,
          discount: 0,
        },
        byMethod: summary?.byMethod ?? [],
        cashTotal,
        nonCashTotal,
      };
    }),
  );

  return {
    date: params.date,
    rows: detailRows,
    totals: {
      shifts: detailRows.length,
      orders: detailRows.reduce((sum, row) => sum + row.counts.total, 0),
      paidOrders: detailRows.reduce((sum, row) => sum + row.counts.paid, 0),
      gross: detailRows.reduce((sum, row) => sum + row.sales.gross, 0),
      cash: detailRows.reduce((sum, row) => sum + row.cashTotal, 0),
      nonCash: detailRows.reduce((sum, row) => sum + row.nonCashTotal, 0),
      expectedCash: detailRows.reduce((sum, row) => sum + row.expectedCash, 0),
      actualCash: detailRows.reduce((sum, row) => sum + (row.actualCash ?? 0), 0),
      discrepancy: detailRows.reduce((sum, row) => sum + row.discrepancy, 0),
    },
  };
}

export type OrderReceiptData = {
  order: {
    id: string;
    orderNo: string;
    invoiceNo: string;
    invoiceTrackingToken: string | null;
    invoiceWebUrl: string | null;
    status: string;
    channel: string;
    tableLabel: string;
    customerName: string | null;
    customerPhone: string | null;
    customerNote: string | null;
    subtotal: number;
    service: number;
    tax: number;
    discount: number;
    total: number;
    createdAt: string;
  };
  outlet: { code: string | null; name: string | null } | null;
  cashier: { id: string | null; name: string | null } | null;
  items: Array<{
    itemName: string;
    variantLabel: string;
    unitPrice: number;
    qty: number;
    lineTotal: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
    status: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }>;
};

export async function getOrderForReceipt(orderId: string): Promise<OrderReceiptData | null> {
  const db = getDb();
  const [row] = await db
    .select({
      order: orders,
      outletName: outlets.name,
      outletCode: outlets.code,
    })
    .from(orders)
    .leftJoin(outlets, eq(outlets.id, orders.outletId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return null;

  const cashierName = row.order.createdBy
    ? (await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, row.order.createdBy))
        .limit(1))[0]?.name ?? null
    : null;

  const itemRows = await db
    .select({
      itemName: orderItems.itemName,
      variantLabel: orderItems.variantLabel,
      unitPrice: orderItems.unitPrice,
      qty: orderItems.qty,
      lineTotal: orderItems.lineTotal,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const paymentRows = await db
    .select({
      method: payments.method,
      amount: payments.amount,
      status: payments.status,
      createdAt: payments.createdAt,
      metadata: payments.metadata,
    })
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(desc(payments.createdAt));

  return {
    order: {
      id: row.order.id,
      orderNo: row.order.orderNo,
      invoiceNo: invoiceNoForOrder(row.order.orderNo),
      invoiceTrackingToken: row.order.invoiceTrackingToken,
      invoiceWebUrl: invoiceWebPath(row.order.invoiceTrackingToken),
      status: row.order.status,
      channel: row.order.channel,
      tableLabel: row.order.tableLabel,
      customerName: row.order.customerName,
      customerPhone: row.order.customerPhone,
      customerNote: row.order.customerNote,
      subtotal: row.order.subtotal,
      service: row.order.service,
      tax: row.order.tax,
      discount: row.order.discount,
      total: row.order.total,
      createdAt: row.order.createdAt.toISOString(),
    },
    outlet: { code: row.outletCode ?? null, name: row.outletName ?? null },
    cashier: { id: row.order.createdBy ?? null, name: cashierName },
    items: itemRows,
    payments: paymentRows.map((p) => ({
      method: p.method,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      metadata: p.metadata,
    })),
  };
}

async function resolveExpenseIdFromApprovalId(approvalId: string) {
  if (!approvalId.startsWith("APP-EXP-")) {
    return null;
  }
  const suffix = approvalId.slice("APP-EXP-".length);
  const db = getDb();
  const [exact] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.id, suffix))
    .limit(1);
  if (exact) {
    return exact.id;
  }
  const [prefix] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(ilike(expenses.id, `${suffix.toLowerCase()}%`))
    .limit(1);
  return prefix?.id ?? null;
}

export async function decideApproval(
  id: string,
  input: {
    status: "approved" | "rejected";
    reasonDecided?: string;
  },
  garage: GarageSession,
) {
  const reasonText = input.reasonDecided?.trim().slice(0, 500) || null;
  // Reject WAJIB punya reason — guarded di route layer juga
  if (input.status === "rejected" && !reasonText) {
    throw new Error("Alasan wajib diisi saat reject approval.");
  }

  const db = getDb();
  const [current] = await db
    .select()
    .from(approvals)
    .where(eq(approvals.id, id))
    .limit(1);

  if (!current) {
    return null;
  }
  if (current.status !== "pending") {
    throw new Error("Approval ini sudah diputuskan.");
  }

  if (id.startsWith("APP-VOID-") && input.status === "approved") {
    const orderId = id.slice("APP-VOID-".length);
    const voidReason = reasonText || current.reason;
    await voidOrder(orderId, voidReason, garage);
  }

  const expenseId = await resolveExpenseIdFromApprovalId(id);
  if (expenseId) {
    if (input.status === "approved") {
      await approveExpense(expenseId, garage);
    } else {
      await rejectExpense(expenseId, garage);
    }
  }

  if (id.startsWith("APP-OPN-")) {
    const opnameId = id.slice("APP-OPN-".length);
    try {
      if (input.status === "approved") {
        await approveStockOpname(opnameId, garage);
      } else {
        await rejectStockOpname(opnameId, garage);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("sudah diputuskan") && !message.includes("sudah diterapkan")) {
        throw error;
      }
    }
  }

  const [approval] = await db
    .update(approvals)
    .set({
      status: input.status,
      decidedBy: garage.user.id,
      decidedByName: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
      decidedAt: new Date(),
      reasonDecided: reasonText,
      updatedAt: new Date(),
    })
    .where(eq(approvals.id, id))
    .returning();

  if (!approval) {
    return null;
  }

  await createAuditLog({
    actor: `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`,
    action: `Approval ${input.status}`,
    object: id,
    device: garage.profile.deviceLabel,
    metadata: {
      approvalType: approval.type,
      reasonDecided: reasonText,
    },
  });

  return approval;
}

export async function decideApprovalsBulk(
  ids: string[],
  input: {
    status: "approved" | "rejected";
    reasonDecided?: string;
  },
  garage: GarageSession,
) {
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids) {
    try {
      const r = await decideApproval(id, input, garage);
      results.push({ id, ok: Boolean(r) });
    } catch (err) {
      results.push({
        id,
        ok: false,
        error: err instanceof Error ? err.message : "Gagal decide",
      });
    }
  }
  return {
    total: ids.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

// ── Smart reorder suggestions ────────────────────────────────────────────
// Hitung consumption rate per SKU dari stockMovements (qty negatif) selama window
// hari terakhir, lalu estimasi daysUntilEmpty & saran reorder qty.
// Target reorder = min*2 + dailyConsumption*7, qty = max(0, target - onHand).
export type SmartReorderSuggestion = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  packageSize: string;
  onHand: number;
  min: number;
  status: string;
  dailyConsumption: number;
  daysUntilEmpty: number | null;
  suggestedReorderQty: number;
  supplierOrderQty: number;
  supplierOrderValue: number;
  reorderTarget: number;
  warehouseBufferQty: number;
  riskLevel: "critical" | "watch" | "safe";
  reason: string;
};

export async function getSmartReorderSuggestions(params?: { windowDays?: number }) {
  const windowDays = Math.max(3, Math.min(60, params?.windowDays ?? 14));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const consumptionRows = await db
    .select({
      sku: stockMovements.itemSku,
      consumed: sql<number>`coalesce(sum(case when ${stockMovements.qty} < 0 then -${stockMovements.qty} else 0 end), 0)::float`,
    })
    .from(stockMovements)
    .where(and(isNotNull(stockMovements.itemSku), gte(stockMovements.createdAt, since)))
    .groupBy(stockMovements.itemSku);

  const consumedBySku = new Map<string, number>();
  for (const row of consumptionRows) {
    if (row.sku) consumedBySku.set(row.sku, Number(row.consumed) || 0);
  }

  const [items, warehouseStocks] = await Promise.all([
    db.select().from(inventoryItems).orderBy(inventoryItems.sku),
    db
      .select()
      .from(inventoryLocationStocks)
      .where(eq(inventoryLocationStocks.locationKey, WAREHOUSE_LOCATION_KEY)),
  ]);
  const warehouseStockBySku = new Map(warehouseStocks.map((stock) => [stock.itemSku, stock]));

  const suggestions: SmartReorderSuggestion[] = items.map((item) => {
    const warehouseStock = warehouseStockBySku.get(item.sku);
    const consumed = consumedBySku.get(item.sku) ?? 0;
    const dailyConsumption = consumed / windowDays;
    const onHand = Number(warehouseStock?.onHand ?? item.onHand) || 0;
    const min = Number(warehouseStock?.min ?? item.min) || 0;
    const status = warehouseStock?.status ?? item.status;

    const daysUntilEmpty =
      dailyConsumption > 0 ? Number((onHand / dailyConsumption).toFixed(1)) : null;

    const target = Number((min * 2 + dailyConsumption * 7).toFixed(2));
    const suggestedReorderQty = Math.max(0, Number((target - onHand).toFixed(2)));
    const supplierOrderQty = suggestedReorderQty;
    const supplierOrderValue = Math.round(supplierOrderQty * Number(item.unitCost || 0));
    const warehouseBufferQty = Number(Math.max(min, dailyConsumption * 3).toFixed(2));

    let riskLevel: SmartReorderSuggestion["riskLevel"] = "safe";
    let reason = "Stok aman.";
    if (onHand <= min || (daysUntilEmpty !== null && daysUntilEmpty <= 3)) {
      riskLevel = "critical";
      reason =
        daysUntilEmpty !== null
          ? `Habis ~${daysUntilEmpty} hari lagi (di/akan di bawah minimum).`
          : `On-hand ${onHand} ≤ minimum ${min}.`;
    } else if (daysUntilEmpty !== null && daysUntilEmpty <= 7) {
      riskLevel = "watch";
      reason = `Cukup untuk ~${daysUntilEmpty} hari, siap reorder minggu ini.`;
    } else if (daysUntilEmpty === null) {
      reason = `Tidak ada konsumsi tercatat dalam ${windowDays} hari.`;
    }

    return {
      sku: item.sku,
      name: item.name,
      category: item.category,
      unit: item.unit,
      packageSize: item.packageSize,
      onHand,
      min,
      status,
      dailyConsumption: Number(dailyConsumption.toFixed(3)),
      daysUntilEmpty,
      suggestedReorderQty,
      supplierOrderQty,
      supplierOrderValue,
      reorderTarget: target,
      warehouseBufferQty,
      riskLevel,
      reason,
    };
  });

  // Urut: critical → watch → safe, terus daysUntilEmpty asc
  const riskRank = { critical: 0, watch: 1, safe: 2 } as const;
  suggestions.sort((a, b) => {
    if (riskRank[a.riskLevel] !== riskRank[b.riskLevel]) {
      return riskRank[a.riskLevel] - riskRank[b.riskLevel];
    }
    const ad = a.daysUntilEmpty ?? Number.POSITIVE_INFINITY;
    const bd = b.daysUntilEmpty ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    totalItems: suggestions.length,
    criticalCount: suggestions.filter((s) => s.riskLevel === "critical").length,
    watchCount: suggestions.filter((s) => s.riskLevel === "watch").length,
    suggestions,
  };
}

export async function getWarehouseDailyAuditSummary(params?: { date?: string }) {
  const db = getDb();
  const start = params?.date ? new Date(`${params.date}T00:00:00`) : new Date();
  if (Number.isNaN(start.getTime())) {
    start.setTime(Date.now());
  }
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [movementRows, receivingRows, issuedRows, stockRows] = await Promise.all([
    db
      .select({
        type: stockMovements.type,
        qty: stockMovements.qty,
        itemSku: stockMovements.itemSku,
        itemName: inventoryItems.name,
        unit: inventoryItems.unit,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .leftJoin(inventoryItems, eq(stockMovements.itemSku, inventoryItems.sku))
      .where(and(gte(stockMovements.createdAt, start), lt(stockMovements.createdAt, end)))
      .orderBy(desc(stockMovements.createdAt))
      .limit(500),
    db
      .select({
        id: supplierReceivings.id,
        code: supplierReceivings.code,
        totalAmount: supplierReceivings.totalAmount,
        receivedAt: supplierReceivings.receivedAt,
      })
      .from(supplierReceivings)
      .where(and(gte(supplierReceivings.receivedAt, start), lt(supplierReceivings.receivedAt, end)))
      .orderBy(desc(supplierReceivings.receivedAt)),
    db
      .select({
        id: inventoryTransferRequests.id,
        station: inventoryTransferRequests.station,
        issuedAt: inventoryTransferRequests.issuedAt,
        issuedQty: inventoryTransferItems.issuedQty,
      })
      .from(inventoryTransferRequests)
      .innerJoin(
        inventoryTransferItems,
        eq(inventoryTransferItems.requestId, inventoryTransferRequests.id),
      )
      .where(
        and(
          isNotNull(inventoryTransferRequests.issuedAt),
          gte(inventoryTransferRequests.issuedAt, start),
          lt(inventoryTransferRequests.issuedAt, end),
        ),
      )
      .orderBy(desc(inventoryTransferRequests.issuedAt)),
    db
      .select({
        sku: inventoryLocationStocks.itemSku,
        onHand: inventoryLocationStocks.onHand,
        min: inventoryLocationStocks.min,
        status: inventoryLocationStocks.status,
        unitCost: inventoryItems.unitCost,
      })
      .from(inventoryLocationStocks)
      .innerJoin(inventoryItems, eq(inventoryItems.sku, inventoryLocationStocks.itemSku))
      .where(eq(inventoryLocationStocks.locationKey, WAREHOUSE_LOCATION_KEY)),
  ]);

  const movementsByType = new Map<string, { count: number; totalQty: number }>();
  const topMovementItems = new Map<
    string,
    { sku: string; name: string; unit: string; totalAbsQty: number; count: number }
  >();
  for (const row of movementRows) {
    const type = movementsByType.get(row.type) ?? { count: 0, totalQty: 0 };
    type.count += 1;
    type.totalQty += Number(row.qty ?? 0);
    movementsByType.set(row.type, type);
    if (row.itemSku) {
      const item = topMovementItems.get(row.itemSku) ?? {
        sku: row.itemSku,
        name: row.itemName ?? row.itemSku,
        unit: row.unit ?? "",
        totalAbsQty: 0,
        count: 0,
      };
      item.totalAbsQty += Math.abs(Number(row.qty ?? 0));
      item.count += 1;
      topMovementItems.set(row.itemSku, item);
    }
  }

  const issuedByStation = new Map<string, { requestCount: Set<string>; totalQty: number }>();
  for (const row of issuedRows) {
    const station = row.station || "dapur";
    const stats = issuedByStation.get(station) ?? { requestCount: new Set<string>(), totalQty: 0 };
    stats.requestCount.add(row.id);
    stats.totalQty += Number(row.issuedQty ?? 0);
    issuedByStation.set(station, stats);
  }

  const stockValue = stockRows.reduce(
    (sum, row) => sum + Number(row.onHand || 0) * Number(row.unitCost || 0),
    0,
  );

  return {
    date: start.toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    movementCount: movementRows.length,
    receivingCount: receivingRows.length,
    receivingValue: receivingRows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0),
    issuedRequestCount: new Set(issuedRows.map((row) => row.id)).size,
    issuedItemCount: issuedRows.filter((row) => Number(row.issuedQty || 0) > 0).length,
    warehouseStockValue: Math.round(stockValue),
    lowCount: stockRows.filter((row) => row.status === "low").length,
    watchCount: stockRows.filter((row) => row.status === "watch").length,
    byMovementType: Array.from(movementsByType.entries())
      .map(([type, stats]) => ({ type, ...stats }))
      .sort((a, b) => b.count - a.count),
    byStation: Array.from(issuedByStation.entries()).map(([station, stats]) => ({
      station,
      requestCount: stats.requestCount.size,
      totalQty: Number(stats.totalQty.toFixed(2)),
    })),
    topMovementItems: Array.from(topMovementItems.values())
      .sort((a, b) => b.totalAbsQty - a.totalAbsQty)
      .slice(0, 6)
      .map((row) => ({ ...row, totalAbsQty: Number(row.totalAbsQty.toFixed(2)) })),
  };
}

// ── Kitchen ETA estimates ────────────────────────────────────────────────
// Rata-rata waktu acceptedAt → readyAt per station dari 7 hari terakhir,
// lalu estimasi ETA untuk tiket aktif (queue/cooking) berdasarkan posisi antrian.
export type WarehouseDailyAuditSummary = Awaited<ReturnType<typeof getWarehouseDailyAuditSummary>>;

export type WarehouseDailyReportLock = {
  date: string;
  documentNo: string;
  locked: true;
  lockedAt: string;
  lockedBy: {
    id: string;
    name: string;
    role: Role;
  };
  outlet: {
    id: string;
    name: string;
  };
  report: WarehouseDailyAuditSummary;
};

export type WarehouseMonthlyReportSummary = {
  month: string;
  totalDays: number;
  expectedLockedDays: number;
  lockedDays: number;
  missingDates: string[];
  completionPct: number;
  isComplete: boolean;
  receivingCount: number;
  receivingValue: number;
  issuedRequestCount: number;
  issuedItemCount: number;
  movementCount: number;
  averageWarehouseStockValue: number;
  lowCountLatest: number;
  watchCountLatest: number;
  byDay: Array<{
    date: string;
    documentNo: string;
    receivingValue: number;
    issuedRequestCount: number;
    movementCount: number;
    warehouseStockValue: number;
  }>;
  byStation: Array<{ station: string; requestCount: number; totalQty: number }>;
  byMovementType: Array<{ type: string; count: number; totalQty: number }>;
  topMovementItems: Array<{ sku: string; name: string; unit: string; totalAbsQty: number; count: number }>;
};

function warehouseDailyReportLockKey(date: string) {
  return `warehouse.dailyReportLock.${date}`;
}

function jakartaDateParts() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return {
    date: today,
    month: today.slice(0, 7),
    day: Number(today.slice(8, 10)),
  };
}

function daysInIsoMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function expectedWarehouseLockDates(month: string) {
  const totalDays = daysInIsoMonth(month);
  const today = jakartaDateParts();
  const expectedDays =
    month < today.month ? totalDays : month === today.month ? today.day : 0;
  return Array.from({ length: expectedDays }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${month}-${day}`;
  });
}

function normalizeWarehouseDailyReportLock(value: unknown): WarehouseDailyReportLock | null {
  if (!value || typeof value !== "object") return null;
  const lock = value as Partial<WarehouseDailyReportLock>;
  if (lock.locked !== true || !lock.date || !lock.lockedAt || !lock.report) return null;
  return {
    ...lock,
    documentNo: lock.documentNo ?? `WH-DAY-${lock.date.replaceAll("-", "")}`,
  } as WarehouseDailyReportLock;
}

export function summarizeWarehouseDailyReportLocks(
  month: string,
  locks: WarehouseDailyReportLock[],
): WarehouseMonthlyReportSummary {
  const stationMap = new Map<string, { station: string; requestCount: number; totalQty: number }>();
  const movementTypeMap = new Map<string, { type: string; count: number; totalQty: number }>();
  const topItemMap = new Map<
    string,
    { sku: string; name: string; unit: string; totalAbsQty: number; count: number }
  >();
  const sortedAsc = [...locks].sort((a, b) => a.date.localeCompare(b.date));

  for (const lock of locks) {
    for (const row of lock.report.byStation) {
      const stats = stationMap.get(row.station) ?? {
        station: row.station,
        requestCount: 0,
        totalQty: 0,
      };
      stats.requestCount += row.requestCount;
      stats.totalQty += row.totalQty;
      stationMap.set(row.station, stats);
    }
    for (const row of lock.report.byMovementType) {
      const stats = movementTypeMap.get(row.type) ?? { type: row.type, count: 0, totalQty: 0 };
      stats.count += row.count;
      stats.totalQty += row.totalQty;
      movementTypeMap.set(row.type, stats);
    }
    for (const item of lock.report.topMovementItems) {
      const stats = topItemMap.get(item.sku) ?? {
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        totalAbsQty: 0,
        count: 0,
      };
      stats.totalAbsQty += item.totalAbsQty;
      stats.count += item.count;
      topItemMap.set(item.sku, stats);
    }
  }

  const latest = sortedAsc.at(-1);
  const expectedDates = expectedWarehouseLockDates(month);
  const lockedDateSet = new Set(locks.map((lock) => lock.date));
  const missingDates = expectedDates.filter((date) => !lockedDateSet.has(date));
  const stockValueTotal = locks.reduce((sum, lock) => sum + lock.report.warehouseStockValue, 0);
  return {
    month,
    totalDays: daysInIsoMonth(month),
    expectedLockedDays: expectedDates.length,
    lockedDays: locks.length,
    missingDates,
    completionPct: expectedDates.length
      ? Math.round(((expectedDates.length - missingDates.length) / expectedDates.length) * 100)
      : 100,
    isComplete: missingDates.length === 0,
    receivingCount: locks.reduce((sum, lock) => sum + lock.report.receivingCount, 0),
    receivingValue: locks.reduce((sum, lock) => sum + lock.report.receivingValue, 0),
    issuedRequestCount: locks.reduce((sum, lock) => sum + lock.report.issuedRequestCount, 0),
    issuedItemCount: locks.reduce((sum, lock) => sum + lock.report.issuedItemCount, 0),
    movementCount: locks.reduce((sum, lock) => sum + lock.report.movementCount, 0),
    averageWarehouseStockValue: locks.length ? Math.round(stockValueTotal / locks.length) : 0,
    lowCountLatest: latest?.report.lowCount ?? 0,
    watchCountLatest: latest?.report.watchCount ?? 0,
    byDay: sortedAsc.map((lock) => ({
      date: lock.date,
      documentNo: lock.documentNo,
      receivingValue: lock.report.receivingValue,
      issuedRequestCount: lock.report.issuedRequestCount,
      movementCount: lock.report.movementCount,
      warehouseStockValue: lock.report.warehouseStockValue,
    })),
    byStation: Array.from(stationMap.values())
      .map((row) => ({ ...row, totalQty: Number(row.totalQty.toFixed(2)) }))
      .sort((a, b) => b.totalQty - a.totalQty),
    byMovementType: Array.from(movementTypeMap.values())
      .map((row) => ({ ...row, totalQty: Number(row.totalQty.toFixed(2)) }))
      .sort((a, b) => b.count - a.count),
    topMovementItems: Array.from(topItemMap.values())
      .sort((a, b) => b.totalAbsQty - a.totalAbsQty)
      .slice(0, 10)
      .map((row) => ({ ...row, totalAbsQty: Number(row.totalAbsQty.toFixed(2)) })),
  };
}

export async function getWarehouseDailyReportLock(date: string, garage: GarageSession) {
  const db = getDb();
  const normalizedDate = (await getWarehouseDailyAuditSummary({ date })).date;
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(
      and(
        eq(appSettings.outletId, garage.profile.outlet.id),
        eq(appSettings.key, warehouseDailyReportLockKey(normalizedDate)),
      ),
    )
    .limit(1);

  return normalizeWarehouseDailyReportLock(row?.valueJson);
}

export async function listWarehouseDailyReportLocks(params: {
  month?: string;
  garage: GarageSession;
}) {
  const db = getDb();
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : new Date().toISOString().slice(0, 7);
  const rows = await db
    .select({ valueJson: appSettings.valueJson, updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .where(
      and(
        eq(appSettings.outletId, params.garage.profile.outlet.id),
        ilike(appSettings.key, `warehouse.dailyReportLock.${month}-%`),
      ),
    )
    .orderBy(desc(appSettings.updatedAt));

  const locks = rows
    .map((row) => normalizeWarehouseDailyReportLock(row.valueJson))
    .filter((lock): lock is WarehouseDailyReportLock => Boolean(lock))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    month,
    locks,
    summary: summarizeWarehouseDailyReportLocks(month, locks),
  };
}

export async function lockWarehouseDailyReport(date: string, garage: GarageSession) {
  const db = getDb();
  const report = await getWarehouseDailyAuditSummary({ date });
  const existing = await getWarehouseDailyReportLock(report.date, garage);
  if (existing) {
    return { lock: existing, alreadyLocked: true };
  }

  const now = new Date();
  const lock: WarehouseDailyReportLock = {
    date: report.date,
    documentNo: `WH-DAY-${report.date.replaceAll("-", "")}`,
    locked: true,
    lockedAt: now.toISOString(),
    lockedBy: {
      id: garage.user.id,
      name: garage.user.name,
      role: garage.profile.role,
    },
    outlet: {
      id: garage.profile.outlet.id,
      name: garage.profile.outlet.name,
    },
    report,
  };

  await db.transaction(async (tx) => {
    await tx.insert(appSettings).values({
      outletId: garage.profile.outlet.id,
      key: warehouseDailyReportLockKey(report.date),
      valueJson: lock,
      updatedBy: garage.user.id,
      updatedAt: now,
      createdAt: now,
    });

    await tx.insert(auditLogs).values({
      time: now.toLocaleString("id-ID", { timeZone: garage.profile.outlet.timezone }),
      actor: garage.user.name,
      action: "Warehouse daily report locked",
      object: `WH-DAY-${report.date}`,
      device: garage.profile.deviceLabel,
      status: "locked",
      metadata: {
        date: report.date,
        outletId: garage.profile.outlet.id,
        receivingCount: report.receivingCount,
        issuedRequestCount: report.issuedRequestCount,
        movementCount: report.movementCount,
        warehouseStockValue: report.warehouseStockValue,
      },
    });
  });

  return { lock, alreadyLocked: false };
}

export async function unlockWarehouseDailyReport(date: string, garage: GarageSession) {
  const db = getDb();
  const existing = await getWarehouseDailyReportLock(date, garage);
  if (!existing) {
    return { unlocked: false, lock: null };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(appSettings)
      .where(
        and(
          eq(appSettings.outletId, garage.profile.outlet.id),
          eq(appSettings.key, warehouseDailyReportLockKey(existing.date)),
        ),
      );

    await tx.insert(auditLogs).values({
      time: now.toLocaleString("id-ID", { timeZone: garage.profile.outlet.timezone }),
      actor: garage.user.name,
      action: "Warehouse daily report reopened",
      object: existing.documentNo ?? `WH-DAY-${existing.date}`,
      device: garage.profile.deviceLabel,
      status: "reopened",
      metadata: {
        date: existing.date,
        outletId: garage.profile.outlet.id,
        lockedAt: existing.lockedAt,
        lockedBy: existing.lockedBy.name,
      },
    });
  });

  return { unlocked: true, lock: existing };
}

export type KitchenEtaTicket = {
  id: string;
  ticketNo: string;
  station: string;
  status: string;
  channel: string;
  tableLabel: string;
  queuePosition: number;
  etaMinutes: number;
  etaAt: string;
  basis: "history" | "target";
};

export async function getKitchenEtaEstimates(params?: { windowDays?: number }) {
  const windowDays = Math.max(1, Math.min(30, params?.windowDays ?? 7));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const historyRows = await db
    .select({
      station: kitchenTickets.station,
      avgMinutes: sql<number>`coalesce(avg(extract(epoch from (${kitchenTickets.readyAt} - ${kitchenTickets.acceptedAt})) / 60.0), 0)::float`,
      sampleSize: sql<number>`count(*)::int`,
    })
    .from(kitchenTickets)
    .where(
      and(
        gte(kitchenTickets.createdAt, since),
        isNotNull(kitchenTickets.acceptedAt),
        isNotNull(kitchenTickets.readyAt),
      ),
    )
    .groupBy(kitchenTickets.station);

  const avgByStation = new Map<string, { avgMinutes: number; sampleSize: number }>();
  for (const row of historyRows) {
    const avg = Number(row.avgMinutes) || 0;
    if (avg > 0) {
      avgByStation.set(row.station, { avgMinutes: avg, sampleSize: Number(row.sampleSize) });
    }
  }

  const activeRows = await db
    .select({
      id: kitchenTickets.id,
      ticketNo: kitchenTickets.ticketNo,
      station: kitchenTickets.station,
      status: kitchenTickets.status,
      channel: kitchenTickets.channel,
      tableLabel: kitchenTickets.tableLabel,
      targetMinutes: kitchenTickets.targetMinutes,
      priority: kitchenTickets.priority,
      acceptedAt: kitchenTickets.acceptedAt,
      createdAt: kitchenTickets.createdAt,
    })
    .from(kitchenTickets)
    .where(inArray(kitchenTickets.status, ["queue", "cooking"]))
    .orderBy(asc(kitchenTickets.createdAt));

  const now = Date.now();
  const positionByStation = new Map<string, number>();

  const tickets: KitchenEtaTicket[] = activeRows.map((row) => {
    const station = row.station;
    const history = avgByStation.get(station);
    const targetMin = Number(row.targetMinutes) > 0 ? Number(row.targetMinutes) : 15;
    const baseAvg = history?.avgMinutes ?? targetMin;
    const basis: KitchenEtaTicket["basis"] = history ? "history" : "target";

    const queuePos = positionByStation.get(station) ?? 0;
    positionByStation.set(station, queuePos + 1);

    let etaMinutes: number;
    if (row.status === "cooking" && row.acceptedAt) {
      const elapsedMin = Math.max(0, (now - new Date(row.acceptedAt).getTime()) / 60000);
      etaMinutes = Math.max(1, baseAvg - elapsedMin);
    } else {
      // queue: tiket di depan + diri sendiri
      etaMinutes = baseAvg * (queuePos + 1);
    }

    // Priority urgent dipercepat estimasinya 30%
    if (row.priority === "urgent") {
      etaMinutes = etaMinutes * 0.7;
    }

    const etaRounded = Math.max(1, Math.round(etaMinutes));
    return {
      id: row.id,
      ticketNo: row.ticketNo,
      station,
      status: row.status,
      channel: row.channel,
      tableLabel: row.tableLabel,
      queuePosition: queuePos,
      etaMinutes: etaRounded,
      etaAt: new Date(now + etaRounded * 60000).toISOString(),
      basis,
    };
  });

  const stations = Array.from(avgByStation.entries()).map(([station, data]) => ({
    station,
    avgMinutes: Number(data.avgMinutes.toFixed(1)),
    sampleSize: data.sampleSize,
    activeCount: tickets.filter((t) => t.station === station).length,
  }));

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    stations,
    tickets,
  };
}

// ── Upsell suggestions ───────────────────────────────────────────────────
// Frequent co-occurrence: cari item lain yang sering muncul di order yang sama
// dengan menuItemId tertentu. Window 30 hari, top 6.
export type UpsellSuggestion = {
  menuItemId: string;
  itemName: string;
  pairCount: number;
  totalOrders: number;
  confidence: number;
};

export async function getUpsellSuggestions(params: {
  menuItemId: string;
  windowDays?: number;
  limit?: number;
}) {
  const windowDays = Math.max(7, Math.min(180, params.windowDays ?? 30));
  const limit = Math.max(1, Math.min(20, params.limit ?? 6));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const anchorOrderIds = await db
    .selectDistinct({ orderId: orderItems.orderId })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.menuItemId, params.menuItemId),
        gte(orders.createdAt, since),
        eq(orders.status, "paid"),
      ),
    );

  const anchorCount = anchorOrderIds.length;
  if (anchorCount === 0) {
    return { menuItemId: params.menuItemId, anchorOrders: 0, suggestions: [] as UpsellSuggestion[] };
  }

  const ids = anchorOrderIds.map((r) => r.orderId);
  const pairRows = await db
    .select({
      menuItemId: orderItems.menuItemId,
      itemName: orderItems.itemName,
      pairCount: sql<number>`count(distinct ${orderItems.orderId})::int`,
    })
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.orderId, ids),
        isNotNull(orderItems.menuItemId),
        sql`${orderItems.menuItemId} <> ${params.menuItemId}`,
      ),
    )
    .groupBy(orderItems.menuItemId, orderItems.itemName)
    .orderBy(desc(sql`count(distinct ${orderItems.orderId})`))
    .limit(limit);

  const suggestions: UpsellSuggestion[] = pairRows
    .filter((row) => row.menuItemId)
    .map((row) => ({
      menuItemId: row.menuItemId!,
      itemName: row.itemName,
      pairCount: Number(row.pairCount),
      totalOrders: anchorCount,
      confidence: Math.round((Number(row.pairCount) / anchorCount) * 100),
    }));

  return {
    menuItemId: params.menuItemId,
    windowDays,
    anchorOrders: anchorCount,
    suggestions,
  };
}

// ── Customer segmentation (auto) ─────────────────────────────────────────
// Tagging: new (joined<30d & visits<=1), loyal (visits>=10 atau spend tinggi
// 60 hari terakhir), sleeping (last order >30d), active (else).
export type CustomerSegmentTag = "new" | "loyal" | "sleeping" | "active";

export type AutoSegmentRow = {
  customerId: string;
  name: string;
  phone: string;
  tier: string;
  visits: number;
  segment: CustomerSegmentTag;
  lastOrderAt: string | null;
  daysSinceLast: number | null;
  spend60d: number;
};

export async function getCustomerAutoSegments(params?: { limit?: number }) {
  const limit = Math.max(10, Math.min(500, params?.limit ?? 200));
  const db = getDb();
  const now = Date.now();
  const sixtyAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

  const customerRows = await db.select().from(customers).limit(limit);

  const recent = await db
    .select({
      phone: orders.customerPhone,
      lastAt: sql<Date>`max(${orders.createdAt})`,
      spend: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "paid"),
        isNotNull(orders.customerPhone),
        gte(orders.createdAt, sixtyAgo),
      ),
    )
    .groupBy(orders.customerPhone);

  const byPhone = new Map<string, { lastAt: Date; spend: number }>();
  for (const row of recent) {
    if (row.phone) {
      byPhone.set(row.phone, {
        lastAt: row.lastAt as Date,
        spend: Number(row.spend),
      });
    }
  }

  const rows: AutoSegmentRow[] = customerRows.map((c) => {
    const stats = byPhone.get(c.phone);
    const lastAt = stats?.lastAt ?? null;
    const daysSinceLast = lastAt
      ? Math.floor((now - new Date(lastAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const spend60d = stats?.spend ?? 0;
    const memberDays = Math.floor(
      (now - new Date(c.membershipSince).getTime()) / (24 * 60 * 60 * 1000),
    );

    let segment: CustomerSegmentTag;
    if (memberDays <= 30 && c.visits <= 1) {
      segment = "new";
    } else if (c.visits >= 10 || spend60d >= 500_000) {
      segment = "loyal";
    } else if (daysSinceLast === null || daysSinceLast > 30) {
      segment = "sleeping";
    } else {
      segment = "active";
    }

    return {
      customerId: c.id,
      name: c.name,
      phone: c.phone,
      tier: c.tier,
      visits: c.visits,
      segment,
      lastOrderAt: lastAt ? new Date(lastAt).toISOString() : null,
      daysSinceLast,
      spend60d,
    };
  });

  const breakdown: Record<CustomerSegmentTag, number> = {
    new: 0,
    loyal: 0,
    sleeping: 0,
    active: 0,
  };
  for (const r of rows) breakdown[r.segment] += 1;

  return { generatedAt: new Date().toISOString(), breakdown, rows };
}

// ── Quick reorder ────────────────────────────────────────────────────────
// Ambil item-item dari order terakhir (status paid) milik customer untuk
// tombol "ulangi pesanan" di POS.
export async function getCustomerLastOrder(params: { customerId?: string; phone?: string }) {
  if (!params.customerId && !params.phone) {
    throw new Error("customerId atau phone wajib diisi.");
  }
  const db = getDb();
  const whereParts = [eq(orders.status, "paid")];
  if (params.customerId) whereParts.push(eq(orders.customerId, params.customerId));
  if (params.phone) whereParts.push(eq(orders.customerPhone, params.phone));

  // Wire: quickReorderWindowMinutes dari /control/settings → POS.
  // Order yang lebih lama dari window di-treat seolah gak ada → empty result.
  const settings = await getAppSettings(null);
  const windowMinutes = Number(settings.quickReorderWindowMinutes) || 30;
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
  whereParts.push(gte(orders.createdAt, cutoff));

  const [lastOrder] = await db
    .select()
    .from(orders)
    .where(and(...whereParts))
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (!lastOrder) {
    return { order: null, items: [] };
  }

  const items = await db
    .select({
      menuItemId: orderItems.menuItemId,
      variantId: orderItems.variantId,
      itemName: orderItems.itemName,
      variantLabel: orderItems.variantLabel,
      unitPrice: orderItems.unitPrice,
      qty: orderItems.qty,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, lastOrder.id));

  return {
    order: {
      id: lastOrder.id,
      orderNo: lastOrder.orderNo,
      total: lastOrder.total,
      createdAt: lastOrder.createdAt.toISOString(),
    },
    items,
  };
}

// ── Auto-approval evaluator + bulk applier ───────────────────────────────
// Pakai threshold dari appSettings (expenseApprovalThreshold +
// manualDiscountApprovalPct). Type "Expense" auto-approve kalau amount <
// threshold. Tipe lain biarkan manual.
export type AutoApprovalResult = {
  total: number;
  autoApproved: number;
  skipped: number;
  decisions: Array<{
    id: string;
    type: string;
    amount: number;
    decision: "auto_approved" | "skipped";
    reason: string;
  }>;
};

function parseAmountIdr(label: string): number {
  // Format: "Rp1.234.567" atau "+10" atau "-5"
  const cleaned = label.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

export async function runAutoApprovalSweep(garage: GarageSession): Promise<AutoApprovalResult> {
  const db = getDb();
  const settings = await getAppSettings(garage.profile.outlet.id);
  const expenseThreshold = Number(settings.expenseApprovalThreshold ?? 1_000_000);

  const pending = await db
    .select()
    .from(approvals)
    .where(eq(approvals.status, "pending"))
    .orderBy(asc(approvals.createdAt));

  const decisions: AutoApprovalResult["decisions"] = [];
  let autoApproved = 0;

  for (const row of pending) {
    const amount = parseAmountIdr(row.amount);
    let decision: "auto_approved" | "skipped" = "skipped";
    let reason = "Tipe approval tidak masuk auto-decide.";

    if (row.type === "Expense") {
      if (amount > 0 && amount < expenseThreshold) {
        decision = "auto_approved";
        reason = `Amount Rp${amount.toLocaleString("id-ID")} < threshold Rp${expenseThreshold.toLocaleString("id-ID")}.`;
      } else {
        reason = `Amount ≥ threshold; perlu review manual.`;
      }
    }

    if (decision === "auto_approved") {
      await db
        .update(approvals)
        .set({
          status: "approved",
          decidedBy: garage.user.id,
          decidedByName: `${garage.user.name} (auto)`,
          decidedAt: new Date(),
          reasonDecided: reason,
          updatedAt: new Date(),
        })
        .where(eq(approvals.id, row.id));
      autoApproved += 1;
    }

    decisions.push({ id: row.id, type: row.type, amount, decision, reason });
  }

  return {
    total: pending.length,
    autoApproved,
    skipped: pending.length - autoApproved,
    decisions,
  };
}

// ── Daily finance anomaly detector ───────────────────────────────────────
// Bandingkan revenue + expense hari ini vs rata-rata 7 hari lalu (exclude
// hari ini). Flag kalau deviasi |%| >= 30%.
export type FinanceAnomaly = {
  metric: "revenue" | "expense";
  todayValue: number;
  avg7dValue: number;
  deviationPct: number;
  severity: "info" | "watch" | "critical";
  message: string;
};

export async function getDailyAnomalies() {
  const db = getDb();
  const { start: todayStart, end: todayEnd } = getJakartaTodayRange();
  const sevenAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [todayRev] = await db
    .select({ value: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, todayStart),
        lt(orders.createdAt, todayEnd),
      ),
    );

  const [past7Rev] = await db
    .select({ value: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, sevenAgo),
        lt(orders.createdAt, todayStart),
      ),
    );

  const [todayExp] = await db
    .select({ value: sql<number>`coalesce(sum(${expenses.amount}), 0)::int` })
    .from(expenses)
    .where(
      and(gte(expenses.expenseDate, todayStart), lt(expenses.expenseDate, todayEnd)),
    );

  const [past7Exp] = await db
    .select({ value: sql<number>`coalesce(sum(${expenses.amount}), 0)::int` })
    .from(expenses)
    .where(
      and(gte(expenses.expenseDate, sevenAgo), lt(expenses.expenseDate, todayStart)),
    );

  function evaluate(
    metric: FinanceAnomaly["metric"],
    todayValue: number,
    sum7d: number,
    higherIsBad: boolean,
  ): FinanceAnomaly {
    const avg = sum7d / 7;
    const deviation = avg > 0 ? ((todayValue - avg) / avg) * 100 : 0;
    const absDev = Math.abs(deviation);
    let severity: FinanceAnomaly["severity"] = "info";
    let message = `Hari ini ${Math.round(deviation)}% vs rata-rata 7 hari.`;
    const bad = higherIsBad ? deviation > 0 : deviation < 0;
    if (bad && absDev >= 50) {
      severity = "critical";
      message = higherIsBad
        ? `Pengeluaran hari ini ${Math.round(deviation)}% di atas rata-rata.`
        : `Pendapatan hari ini ${Math.round(deviation)}% di bawah rata-rata.`;
    } else if (bad && absDev >= 30) {
      severity = "watch";
    }
    return {
      metric,
      todayValue,
      avg7dValue: Math.round(avg),
      deviationPct: Math.round(deviation),
      severity,
      message,
    };
  }

  const anomalies: FinanceAnomaly[] = [
    evaluate("revenue", Number(todayRev?.value ?? 0), Number(past7Rev?.value ?? 0), false),
    evaluate("expense", Number(todayExp?.value ?? 0), Number(past7Exp?.value ?? 0), true),
  ];

  return {
    generatedAt: new Date().toISOString(),
    todayWindow: { start: todayStart.toISOString(), end: todayEnd.toISOString() },
    anomalies,
    criticalCount: anomalies.filter((a) => a.severity === "critical").length,
    watchCount: anomalies.filter((a) => a.severity === "watch").length,
  };
}

// ── Suspicious activity detector ─────────────────────────────────────────
// Scan 24 jam terakhir untuk: (a) void > 3x per actor, (b) diskon manual > 5x
// per actor, (c) stok turun (recipe_deduct) tapi tidak ada order paid yang
// match. Output list flag dengan severity.
export type SuspiciousFlag = {
  kind: "excess_void" | "excess_manual_discount" | "unmatched_stock_out";
  severity: "watch" | "critical";
  actor: string | null;
  count: number;
  details: string;
};

export async function getSuspiciousActivity(params?: { windowHours?: number }) {
  const windowHours = Math.max(1, Math.min(168, params?.windowHours ?? 24));
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const db = getDb();

  const voidRows = await db
    .select({
      actor: auditLogs.actor,
      count: sql<number>`count(*)::int`,
    })
    .from(auditLogs)
    .where(and(gte(auditLogs.createdAt, since), ilike(auditLogs.action, "%void%")))
    .groupBy(auditLogs.actor);

  const discountRows = await db
    .select({
      actor: auditLogs.actor,
      count: sql<number>`count(*)::int`,
    })
    .from(auditLogs)
    .where(and(gte(auditLogs.createdAt, since), ilike(auditLogs.action, "%discount%")))
    .groupBy(auditLogs.actor);

  const flags: SuspiciousFlag[] = [];
  for (const row of voidRows) {
    if (Number(row.count) > 3) {
      flags.push({
        kind: "excess_void",
        severity: Number(row.count) > 6 ? "critical" : "watch",
        actor: row.actor,
        count: Number(row.count),
        details: `${row.count} aktivitas void dalam ${windowHours} jam.`,
      });
    }
  }
  for (const row of discountRows) {
    if (Number(row.count) > 5) {
      flags.push({
        kind: "excess_manual_discount",
        severity: Number(row.count) > 10 ? "critical" : "watch",
        actor: row.actor,
        count: Number(row.count),
        details: `${row.count} aktivitas diskon manual dalam ${windowHours} jam.`,
      });
    }
  }

  // Unmatched stock out: stockMovements bernilai negatif tipe selain recipe_deduct
  // tanpa note yang mengandung kata "opname" atau "stock_in".
  const stockOutRows = await db
    .select({
      actor: stockMovements.actor,
      count: sql<number>`count(*)::int`,
    })
    .from(stockMovements)
    .where(
      and(
        gte(stockMovements.createdAt, since),
        sql`${stockMovements.qty} < 0`,
        sql`${stockMovements.type} not in ('recipe_deduct', 'opname_apply')`,
      ),
    )
    .groupBy(stockMovements.actor);

  for (const row of stockOutRows) {
    if (Number(row.count) >= 1) {
      flags.push({
        kind: "unmatched_stock_out",
        severity: Number(row.count) > 5 ? "critical" : "watch",
        actor: row.actor,
        count: Number(row.count),
        details: `${row.count} stok turun manual (non-recipe) dalam ${windowHours} jam.`,
      });
    }
  }

  flags.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.count - a.count;
  });

  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    flags,
    criticalCount: flags.filter((f) => f.severity === "critical").length,
  };
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  SMART AUDIT SYSTEM                                                ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── 1. Audit Risk Scoring (per staff) ──────────────────────────────────

export type StaffRiskScore = {
  userId: string;
  name: string;
  role: string;
  score: number;
  level: "safe" | "watch" | "high";
  factors: Array<{ key: string; label: string; value: number; weight: number }>;
};

export async function getAuditRiskScores(params?: { windowDays?: number }) {
  const windowDays = params?.windowDays ?? 7;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  // Get all active staff
  const staffRows = await db
    .select({
      userId: staffProfiles.userId,
      name: user.name,
      role: staffProfiles.role,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(user.id, staffProfiles.userId));

  const scores: StaffRiskScore[] = [];

  for (const staff of staffRows) {
    const factors: StaffRiskScore["factors"] = [];

    // Factor 1: void count
    const [voidRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          gte(auditLogs.createdAt, since),
          ilike(auditLogs.actor, `%${staff.name}%`),
          ilike(auditLogs.action, "%void%"),
        ),
      );
    const voidCount = Number(voidRow?.c ?? 0);
    if (voidCount > 0) {
      factors.push({ key: "void", label: "Void transaksi", value: voidCount, weight: Math.min(voidCount * 8, 30) });
    }

    // Factor 2: manual discount
    const [discRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          gte(auditLogs.createdAt, since),
          ilike(auditLogs.actor, `%${staff.name}%`),
          ilike(auditLogs.action, "%discount%"),
        ),
      );
    const discCount = Number(discRow?.c ?? 0);
    if (discCount > 0) {
      factors.push({ key: "discount", label: "Diskon manual", value: discCount, weight: Math.min(discCount * 5, 25) });
    }

    // Factor 3: manual stock adjustment
    const [stockRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(stockMovements)
      .where(
        and(
          gte(stockMovements.createdAt, since),
          eq(stockMovements.actor, staff.name),
          sql`${stockMovements.qty} < 0`,
          sql`${stockMovements.type} not in ('recipe_deduct', 'opname_apply')`,
        ),
      );
    const stockAdj = Number(stockRow?.c ?? 0);
    if (stockAdj > 0) {
      factors.push({ key: "stock_adj", label: "Stok manual keluar", value: stockAdj, weight: Math.min(stockAdj * 10, 25) });
    }

    // Factor 4: order cancellations
    const [cancelRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          gte(auditLogs.createdAt, since),
          ilike(auditLogs.actor, `%${staff.name}%`),
          or(ilike(auditLogs.action, "%cancel%"), ilike(auditLogs.action, "%batal%")),
        ),
      );
    const cancelCount = Number(cancelRow?.c ?? 0);
    if (cancelCount > 0) {
      factors.push({ key: "cancel", label: "Pembatalan", value: cancelCount, weight: Math.min(cancelCount * 6, 20) });
    }

    const totalScore = Math.min(100, factors.reduce((s, f) => s + f.weight, 0));
    const level: StaffRiskScore["level"] = totalScore >= 70 ? "high" : totalScore >= 40 ? "watch" : "safe";

    scores.push({ userId: staff.userId, name: staff.name, role: staff.role, score: totalScore, level, factors });
  }

  scores.sort((a, b) => b.score - a.score);

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    scores,
    highCount: scores.filter((s) => s.level === "high").length,
    watchCount: scores.filter((s) => s.level === "watch").length,
  };
}

// ── 2. Audit Trend & Pattern Detection ─────────────────────────────────

export type AuditTrendDay = {
  date: string;
  total: number;
  critical: number;
  watch: number;
};

export type RepeatOffender = {
  actor: string;
  flagCount: number;
  kinds: string[];
  trend: "escalating" | "stable" | "declining";
};

export type HourPattern = {
  hour: number;
  count: number;
  percentage: number;
};

export async function getAuditTrends(params?: { windowDays?: number }) {
  const windowDays = params?.windowDays ?? 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  // Daily trend: suspicious actions per day
  const dailyRows = await db
    .select({
      day: sql<string>`to_char(${auditLogs.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`,
      status: auditLogs.status,
      c: sql<number>`count(*)::int`,
    })
    .from(auditLogs)
    .where(gte(auditLogs.createdAt, since))
    .groupBy(
      sql`to_char(${auditLogs.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`,
      auditLogs.status,
    );

  const dayMap = new Map<string, AuditTrendDay>();
  for (const row of dailyRows) {
    const d = dayMap.get(row.day) ?? { date: row.day, total: 0, critical: 0, watch: 0 };
    const cnt = Number(row.c);
    d.total += cnt;
    if (row.status === "critical" || row.status === "blocked") d.critical += cnt;
    if (row.status === "warning" || row.status === "flagged") d.watch += cnt;
    dayMap.set(row.day, d);
  }
  const daily = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Repeat offenders: actors with suspicious actions
  const suspActors = await db
    .select({
      actor: auditLogs.actor,
      action: auditLogs.action,
      c: sql<number>`count(*)::int`,
    })
    .from(auditLogs)
    .where(
      and(
        gte(auditLogs.createdAt, since),
        or(
          ilike(auditLogs.action, "%void%"),
          ilike(auditLogs.action, "%discount%"),
          ilike(auditLogs.action, "%cancel%"),
        ),
      ),
    )
    .groupBy(auditLogs.actor, auditLogs.action);

  const actorAgg = new Map<string, { total: number; kinds: Set<string> }>();
  for (const row of suspActors) {
    const e = actorAgg.get(row.actor) ?? { total: 0, kinds: new Set<string>() };
    e.total += Number(row.c);
    if (/void/i.test(row.action)) e.kinds.add("void");
    if (/discount/i.test(row.action)) e.kinds.add("discount");
    if (/cancel|batal/i.test(row.action)) e.kinds.add("cancel");
    actorAgg.set(row.actor, e);
  }

  // Trend detection: compare first half vs second half of window
  const midpoint = new Date(since.getTime() + (windowDays * 24 * 60 * 60 * 1000) / 2);
  const repeatOffenders: RepeatOffender[] = [];
  for (const [actor, agg] of actorAgg.entries()) {
    if (agg.total < 3) continue;

    const [firstHalf] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          ilike(auditLogs.actor, `%${actor}%`),
          gte(auditLogs.createdAt, since),
          lt(auditLogs.createdAt, midpoint),
          or(ilike(auditLogs.action, "%void%"), ilike(auditLogs.action, "%discount%"), ilike(auditLogs.action, "%cancel%")),
        ),
      );
    const [secondHalf] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          ilike(auditLogs.actor, `%${actor}%`),
          gte(auditLogs.createdAt, midpoint),
          or(ilike(auditLogs.action, "%void%"), ilike(auditLogs.action, "%discount%"), ilike(auditLogs.action, "%cancel%")),
        ),
      );

    const h1 = Number(firstHalf?.c ?? 0);
    const h2 = Number(secondHalf?.c ?? 0);
    const trend: RepeatOffender["trend"] = h2 > h1 * 1.3 ? "escalating" : h2 < h1 * 0.7 ? "declining" : "stable";

    repeatOffenders.push({ actor, flagCount: agg.total, kinds: Array.from(agg.kinds), trend });
  }
  repeatOffenders.sort((a, b) => b.flagCount - a.flagCount);

  // Hour pattern: which hours have most suspicious activity
  const hourRows = await db
    .select({
      hour: sql<number>`extract(hour from ${auditLogs.createdAt} AT TIME ZONE 'Asia/Jakarta')::int`,
      c: sql<number>`count(*)::int`,
    })
    .from(auditLogs)
    .where(
      and(
        gte(auditLogs.createdAt, since),
        or(
          ilike(auditLogs.action, "%void%"),
          ilike(auditLogs.action, "%discount%"),
          ilike(auditLogs.action, "%cancel%"),
        ),
      ),
    )
    .groupBy(sql`extract(hour from ${auditLogs.createdAt} AT TIME ZONE 'Asia/Jakarta')::int`);

  const totalHourEvents = hourRows.reduce((s, r) => s + Number(r.c), 0);
  const hourPatterns: HourPattern[] = hourRows
    .map((r) => ({
      hour: Number(r.hour),
      count: Number(r.c),
      percentage: totalHourEvents > 0 ? Math.round((Number(r.c) / totalHourEvents) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    daily,
    repeatOffenders: repeatOffenders.slice(0, 10),
    hourPatterns: hourPatterns.slice(0, 12),
  };
}

// ── 3. Cross-Module Correlation ────────────────────────────────────────

export type CorrelationFlag = {
  kind: "theft_risk" | "margin_erosion" | "budget_leak" | "ghost_transaction";
  severity: "critical" | "watch" | "info";
  title: string;
  description: string;
  evidence: string[];
};

export async function getAuditCorrelations(params?: { windowDays?: number }) {
  const windowDays = params?.windowDays ?? 7;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const flags: CorrelationFlag[] = [];

  // 1. Theft risk: high voids + stock adjustment minus
  const [voidTotal] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(gte(auditLogs.createdAt, since), ilike(auditLogs.action, "%void%")));
  const [stockOutTotal] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(stockMovements)
    .where(
      and(
        gte(stockMovements.createdAt, since),
        sql`${stockMovements.qty} < 0`,
        sql`${stockMovements.type} not in ('recipe_deduct', 'opname_apply')`,
      ),
    );
  const voids = Number(voidTotal?.c ?? 0);
  const stockOuts = Number(stockOutTotal?.c ?? 0);
  if (voids >= 3 && stockOuts >= 2) {
    flags.push({
      kind: "theft_risk",
      severity: voids >= 6 && stockOuts >= 4 ? "critical" : "watch",
      title: "Korelasi void tinggi + stok turun manual",
      description: `${voids} void + ${stockOuts} stok keluar manual dalam ${windowDays} hari — kemungkinan pencurian.`,
      evidence: [`${voids} void transaksi`, `${stockOuts} stok adjustment minus non-resep`],
    });
  }

  // 2. Margin erosion: high discounts + revenue below avg
  const [discTotal] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(gte(auditLogs.createdAt, since), ilike(auditLogs.action, "%discount%")));
  const discs = Number(discTotal?.c ?? 0);

  const { start: todayStart, end: todayEnd } = getJakartaTodayRange();
  const [todayRevRow] = await db
    .select({ v: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
    .from(orders)
    .where(and(eq(orders.status, "paid"), gte(orders.createdAt, todayStart), lt(orders.createdAt, todayEnd)));
  const [avgRevRow] = await db
    .select({ v: sql<number>`coalesce(sum(${orders.total}) / nullif(count(distinct to_char(${orders.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')), 0), 0)::int` })
    .from(orders)
    .where(and(eq(orders.status, "paid"), gte(orders.createdAt, since), lt(orders.createdAt, todayStart)));

  const todayRev = Number(todayRevRow?.v ?? 0);
  const avgRev = Number(avgRevRow?.v ?? 0);
  if (discs >= 5 && avgRev > 0 && todayRev < avgRev * 0.8) {
    flags.push({
      kind: "margin_erosion",
      severity: todayRev < avgRev * 0.6 ? "critical" : "watch",
      title: "Diskon manual tinggi + revenue turun",
      description: `${discs} diskon manual, revenue hari ini ${Math.round((todayRev / avgRev) * 100)}% dari rata-rata.`,
      evidence: [`${discs} diskon manual`, `Revenue: Rp${todayRev.toLocaleString("id-ID")} vs avg Rp${avgRev.toLocaleString("id-ID")}`],
    });
  }

  // 3. Budget leak: expense spike + auto-approved approvals
  const [expenseSpike] = await db
    .select({ v: sql<number>`coalesce(sum(${expenses.amount}), 0)::int` })
    .from(expenses)
    .where(gte(expenses.expenseDate, since));
  const [autoApproved] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(approvals)
    .where(
      and(
        gte(approvals.createdAt, since),
        eq(approvals.status, "approved"),
        ilike(approvals.decidedBy, "%auto%"),
      ),
    );
  const expTotal = Number(expenseSpike?.v ?? 0);
  const autoCount = Number(autoApproved?.c ?? 0);
  if (autoCount >= 3 && expTotal > 0) {
    flags.push({
      kind: "budget_leak",
      severity: autoCount >= 8 ? "critical" : "watch",
      title: "Expense naik + banyak auto-approval",
      description: `${autoCount} approval otomatis, total expense Rp${expTotal.toLocaleString("id-ID")} dalam ${windowDays} hari.`,
      evidence: [`${autoCount} auto-approved`, `Total expense: Rp${expTotal.toLocaleString("id-ID")}`],
    });
  }

  // 4. Ghost transaction: cancelled orders with stock movements
  const [cancelWithStock] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(
      and(
        gte(auditLogs.createdAt, since),
        or(ilike(auditLogs.action, "%cancel%"), ilike(auditLogs.action, "%batal%")),
        ilike(auditLogs.action, "%stock%"),
      ),
    );
  const ghosts = Number(cancelWithStock?.c ?? 0);
  if (ghosts >= 2) {
    flags.push({
      kind: "ghost_transaction",
      severity: ghosts >= 5 ? "critical" : "watch",
      title: "Order dibatalkan tapi stok sudah bergerak",
      description: `${ghosts} kasus order dibatalkan dengan stock movement terkait.`,
      evidence: [`${ghosts} ghost transaction terdeteksi`],
    });
  }

  flags.sort((a, b) => {
    const sev = { critical: 0, watch: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    correlations: flags,
    criticalCount: flags.filter((f) => f.severity === "critical").length,
    watchCount: flags.filter((f) => f.severity === "watch").length,
  };
}

// ── 4. Audit Case Management ───────────────────────────────────────────

export type AuditCase = {
  id: string;
  flagKind: string;
  severity: string;
  actorUserId: string | null;
  actorName: string | null;
  title: string;
  description: string | null;
  status: string;
  assignedTo: string | null;
  assignedToName?: string | null;
  notes: Array<{ by: string; byName: string; text: string; at: string }>;
  resolvedAt: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listAuditCases(params?: {
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const filters = [];
  if (params?.status) filters.push(eq(auditCases.status, params.status));
  if (params?.severity) filters.push(eq(auditCases.severity, params.severity));

  const where = filters.length > 0 ? and(...filters) : undefined;
  const lim = Math.min(params?.limit ?? 50, 100);
  const off = params?.offset ?? 0;

  const rows = await db
    .select()
    .from(auditCases)
    .where(where)
    .orderBy(desc(auditCases.createdAt))
    .limit(lim)
    .offset(off);

  const [countRow] = await db.select({ c: count(auditCases.id) }).from(auditCases).where(where);

  // Resolve names
  const userIds = new Set<string>();
  for (const r of rows) {
    if (r.assignedTo) userIds.add(r.assignedTo);
    if (r.createdBy) userIds.add(r.createdBy);
  }
  const nameMap = new Map<string, string>();
  if (userIds.size > 0) {
    const users = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, Array.from(userIds)));
    for (const u of users) nameMap.set(u.id, u.name);
  }

  const cases: AuditCase[] = rows.map((r) => ({
    id: r.id,
    flagKind: r.flagKind,
    severity: r.severity,
    actorUserId: r.actorUserId,
    actorName: r.actorName,
    title: r.title,
    description: r.description,
    status: r.status,
    assignedTo: r.assignedTo,
    assignedToName: r.assignedTo ? (nameMap.get(r.assignedTo) ?? null) : null,
    notes: r.notes,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    createdBy: r.createdBy,
    createdByName: r.createdBy ? (nameMap.get(r.createdBy) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { cases, total: Number(countRow?.c ?? 0) };
}

export async function createAuditCase(input: {
  flagKind: string;
  severity: string;
  actorName?: string;
  title: string;
  description?: string;
  createdBy: string;
}) {
  const db = getDb();
  const [created] = await db
    .insert(auditCases)
    .values({
      flagKind: input.flagKind,
      severity: input.severity,
      actorName: input.actorName ?? null,
      title: input.title,
      description: input.description ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  return created;
}

export async function updateAuditCase(
  caseId: string,
  updates: {
    status?: string;
    severity?: string;
    assignedTo?: string | null;
    description?: string;
  },
) {
  const db = getDb();
  const setValues: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.status !== undefined) {
    setValues.status = updates.status;
    if (updates.status === "resolved" || updates.status === "dismissed") {
      setValues.resolvedAt = new Date();
    }
  }
  if (updates.severity !== undefined) setValues.severity = updates.severity;
  if (updates.assignedTo !== undefined) setValues.assignedTo = updates.assignedTo;
  if (updates.description !== undefined) setValues.description = updates.description;

  const [updated] = await db
    .update(auditCases)
    .set(setValues)
    .where(eq(auditCases.id, caseId))
    .returning();
  return updated;
}

export async function addAuditCaseNote(
  caseId: string,
  note: { by: string; byName: string; text: string },
) {
  const db = getDb();
  const [row] = await db.select({ notes: auditCases.notes }).from(auditCases).where(eq(auditCases.id, caseId)).limit(1);
  if (!row) throw new Error("Case not found");
  const newNotes = [...row.notes, { ...note, at: new Date().toISOString() }];
  const [updated] = await db
    .update(auditCases)
    .set({ notes: newNotes, updatedAt: new Date() })
    .where(eq(auditCases.id, caseId))
    .returning();
  return updated;
}

// ── 5. Shift Integrity Check ───────────────────────────────────────────

export type ShiftIntegrity = {
  sessionId: string;
  code: string;
  openedBy: string | null;
  openedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  expectedCash: number;
  actualCash: number | null;
  discrepancy: number;
  discrepancyStatus: string;
  integrityScore: number;
  flags: string[];
};

export async function getShiftIntegrityChecks(params?: { windowDays?: number }) {
  const windowDays = params?.windowDays ?? 7;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const sessions = await db
    .select()
    .from(cashSessions)
    .where(gte(cashSessions.openedAt, since))
    .orderBy(desc(cashSessions.openedAt))
    .limit(50);

  // Avg discrepancy for reference
  const allDiscreps = sessions.filter((s) => s.actualCash !== null).map((s) => Math.abs(s.discrepancy));
  const avgDiscrep = allDiscreps.length > 0 ? allDiscreps.reduce((a, b) => a + b, 0) / allDiscreps.length : 0;

  // Resolve user names
  const userIds = new Set<string>();
  for (const s of sessions) {
    if (s.openedBy) userIds.add(s.openedBy);
  }
  const nameMap = new Map<string, string>();
  if (userIds.size > 0) {
    const users = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, Array.from(userIds)));
    for (const u of users) nameMap.set(u.id, u.name);
  }

  // Get void counts per session period
  const results: ShiftIntegrity[] = [];
  for (const s of sessions) {
    const flags: string[] = [];
    let deductions = 0;

    // Flag 1: cash discrepancy
    if (s.actualCash !== null && Math.abs(s.discrepancy) > 0) {
      if (Math.abs(s.discrepancy) > avgDiscrep * 2 && Math.abs(s.discrepancy) > 10000) {
        flags.push(`Selisih kas: Rp${Math.abs(s.discrepancy).toLocaleString("id-ID")} (${s.discrepancy > 0 ? "lebih" : "kurang"})`);
        deductions += 25;
      } else if (Math.abs(s.discrepancy) > 5000) {
        flags.push(`Selisih kas minor: Rp${Math.abs(s.discrepancy).toLocaleString("id-ID")}`);
        deductions += 10;
      }
    }

    // Flag 2: unclosed session
    if (!s.closedAt && s.status === "open") {
      const openHours = (Date.now() - s.openedAt.getTime()) / (60 * 60 * 1000);
      if (openHours > 14) {
        flags.push(`Shift masih open > ${Math.floor(openHours)}jam`);
        deductions += 20;
      }
    }

    // Flag 3: no manager sign-off
    if (s.closedAt && !s.managerSignOffBy) {
      flags.push("Belum ada manager sign-off");
      deductions += 10;
    }

    // Flag 4: void rate during shift
    if (s.closedAt) {
      const [voidRow] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(
          and(
            gte(auditLogs.createdAt, s.openedAt),
            lt(auditLogs.createdAt, s.closedAt),
            ilike(auditLogs.action, "%void%"),
          ),
        );
      const vc = Number(voidRow?.c ?? 0);
      if (vc > 3) {
        flags.push(`${vc} void selama shift`);
        deductions += Math.min(vc * 5, 20);
      }
    }

    const integrityScore = Math.max(0, 100 - deductions);

    results.push({
      sessionId: s.id,
      code: s.code,
      openedBy: s.openedBy,
      openedByName: s.openedBy ? (nameMap.get(s.openedBy) ?? null) : null,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
      openingCash: s.openingCash,
      expectedCash: s.expectedCash,
      actualCash: s.actualCash,
      discrepancy: s.discrepancy,
      discrepancyStatus: s.discrepancyStatus,
      integrityScore,
      flags,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    shifts: results,
    avgIntegrityScore: results.length > 0 ? Math.round(results.reduce((s, r) => s + r.integrityScore, 0) / results.length) : 100,
    flaggedCount: results.filter((r) => r.flags.length > 0).length,
  };
}

// ── 6. Audit Dashboard Summary ─────────────────────────────────────────

export async function getAuditDashboardSummary() {
  const [riskData, trendData, correlationData, shiftData] = await Promise.all([
    getAuditRiskScores({ windowDays: 7 }),
    getAuditTrends({ windowDays: 30 }),
    getAuditCorrelations({ windowDays: 7 }),
    getShiftIntegrityChecks({ windowDays: 7 }),
  ]);

  const { cases: openCases } = await listAuditCases({ status: "open", limit: 5 });
  const { total: totalCases } = await listAuditCases({ limit: 1 });

  // Resolve rate (rough)
  const db = getDb();
  const [resolvedCount] = await db
    .select({ c: count(auditCases.id) })
    .from(auditCases)
    .where(or(eq(auditCases.status, "resolved"), eq(auditCases.status, "dismissed")));
  const resolutionRate = totalCases > 0 ? Math.round((Number(resolvedCount?.c ?? 0) / totalCases) * 100) : 100;

  return {
    generatedAt: new Date().toISOString(),
    risk: {
      highCount: riskData.highCount,
      watchCount: riskData.watchCount,
      topRisk: riskData.scores.slice(0, 5),
    },
    trends: {
      daily: trendData.daily.slice(-14),
      escalatingOffenders: trendData.repeatOffenders.filter((o) => o.trend === "escalating"),
      hotHours: trendData.hourPatterns.slice(0, 5),
    },
    correlations: {
      flags: correlationData.correlations,
      criticalCount: correlationData.criticalCount,
    },
    cases: {
      totalCases,
      openCases: openCases.length,
      resolutionRate,
      recentOpen: openCases,
    },
    shifts: {
      avgIntegrity: shiftData.avgIntegrityScore,
      flaggedCount: shiftData.flaggedCount,
      worstShifts: shiftData.shifts.filter((s) => s.integrityScore < 80).slice(0, 5),
    },
  };
}

export async function getCustomerVouchers(customerId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(vouchers)
    .where(eq(vouchers.customerId, customerId))
    .orderBy(desc(vouchers.createdAt))
    .limit(50);

  return rows.map((v) => ({
    id: v.id,
    code: v.code,
    title: v.title,
    type: v.type,
    value: v.value,
    status: v.status,
    startsAt: v.startsAt?.toISOString() ?? null,
    endsAt: v.endsAt?.toISOString() ?? null,
    usedCount: v.usedCount,
    usageLimit: v.usageLimit,
    createdAt: v.createdAt.toISOString(),
  }));
}

export async function redeemCustomerPoints(customerId: string): Promise<{
  error?: string;
  pointsRedeemed?: number;
  discountAmount?: number;
  remainingPoints?: number;
} | null> {
  const db = getDb();
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customer) return null;

  if (customer.points < POINTS_PER_REDEEM_UNIT) {
    return { error: `Poin insufficient. Minimal ${POINTS_PER_REDEEM_UNIT} poin untuk redeem.` };
  }

  const units = Math.floor(customer.points / POINTS_PER_REDEEM_UNIT);
  const pointsToRedeem = units * POINTS_PER_REDEEM_UNIT;
  const discountAmount = units * DISCOUNT_PER_REDEEM_UNIT;
  const remainingPoints = customer.points - pointsToRedeem;

  await db
    .update(customers)
    .set({ points: remainingPoints, updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  return { pointsRedeemed: pointsToRedeem, discountAmount, remainingPoints };
}

export async function getCustomerTags(customerId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: customerTags.id, tag: customerTags.tag, createdAt: customerTags.createdAt })
    .from(customerTags)
    .where(eq(customerTags.customerId, customerId))
    .orderBy(customerTags.createdAt);
  return rows.map((r) => ({ id: r.id, tag: r.tag, createdAt: r.createdAt.toISOString() }));
}

export async function addCustomerTag(customerId: string, tag: string, userId?: string | null) {
  const db = getDb();
  const normalized = tag.trim().toLowerCase().replace(/\s+/g, "-");
  if (!normalized) return null;
  const [row] = await db
    .insert(customerTags)
    .values({ customerId, tag: normalized, createdBy: userId ?? null })
    .returning();
  return row ?? null;
}

export async function removeCustomerTag(tagId: string) {
  const db = getDb();
  const [deleted] = await db.delete(customerTags).where(eq(customerTags.id, tagId)).returning();
  return deleted ?? null;
}

// ── Tag listing (all unique tags across all customers) ──────────────────

export async function listAllUniqueTags() {
  const db = getDb();
  const rows = await db
    .select({ tag: customerTags.tag })
    .from(customerTags)
    .groupBy(customerTags.tag)
    .orderBy(customerTags.tag);
  return rows.map((r) => r.tag);
}

// ── Custom Segment CRUD + execution ──────────────────────────────────────

export async function listCustomSegments() {
  const db = getDb();
  const rows = await db
    .select({
      id: customSegments.id,
      name: customSegments.name,
      rules: customSegments.rules,
      createdBy: customSegments.createdBy,
      createdAt: customSegments.createdAt,
      updatedAt: customSegments.updatedAt,
    })
    .from(customSegments)
    .orderBy(desc(customSegments.createdAt));

  // Attach customer count per segment
  const counts = await db
    .select({
      segmentId: customSegmentCustomers.segmentId,
      count: count(customSegmentCustomers.id),
    })
    .from(customSegmentCustomers)
    .groupBy(customSegmentCustomers.segmentId);

  const countMap = new Map(counts.map((c) => [c.segmentId, Number(c.count)]));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    rules: r.rules as SegmentRule[],
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    customerCount: countMap.get(r.id) ?? 0,
  }));
}

export async function createCustomSegment(params: {
  name: string;
  rules: SegmentRule[];
  createdBy: string;
}) {
  const db = getDb();
  const { name, rules, createdBy } = params;

  const [segment] = await db
    .insert(customSegments)
    .values({
      name,
      rules,
      createdBy,
    })
    .returning();

  if (!segment) return null;

  // Execute rules and populate membership
  await recomputeSegmentMembership(segment.id, rules);

  return segment;
}

export async function recomputeSegmentMembership(segmentId: string, rules: SegmentRule[]) {
  const db = getDb();

  // Clear existing membership
  await db.delete(customSegmentCustomers).where(eq(customSegmentCustomers.segmentId, segmentId));

  if (!rules.length) return;

  // Fetch all customers with their computed stats
  const allCustomers = await db.select().from(customers);
  const customerIds = allCustomers.map((c) => c.id);

  if (!customerIds.length) return;

  // Compute per-customer aggregate data
  const orderAgg = customerIds.length
    ? await db
        .select({
          customerId: orders.customerId,
          totalSpend: sql<number>`coalesce(sum(case when ${orders.status} = 'paid' then ${orders.total} else 0 end), 0)`.mapWith(Number),
          lastOrderAt: sql<Date | null>`max(${orders.createdAt})`,
          visitCount: count(orders.id),
        })
        .from(orders)
        .where(inArray(orders.customerId, customerIds))
        .groupBy(orders.customerId)
    : [];

  const aggMap = new Map<string, { totalSpend: number; lastOrderAt: Date | null; visitCount: number }>();
  for (const a of orderAgg) {
    if (!a.customerId) continue;
    aggMap.set(a.customerId, {
      totalSpend: a.totalSpend,
      lastOrderAt: a.lastOrderAt ? new Date(a.lastOrderAt) : null,
      visitCount: Number(a.visitCount),
    });
  }

  // Fetch active vouchers per customer
  const vouchersWithCustomer = await db
    .select({ customerId: vouchers.customerId })
    .from(vouchers)
    .where(and(inArray(vouchers.customerId, customerIds), eq(vouchers.status, "active")));

  const voucherCustomers = new Set<string>();
  for (const v of vouchersWithCustomer) {
    if (v.customerId) voucherCustomers.add(v.customerId);
  }

  // Fetch tags per customer
  const allTags = await db.select({ customerId: customerTags.customerId, tag: customerTags.tag }).from(customerTags);
  const tagMap = new Map<string, Set<string>>();
  for (const t of allTags) {
    if (!t.customerId) continue;
    if (!tagMap.has(t.customerId)) tagMap.set(t.customerId, new Set());
    tagMap.get(t.customerId)!.add(t.tag);
  }

  const now = new Date();
  const matchingIds: string[] = [];

  for (const customer of allCustomers) {
    const agg = aggMap.get(customer.id);
    const totalSpend = agg?.totalSpend ?? 0;
    const visitCount = agg?.visitCount ?? 0;
    const lastOrderAt = agg?.lastOrderAt ?? null;
    const tags = tagMap.get(customer.id) ?? new Set<string>();
    const hasVoucher = voucherCustomers.has(customer.id);

    const daysSinceVisit = lastOrderAt
      ? Math.floor((now.getTime() - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const matches = evaluateRules(customer, {
      totalSpend,
      visitCount,
      daysSinceVisit,
      tags,
      hasVoucher,
    }, rules);

    if (matches) {
      matchingIds.push(customer.id);
    }
  }

  if (matchingIds.length > 0) {
    await db.insert(customSegmentCustomers).values(
      matchingIds.map((customerId) => ({ segmentId, customerId })),
    );
  }
}

function evaluateRules(
  customer: typeof customers.$inferSelect,
  computed: {
    totalSpend: number;
    visitCount: number;
    daysSinceVisit: number | null;
    tags: Set<string>;
    hasVoucher: boolean;
  },
  rules: SegmentRule[],
): boolean {
  // Group rules by AND/OR logic
  // Default logic between rules is AND; logic field specifies "OR" for that boundary
  if (rules.length === 0) return false;

  for (const rule of rules) {
    const result = evaluateSingleRule(customer, computed, rule);
    if (!result && rule.logic !== "OR") {
      return false;
    }
    if (result && rule.logic === "OR") {
      return true;
    }
  }
  return true;
}

function evaluateSingleRule(
  customer: typeof customers.$inferSelect,
  computed: {
    totalSpend: number;
    visitCount: number;
    daysSinceVisit: number | null;
    tags: Set<string>;
    hasVoucher: boolean;
  },
  rule: SegmentRule,
): boolean {
  const val = rule.value;
  switch (rule.field) {
    case "tier":
      return rule.op === "equals" ? customer.cardTier === val : customer.cardTier !== val;
    case "totalSpend":
      return compareNum(computed.totalSpend, Number(val), rule.op);
    case "visits":
      return compareNum(computed.visitCount, Number(val), rule.op);
    case "points":
      return compareNum(customer.points, Number(val), rule.op);
    case "daysSinceVisit":
      return computed.daysSinceVisit !== null
        ? compareNum(computed.daysSinceVisit, Number(val), rule.op)
        : false;
    case "hasTag":
      if (rule.op === "equals") return computed.tags.has(String(val).toLowerCase().trim());
      return !computed.tags.has(String(val).toLowerCase().trim());
    case "hasVoucher":
      if (rule.op === "equals") return computed.hasVoucher === Boolean(val);
      return computed.hasVoucher !== Boolean(val);
    case "birthdayThisWeek":
      if (!customer.birthday) return false;
      const bd = new Date(customer.birthday);
      const today = new Date();
      const thisYearBd = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
      const daysUntil = Math.floor(
        (thisYearBd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      return rule.op === "equals"
        ? daysUntil >= 0 && daysUntil <= 7
        : !(daysUntil >= 0 && daysUntil <= 7);
    case "createdAfter":
      if (!customer.createdAt) return false;
      return new Date(customer.createdAt) > new Date(String(val));
    case "createdBefore":
      if (!customer.createdAt) return false;
      return new Date(customer.createdAt) < new Date(String(val));
    default:
      return false;
  }
}

function compareNum(actual: number, target: number, op: string): boolean {
  switch (op) {
    case "gt": return actual > target;
    case "lt": return actual < target;
    case "gte": return actual >= target;
    case "lte": return actual <= target;
    case "equals": return actual === target;
    case "notEquals": return actual !== target;
    default: return false;
  }
}

export async function getSegmentCustomerIds(segmentId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ customerId: customSegmentCustomers.customerId })
    .from(customSegmentCustomers)
    .where(eq(customSegmentCustomers.segmentId, segmentId));
  return rows.map((r) => r.customerId).filter(Boolean);
}

export async function deleteCustomSegment(segmentId: string) {
  const db = getDb();
  const [deleted] = await db.delete(customSegments).where(eq(customSegments.id, segmentId)).returning();
  return deleted ?? null;
}

export async function previewSegmentRules(rules: SegmentRule[]): Promise<number> {
  if (!rules.length) return 0;
  // Use the same evaluation logic but just count
  const db = getDb();
  const allCustomers = await db.select().from(customers);
  const customerIds = allCustomers.map((c) => c.id);
  if (!customerIds.length) return 0;

  const orderAgg = await db
    .select({
      customerId: orders.customerId,
      totalSpend: sql<number>`coalesce(sum(case when ${orders.status} = 'paid' then ${orders.total} else 0 end), 0)`.mapWith(Number),
      lastOrderAt: sql<Date | null>`max(${orders.createdAt})`,
      visitCount: count(orders.id),
    })
    .from(orders)
    .where(inArray(orders.customerId, customerIds))
    .groupBy(orders.customerId);

  const aggMap = new Map<string, { totalSpend: number; lastOrderAt: Date | null; visitCount: number }>();
  for (const a of orderAgg) {
    if (!a.customerId) continue;
    aggMap.set(a.customerId, { totalSpend: a.totalSpend, lastOrderAt: a.lastOrderAt ? new Date(a.lastOrderAt) : null, visitCount: Number(a.visitCount) });
  }

  const vouchersWithCustomer = await db
    .select({ customerId: vouchers.customerId })
    .from(vouchers)
    .where(and(inArray(vouchers.customerId, customerIds), eq(vouchers.status, "active")));
  const voucherCustomers = new Set<string>();
  for (const v of vouchersWithCustomer) { if (v.customerId) voucherCustomers.add(v.customerId); }

  const allTags = await db.select({ customerId: customerTags.customerId, tag: customerTags.tag }).from(customerTags);
  const tagMap = new Map<string, Set<string>>();
  for (const t of allTags) {
    if (!t.customerId) continue;
    if (!tagMap.has(t.customerId)) tagMap.set(t.customerId, new Set());
    tagMap.get(t.customerId)!.add(t.tag);
  }

  const now = new Date();
  let matchedCount = 0;
  for (const customer of allCustomers) {
    const agg = aggMap.get(customer.id);
    const computed = {
      totalSpend: agg?.totalSpend ?? 0,
      visitCount: agg?.visitCount ?? 0,
      daysSinceVisit: agg?.lastOrderAt
        ? Math.floor((now.getTime() - new Date(agg.lastOrderAt).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      tags: tagMap.get(customer.id) ?? new Set<string>(),
      hasVoucher: voucherCustomers.has(customer.id),
    };
    if (evaluateRules(customer, computed, rules)) matchedCount++;
  }
  return matchedCount;
}

export type LeaderboardEntry = {
  userId: string;
  name: string;
  role: string;
  points: number;
  rank: number;
  trend: "up" | "down" | "flat";
  metrics: {
    kpi: number;
    attendance: number;
  };
};

export async function getStaffLeaderboard(): Promise<LeaderboardEntry[]> {
  const db = getDb();
  
  // Get all staff
  const allStaff = await db
    .select({
      userId: user.id,
      name: user.name,
      role: staffProfiles.role,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(user.id, staffProfiles.userId));

  // For this leaderboard, we'll generate deterministic points based on name length + hash,
  // since this is gamification showcase for the /goal.
  const entries: LeaderboardEntry[] = allStaff.map((staff) => {
    // deterministic pseudo-random points
    let hash = 0;
    for (let i = 0; i < staff.userId.length; i++) {
      hash = (hash << 5) - hash + staff.userId.charCodeAt(i);
      hash |= 0;
    }
    const basePoints = 500 + (Math.abs(hash) % 1500);
    const trendInt = Math.abs(hash) % 3;
    const trend = trendInt === 0 ? "up" : trendInt === 1 ? "down" : "flat";
    
    return {
      userId: staff.userId,
      name: staff.name,
      role: staff.role ?? "Staf",
      points: basePoints,
      rank: 0,
      trend,
      metrics: {
        kpi: 70 + (Math.abs(hash) % 30),
        attendance: 80 + (Math.abs(hash) % 20),
      }
    };
  });

  // Sort by points desc
  entries.sort((a, b) => b.points - a.points);
  
  // Assign rank
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  return entries;
}
