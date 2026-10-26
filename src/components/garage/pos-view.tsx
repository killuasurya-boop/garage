"use client";

import {
AlertTriangle,
Archive,
ArrowLeft,
ArrowRight,
Ban,
Banknote,
Camera,
Coffee,
Cookie,
CupSoda,
UtensilsCrossed,
Loader2,
BarChart3,
Bell,
Check,
ClipboardCheck,
Clock,
Copy,
CreditCard,
Download,
Equal,
ExternalLink,
Fingerprint,
FileText,
History,
Info,
Landmark,
Headset,
LockKeyhole,
LogOut,
Menu,
MessageCircle,
Mic,
Minus,
Monitor,
Moon,
MoreHorizontal,
PauseCircle,
Percent,
Plus,
Printer,
QrCode,
ReceiptText,
RefreshCw,
Scissors,
Search,
Settings,
ShieldAlert,
ShieldCheck,
ShoppingCart,
Square,
Star,
SunMedium,
Timer,
Trash2,
UserPlus,
Users,
Volume2,
Wallet,
ClipboardList,
WalletCards,
X
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
ChangeEvent,
ComponentType,
FormEvent,
useCallback,
useDeferredValue,
useEffect,
useMemo,
useRef,
useState
} from "react";

import {
bankAccounts,
canAcceptCustomerOrder,
customerOrderFulfillmentLabel,
deliveryStatusLabel,
canConfirmCustomerPayment,
canFinalizeCustomerOrder,
canRejectCustomerOrder,
compactTableNumber,
customerOrderInvoiceNo,
customerOrderInvoiceStatusLabel,
customerOrderNeedsWaiterCash,
customerOrderPaymentLabel,
customerOrderPaymentMethod,
customerOrderPaymentProvider,
customerOrderPaymentReference,
customerOrderPaymentStatusLabel,
defaultPaymentProvider,
eWalletAccounts,
fallbackTableLiveRow,
generateTemporaryMemberPin,
initialsForProfile,
isWaiterRole,
loadCashierPosSettings,
loadParkedOrders,
loadReceiptHistory,
paymentBrandConfig,
paymentMethods,
persistCashierPosSettings,
persistParkedOrders,
persistReceiptHistory,
persistSoldOutIds,
tableAvailabilityLabel,
tableAvailabilityState,
tableHasLiveSession,
hasOpenTableBill,
tableLiveStatusLabel,
tableLiveStatusTone,
tableNeedsCleaning,
tableNumbers,
tablesInRange,
type CashierPosSettings,
type ParkedOrder,
type PaymentMethod,
type PosAutoLockDelay,
type PosBillLayout,
type PosCardDensity,
type PosCustomerMode,
type PosQrSoundMode,
type PosReceiptPrintMode,
type PosTextSize,
type TableAvailability
} from "@/components/garage/garage-app-helpers";
import {
CashierThemePresetGrid,
OpeningCashPresetPicker,
SettingsChoiceGroup,
type CashierThemeMode
} from "@/components/garage/garage-app-pickers";
import { ShiftStartStatus } from "@/components/garage/pos-shift-start-status";
import { CloseShiftForm, type CloseShiftPayload } from "@/components/garage/pos-close-shift-form";
import { DevicePrinterPanel } from "@/components/garage/device-printer-panel";
import { SalesReport } from "@/components/garage/sales-report";
import { printShiftSlip } from "@/lib/management-slip-print";
import { TablePlate } from "@/components/garage/table-plate";
import { Alert,AlertDescription,AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
Dialog,
DialogContent,
DialogDescription,
DialogHeader,
DialogTitle,
DialogTrigger,
} from "@/components/ui/dialog";
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuLabel,
DropdownMenuSeparator,
DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
Sheet,
SheetContent,
SheetDescription,
SheetHeader,
SheetTitle
} from "@/components/ui/sheet";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { GarageApiError, garageApi } from "@/lib/api-client";
import { canAccessModule } from "@/lib/role-access";
import { GARAGE_TAGS, invalidateGarageCache } from "@/lib/garage-cache";
import type {
AppSettings,
CartLine,
CashSession,
Customer,
CustomerOrder,
CustomerOrderActionResponse,
GarageMe,
KitchenOrder,
MenuFilter,
MenuItem,
MenuVariant,
OrderCreateResponse,
OrderReceipt,
OrderType,
PosMemberCreateResponse,
PosMemberLookupResponse,
QrControlInsights,
TableLiveRow,
TableOrderBill,
VoucherValidation
} from "@/lib/garage-api-types";
import { menuFilterMatches, menuGroupForCategory, menuSubCategoriesFrom } from "@/lib/garage-api-types";
import { printDocument, printKitchenChit, printKitchenChits, printThermal } from "@/lib/print-client";
import { PosProductionPanel, ticketToChit } from "@/components/garage/pos-production-panel";
import { denominationTotals, OpeningDenominationCount } from "@/components/garage/cash-denomination-grid";
import { PosShiftSalesSummary } from "@/components/garage/pos-shift-sales-summary";
import { PosInvoiceDeleteDialog, type InvoiceDeleteTarget } from "@/components/garage/pos-invoice-delete-dialog";
import { PAYMENT_STATUS_LABEL, paymentStatusOf, type PaymentStatus } from "@/lib/payment-status";
import { quickCashOptions } from "@/lib/pos-cash";
import { cashConfirmLabel, normalizePaymentReference } from "@/lib/tender-guard";
import { menuShortcodes, shortcodeMatchRank } from "@/lib/menu-shortcode";
import { buildCashMovementSlipContent } from "@/lib/management-slips";
import { CashDrawerDialog, type CashMovementRecorded } from "@/components/garage/cash-drawer-dialog";
import { claimReprint } from "@/lib/reprint-guard";
import { isDirectHandoverMenu, productionStationFor } from "@/lib/garage-production-rules";
import type { KitchenChitItem } from "@/lib/thermal-receipt";
import {
currency
} from "@/lib/garage-data";
import {
garageQrOrderPath,
garageQrOrderUrl,
isLocalQrBaseUrl,
} from "@/lib/garage-qr";
import { formatTableDuration } from "@/lib/garage-tables";
import { voice } from "@/lib/garage-voice";
import { PosChatInbox } from "@/components/garage/pos-chat-inbox";
import { StaffNotificationCenter } from "@/components/garage/staff-notification-center";
import { DeliveryOrderPanel } from "@/components/garage/delivery-order-panel";
import { ManagerPinPanel } from "@/components/garage/manager-pin-panel";
import { MemberQrScanDialog } from "@/components/garage/member-qr-scan-dialog";
import {
  PosOrderCancelDialog,
  type OrderCancelTarget,
} from "@/components/garage/pos-order-cancel-dialog";
import { PosCartSplitDialog, type CartSplitLine } from "@/components/garage/pos-cart-split-dialog";
import { PosEventBundles, type PosBundleSaved } from "@/components/garage/pos/pos-event-bundles";
import { PosQuickRetail } from "@/components/garage/pos/pos-quick-retail";
import { componentLabel, groupOrderLines } from "@/lib/order-package-lines";
import { idempotencyAttemptFor, type IdempotencyAttempt } from "@/lib/idempotency-client";
import {
  PosTableBillSplitDialog,
  type TableBillSplitResult,
} from "@/components/garage/pos-table-bill-split-dialog";
import { remainingCart, type SplitAssignment } from "@/lib/split-bill";
import { calculateBillingTotals } from "@/lib/garage-billing";
import { maxRedeemablePoints, normalizePhone } from "@/lib/member-types";
import { buildInvoiceWhatsappMessage, waLink } from "@/lib/whatsapp-link";
import { PosMemberWaVerify } from "@/components/garage/pos-member-wa-verify";

const PosModuleFallback = () => (
  <div className="px-4 py-10 text-center text-sm text-zinc-400">Memuat POS...</div>
);
const VoiceSettingsDialog = dynamic(
  () => import("@/components/garage/voice-settings-dialog").then((m) => m.VoiceSettingsDialog),
  { loading: PosModuleFallback },
);
const VoiceStatusBadge = dynamic(
  () => import("@/components/garage/voice-settings-dialog").then((m) => m.VoiceStatusBadge),
  { loading: PosModuleFallback },
);

const GARAGE_BRAND_LOGO_SRC = "/garage-brand/garage-coffee-logo.png";
const GARAGE_BRAND_LOGO_WIDTH = 1200;
const GARAGE_BRAND_LOGO_HEIGHT = 282;
const GARAGE_BUSINESS_NAME = "Garage Coffee";
type GarageThemeMode = "dark" | "bright";

type ManualDiscount = {
  type: "amount" | "percent";
  rawValue: number;
  amount: number;
  reason: string;
  approvalId?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
};

function PosHeaderClock() {
  const [now, setNow] = useState(() => new Date());
  const timeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now),
    [now],
  );
  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("id-ID", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      }).format(now),
    [now],
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="garage-surface flex h-9 shrink-0 items-center gap-2 rounded-md px-2.5 text-xs">
      <Clock className="size-3.5 text-[#f5a742]" />
      <div className="leading-none">
        <p className="garage-mono font-semibold text-white">{timeLabel}</p>
        <p className="mt-0.5 text-[10px] text-[#b8b8bf]">{dateLabel}</p>
      </div>
    </div>
  );
}

const menuPrimaryGroups: MenuFilter[] = ["All", "Dapur", "Bar", "Lainnya"];
const menuGroupLabels = { Dapur: "Dapur", Bar: "Bar", Lainnya: "Lainnya" } as const;
const qrPublicBaseUrl = process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
const qrPrintPath = "/order/qr-print";

/** Station chit = station tiket produksi (override produk, lalu kategori); "Langsung" = diserahkan kasir, tanpa chit. */
function chitStationFor(item: Pick<MenuItem, "category"> & { station?: string | null }): "Dapur" | "Bar" | "Langsung" {
  if (isDirectHandoverMenu({ station: item.station, category: item.category })) return "Langsung";
  return productionStationFor({ station: item.station, category: item.category }) === "Bar" ? "Bar" : "Dapur";
}
const pilotQrPrintPath = "/order/qr-print?tables=01,25,50";
const initialVisibleProducts = 40;
const productLoadStep = 20;
const POS_FAVORITE_STORAGE_KEY = "garage:pos-fav-counts";
const POS_FAVORITE_LIMIT = 8;

type PaymentStep = "summary" | "table" | "customer" | "payment" | "done";
type CashierShiftSummary = {
  session: CashSession & {
    openedAt: string;
    closedAt: string | null;
    businessDate: string;
    shiftLabel: string;
    openedByName?: string | null;
    closedByName?: string | null;
  };
  counts: {
    total: number;
    paid: number;
    refunded: number;
  };
  sales: {
    gross: number;
    subtotal: number;
    service: number;
    tax: number;
    discount: number;
  };
  byMethod: Array<{ method: string; count: number; total: number }>;
};
type CashierShiftHistory = {
  rows: Array<
    CashSession & {
      openedAt: string;
      closedAt: string | null;
      businessDate: string;
      shiftLabel: string;
      shiftNumber: number;
    }
  >;
  total: number;
  hasMore: boolean;
};

// Idempotency key untuk anti double-submit. Di module scope supaya bukan impure
// call saat render (crypto.randomUUID bila ada, fallback Date.now+random).
function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const statusClass: Record<string, string> = {
  ready: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  safe: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  healthy: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  info: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  warning: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  draft: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  critical: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  controlled: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  read_only: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  not_required: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  pending: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  pending_approval: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  pending_cashier: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  awaiting_payment: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  accepted: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  paid: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
  sent: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
  not_sent: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  qr_table: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  qr_takeaway: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  approved: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  applied: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
  rejected: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  completed: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  planned: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  blocked: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  deterministic: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  fast: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  basic: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  limited: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  sold_out: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  watch: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  manager: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  operational: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  owner_free_chat: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  async: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  low: "border-[#ff2a3a]/45 bg-[#ff2a3a]/14 text-[#ffc2c8]",
  queue: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  cooking: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  delivered: "border-[#4a4a54] bg-[#222229] text-[#d0d0d6]",
  high: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  finance: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  financial: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  executive: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  medium: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  recorded: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  approval_required: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  missing: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  error: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  failed: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  skipped: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  untested: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
};

function BillRow({
  label,
  value,
  accent = false,
  large = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  large?: boolean;
}) {
  const labelClass = accent
    ? "text-[#f5a742]"
    : large
      ? "text-[#d6d6dc]"
      : "text-[#b8b8bf]";
  const valueClass = large
    ? "garage-mono text-right text-2xl font-bold text-white"
    : "garage-mono text-right text-sm font-semibold text-white";

  return (
    <div className={`pos-bill-row flex items-center justify-between gap-3 ${large ? "text-lg" : ""}`}>
      <span className={`pos-bill-label min-w-0 truncate ${labelClass}`}>
        {label}
      </span>
      <span className={`pos-bill-value shrink-0 tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

const BILL_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  pending_cashier: "Menunggu kasir",
  accepted: "Diterima dapur",
  ready: "Siap",
  awaiting_payment: "Menunggu bayar",
  paid: "Lunas",
  rejected: "Ditolak",
  voided: "Dibatalkan",
  cancelled: "Dibatalkan",
};

function billStatusLabel(status: string) {
  return BILL_STATUS_LABEL[status] ?? status;
}

// Label tombol metode bayar (nilai yang dikirim ke server tetap: Cash, QRIS, dst).
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  Cash: "Tunai",
  QRIS: "QRIS",
  "Bank Transfer": "Transfer Bank",
  "E-Wallet": "E-Wallet",
};

function paymentMethodLabel(method: string) {
  return PAYMENT_METHOD_LABEL[method] ?? method;
}

const qrOrderActionGuides = [
  {
    label: "Terima",
    tone: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]",
    description: "Validasi order dan buat tiket dapur (KDS). Order belum dianggap lunas.",
  },
  {
    label: "Terima Pembayaran",
    tone: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#dcfce7]",
    description: "Konfirmasi cash, QRIS, atau transfer. Sistem mencatat pembayaran, membuat struk, dan memproses poin member bila ada.",
  },
  {
    label: "Tolak",
    tone: "border-[#4a4a54] bg-[#202027] text-[#d6d6dc]",
    description: "Tolak order agar tidak masuk antrean dapur.",
  },
];

const qrControlStatusFilters = [
  { value: "all", label: "Semua status" },
  { value: "pending_cashier", label: "Menunggu kasir" },
  { value: "accepted", label: "Diterima" },
  { value: "paid", label: "Lunas" },
  { value: "rejected", label: "Ditolak" },
];

const qrControlSourceFilters = [
  { value: "all", label: "Semua sumber" },
  { value: "qr_table", label: "QR meja" },
  { value: "qr_takeaway", label: "QR takeaway" },
  { value: "instagram", label: "Instagram" },
  { value: "campaign", label: "Campaign" },
];

const qrControlSelectContentClass =
  "z-[90] rounded-md border border-[#34343c] bg-[#111116] p-1 shadow-[0_16px_42px_rgba(0,0,0,0.42)] ring-1 ring-white/[0.06]";
const qrControlSelectItemClass =
  "h-9 rounded px-2 pr-8 text-xs font-semibold text-[#f4f4f5] focus:bg-[#d11a2a]/16 focus:text-white data-[state=checked]:bg-white/[0.06]";

type QrWorkTab = "incoming" | "history" | "table_map" | "qr_control" | "follow_up" | "qr_tables";

// Label + warna status tiket dapur (per station). null = order belum masuk dapur
// (mis. masih menunggu kasir). Status per item mewarisi status station-nya.
const kitchenStatusLabels: Record<string, string> = {
  queue: "Antre",
  cooking: "Dimasak",
  ready: "Siap",
  delivered: "Diantar",
  completed: "Selesai",
};
function kitchenStatusLabel(status: string | null) {
  if (!status) return "Belum masuk dapur";
  return kitchenStatusLabels[status] ?? status;
}
function kitchenStatusTone(status: string | null) {
  if (status === "ready") return "border-[#22c55e]/50 bg-[#22c55e]/14 text-[#dcfce7]";
  if (status === "delivered" || status === "completed")
    return "border-[#4a4a54] bg-white/[0.06] text-[#b8b8bf]";
  if (status === "cooking") return "border-[#f5a742]/50 bg-[#f5a742]/14 text-[#ffd08a]";
  if (status === "queue") return "border-[#d11a2a]/50 bg-[#d11a2a]/14 text-[#ffc2c8]";
  return "border-[#4a4a54] bg-white/[0.04] text-[#9aa0a6]";
}

const qrWorkTabs: Array<{ value: QrWorkTab; label: string }> = [
  { value: "incoming", label: "Antrean" },
  { value: "history", label: "Riwayat" },
  { value: "table_map", label: "Meja" },
  { value: "qr_control", label: "Control" },
  { value: "follow_up", label: "Follow-up" },
  { value: "qr_tables", label: "QR Meja" },
];
export function PosView({
  me,
  menuItems,
  customers,
  cartSeed,
  cashSession,
  settings,
  onCashSessionOpened,
  onExit,
  onOpenEarnings,
  onOrderCreated,
  onMenuChanged,
  onSignOut,
  signOutPending,
  signOutError,
  themeMode,
  onThemeChange,
  cashierTheme,
  onCashierThemeChange,
  navModules = [],
  onNavigateModule,
}: {
  me: GarageMe;
  menuItems: MenuItem[];
  customers: Customer[];
  cartSeed: CartLine[];
  cashSession: CashSession;
  settings: AppSettings;
  onCashSessionOpened: () => Promise<void> | void;
  onExit: () => void;
  onOpenEarnings: () => void;
  onOrderCreated: () => Promise<void> | void;
  /** Refetch data MENU (mis. setelah upload/hapus foto atau ubah stok) supaya
      imageUrl & status terbaru langsung tampil tanpa reload halaman. */
  onMenuChanged?: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
  signOutPending: boolean;
  signOutError: string | null;
  themeMode: GarageThemeMode;
  onThemeChange: (theme: GarageThemeMode) => void;
  cashierTheme: CashierThemeMode;
  onCashierThemeChange: (theme: CashierThemeMode) => void;
  /** Modul yang bisa dinavigasi dari dalam POS (satu menu, tanpa sidebar kedua). */
  navModules?: Array<{ id: string; label: string; icon: ComponentType<{ className?: string }> }>;
  onNavigateModule?: (moduleId: string) => void;
}) {
  const [orderType, setOrderType] = useState<OrderType>("dine-in");
  const [selectedTableNumber, setSelectedTableNumber] = useState("");
  const [menuCategory, setMenuCategory] = useState<MenuFilter>("All");
  const [bestsellerOnly, setBestsellerOnly] = useState(false);
  // Tombol favorit kasir: hitungan tap per perangkat (localStorage), bukan data server.
  const [favoriteCounts, setFavoriteCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [productPageState, setProductPageState] = useState({
    filterKey: "",
    count: initialVisibleProducts,
  });
  const [cart, setCart] = useState<CartLine[]>(cartSeed);
  // Parked orders â€” disimpan ke localStorage. Kasir bisa "Park" cart aktif,
  // layanin customer lain, lalu "Resume" untuk balik ke bill yang di-park.
  const [parkedOrders, setParkedOrders] = useState<ParkedOrder[]>([]);
  const [parkedListOpen, setParkedListOpen] = useState(false);
  const [parkDialogOpen, setParkDialogOpen] = useState(false);
  const [parkLabel, setParkLabel] = useState("");
  // Voice Notification System â€” airport-style announcement
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  // Split bill calculator â€” display only, tidak ubah payment flow.
  // Untuk group customer yang bayar terpisah (bagi rata).
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [splitPeopleCount, setSplitPeopleCount] = useState("2");
  const [manualDiscount, setManualDiscount] = useState<ManualDiscount | null>(null);
  const [discountPinOpen, setDiscountPinOpen] = useState(false);
  const [manualDiscountOpen, setManualDiscountOpen] = useState(false);
  const [manualDiscountTypeInput, setManualDiscountTypeInput] =
    useState<"amount" | "percent">("amount");
  const [manualDiscountValueInput, setManualDiscountValueInput] = useState("");
  const [manualDiscountReasonInput, setManualDiscountReasonInput] = useState("");
  const [manualDiscountError, setManualDiscountError] = useState<string | null>(null);
  // Sold-out flag per item (frontend-only). Persist ke localStorage.
  const [soldOutIds, setSoldOutIds] = useState<Set<string>>(new Set());
  const [soldOutDialogOpen, setSoldOutDialogOpen] = useState(false);
  // Kasir daftarkan member (selalu Silver)
  const [memberRegOpen, setMemberRegOpen] = useState(false);
  const [memberRegName, setMemberRegName] = useState("");
  const [memberRegPhone, setMemberRegPhone] = useState("");
  const [memberRegPin, setMemberRegPin] = useState("");
  const [memberRegBusy, setMemberRegBusy] = useState(false);
  const [memberRegMsg, setMemberRegMsg] = useState<string | null>(null);

  async function submitMemberRegister() {
    if (!memberRegName.trim() || memberRegPhone.trim().length < 8 || memberRegPin.length < 6) {
      setMemberRegMsg("Lengkapi nama, nomor HP, dan PIN (min. 6).");
      return;
    }
    setMemberRegBusy(true);
    setMemberRegMsg(null);
    try {
      const res = await fetch("/api/pos/member/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: memberRegName.trim(),
          phone: memberRegPhone.trim(),
          password: memberRegPin,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        data?: { name?: string; memberCode?: string | null };
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(payload?.error?.message ?? "Daftar member gagal.");
      }
      setPosNotice(
        `Member ${payload.data?.name ?? memberRegName.trim()} terdaftar (Silver)${
          payload.data?.memberCode ? ` · ${payload.data.memberCode}` : ""
        }.`,
      );
      setMemberRegName("");
      setMemberRegPhone("");
      setMemberRegPin("");
      setMemberRegOpen(false);
    } catch (error) {
      setMemberRegMsg(error instanceof Error ? error.message : "Daftar member gagal.");
    } finally {
      setMemberRegBusy(false);
    }
  }
  const [soldOutQuery, setSoldOutQuery] = useState("");
  const [soldOutPendingIds, setSoldOutPendingIds] = useState<Set<string>>(new Set());
  // Riwayat struk shift untuk reprint (last 20)
  const [receiptHistory, setReceiptHistory] = useState<OrderReceipt[]>([]);
  const [receiptHistoryOpen, setReceiptHistoryOpen] = useState(false);
  const [reprintTargetId, setReprintTargetId] = useState<string | null>(null);
  const [reprintStatus, setReprintStatus] = useState<
    "idle" | "printing" | "success" | "error"
  >("idle");
  const [reprintError, setReprintError] = useState<string | null>(null);
  // Kas Keluar / Masuk Laci — dialog CashDrawerDialog.
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  // Hitung stok bahan = Stok Opname gudang (ledger WMS); jalur "Quick Count"
  // lama menulis stok OS langsung dan ditolak untuk bahan gudang.
  const canQuickCount =
    me.role === "Manajer" || me.role === "Kasir" || me.role === "Owner";
  // now-snapshot untuk hitung "X menit lalu" di parked list (refresh tiap 30s)
  const [parkedListNowTick, setParkedListNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!parkedListOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync time on open
    setParkedListNowTick(Date.now());
    const id = window.setInterval(() => setParkedListNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [parkedListOpen]);
  const [variantItem, setVariantItem] = useState<MenuItem | null>(null);
  const [clearCartOpen, setClearCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState<PaymentStep>("summary");
  const [cashierSettingsTab, setCashierSettingsTab] = useState<
    "display" | "digital" | "security" | "printer" | "shift"
  >("display");
  const [cashierPosSettings, setCashierPosSettings] =
    useState<CashierPosSettings>(loadCashierPosSettings);
  // Wire: defaultPaymentMethod dari /control/settings → POS payment.
  // Mapping lowercase setting → PaymentMethod label.
  const defaultPmFromSettings: PaymentMethod = (() => {
    switch (settings?.defaultPaymentMethod) {
      case "qris":
        return "QRIS";
      case "transfer":
        return "Bank Transfer";
      case "card":
      case "cash":
      default:
        return "Cash";
    }
  })();
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>(defaultPmFromSettings);
  const [paymentProvider, setPaymentProvider] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [paymentPending, setPaymentPending] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<string | null>(null);
  const [completedReceipt, setCompletedReceipt] = useState<OrderReceipt | null>(null);
  // "Bayar nanti": tagihan tersimpan (belum lunas) → dilunasi lewat Final Bayar.
  const [openBillSaved, setOpenBillSaved] = useState<OpenBillSaved | null>(null);
  const [qrisImageReady, setQrisImageReady] = useState(true);
  // Wire: shiftOpeningCashDefault dari /control/settings → Shift & Cash
  // Default settings 500K, tapi form max 500K & multiple of 50K. Coerce ke valid range.
  const _shiftOpeningDefault = (() => {
    const raw = Number(settings?.shiftOpeningCashDefault ?? 50000);
    if (!Number.isFinite(raw) || raw < 50000) return 50000;
    const capped = Math.min(500000, raw);
    return Math.round(capped / 50000) * 50000;
  })();
  const [openingCash, setOpeningCash] = useState(String(_shiftOpeningDefault));
  const [openingCounts, setOpeningCounts] = useState<Record<string, string>>({});
  const [openingShiftNumber, setOpeningShiftNumber] = useState<number>(1);
  const [openShiftManagerPin, setOpenShiftManagerPin] = useState("");
  const [shiftStatusRefresh, setShiftStatusRefresh] = useState(0);
  // Blind count: kasir menghitung laci per pecahan tanpa diberi angka sistem
  // (form ada di CloseShiftForm; di sini hanya status sign-off & hasil tutup).
  const [shiftSignOffRequired, setShiftSignOffRequired] = useState(false);
  // Hasil hitung tutup shift; POS langsung terkunci setelah tutup, jadi hasilnya
  // ditampilkan di kartu "Shift Belum Dibuka", bukan di notice POS.
  const [shiftSlipStatus, setShiftSlipStatus] = useState<{ pending: boolean; message: string | null; ok: boolean } | null>(null);
  const [lastShiftCloseResult, setLastShiftCloseResult] = useState<{
    code: string;
    discrepancy: number;
    expectedCash: number;
    actualCash: number;
    resetTableCount: number | null;
    qrisRecorded: number | null;
    qrisDiscrepancy: number | null;
    floatLeft: number | null;
    depositAmount: number | null;
    sessionId: string | null;
  } | null>(null);
  // Kunci ulang form tutup shift setiap dialog dibuka (state form di dalamnya).
  const [closeFormKey, setCloseFormKey] = useState(0);
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [shiftPending, setShiftPending] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [posNotice, setPosNotice] = useState<string | null>(null);
  // Kunci POS bertahan saat halaman di-refresh (dulu refresh = terbuka).
  const lockStorageKey = `garage:pos-locked:${me.user.id}`;
  const [locked, setLockedState] = useState(() => {
    try {
      return typeof window !== "undefined" && window.sessionStorage.getItem(lockStorageKey) === "1";
    } catch {
      return false;
    }
  });
  const setLocked = useCallback(
    (value: boolean) => {
      setLockedState(value);
      try {
        if (value) window.sessionStorage.setItem(lockStorageKey, "1");
        else window.sessionStorage.removeItem(lockStorageKey);
      } catch {
        // storage diblokir: kunci tetap berlaku di tab ini
      }
    },
    [lockStorageKey],
  );
  const [unlockPassword, setUnlockPassword] = useState("");
  const [lockError, setLockError] = useState<string | null>(null);
  const [fullscreenGuardActive, setFullscreenGuardActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() =>
    typeof document === "undefined" ? false : Boolean(document.fullscreenElement),
  );
  const [fullscreenStarted, setFullscreenStarted] = useState(() =>
    typeof document === "undefined" ? false : Boolean(document.fullscreenElement),
  );
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [cashierMenuOpen, setCashierMenuOpen] = useState(false);
  const [cashierToolOpen, setCashierToolOpen] = useState<
    null | "contacts" | "reports" | "settings"
  >(null);
  const [cashierRefreshing, setCashierRefreshing] = useState(false);
  const [shiftReportSummary, setShiftReportSummary] =
    useState<CashierShiftSummary | null>(null);
  const [shiftReportHistory, setShiftReportHistory] =
    useState<CashierShiftHistory | null>(null);
  const [shiftReportLoading, setShiftReportLoading] = useState(false);
  const [shiftReportError, setShiftReportError] = useState<string | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);
  const [customerOrderError, setCustomerOrderError] = useState<string | null>(null);
  const [customerOrderActionId, setCustomerOrderActionId] = useState<string | null>(null);
  const [selectedCustomerOrderId, setSelectedCustomerOrderId] = useState<string | null>(null);
  const [customerOrderCashReceived, setCustomerOrderCashReceived] = useState("");
  const [customerOrderCashDeposited, setCustomerOrderCashDeposited] = useState("");
  const [qrOrdersOpen, setQrOrdersOpen] = useState(false);
  // Klik notifikasi "Order baru" / "Chat baru" dari pusat notifikasi.
  useEffect(() => {
    const openQr = () => setQrOrdersOpen(true);
    const openChat = () => setChatOpen(true);
    window.addEventListener("garage:open-qr", openQr);
    window.addEventListener("garage:open-chat", openChat);
    return () => {
      window.removeEventListener("garage:open-qr", openQr);
      window.removeEventListener("garage:open-chat", openChat);
    };
  }, []);
  // Monitor "Status Produksi" untuk kasir. Kasir POS juga boleh memproses
  // tiket Bar & Dapur (Mulai/READY/serah-terima) di modul Production (owner Okt 2026).
  const [kitchenTickets, setKitchenTickets] = useState<KitchenOrder[]>([]);
  // Waktu sinkron terakhir monitor — dasar hitung lama tunggu (render tetap murni).
  const [kitchenTicketsAt, setKitchenTicketsAt] = useState(0);
  const [kitchenPanelOpen, setKitchenPanelOpen] = useState(false);
  // Aksi produksi langsung dari POS (kasir ikut memproses Bar & Dapur).
  const [kitchenActionBusy, setKitchenActionBusy] = useState<string | null>(null);
  const [kitchenQcTicket, setKitchenQcTicket] = useState<string | null>(null);
  const [kitchenActionError, setKitchenActionError] = useState<string | null>(null);
  // Tiket yang sudah diantar dalam 1 jam terakhir (tab "Diantar 1 jam").
  const [kitchenDoneTickets, setKitchenDoneTickets] = useState<KitchenOrder[]>([]);
  // Cetak tiket Bar/Dapur manual oleh kasir: id tiket yang sedang/sudah dicetak di laptop ini.
  const [kitchenPrintingId, setKitchenPrintingId] = useState<string | null>(null);
  const [kitchenPrintedIds, setKitchenPrintedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [qrOperationsOpen, setQrOperationsOpen] = useState(false);
  const [qrInsights, setQrInsights] = useState<QrControlInsights | null>(null);
  const [qrInsightsLoading, setQrInsightsLoading] = useState(false);
  const [qrInsightsError, setQrInsightsError] = useState<string | null>(null);
  const [qrInsightFilters, setQrInsightFilters] = useState({
    status: "all",
    source: "all",
    table: "all",
  });
  const [qrWorkTab, setQrWorkTab] = useState<QrWorkTab>("incoming");
  const [tableLiveRows, setTableLiveRows] = useState<TableLiveRow[]>([]);
  // Voice clear-table tracking â€” announce hanya saat meja baru transition jadi
  // "needs_cleaning", bukan setiap polling refresh.
  const previousNeedsCleaningRef = useRef<Set<string> | null>(null);
  const [tableLiveLoading, setTableLiveLoading] = useState(false);
  const [tableLiveError, setTableLiveError] = useState<string | null>(null);
  // Timestamp sinkron terakhir peta meja (untuk indikator "terakhir update").
  const [tableLiveUpdatedAt, setTableLiveUpdatedAt] = useState<number | null>(null);
  // Ticker ringan supaya label "Xs lalu" berjalan walau tidak ada re-render lain.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [shiftHandoverPending, setShiftHandoverPending] = useState(false);
  const [dismissedQrNoticeKey, setDismissedQrNoticeKey] = useState<string | null>(null);
  const [qrNoticePulseKey, setQrNoticePulseKey] = useState<string | null>(null);
  const [qrTablesOpen, setQrTablesOpen] = useState(false);
  const [selectedQrTable, setSelectedQrTable] = useState("01");
  const [qrPreviewSvg, setQrPreviewSvg] = useState<string | null>(null);
  const [qrPreviewLoading, setQrPreviewLoading] = useState(false);
  const [resetTableDialogOpen, setResetTableDialogOpen] = useState(false);
  const [selectedTableToReset, setSelectedTableToReset] = useState<TableLiveRow | null>(null);
  const [resetTableBusy, setResetTableBusy] = useState(false);
  const [resetTableError, setResetTableError] = useState<string | null>(null);
  // Cek Meja: panel detail saat tap kartu meja + filter status grid.
  const [tableDetail, setTableDetail] = useState<TableLiveRow | null>(null);
  // Rincian item pesanan meja (lazy-load saat dialog detail dibuka).
  const [tableOrderBills, setTableOrderBills] = useState<TableOrderBill[] | null>(null);
  const [tableItemsLoading, setTableItemsLoading] = useState(false);
  const [tableItemsError, setTableItemsError] = useState<string | null>(null);
  // Aksi cepat detail meja: cetak bill sementara / tandai siap / siapkan bill.
  const [provisionalBillBusyId, setProvisionalBillBusyId] = useState<string | null>(null);
  const [tableActionBusy, setTableActionBusy] = useState<"ready" | "bill" | null>(null);
  // Order QR: order yang sedang menunggu konfirmasi Reject (dengan alasan) atau
  // Final Bayar. Aksi susah-dibalik jadi lewat dialog dulu, bukan fire langsung.
  const [rejectOrderTarget, setRejectOrderTarget] = useState<CustomerOrder | null>(null);
  const [rejectReasonChoice, setRejectReasonChoice] = useState("Stok habis");
  const [rejectReasonOther, setRejectReasonOther] = useState("");
  const [finalizeOrderTarget, setFinalizeOrderTarget] = useState<CustomerOrder | null>(null);
  // Final Bayar: kasir boleh ganti metode (tiap tamu bill pisahan bisa beda).
  const [finalizeMethod, setFinalizeMethod] = useState<PaymentMethod>("Cash");
  const [finalizeCash, setFinalizeCash] = useState("");
  const [finalizeReference, setFinalizeReference] = useState("");
  // Split bill per produk: bill meja (pisah) & keranjang kasir (bayar per tamu).
  const [tableSplitBill, setTableSplitBill] = useState<TableOrderBill | null>(null);
  const [cartSplitOpen, setCartSplitOpen] = useState(false);
  // Dialog konfirmasi/alasan in-app reusable (pengganti window.confirm/prompt) —
  // berbasis Promise supaya alur async yang ada nyaris tak berubah.
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message?: string;
    confirmLabel?: string;
    needsReason?: boolean;
    reasonPlaceholder?: string;
    danger?: boolean;
  } | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const confirmResolveRef = useRef<((value: string | boolean) => void) | null>(null);
  // Percobaan submit order terakhir yang belum sukses — lihat idempotencyAttemptFor.
  const orderAttemptRef = useRef<IdempotencyAttempt | null>(null);
  const [tableMapFilter, setTableMapFilter] = useState<
    "all" | "empty" | "occupied" | "cleaning"
  >("all");
  const [qrPreviewError, setQrPreviewError] = useState<string | null>(null);
  const [tablePrintOpen, setTablePrintOpen] = useState(false);
  const [tablePrintMode, setTablePrintMode] = useState<"single" | "range" | "all">("single");
  const [tablePrintSingle, setTablePrintSingle] = useState("01");
  const [tablePrintStart, setTablePrintStart] = useState("01");
  const [tablePrintEnd, setTablePrintEnd] = useState("10");
  const [posCustomerMode, setPosCustomerMode] = useState<PosCustomerMode>("guest");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [selectedMember, setSelectedMember] = useState<PosMemberLookupResponse | null>(null);
  const [memberLookupLoading, setMemberLookupLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberCreateOpen, setMemberCreateOpen] = useState(false);
  const [memberCreateName, setMemberCreateName] = useState("");
  const [memberCreatePhone, setMemberCreatePhone] = useState("");
  const [memberCreateEmail, setMemberCreateEmail] = useState("");
  const [memberCreatePin, setMemberCreatePin] = useState(generateTemporaryMemberPin);
  const [memberCreatePending, setMemberCreatePending] = useState(false);
  const [memberCreatedPin, setMemberCreatedPin] = useState<string | null>(null);
  const [posVoucherCode, setPosVoucherCode] = useState("");
  const [posVoucherResult, setPosVoucherResult] = useState<VoucherValidation | null>(null);
  // Poin member yang dipakai sebagai potongan (owner, Okt 2026). Reset tiap ganti member.
  // Disimpan bersama id member → otomatis 0 saat member diganti/dilepas.
  const [posPointsState, setPosPointsState] = useState<{ memberId: string | null; points: number }>({
    memberId: null,
    points: 0,
  });
  const selectedMemberId = selectedMember?.customerId ?? null;
  const posPointsToUse = posPointsState.memberId === selectedMemberId ? posPointsState.points : 0;
  const setPosPointsToUse = (points: number) => setPosPointsState({ memberId: selectedMemberId, points });
  // Pakai poin wajib scan QR member (owner, Okt 2026): token dari server,
  // terikat ke member terpilih — otomatis tidak berlaku saat member diganti.
  const [memberRedeemAuth, setMemberRedeemAuth] = useState<{ memberId: string; token: string } | null>(null);
  const memberQrVerified = Boolean(selectedMemberId && memberRedeemAuth?.memberId === selectedMemberId);
  const [memberQrOpen, setMemberQrOpen] = useState(false);
  const [memberQrBusy, setMemberQrBusy] = useState(false);
  const [memberQrError, setMemberQrError] = useState<string | null>(null);
  const [posVoucherBusy, setPosVoucherBusy] = useState(false);
  const previousCustomerOrderIdsRef = useRef<Set<string>>(new Set());
  const customerOrdersPrimedRef = useRef(false);
  const qrNotificationAudioContextRef = useRef<AudioContext | null>(null);
  const pendingQrNotificationSoundRef = useRef(false);
  const updateCashierPosSettings = useCallback(
    (patch: Partial<CashierPosSettings>) => {
      setCashierPosSettings((current) => {
        const next = { ...current, ...patch };
        persistCashierPosSettings(next);
        return next;
      });
    },
    [setCashierPosSettings],
  );
  const isCashierKiosk = me.role === "Kasir";
  const canManagePosSettings = me.role === "Owner" || me.role === "Manajer";
  // Hapus invoice belum lunas: Owner/Manajer saja (server juga menolak role lain).
  const canDeleteInvoice = me.role === "Owner" || me.role === "Manajer";
  const [invoiceDeleteTarget, setInvoiceDeleteTarget] = useState<InvoiceDeleteTarget | null>(null);
  const canResetAllTablesOnClose = ["Owner", "Manajer"].includes(
    me.role,
  );
  const activeCashierToolOpen =
    cashierToolOpen === "settings" && !canManagePosSettings ? null : cashierToolOpen;

  // Pilihan meja checkout = meja aktif outlet (menu Atur Meja). Sebelum data
  // live tersinkron, tampilkan 01–50 sebagai fallback.
  const tablePickerRows = useMemo(
    () =>
      tableLiveRows.length
        ? tableLiveRows.filter((row) => row.active !== false)
        : tableNumbers.map((table) => fallbackTableLiveRow(table)),
    [tableLiveRows],
  );
  const selectedTableLiveRow = useMemo(
    () =>
      selectedTableNumber
        ? tablePickerRows.find((table) => table.tableNumber === selectedTableNumber) ?? null
        : null,
    [selectedTableNumber, tablePickerRows],
  );
  const tableLiveDataReady = tableLiveRows.length > 0;
  const selectedTableAvailability = tableAvailabilityState(
    selectedTableLiveRow,
    tableLiveDataReady,
  );
  const posMemberOptions = useMemo(
    () =>
      customers
        .filter((customer) => {
          const tier = (customer.cardTier ?? customer.tier ?? "").toLowerCase();
          return Boolean(customer.isMember && customer.id && customer.phone && tier && tier !== "guest");
        })
        .sort((a, b) => a.name.localeCompare(b.name, "id-ID"))
        .slice(0, 120),
    [customers],
  );
  const shiftOpen = cashSession.status === "open";
  // Mode pantau Owner (owner, Okt 2026): Owner boleh membuka POS tanpa shift untuk
  // memantau (Bar & Dapur, pesanan, laporan). Transaksi & kas tetap butuh shift.
  const [ownerViewing, setOwnerViewing] = useState(false);
  const posVisible = shiftOpen || ownerViewing;
  // Shift lupa ditutup (> 20 jam): server menolak transaksi baru; tampilkan
  // layar wajib tutup shift supaya kasir tidak bingung.
  const [staleClock, setStaleClock] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setStaleClock(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const staleShift =
    shiftOpen &&
    Boolean(cashSession.openedAt) &&
    staleClock - new Date(cashSession.openedAt ?? 0).getTime() > 20 * 60 * 60_000;
  // Blind count: selama shift berjalan Kasir tidak diberi angka kas sistem
  // (omzet, kas seharusnya, rincian cash/non-cash) — baru tampil setelah tutup shift.
  const hideShiftCashFigures = isCashierKiosk && shiftOpen;
  const hiddenUntilCloseLabel = "Tampil setelah tutup";
  const shiftReportCashTotal =
    shiftReportSummary?.byMethod
      .filter((method) => method.method.toLowerCase().includes("cash"))
      .reduce((sum, method) => sum + method.total, 0) ?? 0;
  const shiftReportNonCashTotal =
    shiftReportSummary?.byMethod
      .filter((method) => !method.method.toLowerCase().includes("cash"))
      .reduce((sum, method) => sum + method.total, 0) ?? 0;
  const shiftReportDiscrepancy =
    shiftReportSummary?.session.actualCash !== null &&
    shiftReportSummary?.session.actualCash !== undefined
      ? shiftReportSummary.session.discrepancy
      : null;
  const closeShiftActiveTables = tablePickerRows.filter(
    (row) =>
      row.status === "pending" ||
      row.status === "accepted" ||
      row.status === "ready" ||
      row.needsCleaning,
  );
  const shiftAutoPromptedRef = useRef(false);
  useEffect(() => {
    if (shiftOpen) {
      shiftAutoPromptedRef.current = false;
      return;
    }
    // Jangan buka modal otomatis saat POS terkunci; kasir mulai dari kartu
    // instruksi agar alur open shift tidak terasa mendadak.
    if (shiftAutoPromptedRef.current) return;
    shiftAutoPromptedRef.current = true;
    setShiftError(null);
  }, [shiftOpen]);
  const profileInitials = initialsForProfile(me.user.name ?? "", me.user.email);
  const themeButtonLabel =
    themeMode === "bright" ? "Gunakan tema gelap" : "Gunakan tema cerah";
  const tableLabel =
    orderType === "dine-in"
      ? selectedTableNumber
        ? `Meja ${selectedTableNumber}`
        : "Meja belum dipilih"
      : orderType === "takeaway"
        ? "Take away"
        : "Delivery";
  const dineInTableMissing = orderType === "dine-in" && !selectedTableNumber;
  const normalizedMenuQuery = deferredQuery.trim().toLowerCase();
  const productFilterKey = `${menuCategory}\u0000${normalizedMenuQuery}\u0000${menuItems.length}`;
  // Precompute searchIndex + isBestseller per item â€” sebelumnya di-rebuild
  // tiap render filter untuk SEMUA item walau cuma kategori yg berubah.
  // Sub-kategori POS dari master kategori (kategori baru tampil otomatis).
  const menuSubCategories = useMemo(() => menuSubCategoriesFrom(menuItems), [menuItems]);
  const activeMenuGroup = useMemo<keyof typeof menuGroupLabels | null>(() => {
    if (menuCategory === "All") return null;
    if (menuCategory === "Dapur" || menuCategory === "Bar" || menuCategory === "Lainnya") {
      return menuCategory as keyof typeof menuGroupLabels;
    }
    return (
      (Object.keys(menuSubCategories) as Array<keyof typeof menuGroupLabels>).find((group) =>
        menuSubCategories[group].includes(menuCategory),
      ) ?? null
    );
  }, [menuCategory, menuSubCategories]);
  const indexedMenu = useMemo(
    () =>
      menuItems.map((item) => ({
        item,
        searchIndex: [
          item.name,
          item.category,
          item.section,
          item.tags.join(" "),
          item.variants.map((variant) => variant.label).join(" "),
          // SKU & barcode (scanner / ketik kode) — produk & varian.
          item.sku ?? "",
          item.barcode ?? "",
          item.variants.map((variant) => `${variant.sku ?? ""} ${variant.barcode ?? ""}`).join(" "),
        ]
          .join(" ")
          .toLowerCase(),
        isBestseller: item.tags.some((t) => t.toLowerCase() === "bestseller"),
        shortcodes: menuShortcodes(item.name),
      })),
    [menuItems],
  );
  const shortcodeById = useMemo(
    () => new Map(indexedMenu.map((entry) => [entry.item.id, entry.shortcodes[0]])),
    [indexedMenu],
  );
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(POS_FAVORITE_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- baca localStorage setelah hydrate
        setFavoriteCounts(parsed as Record<string, number>);
      }
    } catch {
      // Storage diblokir / rusak → mulai dari bestseller.
    }
  }, []);
  const favoriteItems = useMemo(() => {
    const ranked = indexedMenu
      .filter((entry) => (favoriteCounts[entry.item.id] ?? 0) > 0)
      .sort((a, b) => (favoriteCounts[b.item.id] ?? 0) - (favoriteCounts[a.item.id] ?? 0))
      .map((entry) => entry.item);
    const picked = new Set(ranked.map((item) => item.id));
    for (const entry of indexedMenu) {
      if (ranked.length >= POS_FAVORITE_LIMIT) break;
      if (entry.isBestseller && !picked.has(entry.item.id)) ranked.push(entry.item);
    }
    return ranked.slice(0, POS_FAVORITE_LIMIT);
  }, [favoriteCounts, indexedMenu]);
  const filteredMenu = useMemo(() => {
    // Kode singkat ("cl" → Coffee Latte) dicocokkan di samping teks biasa;
    // kode persis tampil paling depan supaya kasir cukup tap kartu pertama.
    const exact: MenuItem[] = [];
    const result: MenuItem[] = [];
    for (const entry of indexedMenu) {
      if (!menuFilterMatches(menuCategory, entry.item.category, entry.item.menuGroup)) continue;
      if (bestsellerOnly && !entry.isBestseller) continue;
      if (normalizedMenuQuery) {
        const codeRank = shortcodeMatchRank(normalizedMenuQuery, entry.shortcodes);
        if (codeRank === 2) {
          exact.push(entry.item);
          continue;
        }
        if (!codeRank && !entry.searchIndex.includes(normalizedMenuQuery)) continue;
      }
      result.push(entry.item);
    }
    return exact.length ? [...exact, ...result] : result;
  }, [bestsellerOnly, indexedMenu, menuCategory, normalizedMenuQuery]);
  const visibleProductCount =
    productPageState.filterKey === productFilterKey
      ? productPageState.count
      : initialVisibleProducts;
  const visibleProducts = useMemo(
    () => filteredMenu.slice(0, visibleProductCount),
    [filteredMenu, visibleProductCount],
  );
  const hasMoreProducts = visibleProductCount < filteredMenu.length;

  // Lookup map id→MenuItem dipakai di cart, sold-out check, dan voice
  // announce. Hindari .find() O(N) per line per render (sebelumnya O(N·M)).
  const menuItemsById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of menuItems) map.set(item.id, item);
    return map;
  }, [menuItems]);

  // Nama item (lowercase) → station Dapur/Bar. Dipakai untuk chit dapur pada order
  // QR/waiter yang itemnya tidak membawa kategori.
  const stationByItemName = useMemo(() => {
    const map = new Map<string, "Dapur" | "Bar" | "Langsung">();
    for (const item of menuItems) {
      map.set(item.name.trim().toLowerCase(), chitStationFor(item));
    }
    return map;
  }, [menuItems]);

  const cartLines = useMemo(
    () =>
      cart
        .map((line) => {
          const item = menuItemsById.get(line.itemId);
          const rawVariant = item?.variants.find(
            (entry) => entry.id === line.variantId,
          );
          // Promo produk (harga tetap) meng-override harga varian saat di cart,
          // sinkron dengan perhitungan server (effectiveMenuPrice). Promo hanya
          // mendiskon: dipakai bila lebih murah dari harga varian.
          const variant =
            rawVariant &&
            item?.promoActive &&
            item.promoPrice &&
            item.promoPrice > 0 &&
            item.promoPrice < rawVariant.price
              ? { ...rawVariant, price: item.promoPrice }
              : rawVariant;

          return {
            ...line,
            item,
            variant,
          };
        })
        .filter(
          (
            line,
          ): line is CartLine & {
            item: MenuItem;
            variant: MenuVariant;
          } => Boolean(line.item && line.variant),
    ),
    [cart, menuItemsById],
  );
  const cartItemCount = cartLines.reduce((total, line) => total + line.qty, 0);
  const customerOrderNoticeKey = useMemo(
    () => customerOrders.map((order) => order.id).sort().join("|"),
    [customerOrders],
  );
  const selectedCustomerOrder = useMemo(
    () =>
      selectedCustomerOrderId
        ? [...customerOrders, ...(qrInsights?.recentOrders ?? [])].find(
            (order) => order.id === selectedCustomerOrderId,
          ) ?? null
        : null,
    [customerOrders, qrInsights?.recentOrders, selectedCustomerOrderId],
  );
  // "Menunggu kasir" = belum diterima/dibayar saja (bukan yang sudah diproses
  // atau delivery yang sedang diantar).
  const waitingCustomerOrderCount = customerOrders.filter(
    (order) => order.status === "pending_cashier" || order.status === "awaiting_payment",
  ).length;
  const showQrNotice =
    waitingCustomerOrderCount > 0 && dismissedQrNoticeKey !== customerOrderNoticeKey;
  const qrNoticeIsNew =
    showQrNotice && qrNoticePulseKey === customerOrderNoticeKey;
  const subtotal = cartLines.reduce(
    (total, line) => total + line.variant.price * line.qty,
    0,
  );
  const serviceChargePct = settings.serviceChargePct;
  const taxPct = settings.taxPct;
  // Rumus SAMA dengan server (garage-billing): service → PB1 → pembulatan outlet.
  // Dulu layar tidak membulatkan → "Uang Pas" Rp 34.650 ditolak server (total Rp 34.700).
  const { service, tax, grossTotal: total } = calculateBillingTotals(subtotal, settings);
  const roundingAdjustment = total - (subtotal + service + tax);
  const voucher = posVoucherResult?.valid ? posVoucherResult.discount : 0;
  // Manual discount dihitung dari total SETELAH voucher (urutan: voucher → manual)
  const manualDiscountAmount = manualDiscount
    ? manualDiscount.type === "percent"
      ? Math.min(
          Math.max(0, total - voucher),
          Math.round(((total - voucher) * manualDiscount.rawValue) / 100),
        )
      : Math.min(Math.max(0, total - voucher), manualDiscount.amount)
    : 0;
  // Pakai poin: batas = saldo & maks % harga menu setelah voucher/diskon (sama dgn server).
  async function verifyMemberQr(payload: string) {
    if (!selectedMemberId) return;
    setMemberQrBusy(true);
    setMemberQrError(null);
    try {
      const result = await garageApi.post<{ customerId: string; redeemToken: string }>("/api/pos/member/verify", {
        qr: payload,
      });
      if (result.customerId !== selectedMemberId) {
        setMemberQrError("QR ini milik member lain. Pastikan QR sesuai member yang dipilih.");
        return;
      }
      setMemberRedeemAuth({ memberId: result.customerId, token: result.redeemToken });
      setMemberQrOpen(false);
      setPosNotice("QR member terverifikasi. Poin bisa dipakai.");
    } catch (error) {
      setMemberQrError(error instanceof Error ? error.message : "QR member tidak dikenali.");
    } finally {
      setMemberQrBusy(false);
    }
  }
  const pointsBase = Math.max(0, subtotal - voucher - manualDiscountAmount);
  const maxPointsToUse =
    posCustomerMode === "member" && selectedMember
      ? maxRedeemablePoints({
          balance: selectedMember.member.points,
          base: pointsBase,
          pointValue: settings.memberPointValue,
          maxPct: settings.memberRedeemMaxPct,
        })
      : 0;
  const pointsToUse =
    memberQrVerified && posPointsToUse >= settings.memberRedeemMinPoints ? Math.min(posPointsToUse, maxPointsToUse) : 0;
  const pointsDiscountAmount = Math.min(
    Math.max(0, total - voucher - manualDiscountAmount),
    pointsToUse * settings.memberPointValue,
  );
  const totalDue = Math.max(0, total - voucher - manualDiscountAmount - pointsDiscountAmount);
  // Poin dari harga menu bersih (tanpa pajak/service), sama dengan server.
  const estimatedMemberPoints = selectedMember
    ? Math.floor(
        Math.floor((Math.max(0, pointsBase - pointsDiscountAmount) / 1000) * settings.pointsPerThousand) *
          selectedMember.member.multiplier,
      )
    : 0;
  const parsedCashReceived = Number(cashReceived || 0);
  const cashReceivedValue = Number.isFinite(parsedCashReceived)
    ? parsedCashReceived
    : 0;
  const cashShortage = Math.max(0, totalDue - cashReceivedValue);
  const cashChange = Math.max(0, cashReceivedValue - totalDue);
  const cashPaymentReady =
    selectedPaymentMethod !== "Cash" || cashReceivedValue >= totalDue;
  const selectedBankAccount =
    bankAccounts.find((account) => account.id === paymentProvider) ??
    bankAccounts[0];
  const selectedEWalletAccount =
    eWalletAccounts.find((account) => account.id === paymentProvider) ??
    eWalletAccounts[0];
  const paymentProviderValue =
    paymentProvider || defaultPaymentProvider(selectedPaymentMethod);
  // Tender guard (§09.2/F34): Owner bisa mewajibkan referensi QRIS.
  const qrisReferenceMissing =
    selectedPaymentMethod === "QRIS" && settings.qrisReferenceRequired && !normalizePaymentReference(paymentReference);
  const qrisPaymentReady =
    selectedPaymentMethod !== "QRIS" || (qrisImageReady && !qrisReferenceMissing);
  const paymentReady = cashPaymentReady && qrisPaymentReady;
  const manualDiscountAwaitingApproval =
    manualDiscount?.approvalStatus === "pending";
  const checkoutReady =
    paymentReady && !dineInTableMissing && !manualDiscountAwaitingApproval;
  const quickCashAmounts = useMemo(() => quickCashOptions(totalDue), [totalDue]);

  useEffect(() => {
    const approvalId = manualDiscount?.approvalId;
    if (manualDiscount?.approvalStatus !== "pending" || !approvalId) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}`);
        const json = (await res.json().catch(() => ({}))) as {
          data?: { status?: string };
        };
        if (cancelled || !res.ok || !json.data?.status) return;
        if (json.data.status === "approved") {
          setManualDiscount((current) =>
            current ? { ...current, approvalStatus: "approved" } : null,
          );
          setPosNotice("Diskon manual disetujui — bisa lanjut bayar.");
        } else if (json.data.status === "rejected") {
          setManualDiscount(null);
          setPosNotice("Diskon manual ditolak Manajer.");
        }
      } catch {
        // ignore poll errors
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [manualDiscount?.approvalId, manualDiscount?.approvalStatus]);

  const selectedQrOrderPath = garageQrOrderPath(selectedQrTable);
  const selectedQrImagePath = `/api/customer/qr?table=${selectedQrTable}`;
  const selectedQrOrderDisplayUrl = qrPublicBaseUrl
    ? absoluteQrOrderUrl(selectedQrTable)
    : selectedQrOrderPath;
  const qrBaseDisplayUrl = qrPublicBaseUrl ?? "Browser origin fallback";
  const qrBaseWarning = !qrPublicBaseUrl || isLocalQrBaseUrl(qrPublicBaseUrl);
  const tablePrintTables = useMemo(() => {
    if (tablePrintMode === "all") {
      return tableNumbers;
    }

    if (tablePrintMode === "range") {
      return tablesInRange(tablePrintStart, tablePrintEnd);
    }

    return [tablePrintSingle];
  }, [tablePrintEnd, tablePrintMode, tablePrintSingle, tablePrintStart]);
  const tablePrintUrl = `${qrPrintPath}?tables=${tablePrintTables.join(",")}`;
  const tablePrintAutoUrl = `${tablePrintUrl}&print=1`;

  useEffect(() => {
    if (!qrTablesOpen) {
      return;
    }

    const controller = new AbortController();

    fetch(selectedQrImagePath, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const svg = await response.text();
        if (!response.ok || !svg.includes("<svg")) {
          throw new Error("QR code meja gagal dimuat.");
        }
        setQrPreviewSvg(svg);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setQrPreviewSvg(null);
        setQrPreviewError(error instanceof Error ? error.message : "QR code meja gagal dimuat.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setQrPreviewLoading(false);
        }
      });

    return () => controller.abort();
  }, [qrTablesOpen, selectedQrImagePath]);

  function absoluteQrOrderUrl(table: string) {
    if (qrPublicBaseUrl) {
      return garageQrOrderUrl(qrPublicBaseUrl, table);
    }

    if (typeof window === "undefined") {
      return garageQrOrderPath(table);
    }

    return garageQrOrderUrl(window.location.origin, table);
  }

  async function copyQrOrderUrl(table: string) {
    const url = absoluteQrOrderUrl(table);
    try {
      await navigator.clipboard.writeText(url);
      setPosNotice(`Link QR Meja ${table} disalin.`);
    } catch {
      setPosNotice(`Link QR Meja ${table}: ${url}`);
    }
  }

  function openTablePrintDialogFromMenu() {
    setCashierMenuOpen(false);
    window.setTimeout(() => setTablePrintOpen(true), 0);
  }

  function openTablePrintPreview() {
    setTablePrintOpen(false);
    window.location.assign(tablePrintAutoUrl);
    setPosNotice(`Preview cetak ${tablePrintTables.length} QR meja dibuka.`);
  }

  async function lookupPosMember(phoneOverride?: string, options: { silent?: boolean } = {}) {
    const phone = (phoneOverride ?? memberPhone).trim();
    if (!phone) {
      if (!options.silent) {
        setMemberError("Masukkan nomor HP member.");
      }
      return;
    }

    setMemberLookupLoading(true);
    setMemberError(null);
    setMemberCreatedPin(null);

    try {
      const result = await garageApi.get<PosMemberLookupResponse>(
        `/api/pos/member?phone=${encodeURIComponent(phone)}`,
        { cache: "no-store" },
      );
      if (result.accountStatus !== "active") {
        setSelectedMember(null);
        setMemberCreatePhone(phone);
        if (!options.silent) {
          setMemberError("Nomor ini ada di CRM, tapi belum menjadi member aktif.");
        }
        return;
      }

      setSelectedMember(result);
      setMemberPhone(result.member.phone);
      setPosCustomerMode("member");
      if (options.silent) {
        setPosNotice(`${result.member.name} otomatis dipilih sebagai member POS.`);
      }
    } catch (error) {
      setSelectedMember(null);
      setMemberCreatePhone(phone);
      if (!options.silent) {
        setMemberError(error instanceof Error ? error.message : "Member tidak ditemukan.");
      }
    } finally {
      setMemberLookupLoading(false);
    }
  }

  function findKnownPosMemberByPhone(phoneInput: string) {
    const normalized = normalizePhone(phoneInput);
    if (normalized.replace(/\D/g, "").length < 8) return null;

    return (
      posMemberOptions.find((customer) => normalizePhone(customer.phone) === normalized) ?? null
    );
  }

  function handleGuestPhoneChange(value: string) {
    const cleanPhone = value.replace(/[^\d+]/g, "");
    setGuestPhone(cleanPhone);
    const knownMember = findKnownPosMemberByPhone(cleanPhone);
    if (!knownMember) return;

    setMemberPhone(knownMember.phone);
    setMemberError(null);
    void lookupPosMember(knownMember.phone, { silent: true });
  }

  function handleMemberPhoneChange(value: string) {
    const cleanPhone = value.replace(/[^\d+]/g, "");
    setMemberPhone(cleanPhone);
    setMemberError(null);
    const knownMember = findKnownPosMemberByPhone(cleanPhone);
    if (!knownMember) return;

    void lookupPosMember(knownMember.phone, { silent: true });
  }

  function selectPosMember(customer: Customer) {
    if (!customer.phone) return;
    setMemberPhone(customer.phone);
    setMemberError(null);
    void lookupPosMember(customer.phone);
  }

  async function createPosMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMemberCreatePending(true);
    setMemberError(null);
    setMemberCreatedPin(null);

    try {
      const result = await garageApi.post<PosMemberCreateResponse>("/api/pos/member", {
        name: memberCreateName,
        phone: memberCreatePhone,
        email: memberCreateEmail,
        password: memberCreatePin,
      });
      setSelectedMember(result);
      setMemberPhone(result.member.phone);
      setMemberCreatedPin(result.temporaryPin);
      setMemberCreateOpen(false);
      setMemberCreateName("");
      setMemberCreateEmail("");
      setMemberCreatePin(generateTemporaryMemberPin());
      setPosNotice(`${result.member.name} berhasil ditambahkan sebagai member.`);
    } catch (error) {
      setMemberError(
        error instanceof Error ? error.message : "Tambah member gagal.",
      );
    } finally {
      setMemberCreatePending(false);
    }
  }

  async function validatePosVoucher() {
    const code = posVoucherCode.trim();
    if (!code) {
      setPosVoucherResult({
        valid: false,
        code: "",
        title: null,
        discount: 0,
        message: "Masukkan kode voucher.",
      });
      return;
    }

    setPosVoucherBusy(true);
    try {
      const result = await garageApi.post<VoucherValidation>("/api/vouchers/validate", {
        code,
        subtotal,
        customerMode: posCustomerMode === "member" ? "member" : "guest",
        customerId: posCustomerMode === "member" ? selectedMemberId ?? undefined : undefined,
      });
      setPosVoucherResult(result);
    } catch (error) {
      setPosVoucherResult({
        valid: false,
        code,
        title: null,
        discount: 0,
        message: error instanceof Error ? error.message : "Voucher tidak valid.",
      });
    } finally {
      setPosVoucherBusy(false);
    }
  }

  const getQrNotificationAudioContext = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    const existingContext = qrNotificationAudioContextRef.current;
    if (existingContext && existingContext.state !== "closed") {
      return existingContext;
    }

    const nextContext = new AudioContextConstructor();
    qrNotificationAudioContextRef.current = nextContext;
    return nextContext;
  }, []);

  const emitQrNotificationTone = useCallback((context: AudioContext) => {
    try {
      const startAt = context.currentTime;
      const gain = context.createGain();
      const oscillator = context.createOscillator();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(1320, startAt + 0.12);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.28);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.32);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch {
      // Browsers can refuse audio in some kiosk modes; notification UI still works.
    }
  }, []);

  const unlockQrNotificationSound = useCallback(() => {
    const context = getQrNotificationAudioContext();
    if (!context) {
      return;
    }

    const playPendingSound = () => {
      if (!pendingQrNotificationSoundRef.current) {
        return;
      }
      pendingQrNotificationSoundRef.current = false;
      emitQrNotificationTone(context);
    };

    if (context.state === "suspended") {
      void context.resume().then(playPendingSound).catch(() => {
        pendingQrNotificationSoundRef.current = true;
      });
      return;
    }

    playPendingSound();
  }, [emitQrNotificationTone, getQrNotificationAudioContext]);

  const playQrOrderNotificationSound = useCallback(() => {
    // Pengaturan outlet (Notifikasi → Suara QR) mengalahkan setelan per perangkat.
    if (cashierPosSettings.qrSoundMode === "off" || settings.qrSoundOn === false) {
      return;
    }

    if (cashierPosSettings.qrSoundMode === "airport") {
      voice.unlock();
      return;
    }

    const context = getQrNotificationAudioContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      pendingQrNotificationSoundRef.current = true;
      void context.resume().then(() => {
        pendingQrNotificationSoundRef.current = false;
        emitQrNotificationTone(context);
      }).catch(() => {
        pendingQrNotificationSoundRef.current = true;
      });
      return;
    }

    pendingQrNotificationSoundRef.current = false;
    emitQrNotificationTone(context);
  }, [cashierPosSettings.qrSoundMode, settings.qrSoundOn, emitQrNotificationTone, getQrNotificationAudioContext]);

  // Pusat notifikasi tidak ikut membunyikan order QR selama layar POS terbuka
  // (POS sudah punya bunyi QR sendiri sesuai setelan perangkat) — cegah dobel.
  useEffect(() => {
    document.body.dataset.posQrSound = "1";
    return () => {
      delete document.body.dataset.posQrSound;
    };
  }, []);

  const previewQrAirportAnnouncer = useCallback(() => {
    voice.unlock();
    void voice.announce("airport_qr", {
      force: true,
      customerName: "Surya",
      table: "12",
      channel: "QR meja",
      dedupKey: `pos-settings-preview:${Date.now()}`,
    });
  }, []);

  useEffect(() => {
    // Auto-unlock voice engine + QR audio context pada interaksi user pertama.
    // Browser butuh user gesture untuk play audio â€” kalau Voice ON tapi tidak
    // unlock, MP3 announcement gak akan bunyi. Dengan listener ini, klik atau
    // ketik pertama di app langsung primer audio engine tanpa user harus klik
    // tombol "Voice ON" manual.
    const unlockAll = () => {
      unlockQrNotificationSound();
      voice.unlock();
    };
    window.addEventListener("pointerdown", unlockAll, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", unlockAll, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAll);
      window.removeEventListener("keydown", unlockAll);
    };
  }, [unlockQrNotificationSound]);

  // Suara "pesanan siap" (owner, Okt 2026): kasir dengar saat tiket Bar/Dapur
  // berubah ke Siap. Ref dipakai agar loadKitchenTickets tetap stabil.
  const readyTicketIdsRef = useRef<Set<string> | null>(null);
  const readyChimeRef = useRef<() => void>(() => {});
  useEffect(() => {
    readyChimeRef.current = () => {
      if (cashierPosSettings.qrSoundMode === "off" || settings.qrSoundOn === false) return;
      const context = getQrNotificationAudioContext();
      if (!context) return;
      if (context.state === "suspended") {
        void context.resume().then(() => emitQrNotificationTone(context)).catch(() => {});
        return;
      }
      emitQrNotificationTone(context);
    };
  }, [cashierPosSettings.qrSoundMode, settings.qrSoundOn, emitQrNotificationTone, getQrNotificationAudioContext]);

  const loadKitchenTickets = useCallback(async () => {
    try {
      const rows = await garageApi.get<KitchenOrder[]>("/api/kitchen/orders", {
        cache: "no-store",
      });
      const readyRows = rows.filter((t) => t.status === "ready");
      const previousReady = readyTicketIdsRef.current;
      readyTicketIdsRef.current = new Set(readyRows.map((t) => t.id));
      // Load pertama hanya mencatat — jangan bunyi untuk tiket yang sudah siap.
      const newlyReady = previousReady ? readyRows.filter((t) => !previousReady.has(t.id)) : [];
      if (newlyReady.length) {
        readyChimeRef.current();
        const labels = newlyReady
          .slice(0, 3)
          .map((t) => [t.queueNo ? `#${t.queueNo}` : null, t.table].filter(Boolean).join(" "))
          .join(", ");
        setPosNotice(
          `Pesanan siap: ${labels}${newlyReady.length > 3 ? ` +${newlyReady.length - 3} lagi` : ""}`,
        );
      }
      // Monitor kasir: tiket yang belum diantar (waiting/processing/ready),
      // FIFO — yang pesan duluan di atas.
      setKitchenTickets(
        rows
          .filter((t) => t.status === "queue" || t.status === "cooking" || t.status === "ready")
          .sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          ),
      );
      const syncedAt = Date.now();
      setKitchenDoneTickets(
        rows
          .filter(
            (t) =>
              (t.status === "completed" || t.status === "delivered") &&
              t.deliveredAt &&
              syncedAt - new Date(t.deliveredAt).getTime() <= 60 * 60_000,
          )
          .sort((a, b) => new Date(b.deliveredAt ?? 0).getTime() - new Date(a.deliveredAt ?? 0).getTime()),
      );
      setKitchenTicketsAt(syncedAt);
    } catch {
      // diam-diam — monitor produksi bukan alur kritis pembayaran
    }
  }, []);

  /** Mulai / Siap (QC) + panggil waiter / Panggil waiter — API Production Hub yang sama. */
  async function runKitchenAction(ticketNo: string, body: Record<string, unknown>) {
    setKitchenActionBusy(ticketNo);
    setKitchenActionError(null);
    try {
      await garageApi.post(`/api/production/tickets/${encodeURIComponent(ticketNo)}`, body);
      setKitchenQcTicket(null);
      await loadKitchenTickets();
    } catch (error) {
      setKitchenActionError(error instanceof Error ? error.message : "Aksi produksi gagal. Coba lagi.");
    } finally {
      setKitchenActionBusy(null);
    }
  }

  /** Cetak tiket Bar/Dapur oleh kasir (boleh lewat dialog print Chrome). */
  async function printProductionTickets(tickets: KitchenOrder[], key: string) {
    if (!tickets.length || kitchenPrintingId) return;
    setKitchenPrintingId(key);
    setKitchenActionError(null);
    try {
      const res = await printKitchenChits(tickets.map((ticket) => ticketToChit(ticket, me.user.name)), settings.defaultPrinterName || undefined);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setKitchenActionError(`Tiket gagal dicetak: ${body.error?.message || "cek printer di Pengaturan Printer."}`);
        return;
      }
      setKitchenPrintedIds((current) => {
        const next = new Set(current);
        for (const ticket of tickets) next.add(ticket.id);
        return next;
      });
    } catch (error) {
      setKitchenActionError(error instanceof Error ? `Tiket gagal dicetak: ${error.message}` : "Tiket gagal dicetak.");
    } finally {
      setKitchenPrintingId(null);
    }
  }

  const loadCustomerOrders = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setCustomerOrdersLoading(true);
    }
    setCustomerOrderError(null);
    try {
      const orders = await garageApi.get<CustomerOrder[]>("/api/customer/orders", {
        cache: "no-store",
      });
      const nextOrderIds = new Set(orders.map((order) => order.id));
      const nextNoticeKey = orders.map((order) => order.id).sort().join("|");
      const customerOrdersWerePrimed = customerOrdersPrimedRef.current;
      const previousOrderIdSnapshot = previousCustomerOrderIdsRef.current;
      const hasNewOrder = orders.some(
        (order) => !previousOrderIdSnapshot.has(order.id),
      );
      previousCustomerOrderIdsRef.current = nextOrderIds;
      customerOrdersPrimedRef.current = true;
      setCustomerOrders(orders);
      setSelectedCustomerOrderId((current) =>
        current && !nextOrderIds.has(current) ? null : current,
      );
      if (orders.length && hasNewOrder && customerOrdersWerePrimed) {
        setDismissedQrNoticeKey(null);
        setQrNoticePulseKey(nextNoticeKey);
        playQrOrderNotificationSound();
        // Loop sekali per order baru, fire multiple voice scenario sesuai
        // konten order (semua dedup by orderId supaya tidak re-fire).
        for (const order of orders) {
          if (previousOrderIdSnapshot.has(order.id)) continue;

          // 1. QR order announcement (existing, gated oleh qrSoundMode airport)
          if (cashierPosSettings.qrSoundMode === "airport" && settings.qrSoundOn !== false) {
            void voice.announce("airport_qr", {
              channel: order.orderSource || order.channel,
              customerName: order.customerName,
              table: order.tableLabel,
              dedupKey: `qr:${order.id}`,
            });
          }

          // 2. Permintaan khusus â€” kalau customer kasih catatan di order
          const note = (order.customerNote ?? "").trim();
          if (note) {
            void voice.announce("waiter_special_request", {
              dedupKey: `special:${order.id}`,
            });
          }

          // 3. Member VIP â€” TODO: butuh lookup tier dari /api/customers/:phone
          //    karena CustomerOrder hanya punya customerMode ("guest"|"member"),
          //    tidak ada tier (Bronze/Silver/Gold/VIP). Untuk sekarang trigger
          //    di-skip supaya tidak noise â€” hanya fire kalau ada tier VIP/Ultra
          //    yang akan ditambahkan via integrasi CRM lookup.
        }
      }
      if (!orders.length) {
        setDismissedQrNoticeKey(null);
        setQrNoticePulseKey(null);
      }
    } catch (error) {
      setCustomerOrderError(
        error instanceof Error ? error.message : "Order QR pelanggan gagal dimuat.",
      );
    } finally {
      if (!options.silent) {
        setCustomerOrdersLoading(false);
      }
    }
  }, [cashierPosSettings.qrSoundMode, playQrOrderNotificationSound, settings.qrSoundOn]);

  const loadQrControlInsights = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setQrInsightsLoading(true);
    }
    setQrInsightsError(null);
    try {
      const searchParams = new URLSearchParams();
      if (qrInsightFilters.status !== "all") {
        searchParams.set("status", qrInsightFilters.status);
      }
      if (qrInsightFilters.source !== "all") {
        searchParams.set("source", qrInsightFilters.source);
      }
      if (qrInsightFilters.table !== "all") {
        searchParams.set("table", qrInsightFilters.table);
      }
      const queryString = searchParams.toString();
      const insights = await garageApi.get<QrControlInsights>(
        `/api/customer/orders/insights${queryString ? `?${queryString}` : ""}`,
        { cache: "no-store" },
      );
      setQrInsights(insights);
    } catch (error) {
      setQrInsightsError(
        error instanceof Error ? error.message : "QR control insight gagal dimuat.",
      );
    } finally {
      if (!options.silent) {
        setQrInsightsLoading(false);
      }
    }
  }, [qrInsightFilters.source, qrInsightFilters.status, qrInsightFilters.table]);

  const loadTableLiveData = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setTableLiveLoading(true);
    }
    setTableLiveError(null);
    try {
      const rows = await garageApi.get<TableLiveRow[]>("/api/tables/live", {
        cache: "no-store",
      });
      setTableLiveRows(rows);
      setTableLiveUpdatedAt(Date.now());
      return rows;
    } catch (error) {
      setTableLiveError(
        error instanceof Error ? error.message : "Peta meja gagal dimuat.",
      );
      return null;
    } finally {
      if (!options.silent) {
        setTableLiveLoading(false);
      }
    }
  }, []);

  // Sumber baris peta meja: live data kalau ada, kalau belum sinkron pakai
  // fallback 50 meja kosong. Dipakai grid, ringkasan jumlah, dan filter.
  const tableMapRows = useMemo<TableLiveRow[]>(
    () =>
      tableLiveRows.length
        ? tableLiveRows
        : tableNumbers.map((table) => ({
            tableNumber: table,
            tableLabel: `Meja ${table}`,
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
          })),
    [tableLiveRows],
  );

  const tableMapCounts = useMemo(() => {
    let empty = 0;
    let occupied = 0;
    let cleaning = 0;
    for (const row of tableMapRows) {
      if (tableNeedsCleaning(row)) cleaning += 1;
      else if (row.status === "empty" && !tableHasLiveSession(row)) empty += 1;
      else occupied += 1;
    }
    return { empty, occupied, cleaning };
  }, [tableMapRows]);

  // Dialog tetap terbuka sampai server menjawab: sukses → tutup + notice,
  // gagal (mis. masih ada bill/produksi) → pesan tampil di dalam dialog.
  const resetTableCleaning = useCallback(async (tableNumber: string) => {
    setResetTableBusy(true);
    setResetTableError(null);
    try {
      await garageApi.patch(`/api/tables/${tableNumber}/status`, {
        status: "empty",
        needsCleaning: false,
      });
      await loadTableLiveData({ silent: true });
      setPosNotice(`Meja ${tableNumber} siap digunakan.`);
      setResetTableDialogOpen(false);
      setSelectedTableToReset(null);
    } catch (error) {
      setResetTableError(error instanceof Error ? error.message : "Gagal menandai meja bersih.");
    } finally {
      setResetTableBusy(false);
    }
  }, [loadTableLiveData]);

  // Ticker 10 detik untuk indikator "terakhir update" peta meja.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  // Buka dialog detail meja + lazy-load rincian item (meja terisi saja).
  // Fetch dilakukan di handler klik, bukan di useEffect, agar tidak memicu
  // setState sinkron di dalam effect (lint react-hooks/set-state-in-effect).
  const openTableDetail = useCallback((table: TableLiveRow) => {
    setTableDetail(table);
    setTableItemsError(null);
    setTableOrderBills(null);
    if (table.status === "empty" && !tableHasLiveSession(table)) {
      setTableItemsLoading(false);
      return;
    }
    setTableItemsLoading(true);
    const tableNumber = table.tableNumber;
    void (async () => {
      try {
        const data = await garageApi.get<{ bills: TableOrderBill[] }>(
          `/api/tables/${tableNumber}/items`,
          { cache: "no-store" },
        );
        setTableOrderBills(data.bills ?? []);
      } catch (error) {
        setTableItemsError(
          error instanceof Error ? error.message : "Rincian pesanan gagal dimuat.",
        );
      } finally {
        setTableItemsLoading(false);
      }
    })();
  }, []);

  // Buka dialog konfirmasi/alasan; resolve dengan alasan (string) atau true saat
  // dikonfirmasi, false saat dibatalkan. Pengganti window.confirm/prompt.
  function askConfirm(opts: {
    title: string;
    message?: string;
    confirmLabel?: string;
    needsReason?: boolean;
    reasonPlaceholder?: string;
    danger?: boolean;
  }): Promise<string | boolean> {
    setConfirmReason("");
    setConfirmState(opts);
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
    });
  }
  function resolveConfirm(value: string | boolean) {
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setConfirmState(null);
    setConfirmReason("");
    resolve?.(value);
  }

  const refreshCashierData = useCallback(async () => {
    if (cashierRefreshing) {
      return;
    }

    setCashierRefreshing(true);
    setCustomerOrderError(null);
    setPosNotice(null);

    try {
      await Promise.all([
        Promise.resolve(onOrderCreated()),
        loadCustomerOrders({ silent: false }),
        loadQrControlInsights({ silent: false }),
        loadTableLiveData({ silent: false }),
      ]);
      setPosNotice("Data POS kasir diperbarui.");
    } catch (error) {
      setCustomerOrderError(
        error instanceof Error ? error.message : "Muat ulang POS gagal.",
      );
    } finally {
      setCashierRefreshing(false);
    }
  }, [
    cashierRefreshing,
    loadCustomerOrders,
    loadQrControlInsights,
    loadTableLiveData,
    onOrderCreated,
  ]);

  const loadShiftReport = useCallback(async () => {
    setShiftReportLoading(true);
    setShiftReportError(null);

    try {
      const [history, summary] = await Promise.all([
        garageApi.get<CashierShiftHistory>("/api/finance/cash-sessions/me?limit=8", {
          cache: "no-store",
        }),
        cashSession.id
          ? garageApi.get<CashierShiftSummary>(
              `/api/finance/cash-sessions/${cashSession.id}/summary`,
              { cache: "no-store" },
            )
          : Promise.resolve(null),
      ]);
      setShiftReportHistory(history);
      setShiftReportSummary(summary);
    } catch (error) {
      setShiftReportError(
        error instanceof Error ? error.message : "Report shift gagal dimuat.",
      );
    } finally {
      setShiftReportLoading(false);
    }
  }, [cashSession.id]);

  useEffect(() => {
    if (cashierToolOpen !== "reports") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadShiftReport();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [cashierToolOpen, loadShiftReport]);

  useEffect(() => {
    return () => {
      void qrNotificationAudioContextRef.current?.close().catch(() => {});
      qrNotificationAudioContextRef.current = null;
    };
  }, []);

  const fullscreenNeedsAttention = fullscreenGuardActive && !isFullscreen;
  const fullscreenActionLabel = fullscreenStarted
    ? "Masuk Layar Penuh Lagi"
    : "Kunci Layar Penuh";

  useEffect(() => {
    if (!isCashierKiosk) {
      return;
    }

    const posUrl = "/pos";
    const guardState = { garagePosLocked: true };
    const keepCashierOnPos = () => {
      if (window.location.pathname !== posUrl) {
        window.history.replaceState(guardState, "", posUrl);
      }
      window.history.pushState(guardState, "", posUrl);
    };
    const blockPageExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const blockNavigationKeys = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blocked =
        event.key === "F5" ||
        (event.altKey && ["arrowleft", "arrowright", "home"].includes(key)) ||
        (event.ctrlKey && ["l", "r", "w"].includes(key)) ||
        ((event.ctrlKey || event.metaKey) && ["l", "r", "w"].includes(key));

      if (!blocked) {
        return;
      }

      event.preventDefault();
      setPosNotice("POS Kasir dikunci. Gunakan shortcut kiosk untuk kunci layar penuh.");
    };

    keepCashierOnPos();
    window.addEventListener("popstate", keepCashierOnPos);
    window.addEventListener("beforeunload", blockPageExit);
    window.addEventListener("keydown", blockNavigationKeys, true);

    return () => {
      window.removeEventListener("popstate", keepCashierOnPos);
      window.removeEventListener("beforeunload", blockPageExit);
      window.removeEventListener("keydown", blockNavigationKeys, true);
    };
  }, [isCashierKiosk]);

  const syncFullscreenState = useCallback(() => {
    const nextIsFullscreen = Boolean(document.fullscreenElement);
    setIsFullscreen(nextIsFullscreen);

    if (nextIsFullscreen) {
      setFullscreenStarted(true);
      setFullscreenError(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("fullscreenchange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, [syncFullscreenState]);

  useEffect(() => {
    if (!isCashierKiosk || cashierPosSettings.autoLockDelay === "off" || locked) {
      return;
    }

    const delayMs = Number(cashierPosSettings.autoLockDelay) * 60_000;
    let timeoutId = window.setTimeout(() => setLocked(true), delayMs);

    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setLocked(true), delayMs);
    };

    window.addEventListener("pointerdown", resetTimer, { passive: true });
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("touchstart", resetTimer, { passive: true });

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("pointerdown", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
    };
  }, [cashierPosSettings.autoLockDelay, isCashierKiosk, locked, setLocked]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  }, []);

  useEffect(() => {
    if (!posVisible) {
      return;
    }

    const tick = () => {
      // Pause polling saat tab/window di-background â€” kasir nggak butuh
      // refresh QR/table saat lagi buka modul lain atau monitor mati.
      if (typeof document !== "undefined" && document.hidden) return;
      void loadCustomerOrders({ silent: true });
      void loadQrControlInsights({ silent: true });
      void loadTableLiveData({ silent: true });
      void loadKitchenTickets();
    };

    const timeoutId = window.setTimeout(tick, 0);
    const intervalId = window.setInterval(tick, 12_000);
    // Refresh segera saat tab kembali visible biar UI tidak basi.
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadCustomerOrders, loadQrControlInsights, loadTableLiveData, loadKitchenTickets, posVisible]);

  // Voice notification: trigger waiter_clear_table saat meja baru transition
  // ke "needs_cleaning" â€” tidak re-fire setiap polling untuk meja yang udah
  // lama needs_cleaning.
  useEffect(() => {
    if (!tableLiveRows.length) return;
    const currentNeedsCleaning = new Set(
      tableLiveRows
        .filter((t) => t.needsCleaning || t.status === "needs_cleaning")
        .map((t) => t.tableNumber),
    );
    const previous = previousNeedsCleaningRef.current;
    // Skip announcement pada first load (previous=null) supaya tidak bunyi
    // untuk meja yang sudah needs_cleaning sejak halaman dibuka.
    if (previous !== null) {
      for (const tableNo of currentNeedsCleaning) {
        if (!previous.has(tableNo)) {
          void voice.announce("waiter_clear_table", {
            dedupKey: `clear-table-${tableNo}`,
          });
        }
      }
    }
    previousNeedsCleaningRef.current = currentNeedsCleaning;
  }, [tableLiveRows]);

  // Status pengantaran order delivery yang sudah lunas (dikelola tim Garage).
  async function setDeliveryStatus(order: CustomerOrder, deliveryStatus: "preparing" | "on_the_way" | "delivered") {
    if (customerOrderActionId) return;
    setCustomerOrderActionId(`${order.id}:delivery`);
    setCustomerOrderError(null);
    try {
      await garageApi.patch<CustomerOrderActionResponse>(`/api/customer/orders/${order.id}/status`, {
        action: "delivery_status",
        deliveryStatus,
      });
      setPosNotice(`${order.orderNo}: ${deliveryStatusLabel[deliveryStatus]}.`);
      await loadCustomerOrders({ silent: true });
    } catch (error) {
      setCustomerOrderError(error instanceof Error ? error.message : "Status pengantaran gagal disimpan.");
    } finally {
      setCustomerOrderActionId(null);
    }
  }

  async function decideCustomerOrder(
    order: CustomerOrder,
    action:
      | "accept"
      | "reject"
      | "paid"
      | "whatsapp_sent"
      | "waiter_cash_received"
      | "waiter_cash_deposited",
    options: {
      cashReceived?: number;
      cashDeposited?: number;
      paymentNote?: string;
      reason?: string;
      // Metode yang dipilih kasir saat Final Bayar (default: pilihan pelanggan).
      paymentMethod?: PaymentMethod;
      // Referensi QRIS/transfer yang dicek kasir (menimpa referensi pelanggan).
      paymentReference?: string;
    } = {},
  ) {
    if (customerOrderActionId) {
      return;
    }

    setCustomerOrderActionId(`${order.id}:${action}`);
    setCustomerOrderError(null);
    try {
      const orderMethod = customerOrderPaymentMethod(order);
      const payMethod = options.paymentMethod ?? orderMethod;
      const methodChanged = payMethod !== orderMethod;
      const finalCashReceived =
        action === "paid" && payMethod === "Cash"
          ? options.cashReceived ?? order.cashReceived ?? order.cashDeposited ?? order.total
          : options.cashReceived;
      const finalCashDeposited =
        action === "paid" && payMethod === "Cash"
          ? options.cashDeposited ?? order.cashDeposited ?? finalCashReceived
          : options.cashDeposited;
      const result = await garageApi.patch<CustomerOrderActionResponse>(
        `/api/customer/orders/${order.id}/status`,
        {
          action,
          paymentMethod: action === "paid" ? payMethod : undefined,
          paymentProvider:
            action === "paid"
              ? methodChanged
                ? defaultPaymentProvider(options.paymentMethod ?? "Cash") || undefined
                : customerOrderPaymentProvider(order)
              : undefined,
          paymentReference:
            action === "paid"
              ? normalizePaymentReference(options.paymentReference) ??
                (!methodChanged ? customerOrderPaymentReference(order) : undefined)
              : undefined,
          cashReceived: finalCashReceived,
          cashDeposited: finalCashDeposited,
          paymentNote: options.paymentNote,
          reason: action === "reject" ? options.reason : undefined,
        },
      );
      const ticketLabel = result.ticketNos.length ? result.ticketNos.join(", ") : "tanpa ticket baru";
      // Chit dapur/bar dicetak saat tiket KDS benar-benar dibuat (accept/final bayar),
      // supaya tidak dobel bila order sudah pernah di-accept sebelumnya.
      if ((action === "accept" || action === "paid") && result.ticketNos.length > 0) {
        void printChitIfEnabled({
          orderNo: order.orderNo,
          queueNo: order.queueNo ?? null,
          tableLabel: order.tableLabel,
          orderType: order.fulfillment ?? order.orderSource,
          createdAt: order.createdAt,
          customerName: order.customerName,
          customerPhone: order.fulfillment === "delivery" ? order.customerPhone : null,
          deliveryAddress: order.fulfillment === "delivery" ? order.deliveryAddress ?? null : null,
          items: order.items.map((item) => {
            // Station dari id produk (paling akurat), fallback nama; paket diberi keterangan.
            const menu = item.menuItemId ? menuItemsById.get(item.menuItemId) : undefined;
            const note = [item.package ? `Paket: ${item.package.entryName}` : "", item.note ?? ""].filter(Boolean).join(" · ");
            return {
              name: item.itemName,
              variant: item.variantLabel,
              qty: item.qty,
              note: note || null,
              station: menu ? chitStationFor(menu) : stationByItemName.get(item.itemName.trim().toLowerCase()) ?? "Dapur",
            };
          }),
        });
      }
      setPosNotice(
        action === "reject"
          ? `${order.orderNo} ditolak.`
          : action === "whatsapp_sent"
            ? `${order.orderNo} ditandai invoice WhatsApp terkirim.`
            : action === "waiter_cash_received"
              ? `${order.orderNo} cash diterima waiter.`
              : action === "waiter_cash_deposited"
                ? `${order.orderNo} setoran waiter menunggu konfirmasi kasir.`
                : action === "paid" && payMethod === "Cash" && (finalCashReceived ?? 0) > order.total
                  ? `${order.orderNo} lunas. KEMBALIAN ${currency.format((finalCashReceived ?? 0) - order.total)}.`
                  : `${order.orderNo} ${action === "paid" ? "pembayaran diterima" : "accepted"} - ${ticketLabel}.`,
      );
      await loadCustomerOrders({ silent: true });
      await loadQrControlInsights({ silent: true });
      refreshOpenTableDetail(await loadTableLiveData({ silent: true }));
      if (action === "accept" || action === "paid") {
        await onOrderCreated();
      }
      if (action === "paid" || action === "reject") {
        setSelectedCustomerOrderId(null);
        setQrOrdersOpen(false);
      }
    } catch (error) {
      setCustomerOrderError(
        error instanceof Error ? error.message : "Aksi order QR pelanggan gagal.",
      );
    } finally {
      setCustomerOrderActionId(null);
    }
  }

  // Reject & Final Bayar = aksi susah-dibalik → buka dialog konfirmasi dulu.
  function openRejectDialog(order: CustomerOrder) {
    setRejectOrderTarget(order);
    setRejectReasonChoice("Stok habis");
    setRejectReasonOther("");
  }

  function confirmRejectOrder() {
    if (!rejectOrderTarget) return;
    const reason =
      rejectReasonChoice === "Lainnya"
        ? rejectReasonOther.trim()
        : rejectReasonChoice;
    if (rejectReasonChoice === "Lainnya" && reason.length < 3) return;
    const target = rejectOrderTarget;
    setRejectOrderTarget(null);
    void decideCustomerOrder(target, "reject", { reason });
  }

  function openFinalizeDialog(order: CustomerOrder) {
    const method = customerOrderPaymentMethod(order);
    setFinalizeMethod(
      order.fulfillment === "delivery"
        ? "QRIS"
        : (paymentMethods as readonly string[]).includes(method)
          ? (method as PaymentMethod)
          : "Cash",
    );
    setFinalizeCash("");
    setFinalizeReference(customerOrderPaymentReference(order) ?? "");
    setFinalizeOrderTarget(order);
  }

  const finalizeCashValue = Number(finalizeCash.replace(/[^\d]/g, "")) || 0;
  const finalizeCashShort =
    Boolean(finalizeOrderTarget) &&
    finalizeMethod === "Cash" &&
    finalizeCash !== "" &&
    finalizeCashValue < (finalizeOrderTarget?.total ?? 0);
  const finalizeReferenceMissing =
    finalizeMethod === "QRIS" && settings.qrisReferenceRequired && !normalizePaymentReference(finalizeReference);

  function confirmFinalizeOrder() {
    if (!finalizeOrderTarget || finalizeCashShort || finalizeReferenceMissing) return;
    const target = finalizeOrderTarget;
    setFinalizeOrderTarget(null);
    void decideCustomerOrder(target, "paid", {
      paymentMethod: finalizeMethod,
      cashReceived: finalizeMethod === "Cash" && finalizeCash !== "" ? finalizeCashValue : undefined,
      paymentReference: finalizeMethod === "Cash" ? undefined : finalizeReference,
    });
  }

  // Bayar satu bill meja (termasuk bill pisahan) dari detail meja.
  async function payTableBill(bill: Pick<TableOrderBill, "id" | "orderNo">) {
    const known = customerOrders.find((order) => order.id === bill.id);
    if (known) {
      openFinalizeDialog(known);
      return;
    }
    try {
      const fresh = await garageApi.get<CustomerOrder[]>("/api/customer/orders", { cache: "no-store" });
      const order = fresh.find((row) => row.id === bill.id);
      if (!order) {
        setPosNotice(`${bill.orderNo} tidak ditemukan di antrean bill. Muat ulang lalu coba lagi.`);
        return;
      }
      openFinalizeDialog(order);
    } catch (error) {
      setPosNotice(error instanceof Error ? error.message : "Gagal memuat bill.");
    }
  }

  async function handleTableBillSplit(result: TableBillSplitResult) {
    setTableSplitBill(null);
    // Bill pisahan bukan pesanan baru — jangan bunyikan notifikasi order QR.
    previousCustomerOrderIdsRef.current.add(result.child.id);
    setPosNotice(
      `Bill dipisah: ${result.child.orderNo} (${result.child.customerName ?? "tamu"}) ${currency.format(result.child.total)} · sisa ${result.source.orderNo} ${currency.format(result.source.total)}.`,
    );
    const [, liveRows] = await Promise.all([
      loadCustomerOrders({ silent: true }),
      loadTableLiveData({ silent: true }),
    ]);
    refreshOpenTableDetail(liveRows);
  }

  // Detail meja yang sedang terbuka: segarkan ringkasan (baris live) + rincian bill.
  function refreshOpenTableDetail(liveRows: TableLiveRow[] | null | undefined) {
    if (!tableDetail) return;
    const fresh = liveRows?.find((row) => row.tableNumber === tableDetail.tableNumber);
    openTableDetail(fresh ?? tableDetail);
  }

  function cashInputValue(value: string) {
    const parsed = Number(value.replace(/[^\d]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function receiveWaiterCash(order: CustomerOrder) {
    const amount = cashInputValue(customerOrderCashReceived || String(order.total));
    void decideCustomerOrder(order, "waiter_cash_received", {
      cashReceived: amount,
    });
  }

  function depositWaiterCash(order: CustomerOrder) {
    const amount = cashInputValue(
      customerOrderCashDeposited ||
        String(order.cashReceived ?? order.total),
    );
    void decideCustomerOrder(order, "waiter_cash_deposited", {
      cashDeposited: amount,
    });
  }

  async function createShiftHandover() {
    if (shiftHandoverPending) {
      return;
    }

    setShiftHandoverPending(true);
    setCustomerOrderError(null);
    try {
      const report = await garageApi.post<{ id: string; status: string }>(
        "/api/shift/handover",
        {
          notes: "Generated from POS QR Control.",
        },
      );
      setPosNotice(`Shift handover tersimpan (${report.status}) ${report.id.slice(0, 8)}.`);
      await loadQrControlInsights({ silent: true });
    } catch (error) {
      setCustomerOrderError(
        error instanceof Error ? error.message : "Shift handover gagal dibuat.",
      );
    } finally {
      setShiftHandoverPending(false);
    }
  }

  function addItem(itemId: string, variantId: string) {
    setCart((current) => {
      const existing = current.find(
        (line) => line.itemId === itemId && line.variantId === variantId,
      );
      if (existing) {
        return current.map((line) =>
          line.itemId === itemId && line.variantId === variantId
            ? { ...line, qty: line.qty + 1 }
            : line,
        );
      }
      return [...current, { itemId, variantId, qty: 1 }];
    });
  }

  function decrementItem(itemId: string, variantId: string) {
    setCart((current) =>
      current
        .map((line) =>
          line.itemId === itemId && line.variantId === variantId
            ? { ...line, qty: line.qty - 1 }
            : line,
        )
        .filter((line) => line.qty > 0),
    );
  }

  function setItemNote(itemId: string, variantId: string, note: string) {
    setCart((current) =>
      current.map((line) =>
        line.itemId === itemId && line.variantId === variantId
          ? { ...line, note: note.trim().slice(0, 120) || undefined }
          : line,
      ),
    );
  }

  // Load parked orders sekali di mount, persist tiap kali berubah
  const parkedInitializedRef = useRef(false);
  useEffect(() => {
    if (parkedInitializedRef.current) return;
    parkedInitializedRef.current = true;
    setParkedOrders(loadParkedOrders());
  }, []);
  useEffect(() => {
    if (!parkedInitializedRef.current) return;
    persistParkedOrders(parkedOrders);
  }, [parkedOrders]);

  // Sold-out menu digital: DB is the source of truth so QR customer and POS stay synced.
  const soldOutInitializedRef = useRef(false);
  useEffect(() => {
    if (soldOutPendingIds.size) return;
    const ids = menuItems
      .filter((item) => item.stock === "sold_out")
      .map((item) => item.id);
    const timeoutId = window.setTimeout(() => setSoldOutIds(new Set(ids)), 0);
    if (!soldOutInitializedRef.current) {
      soldOutInitializedRef.current = true;
      persistSoldOutIds(ids);
    }
    return () => window.clearTimeout(timeoutId);
  }, [menuItems, soldOutPendingIds.size]);

  const receiptHistoryInitializedRef = useRef(false);
  useEffect(() => {
    if (receiptHistoryInitializedRef.current) return;
    receiptHistoryInitializedRef.current = true;
    setReceiptHistory(loadReceiptHistory().slice(0, settings.receiptHistoryMax));
  }, [settings.receiptHistoryMax]);
  useEffect(() => {
    if (!receiptHistoryInitializedRef.current) return;
    persistReceiptHistory(receiptHistory.slice(0, settings.receiptHistoryMax));
  }, [settings.receiptHistoryMax, receiptHistory]);

  // estimasi total cepat berbasis variant price * qty
  function estimateCartTotal(lines: CartLine[]): number {
    return lines.reduce((sum, line) => {
      const item = menuItemsById.get(line.itemId);
      const variant = item?.variants.find((v) => v.id === line.variantId);
      return sum + (variant?.price ?? 0) * line.qty;
    }, 0);
  }

  function parkCurrentOrder(customLabel?: string) {
    if (!cart.length) return;
    const label =
      customLabel?.trim() ||
      (orderType === "dine-in" && selectedTableNumber
        ? `Meja ${selectedTableNumber}`
        : orderType === "takeaway"
          ? "Take Away"
          : orderType === "delivery"
            ? "Delivery"
            : "Bill terparkir");

    const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);
    const idSuffix = makeIdempotencyKey();
    const parked: ParkedOrder = {
      id: `park_${idSuffix}`,
      label,
      cart: [...cart],
      orderType,
      selectedTableNumber,
      posCustomerMode,
      guestName,
      guestPhone,
      memberPhone,
      voucherCode: posVoucherCode,
      itemCount,
      estimatedTotal: estimateCartTotal(cart),
      parkedAt: new Date().toISOString(),
    };

    setParkedOrders((current) => [parked, ...current].slice(0, 20));

    // Reset cart aktif supaya kasir bisa layani customer next
    setCart([]);
    setSelectedTableNumber("");
    setGuestName("");
    setGuestPhone("");
    setMemberPhone("");
    setSelectedMember(null);
    setPosVoucherCode("");
    setPosVoucherResult(null);
    setParkDialogOpen(false);
    setParkLabel("");
  }

  async function resumeParkedOrder(parked: ParkedOrder) {
    if (cart.length) {
      const confirm = await askConfirm({
        title: "Parkir keranjang aktif dulu?",
        message: `Keranjang aktif berisi ${cart.length} item. Parkir dulu sebelum melanjutkan "${parked.label}"?`,
        confirmLabel: "Parkir & lanjutkan",
      });
      if (confirm) {
        parkCurrentOrder("Auto-parked saat resume");
      } else {
        return;
      }
    }
    setCart(parked.cart);
    setOrderType(parked.orderType);
    setSelectedTableNumber(parked.selectedTableNumber);
    setPosCustomerMode(parked.posCustomerMode);
    setGuestName(parked.guestName);
    setGuestPhone(parked.guestPhone);
    setMemberPhone(parked.memberPhone);
    setPosVoucherCode(parked.voucherCode);
    setParkedOrders((current) => current.filter((p) => p.id !== parked.id));
    setParkedListOpen(false);
  }

  function deleteParkedOrder(id: string) {
    setParkedOrders((current) => current.filter((p) => p.id !== id));
  }

  // â”€â”€â”€ Diskon manual helpers â”€â”€â”€
  function openManualDiscountDialog() {
    setManualDiscountError(null);
    if (manualDiscount) {
      setManualDiscountTypeInput(manualDiscount.type);
      setManualDiscountValueInput(String(manualDiscount.rawValue));
      setManualDiscountReasonInput(manualDiscount.reason);
    } else {
      setManualDiscountTypeInput("amount");
      setManualDiscountValueInput("");
      setManualDiscountReasonInput("");
    }
    setManualDiscountOpen(true);
  }

  async function applyManualDiscount() {
    const raw = Number(manualDiscountValueInput);
    if (!Number.isFinite(raw) || raw <= 0) {
      setManualDiscountError("Masukkan nilai diskon yang valid.");
      return;
    }
    const reason = manualDiscountReasonInput.trim();
    if (!reason) {
      setManualDiscountError("Alasan diskon wajib diisi untuk audit.");
      return;
    }
    const baseAfterVoucher = Math.max(0, total - voucher);
    const computed =
      manualDiscountTypeInput === "percent"
        ? Math.min(baseAfterVoucher, Math.round((baseAfterVoucher * raw) / 100))
        : Math.min(baseAfterVoucher, Math.round(raw));
    const maxManualDiscount = Math.round(
      baseAfterVoucher * (settings.manualDiscountMaxPct / 100),
    );
    if (computed > maxManualDiscount) {
      setManualDiscountError(
        `Diskon kasir maksimal ${settings.manualDiscountMaxPct}% (${currency.format(maxManualDiscount)}).`,
      );
      return;
    }
    if (computed <= 0) {
      setManualDiscountError("Nilai diskon tidak menghasilkan potongan.");
      return;
    }

    const approvalPct = settings.manualDiscountApprovalPct ?? 10;
    const needsApproval =
      baseAfterVoucher > 0 &&
      (computed / baseAfterVoucher) * 100 > approvalPct;

    if (needsApproval) {
      setManualDiscountError(null);
      try {
        const result = await garageApi.post<{
          approvalId: string;
          status: string;
          amount: number;
        }>("/api/approvals/discount-request", {
          type: manualDiscountTypeInput,
          rawValue: raw,
          baseAfterVoucher,
          reason,
        });
        setManualDiscount({
          type: manualDiscountTypeInput,
          rawValue: raw,
          amount: computed,
          reason,
          approvalId: result.approvalId,
          approvalStatus: "pending",
        });
        setManualDiscountOpen(false);
        setPosNotice(
          `Diskon ${currency.format(computed)} diajukan ke Persetujuan. Tunggu Manajer atau minta setujui dengan PIN.`,
        );
      } catch (error) {
        setManualDiscountError(
          error instanceof Error ? error.message : "Gagal mengajukan persetujuan diskon.",
        );
      }
      return;
    }

    setManualDiscount({
      type: manualDiscountTypeInput,
      rawValue: raw,
      amount: computed,
      reason,
      approvalStatus: "approved",
    });
    setManualDiscountOpen(false);
    setManualDiscountError(null);
    setPosNotice(`Diskon kasir ${currency.format(computed)} diterapkan.`);
  }

  function clearManualDiscount() {
    setManualDiscount(null);
    setPosNotice("Diskon kasir dibatalkan.");
  }

  // â”€â”€â”€ Sold-out helpers â”€â”€â”€
  async function updateSoldOutStock(itemId: string, soldOut: boolean) {
    setSoldOutPendingIds((current) => new Set(current).add(itemId));
    setSoldOutIds((current) => {
      const next = new Set(current);
      if (soldOut) next.add(itemId);
      else next.delete(itemId);
      return next;
    });

    try {
      await garageApi.patch(`/api/menu/${encodeURIComponent(itemId)}`, {
        stock: soldOut ? "sold_out" : "ready",
      });
      setPosNotice(soldOut ? "Menu digital ditandai HABIS." : "Menu digital tersedia kembali.");
      void onOrderCreated();
    } catch (error) {
      setSoldOutIds((current) => {
        const next = new Set(current);
        if (soldOut) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
      setCustomerOrderError(
        error instanceof Error ? error.message : "Gagal update stok menu digital.",
      );
    } finally {
      setSoldOutPendingIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  }

  // Upload foto menu digital per item: owner pilih foto dari HP/galeri,
  // di-upload ke server (dikompres ke webp), lalu jadi imageUrl item.
  const menuPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [menuPhotoTargetId, setMenuPhotoTargetId] = useState<string | null>(null);
  const [menuPhotoUploadingId, setMenuPhotoUploadingId] = useState<string | null>(null);

  function openMenuPhotoPicker(itemId: string) {
    setMenuPhotoTargetId(itemId);
    menuPhotoInputRef.current?.click();
  }

  async function removeMenuItemPhoto(itemId: string) {
    try {
      await garageApi.patch(`/api/menu/${encodeURIComponent(itemId)}`, { imageUrl: "" });
      setPosNotice("Foto menu dihapus.");
      // Refetch MENU supaya foto hilang langsung tampil (bukan cuma kitchen).
      void (onMenuChanged ?? onOrderCreated)();
    } catch (error) {
      setCustomerOrderError(
        error instanceof Error ? error.message : "Gagal menghapus foto menu.",
      );
    }
  }

  async function onMenuPhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const itemId = menuPhotoTargetId;
    event.target.value = ""; // reset agar bisa pilih file yang sama lagi
    if (!file || !itemId) return;
    setMenuPhotoUploadingId(itemId);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`/api/menu/${encodeURIComponent(itemId)}/image`, {
        method: "POST",
        body: form,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(payload?.error?.message ?? "Unggah foto gagal.");
      }
      setPosNotice("Foto menu diperbarui.");
      // Refetch MENU supaya foto baru langsung tampil di kartu (bukan reload).
      void (onMenuChanged ?? onOrderCreated)();
    } catch (error) {
      setCustomerOrderError(
        error instanceof Error ? error.message : "Gagal upload foto menu.",
      );
    } finally {
      setMenuPhotoUploadingId(null);
      setMenuPhotoTargetId(null);
    }
  }

  async function clearAllSoldOut() {
    const ids = Array.from(soldOutIds);
    if (!ids.length) return;
    setSoldOutPendingIds(new Set(ids));
    setSoldOutIds(new Set());
    try {
      await Promise.all(
        ids.map((id) =>
          garageApi.patch(`/api/menu/${encodeURIComponent(id)}`, { stock: "ready" }),
        ),
      );
      setPosNotice("Semua tanda HABIS menu digital dihapus.");
      void onOrderCreated();
    } catch (error) {
      setSoldOutIds(new Set(ids));
      setCustomerOrderError(
        error instanceof Error ? error.message : "Gagal reset stok habis menu digital.",
      );
    } finally {
      setSoldOutPendingIds(new Set());
    }
  }

  // â”€â”€â”€ Reprint helpers â”€â”€â”€
  async function reprintReceipt(receipt: OrderReceipt) {
    setReprintTargetId(receipt.invoiceNo);
    setReprintStatus("printing");
    setReprintError(null);
    // Tag receipt sebagai reprint supaya badge "CETAK ULANG" tampil di struk.
    const reprintPayload: OrderReceipt = {
      ...receipt,
      isReprint: true,
      reprintAt: new Date().toISOString(),
    };
    const claim = await claimReprint(receipt.orderNo);
    if (!claim.ok) {
      setReprintStatus("error");
      setReprintError(claim.message);
      return;
    }
    try {
      const res = await printThermal({
        receipt: reprintPayload,
        printerName: reprintPayload.settings?.defaultPrinterName || undefined,
        copies: reprintPayload.settings?.receiptCopies,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        message?: string;
      };
      if (!res.ok) {
        setReprintStatus("error");
        setReprintError(
          data.error?.message || data.message || "Gagal mencetak struk.",
        );
        void voice.announce("warning_printer", {
          dedupKey: `reprint:${receipt.orderNo}`,
        });
        return;
      }
      setReprintStatus("success");
      setPosNotice(`Struk ${receipt.orderNo} dicetak ulang.`);
    } catch {
      setReprintStatus("error");
      setReprintError("Koneksi printer gagal. Coba lagi.");
      void voice.announce("warning_printer", {
        dedupKey: `reprint-exc:${receipt.orderNo}`,
      });
    }
  }

  async function clearReceiptHistory() {
    if (!receiptHistory.length) return;
    const confirm = await askConfirm({
      title: "Hapus riwayat struk?",
      message: `Hapus ${receiptHistory.length} struk dari riwayat shift?`,
      confirmLabel: "Hapus",
      danger: true,
    });
    if (!confirm) return;
    setReceiptHistory([]);
    setPosNotice("Riwayat struk shift dihapus.");
  }

  // Batal / refund order: Kasir & Waiter mengajukan (bisa diputus PIN Manajer di
  // tablet), Manajer/Owner langsung dieksekusi — semua tercatat di Persetujuan.
  const canCancelOrder = ["Owner", "Manajer", "Kasir", "Waiter"].includes(me.role);
  const [cancelTarget, setCancelTarget] = useState<OrderCancelTarget | null>(null);
  // ─── Split per produk (keranjang kasir) ───
  const cartSplitLines: CartSplitLine[] = useMemo(
    () =>
      cartLines.map((line) => ({
        itemId: line.itemId,
        variantId: line.variantId,
        qty: line.qty,
        note: line.note,
        price: line.variant.price,
        name: line.item.name,
        variantLabel: line.variant.label,
        category: line.item.category,
      })),
    [cartLines],
  );
  const cartSplitBlockedReason =
    posVoucherResult?.valid || manualDiscount
      ? "Hapus voucher / diskon kasir dulu — split per produk belum mendukung potongan."
      : posCustomerMode === "member" && selectedMember
        ? "Mode member aktif: poin tidak bisa dibagi per tamu. Ganti ke mode Tamu, atau bayar sekaligus."
        : dineInTableMissing
          ? "Pilih meja dulu: tekan Bayar → isi langkah Meja → di langkah Pembayaran tekan \"Bayar terpisah per tamu\"."
          : null;

  function handleSplitGuestPaid(
    result: OrderCreateResponse,
    guestLines: CartSplitLine[],
    guestName: string,
  ) {
    setReceiptHistory((current) =>
      [result.receipt, ...current].slice(0, settings.receiptHistoryMax),
    );
    void printChitIfEnabled({
      orderNo: result.orderNo,
      queueNo: result.receipt.queueNo ?? null,
      tableLabel: result.receipt.tableLabel ?? tableLabel,
      orderType,
      createdAt: result.receipt.createdAt ?? new Date().toISOString(),
      cashierName: result.receipt.cashier?.name ?? null,
      customerName: guestName || result.receipt.customer?.name || null,
      items: guestLines.map((line) => ({
        name: line.name,
        variant: line.variantLabel,
        qty: line.qty,
        note: line.note ?? null,
        station:
          stationByItemName.get(line.name.trim().toLowerCase()) ??
          (menuGroupForCategory(line.category as MenuItem["category"]) === "Lainnya"
            ? "Langsung"
            : menuGroupForCategory(line.category as MenuItem["category"])),
      })),
    });
    setPosNotice(`${guestName}: ${result.orderNo} lunas ${currency.format(result.total)}.`);
    invalidateGarageCache([
      GARAGE_TAGS.orders,
      GARAGE_TAGS.finance,
      GARAGE_TAGS.kitchen,
      GARAGE_TAGS.inventory,
      GARAGE_TAGS.dashboard,
    ]);
  }

  async function handleSplitClose(paidGuests: Set<number>, assignment: SplitAssignment) {
    setCartSplitOpen(false);
    if (!paidGuests.size) return;
    // Porsi yang sudah lunas keluar dari keranjang; sisanya tetap untuk dibayar.
    const rest = remainingCart(cartSplitLines, assignment, paidGuests).map((line) => ({
      itemId: line.itemId,
      variantId: line.variantId,
      qty: line.qty,
      ...(line.note ? { note: line.note } : {}),
    }));
    setCart(rest);
    if (!rest.length) {
      setSelectedTableNumber("");
      setGuestName("");
      setGuestPhone("");
      setPosCustomerMode("guest");
      setPosNotice(`Split selesai: ${paidGuests.size} tamu lunas.`);
    } else {
      setPosNotice(
        `${paidGuests.size} tamu lunas. ${rest.reduce((sum, line) => sum + line.qty, 0)} porsi tersisa di keranjang.`,
      );
    }
    await onOrderCreated();
    await loadTableLiveData({ silent: true });
  }

  function handleCancelFinished(message: string, changed: boolean) {
    setCancelTarget(null);
    setPosNotice(message);
    if (!changed) return;
    // Void/refund mengubah orders/finance/inventory — refresh view terkait.
    invalidateGarageCache([
      GARAGE_TAGS.orders,
      GARAGE_TAGS.finance,
      GARAGE_TAGS.inventory,
      GARAGE_TAGS.dashboard,
    ]);
  }
  // â”€â”€â”€ Kas Keluar / Masuk Laci â”€â”€â”€
  function openExpenseDialog() {
    setExpenseDialogOpen(true);
  }

  function openQuickCount() {
    window.location.assign("/warehouse/opname");
  }

  function handleCashMovementRecorded(result: CashMovementRecorded) {
    if (result.status === "pending_approval") {
      setPosNotice(`Pengajuan ${result.refNo ?? ""} ${currency.format(result.amount)} terkirim — menunggu persetujuan Manajer/Owner.`);
      return;
    }
    setPosNotice(
      `${result.type === "out" ? "Kas keluar" : "Kas masuk"} ${currency.format(result.amount)} tercatat · Ref ${result.refNo ?? "-"} · shift ${result.cashSessionCode}.`,
    );
    void printDocument((width) =>
      buildCashMovementSlipContent(
        {
          type: result.type,
          category: result.category,
          description: result.description,
          amount: result.amount,
          cashSessionCode: result.cashSessionCode,
          createdByName: me.user.name,
          approvedByName: result.approvedByName,
          movementAt: result.movementAt,
          refNo: result.refNo,
          counterparty: result.counterparty,
        },
        {
          width,
          brand: { brandName: settings.brandName, brandTagline: settings.brandTagline, outletName: me.outlet.name, outletCode: me.outlet.code },
          showSignature: settings.receiptShowSignature,
        },
      ),
    ).catch(() => undefined);
  }

  function handleProductTap(item: MenuItem) {
    if (!shiftOpen) {
      setShiftError("Buka shift terlebih dahulu sebelum transaksi.");
      return;
    }

    if (locked) {
      return;
    }

    if (soldOutIds.has(item.id)) {
      setPosNotice(`${item.name} sedang ditandai HABIS.`);
      return;
    }

    setFavoriteCounts((current) => {
      const next = { ...current, [item.id]: (current[item.id] ?? 0) + 1 };
      try {
        window.localStorage.setItem(POS_FAVORITE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Tanpa storage favorit tetap jalan untuk sesi ini.
      }
      return next;
    });

    if (item.variants.length === 1) {
      addItem(item.id, item.variants[0].id);
      return;
    }

    setVariantItem(item);
  }

  function resetPaymentDialog() {
    setPaymentError(null);
    setPaymentResult(null);
    setCompletedReceipt(null);
    setOpenBillSaved(null);
    setPaymentStep("summary");
    setOrderType("dine-in");
    setSelectedTableNumber("");
    setPosCustomerMode("guest");
    setGuestName("");
    setGuestPhone("");
    setSelectedMember(null);
    setMemberPhone("");
    setMemberError(null);
    setMemberCreatedPin(null);
    setPosVoucherCode("");
    setPosVoucherResult(null);
    setManualDiscount(null);
    setSelectedPaymentMethod("Cash");
    setPaymentProvider(defaultPaymentProvider("Cash"));
    setPaymentReference("");
    setCashReceived(totalDue ? String(totalDue) : "");
  }

  function selectPaymentMethod(method: PaymentMethod) {
    setSelectedPaymentMethod(method);
    setPaymentProvider(defaultPaymentProvider(method));
    setPaymentReference("");
    setPaymentError(null);

    if (method === "Cash") {
      setCashReceived(totalDue ? String(totalDue) : "");
    }
  }

  function startNewTransaction() {
    setPaymentOpen(false);
    setPaymentResult(null);
    setCompletedReceipt(null);
    setOpenBillSaved(null);
    setPaymentStep("summary");
    setCart([]);
    setOrderType("dine-in");
    setSelectedTableNumber("");
    setPosCustomerMode("guest");
    setGuestName("");
    setGuestPhone("");
    setSelectedMember(null);
    setMemberPhone("");
    setMemberError(null);
    setMemberCreatedPin(null);
    setManualDiscount(null);
    setSelectedPaymentMethod("Cash");
    setPaymentProvider(defaultPaymentProvider("Cash"));
    setPaymentReference("");
    setCashReceived("");
  }

  function prepareShiftDialog() {
    setShiftError(null);
    setShiftSignOffRequired(false);
    setCloseFormKey((value) => value + 1);
    setOpeningShiftNumber(shiftOpen ? 2 : 1);
    setOpenShiftManagerPin("");
    setShiftDialogOpen(true);
  }

  function parseCashAmount(value: string, label: string, options: { required?: boolean } = {}) {
    if (options.required && value.trim() === "") {
      setShiftError(`${label} wajib diisi.`);
      return null;
    }

    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      setShiftError(`${label} harus angka positif.`);
      return null;
    }

    return Math.round(amount);
  }

  function parseOpeningCashAmount() {
    const amount = parseCashAmount(openingCash, "Uang modal awal", { required: true });
    if (amount === null) {
      return null;
    }
    if (amount < 50000 || amount > 500000 || amount % 50000 !== 0) {
      setShiftError("Uang modal awal pilih Rp 50.000 sampai Rp 500.000, kelipatan Rp 50.000.");
      return null;
    }

    return amount;
  }

  async function openShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const openingCashValue = parseOpeningCashAmount();
    if (openingCashValue === null) {
      return;
    }

    const opening = denominationTotals(openingCounts);
    if (opening.anyCounted && opening.total !== openingCashValue) {
      setShiftError(
        `Hitungan pecahan ${currency.format(opening.total)} belum sama dengan modal awal ${currency.format(openingCashValue)}. Hitung ulang atau kosongkan hitungan.`,
      );
      return;
    }

    setShiftPending(true);
    setShiftError(null);
    try {
      await garageApi.post<CashSession>("/api/finance/cash-sessions", {
        openingCash: openingCashValue,
        shiftNumber: openingShiftNumber,
        ...(openShiftManagerPin ? { managerPin: openShiftManagerPin } : {}),
        ...(opening.anyCounted ? { openingDenominations: opening.parsed } : {}),
      });
      setOpeningCounts({});
      await onCashSessionOpened();
      setShiftDialogOpen(false);
      setLastShiftCloseResult(null);
      setOpenShiftManagerPin("");
    } catch (error) {
      setShiftError(error instanceof Error ? error.message : "Mulai shift gagal.");
      // Status Shift 1/2 bisa berubah (kasir lain baru buka/tutup) → muat ulang.
      setShiftStatusRefresh((value) => value + 1);
    } finally {
      setShiftPending(false);
    }
  }

  // Shift sendiri masih terbuka (mis. dibuka di tablet lain): muat ulang data POS
  // agar shift itu dipakai lagi, tanpa membuka shift baru.
  async function resumeOwnShift() {
    setShiftError(null);
    await onCashSessionOpened();
    setShiftDialogOpen(false);
  }

  async function closeShift(payload: CloseShiftPayload) {
    setShiftPending(true);
    setShiftError(null);
    try {
      const closedSession = await garageApi.patch<CashSession>(
        `/api/finance/cash-sessions/${cashSession.id}/close`,
        payload,
      );
      await onCashSessionOpened();
      setShiftDialogOpen(false);
      setShiftSignOffRequired(false);
      setLastShiftCloseResult({
        code: closedSession.code,
        discrepancy: closedSession.discrepancy,
        expectedCash: closedSession.expectedCash,
        actualCash: closedSession.actualCash ?? payload.actualCash,
        resetTableCount: closedSession.resetTables?.requested
          ? closedSession.resetTables.count
          : null,
        qrisRecorded: closedSession.qrisRecorded ?? null,
        qrisDiscrepancy: closedSession.qrisDiscrepancy ?? null,
        floatLeft: closedSession.floatLeft ?? null,
        depositAmount: closedSession.depositAmount ?? null,
        sessionId: closedSession.id,
      });
      // Voice notification: bunyi kalau ada selisih kas (lebih atau kurang
      // dari expected) sehingga Manager langsung tahu untuk verifikasi.
      if (closedSession.discrepancy !== 0) {
        void voice.announce("cash_anomaly", {
          dedupKey: `cash-anomaly-${closedSession.id}`,
        });
      }
    } catch (error) {
      if (error instanceof GarageApiError && error.code === "MANAGER_SIGNOFF_REQUIRED") {
        setShiftSignOffRequired(true);
      }
      setShiftError(error instanceof Error ? error.message : "Tutup shift gagal.");
    } finally {
      setShiftPending(false);
    }
  }

  async function requestPosFullscreen() {
    setPosNotice(null);
    setFullscreenError(null);
    setFullscreenGuardActive(true);

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(true);
      setFullscreenStarted(true);
    } catch {
      setFullscreenError("Layar penuh tidak tersedia di perangkat/browser ini.");
      setPosNotice("Layar penuh tidak tersedia di perangkat/browser ini.");
    }
  }

  async function releasePosFullscreenGuard(options: { exitFullscreen?: boolean } = {}) {
    setFullscreenGuardActive(false);
    setFullscreenError(null);

    if (!options.exitFullscreen || !document.fullscreenElement) {
      return;
    }

    try {
      await document.exitFullscreen();
    } catch {
      // Leaving POS must not be blocked by browser fullscreen limitations.
    }
  }

  async function exitPosToDashboard() {
    await releasePosFullscreenGuard({ exitFullscreen: true });
    onExit();
  }

  async function signOutFromPos() {
    await releasePosFullscreenGuard({ exitFullscreen: true });
    await Promise.resolve(onSignOut());
  }

  async function unlockCashier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLockError(null);

    if (!unlockPassword.trim()) {
      setLockError("Masukkan password akun Anda.");
      return;
    }

    try {
      await garageApi.post<{ status: boolean }>("/api/pos/unlock", {
        password: unlockPassword,
      });
      setUnlockPassword("");
      setLocked(false);
    } catch (error) {
      setLockError(error instanceof Error ? error.message : "Password akun tidak cocok.");
    }
  }

  async function signOutFromLockedPos() {
    setLockError(null);
    await signOutFromPos();
  }

  // Cetak chit dapur/bar (tanpa harga) ke printer kasir saat kasir konfirmasi
  // order. Gated oleh setting kitchenChitAutoPrint (default mati). Kegagalan
  // cetak chit TIDAK boleh mengganggu alur order — cukup diam-diam dilewati.
  async function printChitIfEnabled(input: {
    orderNo?: string | null;
    queueNo?: number | null;
    tableLabel?: string | null;
    orderType?: string | null;
    createdAt?: string | null;
    cashierName?: string | null;
    waiterName?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    deliveryAddress?: string | null;
    items: KitchenChitItem[];
    // force = cetak walau auto-print mati (mis. tombol "cetak ulang chit").
    force?: boolean;
  }) {
    if ((!settings.kitchenChitAutoPrint && !input.force) || input.items.length === 0) return;
    try {
      await printKitchenChit({
        chit: input,
        printerName: settings.defaultPrinterName || undefined,
      });
    } catch {
      /* chit gagal cetak — abaikan, jangan ganggu order */
    }
  }

  // Cetak ulang chit dapur/bar untuk satu bill meja (aksi cepat di dialog detail).
  // Station diturunkan dari nama item (TableOrderItemLine tak punya station).
  function reprintTableBillChit(bill: TableOrderBill, tableLabel: string) {
    void printChitIfEnabled({
      orderNo: bill.orderNo,
      tableLabel,
      orderType: "qr_table",
      createdAt: bill.createdAt,
      customerName: bill.customerName,
      force: true,
      items: bill.items.map((item) => ({
        name: item.itemName,
        variant: item.variantLabel,
        qty: item.qty,
        note: item.note ?? null,
        station: stationByItemName.get(item.itemName.trim().toLowerCase()) ?? "Dapur",
      })),
    });
    setPosNotice(`Chit ${bill.orderNo} dicetak ulang.`);
  }

  // Cetak bill sementara (belum dibayar) untuk satu bill meja. Data totals
  // diambil dari server (/api/orders/{id}/receipt) supaya service/tax akurat,
  // lalu dipetakan ke format struk thermal tanpa blok pembayaran.
  async function printProvisionalBill(bill: Pick<TableOrderBill, "id" | "orderNo">) {
    if (provisionalBillBusyId) return;
    setProvisionalBillBusyId(bill.id);
    try {
      const data = await garageApi.get<{
        order: {
          orderNo: string;
          invoiceNo: string | null;
          createdAt: string;
          subtotal: number;
          service: number;
          tax: number;
          discount: number;
          total: number;
          tableLabel: string | null;
          customerName: string | null;
          paymentStatus: PaymentStatus;
          paidAmount: number;
        };
        outlet: { code: string; name: string } | null;
        cashier: { name: string } | null;
        items: Array<{
          itemName: string;
          variantLabel: string;
          unitPrice: number;
          qty: number;
          lineTotal: number;
        }>;
      }>(`/api/orders/${bill.id}/receipt`, { cache: "no-store" });
      const res = await printThermal({
        receipt: {
          provisional: true,
          paymentStatus: data.order.paymentStatus === "paid" ? "pending" : data.order.paymentStatus,
          paidAmount: data.order.paidAmount,
          tableLabel: data.order.tableLabel,
          customer: { name: data.order.customerName },
          invoiceNo: data.order.invoiceNo,
          orderNo: data.order.orderNo,
          createdAt: data.order.createdAt,
          outlet: data.outlet,
          cashier: data.cashier,
          items: data.items,
          subtotal: data.order.subtotal,
          service: data.order.service,
          tax: data.order.tax,
          discount: data.order.discount,
          total: data.order.total,
          settings: {
            serviceChargePct: settings.serviceChargePct,
            taxPct: settings.taxPct,
            brandName: settings.brandName,
            brandTagline: settings.brandTagline,
            outletAddress: settings.outletAddress,
            outletPhone: settings.outletPhone,
            npwp: settings.npwp,
            receiptFooter: settings.receiptFooter,
          },
        },
        printerName: settings.defaultPrinterName || undefined,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
          message?: string;
        };
        setPosNotice(
          `Bill sementara gagal dicetak: ${body.error?.message || body.message || "cek printer."}`,
        );
        return;
      }
      setPosNotice(`Bill sementara ${bill.orderNo} dicetak.`);
    } catch (error) {
      setPosNotice(
        error instanceof Error
          ? `Bill sementara gagal: ${error.message}`
          : "Bill sementara gagal dicetak.",
      );
    } finally {
      setProvisionalBillBusyId(null);
    }
  }


  // "Bayar nanti" (owner, Okt 2026): pesanan langsung ke Bar/Dapur, tagihan
  // tetap terbuka dan dilunasi lewat Final Bayar. Wajib meja (dine-in) atau
  // nama pelanggan (take away). Voucher/poin/diskon manual dipakai saat Final Bayar.
  async function submitOpenBill() {
    if (paymentPending || !cartLines.length) return;
    const openBillName =
      posCustomerMode === "member" ? (selectedMember?.member.name ?? "") : guestName.trim();
    if (orderType === "delivery") {
      setPaymentError("Bayar nanti hanya untuk dine-in atau take away.");
      return;
    }
    if (orderType === "dine-in" && !selectedTableNumber) {
      setPaymentError("Bayar nanti dine-in wajib pilih nomor meja.");
      return;
    }
    if (orderType === "takeaway" && !openBillName) {
      setPaymentError("Bayar nanti take away wajib isi nama pelanggan.");
      return;
    }
    setPaymentPending(true);
    setPaymentError(null);
    setPaymentResult(null);
    setCompletedReceipt(null);
    const body = {
      orderType,
      tableLabel: orderType === "dine-in" ? tableLabel : undefined,
      customerName: openBillName || undefined,
      items: cart.map((line) => ({
        itemId: line.itemId,
        variantId: line.variantId,
        qty: line.qty,
        note: line.note || undefined,
      })),
    };
    const attempt = idempotencyAttemptFor(orderAttemptRef.current, body, makeIdempotencyKey);
    orderAttemptRef.current = attempt;
    try {
      const result = await garageApi.post<OpenBillSaved>("/api/orders/open-bill", body, {
        headers: { "X-Idempotency-Key": attempt.key },
      });
      orderAttemptRef.current = null;
      // Bill buatan kasir sendiri bukan "order QR baru" → tanpa suara/toast.
      previousCustomerOrderIdsRef.current.add(result.orderId);
      setOpenBillSaved({ ...result, customerName: openBillName || null });
      void printChitIfEnabled({
        orderNo: result.orderNo,
        queueNo: null,
        tableLabel: result.tableLabel ?? openBillName,
        orderType,
        createdAt: new Date().toISOString(),
        cashierName: null,
        customerName: openBillName || null,
        items: cartLines.map((line) => ({
          name: line.item.name,
          variant: line.variant.label,
          qty: line.qty,
          note: line.note ?? null,
          station: chitStationFor(line.item),
        })),
      });
      setPaymentStep("done");
      setCart([]);
      setSelectedTableNumber("");
      setSelectedMember(null);
      setMemberPhone("");
      setGuestName("");
      setGuestPhone("");
      setPosCustomerMode("guest");
      setPosVoucherCode("");
      setPosVoucherResult(null);
      setManualDiscount(null);
      setPosNotice(`Tagihan ${result.orderNo} disimpan. Lunasi lewat Final Bayar.`);
      await onOrderCreated();
      await loadTableLiveData({ silent: true });
      invalidateGarageCache([GARAGE_TAGS.orders, GARAGE_TAGS.kitchen, GARAGE_TAGS.dashboard]);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Tagihan gagal disimpan.");
    } finally {
      setPaymentPending(false);
    }
  }

  // Paket Event (owner, Okt 2026): tagihan disimpan lewat open-bill, lalu langsung Final Bayar.
  async function handleEventBundleSaved(saved: PosBundleSaved, includedCart: boolean) {
    previousCustomerOrderIdsRef.current.add(saved.orderId);
    const cartChit = includedCart
      ? cartLines.map((line) => ({ name: line.item.name, variant: line.variant.label, qty: line.qty, note: line.note ?? null, station: chitStationFor(line.item) }))
      : [];
    if (includedCart) setCart([]);
    void printChitIfEnabled({
      orderNo: saved.orderNo,
      queueNo: null,
      tableLabel: saved.tableLabel ?? saved.customerName,
      orderType: saved.tableLabel ? "dine-in" : "takeaway",
      createdAt: new Date().toISOString(),
      cashierName: null,
      customerName: saved.customerName,
      items: [
        ...saved.chitLines.map((line) => {
          const item = menuItemsById.get(line.itemId);
          return { name: line.name, variant: line.variant, qty: line.qty, note: `Paket: ${line.packageName}`, station: item ? chitStationFor(item) : ("Langsung" as const) };
        }),
        ...cartChit,
      ],
    });
    setPosNotice(`Paket ${saved.orderNo} disimpan & masuk Bar/Dapur. Selesaikan di Final Bayar.`);
    await onOrderCreated();
    invalidateGarageCache([GARAGE_TAGS.orders, GARAGE_TAGS.kitchen, GARAGE_TAGS.dashboard]);
    await payTableBill({ id: saved.orderId, orderNo: saved.orderNo });
  }

  // Aksi cepat: siapkan bill → order aktif meja jadi "menunggu bayar".
  // Reuse endpoint minta-bill waiter (resolve order aktif di server).
  async function requestTableBill() {
    if (!tableDetail || tableActionBusy) return;
    const target = tableDetail;
    setTableActionBusy("bill");
    try {
      await garageApi.post(`/api/waiter/tables/${target.tableNumber}/bill`, {});
      setPosNotice(`${target.tableLabel} ditandai menunggu pembayaran.`);
      await loadTableLiveData({ silent: true });
      openTableDetail(target);
    } catch (error) {
      setPosNotice(
        error instanceof Error ? `Siapkan bill gagal: ${error.message}` : "Siapkan bill gagal.",
      );
    } finally {
      setTableActionBusy(null);
    }
  }

  // Penjualan Langsung (POS-05): order sudah lunas di server; segarkan riwayat & view lain.
  async function handleQuickRetailCompleted(result: OrderCreateResponse) {
    setReceiptHistory((current) => [result.receipt, ...current].slice(0, settings.receiptHistoryMax));
    await onOrderCreated();
    invalidateGarageCache([
      GARAGE_TAGS.orders,
      GARAGE_TAGS.finance,
      GARAGE_TAGS.inventory,
      GARAGE_TAGS.dashboard,
    ]);
  }

  // overrides: "Bayar 1 tap" (take away uang pas) tanpa melewati langkah wizard.
  async function submitOrder(
    paymentMethod: PaymentMethod,
    overrides: { orderType?: OrderType; cashReceived?: number } = {},
  ) {
    const effectiveOrderType = overrides.orderType ?? orderType;
    const effectiveCash = overrides.cashReceived ?? cashReceivedValue;
    if (effectiveOrderType === "dine-in" && !selectedTableNumber) {
      setPaymentError("Pilih nomor meja sebelum konfirmasi bayar.");
      return;
    }

    if (paymentMethod === "Cash" && effectiveCash < totalDue) {
      setPaymentError("Uang diterima belum cukup untuk pembayaran cash.");
      return;
    }

    if (manualDiscount?.approvalStatus === "pending") {
      setPaymentError("Diskon manual masih menunggu persetujuan Manajer.");
      return;
    }

    if (paymentMethod === "QRIS" && !qrisImageReady) {
      setPaymentError("QRIS resmi belum dikonfigurasi.");
      return;
    }

    setPaymentPending(true);
    setPaymentError(null);
    setPaymentResult(null);
    setCompletedReceipt(null);
    setOpenBillSaved(null);

    const orderBody = {
      orderType: effectiveOrderType,
      tableNumber: effectiveOrderType === "dine-in" ? selectedTableNumber : undefined,
      tableLabel:
        effectiveOrderType === orderType
          ? tableLabel
          : effectiveOrderType === "takeaway"
            ? "Take away"
            : "Delivery",
      paymentMethod,
      paymentProvider:
        (overrides.orderType ? defaultPaymentProvider(paymentMethod) : paymentProviderValue) || undefined,
      paymentReference: paymentReference.trim() || undefined,
      cashReceived: paymentMethod === "Cash" ? effectiveCash : undefined,
      customerId: posCustomerMode === "member" ? selectedMember?.customerId : undefined,
      memberPhone: posCustomerMode === "member" ? selectedMember?.member.phone : undefined,
      guestName: posCustomerMode === "guest" ? guestName.trim() || undefined : undefined,
      guestPhone: posCustomerMode === "guest" ? guestPhone.trim() || undefined : undefined,
      voucherCode: posVoucherResult?.valid ? posVoucherResult.code : undefined,
      pointsToRedeem: posCustomerMode === "member" && pointsToUse > 0 ? pointsToUse : undefined,
      memberRedeemToken:
        posCustomerMode === "member" && pointsToUse > 0 && memberQrVerified ? memberRedeemAuth?.token : undefined,
      manualDiscount: manualDiscount
        ? {
            approvalId: manualDiscount.approvalId,
            type: manualDiscount.type,
            rawValue: manualDiscount.rawValue,
            amount: manualDiscountAmount,
            reason: manualDiscount.reason,
          }
        : undefined,
      items: cart,
    };
    // Anti double-submit: key dipakai ulang selama isi order sama, jadi retry
    // setelah respons hilang mengembalikan order yang sudah tersimpan.
    const attempt = idempotencyAttemptFor(orderAttemptRef.current, orderBody, makeIdempotencyKey);
    orderAttemptRef.current = attempt;

    try {
      const result = await garageApi.post<OrderCreateResponse>("/api/orders", orderBody, {
        headers: { "X-Idempotency-Key": attempt.key },
      });
      orderAttemptRef.current = null;

      const kdsTicketLabel =
        result.ticketNos.length > 1 ? result.ticketNos.join(", ") : result.ticketNo;
      setPaymentResult(
        `${result.orderNo} paid. KDS ticket ${kdsTicketLabel} dibuat.`,
      );
      // Voice announcement gaya bandara: "Pesanan baru atas nama X, meja Y. Sedang diproses kasir."
      // Dedup pakai orderNo supaya gak double-play kalau effect re-run.
      const voiceCustomerName =
        posCustomerMode === "member"
          ? (selectedMember?.member.name ?? null)
          : guestName.trim() || null;
      const voiceTable =
        orderType === "dine-in"
          ? selectedTableNumber || tableLabel
          : orderType === "takeaway"
            ? "takeaway"
            : tableLabel;
      // Smart-split voice: deteksi kategori cart, fire heads-up cuma ke
      // station yang akan dapet tiket (Dapur: Makanan/Cemilan; Bar: Coffee/Non-Coffee).
      let hasKitchenItem = false;
      let hasBarItem = false;
      for (const line of cart) {
        const item = menuItemsById.get(line.itemId);
        if (!item) continue;
        // Sama dengan routing tiket server: override station di master produk, lalu kategori.
        if (isDirectHandoverMenu(item)) continue;
        if (productionStationFor(item) === "Bar") hasBarItem = true;
        else hasKitchenItem = true;
        if (hasKitchenItem && hasBarItem) break;
      }
      if (hasKitchenItem) {
        void voice.announce("order_new_kitchen", {
          customerName: voiceCustomerName,
          table: voiceTable,
          orderNo: result.orderNo,
          dedupKey: `${result.orderNo}-kitchen`,
        });
      }
      if (hasBarItem) {
        void voice.announce("order_new_bar", {
          customerName: voiceCustomerName,
          table: voiceTable,
          orderNo: result.orderNo,
          dedupKey: `${result.orderNo}-bar`,
        });
      }
      setCompletedReceipt(result.receipt);
      setReceiptHistory((current) =>
        [result.receipt, ...current].slice(0, settings.receiptHistoryMax),
      );
      // Chit dapur/bar dari cart saat ini (sebelum cart dikosongkan).
      void printChitIfEnabled({
        orderNo: result.orderNo,
        queueNo: result.receipt.queueNo ?? null,
        tableLabel: result.receipt.tableLabel ?? tableLabel,
        orderType,
        createdAt: result.receipt.createdAt ?? new Date().toISOString(),
        cashierName: result.receipt.cashier?.name ?? null,
        customerName: result.receipt.customer?.name ?? null,
        items: cartLines.map((line) => ({
          name: line.item.name,
          variant: line.variant.label,
          qty: line.qty,
          note: line.note ?? null,
          station: chitStationFor(line.item),
        })),
      });
      setPaymentStep("done");
      setCart([]);
      setSelectedTableNumber("");
      setSelectedMember(null);
      setMemberPhone("");
      setGuestName("");
      setGuestPhone("");
      setPosCustomerMode("guest");
      setMemberCreatedPin(null);
      setPosVoucherCode("");
      setPosVoucherResult(null);
      setManualDiscount(null);
      await onOrderCreated();
      await loadTableLiveData({ silent: true });
      // Order baru mengubah orders/finance/kitchen/inventory/dashboard — beri tahu
      // view lain (Sales History, Dashboard, dst) agar refetch otomatis.
      invalidateGarageCache([
        GARAGE_TAGS.orders,
        GARAGE_TAGS.finance,
        GARAGE_TAGS.kitchen,
        GARAGE_TAGS.inventory,
        GARAGE_TAGS.dashboard,
        GARAGE_TAGS.customers,
      ]);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Pembayaran gagal.");
    } finally {
      setPaymentPending(false);
    }
  }

  if (!posVisible) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center p-3">
        <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Mulai Shift Kasir</DialogTitle>
              <DialogDescription>
                Pilih shift dan isi uang modal awal.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(event) => void openShift(event)} className="space-y-4">
              <ShiftStartStatus
                onShiftNumber={setOpeningShiftNumber}
                onSuggestOpeningCash={(amount) => setOpeningCash(String(amount))}
                managerPin={openShiftManagerPin}
                onManagerPinChange={setOpenShiftManagerPin}
                onResume={resumeOwnShift}
                refreshKey={shiftStatusRefresh}
              />
              <OpeningCashPresetPicker value={openingCash} onChange={setOpeningCash} />
              <OpeningDenominationCount
                counts={openingCounts}
                onChange={setOpeningCounts}
                openingCash={Number(openingCash) || null}
              />
              {shiftError && (
                <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Mulai shift gagal</AlertTitle>
                  <AlertDescription>{shiftError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="garage-press h-11 w-full" disabled={shiftPending}>
                {shiftPending ? "Menyimpan..." : "Mulai Shift & Buka POS"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <div className="garage-panel garage-animate-in w-full max-w-xl rounded-md p-5">
          <div className="flex items-start gap-3">
            <div className="garage-shift-closed flex size-10 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/18 text-[#ffe1e5]">
              <ShieldAlert className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#ffc2c8]">
                POS terkunci sampai shift dimulai
              </p>
              <h1 className="garage-display garage-chrome mt-1 text-2xl">
                Shift Belum Dibuka
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#d6d6dc]">
                Mulai shift dulu agar semua transaksi tercatat ke kasir, outlet, dan laporan
                closing yang benar.
              </p>
            </div>
          </div>
          {lastShiftCloseResult && (
            <div
              role="status"
              className={`mt-4 rounded-md border p-3 text-sm ${
                lastShiftCloseResult.discrepancy === 0
                  ? "border-[#4a4a54] bg-white/[0.06] text-[#f4f4f5]"
                  : "border-[#f5a742]/55 bg-[#f5a742]/12 text-[#ffe0ad]"
              }`}
            >
              <p className="font-semibold text-white">
                Shift {lastShiftCloseResult.code} ditutup
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-[#b8b8bf]">Kas seharusnya</dt>
                  <dd className="font-semibold text-white">
                    {currency.format(lastShiftCloseResult.expectedCash)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#b8b8bf]">Dihitung</dt>
                  <dd className="font-semibold text-white">
                    {currency.format(lastShiftCloseResult.actualCash)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#b8b8bf]">
                    {lastShiftCloseResult.discrepancy > 0
                      ? "Selisih (lebih)"
                      : lastShiftCloseResult.discrepancy < 0
                        ? "Selisih (kurang)"
                        : "Selisih"}
                  </dt>
                  <dd
                    className={`font-bold ${
                      lastShiftCloseResult.discrepancy === 0
                        ? "text-white"
                        : lastShiftCloseResult.discrepancy > 0
                          ? "text-[#ffd08a]"
                          : "text-[#ff8a95]"
                    }`}
                  >
                    {lastShiftCloseResult.discrepancy === 0
                      ? "Sesuai"
                      : `${lastShiftCloseResult.discrepancy > 0 ? "+" : "-"}${currency.format(Math.abs(lastShiftCloseResult.discrepancy))}`}
                  </dd>
                </div>
              </dl>
              {lastShiftCloseResult.resetTableCount !== null && (
                <p className="mt-2 text-xs text-[#d6d6dc]">
                  {lastShiftCloseResult.resetTableCount} meja direset ke kosong.
                </p>
              )}
              {lastShiftCloseResult.depositAmount !== null ? (
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-[#b8b8bf]">Ditinggal di laci</dt>
                    <dd className="font-semibold text-white">
                      {currency.format(lastShiftCloseResult.floatLeft ?? 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#b8b8bf]">Untuk disetor ke rekening</dt>
                    <dd className="font-semibold text-[#ffd08a]">
                      {currency.format(lastShiftCloseResult.depositAmount)}
                    </dd>
                  </div>
                </dl>
              ) : null}
              {lastShiftCloseResult.sessionId ? (
                <a
                  href={`/api/finance/cash-sessions/${lastShiftCloseResult.sessionId}/report`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-[#4a4a54] bg-white/[0.06] px-3 text-xs font-semibold text-white hover:bg-white/10"
                >
                  <Printer className="size-3.5" /> Laporan PDF
                </a>
              ) : null}
              {lastShiftCloseResult.sessionId ? (
                <button
                  type="button"
                  disabled={shiftSlipStatus?.pending === true}
                  onClick={() => {
                    const sessionId = lastShiftCloseResult.sessionId;
                    if (!sessionId) return;
                    setShiftSlipStatus({ pending: true, message: null, ok: true });
                    void printShiftSlip(
                      sessionId,
                      {
                        brand: { brandName: settings.brandName, brandTagline: settings.brandTagline, outletName: me.outlet.name, outletCode: me.outlet.code },
                        showSignature: settings.receiptShowSignature,
                        copies: settings.managementSlipCopies,
                        printedBy: me.user.name,
                      },
                      {
                        floatLeft: lastShiftCloseResult.floatLeft,
                        depositAmount: lastShiftCloseResult.depositAmount,
                      },
                    ).then((result) => setShiftSlipStatus({ pending: false, message: result.message, ok: result.ok }));
                  }}
                  className="garage-press ml-2 mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-[#f5a742]/50 bg-[#f5a742]/12 px-3 text-xs font-semibold text-[#ffd08a] hover:bg-[#f5a742]/20 disabled:opacity-60"
                >
                  <Printer className="size-3.5" />
                  {shiftSlipStatus?.pending ? "Mencetak..." : "Cetak slip (printer struk)"}
                </button>
              ) : null}
              {shiftSlipStatus?.message ? (
                <p
                  role={shiftSlipStatus.ok ? "status" : "alert"}
                  className={`mt-2 text-xs ${shiftSlipStatus.ok ? "text-[#ffe0ad]" : "text-[#ff9aa2]"}`}
                >
                  {shiftSlipStatus.message}
                </p>
              ) : null}
              {lastShiftCloseResult.qrisRecorded ? (
                <p className="mt-2 text-xs text-[#d6d6dc]">
                  QRIS tercatat {currency.format(lastShiftCloseResult.qrisRecorded)}
                  {lastShiftCloseResult.qrisDiscrepancy === null
                    ? " · belum dicocokkan dengan BNI (Owner/Manajer cocokkan di Rekap Harian)."
                    : lastShiftCloseResult.qrisDiscrepancy === 0
                      ? " · cocok dengan BNI."
                      : ` · selisih QRIS ${lastShiftCloseResult.qrisDiscrepancy > 0 ? "+" : "-"}${currency.format(Math.abs(lastShiftCloseResult.qrisDiscrepancy))} (dicatat terpisah dari laci).`}
                </p>
              ) : null}
            </div>
          )}
          <Button
            type="button"
            className="garage-press mt-5 h-11 w-full"
            onClick={prepareShiftDialog}
          >
            Mulai Shift Kasir
          </Button>
          {me.role === "Owner" ? (
            <Button
              type="button"
              variant="outline"
              data-testid="pos-owner-view"
              className="garage-press mt-2 h-11 w-full border-[#4a4a54] bg-white/[0.06]"
              onClick={() => setOwnerViewing(true)}
            >
              Lihat POS tanpa shift (mode pantau Owner)
            </Button>
          ) : null}
          {/* Absen kelas satu: bisa clock-in tanpa harus buka shift dulu (NAV_ACTION_AUDIT §1.3). */}
          {canAccessModule(me.role, "absensi-v2") && (
            <Button
              type="button"
              variant="outline"
              className="garage-press mt-2 h-11 w-full gap-2 border-[#f5a742]/55 bg-[#f5a742]/12 text-[#ffd08a] hover:bg-[#f5a742]/20"
              onClick={() => window.location.assign("/absen")}
              aria-label="Absen kehadiran"
            >
              <Fingerprint className="size-4" />
              Absen Kehadiran
            </Button>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
              onClick={() => void exitPosToDashboard()}
            >
              <BarChart3 className="mr-2 size-4" />
              Dashboard
            </Button>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#d11a2a]/55 bg-[#d11a2a]/14 text-[#ffe1e5] hover:bg-[#d11a2a]/22"
              disabled={signOutPending}
              onClick={() => void signOutFromPos()}
            >
              <LogOut className="mr-2 size-4" />
              {signOutPending ? "Keluar..." : "Keluar"}
            </Button>
          </div>
          {signOutError && (
            <Alert className="mt-3 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Keluar gagal</AlertTitle>
              <AlertDescription>{signOutError}</AlertDescription>
            </Alert>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      data-cashier-theme={isCashierKiosk ? cashierTheme : undefined}
      data-pos-text-size={cashierPosSettings.textSize}
      data-pos-card-density={cashierPosSettings.cardDensity}
      data-pos-bill-layout={cashierPosSettings.billLayout}
      className={`cashier-pos-surface relative flex h-full min-h-0 flex-col gap-2 pb-0 ${
        isCashierKiosk ? "xl:pl-[292px]" : ""
      }`}
    >
      <PosChatInbox
        open={chatOpen}
        onOpenChange={setChatOpen}
        onUnread={setChatUnread}
        onOpenOrder={(orderId) => {
          setChatOpen(false);
          setQrOrdersOpen(true);
          setSelectedCustomerOrderId(orderId);
        }}
      />
      <VoiceSettingsDialog
        open={voiceDialogOpen}
        onOpenChange={setVoiceDialogOpen}
      />
      <Sheet open={cashierMenuOpen} onOpenChange={setCashierMenuOpen}>
        <SheetContent
          side="left"
          data-cashier-theme-scope={cashierTheme}
          className="garage-scroll garage-side-panel garage-pos-nav-sheet w-[min(90vw,340px)] border-[#34343c] bg-[#0b0b0e] p-4 text-[#f4f4f5]"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Menu Kasir</SheetTitle>
            <SheetDescription>
              {GARAGE_BUSINESS_NAME} - {me.shift} - {me.device}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-[#34343c] bg-white/[0.055] p-3">
              <div className="flex items-center gap-3">
                <span className="garage-mono flex size-10 shrink-0 items-center justify-center rounded-full border border-[#f5a742]/35 bg-[#f5a742]/12 text-sm font-semibold text-[#ffd08a]">
                  {profileInitials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {me.user.name}
                  </p>
                  <p className="truncate text-xs text-[#b8b8bf]">
                    {me.role} - {me.device}
                  </p>
                </div>
              </div>
            </div>
            {/* Navigasi modul di dalam SATU menu kasir — tanpa sidebar kedua
                (NAV_ACTION_AUDIT §1.4). */}
            {onNavigateModule && navModules.length > 0 && (
              <div className="rounded-md border border-[#34343c] bg-white/[0.03] p-2">
                <p className="garage-mono px-1 pb-1.5 pt-1 text-[10px] uppercase tracking-[0.14em] text-[#8a8a92]">
                  Navigasi Modul
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {navModules.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setCashierMenuOpen(false);
                          onNavigateModule(m.id);
                        }}
                        className="garage-press flex h-10 items-center gap-2 rounded-md border border-[#34343c] bg-white/[0.04] px-2.5 text-left text-xs font-semibold text-[#d4d4d8] transition-colors hover:border-[#d11a2a]/55 hover:bg-white/[0.08] hover:text-white"
                      >
                        <Icon className="size-3.5 shrink-0 text-[#d11a2a]" />
                        <span className="truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#22c55e]/45 bg-[#22c55e]/12 px-3 text-sm text-[#dcfce7]"
                onClick={() => setCashierMenuOpen(false)}
              >
                <ShoppingCart className="size-4" />
                Jual / Kasir
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`garage-press h-11 justify-start gap-2 px-3 text-sm ${
                  shiftOpen
                    ? "garage-shift-open border-[#22c55e]/55 bg-[#22c55e]/16 text-[#dcfce7] hover:bg-[#22c55e]/22"
                    : "garage-shift-closed border-[#d11a2a]/70 bg-[#d11a2a]/20 text-[#ffe1e5] hover:bg-[#d11a2a]/28"
                }`}
                onClick={() => {
                  setCashierMenuOpen(false);
                  prepareShiftDialog();
                }}
              >
                {shiftOpen ? (
                  <ShieldCheck className="size-4" />
                ) : (
                  <ShieldAlert className="size-4" />
                )}
                {shiftOpen ? "Shift Aktif / Tutup Shift" : "Mulai Shift"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-between border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => {
                  setCashierMenuOpen(false);
                  setQrOperationsOpen(true);
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Bell className="size-4" />
                  QR Order
                </span>
                <Badge className={`${waitingCustomerOrderCount ? statusClass.pending_cashier : statusClass.info} px-2 text-[10px]`}>
                  {waitingCustomerOrderCount}
                </Badge>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => {
                  setCashierMenuOpen(false);
                  setCashierToolOpen("contacts");
                }}
              >
                <Users className="size-4" />
                Kontak / Member
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => {
                  setCashierMenuOpen(false);
                  setCashierToolOpen("reports");
                }}
              >
                <BarChart3 className="size-4" />
                Laporan Shift
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#f5a742]/45 bg-[#f5a742]/12 px-3 text-sm text-[#ffd08a] hover:bg-[#f5a742]/20"
                onClick={() => {
                  setCashierMenuOpen(false);
                  window.open("/shift", "_blank");
                }}
              >
                <FileText className="size-4" />
                Riwayat & Laporan PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#f5a742]/45 bg-[#f5a742]/12 px-3 text-sm text-[#ffd08a] hover:bg-[#f5a742]/20"
                onClick={() => {
                  setCashierMenuOpen(false);
                  window.open("/sales-history", "_blank");
                }}
              >
                <ReceiptText className="size-4" />
                Riwayat Penjualan
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-between border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => {
                  setCashierMenuOpen(false);
                  setReceiptHistoryOpen(true);
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <History className="size-4" />
                  Riwayat Struk Shift
                </span>
                <Badge className="border-[#4a4a54] bg-white/[0.08] px-2 text-[10px]">
                  {receiptHistory.length}
                </Badge>
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`garage-press h-11 justify-between px-3 text-sm ${
                  soldOutIds.size > 0
                    ? "border-[#d11a2a]/55 bg-[#d11a2a]/14 text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                    : "border-[#4a4a54] bg-white/[0.055]"
                }`}
                onClick={() => {
                  setCashierMenuOpen(false);
                  setSoldOutDialogOpen(true);
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Ban className="size-4" />
                  Atur Stok Habis
                </span>
                <Badge
                  className={`px-2 text-[10px] ${
                    soldOutIds.size > 0
                      ? "border-[#d11a2a]/55 bg-[#d11a2a]/22 text-[#ffe1e5]"
                      : "border-[#4a4a54] bg-white/[0.08]"
                  }`}
                >
                  {soldOutIds.size}
                </Badge>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => {
                  setCashierMenuOpen(false);
                  openExpenseDialog();
                }}
              >
                <Banknote className="size-4" />
                Kas Keluar / Masuk
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => {
                  setCashierMenuOpen(false);
                  setMemberRegMsg(null);
                  setMemberRegOpen(true);
                }}
              >
                <UserPlus className="size-4" />
                Daftar Member
              </Button>
              {canQuickCount ? (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                  onClick={() => {
                    setCashierMenuOpen(false);
                    openQuickCount();
                  }}
                >
                  <ClipboardCheck className="size-4" />
                  Stok Opname Gudang
                </Button>
              ) : null}
              {canManagePosSettings ? (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                  onClick={() => {
                    setCashierMenuOpen(false);
                    setCashierToolOpen("settings");
                  }}
                >
                  <Settings className="size-4" />
                  Pengaturan POS
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#f5a742]/45 bg-[#f5a742]/12 px-3 text-sm text-[#ffd08a] hover:bg-[#f5a742]/20"
                onClick={() => {
                  setCashierMenuOpen(false);
                  voice.unlock();
                  setVoiceDialogOpen(true);
                }}
              >
                <Mic className="size-4" />
                Pengumuman Suara
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => {
                  setCashierMenuOpen(false);
                  onOpenEarnings();
                }}
              >
                <Wallet className="size-4" />
                Fee Saya
              </Button>
              <Separator className="my-1 bg-[#34343c]" />
              {!isCashierKiosk && (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                  onClick={() => {
                    setCashierMenuOpen(false);
                    void exitPosToDashboard();
                  }}
                >
                  <BarChart3 className="size-4" />
                  Dashboard
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#d11a2a]/55 bg-[#d11a2a]/14 px-3 text-sm text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                disabled={signOutPending}
                onClick={() => {
                  setCashierMenuOpen(false);
                  void signOutFromPos();
                }}
              >
                <LogOut className="size-4" />
                {signOutPending ? "Keluar..." : "Keluar"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {isCashierKiosk ? (
        <aside className="garage-scroll garage-side-panel fixed inset-y-0 left-0 z-40 hidden w-[292px] flex-col overflow-y-auto border-r border-[#34343c] bg-[#0b0b0e] p-4 text-[#f4f4f5] shadow-[18px_0_50px_rgba(0,0,0,0.24)] xl:flex">
          <div className="text-left">
            <h2 className="garage-display garage-chrome text-xl">Menu Kasir</h2>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              {GARAGE_BUSINESS_NAME} - {me.shift} - {me.device}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-[#34343c] bg-white/[0.055] p-3">
              <div className="flex items-center gap-3">
                <span className="garage-mono flex size-10 shrink-0 items-center justify-center rounded-full border border-[#f5a742]/35 bg-[#f5a742]/12 text-sm font-semibold text-[#ffd08a]">
                  {profileInitials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{me.user.name}</p>
                  <p className="truncate text-xs text-[#b8b8bf]">
                    {me.role} - {me.device}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#22c55e]/45 bg-[#22c55e]/12 px-3 text-sm text-[#dcfce7]"
              >
                <ShoppingCart className="size-4" />
                Sell / POS
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`garage-press h-11 justify-start gap-2 px-3 text-sm ${
                  shiftOpen
                    ? "garage-shift-open border-[#22c55e]/55 bg-[#22c55e]/16 text-[#dcfce7] hover:bg-[#22c55e]/22"
                    : "garage-shift-closed border-[#d11a2a]/70 bg-[#d11a2a]/20 text-[#ffe1e5] hover:bg-[#d11a2a]/28"
                }`}
                onClick={prepareShiftDialog}
              >
                {shiftOpen ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
                {shiftOpen ? "Shift Aktif / Tutup Shift" : "Mulai Shift"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-between border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => setQrOperationsOpen(true)}
              >
                <span className="inline-flex items-center gap-2">
                  <Bell className="size-4" />
                  QR Order
                </span>
                <Badge className={`${waitingCustomerOrderCount ? statusClass.pending_cashier : statusClass.info} px-2 text-[10px]`}>
                  {waitingCustomerOrderCount}
                </Badge>
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`garage-press h-11 justify-between px-3 text-sm ${
                  kitchenTickets.length
                    ? "border-[#22c55e]/55 bg-[#22c55e]/16 text-[#dcfce7] hover:bg-[#22c55e]/22"
                    : "border-[#4a4a54] bg-white/[0.055]"
                }`}
                onClick={() => {
                  setKitchenPanelOpen(true);
                  void loadKitchenTickets();
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <UtensilsCrossed className="size-4" />
                  Bar &amp; Dapur
                </span>
                <Badge className="border-[#4a4a54] bg-black/30 px-2 text-[10px]">
                  {kitchenTickets.length}
                </Badge>
              </Button>
              {([
                ["contacts", Users, "Kontak / Member"],
                ["reports", BarChart3, "Laporan Shift"],
                ...(canManagePosSettings
                  ? ([["settings", Settings, "Pengaturan POS"]] as const)
                  : []),
              ] as const).map(([tool, Icon, label]) => (
                <Button
                  key={String(tool)}
                  type="button"
                  variant="outline"
                  className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                  onClick={() => setCashierToolOpen(tool)}
                >
                  <Icon className="size-4" />
                  {label}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#f5a742]/45 bg-[#f5a742]/12 px-3 text-sm text-[#ffd08a] hover:bg-[#f5a742]/20"
                onClick={() => window.open("/sales-history", "_blank")}
              >
                <ReceiptText className="size-4" />
                Riwayat Penjualan
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#f5a742]/45 bg-[#f5a742]/12 px-3 text-sm text-[#ffd08a] hover:bg-[#f5a742]/20"
                onClick={() => window.open("/shift", "_blank")}
              >
                <FileText className="size-4" />
                Riwayat & Laporan Shift
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => window.open("/shift?tab=petty", "_blank")}
                data-testid="pos-menu-petty"
              >
                <Wallet className="size-4" />
                Petty Cash
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => window.open("/shift?tab=incident", "_blank")}
                data-testid="pos-menu-incident"
              >
                <ClipboardList className="size-4" />
                Catatan Kejadian
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-between border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => setReceiptHistoryOpen(true)}
              >
                <span className="inline-flex items-center gap-2">
                  <History className="size-4" />
                  Riwayat Struk Shift
                </span>
                <Badge className="border-[#4a4a54] bg-white/[0.08] px-2 text-[10px]">
                  {receiptHistory.length}
                </Badge>
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`garage-press h-11 justify-between px-3 text-sm ${
                  soldOutIds.size > 0
                    ? "border-[#d11a2a]/55 bg-[#d11a2a]/14 text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                    : "border-[#4a4a54] bg-white/[0.055]"
                }`}
                onClick={() => setSoldOutDialogOpen(true)}
              >
                <span className="inline-flex items-center gap-2">
                  <Ban className="size-4" />
                  Atur Stok Habis
                </span>
                <Badge
                  className={`px-2 text-[10px] ${
                    soldOutIds.size > 0
                      ? "border-[#d11a2a]/55 bg-[#d11a2a]/22 text-[#ffe1e5]"
                      : "border-[#4a4a54] bg-white/[0.08]"
                  }`}
                >
                  {soldOutIds.size}
                </Badge>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => openExpenseDialog()}
              >
                <Banknote className="size-4" />
                Kas Keluar / Masuk
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => {
                  setCashierMenuOpen(false);
                  setMemberRegMsg(null);
                  setMemberRegOpen(true);
                }}
              >
                <UserPlus className="size-4" />
                Daftar Member
              </Button>
              {canQuickCount ? (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                  onClick={() => openQuickCount()}
                >
                  <ClipboardCheck className="size-4" />
                  Stok Opname Gudang
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#f5a742]/45 bg-[#f5a742]/12 px-3 text-sm text-[#ffd08a] hover:bg-[#f5a742]/20"
                onClick={() => {
                  voice.unlock();
                  setVoiceDialogOpen(true);
                }}
              >
                <Mic className="size-4" />
                Pengumuman Suara
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={onOpenEarnings}
              >
                <Wallet className="size-4" />
                Fee Saya
              </Button>
              <Separator className="my-1 bg-[#34343c]" />
              <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="garage-mono text-[10px]">Tema Kasir</p>
                  <Badge className="border-[#f5a742]/35 bg-[#f5a742]/12 px-2 text-[10px] text-[#ffd08a]">
                    Khusus POS
                  </Badge>
                </div>
                <CashierThemePresetGrid
                  value={cashierTheme}
                  onChange={onCashierThemeChange}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                onClick={() => void refreshCashierData()}
                disabled={cashierRefreshing}
              >
                <RefreshCw className={`size-4 ${cashierRefreshing ? "animate-spin" : ""}`} />
                Muat Ulang POS
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#d11a2a]/55 bg-[#d11a2a]/14 px-3 text-sm text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                disabled={signOutPending}
                onClick={() => void signOutFromPos()}
              >
                <LogOut className="size-4" />
                {signOutPending ? "Keluar..." : "Keluar"}
              </Button>
            </div>
          </div>
        </aside>
      ) : null}

      <Dialog
        open={activeCashierToolOpen !== null}
        onOpenChange={(open) => !open && setCashierToolOpen(null)}
      >
        <DialogContent
          data-cashier-theme-scope={cashierTheme}
          className="max-h-[88vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>
              {activeCashierToolOpen === "contacts"
                ? "Kontak / Member"
                : activeCashierToolOpen === "reports"
                  ? "Laporan Shift"
                  : "Pengaturan POS"}
            </DialogTitle>
            <DialogDescription>
              {activeCashierToolOpen === "contacts"
                ? "Member POS."
                : activeCashierToolOpen === "reports"
                  ? "Ringkasan shift."
                  : "Preferensi POS."}
            </DialogDescription>
          </DialogHeader>

          {activeCashierToolOpen === "contacts" && (
            <div className="space-y-3">
              <form
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  void lookupPosMember();
                }}
              >
                <Input
                  value={memberPhone}
                  onChange={(event) => setMemberPhone(event.target.value)}
                  className="h-11 border-[#34343c] bg-white/[0.06]"
                  placeholder="Cari member: 08xxxxxxxxxx"
                />
                <Button type="submit" className="garage-press h-11" disabled={memberLookupLoading}>
                  {memberLookupLoading ? "Mencari..." : "Lookup"}
                </Button>
              </form>
              {memberError && (
                <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Member</AlertTitle>
                  <AlertDescription>{memberError}</AlertDescription>
                </Alert>
              )}
              {selectedMember ? (
                <div className="rounded-md border border-[#22c55e]/45 bg-[#22c55e]/10 p-3">
                  <p className="text-sm font-semibold text-white">{selectedMember.member.name}</p>
                  <p className="mt-1 font-mono text-xs text-[#b8b8bf]">
                    {selectedMember.member.phone} - {selectedMember.member.tier} -{" "}
                    {selectedMember.member.points} poin
                  </p>
                  <PosMemberWaVerify
                    key={selectedMember.customerId}
                    customerId={selectedMember.customerId}
                    name={selectedMember.member.name}
                    phone={selectedMember.member.phone}
                  />
                </div>
              ) : (
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-sm text-[#b8b8bf]">
                  Belum ada member dipilih.
                </div>
              )}
              <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-xs leading-5 text-[#b8b8bf]">
                Member baru wajib registrasi sendiri lewat portal member. Kasir hanya lookup
                akun member aktif.
              </div>
            </div>
          )}

          {activeCashierToolOpen === "reports" && (
            <div className="space-y-3">
              <PosShiftSalesSummary />
              <details className="rounded-md border border-[#34343c] bg-white/[0.03] p-2">
                <summary className="cursor-pointer px-1 py-1 text-sm font-semibold text-white">
                  Penjualan shift saya (produk, kategori, metode bayar)
                </summary>
                <div className="mt-2">
                  <SalesReport
                    brand={{ brandName: settings.brandName, outletName: me.outlet.name, outletCode: me.outlet.code }}
                    printedBy={me.user.name}
                  />
                </div>
              </details>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {shiftReportSummary?.session.shiftLabel ?? "Shift aktif"} - {cashSession.code}
                  </p>
                  <p className="mt-1 text-xs text-[#b8b8bf]">
                    {me.user.name} - {cashSession.status === "open" ? "Shift aktif" : "Shift tutup"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-9 border-[#4a4a54] bg-white/[0.055] px-3 text-xs"
                    disabled={shiftReportLoading}
                    onClick={() => void loadShiftReport()}
                  >
                    <RefreshCw className={`mr-2 size-3.5 ${shiftReportLoading ? "animate-spin" : ""}`} />
                    Muat ulang
                  </Button>
                  {cashSession.id && !hideShiftCashFigures ? (
                    <Button
                      type="button"
                      className="garage-press h-9 px-3 text-xs"
                      onClick={() =>
                        window.open(`/api/finance/cash-sessions/${cashSession.id}/report`, "_blank")
                      }
                    >
                      <FileText className="mr-2 size-3.5" />
                      PDF
                    </Button>
                  ) : null}
                </div>
              </div>

              {shiftReportError ? (
                <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Laporan shift gagal</AlertTitle>
                  <AlertDescription>{shiftReportError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  [
                    "Gross sales",
                    hideShiftCashFigures
                      ? hiddenUntilCloseLabel
                      : currency.format(shiftReportSummary?.sales.gross ?? 0),
                  ],
                  [
                    "Cash",
                    hideShiftCashFigures ? hiddenUntilCloseLabel : currency.format(shiftReportCashTotal),
                  ],
                  [
                    "Non-cash",
                    hideShiftCashFigures
                      ? hiddenUntilCloseLabel
                      : currency.format(shiftReportNonCashTotal),
                  ],
                  ["Modal awal", currency.format(cashSession.openingCash)],
                  [
                    "Kas seharusnya",
                    hideShiftCashFigures
                      ? hiddenUntilCloseLabel
                      : currency.format(cashSession.expectedCash),
                  ],
                  [
                    "Selisih kas",
                    shiftReportDiscrepancy === null
                      ? "Belum close"
                      : `${shiftReportDiscrepancy >= 0 ? "+" : ""}${currency.format(shiftReportDiscrepancy)}`,
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                    <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                      {label}
                    </p>
                    <p className="mt-1 text-base font-bold text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                    Order shift
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded border border-[#34343c] bg-black/15 p-2">
                      <p className="text-lg font-black text-white">
                        {shiftReportSummary?.counts.total ?? 0}
                      </p>
                      <p className="text-[10px] text-[#b8b8bf]">Total</p>
                    </div>
                    <div className="rounded border border-[#22c55e]/35 bg-[#22c55e]/10 p-2">
                      <p className="text-lg font-black text-[#dcfce7]">
                        {shiftReportSummary?.counts.paid ?? 0}
                      </p>
                      <p className="text-[10px] text-[#b8b8bf]">Lunas</p>
                    </div>
                    <div className="rounded border border-[#f5a742]/35 bg-[#f5a742]/10 p-2">
                      <p className="text-lg font-black text-[#ffd08a]">
                        {waitingCustomerOrderCount}
                      </p>
                      <p className="text-[10px] text-[#b8b8bf]">QR pending</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                    Payment breakdown
                  </p>
                  <div className="mt-2 space-y-2">
                    {(shiftReportSummary?.byMethod.length ? shiftReportSummary.byMethod : [])
                      .map((method) => (
                        <div
                          key={method.method}
                          className="flex items-center justify-between gap-3 rounded border border-[#34343c] bg-black/15 px-2 py-1.5 text-xs"
                        >
                          <span className="text-[#d6d6dc]">
                            {method.method} ({method.count})
                          </span>
                          <span className="font-semibold text-white">
                            {hideShiftCashFigures ? "—" : currency.format(method.total)}
                          </span>
                        </div>
                      ))}
                    {!shiftReportSummary?.byMethod.length ? (
                      <p className="text-xs text-[#8f8f99]">Belum ada payment tercatat.</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                    Riwayat shift saya
                  </p>
                  <Badge className="border-[#4a4a54] bg-white/[0.08] px-2 text-[10px]">
                    {shiftReportHistory?.total ?? 0}
                  </Badge>
                </div>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {(shiftReportHistory?.rows ?? []).map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between gap-3 rounded border border-[#34343c] bg-black/15 px-2 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {session.shiftLabel} - {session.code}
                        </p>
                        <p className="mt-0.5 text-[#8f8f99]">
                          {new Date(session.openedAt).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge
                          className={`px-2 text-[10px] ${
                            session.status === "open"
                              ? "border-[#22c55e]/35 bg-[#22c55e]/12 text-[#dcfce7]"
                              : "border-[#4a4a54] bg-white/[0.08] text-[#d6d6dc]"
                          }`}
                        >
                          {session.status}
                        </Badge>
                        <p className="mt-1 font-semibold text-white">
                          {isCashierKiosk && session.status === "open"
                            ? "—"
                            : currency.format(session.expectedCash)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {!shiftReportHistory?.rows.length ? (
                    <p className="text-xs text-[#8f8f99]">Belum ada riwayat shift.</p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {activeCashierToolOpen === "settings" && canManagePosSettings && (
            <Tabs
              value={cashierSettingsTab}
              onValueChange={(value) =>
                setCashierSettingsTab(
                  value as "display" | "digital" | "security" | "printer" | "shift",
                )
              }
            >
              <TabsList className="grid w-full grid-cols-5 bg-[#202027]">
                <TabsTrigger value="display">Tampilan</TabsTrigger>
                <TabsTrigger value="digital">Digital</TabsTrigger>
                <TabsTrigger value="security">Aman</TabsTrigger>
                <TabsTrigger value="printer">Printer</TabsTrigger>
                <TabsTrigger value="shift">Shift</TabsTrigger>
              </TabsList>

              <TabsContent value="display" className="mt-3 space-y-3">
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <div className="mb-3">
                    <p className="text-sm font-black text-white">Tema Tampilan Kasir</p>
                    <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                      Preset kontras khusus POS kasir, tidak mengubah tema Owner/Manajer.
                    </p>
                  </div>
                  <CashierThemePresetGrid
                    value={cashierTheme}
                    onChange={onCashierThemeChange}
                  />
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <SettingsChoiceGroup<PosTextSize>
                    label="Ukuran teks"
                    value={cashierPosSettings.textSize}
                    onChange={(textSize) => updateCashierPosSettings({ textSize })}
                    options={[
                      { value: "normal", label: "Normal", detail: "Untuk layar kasir standar." },
                      { value: "large", label: "Besar", detail: "Lebih nyaman untuk mata lelah/rabun." },
                    ]}
                  />
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <SettingsChoiceGroup<PosCardDensity>
                    label="Kartu produk"
                    value={cashierPosSettings.cardDensity}
                    onChange={(cardDensity) => updateCashierPosSettings({ cardDensity })}
                    options={[
                      { value: "compact", label: "Compact", detail: "Lebih banyak produk terlihat." },
                      { value: "large", label: "Besar", detail: "Nama dan tombol produk lebih lega." },
                    ]}
                  />
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <SettingsChoiceGroup<PosBillLayout>
                    label="Panel bill"
                    value={cashierPosSettings.billLayout}
                    onChange={(billLayout) => updateCashierPosSettings({ billLayout })}
                    options={[
                      { value: "right", label: "Kanan", detail: "Default desktop kasir." },
                      { value: "bottom", label: "Bawah", detail: "Lebih lega untuk grid produk." },
                    ]}
                  />
                </div>
              </TabsContent>

              <TabsContent value="digital" className="mt-3 space-y-3">
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <p className="text-sm font-black text-white">Menu Digital QR</p>
                  <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                    Stok habis tersimpan ke sistem, langsung mengunci POS dan halaman
                    order customer QR.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-11 justify-start border-[#4a4a54] bg-white/[0.055]"
                      onClick={() => {
                        setCashierToolOpen(null);
                        setSoldOutDialogOpen(true);
                      }}
                    >
                      <Ban className="mr-2 size-4" />
                      Atur Stok Habis
                      <Badge className="ml-auto border-[#d11a2a]/55 bg-[#d11a2a]/14 px-2 text-[10px] text-[#ffc2c8]">
                        {soldOutIds.size}
                      </Badge>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-11 justify-start border-[#4a4a54] bg-white/[0.055]"
                      onClick={() => window.open("/order?source=qr_takeaway", "_blank")}
                    >
                      <QrCode className="mr-2 size-4" />
                      Preview Menu Digital
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-11 justify-start border-[#4a4a54] bg-white/[0.055]"
                      onClick={() => {
                        setCashierToolOpen(null);
                        setQrOperationsOpen(true);
                      }}
                    >
                      <Bell className="mr-2 size-4" />
                      Kontrol QR Order
                      <Badge className={`${waitingCustomerOrderCount ? statusClass.pending_cashier : statusClass.info} ml-auto px-2 text-[10px]`}>
                        {waitingCustomerOrderCount}
                      </Badge>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-11 justify-start border-[#4a4a54] bg-white/[0.055]"
                      onClick={() => {
                        setCashierToolOpen(null);
                        openTablePrintDialogFromMenu();
                      }}
                    >
                      <Printer className="mr-2 size-4" />
                      Cetak QR Meja
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-xs leading-5 text-[#b8b8bf]">
                  Guard MVP final: customer QR hanya bisa submit saat outlet punya shift
                  kasir open, item HABIS ditolak saat tambah ke cart dan ditolak lagi di
                  backend saat checkout.
                </div>
              </TabsContent>

              <TabsContent value="security" className="mt-3 space-y-3">
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <SettingsChoiceGroup<PosAutoLockDelay>
                    label="Auto lock"
                    value={cashierPosSettings.autoLockDelay}
                    onChange={(autoLockDelay) => updateCashierPosSettings({ autoLockDelay })}
                    options={[
                      { value: "off", label: "Mati", detail: "POS hanya dikunci manual." },
                      { value: "1", label: "1 menit", detail: "Untuk area kasir ramai." },
                      { value: "3", label: "3 menit", detail: "Rekomendasi harian." },
                      { value: "5", label: "5 menit", detail: "Lebih santai saat service padat." },
                    ]}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 justify-start border-[#4a4a54] bg-white/[0.055]"
                    onClick={() => {
                      setCashierToolOpen(null);
                      setLocked(true);
                    }}
                  >
                    <LockKeyhole className="mr-2 size-4" />
                    Lock POS Sekarang
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 justify-start border-[#4a4a54] bg-white/[0.055]"
                    onClick={() => void requestPosFullscreen()}
                  >
                    <Monitor className="mr-2 size-4" />
                    {isFullscreen ? "Layar Penuh Aktif" : "Kunci Layar Penuh"}
                  </Button>
                </div>
                {fullscreenError ? (
                  <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>Layar penuh gagal</AlertTitle>
                    <AlertDescription>{fullscreenError}</AlertDescription>
                  </Alert>
                ) : null}
              </TabsContent>

              <TabsContent value="printer" className="mt-3 space-y-3">
                <DevicePrinterPanel compact brand={{ brandName: settings.brandName }} />
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <SettingsChoiceGroup<PosReceiptPrintMode>
                    label="Cetak struk setelah bayar"
                    value={cashierPosSettings.receiptPrintMode}
                    onChange={(receiptPrintMode) => updateCashierPosSettings({ receiptPrintMode })}
                    options={[
                      { value: "auto", label: "Otomatis", detail: "Struk langsung dikirim ke printer." },
                      { value: "manual", label: "Manual", detail: "Kasir tekan tombol cetak sendiri." },
                    ]}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 justify-start border-[#4a4a54] bg-white/[0.055]"
                    onClick={() => {
                      setCashierToolOpen(null);
                      openTablePrintDialogFromMenu();
                    }}
                  >
                    <QrCode className="mr-2 size-4" />
                    Cetak QR No Meja
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 justify-start border-[#4a4a54] bg-white/[0.055]"
                    onClick={() => {
                      setCashierToolOpen(null);
                      setReceiptHistoryOpen(true);
                    }}
                  >
                    <Printer className="mr-2 size-4" />
                    Reprint Struk Shift
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="shift" className="mt-3 space-y-3">
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <SettingsChoiceGroup<PosQrSoundMode>
                    label="Notifikasi QR order"
                    value={cashierPosSettings.qrSoundMode}
                    onChange={(qrSoundMode) => updateCashierPosSettings({ qrSoundMode })}
                    options={[
                      { value: "airport", label: "Airport Announcer", detail: "Chime dan suara pengumuman saat QR order masuk." },
                      { value: "on", label: "Bunyi aktif", detail: "Nada pendek tanpa suara announcer." },
                      { value: "off", label: "Bunyi mati", detail: "Tetap muncul badge dan daftar order." },
                    ]}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press mt-3 h-10 justify-start border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a] hover:bg-[#f5a742]/20"
                    onClick={previewQrAirportAnnouncer}
                  >
                    <Volume2 className="mr-2 size-4" />
                    Test Airport Announcer
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 justify-start border-[#4a4a54] bg-white/[0.055]"
                    onClick={() => {
                      setCashierToolOpen(null);
                      prepareShiftDialog();
                    }}
                  >
                    <ShieldCheck className="mr-2 size-4" />
                    Tutup / Ganti Shift
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 justify-start border-[#4a4a54] bg-white/[0.055]"
                    disabled={cashierRefreshing}
                    onClick={() => void refreshCashierData()}
                  >
                    <RefreshCw className={`mr-2 size-4 ${cashierRefreshing ? "animate-spin" : ""}`} />
                    {cashierRefreshing ? "Memuat ulang..." : "Muat Ulang POS"}
                  </Button>
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-xs leading-5 text-[#b8b8bf]">
                  Modal awal default Rp 50.000, pilihan open shift Rp 50.000 sampai
                  Rp 500.000, dan reset meja saat close default hanya meja selesai.
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={tablePrintOpen} onOpenChange={setTablePrintOpen}>
        <DialogContent
          data-cashier-theme-scope={cashierTheme}
          className="border-[#34343c] bg-[#111116] sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>Cetak QR No Meja</DialogTitle>
            <DialogDescription>
              Pilih meja yang ingin dicetak. Preview memakai layout QR meja permanen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs
              value={tablePrintMode}
              onValueChange={(value) =>
                setTablePrintMode(value as "single" | "range" | "all")
              }
            >
              <TabsList className="grid w-full grid-cols-3 bg-[#202027]">
                <TabsTrigger value="single">Satu</TabsTrigger>
                <TabsTrigger value="range">Rentang</TabsTrigger>
                <TabsTrigger value="all">Semua</TabsTrigger>
              </TabsList>
            </Tabs>

            {tablePrintMode === "single" ? (
              <div className="space-y-2">
                <label className="garage-mono text-[10px] text-[#b8b8bf]">
                  Nomor meja
                </label>
                <Select value={tablePrintSingle} onValueChange={setTablePrintSingle}>
                  <SelectTrigger className="h-11 border-[#34343c] bg-white/[0.06]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tableNumbers.map((table) => (
                      <SelectItem key={table} value={table}>
                        Meja {table}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="garage-scroll grid max-h-52 grid-cols-5 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-10">
                  {tableNumbers.map((table) => (
                    <Button
                      key={table}
                      type="button"
                      variant={tablePrintSingle === table ? "default" : "outline"}
                      className={`garage-press h-11 px-0 text-sm font-black ${
                        tablePrintSingle === table
                          ? "bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                          : "border-[#4a4a54] bg-white/[0.045]"
                      }`}
                      onClick={() => setTablePrintSingle(table)}
                    >
                      {table}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {tablePrintMode === "range" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="garage-mono text-[10px] text-[#b8b8bf]">
                    Dari meja
                  </label>
                  <Select value={tablePrintStart} onValueChange={setTablePrintStart}>
                    <SelectTrigger className="h-11 border-[#34343c] bg-white/[0.06]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tableNumbers.map((table) => (
                        <SelectItem key={table} value={table}>
                          Meja {table}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="garage-mono text-[10px] text-[#b8b8bf]">
                    Sampai meja
                  </label>
                  <Select value={tablePrintEnd} onValueChange={setTablePrintEnd}>
                    <SelectTrigger className="h-11 border-[#34343c] bg-white/[0.06]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tableNumbers.map((table) => (
                        <SelectItem key={table} value={table}>
                          Meja {table}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-[#34343c] bg-white/[0.045] p-3">
              <p className="text-sm font-semibold text-white">
                {tablePrintTables.length} QR meja siap dicetak
              </p>
              <p className="mt-1 break-words text-xs leading-5 text-[#b8b8bf]">
                {tablePrintAutoUrl}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 border-[#4a4a54] bg-white/[0.055]"
                onClick={() => setTablePrintOpen(false)}
              >
                Tutup
              </Button>
              <Button
                type="button"
                className="garage-press h-11"
                onClick={openTablePrintPreview}
              >
                <Printer className="mr-2 size-4" />
                Buka & Cetak
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog konfirmasi tandai meja bersih. Meja dengan bill belum lunas
          diblokir (server juga menolak) — bayar/batalkan bill dulu. */}
      <Dialog
        open={resetTableDialogOpen}
        onOpenChange={(open) => {
          if (resetTableBusy) return;
          setResetTableDialogOpen(open);
          if (!open) {
            setSelectedTableToReset(null);
            setResetTableError(null);
          }
        }}
      >
        <DialogContent className="max-w-xs border-[#34343c] bg-[#111116] sm:max-w-sm">
          <DialogHeader className="text-left">
            <DialogTitle>Tandai Meja {selectedTableToReset?.tableNumber} bersih?</DialogTitle>
            <DialogDescription>
              Sesi meja ditutup dan meja siap dipakai tamu baru.
            </DialogDescription>
          </DialogHeader>
          {selectedTableToReset && hasOpenTableBill(selectedTableToReset) ? (
            <div className="rounded-md border border-[#ff2a3a]/45 bg-[#d11a2a]/12 p-3" role="alert">
              <p className="text-sm font-semibold text-white">Masih ada bill belum lunas</p>
              <p className="mt-1 text-[13px] leading-5 text-[#ffc2c8]">
                {selectedTableToReset.orderNo ? `${selectedTableToReset.orderNo} · ` : ""}
                Bayar atau batalkan bill dulu sebelum meja dikosongkan.
              </p>
            </div>
          ) : null}
          {resetTableError ? (
            <p className="rounded-md border border-[#ff2a3a]/45 bg-[#d11a2a]/12 p-3 text-[13px] text-[#ffc2c8]" role="alert">
              {resetTableError}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-11 border-[#4a4a54] bg-white/[0.055] text-sm"
              disabled={resetTableBusy}
              onClick={() => {
                setResetTableDialogOpen(false);
                setSelectedTableToReset(null);
                setResetTableError(null);
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="garage-press h-11 text-sm"
              disabled={
                resetTableBusy ||
                !selectedTableToReset ||
                hasOpenTableBill(selectedTableToReset)
              }
              onClick={() => {
                if (selectedTableToReset) {
                  void resetTableCleaning(selectedTableToReset.tableNumber);
                }
              }}
            >
              {resetTableBusy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              {resetTableBusy ? "Menyimpan…" : "Ya, tandai bersih"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cek Meja: detail + aksi cepat saat tap kartu meja */}
      <Dialog
        open={Boolean(tableDetail)}
        onOpenChange={(open) => {
          if (!open) {
            setTableDetail(null);
            setTableOrderBills(null);
            setTableItemsError(null);
            setTableItemsLoading(false);
          }
        }}
      >
        {tableDetail
          ? (() => {
              const detailEmpty =
                tableDetail.status === "empty" && !tableHasLiveSession(tableDetail);
              const detailCleaning = tableNeedsCleaning(tableDetail);
              const pickTable = () => {
                setOrderType("dine-in");
                setSelectedTableNumber(tableDetail.tableNumber);
                setTableDetail(null);
                setQrOperationsOpen(false);
              };
              return (
                <DialogContent className="border-[#34343c] bg-[#111116] max-w-sm sm:max-w-md">
                  <DialogHeader className="text-left">
                    <DialogTitle className="flex items-center gap-2">
                      <span
                        className={`size-2.5 rounded-full ${
                          detailEmpty ? "bg-[#22c55e]" : "bg-[#d11a2a]"
                        }`}
                      />
                      Meja {tableDetail.tableNumber}
                    </DialogTitle>
                    <DialogDescription>
                      {detailCleaning
                        ? "Perlu dibersihkan sebelum dipakai lagi."
                        : detailEmpty
                          ? "Meja kosong dan siap digunakan."
                          : `Terisi · ${tableLiveStatusLabel(tableDetail)}`}
                    </DialogDescription>
                  </DialogHeader>

                  {!detailEmpty ? (
                    <div className="space-y-2 rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#b8b8bf]">Status</span>
                        <span className="font-semibold text-white">
                          {tableLiveStatusLabel(tableDetail)}
                        </span>
                      </div>
                      {tableDetail.kitchenStatus ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#b8b8bf]">Status dapur</span>
                          <Badge className={`${statusClass[tableDetail.kitchenStatus] ?? statusClass.info} px-2 text-[10px]`}>
                            {({
                              queue: "Antre",
                              cooking: "Dimasak",
                              ready: "Siap",
                              delivered: "Diantar",
                              completed: "Selesai",
                            } as Record<string, string>)[tableDetail.kitchenStatus] ??
                              tableDetail.kitchenStatus}
                          </Badge>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#b8b8bf]">Durasi terisi</span>
                        <span
                          className={`garage-mono font-semibold ${
                            tableDetail.timerMinutes >= 90
                              ? "text-[#ffd08a]"
                              : "text-white"
                          }`}
                        >
                          {tableDetail.timerMinutes}m
                        </span>
                      </div>
                      {tableDetail.orderNo ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#b8b8bf]">Order</span>
                          <span className="garage-mono font-semibold text-white">
                            {tableDetail.orderNo}
                          </span>
                        </div>
                      ) : null}
                      {tableDetail.customerName ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#b8b8bf]">Pelanggan</span>
                          <span className="truncate font-semibold text-white">
                            {tableDetail.customerName}
                          </span>
                        </div>
                      ) : null}
                      {tableDetail.total > 0 ? (
                        <div className="flex items-center justify-between gap-2 border-t border-[#34343c] pt-2">
                          <span className="text-[#b8b8bf]">Total bill</span>
                          <span className="garage-mono text-base font-black text-[#ffd08a]">
                            {currency.format(tableDetail.total)}
                          </span>
                        </div>
                      ) : null}
                      {/* Ringkasan meja: bill terbuka/lunas + jumlah item. */}
                      {(tableDetail.openBillCount ?? 0) +
                        (tableDetail.paidBillCount ?? 0) >
                        0 || (tableOrderBills?.length ?? 0) > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#34343c] pt-2">
                          <Badge className="border-[#f5a742]/45 bg-[#f5a742]/12 px-2 text-[10px] text-[#ffd08a]">
                            {tableDetail.openBillCount ?? 0} bill terbuka
                          </Badge>
                          <Badge className="border-[#22c55e]/45 bg-[#22c55e]/12 px-2 text-[10px] text-[#dcfce7]">
                            {tableDetail.paidBillCount ?? 0} lunas
                          </Badge>
                          {tableOrderBills ? (
                            <Badge className="garage-mono border-[#4a4a54] bg-white/[0.06] px-2 text-[10px] text-[#d6d6dc]">
                              {tableOrderBills.reduce(
                                (sum, bill) =>
                                  sum +
                                  bill.items.reduce((s, item) => s + item.qty, 0),
                                0,
                              )}{" "}
                              item
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="border-t border-[#34343c] pt-2">
                        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-[#8f8f98]">
                          Rincian pesanan
                        </p>
                        {tableItemsLoading ? (
                          <div className="flex items-center gap-2 py-3 text-xs text-[#b8b8bf]">
                            <RefreshCw className="size-3.5 animate-spin" />
                            Memuat rincian pesanan…
                          </div>
                        ) : tableItemsError ? (
                          <p className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-2 text-xs text-[#ffc2c8]">
                            {tableItemsError}
                          </p>
                        ) : tableOrderBills && tableOrderBills.length ? (
                          <div className="garage-scroll max-h-[42vh] space-y-2 overflow-y-auto pr-0.5">
                            {tableOrderBills.map((bill) => (
                              <div
                                key={bill.id}
                                className="rounded-md border border-[#303038] bg-black/20 p-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="garage-mono truncate text-xs font-semibold text-[#d6d6dc]">
                                    {bill.orderNo}
                                  </span>
                                  <Badge className={`${statusClass[bill.status] ?? statusClass.info} shrink-0 px-2 text-[10px]`}>
                                    {billStatusLabel(bill.status)}
                                  </Badge>
                                </div>
                                {bill.customerName ? (
                                  <p className="mt-0.5 truncate text-[11px] text-[#b8b8bf]">
                                    {bill.customerName}
                                  </p>
                                ) : null}
                                {bill.parentOrderId ? (
                                  <p className="mt-0.5 text-[11px] font-semibold text-[#ffd79a]">
                                    Bill pisahan
                                  </p>
                                ) : null}
                                {bill.customerNote ? (
                                  <p className="mt-1 rounded border border-[#f5a742]/35 bg-[#f5a742]/10 px-1.5 py-1 text-[11px] italic text-[#ffd08a]">
                                    Catatan: {bill.customerNote}
                                  </p>
                                ) : null}
                                {/* Ringkasan station: jumlah item + status tiket Dapur/Bar. */}
                                {bill.items.length ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {(["Dapur", "Bar"] as const).map((station) => {
                                      const qty = bill.items
                                        .filter((item) => item.station === station)
                                        .reduce((sum, item) => sum + item.qty, 0);
                                      if (!qty) return null;
                                      const status =
                                        bill.stations.find((row) => row.station === station)?.status ??
                                        null;
                                      return (
                                        <span
                                          key={station}
                                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${kitchenStatusTone(status)}`}
                                        >
                                          {station} {qty} · {kitchenStatusLabel(status)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : null}
                                <div className="mt-1.5 space-y-1">
                                  {bill.items.length ? (
                                    bill.items.map((item) => {
                                      const itemStatus =
                                        bill.stations.find((row) => row.station === item.station)
                                          ?.status ?? null;
                                      return (
                                      <div key={item.id} className="text-xs">
                                        <div className="flex items-start justify-between gap-2">
                                          <span className="min-w-0 text-[#e7e7ea]">
                                            <span className="garage-mono font-semibold text-white">
                                              {item.qty}×
                                            </span>{" "}
                                            {item.itemName}
                                            {item.variantLabel ? (
                                              <span className="text-[#8f8f98]"> · {item.variantLabel}</span>
                                            ) : null}
                                          </span>
                                          <span className="garage-mono shrink-0 text-[#d6d6dc]">
                                            {currency.format(item.lineTotal)}
                                          </span>
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-1 pl-4">
                                          <span className="text-[10px] text-[#8f8f98]">{item.station}</span>
                                          <span
                                            className={`rounded border px-1 text-[10px] font-semibold ${kitchenStatusTone(itemStatus)}`}
                                          >
                                            {kitchenStatusLabel(itemStatus)}
                                          </span>
                                        </div>
                                        {item.note ? (
                                          <p className="mt-0.5 pl-4 text-[11px] italic text-[#9aa0a6]">
                                            {item.note}
                                          </p>
                                        ) : null}
                                      </div>
                                      );
                                    })
                                  ) : (
                                    <p className="text-[11px] text-[#6f6f78]">Tanpa rincian item.</p>
                                  )}
                                </div>
                                <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-[#303038] pt-1.5 text-xs">
                                  <span className="text-[#8f8f98]">Subtotal bill</span>
                                  <span className="garage-mono font-bold text-[#ffd08a]">
                                    {currency.format(bill.total)}
                                  </span>
                                </div>
                                {bill.items.length ? (
                                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="garage-press h-9 border-[#4a4a54] bg-white/[0.05] px-2 text-[11px]"
                                      onClick={() =>
                                        reprintTableBillChit(bill, tableDetail.tableLabel)
                                      }
                                    >
                                      <Printer className="mr-1 size-3.5 shrink-0" />
                                      Chit dapur
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="garage-press h-9 border-[#f5a742]/45 bg-[#f5a742]/10 px-2 text-[11px] text-[#ffe0ad]"
                                      disabled={provisionalBillBusyId === bill.id}
                                      onClick={() => void printProvisionalBill(bill)}
                                    >
                                      <FileText className="mr-1 size-3.5 shrink-0" />
                                      {provisionalBillBusyId === bill.id ? "Mencetak…" : "Bill sementara"}
                                    </Button>
                                    {canDeleteInvoice && bill.status !== "paid" ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        data-testid="pos-table-invoice-delete"
                                        className="garage-press col-span-2 h-9 border-[#d11a2a]/55 bg-[#d11a2a]/10 px-2 text-[11px] text-[#ffc2c8]"
                                        onClick={() =>
                                          setInvoiceDeleteTarget({
                                            id: bill.id,
                                            orderNo: bill.orderNo,
                                            total: bill.total,
                                            label: [tableDetail.tableLabel, bill.customerName].filter(Boolean).join(" · "),
                                            status: bill.status,
                                          })
                                        }
                                      >
                                        <Trash2 className="mr-1 size-3.5 shrink-0" />
                                        Hapus invoice
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : null}
                                {bill.canSplit || bill.canPay ? (
                                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                    {bill.canSplit ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className={`garage-press h-10 border-[#d6d6dc]/40 bg-white/[0.06] px-2 text-xs font-semibold text-white ${
                                          bill.canPay ? "" : "col-span-2"
                                        }`}
                                        onClick={() => setTableSplitBill(bill)}
                                      >
                                        <Scissors className="mr-1 size-3.5 shrink-0" />
                                        Pisah bill
                                      </Button>
                                    ) : null}
                                    {bill.canPay ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        className={`garage-press h-10 bg-[#22c55e] px-2 text-xs font-bold text-black hover:bg-[#34d76b] ${
                                          bill.canSplit ? "" : "col-span-2"
                                        }`}
                                        onClick={() => void payTableBill(bill)}
                                      >
                                        <Wallet className="mr-1 size-3.5 shrink-0" />
                                        Bayar {currency.format(bill.total)}
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="py-2 text-xs text-[#8f8f98]">Belum ada item.</p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      className="garage-press h-11 bg-[#d11a2a] text-sm text-white hover:bg-[#ff2a3a]"
                      onClick={pickTable}
                    >
                      {detailEmpty
                        ? "Pilih meja ini untuk order"
                        : "Tambah order ke meja ini"}
                    </Button>
                    {!detailEmpty &&
                    tableDetail.currentOrderId &&
                    ["accepted", "ready", "mixed"].includes(tableDetail.status) ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-11 border-[#f5a742]/55 bg-[#f5a742]/12 px-2 text-sm text-[#ffe0ad]"
                        disabled={tableActionBusy !== null}
                        onClick={() => void requestTableBill()}
                      >
                        {tableActionBusy === "bill" ? "Memproses…" : "Siapkan bill"}
                      </Button>
                    ) : null}
                    {!detailEmpty ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-11 border-[#4a4a54] bg-white/[0.05] text-sm"
                        onClick={() => {
                          const target = tableDetail.tableNumber;
                          setTableDetail(null);
                          setQrInsightFilters((current) => ({
                            ...current,
                            table: target,
                          }));
                          setQrWorkTab("qr_control");
                        }}
                      >
                        Lihat bill di QR control
                      </Button>
                    ) : null}
                    {detailCleaning ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-12 border-[#22c55e]/55 bg-[#22c55e]/12 text-sm text-[#dcfce7]"
                        onClick={() => {
                          const target = tableDetail;
                          setTableDetail(null);
                          setSelectedTableToReset(target);
                          setResetTableDialogOpen(true);
                        }}
                      >
                        Bersihkan meja
                      </Button>
                    ) : null}
                  </div>
                </DialogContent>
              );
            })()
          : null}
      </Dialog>

      {/* Konfirmasi + alasan Reject order QR (aksi susah-dibalik). */}
      <Dialog
        open={Boolean(rejectOrderTarget)}
        onOpenChange={(open) => {
          if (!open) setRejectOrderTarget(null);
        }}
      >
        <DialogContent className="border-[#34343c] bg-[#111116] max-w-xs sm:max-w-sm">
          <DialogHeader className="text-left">
            <DialogTitle>Tolak order?</DialogTitle>
            <DialogDescription>
              {rejectOrderTarget
                ? `${rejectOrderTarget.tableLabel} · ${rejectOrderTarget.orderNo} · ${currency.format(rejectOrderTarget.total)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8f8f98]">
              Alasan
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {["Stok habis", "Salah pesan", "Pelanggan batal", "Duplikat", "Lainnya"].map(
                (option) => (
                  <Button
                    key={option}
                    type="button"
                    variant="outline"
                    className={`garage-press h-10 text-xs ${
                      rejectReasonChoice === option
                        ? "border-[#d11a2a]/70 bg-[#d11a2a]/18 text-white"
                        : "border-[#34343c] bg-white/[0.045] text-[#d6d6dc]"
                    }`}
                    onClick={() => setRejectReasonChoice(option)}
                  >
                    {option}
                  </Button>
                ),
              )}
            </div>
            {rejectReasonChoice === "Lainnya" ? (
              <Input
                autoFocus
                value={rejectReasonOther}
                onChange={(event) => setRejectReasonOther(event.target.value)}
                placeholder="Tulis alasan (min 3 huruf)"
                className="h-11 border-[#34343c] bg-white/[0.06]"
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              className="garage-press h-11 flex-1 bg-[#d11a2a] text-sm text-white hover:bg-[#ff2a3a]"
              disabled={
                rejectReasonChoice === "Lainnya" &&
                rejectReasonOther.trim().length < 3
              }
              onClick={confirmRejectOrder}
            >
              Tolak order
            </Button>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-11 flex-1 border-[#4a4a54] bg-white/[0.05] text-sm"
              onClick={() => setRejectOrderTarget(null)}
            >
              Batal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi Final Bayar (menutup pembayaran, susah-dibalik). */}
      <Dialog
        open={Boolean(finalizeOrderTarget)}
        onOpenChange={(open) => {
          if (!open) setFinalizeOrderTarget(null);
        }}
      >
        <DialogContent className="garage-scroll max-h-[92svh] overflow-y-auto border-[#34343c] bg-[#111116] max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>Konfirmasi pembayaran</DialogTitle>
            <DialogDescription>
              Final Bayar menutup order ini. Pastikan pembayaran sudah diterima.
            </DialogDescription>
          </DialogHeader>
          {finalizeOrderTarget ? (
            <div className="space-y-2 rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#b8b8bf]">Meja / Order</span>
                <span className="garage-mono font-semibold text-white">
                  {finalizeOrderTarget.tableLabel} · {finalizeOrderTarget.orderNo}
                </span>
              </div>
              {finalizeOrderTarget.items.length ? (
                <ul className="garage-scroll max-h-44 space-y-1.5 overflow-y-auto border-t border-[#34343c] pt-2" aria-label="Isi pesanan">
                  {groupOrderLines(finalizeOrderTarget.items).map((group) =>
                    group.kind === "package" ? (
                      <li key={group.groupId} className="text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 break-words font-semibold text-white">{group.qty}× {group.name}</span>
                          <span className="garage-mono shrink-0 text-white">{currency.format(group.total)}</span>
                        </div>
                        <p className="break-words text-[13px] leading-5 text-[#d0d0d6]">
                          {group.components.map((line) => componentLabel(line, group.qty)).join(" · ")}
                        </p>
                      </li>
                    ) : (
                      <li key={group.line.id} className="flex items-start justify-between gap-2 text-sm">
                        <span className="min-w-0 break-words text-[#e4e4ea]">{group.line.qty}× {group.line.itemName}{group.line.variantLabel && group.line.variantLabel !== "Regular" ? ` ${group.line.variantLabel}` : ""}</span>
                        <span className="garage-mono shrink-0 text-white">{currency.format(group.line.lineTotal)}</span>
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
              {(() => {
                const handover = finalizeOrderTarget.items.filter((line) => {
                  const menu = line.menuItemId ? menuItemsById.get(line.menuItemId) : undefined;
                  return menu ? chitStationFor(menu) === "Langsung" : false;
                });
                return handover.length ? (
                  <p className="rounded-md border border-[#f5a742]/60 bg-[#f5a742]/14 p-2 text-sm font-bold text-[#ffd08a]" data-testid="finalize-handover">
                    Serahkan langsung: {handover.map((line) => `${line.qty}× ${line.itemName}`).join(", ")}
                  </p>
                ) : null;
              })()}
              <div className="flex items-center justify-between gap-2 border-t border-[#34343c] pt-2">
                <span className="text-[#b8b8bf]">Total</span>
                <span className="garage-mono text-base font-black text-[#ffd08a]">
                  {currency.format(finalizeOrderTarget.total)}
                </span>
              </div>
            </div>
          ) : null}
          {finalizeOrderTarget ? (
            <div className="space-y-2">
              <p className="garage-mono text-xs uppercase tracking-wide text-[#c8c8cc]">
                Metode bayar
              </p>
              {finalizeOrderTarget.fulfillment === "delivery" ? (
                <p className="text-xs font-semibold text-[#ffd79a]">
                  Delivery hanya QRIS — cek mutasi QRIS dulu, baru tandai lunas & antar.
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-1.5">
                {(finalizeOrderTarget.fulfillment === "delivery"
                  ? (["QRIS"] as PaymentMethod[])
                  : paymentMethods
                ).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setFinalizeMethod(method)}
                    disabled={method === "QRIS" && !qrisImageReady && finalizeOrderTarget.fulfillment !== "delivery"}
                    className={`garage-press h-11 rounded-md border text-sm font-bold disabled:opacity-40 ${
                      finalizeMethod === method
                        ? "border-[#f5a742] bg-[#f5a742] text-black"
                        : "border-[#34343c] bg-white/[0.05] text-[#d6d6dc]"
                    }`}
                  >
                    {method === "Cash" ? "Tunai" : method === "Bank Transfer" ? "Transfer" : method}
                  </button>
                ))}
              </div>
              {finalizeMethod === "Cash" ? (
                <div className="space-y-1">
                  <Input
                    inputMode="numeric"
                    value={finalizeCash}
                    onChange={(event) => setFinalizeCash(event.target.value.replace(/[^\d]/g, ""))}
                    placeholder={`Uang diterima (kosong = uang pas ${currency.format(finalizeOrderTarget.total)})`}
                    aria-label="Uang diterima"
                    className="h-11 border-[#34343c] bg-white/[0.06] text-base font-semibold"
                  />
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                    {quickCashOptions(finalizeOrderTarget.total).map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setFinalizeCash(String(amount))}
                        className={`garage-press h-11 rounded-md border text-sm font-bold tabular-nums ${
                          finalizeCashValue === amount
                            ? "border-[#f5a742] bg-[#f5a742]/20 text-white"
                            : "border-[#4a4a54] bg-white/[0.05] text-[#e4e4ea]"
                        }`}
                      >
                        {currency.format(amount)}
                      </button>
                    ))}
                  </div>
                  {finalizeCashShort ? (
                    <p className="text-sm font-semibold text-[#ffc2c8]">Uang diterima kurang dari total.</p>
                  ) : finalizeCashValue > finalizeOrderTarget.total ? (
                    <div className="rounded-md border-2 border-[#f5a742]/70 bg-[#f5a742]/12 p-3 text-center">
                      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffd08a]">Kembalian</p>
                      <p className="garage-display text-3xl font-bold tabular-nums text-white">
                        {currency.format(finalizeCashValue - finalizeOrderTarget.total)}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {finalizeMethod === "QRIS" ? (
                    <p className="flex gap-2 text-sm font-semibold text-[#ffd08a]">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      Pastikan status BERHASIL di notifikasi merchant/bank. Screenshot pelanggan saja tidak cukup.
                    </p>
                  ) : null}
                  <Input
                    value={finalizeReference}
                    onChange={(event) => setFinalizeReference(event.target.value.slice(0, 80))}
                    placeholder={
                      finalizeMethod === "QRIS" && settings.qrisReferenceRequired
                        ? "No. Ref / RRN QRIS (wajib)"
                        : "No. Ref / RRN (opsional)"
                    }
                    aria-label="Referensi pembayaran"
                    className="h-11 border-[#34343c] bg-white/[0.06]"
                  />
                </div>
              )}
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              className="garage-press h-12 flex-1 bg-[#d11a2a] text-base font-bold text-white hover:bg-[#ff2a3a]"
              onClick={confirmFinalizeOrder}
              disabled={finalizeCashShort || finalizeReferenceMissing}
            >
              Konfirmasi Bayar
            </Button>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-11 flex-1 border-[#4a4a54] bg-white/[0.05] text-sm"
              onClick={() => setFinalizeOrderTarget(null)}
            >
              Batal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog konfirmasi/alasan in-app reusable (pengganti window.confirm/prompt). */}
      <Dialog
        open={Boolean(confirmState)}
        onOpenChange={(open) => {
          if (!open) resolveConfirm(false);
        }}
      >
        <DialogContent className="border-[#34343c] bg-[#111116] max-w-xs sm:max-w-sm">
          <DialogHeader className="text-left">
            <DialogTitle>{confirmState?.title}</DialogTitle>
            {confirmState?.message ? (
              <DialogDescription>{confirmState.message}</DialogDescription>
            ) : null}
          </DialogHeader>
          {confirmState?.needsReason ? (
            <Input
              autoFocus
              value={confirmReason}
              onChange={(event) => setConfirmReason(event.target.value)}
              placeholder={confirmState.reasonPlaceholder ?? "Tulis alasan (min 3 huruf)"}
              className="h-11 border-[#34343c] bg-white/[0.06]"
            />
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              className={`garage-press h-11 flex-1 text-sm text-white ${
                confirmState?.danger
                  ? "bg-[#d11a2a] hover:bg-[#ff2a3a]"
                  : "bg-[#22c55e] hover:bg-[#16a34a]"
              }`}
              disabled={
                confirmState?.needsReason
                  ? confirmReason.trim().length < 3
                  : false
              }
              onClick={() =>
                resolveConfirm(
                  confirmState?.needsReason ? confirmReason.trim() : true,
                )
              }
            >
              {confirmState?.confirmLabel ?? "Konfirmasi"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-11 flex-1 border-[#4a4a54] bg-white/[0.05] text-sm"
              onClick={() => resolveConfirm(false)}
            >
              Batal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={memberCreateOpen} onOpenChange={setMemberCreateOpen}>
        <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Member</DialogTitle>
            <DialogDescription>
              Buat akun member langsung dari POS. PIN sementara hanya tampil setelah berhasil.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void createPosMember(event)} className="space-y-3">
            <div className="space-y-1.5">
              <label className="garage-mono text-[10px] text-[#b8b8bf]">Nama</label>
              <Input
                value={memberCreateName}
                onChange={(event) => setMemberCreateName(event.target.value)}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                placeholder="Nama pelanggan"
                disabled={memberCreatePending}
              />
            </div>
            <div className="space-y-1.5">
              <label className="garage-mono text-[10px] text-[#b8b8bf]">No HP</label>
              <Input
                value={memberCreatePhone}
                onChange={(event) => setMemberCreatePhone(event.target.value)}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                placeholder="08xxxxxxxxxx"
                disabled={memberCreatePending}
              />
            </div>
            <div className="space-y-1.5">
              <label className="garage-mono text-[10px] text-[#b8b8bf]">Email opsional</label>
              <Input
                type="email"
                value={memberCreateEmail}
                onChange={(event) => setMemberCreateEmail(event.target.value)}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                placeholder="nama@email.com"
                disabled={memberCreatePending}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="space-y-1.5">
                <label className="garage-mono text-[10px] text-[#b8b8bf]">PIN sementara</label>
                <Input
                  value={memberCreatePin}
                  onChange={(event) => setMemberCreatePin(event.target.value)}
                  className="h-11 border-[#34343c] bg-white/[0.06]"
                  disabled={memberCreatePending}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="garage-press mt-5 h-11 border-[#4a4a54]"
                disabled={memberCreatePending}
                onClick={() => setMemberCreatePin(generateTemporaryMemberPin())}
              >
                Generate
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 border-[#4a4a54] bg-white/[0.055]"
                disabled={memberCreatePending}
                onClick={() => setMemberCreateOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                className="garage-press h-11"
                disabled={memberCreatePending}
              >
                {memberCreatePending ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 size-4" />
                    Simpan Member
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="garage-panel garage-animate-in flex shrink-0 flex-col gap-2 rounded-md p-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="garage-mono text-[11px] text-[#b8b8bf]">POS kasir</p>
          <h1 className="garage-display garage-chrome truncate text-xl leading-none sm:text-2xl">
            {GARAGE_BUSINESS_NAME}
          </h1>
          <p className="mt-0.5 truncate text-xs text-[#d6d6dc]">
            {me.shift} - {me.device}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
          {/* Kasir di mode POS penuh tidak punya header global → lonceng di sini. */}
          {me.role === "Kasir" ? <StaffNotificationCenter newOrderSound={settings.newOrderSound} /> : null}
          <VoiceStatusBadge onOpen={() => setVoiceDialogOpen(true)} />
          <span
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-[#16A34A]/45 bg-[#16A34A]/12 px-2.5 text-[11px] font-semibold text-[#7fd7a3]"
            title="Penjualan otomatis memotong bahan di gudang sesuai resep"
          >
            <span className="size-2 rounded-full bg-[#16A34A]" />
            Gudang Auto
          </span>
          <Button
            type="button"
            variant="outline"
            className="garage-press relative h-10 gap-1.5 border-[#f5a742]/55 bg-[#f5a742]/12 px-3 text-xs font-semibold text-[#ffd08a] hover:bg-[#f5a742]/20"
            onClick={() => setChatOpen(true)}
            aria-label="Chat tamu"
          >
            <Headset className="size-3.5" />
            Chat Tamu
            {chatUnread > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full border-2 border-[#121218] bg-[#d11a2a] px-1 text-[10px] font-black text-white">
                {chatUnread}
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`garage-press h-10 border-[#34343c] bg-white/[0.055] px-3 text-xs font-semibold text-white hover:bg-white/[0.09] ${
              isCashierKiosk ? "xl:hidden" : ""
            }`}
            onClick={() => setCashierMenuOpen(true)}
            aria-label="Buka menu kasir"
          >
            <Menu className="mr-2 size-3.5" />
            Menu Kasir
          </Button>
          {/* Absen = aksi kelas satu, selalu tampak di POS (NAV_ACTION_AUDIT §1.3). */}
          {canAccessModule(me.role, "absensi-v2") && (
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 gap-1.5 border-[#f5a742]/55 bg-[#f5a742]/12 px-3 text-xs font-semibold text-[#ffd08a] hover:bg-[#f5a742]/20"
              onClick={() => window.location.assign("/absen")}
              aria-label="Absen kehadiran"
              title="Absen kehadiran"
            >
              <Fingerprint className="size-3.5" />
              <span className="hidden sm:inline">Absen</span>
            </Button>
          )}
          {!isCashierKiosk && (
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 gap-1.5 border-[#4a4a54] bg-white/[0.055] px-2.5 text-xs text-[#d4d4d8] hover:bg-white/[0.09]"
              onClick={() => void exitPosToDashboard()}
              aria-label="Kembali ke dashboard"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Kembali</span>
            </Button>
          )}
          {/* Keluar = satu istilah logout konsisten (NAV_ACTION_AUDIT §1.1). */}
          <Button
            type="button"
            variant="outline"
            className={`garage-press h-10 gap-1.5 border-[#d11a2a]/55 bg-[#d11a2a]/14 px-2.5 text-xs text-[#ffe1e5] hover:bg-[#d11a2a]/22 ${
              isCashierKiosk ? "xl:hidden" : ""
            }`}
            disabled={signOutPending}
            onClick={() => void signOutFromPos()}
            aria-label="Keluar"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">
              {signOutPending ? "Keluar..." : "Keluar"}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`garage-press h-10 px-2.5 text-xs ${
              shiftOpen
                ? "garage-shift-open border-[#22c55e]/55 bg-[#22c55e]/16 text-[#dcfce7] hover:bg-[#22c55e]/22"
                : "garage-shift-closed border-[#d11a2a]/70 bg-[#d11a2a]/20 text-[#ffe1e5] hover:bg-[#d11a2a]/28"
            } ${isCashierKiosk ? "xl:hidden" : ""}`}
            onClick={prepareShiftDialog}
          >
            {shiftOpen ? (
              <ShieldCheck className="mr-1.5 size-3.5" />
            ) : (
              <ShieldAlert className="mr-1.5 size-3.5" />
            )}
            {shiftOpen ? "Shift Aktif" : "Mulai Shift"}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-pulse={qrNoticeIsNew ? "true" : "false"}
            aria-label="Buka Operasional QR"
            className={`garage-press h-10 gap-1.5 px-2.5 text-xs ${
              waitingCustomerOrderCount
                ? "qr-order-notice border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffe0ad] hover:bg-[#f5a742]/20"
                : "border-[#4a4a54] bg-white/[0.055] text-[#d4d4d8] hover:bg-white/[0.09]"
            } ${isCashierKiosk ? "xl:hidden" : ""}`}
            onClick={() => setQrOperationsOpen(true)}
          >
            <Bell className="size-3.5" />
            QR
            <Badge className={`${waitingCustomerOrderCount ? statusClass.pending_cashier : statusClass.info} px-1.5 text-[10px]`}>
              {waitingCustomerOrderCount}
            </Badge>
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Buka pesanan Bar &amp; Dapur"
            className={`garage-press h-10 gap-1.5 px-2.5 text-xs ${
              kitchenTickets.length
                ? "border-[#22c55e]/55 bg-[#22c55e]/14 text-[#bbf7d0] hover:bg-[#22c55e]/20"
                : "border-[#4a4a54] bg-white/[0.055] text-[#d4d4d8] hover:bg-white/[0.09]"
            } ${isCashierKiosk ? "xl:hidden" : ""}`}
            onClick={() => {
              setKitchenPanelOpen(true);
              void loadKitchenTickets();
            }}
          >
            <UtensilsCrossed className="size-3.5" />
            Siap
            <Badge className="border-[#4a4a54] bg-black/30 px-1.5 text-[10px]">
              {kitchenTickets.length}
            </Badge>
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Muat ulang data POS"
            className={`garage-press h-10 gap-1.5 border-[#4a4a54] bg-white/[0.055] px-2.5 text-xs text-[#d4d4d8] hover:bg-white/[0.09] ${
              isCashierKiosk ? "xl:hidden" : ""
            }`}
            disabled={cashierRefreshing}
            onClick={() => void refreshCashierData()}
          >
            <RefreshCw className={`size-3.5 ${cashierRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">
              {cashierRefreshing ? "Memuat..." : "Muat ulang"}
            </span>
          </Button>
          <PosHeaderClock />
          {shiftOpen && (
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#f5a742]/45 bg-[#f5a742]/10 px-2.5 text-xs text-[#ffe0ad] md:hidden"
              onClick={() => setBillOpen(true)}
            >
              <ReceiptText className="mr-1.5 size-3.5" />
              Keranjang
              <span className="garage-mono ml-1.5 rounded-full border border-[#f5a742]/35 bg-black/25 px-1.5 text-[10px]">
                {cartItemCount}
              </span>
            </Button>
          )}
        </div>
        <div className="hidden">
          <Button
            type="button"
            variant="outline"
            className={`garage-press h-11 px-3 text-xs min-[1200px]:h-9 ${
              shiftOpen
                ? "garage-shift-open border-[#22c55e]/55 bg-[#22c55e]/16 text-[#dcfce7] hover:bg-[#22c55e]/22"
                : "garage-shift-closed border-[#d11a2a]/70 bg-[#d11a2a]/20 text-[#ffe1e5] hover:bg-[#d11a2a]/28"
            }`}
            onClick={prepareShiftDialog}
          >
            {shiftOpen ? (
              <ShieldCheck className="mr-2 size-3.5" />
            ) : (
              <ShieldAlert className="mr-2 size-3.5" />
            )}
            {shiftOpen ? "Shift Aktif" : "Mulai Shift"}
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={themeButtonLabel}
            className={`garage-press h-11 gap-2 border-[#4a4a54] px-3 text-xs min-[1200px]:h-9 ${
              themeMode === "bright"
                ? "bg-[#f5a742]/16 text-[#ffe0ad] hover:bg-[#f5a742]/22"
                : "bg-white/[0.055] text-[#d4d4d8] hover:bg-white/[0.09]"
            }`}
            onClick={() => onThemeChange(themeMode === "bright" ? "dark" : "bright")}
          >
            {themeMode === "bright" ? (
              <Moon className="size-3.5" />
            ) : (
              <SunMedium className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {themeMode === "bright" ? "Gelap" : "Cerah"}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            data-pulse={qrNoticeIsNew ? "true" : "false"}
            aria-label="Buka Operasional QR"
            className={`garage-press h-11 gap-2 px-3 text-xs min-[1200px]:h-9 ${
              waitingCustomerOrderCount
                ? "qr-order-notice border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffe0ad] hover:bg-[#f5a742]/20"
                : "border-[#4a4a54] bg-white/[0.055] text-[#d4d4d8] hover:bg-white/[0.09]"
            }`}
            onClick={() => setQrOperationsOpen(true)}
          >
            <Bell className="size-3.5" />
            <span className="hidden sm:inline">QR / Operasional</span>
            <span className="sm:hidden">QR</span>
            <Badge className={`${waitingCustomerOrderCount ? statusClass.pending_cashier : statusClass.info} px-1.5 text-[10px]`}>
              {waitingCustomerOrderCount}
            </Badge>
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Buka pesanan Bar &amp; Dapur"
            className={`garage-press h-11 gap-2 px-3 text-xs min-[1200px]:h-9 ${
              kitchenTickets.length
                ? "border-[#22c55e]/55 bg-[#22c55e]/14 text-[#bbf7d0] hover:bg-[#22c55e]/20"
                : "border-[#4a4a54] bg-white/[0.055] text-[#d4d4d8] hover:bg-white/[0.09]"
            }`}
            onClick={() => {
              setKitchenPanelOpen(true);
              void loadKitchenTickets();
            }}
          >
            <UtensilsCrossed className="size-3.5" />
            <span className="hidden sm:inline">Bar &amp; Dapur</span>
            <span className="sm:hidden">Siap</span>
            <Badge className="border-[#4a4a54] bg-black/30 px-1.5 text-[10px]">
              {kitchenTickets.length}
            </Badge>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-11 gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-xs text-[#d4d4d8] hover:bg-white/[0.09] min-[1200px]:h-9"
            onClick={() => setTablePrintOpen(true)}
          >
            <QrCode className="size-3.5" />
            <span className="hidden sm:inline">Cetak Meja</span>
          </Button>
          {posNotice ? (
            <Badge
              className="hidden h-9 max-w-[260px] rounded-md border border-[#f5a742]/35 bg-[#f5a742]/12 px-2 text-[10px] text-[#ffe0ad] min-[1200px]:inline-flex"
              title={posNotice}
            >
              <Info className="mr-1.5 size-3" />
              <span className="truncate">{posNotice}</span>
            </Badge>
          ) : null}
          {posNotice ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="garage-press h-11 w-11 border-[#f5a742]/40 bg-[#f5a742]/12 text-[#ffe0ad] min-[1200px]:hidden"
              title={posNotice}
              aria-label={`POS notice: ${posNotice}`}
            >
              <Info className="size-4" />
            </Button>
          ) : null}
          <PosHeaderClock />
          {shiftOpen && (
            <Button
              type="button"
              variant="outline"
              className="garage-press h-11 border-[#f5a742]/45 bg-[#f5a742]/10 px-3 text-xs text-[#ffe0ad] md:hidden"
              onClick={() => setBillOpen(true)}
            >
              <ReceiptText className="mr-2 size-3.5" />
              Keranjang
              <span className="garage-mono ml-2 rounded-full border border-[#f5a742]/35 bg-black/25 px-1.5 text-[10px]">
                {cartItemCount}
              </span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="garage-press h-11 w-11 border-[#4a4a54] bg-white/[0.06] min-[1200px]:hidden"
                aria-label="Buka aksi POS"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Aksi POS</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canAccessModule(me.role, "absensi-v2") && (
                <DropdownMenuItem onClick={() => window.location.assign("/absen")}>
                  <Fingerprint className="mr-2 size-4" />
                  Absen kehadiran
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onThemeChange(themeMode === "bright" ? "dark" : "bright")}
              >
                {themeMode === "bright" ? (
                  <Moon className="mr-2 size-4" />
                ) : (
                  <SunMedium className="mr-2 size-4" />
                )}
                {themeButtonLabel}
              </DropdownMenuItem>
              {!isCashierKiosk && (
                <DropdownMenuItem onClick={() => void exitPosToDashboard()}>
                  <BarChart3 className="mr-2 size-4" />
                  Dashboard
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => void onOrderCreated()}>
                <RefreshCw className="mr-2 size-4" />
                Muat Ulang POS
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={signOutPending}
                onClick={() => void signOutFromPos()}
              >
                <LogOut className="mr-2 size-4" />
                {signOutPending ? "Keluar..." : "Keluar"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Absen = aksi kelas satu: tampak di header kasir termasuk layar gate shift. */}
          {canAccessModule(me.role, "absensi-v2") && (
            <Button
              type="button"
              variant="outline"
              className="garage-press h-9 gap-1.5 border-[#f5a742]/55 bg-[#f5a742]/12 px-3 text-xs font-semibold text-[#ffd08a] hover:bg-[#f5a742]/20"
              onClick={() => window.location.assign("/absen")}
              aria-label="Absen kehadiran"
              title="Absen kehadiran"
            >
              <Fingerprint className="size-3.5" />
              <span className="hidden sm:inline">Absen</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="garage-press hidden h-9 border-[#4a4a54] px-3 text-xs min-[1200px]:inline-flex"
            onClick={() => void exitPosToDashboard()}
          >
            <BarChart3 className="mr-2 size-3.5" />
            Dashboard
          </Button>
          <Button
            type="button"
            variant="outline"
            className="garage-press hidden h-9 border-[#d11a2a]/55 bg-[#d11a2a]/14 px-3 text-xs text-[#ffe1e5] hover:bg-[#d11a2a]/22 min-[1200px]:inline-flex"
            disabled={signOutPending}
            onClick={() => void signOutFromPos()}
          >
            <LogOut className="mr-2 size-3.5" />
            {signOutPending ? "Keluar..." : "Keluar"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="garage-press hidden size-9 rounded-full border-[#4a4a54] bg-white/[0.06] p-0 min-[1200px]:inline-flex"
                aria-label="Profile kasir"
              >
                <span className="garage-mono flex size-7 items-center justify-center rounded-full border border-[#f5a742]/35 bg-[#f5a742]/12 text-[11px] font-semibold text-[#ffd08a]">
                  {profileInitials}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <span className="block truncate">{me.user.name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {me.role} - {me.device}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onThemeChange(themeMode === "bright" ? "dark" : "bright")}
              >
                {themeMode === "bright" ? (
                  <Moon className="mr-2 size-4" />
                ) : (
                  <SunMedium className="mr-2 size-4" />
                )}
                {themeButtonLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void onOrderCreated()}>
                <RefreshCw className="mr-2 size-4" />
                Muat Ulang POS
              </DropdownMenuItem>
              {!isCashierKiosk && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={signOutPending}
                    onClick={() => void signOutFromPos()}
                  >
                    <LogOut className="mr-2 size-4" />
                    {signOutPending ? "Keluar..." : "Keluar"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {signOutError && (
        <Alert className="garage-panel border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertTitle>Keluar gagal</AlertTitle>
          <AlertDescription>{signOutError}</AlertDescription>
        </Alert>
      )}

      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {shiftOpen ? "Tutup / Ganti Shift Kasir" : "Mulai Shift Kasir"}
            </DialogTitle>
            <DialogDescription>
              {shiftOpen
                ? "Hitung uang di laci, isi checklist, lalu tutup shift."
                : "Pilih shift dan isi uang modal awal."}
            </DialogDescription>
          </DialogHeader>
          {shiftOpen ? (
            <CloseShiftForm
              key={closeFormKey}
              sessionCode={cashSession.code}
              cashSessionId={cashSession.id}
              openingCash={cashSession.openingCash}
              isKasir={me.role === "Kasir"}
              isSupervisor={me.role === "Owner" || me.role === "Manajer"}
              activeTableCount={closeShiftActiveTables.length}
              pendingQrCount={waitingCustomerOrderCount}
              canResetAllTables={canResetAllTablesOnClose}
              signOffRequired={shiftSignOffRequired}
              pending={shiftPending}
              error={shiftError}
              onSubmit={closeShift}
              onCorrected={() => void onCashSessionOpened()}
            />
          ) : (
            <form onSubmit={(event) => void openShift(event)} className="space-y-4">
              <ShiftStartStatus
                onShiftNumber={setOpeningShiftNumber}
                onSuggestOpeningCash={(amount) => setOpeningCash(String(amount))}
                managerPin={openShiftManagerPin}
                onManagerPinChange={setOpenShiftManagerPin}
                onResume={resumeOwnShift}
                refreshKey={shiftStatusRefresh}
              />
              <OpeningCashPresetPicker value={openingCash} onChange={setOpeningCash} />
              <OpeningDenominationCount
                counts={openingCounts}
                onChange={setOpeningCounts}
                openingCash={Number(openingCash) || null}
              />
              {shiftError && (
                <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Mulai shift gagal</AlertTitle>
                  <AlertDescription>{shiftError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="garage-press h-11 w-full" disabled={shiftPending}>
                {shiftPending ? "Menyimpan..." : "Mulai Shift & Buka POS"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {!posVisible ? (
        <div className="garage-panel garage-animate-in mx-auto max-w-xl rounded-md p-5">
          <div className="flex items-start gap-3">
            <div className="garage-shift-closed flex size-10 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/18 text-[#ffe1e5]">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <h2 className="garage-display garage-chrome text-2xl">Shift Belum Dibuka</h2>
              <p className="mt-1 text-sm leading-6 text-[#d6d6dc]">
                Mulai shift kasir sebelum transaksi agar uang laci dan laporan closing
                tercatat rapi.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="garage-press mt-5 h-11 w-full"
            onClick={prepareShiftDialog}
          >
            Mulai Shift Kasir
          </Button>
          {me.role === "Owner" ? (
            <Button
              type="button"
              variant="outline"
              data-testid="pos-owner-view"
              className="garage-press mt-2 h-11 w-full border-[#4a4a54] bg-white/[0.06]"
              onClick={() => setOwnerViewing(true)}
            >
              Lihat POS tanpa shift (mode pantau Owner)
            </Button>
          ) : null}
          {canAccessModule(me.role, "absensi-v2") && (
            <Button
              type="button"
              variant="outline"
              className="garage-press mt-2 h-11 w-full gap-2 border-[#f5a742]/55 bg-[#f5a742]/12 text-[#ffd08a] hover:bg-[#f5a742]/20"
              onClick={() => window.location.assign("/absen")}
              aria-label="Absen kehadiran"
            >
              <Fingerprint className="size-4" />
              Absen Kehadiran
            </Button>
          )}
        </div>
      ) : (
        <>
        {!shiftOpen && ownerViewing ? (
          <div
            data-testid="pos-owner-view-banner"
            className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#f5a742]/55 bg-[#f5a742]/12 px-3 py-2 text-sm text-[#ffe0ad]"
          >
            <span className="text-[#ffe0ad]">
              <b className="text-white">Mode pantau Owner</b> — tanpa shift. Bisa melihat menu, pesanan, Bar &amp; Dapur, dan laporan. Transaksi &amp; kas
              butuh Mulai Shift.
            </span>
            <span className="flex gap-2">
              <Button type="button" size="sm" className="h-9" onClick={prepareShiftDialog}>
                Mulai Shift
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setOwnerViewing(false)}>
                Keluar mode pantau
              </Button>
            </span>
          </div>
        ) : null}
        {billOpen && (
          <button
            type="button"
            aria-label="Tutup bill"
            className="fixed inset-0 z-30 bg-black/48 md:hidden"
            onClick={() => setBillOpen(false)}
          />
        )}
        {/* Sticky checkout bar mobile: akses keranjang + TOTAL selalu terlihat
            saat menelusuri menu (bill panel tertutup slide keluar layar). */}
        {!billOpen && cartItemCount > 0 ? (
          <button
            type="button"
            onClick={() => setBillOpen(true)}
            aria-label={`Buka keranjang, ${cartItemCount} item, total ${currency.format(totalDue)}`}
            className="garage-press fixed inset-x-2 bottom-2 z-30 flex items-center gap-3 rounded-xl border border-[#f5a742]/45 bg-[#15151b] px-3 py-2.5 text-left shadow-[0_14px_40px_rgba(0,0,0,0.45)] md:hidden"
          >
            <span className="relative grid size-10 shrink-0 place-items-center rounded-lg bg-[#f5a742]/15 text-[#ffd08a] ring-1 ring-[#f5a742]/35">
              <ShoppingCart className="size-5" />
              <span className="garage-mono absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full border border-[#15151b] bg-[#d11a2a] px-1 text-center text-[10px] font-bold leading-4 text-white">
                {cartItemCount}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] uppercase tracking-wider text-[#b8b8bf]">
                Total Tagihan
              </span>
              <span className="garage-mono block truncate text-lg font-bold leading-tight text-white">
                {currency.format(totalDue)}
              </span>
            </span>
            <span className="shrink-0 rounded-lg bg-[#f5a742] px-3 py-2 text-sm font-bold uppercase tracking-wide text-black">
              Bayar
            </span>
          </button>
        ) : null}
        <Sheet open={qrOperationsOpen} onOpenChange={setQrOperationsOpen}>
          <SheetContent
            side="right"
            data-cashier-theme-scope={cashierTheme}
            className="flex h-dvh !w-full max-w-full flex-col overflow-hidden border-[#34343c] bg-[#0f0f14] p-0 text-[#f4f4f5] sm:!w-[min(92vw,42rem)] sm:!max-w-none lg:!w-[min(86vw,56rem)] xl:!w-[min(82vw,72rem)]"
          >
            <SheetHeader className="border-b border-[#34343c] px-4 py-4 text-left sm:px-5">
              <SheetTitle>Order QR Kasir</SheetTitle>
              <SheetDescription>
                Order QR masuk langsung muncul di daftar. Pilih Terima, Final Bayar, atau Tolak.
              </SheetDescription>
            </SheetHeader>
            <div className="garage-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="garage-panel garage-animate-in rounded-md p-2 sm:p-2.5">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Bell className="size-3.5 text-[#f5a742]" />
                <p className="garage-mono text-[11px] text-[#b8b8bf]">Antrean QR kasir</p>
                <Badge className={`${waitingCustomerOrderCount ? statusClass.pending_cashier : statusClass.info} px-2 text-[10px]`}>
                  {waitingCustomerOrderCount ? `${waitingCustomerOrderCount} baru` : "Kosong"}
                </Badge>
                <span className="hidden text-xs text-[#d6d6dc] md:inline">
                  Order dari scan meja langsung diproses di sini.
                </span>
              </div>
              <p className="mt-1 text-xs text-[#d6d6dc] md:hidden">
                Terima = masuk dapur (KDS), Final Bayar = menutup pembayaran kasir.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Dialog
                open={qrTablesOpen}
                onOpenChange={(open) => {
                  setQrTablesOpen(open);
                  if (open) {
                    setQrPreviewSvg(null);
                    setQrPreviewError(null);
                    setQrPreviewLoading(true);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-9 border-[#f5a742]/45 bg-[#f5a742]/10 px-2.5 text-xs text-[#ffe0ad] sm:h-8"
                  >
                    <QrCode className="mr-1.5 size-3.5" />
                    QR Meja
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>QR Meja</DialogTitle>
                    <DialogDescription>
                      QR meja permanen memakai payload tetap /order?table=XX&source=qr_table. Aksen desain hanya di kartu, bukan di dalam QR.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-white">Cetak semua QR meja</p>
                        <Badge className="border-[#22c55e]/45 bg-[#22c55e]/12 px-2 text-[10px] text-[#dcfce7]">
                          QR Tetap
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                        Base URL aktif: <span className="font-semibold text-white">{qrBaseDisplayUrl}</span>
                      </p>
                      {qrBaseWarning ? (
                        <p className="mt-1 text-xs font-semibold leading-5 text-[#ffd08a]">
                          Warning: base URL belum LAN tetap. Jangan print QR permanen sebelum env public base diset.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-10 border-[#22c55e]/45 bg-[#22c55e]/10 text-[#dcfce7]"
                        asChild
                      >
                        <Link href={pilotQrPrintPath} target="_blank">
                          <Printer className="mr-2 size-4" />
                          Print Pilot
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-10 border-[#f5a742]/45 bg-[#f5a742]/10 text-[#ffe0ad]"
                        asChild
                      >
                        <Link href={qrPrintPath} target="_blank">
                          <Printer className="mr-2 size-4" />
                          Print 50 QR
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                      {tableNumbers.map((table) => (
                        <button
                          key={table}
                          type="button"
                          className={`garage-press h-10 rounded-md border text-sm font-black ${
                            selectedQrTable === table
                              ? "border-[#d11a2a] bg-[#d11a2a] text-white"
                              : "border-[#34343c] bg-[#202027] text-[#d6d6dc]"
                          }`}
                          onClick={() => {
                            setSelectedQrTable(table);
                            setQrPreviewSvg(null);
                            setQrPreviewError(null);
                            setQrPreviewLoading(true);
                          }}
                        >
                          {table}
                        </button>
                      ))}
                    </div>
                    <div className="rounded-md border border-[#34343c] bg-[#f7f3ec] p-3 text-[#111116]">
                      <div className="overflow-hidden border-2 border-[#111116] bg-white shadow-[0_18px_36px_rgba(0,0,0,0.18)]">
                        <div className="h-1.5 bg-gradient-to-r from-[#d11a2a] via-[#f5a742] to-[#111116]" />
                        <div className="flex items-center justify-between gap-3 p-3">
                          <Image
                            src="/garage-brand/garage-coffee-logo-dark.png"
                            alt="Garage Coffee"
                            width={GARAGE_BRAND_LOGO_WIDTH}
                            height={GARAGE_BRAND_LOGO_HEIGHT}
                            sizes="112px"
                            className="h-auto w-28 object-contain"
                          />
                          <span className="border border-[#d11a2a] px-2 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#d11a2a]">
                            QR Tetap
                          </span>
                        </div>
                        <div className="mx-3 grid grid-cols-[minmax(0,1fr)_auto] items-end bg-[#111116] px-3 py-2 text-left text-white">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b8b8bf]">Meja</p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#f5a742]">
                              Scan untuk order
                            </p>
                          </div>
                          <strong className="text-5xl leading-[0.85]">{selectedQrTable}</strong>
                        </div>
                        <div className="mx-auto mt-3 aspect-square w-[min(100%,236px)] border border-[#d1d5db] bg-white p-3">
                        {qrPreviewLoading ? (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs font-semibold text-[#6b7280]">
                            <RefreshCw className="size-8 animate-spin text-[#d11a2a]" />
                            <span>Memuat QR meja...</span>
                          </div>
                        ) : qrPreviewSvg ? (
                          <div
                            aria-label={`QR order Meja ${selectedQrTable}`}
                            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                            dangerouslySetInnerHTML={{ __html: qrPreviewSvg }}
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs font-semibold text-[#374151]">
                            <QrCode className="size-10 text-[#d11a2a]" />
                            <span>{qrPreviewError ?? "QR code belum tampil."}</span>
                            <Link href={selectedQrImagePath} target="_blank" className="text-[#d11a2a] underline">
                              Buka QR
                            </Link>
                          </div>
                        )}
                        </div>
                        <p className="mx-3 mt-3 break-all text-center text-[10px] font-bold leading-4 text-[#5f554b]">
                          {selectedQrOrderDisplayUrl}
                        </p>
                        <div className="mx-3 mt-3 flex items-center justify-between border-t border-[#d8d0c4] py-3">
                          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#5f554b]">
                            GARAGE Coffee
                          </span>
                          <strong className="text-lg text-[#d11a2a]">{selectedQrTable}</strong>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          className="garage-press h-10 bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                          onClick={() => void copyQrOrderUrl(selectedQrTable)}
                        >
                          Salin Link
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="garage-press h-10 border-[#d1d5db] text-[#111827]"
                          asChild
                        >
                          <Link href={selectedQrOrderPath} target="_blank">
                            Test Order
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-9 border-[#4a4a54] px-2.5 text-xs sm:h-8"
                disabled={customerOrdersLoading || qrInsightsLoading || tableLiveLoading}
                onClick={() => {
                  void loadCustomerOrders();
                  void loadQrControlInsights();
                  void loadTableLiveData();
                }}
              >
                <RefreshCw className={`mr-1.5 size-3.5 ${customerOrdersLoading || qrInsightsLoading || tableLiveLoading ? "animate-spin" : ""}`} />
                Muat Ulang QR
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {qrWorkTabs.map((tab) => {
              const active = qrWorkTab === tab.value;
              return (
                <Button
                  key={tab.value}
                  type="button"
                  variant="outline"
                  className={`garage-press h-9 px-2 text-xs ${
                    active
                      ? "border-[#d11a2a]/70 bg-[#d11a2a]/18 text-white"
                      : "border-[#34343c] bg-white/[0.045] text-[#d6d6dc]"
                  }`}
                  onClick={() => {
                    setQrWorkTab(tab.value);
                    if (tab.value === "qr_tables") {
                      setQrTablesOpen(true);
                    }
                  }}
                >
                  {tab.label}
                </Button>
              );
            })}
          </div>

          {qrWorkTab === "qr_control" ? (
          <div className="mt-3 space-y-2">
            <div className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-2">
              <div className="grid gap-2 2xl:grid-cols-[auto_minmax(360px,1fr)_minmax(320px,0.9fr)] 2xl:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0">
                    <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                      QR control hari ini
                    </p>
                    <h3 className="truncate text-sm font-black text-white">
                      Retention + operasional
                    </h3>
                  </div>
                  <Badge className={`${qrInsights?.shiftReport.gate === "WATCH" ? statusClass.warning : statusClass.ready} shrink-0 px-2 text-[11px]`}>
                    {qrInsights?.shiftReport.gate ?? "Memuat"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {[
                    ["Total", qrInsights ? String(qrInsights.summary.total) : "-"],
                    ["Lunas", qrInsights ? String(qrInsights.summary.paid) : "-"],
                    [
                      "Avg",
                      qrInsights?.summary.averageProcessingMinutes == null
                        ? "-"
                        : `${qrInsights.summary.averageProcessingMinutes}m`,
                    ],
                    ["SLA >3m", qrInsights ? String(qrInsights.summary.pendingOverSla) : "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border border-[#303038] bg-black/12 px-2 py-1">
                      <p className="garage-mono text-[11px] uppercase tracking-[0.1em] text-[#8f8f98]">
                        {label}
                      </p>
                      <p className="text-sm font-black text-white">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-1.5 md:grid-cols-3">
                  <Select
                    value={qrInsightFilters.status}
                    onValueChange={(status) =>
                      setQrInsightFilters((current) => ({ ...current, status }))
                    }
                  >
                    <SelectTrigger className="h-8 border-[#34343c] bg-white/[0.04] text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      className={qrControlSelectContentClass}
                      position="popper"
                    >
                      {qrControlStatusFilters.map((filter) => (
                        <SelectItem
                          key={filter.value}
                          value={filter.value}
                          className={qrControlSelectItemClass}
                        >
                          {filter.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={qrInsightFilters.source}
                    onValueChange={(source) =>
                      setQrInsightFilters((current) => ({ ...current, source }))
                    }
                  >
                    <SelectTrigger className="h-8 border-[#34343c] bg-white/[0.04] text-xs">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      className={qrControlSelectContentClass}
                      position="popper"
                    >
                      {qrControlSourceFilters.map((filter) => (
                        <SelectItem
                          key={filter.value}
                          value={filter.value}
                          className={qrControlSelectItemClass}
                        >
                          {filter.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={qrInsightFilters.table}
                    onValueChange={(table) =>
                      setQrInsightFilters((current) => ({ ...current, table }))
                    }
                  >
                    <SelectTrigger className="h-8 border-[#34343c] bg-white/[0.04] text-xs">
                      <SelectValue placeholder="Meja" />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      className={qrControlSelectContentClass}
                      position="popper"
                    >
                      <SelectItem value="all" className={qrControlSelectItemClass}>
                        Semua meja
                      </SelectItem>
                      {tableNumbers.map((table) => (
                        <SelectItem
                          key={table}
                          value={table}
                          className={qrControlSelectItemClass}
                        >
                          Meja {table}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <details className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-2">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                      Laporan shift
                    </p>
                    <p className="truncate text-xs font-semibold text-white">
                      QR end-shift check
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[#f5a742]">
                    <span className="text-[10px] font-semibold text-[#ffd08a]">Detail</span>
                    <FileText className="size-4" />
                  </div>
                </div>
              </summary>
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="garage-press h-8 border-[#4a4a54] px-2 text-[11px]"
                  disabled={shiftHandoverPending}
                  onClick={() => void createShiftHandover()}
                >
                  {shiftHandoverPending ? "Simpan..." : "Simpan"}
                </Button>
              </div>
              <div className="mt-2 space-y-1.5">
                {(qrInsights?.shiftReport.lines ?? ["Insight QR sedang dimuat."]).map((line) => (
                  <p
                    key={line}
                    className="rounded-md border border-[#303038] bg-black/12 px-2 py-1.5 text-xs leading-5 text-[#d6d6dc]"
                  >
                    {line}
                  </p>
                ))}
              </div>
            </details>
          </div>
          ) : null}

          {customerOrderError ? (
            <Alert className="mt-2 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Order QR gagal dimuat</AlertTitle>
              <AlertDescription>{customerOrderError}</AlertDescription>
            </Alert>
          ) : null}

          {qrInsightsError ? (
            <Alert className="mt-2 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>QR control gagal</AlertTitle>
              <AlertDescription>{qrInsightsError}</AlertDescription>
            </Alert>
          ) : null}

          {tableLiveError ? (
            <Alert className="mt-2 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Peta meja gagal dimuat</AlertTitle>
              <AlertDescription>{tableLiveError}</AlertDescription>
            </Alert>
          ) : null}

          {qrWorkTab === "incoming" ? (
          <div className="mt-2 space-y-2">
            {customerOrders.length ? (
              customerOrders.map((order) => {
                const busyAction = customerOrderActionId?.startsWith(`${order.id}:`);
                const itemSummary = order.items
                  .map((item) => `${item.qty}x ${item.itemName}`)
                  .join(", ");
                const canAccept = canAcceptCustomerOrder(order);
                const canReject = canRejectCustomerOrder(order, me.role);
                const canFinalize = canFinalizeCustomerOrder(order);

                return (
                  <article
                    key={order.id}
                    className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  >
                    <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-3 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-center">
                      <span className="garage-mono flex size-12 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/18 text-lg font-black text-white">
                        {compactTableNumber(order.tableLabel)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-black text-white">
                            {order.tableLabel}
                          </h3>
                          <Badge className={`${statusClass[order.orderSource] ?? statusClass.info} shrink-0 px-2 text-[10px]`}>
                            {order.customerMode}
                          </Badge>
                        </div>
                        <p className="garage-mono mt-0.5 truncate text-[10px] text-[#8f8f98]">
                          {order.orderNo}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[#d0d0d6]">
                          {order.customerName ?? "Pelanggan"} - {order.customerPhone ?? "Tanpa WA"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge className={`${statusClass[order.status] ?? statusClass.warning} px-2 text-[10px]`}>
                            {customerOrderPaymentStatusLabel(order)}
                          </Badge>
                          <Badge className="border-[#f5a742]/40 bg-[#f5a742]/12 px-2 text-[10px] text-[#ffd08a]">
                            {customerOrderPaymentLabel(order)}
                          </Badge>
                          {order.paymentProvider ? (
                            <Badge className="garage-mono border-[#4a4a54] bg-[#202027] px-2 text-[10px] text-[#d6d6dc]">
                              {order.paymentProvider}
                            </Badge>
                          ) : null}
                          {order.paymentReference ? (
                            <Badge className="garage-mono border-[#4a4a54] bg-[#202027] px-2 text-[10px] text-[#d6d6dc]">
                              Ref {order.paymentReference}
                            </Badge>
                          ) : null}
                          <Badge className="garage-mono border-[#22c55e]/35 bg-[#22c55e]/10 px-2 text-[10px] text-[#dcfce7]">
                            {customerOrderInvoiceNo(order)}
                          </Badge>
                        </div>
                      </div>
                      <p className="col-span-2 text-left text-lg font-black text-white sm:col-span-1 sm:text-right">
                        {currency.format(order.total)}
                      </p>
                    </div>
                    <div className="mt-3 rounded-md border border-[#303038] bg-black/12 px-3 py-2">
                      <p className="line-clamp-2 text-xs leading-5 text-[#d6d6dc]">
                        {itemSummary}
                      </p>
                    </div>
                    {order.fulfillment === "delivery" ? (
                      <div className="mt-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/[0.07] px-3 py-2 text-xs leading-5 text-white">
                        <p className="break-words">
                          <span className="font-black text-[#ffd79a]">DELIVERY · Antar ke:</span>{" "}
                          {order.deliveryAddress ?? "-"}
                        </p>
                        <p className="mt-0.5 text-[#d0d0d6]">
                          Ongkir {currency.format(order.deliveryFee ?? 0)} · wajib QRIS dulu
                          {order.deliveryStatus
                            ? ` · ${deliveryStatusLabel[order.deliveryStatus] ?? order.deliveryStatus}`
                            : ""}
                          {order.courierName ? ` · Kurir ${order.courierName}` : order.status === "paid" ? " · Belum ada kurir" : ""}
                        </p>
                      </div>
                    ) : order.fulfillment === "takeaway" && order.status !== "paid" ? (
                      <p className="mt-2 text-xs font-semibold text-[#ffd79a]">
                        TAKE AWAY · wajib lunas dulu (QRIS/Transfer dicek, atau bayar di kasir).
                      </p>
                    ) : null}
                    {order.customerNote ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#ffd08a]">
                        Catatan: {order.customerNote}
                      </p>
                    ) : null}
                    {order.paymentProofUrl ? (
                      <a
                        href={order.paymentProofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="pos-payment-proof"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#22c55e]/45 bg-[#22c55e]/10 px-2.5 py-1 text-xs font-bold text-[#bbf7d0] hover:bg-[#22c55e]/18"
                      >
                        Bukti transfer ✓ · Lihat
                      </a>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="garage-press h-9 flex-1 basis-[96px] border-[#4a4a54] px-2 text-[11px]"
                        onClick={() => setSelectedCustomerOrderId(order.id)}
                      >
                        Detail
                      </Button>
                      {canAccept ? (
                        <Button
                          type="button"
                          size="sm"
                          className="garage-press h-9 flex-1 basis-[96px] px-2 text-[11px]"
                          disabled={Boolean(busyAction)}
                          onClick={() => void decideCustomerOrder(order, "accept")}
                        >
                          Terima
                        </Button>
                      ) : null}
                      {canFinalize ? (
                        <Button
                          type="button"
                          size="sm"
                          className="garage-press h-9 flex-[1.4] basis-[120px] bg-[#22c55e] px-2 text-[11px] text-white hover:bg-[#16a34a]"
                          disabled={Boolean(busyAction)}
                          onClick={() => openFinalizeDialog(order)}
                        >
                          Final Bayar
                        </Button>
                      ) : null}
                      {canReject ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="garage-press h-9 flex-1 basis-[96px] border-[#4a4a54] px-2 text-[11px]"
                          disabled={Boolean(busyAction)}
                          onClick={() => openRejectDialog(order)}
                        >
                          Tolak
                        </Button>
                      ) : null}
                    </div>
                    {order.whatsappInvoiceUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="garage-press mt-2 h-8 w-full border-[#22c55e]/40 bg-[#22c55e]/12 px-2 text-[11px] text-[#dcfce7]"
                        asChild
                      >
                        <a href={order.whatsappInvoiceUrl} target="_blank" rel="noreferrer">
                          <MessageCircle className="mr-1.5 size-3.5" />
                          Kirim link invoice WA
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="garage-press mt-2 h-8 w-full border-[#4a4a54] px-2 text-[11px] text-[#b8b8bf]"
                        disabled
                      >
                        <MessageCircle className="mr-1.5 size-3.5" />
                        WA invoice belum siap
                      </Button>
                    )}
                    {order.invoiceWebUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="garage-press mt-2 h-8 w-full border-[#f5a742]/40 bg-[#f5a742]/12 px-2 text-[11px] text-[#ffe7b8]"
                        asChild
                      >
                        <a href={order.invoiceWebUrl} target="_blank" rel="noreferrer">
                          <FileText className="mr-1.5 size-3.5" />
                          Tracking Invoice
                        </a>
                      </Button>
                    ) : order.invoicePdfUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="garage-press mt-2 h-8 w-full border-[#f5a742]/40 bg-[#f5a742]/12 px-2 text-[11px] text-[#ffe7b8]"
                        asChild
                      >
                        <a href={order.invoicePdfUrl} target="_blank" rel="noreferrer">
                          <FileText className="mr-1.5 size-3.5" />
                          Invoice PDF
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="garage-press mt-2 h-8 w-full border-[#4a4a54] px-2 text-[11px] text-[#b8b8bf]"
                        disabled
                      >
                        <FileText className="mr-1.5 size-3.5" />
                        Tracking belum dibuat
                      </Button>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="flex min-h-56 items-center justify-between gap-3 rounded-md border border-dashed border-[#4a4a54] bg-[#101016]/60 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Belum ada order QR</p>
                  <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                    Saat customer scan meja dan kirim order, kartu order akan muncul di sini.
                  </p>
                </div>
                <QrCode className="size-9 shrink-0 text-[#4a4a54]" />
              </div>
            )}
          </div>
          ) : null}

          {qrWorkTab === "history" ? (
            <div className="mt-2 space-y-2">
              {qrInsights?.recentOrders.length ? (
                qrInsights.recentOrders.map((order) => {
                  const itemSummary = order.items
                    .map((item) => `${item.qty}x ${item.itemName}`)
                    .join(", ");
                  const canAccept = canAcceptCustomerOrder(order);
                  const canReject = canRejectCustomerOrder(order, me.role);
                  const canFinalize = canFinalizeCustomerOrder(order);
                  const busyAction = customerOrderActionId?.startsWith(`${order.id}:`);

                  return (
                    <article
                      key={order.id}
                      className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-3"
                    >
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-black text-white">
                              {order.orderNo} - {order.tableLabel}
                            </h3>
                            <Badge className={`${statusClass[order.status] ?? statusClass.info} px-2 text-[10px]`}>
                              {order.status}
                            </Badge>
                            <Badge className="border-[#f5a742]/40 bg-[#f5a742]/12 px-2 text-[10px] text-[#ffd08a]">
                              {customerOrderPaymentLabel(order)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-[#b8b8bf]">
                            {order.customerName ?? "Pelanggan"} - {formatReceiptDate(order.createdAt)}
                          </p>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#d6d6dc]">
                            {itemSummary || "Tidak ada item."}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-base font-black text-white">{currency.format(order.total)}</p>
                          <p className="garage-mono mt-1 text-[10px] text-[#8f8f98]">
                            {customerOrderInvoiceNo(order)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="garage-press h-8 flex-1 basis-[88px] border-[#4a4a54] px-2 text-[11px]"
                          onClick={() => setSelectedCustomerOrderId(order.id)}
                        >
                          Detail
                        </Button>
                        {canAccept ? (
                          <Button
                            type="button"
                            size="sm"
                            className="garage-press h-8 flex-1 basis-[88px] px-2 text-[11px]"
                            disabled={Boolean(busyAction)}
                            onClick={() => void decideCustomerOrder(order, "accept")}
                          >
                            Terima
                          </Button>
                        ) : null}
                        {canFinalize ? (
                          <Button
                            type="button"
                            size="sm"
                            className="garage-press h-8 flex-1 basis-[104px] bg-[#22c55e] px-2 text-[11px] text-white hover:bg-[#16a34a]"
                            disabled={Boolean(busyAction)}
                            onClick={() => openFinalizeDialog(order)}
                          >
                            Final Bayar
                          </Button>
                        ) : null}
                        {canReject ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="garage-press h-8 flex-1 basis-[88px] border-[#4a4a54] px-2 text-[11px]"
                            disabled={Boolean(busyAction)}
                            onClick={() => openRejectDialog(order)}
                          >
                            Tolak
                          </Button>
                        ) : null}
                        {order.invoiceWebUrl ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="garage-press h-8 flex-1 basis-[112px] border-[#f5a742]/40 bg-[#f5a742]/12 px-2 text-[11px] text-[#ffe7b8]"
                            asChild
                          >
                            <a href={order.invoiceWebUrl} target="_blank" rel="noreferrer">
                              Tracking
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="flex min-h-52 items-center justify-between gap-3 rounded-md border border-dashed border-[#4a4a54] bg-[#101016]/60 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Riwayat order digital kosong</p>
                    <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                      History transaksi dari QR/menu digital akan tampil di sini setelah ada order hari ini.
                    </p>
                  </div>
                  <FileText className="size-9 shrink-0 text-[#4a4a54]" />
                </div>
              )}
            </div>
          ) : null}

          {qrWorkTab === "table_map" ? (
            <div className="mt-2 rounded-md border border-[#34343c] bg-[#15151b]/84 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="garage-mono text-[11px] uppercase tracking-[0.16em] text-[#b8b8bf]">
                    Cek meja
                  </p>
                  <h3 className="mt-1 text-base font-black text-white">
                    {tableMapRows.length} meja outlet
                  </h3>
                  {tableLiveUpdatedAt ? (
                    <p className="mt-0.5 text-[10px] text-[#8f8f98]">
                      Terakhir update{" "}
                      {(() => {
                        const secs = Math.max(
                          0,
                          Math.round((nowTick - tableLiveUpdatedAt) / 1000),
                        );
                        return secs < 60
                          ? `${secs}s lalu`
                          : `${Math.floor(secs / 60)}m lalu`;
                      })()}
                    </p>
                  ) : null}
                </div>
                {/* Ringkasan cepat: kosong / terisi / perlu bersih */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#22c55e]/45 bg-[#22c55e]/12 px-2 py-1 text-[11px] font-semibold text-[#dcfce7]">
                    <span className="size-2 rounded-full bg-[#22c55e]" />
                    {tableMapCounts.empty} kosong
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-2 py-1 text-[11px] font-semibold text-[#ffc2c8]">
                    <span className="size-2 rounded-full bg-[#d11a2a]" />
                    {tableMapCounts.occupied} terisi
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/12 px-2 py-1 text-[11px] font-semibold text-[#ffd08a]">
                    <span className="size-2 rounded-full bg-[#f5a742]" />
                    {tableMapCounts.cleaning} perlu bersih
                  </span>
                </div>
              </div>

              {/* Peringatan data belum sinkron: grid sedang pakai fallback 50 meja
                  kosong, jangan sampai kasir salah kira semua meja benar-benar kosong. */}
              {!tableLiveDataReady ? (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/12 px-3 py-2 text-[11px] font-semibold text-[#ffd08a]">
                  <RefreshCw
                    className={`size-3.5 shrink-0 ${tableLiveLoading ? "animate-spin" : ""}`}
                  />
                  {tableLiveLoading
                    ? "Menyinkronkan status meja…"
                    : tableLiveError
                      ? "Status meja gagal dimuat — menampilkan data sementara. Tekan Muat Ulang QR."
                      : "Status meja belum sinkron — menampilkan data sementara."}
                </div>
              ) : null}

              {/* Filter chips */}
              <div className="garage-scroll-x mt-3 flex gap-1.5 pb-0.5">
                {([
                  { value: "all", label: `Semua (${tableMapRows.length})` },
                  { value: "empty", label: `Kosong (${tableMapCounts.empty})` },
                  { value: "occupied", label: `Terisi (${tableMapCounts.occupied})` },
                  { value: "cleaning", label: `Perlu bersih (${tableMapCounts.cleaning})` },
                ] as const).map((chip) => {
                  const active = tableMapFilter === chip.value;
                  return (
                    <Button
                      key={chip.value}
                      type="button"
                      size="sm"
                      variant="outline"
                      className={`garage-press min-h-11 shrink-0 px-3 text-[13px] ${
                        active
                          ? "border-white/45 bg-white/12 text-white"
                          : "border-[#34343c] bg-white/[0.045] text-[#d6d6dc]"
                      }`}
                      aria-pressed={active}
                      onClick={() => setTableMapFilter(chip.value)}
                    >
                      {chip.label}
                    </Button>
                  );
                })}
              </div>

              {tableLiveLoading && !tableLiveDataReady ? (
                <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
                  {Array.from({ length: 20 }).map((_, index) => (
                    <div
                      key={index}
                      className="min-h-[76px] w-full animate-pulse rounded-md border border-[#34343c] bg-white/[0.05] motion-reduce:animate-none sm:min-h-[80px]"
                    />
                  ))}
                </div>
              ) : (
              <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
                {tableMapRows
                  .filter((table) => {
                    if (tableMapFilter === "all") return true;
                    const cleaning = tableNeedsCleaning(table);
                    const empty =
                      table.status === "empty" && !tableHasLiveSession(table);
                    if (tableMapFilter === "cleaning") return cleaning;
                    if (tableMapFilter === "empty") return empty;
                    return !empty && !cleaning;
                  })
                  .map((table) => {
                  const availability = tableAvailabilityState(table, tableLiveDataReady);
                  const isEmpty = availability === "ready" || (!tableLiveDataReady && table.status === "empty");
                  // Bill belum lunas lama: amber ≥30 menit, merah ≥60 menit.
                  const openBill = availability === "bill" || availability === "full";
                  const waitTone =
                    table.staleFromPreviousDay || (openBill && table.timerMinutes >= 60)
                      ? "late"
                      : openBill && table.timerMinutes >= 30
                        ? "watch"
                        : "ok";
                  // Warna PDF owner (sama dengan menu digital & waiter).
                  const toneClass =
                    availability === "cleaning"
                      ? "border-[#9ca3af]/65 bg-[#9ca3af]/12"
                      : availability === "held"
                        ? "border-[#facc15]/70 bg-[#facc15]/10"
                        : availability === "reserved"
                          ? "border-[#3b82f6]/70 bg-[#3b82f6]/12"
                          : availability === "paid" || openBill
                            ? "border-[#ef4444]/65 bg-[#ef4444]/10"
                            : isEmpty
                              ? "border-[#22c55e]/50 bg-[#22c55e]/[0.07]"
                              : "border-[#4a4a54] bg-white/[0.035]";
                  const statusText = table.staleFromPreviousDay
                    ? "Cek kasir · bill kemarin"
                    : tableAvailabilityLabel(availability);
                  const barClass =
                    availability === "cleaning"
                      ? "bg-[#9ca3af]"
                      : availability === "held"
                        ? "bg-[#facc15]"
                        : availability === "reserved"
                          ? "bg-[#3b82f6]"
                          : availability === "paid" || openBill
                            ? "bg-[#ef4444]"
                            : isEmpty
                              ? "bg-[#22c55e]"
                              : "bg-[#4a4a54]";
                  return (
                    <button
                      key={table.tableNumber}
                      type="button"
                      className={`garage-press relative min-h-[96px] w-full overflow-hidden rounded-md border p-2 pl-2.5 text-left transition hover:brightness-125 ${toneClass}`}
                      aria-label={`Meja ${table.tableNumber}, ${statusText}${
                        table.total > 0 ? `, ${currency.format(table.total)}` : ""
                      }. Buka detail.`}
                      onClick={() => openTableDetail(table)}
                    >
                      <span className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${barClass}`} aria-hidden />
                      <div className="flex items-start justify-between gap-1">
                        <TablePlate number={table.tableNumber} size="sm" />
                        <span className="pos-table-indicator mt-1" data-state={availability} aria-hidden="true" />
                      </div>
                      <p
                        className={`mt-1 line-clamp-2 text-[11px] font-semibold leading-tight ${
                          table.staleFromPreviousDay
                            ? "text-[#ffb3b3]"
                            : availability === "cleaning"
                              ? "text-[#e5e7eb]"
                              : availability === "held"
                                ? "text-[#fef08a]"
                                : availability === "reserved"
                                  ? "text-[#bfdbfe]"
                                  : openBill || availability === "paid"
                                    ? "text-[#fecaca]"
                                    : isEmpty
                                      ? "text-[#bbf7d0]"
                                      : "text-[#e4e4e7]"
                        }`}
                      >
                        {statusText}
                      </p>
                      {(table.billTotal ?? 0) > 0 ? (
                        <p className="garage-mono mt-0.5 truncate text-[11px] font-semibold text-white">
                          {currency.format(table.billTotal ?? 0)}
                        </p>
                      ) : null}
                      {table.idleWarning && !table.staleFromPreviousDay ? (
                        <span className="mt-1 inline-block rounded-sm bg-[#facc15] px-1 py-0.5 text-[10px] font-bold leading-none text-[#1a1400]">
                          Cek meja · {formatTableDuration(table.idleMinutes ?? 0)} diam
                        </span>
                      ) : null}
                      {table.currentOrderId && table.timerMinutes > 0 && !table.staleFromPreviousDay ? (
                        <span
                          className={`garage-mono mt-1 inline-block rounded-sm px-1 py-0.5 text-[11px] font-bold leading-none ${
                            waitTone === "late"
                              ? "bg-[#d11a2a] text-white"
                              : waitTone === "watch"
                                ? "bg-[#f5a742] text-[#1a1000]"
                                : "bg-black/35 text-white/85"
                          }`}
                        >
                          {formatTableDuration(table.timerMinutes)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              )}

              {/* Keterangan warna meja (sama dengan peta meja waiter). */}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#34343c] pt-2 text-[11px] text-[#b8b8bf]">
                {(["ready", "held", "bill", "reserved", "cleaning"] as const).map((state) => (
                  <span key={state} className="inline-flex items-center gap-1.5">
                    <span className="pos-table-indicator" data-state={state} aria-hidden="true" />
                    {state === "bill" ? "Terisi" : tableAvailabilityLabel(state)}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span className="garage-mono rounded-sm bg-[#d11a2a] px-1 text-[10px] font-bold text-white">1j</span>
                  Belum bayar &gt; 60 menit
                </span>
                <span className="ml-auto hidden sm:inline">Tap meja untuk detail &amp; aksi</span>
              </div>
            </div>
          ) : null}

          {qrInsights?.pendingAlerts.length ? (
            <Alert className="mt-2 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
              <Timer className="size-4 text-[#ffb0b8]" />
              <AlertTitle>
                {qrInsights.pendingAlerts.length} pending QR melewati SLA {qrInsights.pendingSlaMinutes} menit
              </AlertTitle>
              <AlertDescription>
                {qrInsights.pendingAlerts
                  .slice(0, 3)
                  .map((order) => `${order.tableLabel} ${order.orderNo} ${order.minutesWaiting}m`)
                  .join(" | ")}
              </AlertDescription>
            </Alert>
          ) : null}

          {qrInsights ? (
            <div className="mt-2 space-y-2">
              {qrWorkTab === "qr_control" ? (
              <div className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">Meja dan kendala QR</p>
                  <Badge className="garage-mono border-[#4a4a54] bg-white/[0.06] px-2 text-[10px] text-[#d4d4d8]">
                    {qrInsights.rangeLabel}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    {qrInsights.topTables.length ? (
                      qrInsights.topTables.map((table) => (
                        <div
                          key={table.tableLabel}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-[#303038] bg-black/12 p-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">{table.tableLabel}</p>
                            <p className="garage-mono mt-0.5 text-[10px] text-[#8f8f98]">
                              {table.total} order - {table.paid} paid - {table.rejected} reject
                            </p>
                          </div>
                          <p className="garage-mono text-xs font-semibold text-[#dcfce7]">
                            {currency.format(table.revenue)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md border border-dashed border-[#4a4a54] p-2 text-xs text-[#b8b8bf]">
                        Belum ada meja aktif hari ini.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    {qrInsights.rejectedReasons.length ? (
                      qrInsights.rejectedReasons.map((item) => (
                        <div
                          key={item.reason}
                          className="flex items-center justify-between gap-3 rounded-md border border-[#303038] bg-black/12 p-2"
                        >
                          <p className="line-clamp-2 text-xs leading-5 text-[#d6d6dc]">{item.reason}</p>
                          <Badge className={`${statusClass.rejected} shrink-0 px-2 text-[10px]`}>
                            {item.count}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md border border-dashed border-[#4a4a54] p-2 text-xs text-[#b8b8bf]">
                        Belum ada reject hari ini.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              ) : null}

              {qrWorkTab === "follow_up" ? (
                <div className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">Pelanggan kembali</p>
                      <p className="mt-0.5 text-xs text-[#b8b8bf]">Follow-up WhatsApp manual</p>
                    </div>
                    <Badge className={`${statusClass[qrInsights.summary.repeatGuests ? "warning" : "info"]} px-2 text-[10px]`}>
                      {qrInsights.summary.repeatGuests} tamu kembali
                    </Badge>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {qrInsights.repeatCustomers.length ? (
                      qrInsights.repeatCustomers.slice(0, 4).map((customer) => (
                        <div
                          key={customer.phone}
                          className="rounded-md border border-[#303038] bg-black/12 p-2"
                        >
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-white">{customer.name}</p>
                              <p className="garage-mono mt-0.5 truncate text-[10px] text-[#8f8f98]">
                                {customer.phone} - {customer.totalOrders} order - {customer.favoriteItem}
                              </p>
                            </div>
                            <Badge className={`${customer.isMember ? statusClass.paid : statusClass.warning} shrink-0 px-2 text-[10px]`}>
                              {customer.label}
                            </Badge>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#d6d6dc]">
                            {customer.suggestedAction}
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            {customer.whatsapp.receiptUrl ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="garage-press h-8 border-[#22c55e]/40 bg-[#22c55e]/10 px-2 text-[11px] text-[#dcfce7]"
                                asChild
                              >
                                <a href={customer.whatsapp.receiptUrl} target="_blank" rel="noreferrer">
                                  Receipt
                                </a>
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="garage-press h-8 border-[#4a4a54] px-2 text-[11px]"
                              asChild
                            >
                              <a href={customer.whatsapp.promoUrl} target="_blank" rel="noreferrer">
                                Promo
                              </a>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="garage-press h-8 border-[#4a4a54] px-2 text-[11px]"
                              asChild
                            >
                              <a href={customer.whatsapp.reviewUrl} target="_blank" rel="noreferrer">
                                Review
                              </a>
                            </Button>
                            {!customer.isMember ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="garage-press h-8 border-[#f5a742]/45 bg-[#f5a742]/10 px-2 text-[11px] text-[#ffe0ad]"
                                asChild
                              >
                                <a href={customer.whatsapp.memberUrl} target="_blank" rel="noreferrer">
                                  Member
                                </a>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md border border-dashed border-[#4a4a54] p-2 text-xs leading-5 text-[#b8b8bf]">
                        Repeat customer muncul setelah ada order QR paid atau nomor yang sama order ulang.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {showQrNotice ? (
            <Alert
              key={customerOrderNoticeKey}
              data-pulse={qrNoticeIsNew ? "true" : "false"}
              className="qr-order-notice mb-3 border-[#f5a742]/55 bg-[#f5a742]/12 text-[#ffe9c7]"
              role="status"
            >
              <Bell className="size-4 text-[#f5a742]" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <AlertTitle>{waitingCustomerOrderCount} QR order menunggu kasir</AlertTitle>
                  <AlertDescription>
                    Detail bisa dibuka dari kartu order. Terima untuk masuk dapur (KDS).
                  </AlertDescription>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    aria-label="Buka QR Orders dari notifikasi"
                    className="garage-press h-8 bg-[#f5a742] px-2 text-[11px] text-[#111116] hover:bg-[#ffd08a]"
                    onClick={() => setQrOrdersOpen(true)}
                  >
                    Buka QR Orders
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="garage-press h-8 border-[#f5a742]/35 bg-black/20 px-2 text-[11px] text-[#ffe0ad] hover:bg-[#f5a742]/12"
                    onClick={() => setDismissedQrNoticeKey(customerOrderNoticeKey)}
                  >
                    Tutup
                  </Button>
                </div>
              </div>
            </Alert>
          ) : null}

          <Dialog open={qrOrdersOpen} onOpenChange={setQrOrdersOpen}>
            <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] p-0 sm:max-w-4xl">
              <DialogHeader className="border-b border-[#34343c] px-4 pb-3 pt-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <DialogTitle>QR Orders</DialogTitle>
                    <DialogDescription>
                      Order customer dari scan meja/menu digital. Proses cepat tanpa memenuhi layar POS.
                    </DialogDescription>
                  </div>
                  <Badge className={`${waitingCustomerOrderCount ? statusClass.pending_cashier : statusClass.info} shrink-0 px-2 text-[10px]`}>
                    {waitingCustomerOrderCount ? `${waitingCustomerOrderCount} menunggu` : "Kosong"}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#34343c] bg-white/[0.04] p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      Antrean QR kasir
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-[#b8b8bf]">
                      Terima = masuk dapur (KDS), Lunas = order yang langsung dibayar.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-9 border-[#4a4a54] px-2.5 text-xs"
                    disabled={customerOrdersLoading}
                    onClick={() => void loadCustomerOrders()}
                  >
                    <RefreshCw className={`mr-1.5 size-3.5 ${customerOrdersLoading ? "animate-spin" : ""}`} />
                    Muat ulang
                  </Button>
                </div>

                {customerOrderError ? (
                  <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                    <AlertTriangle className="size-4 text-[#ff8a95]" />
                    <AlertTitle>QR Orders gagal sync</AlertTitle>
                    <AlertDescription>{customerOrderError}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="garage-scroll min-h-0 flex-1 overflow-y-auto pr-1">
                  {customerOrders.length ? (
                    <div className="grid gap-2 xl:grid-cols-2">
                      {customerOrders.map((order) => {
                        const busyAction = customerOrderActionId?.startsWith(`${order.id}:`);
                        const itemSummary = order.items
                          .map((item) => `${item.qty}x ${item.itemName}`)
                          .join(", ");
                        return (
                          <article
                            key={order.id}
                            className="garage-hover-lift cursor-pointer rounded-md border border-[#34343c] bg-[#15151b]/84 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5a742]/70"
                            tabIndex={0}
                            onClick={() => {
                              setQrOrdersOpen(false);
                              setSelectedCustomerOrderId(order.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setQrOrdersOpen(false);
                                setSelectedCustomerOrderId(order.id);
                              }
                            }}
                          >
                            <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3">
                              <span className="garage-mono flex size-12 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/18 text-lg font-black text-white">
                                {compactTableNumber(order.tableLabel)}
                              </span>
                              <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <h3 className="break-words text-base font-black text-white">{order.tableLabel}</h3>
                                  {customerOrderFulfillmentLabel(order) ? (
                                    <Badge className="shrink-0 border-[#f5a742]/55 bg-[#f5a742]/16 px-2 text-xs font-black text-[#ffd79a]">
                                      {customerOrderFulfillmentLabel(order)}
                                    </Badge>
                                  ) : null}
                                  <Badge className={`${statusClass[order.orderSource] ?? statusClass.info} shrink-0 px-2 text-xs`}>
                                    {order.customerMode}
                                  </Badge>
                                </div>
                                <p className="garage-mono mt-0.5 break-all text-xs text-[#d0d0d6]">
                                  {order.orderNo}
                                </p>
                                <p className="mt-0.5 break-words text-sm text-[#e4e4ea]">
                                  {order.customerName ?? "Pelanggan"} - {order.customerPhone ?? "Tanpa WA"}
                                </p>
                                {order.eventTitle ? <p className="mt-1 break-words text-sm font-semibold text-[#ffd08a]">Event: {order.eventTitle}</p> : null}
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  <Badge className={`${statusClass[order.status] ?? statusClass.warning} px-2 text-xs`}>
                                    {customerOrderPaymentStatusLabel(order)}
                                  </Badge>
                                  <Badge className="border-[#f5a742]/40 bg-[#f5a742]/12 px-2 text-xs text-[#ffd08a]">
                                    {customerOrderPaymentLabel(order)}
                                  </Badge>
                                  {order.paymentProvider ? (
                                    <Badge className="garage-mono border-[#4a4a54] bg-[#202027] px-2 text-xs text-[#d6d6dc]">
                                      {order.paymentProvider}
                                    </Badge>
                                  ) : null}
                                  {order.paymentReference ? (
                                    <Badge className="garage-mono border-[#4a4a54] bg-[#202027] px-2 text-xs text-[#d6d6dc]">
                                      Ref {order.paymentReference}
                                    </Badge>
                                  ) : null}
                                  <Badge className="garage-mono border-[#4a4a54] bg-[#202027] px-2 text-xs text-[#d6d6dc]">
                                    {customerOrderInvoiceNo(order)}
                                  </Badge>
                                </div>
                              </div>
                              <p className="shrink-0 text-right text-base font-black text-white">
                                {currency.format(order.total)}
                              </p>
                            </div>
                            <div className="mt-3 rounded-md border border-[#303038] bg-black/12 px-3 py-2">
                              <p className="line-clamp-3 break-words text-sm text-[#e4e4ea]">{itemSummary}</p>
                            </div>
                            {order.customerNote ? (
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#ffd08a]">
                                Catatan: {order.customerNote}
                              </p>
                            ) : null}
                            {order.paymentProofUrl ? (
                              <a
                                href={order.paymentProofUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid="pos-payment-proof"
                                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#22c55e]/45 bg-[#22c55e]/10 px-2.5 py-1 text-xs font-bold text-[#bbf7d0] hover:bg-[#22c55e]/18"
                              >
                                Bukti transfer ✓ · Lihat
                              </a>
                            ) : null}
                            {order.fulfillment === "delivery" ? (
                              <div className="mt-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/[0.07] px-3 py-2 text-xs leading-5 text-white">
                                <p className="break-words">
                                  <span className="font-black text-[#ffd79a]">Antar ke:</span> {order.deliveryAddress ?? "-"}
                                </p>
                                <p className="mt-0.5 text-[#d0d0d6]">
                                  Ongkir {currency.format(order.deliveryFee ?? 0)} · wajib QRIS
                                  {order.deliveryStatus ? ` · ${deliveryStatusLabel[order.deliveryStatus] ?? order.deliveryStatus}` : ""}
                                  {order.courierName ? ` · Kurir ${order.courierName}` : order.status === "paid" ? " · Belum ada kurir" : ""}
                                </p>
                              </div>
                            ) : order.fulfillment === "takeaway" && order.status !== "paid" ? (
                              <p className="mt-2 text-xs font-semibold text-[#ffd79a]">
                                Take away: wajib lunas dulu, baru pesanan dibuat.
                              </p>
                            ) : null}
                            <div className="mt-3 grid grid-cols-4 gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="garage-press h-9 border-[#4a4a54] px-2 text-[11px]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setQrOrdersOpen(false);
                                  setSelectedCustomerOrderId(order.id);
                                }}
                              >
                                Detail
                              </Button>
                              {canAcceptCustomerOrder(order) ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="garage-press h-9 px-2 text-[11px]"
                                  disabled={Boolean(busyAction)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void decideCustomerOrder(order, "accept");
                                  }}
                                >
                                  Terima
                                </Button>
                              ) : order.fulfillment === "delivery" && order.status === "paid" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="garage-press h-9 px-2 text-[11px]"
                                  disabled={Boolean(busyAction) || Boolean(customerOrderActionId)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void setDeliveryStatus(
                                      order,
                                      order.deliveryStatus === "on_the_way" ? "delivered" : "on_the_way",
                                    );
                                  }}
                                >
                                  {order.deliveryStatus === "on_the_way" ? "Selesai antar" : "Mulai antar"}
                                </Button>
                              ) : (
                                <span className="inline-flex h-9 items-center justify-center rounded-md border border-[#34343c] px-1 text-center text-[10px] font-bold leading-tight text-[#b8b8c2]">
                                  Bayar dulu
                                </span>
                              )}
                              {canFinalizeCustomerOrder(order) ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="garage-press h-9 bg-[#22c55e] px-2 text-[11px] text-white hover:bg-[#16a34a]"
                                  disabled={Boolean(busyAction)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openFinalizeDialog(order);
                                  }}
                                >
                                  Terima Bayar
                                </Button>
                              ) : (
                                <span className="inline-flex h-9 items-center justify-center rounded-md border border-[#34343c] px-1 text-[10px] font-bold text-[#d4d4d8]">
                                  Lunas
                                </span>
                              )}
                              {order.whatsappInvoiceUrl ? (
                                <a
                                  href={order.whatsappInvoiceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="garage-press inline-flex h-9 items-center justify-center rounded-md border border-[#22c55e]/40 bg-[#22c55e]/12 px-2 text-[#dcfce7]"
                                  aria-label={`Kirim link invoice WA ${order.orderNo}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <MessageCircle className="size-4" />
                                </a>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="garage-press h-9 border-[#4a4a54] px-2 text-[11px]"
                                  disabled={Boolean(busyAction)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openRejectDialog(order);
                                  }}
                                >
                                  Tolak
                                </Button>
                              )}
                              {order.invoiceWebUrl ? (
                                <a
                                  href={order.invoiceWebUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="garage-press inline-flex h-9 items-center justify-center rounded-md border border-[#f5a742]/40 bg-[#f5a742]/12 px-2 text-[#ffe7b8]"
                                  aria-label={`Buka tracking invoice ${order.orderNo}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <FileText className="size-4" />
                                </a>
                              ) : order.invoicePdfUrl ? (
                                <a
                                  href={order.invoicePdfUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="garage-press inline-flex h-9 items-center justify-center rounded-md border border-[#f5a742]/40 bg-[#f5a742]/12 px-2 text-[#ffe7b8]"
                                  aria-label={`Buka PDF invoice ${order.orderNo}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <FileText className="size-4" />
                                </a>
                              ) : null}
                            </div>
                            {order.whatsappInvoiceUrl ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="garage-press mt-2 h-8 w-full border-[#4a4a54] px-2 text-[11px]"
                                disabled={Boolean(busyAction)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openRejectDialog(order);
                                }}
                              >
                                Tolak order
                              </Button>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-56 items-center justify-between gap-3 rounded-md border border-dashed border-[#4a4a54] bg-[#101016]/60 p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">Belum ada order QR</p>
                        <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                          Meja masih kosong. QR meja tetap bisa dibuka dari tombol QR Meja.
                        </p>
                      </div>
                      <QrCode className="size-9 shrink-0 text-[#4a4a54]" />
                    </div>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-[#34343c] bg-[#111116] px-4 py-3 sm:px-5">
                <p className="text-xs leading-5 text-[#b8b8bf]">
                  Popup ini aman untuk kasir tablet: daftar scroll di dalam, layar POS tetap bersih.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-9 border-[#f5a742]/45 bg-[#f5a742]/10 px-2.5 text-xs text-[#ffe0ad]"
                    onClick={() => {
                      setQrOrdersOpen(false);
                      setQrTablesOpen(true);
                    }}
                  >
                    <QrCode className="mr-1.5 size-3.5" />
                    QR Meja
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-9 border-[#4a4a54] px-2.5 text-xs"
                    onClick={() => setQrOrdersOpen(false)}
                  >
                    Tutup
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
            </div>
          </SheetContent>
        </Sheet>
        <Dialog open={kitchenPanelOpen} onOpenChange={setKitchenPanelOpen}>
          <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] p-0 sm:max-w-3xl">
            <DialogHeader className="border-b border-[#34343c] px-4 pb-3 pt-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <DialogTitle>Pesanan Bar &amp; Dapur</DialogTitle>
                  <DialogDescription>
                    Status tiap pesanan sampai diantar waiter (urut pesan duluan). Tombol besar = langkah berikutnya: Mulai buat → Siap &amp; panggil waiter. Cetak tiket untuk Bar/Dapur dari sini.
                  </DialogDescription>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className="border-[#4a4a54] bg-black/30 px-2 text-[11px]">
                    {kitchenTickets.length} aktif
                  </Badge>
                  {onNavigateModule && navModules.some((m) => m.id === "kitchen") ? (
                    <Button
                      type="button"
                      size="sm"
                      data-testid="pos-open-production"
                      className="garage-press h-9 bg-[#e5484d] px-3 text-xs font-bold text-white hover:bg-[#ff5c61]"
                      onClick={() => {
                        setKitchenPanelOpen(false);
                        onNavigateModule("kitchen");
                      }}
                    >
                      Layar Production penuh
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="garage-press h-9 border-[#4a4a54] bg-white/[0.055] px-2 text-xs"
                    onClick={() => void loadKitchenTickets()}
                  >
                    <RefreshCw className="mr-1 size-3.5" /> Muat ulang
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="garage-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-4 sm:p-5">
              {kitchenActionError ? (
                <p role="alert" className="rounded-md border border-[#d11a2a]/60 bg-[#d11a2a]/15 px-3 py-2 text-sm font-semibold text-[#ffb4bb]">
                  {kitchenActionError}
                </p>
              ) : null}
              <PosProductionPanel
                activeTickets={kitchenTickets}
                doneTickets={kitchenDoneTickets}
                now={kitchenTicketsAt}
                busyId={kitchenActionBusy}
                qcTicketId={kitchenQcTicket}
                printingId={kitchenPrintingId}
                printedIds={kitchenPrintedIds}
                onSetQcTicket={setKitchenQcTicket}
                onAction={(ticketId, body) => void runKitchenAction(ticketId, body)}
                onPrint={(tickets, key) => void printProductionTickets(tickets, key)}
              />
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(selectedCustomerOrder)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedCustomerOrderId(null);
            }
          }}
        >
          {selectedCustomerOrder ? (
            <DialogContent className="max-h-[90vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Detail QR Order {selectedCustomerOrder.orderNo}</DialogTitle>
                <DialogDescription>
                  Ringkasan order customer sebelum kasir membuat ticket KDS atau mencatat pembayaran.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div className="rounded-md border border-[#34343c] bg-[#1a1a21]/86 p-3">
                  <p className="garage-mono text-[10px] uppercase tracking-[0.18em] text-[#b8b8bf]">
                    Meja / channel
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="garage-mono flex size-12 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/60 bg-[#d11a2a]/22 text-xl font-black text-white">
                      {compactTableNumber(selectedCustomerOrder.tableLabel)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-2xl font-black text-white">
                        {selectedCustomerOrder.tableLabel}
                      </p>
                      <p className="truncate text-xs text-[#b8b8bf]">
                        {selectedCustomerOrder.channel} - {formatReceiptDate(selectedCustomerOrder.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3">
                  <p className="garage-mono text-[10px] uppercase tracking-[0.18em] text-[#ffd08a]">
                    Total tagihan
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {currency.format(selectedCustomerOrder.total)}
                  </p>
                  <Badge className={`${statusClass[selectedCustomerOrder.status] ?? statusClass.pending_cashier} mt-2 px-2 text-xs`}>
                    {PAYMENT_STATUS_LABEL[paymentStatusOf(selectedCustomerOrder)]} · {selectedCustomerOrder.paymentMethod ?? "-"}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Pelanggan", selectedCustomerOrder.customerName ?? "Pelanggan"],
                  ["WhatsApp", selectedCustomerOrder.customerPhone ?? "No WA"],
                  ["Source", selectedCustomerOrder.orderSource],
                  ["Mode", selectedCustomerOrder.customerMode],
                  ["Campaign", selectedCustomerOrder.campaign ?? "-"],
                  ["Event", selectedCustomerOrder.eventTitle ?? "-"],
                  ["Invoice WA", selectedCustomerOrder.whatsappInvoiceStatus],
                  ["Status Pembayaran", customerOrderPaymentStatusLabel(selectedCustomerOrder)],
                  ["Pembayaran", customerOrderPaymentLabel(selectedCustomerOrder)],
                  ["Provider", customerOrderPaymentProvider(selectedCustomerOrder) || "-"],
                  ["Referensi", customerOrderPaymentReference(selectedCustomerOrder) || "-"],
                  ["Status bayar", selectedCustomerOrder.paymentStatus ?? "-"],
                  ["Nomor Invoice", customerOrderInvoiceNo(selectedCustomerOrder)],
                  ["Status Invoice", customerOrderInvoiceStatusLabel(selectedCustomerOrder)],
                  ["Cash dipegang", selectedCustomerOrder.cashHeldBy ?? "-"],
                  [
                    "Cash diterima",
                    selectedCustomerOrder.cashReceived == null
                      ? "-"
                      : currency.format(selectedCustomerOrder.cashReceived),
                  ],
                  [
                    "Cash disetor",
                    selectedCustomerOrder.cashDeposited == null
                      ? "-"
                      : currency.format(selectedCustomerOrder.cashDeposited),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-md border border-[#34343c] bg-white/[0.04] px-3 py-2"
                  >
                    <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f98]">
                      {label}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">Item order</p>
                  <Badge className="garage-mono border-[#4a4a54] bg-white/[0.06] px-2 text-[10px] text-[#d4d4d8]">
                    {selectedCustomerOrder.items.length} item
                  </Badge>
                </div>
                <div className="garage-scroll mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {groupOrderLines(selectedCustomerOrder.items).map((group) =>
                    group.kind === "package" ? (
                      <div key={group.groupId} className="rounded-md border border-[#f5a742]/40 bg-[#f5a742]/8 p-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 break-words text-sm font-semibold text-white">{group.qty}x {group.name} <span className="ml-1 rounded border border-[#f5a742]/50 px-1 text-xs text-[#ffd08a]">Paket</span></p>
                          <p className="garage-mono shrink-0 text-sm font-semibold text-white">{currency.format(group.total)}</p>
                        </div>
                        <ul className="mt-1 space-y-0.5 text-sm text-[#d0d0d6]">
                          {group.components.map((line) => <li key={line.id} className="break-words">• {componentLabel(line, group.qty)}</li>)}
                        </ul>
                      </div>
                    ) : (
                    <div
                      key={group.line.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-[#303038] bg-black/12 p-2"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-white">
                          {group.line.qty}x {group.line.itemName}
                        </p>
                        <p className="mt-0.5 break-words text-sm text-[#c8c8cc]">
                          {group.line.variantLabel !== "Regular" ? group.line.variantLabel : "Regular"} - {currency.format(group.line.unitPrice)}
                        </p>
                      </div>
                      <p className="garage-mono shrink-0 text-sm font-semibold text-white">
                        {currency.format(group.line.lineTotal)}
                      </p>
                    </div>
                    ),
                  )}
                </div>
              </div>

              {selectedCustomerOrder.customerNote ? (
                <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
                  <Info className="size-4 text-[#f5a742]" />
                  <AlertTitle>Catatan pelanggan</AlertTitle>
                  <AlertDescription>{selectedCustomerOrder.customerNote}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-3">
                  <p className="text-sm font-semibold text-white">Penjelasan aksi</p>
                  <div className="mt-3 space-y-2">
                    {qrOrderActionGuides.map((guide) => (
                      <div
                        key={guide.label}
                        className="rounded-md border border-[#34343c] bg-black/12 p-2"
                      >
                        <Badge className={`${guide.tone} px-2 text-[10px]`}>
                          {guide.label}
                        </Badge>
                        <p className="mt-2 text-xs leading-5 text-[#d6d6dc]">
                          {guide.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-3">
                  <p className="text-sm font-semibold text-white">Rincian tagihan</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <BillRow label="Subtotal" value={currency.format(selectedCustomerOrder.subtotal)} />
                    {selectedCustomerOrder.service > 0 ? (
                      <BillRow label="Service" value={currency.format(selectedCustomerOrder.service)} />
                    ) : null}
                    {selectedCustomerOrder.discount > 0 ? (
                      <BillRow label="Diskon" value={`- ${currency.format(selectedCustomerOrder.discount)}`} />
                    ) : null}
                    <Separator className="bg-[#34343c]" />
                    <BillRow label="Total" value={currency.format(selectedCustomerOrder.total)} large />
                  </div>
                </div>
              </div>

              {customerOrderNeedsWaiterCash(selectedCustomerOrder) ? (
                <div className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white">Tunai meja (waiter)</p>
                      <p className="mt-1 text-xs leading-5 text-[#ffd08a]">
                        Invoice final hanya terbit setelah kasir konfirmasi setoran.
                      </p>
                    </div>
                    <Badge className={`${statusClass[selectedCustomerOrder.cashFlowStatus ?? "warning"] ?? statusClass.warning} px-2 text-[10px]`}>
                      {customerOrderPaymentStatusLabel(selectedCustomerOrder)}
                    </Badge>
                  </div>

                  {isWaiterRole(me.role) ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        value={customerOrderCashReceived}
                        onChange={(event) => setCustomerOrderCashReceived(event.target.value)}
                        className="h-11 border-[#34343c] bg-[#111116]/72"
                        inputMode="numeric"
                        placeholder={`Diterima dari pelanggan: ${currency.format(selectedCustomerOrder.total)}`}
                      />
                      <Button
                        type="button"
                        className="garage-press h-11"
                        disabled={customerOrderActionId?.startsWith(`${selectedCustomerOrder.id}:`)}
                        onClick={() => receiveWaiterCash(selectedCustomerOrder)}
                      >
                        Terima Cash
                      </Button>
                      <Input
                        value={customerOrderCashDeposited}
                        onChange={(event) => setCustomerOrderCashDeposited(event.target.value)}
                        className="h-11 border-[#34343c] bg-[#111116]/72"
                        inputMode="numeric"
                        placeholder={`Setor kasir: ${currency.format(selectedCustomerOrder.cashReceived ?? selectedCustomerOrder.total)}`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-11 border-[#4a4a54]"
                        disabled={customerOrderActionId?.startsWith(`${selectedCustomerOrder.id}:`)}
                        onClick={() => depositWaiterCash(selectedCustomerOrder)}
                      >
                        Setor ke Kasir
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedCustomerOrder.fulfillment === "delivery" || selectedCustomerOrder.fulfillment === "takeaway" ? (
                <DeliveryOrderPanel
                  order={selectedCustomerOrder}
                  busy={Boolean(customerOrderActionId)}
                  autoRejectMinutes={settings.unpaidOrderAutoRejectMinutes}
                  onSetStatus={(step) => void setDeliveryStatus(selectedCustomerOrder, step)}
                  onChanged={() => void loadCustomerOrders({ silent: true })}
                />
              ) : null}

              <div className="flex flex-wrap gap-2">
                {canAcceptCustomerOrder(selectedCustomerOrder) ? (
                  <Button
                    type="button"
                    className="garage-press h-11 flex-1 basis-[140px]"
                    disabled={customerOrderActionId?.startsWith(`${selectedCustomerOrder.id}:`)}
                    onClick={() => void decideCustomerOrder(selectedCustomerOrder, "accept")}
                  >
                    Terima
                  </Button>
                ) : null}
                {canFinalizeCustomerOrder(selectedCustomerOrder) ? (
                  <Button
                    type="button"
                    className="garage-press h-11 flex-[1.4] basis-[170px] bg-[#22c55e] text-white hover:bg-[#16a34a]"
                    disabled={
                      customerOrderActionId?.startsWith(`${selectedCustomerOrder.id}:`) ||
                      !canConfirmCustomerPayment(me.role)
                    }
                    onClick={() => openFinalizeDialog(selectedCustomerOrder)}
                  >
                    Finalkan Pembayaran
                  </Button>
                ) : null}
                {!canRejectCustomerOrder(selectedCustomerOrder, me.role) &&
                (selectedCustomerOrder.status === "awaiting_payment" || selectedCustomerOrder.status === "accepted") ? (
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="pos-request-cancel"
                    className="garage-press h-11 flex-1 basis-[140px] border-[#4a4a54]"
                    onClick={() =>
                      setCancelTarget({
                        orderNo: selectedCustomerOrder.orderNo,
                        tableLabel: selectedCustomerOrder.tableLabel,
                        total: selectedCustomerOrder.total,
                      })
                    }
                  >
                    Ajukan batal
                  </Button>
                ) : null}
                {canRejectCustomerOrder(selectedCustomerOrder, me.role) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 flex-1 basis-[140px] border-[#4a4a54]"
                    disabled={customerOrderActionId?.startsWith(`${selectedCustomerOrder.id}:`)}
                    onClick={() => openRejectDialog(selectedCustomerOrder)}
                  >
                    Tolak
                  </Button>
                ) : null}
                {canDeleteInvoice && paymentStatusOf(selectedCustomerOrder) === "pending" && selectedCustomerOrder.status !== "pending_cashier" ? (
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="pos-invoice-delete"
                    className="garage-press h-11 flex-1 basis-[140px] border-[#d11a2a]/60 bg-[#d11a2a]/10 text-[#ffc2c8]"
                    onClick={() =>
                      setInvoiceDeleteTarget({
                        id: selectedCustomerOrder.id,
                        orderNo: selectedCustomerOrder.orderNo,
                        total: selectedCustomerOrder.total,
                        label: [selectedCustomerOrder.tableLabel, selectedCustomerOrder.customerName].filter(Boolean).join(" · "),
                        status: selectedCustomerOrder.status,
                      })
                    }
                  >
                    <Trash2 className="mr-1 size-4" /> Hapus invoice
                  </Button>
                ) : null}
              </div>

              {selectedCustomerOrder.whatsappInvoiceUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#22c55e]/45 bg-[#22c55e]/10 text-[#dcfce7]"
                  asChild
                >
                  <a
                    href={selectedCustomerOrder.whatsappInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="mr-2 size-4" />
                    Kirim link invoice WA
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#4a4a54] text-[#b8b8bf]"
                  disabled
                >
                  <MessageCircle className="mr-2 size-4" />
                  WA invoice belum siap
                </Button>
              )}
              {selectedCustomerOrder.invoiceWebUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#f5a742]/45 bg-[#f5a742]/10 text-[#ffe7b8]"
                  asChild
                >
                  <a
                    href={selectedCustomerOrder.invoiceWebUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileText className="mr-2 size-4" />
                    Tracking Invoice
                  </a>
                </Button>
              ) : selectedCustomerOrder.invoicePdfUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#f5a742]/45 bg-[#f5a742]/10 text-[#ffe7b8]"
                  asChild
                >
                  <a
                    href={selectedCustomerOrder.invoicePdfUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileText className="mr-2 size-4" />
                    Invoice PDF
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#4a4a54] text-[#b8b8bf]"
                  disabled
                >
                  <FileText className="mr-2 size-4" />
                  Tracking belum dibuat
                </Button>
              )}
            </DialogContent>
          ) : null}
        </Dialog>
        <div className="pos-main-layout grid min-h-0 flex-1 gap-2 md:grid-cols-[minmax(0,1fr)_286px] md:items-stretch lg:grid-cols-[minmax(0,1fr)_330px] min-[1200px]:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <div className="garage-panel garage-animate-in flex shrink-0 flex-col gap-2 rounded-md p-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter = pesan menu teratas hasil cari / kode singkat.
                      if (event.key !== "Enter" || !query.trim() || deferredQuery !== query) return;
                      const first = filteredMenu.find((item) => !soldOutIds.has(item.id));
                      if (!first) return;
                      event.preventDefault();
                      handleProductTap(first);
                      setQuery("");
                    }}
                    enterKeyHint="done"
                    aria-label="Cari menu atau kode singkat, Enter untuk pesan menu teratas"
                    data-testid="pos-menu-search"
                    className="h-9 border-[#34343c] bg-white/[0.06] pl-9"
                    placeholder="Cari menu / kode singkat (mis. cl)"
                  />
                </div>
                <PosEventBundles
                  shiftOpen={shiftOpen}
                  regularCart={cart.map((line) => ({ itemId: line.itemId, variantId: line.variantId, qty: line.qty, note: line.note || undefined }))}
                  regularCartTotal={subtotal}
                  makeKey={makeIdempotencyKey}
                  onSaved={handleEventBundleSaved}
                />
                <PosQuickRetail
                  shiftOpen={shiftOpen}
                  menuItems={menuItems}
                  settings={settings}
                  qrisImagePath={paymentBrandConfig.qrisImagePath}
                  qrisImageReady={qrisImageReady}
                  makeKey={makeIdempotencyKey}
                  onCompleted={handleQuickRetailCompleted}
                  renderComplete={(receipt, startNew, close) => (
                    <PaymentCompletePanel
                      receipt={receipt}
                      autoPrint={settings.autoPrintReceipt && cashierPosSettings.receiptPrintMode === "auto"}
                      onNewTransaction={startNew}
                      onClose={close}
                    />
                  )}
                />
                <div className="flex min-h-9 min-w-0 items-center gap-2 rounded-md border border-[#34343c] bg-white/[0.06] px-3 md:w-[190px]">
                  <CreditCard className="size-4 shrink-0 text-[#f5a742]" />
                  <div className="min-w-0">
                    <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                      Checkout
                    </p>
                    <p className="break-words text-xs font-semibold text-white">
                      {tableLabel}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="garage-scroll-x flex gap-1.5 pb-0.5">
                  {menuPrimaryGroups.map((group) => {
                    const active = menuCategory === group;
                    const isAll = group === "All";
                    return (
                      <Button
                        key={group}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className={`min-h-9 shrink-0 ${
                          active
                            ? "bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                            : "border-[#4a4a54] bg-white/[0.06] text-[#d4d4d8]"
                        }`}
                        onClick={() => setMenuCategory(group)}
                      >
                        {isAll
                          ? "Semua"
                          : group === "Dapur"
                            ? "🍴 Dapur"
                            : group === "Bar"
                              ? "☕ Bar"
                              : "Lainnya"}
                      </Button>
                    );
                  })}
                  {/* Filter Bestseller — toggle untuk highlight top items */}
                  <Button
                    type="button"
                    size="sm"
                    variant={bestsellerOnly ? "default" : "outline"}
                    className={`min-h-9 shrink-0 ${
                      bestsellerOnly
                        ? "border-[#f5a742]/55 bg-[#f5a742] text-black hover:bg-[#ffc167]"
                        : "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a] hover:bg-[#f5a742]/22"
                    }`}
                    onClick={() => setBestsellerOnly((v) => !v)}
                  >
                    ⭐ Bestseller
                  </Button>
                </div>
                {activeMenuGroup && menuSubCategories[activeMenuGroup].length > 0 && (
                  <div className="garage-scroll-x flex gap-1.5 pb-0.5">
                    <span className="self-center font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                      {menuGroupLabels[activeMenuGroup]}:
                    </span>
                    {menuSubCategories[activeMenuGroup].map((sub) => {
                      const active = menuCategory === sub;
                      return (
                        <Button
                          key={sub}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className={`shrink-0 ${
                            active
                              ? "bg-[#f5a742] text-black hover:bg-[#ffc167]"
                              : "border-[#4a4a54] bg-white/[0.04] text-[#d4d4d8]"
                          }`}
                          onClick={() => setMenuCategory(sub)}
                        >
                          {sub}
                        </Button>
                      );
                    })}
                  </div>
                )}
                {favoriteItems.length && !normalizedMenuQuery && menuCategory === "All" && !bestsellerOnly ? (
                  <div className="garage-scroll-x flex gap-1.5 pb-0.5" data-testid="pos-favorites">
                    <span className="flex shrink-0 items-center gap-1 self-center font-mono text-[10px] font-bold uppercase tracking-wider text-[#ffd08a]">
                      <Star aria-hidden className="size-3.5 fill-[#f5a742] text-[#f5a742]" />
                      Favorit
                    </span>
                    {favoriteItems.map((item) => {
                      const soldOut = soldOutIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleProductTap(item)}
                          aria-disabled={soldOut}
                          aria-label={soldOut ? `${item.name} sedang habis` : `Pesan ${item.name}`}
                          className={`garage-press flex min-h-11 max-w-[180px] shrink-0 flex-col justify-center rounded-md border px-2.5 py-1 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5a742]/70 ${
                            soldOut
                              ? "cursor-not-allowed border-[#4a4a54] bg-white/[0.02] opacity-55"
                              : "border-[#f5a742]/40 bg-[#f5a742]/10 hover:border-[#f5a742]/70 hover:bg-[#f5a742]/18"
                          }`}
                        >
                          <span className="truncate text-xs font-bold leading-4 text-white">{item.name}</span>
                          <span className="truncate text-[11px] font-semibold leading-4 text-[#ffd08a]">
                            {soldOut ? "HABIS" : currency.format(item.variants[0]?.price ?? 0)}
                            {item.variants.length > 1 && !soldOut ? "+" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="garage-scroll min-h-[260px] flex-1 overflow-y-auto pb-20 pr-1 md:min-h-0 md:max-h-none md:pb-1">
              <div className="pos-product-grid grid gap-2">
                {filteredMenu.length ? visibleProducts.map((item) => {
                  const baseVariant = item.variants[0];
                  const priceRange = item.variants.length > 1
                    ? `${currency.format(
                        Math.min(...item.variants.map((variant) => variant.price)),
                      )}+`
                    : currency.format(baseVariant.price);
                  const hasPromo = Boolean(item.promoActive && item.promoPrice);
                  const isSoldOut = soldOutIds.has(item.id);
                  const shortcode = shortcodeById.get(item.id);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`garage-panel garage-animate-in pos-product-card min-h-[112px] rounded-md p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5a742]/70 sm:p-2.5 xl:min-h-[124px] ${
                        isSoldOut
                          ? "cursor-not-allowed border-[#4a4a54] bg-white/[0.02] opacity-55 grayscale"
                          : "garage-hover-lift hover:border-[#d11a2a]/55"
                      }`}
                      onClick={() => handleProductTap(item)}
                      aria-label={
                        isSoldOut
                          ? `${item.name} sedang habis`
                          : `Pesan ${item.name}`
                      }
                      aria-disabled={isSoldOut}
                    >
                      <div className="flex h-full flex-col">
                        <div className="relative mb-2 aspect-square w-full shrink-0 overflow-hidden rounded-md border border-[#34343c] bg-[#15151b]">
                          {shortcode ? (
                            <span
                              className="garage-mono absolute left-1 top-1 z-[1] rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold uppercase leading-4 tracking-wider text-[#ffd08a]"
                              title={`Kode singkat: ketik "${shortcode}" di pencarian`}
                              data-testid="pos-product-shortcode"
                            >
                              {shortcode}
                            </span>
                          ) : null}
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#2a2118] to-[#141118] text-[#f5a742]">
                              {(() => {
                                const cat = (item.category || "").toLowerCase();
                                const Icon = cat.includes("coffee") || cat.includes("kopi")
                                  ? Coffee
                                  : cat.includes("non-coffee") || cat.includes("minum")
                                    ? CupSoda
                                    : cat.includes("cemilan") || cat.includes("snack")
                                      ? Cookie
                                      : UtensilsCrossed;
                                return <Icon className="size-7" />;
                              })()}
                              <span className="garage-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[#8a7458]">
                                GARAGE
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="pos-product-name line-clamp-2 break-words text-[13px] font-semibold leading-4 text-white sm:text-sm sm:leading-5">
                              {item.name}
                            </p>
                            <p className="pos-product-meta mt-1 truncate text-[10px] leading-4 text-[#b8b8bf] sm:text-[11px]">
                              {item.category} - {item.prep}
                            </p>
                          </div>
                          {isSoldOut ? (
                            <Badge className="shrink-0 border-[#d11a2a]/55 bg-[#d11a2a]/22 px-1.5 text-[10px] font-extrabold text-[#ffe1e5]">
                              HABIS
                            </Badge>
                          ) : hasPromo ? (
                            <Badge className="shrink-0 border-0 bg-[#d11a2a] px-1.5 text-[10px] font-black text-white">
                              PROMO
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-auto pt-2.5">
                          {hasPromo ? (
                            <div className="flex items-baseline gap-2">
                              <p className="pos-product-price truncate text-[15px] font-semibold text-[#ffb4bd] sm:text-base">
                                {currency.format(item.promoPrice as number)}
                              </p>
                              <p className="truncate text-[11px] text-[#8f8f99] line-through">
                                {priceRange}
                              </p>
                            </div>
                          ) : (
                            <p className="pos-product-price truncate text-[15px] font-semibold text-white sm:text-base">
                              {priceRange}
                            </p>
                          )}
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="pos-product-note min-w-0 truncate text-[10px] text-[#d6d6dc] sm:text-[11px]">
                              {isSoldOut
                                ? "Tidak bisa dipesan"
                                : item.variants.length > 1
                                  ? `${item.variants.length} varian`
                                  : "Siap tambah"}
                            </span>
                            {isSoldOut ? (
                              <span className="pos-product-order-cta inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[#4a4a54] bg-[#202027] px-2.5 text-[11px] font-extrabold text-[#8f8f99]">
                                <Ban className="size-3.5" />
                                Habis
                              </span>
                            ) : (
                              <span className="pos-product-order-cta inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-[#d11a2a] px-2.5 text-[11px] font-extrabold text-white shadow-[0_0_18px_rgba(209,26,42,0.22)]">
                                <Plus className="size-3.5" />
                                Pesan
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="pos-empty-state col-span-full flex min-h-[220px] flex-col items-center justify-center rounded-md border border-dashed border-[#4a4a54] bg-[#202027]/66 p-5 text-center">
                    <Search className="size-7 text-[#6e6e76]" />
                    <p className="mt-3 text-sm font-semibold text-white">
                      Produk tidak ditemukan
                    </p>
                    <p className="mt-1 max-w-60 text-xs leading-5 text-[#b8b8bf]">
                      Ubah kata kunci atau kategori untuk menampilkan produk.
                    </p>
                  </div>
                )}
              </div>
              {hasMoreProducts && (
                <div className="pos-load-more-bar sticky bottom-0 mt-3 flex justify-center bg-gradient-to-t from-[#0f0f14] via-[#0f0f14]/92 to-transparent pb-1 pt-5">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press pos-load-more-button border-[#4a4a54] bg-[#18181f] text-[#f4f4f5]"
                    onClick={() =>
                      setProductPageState((current) => {
                        const currentCount =
                          current.filterKey === productFilterKey
                            ? current.count
                            : initialVisibleProducts;

                        return {
                          filterKey: productFilterKey,
                          count: Math.min(
                            currentCount + productLoadStep,
                            filteredMenu.length,
                          ),
                        };
                      })
                    }
                  >
                    Tampilkan lagi{" "}
                    {Math.min(productLoadStep, filteredMenu.length - visibleProductCount)}{" "}
                    produk
                  </Button>
                </div>
              )}
            </div>
          </div>

          <aside
            data-open={billOpen ? "true" : "false"}
            className="garage-panel garage-animate-in pos-bill-panel fixed inset-x-2 bottom-2 z-40 flex max-h-[calc(100svh-80px)] min-h-0 flex-col overflow-hidden rounded-md p-2.5 shadow-[0_18px_60px_rgba(0,0,0,0.3)] transition-[opacity,translate] duration-300 sm:p-3 md:sticky md:top-0 md:inset-auto md:h-full md:w-full md:max-h-none md:shadow-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="pos-muted-label garage-mono text-[11px] text-[#b8b8bf]">Keranjang</p>
                <h2 className="garage-display garage-chrome mt-0.5 truncate text-xl leading-none sm:text-2xl">
                  {dineInTableMissing ? "Pilih meja" : tableLabel}
                </h2>
                <p className="pos-muted-label mt-1 truncate text-xs text-[#b8b8bf]">
                  {dineInTableMissing
                    ? "Belum final"
                    : orderType === "dine-in"
                      ? "Dine in"
                      : "Order tanpa nomor meja"}
                </p>
                {/* ADD-ON indicator â€” selalu visible saat kasir lagi
                    tambah order ke meja yang sudah aktif. */}
                {orderType === "dine-in" && selectedTableLiveRow?.currentOrderId ? (
                  <span className="garage-mono mt-1 inline-flex items-center gap-1 rounded-md border border-[#f5a742]/55 bg-[#f5a742]/14 px-2 py-0.5 text-[10px] font-bold uppercase text-[#ffd79a]">
                    <Plus className="size-3" />
                    Sesi Tambah Order
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge className="garage-mono h-6 border-[#d11a2a]/45 bg-[#d11a2a]/14 px-2 text-[10px] text-white">
                  {orderType}
                </Badge>
                <div className="flex items-center gap-1 rounded-md border border-[#34343c] bg-black/20 p-1">
                  {/* Parked orders */}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={`garage-press relative size-7 ${
                      parkedOrders.length > 0
                        ? "text-[#ffd79a]"
                        : "text-[#9aa0a6] hover:text-white"
                    }`}
                    onClick={() => setParkedListOpen(true)}
                    aria-label="Lihat parked orders"
                    title={`${parkedOrders.length} parked bill`}
                  >
                    <Archive className="size-3.5" />
                    {parkedOrders.length > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-[#f5a742] px-1 text-[8px] font-bold text-black">
                        {parkedOrders.length}
                      </span>
                    )}
                  </Button>
                  {/* Park current bill */}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="garage-press size-7 text-[#9aa0a6] hover:text-white disabled:opacity-40"
                    disabled={!cartLines.length}
                    onClick={() => {
                      setParkLabel("");
                      setParkDialogOpen(true);
                    }}
                    aria-label="Parkir bill saat ini"
                    title="Parkir bill (simpan sementara)"
                  >
                    <PauseCircle className="size-3.5" />
                  </Button>
                  {/* Clear cart (destruktif - merah) */}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="garage-press size-7 text-[#ff8a92] hover:bg-[#d11a2a]/15 hover:text-[#ffc2c8] disabled:opacity-40"
                    disabled={!cartLines.length}
                    onClick={() => setClearCartOpen(true)}
                    aria-label="Hapus keranjang"
                    title="Hapus semua isi keranjang"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  {/* Tutup (mobile only) */}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="garage-press size-7 text-[#9aa0a6] hover:text-white md:hidden"
                    onClick={() => setBillOpen(false)}
                    aria-label="Tutup bill"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="garage-scroll pos-cart-scroll mt-2 h-[min(34svh,220px)] min-h-0 overflow-y-auto pr-2 md:h-auto md:flex-1 md:basis-0 xl:min-h-[200px]">
              {cartLines.length ? (
                <div className="space-y-2">
                  {cartLines.map((line) => (
                    <div
                      key={`${line.itemId}-${line.variantId}`}
                      className="pos-cart-line garage-press rounded-md border border-[#3a3a42] bg-[#25252d]/86 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-[#555560]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="pos-cart-title break-words text-[15px] font-semibold leading-5 text-white">
                            {line.item.name}
                          </p>
                          <p className="pos-cart-meta mt-0.5 break-words text-sm text-[#d0d0d6]">
                            {line.variant.label !== "Regular"
                              ? `${line.variant.label} - `
                              : ""}
                            {currency.format(line.variant.price)}
                          </p>
                        </div>
                        <p className="pos-cart-price garage-mono shrink-0 text-right text-sm font-semibold text-white">
                          {currency.format(line.variant.price * line.qty)}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="pos-muted-label garage-mono text-xs text-[#c8c8cc]">
                          Qty
                        </p>
                        <div className="pos-qty-control inline-flex h-9 shrink-0 items-center overflow-hidden rounded-md border border-[#4a4a54] bg-[#15151b]">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="garage-press size-9 rounded-none border-0 text-[#f4f4f5] hover:bg-white/[0.08]"
                            onClick={() => decrementItem(line.itemId, line.variantId)}
                            aria-label={`Decrease ${line.item.name} ${line.variant.label}`}
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <span className="garage-mono min-w-9 border-x border-[#34343c] px-2 text-center text-sm font-semibold text-white">
                            {line.qty}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="garage-press size-9 rounded-none border-0 text-[#f4f4f5] hover:bg-white/[0.08]"
                            onClick={() => addItem(line.itemId, line.variantId)}
                            aria-label={`Increase ${line.item.name} ${line.variant.label}`}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      {/* Item note input â€” request customer: less ice, no garlic, extra spicy.
                          Auto-saved on blur. Note dikirim ke kitchen ticket. */}
                      <CartLineNoteRow
                        note={line.note ?? ""}
                        onChange={(value) => setItemNote(line.itemId, line.variantId, value)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pos-cart-empty relative flex h-full min-h-[180px] flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-[#4a4a54] bg-[#202027]/66 p-5 text-center">
                  <ReceiptText className="size-8 text-[#6e6e76]" />
                  <p className="mt-3 text-sm font-semibold text-white">Keranjang kosong</p>
                  <p className="mt-1 max-w-52 text-xs text-[#b8b8bf]">
                    Tap menu untuk mulai membuat bill.
                  </p>
                </div>
              )}
            </div>

              <div className="pos-bill-footer mt-auto shrink-0 rounded-md border border-[#3a3a42] bg-[#18181f] p-2.5 shadow-[0_-16px_46px_rgba(0,0,0,0.28)]">
              {/* Keranjang fokus ke item. Total tampil jelas; voucher/Diskon
                  Kasir/rincian dipindah ke dalam alur tombol Bayar. Chip ringkas
                  di bawah supaya kasir tetap sadar ada potongan aktif. */}
              <div className="pos-total-box rounded-md border border-[#4a4a54] bg-[#0f0f14] p-2.5">
                <BillRow label="Total" value={currency.format(totalDue)} large />
                {voucher > 0 || manualDiscountAmount > 0 || manualDiscountAwaitingApproval ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {voucher > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#f5a742]/40 bg-[#f5a742]/10 px-2 py-0.5 text-[11px] font-semibold text-[#ffd79a]">
                        Voucher -{currency.format(voucher)}
                      </span>
                    ) : null}
                    {manualDiscountAmount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#f5a742]/40 bg-[#f5a742]/10 px-2 py-0.5 text-[11px] font-semibold text-[#ffd79a]">
                        <Percent className="size-3" />
                        Diskon{" "}
                        {manualDiscount?.type === "percent"
                          ? `${manualDiscount.rawValue}%`
                          : currency.format(manualDiscountAmount)}
                      </span>
                    ) : null}
                    {manualDiscountAwaitingApproval ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#f5a742]/55 bg-[#f5a742]/14 px-2 py-0.5 text-[11px] font-semibold text-[#ffd79a]">
                        Diskon menunggu approval
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[11px] text-[#8f8f99]">
                    Voucher &amp; diskon diatur saat tekan Bayar.
                  </p>
                )}
              </div>

              <Dialog
                open={paymentOpen}
                onOpenChange={(open) => {
                  setPaymentOpen(open);
                  if (open) {
                    resetPaymentDialog();
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    className="garage-press mt-2 h-11 w-full text-base font-semibold"
                    disabled={!cartLines.length}
                    onClick={resetPaymentDialog}
                  >
                    <CreditCard className="mr-2 size-4" />
                    Bayar
                  </Button>
                </DialogTrigger>
                {/* Bayar 1 tap (owner, Okt 2026): take away langsung lunas tanpa 4 langkah. */}
                <div className="mt-2 grid grid-cols-2 gap-2" data-testid="pos-quick-pay">
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="pos-quick-cash"
                    disabled={!cartLines.length || paymentPending || !shiftOpen}
                    className="garage-press h-12 border-[#22c55e]/55 bg-[#22c55e]/12 px-2 text-xs font-bold text-[#dcfce7]"
                    onClick={() => {
                      resetPaymentDialog();
                      setOrderType("takeaway");
                      setSelectedPaymentMethod("Cash");
                      setPaymentOpen(true);
                      void submitOrder("Cash", { orderType: "takeaway", cashReceived: totalDue });
                    }}
                  >
                    <span className="flex min-w-0 flex-col items-center leading-4">
                      <span className="truncate text-sm">⚡ Uang pas</span>
                      <span className="truncate text-[11px] font-semibold opacity-90">Take away</span>
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="pos-quick-qris"
                    disabled={!cartLines.length || paymentPending || !shiftOpen}
                    className="garage-press h-12 border-[#f5a742]/55 bg-[#f5a742]/12 px-2 text-xs font-bold text-[#ffd08a]"
                    onClick={() => {
                      resetPaymentDialog();
                      setOrderType("takeaway");
                      setSelectedPaymentMethod("QRIS");
                      setPaymentProvider(defaultPaymentProvider("QRIS"));
                      setPaymentStep("payment");
                      setPaymentOpen(true);
                    }}
                  >
                    <span className="flex min-w-0 flex-col items-center leading-4">
                      <span className="truncate text-sm">⚡ QRIS</span>
                      <span className="truncate text-[11px] font-semibold opacity-90">Take away</span>
                    </span>
                  </Button>
                </div>
                <DialogContent
                  data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
                  className="flex max-h-[92svh] flex-col overflow-hidden sm:max-w-3xl"
                >
                  <DialogHeader>
                    <DialogTitle>
                      {paymentStep === "done" ? "Transaksi selesai" : "Pembayaran POS"}
                    </DialogTitle>
                    <DialogDescription>
                      {paymentStep === "done"
                        ? cashierPosSettings.receiptPrintMode === "auto"
                          ? "Struk thermal otomatis dicetak setelah transaksi selesai."
                          : "Transaksi selesai. Cetak struk tersedia dari tombol manual."
                        : "Selesaikan order kasir dari ringkasan, meja, pelanggan, lalu pembayaran."}
                    </DialogDescription>
                  </DialogHeader>
                  {paymentStep === "done" && openBillSaved ? (
                    <div className="garage-scroll min-h-0 overflow-y-auto pr-1">
                      <OpenBillSavedPanel
                        bill={openBillSaved}
                        printing={provisionalBillBusyId === openBillSaved.orderId}
                        onPrint={() =>
                          void printProvisionalBill({ id: openBillSaved.orderId, orderNo: openBillSaved.orderNo })
                        }
                        onNewTransaction={startNewTransaction}
                        onClose={startNewTransaction}
                      />
                    </div>
                  ) : paymentStep === "done" && completedReceipt ? (
                    <div className="garage-scroll min-h-0 overflow-y-auto pr-1">
                      <PaymentCompletePanel
                        receipt={completedReceipt}
                        autoPrint={
                          settings.autoPrintReceipt &&
                          cashierPosSettings.receiptPrintMode === "auto"
                        }
                        onNewTransaction={startNewTransaction}
                        onClose={() => setPaymentOpen(false)}
                      />
                    </div>
                  ) : (
                    <>
                      <PaymentWizardProgress step={paymentStep} />
                      <div className="garage-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                        {paymentStep === "summary" ? (
                          <div className="space-y-3">
                            <CheckoutSummaryCard
                              cartLines={cartLines}
                              cartItemCount={cartItemCount}
                              subtotal={subtotal}
                              service={service}
                              tax={tax}
                              serviceChargePct={serviceChargePct}
                              taxPct={taxPct}
                              roundingAdjustment={roundingAdjustment}
                              voucher={voucher}
                              manualDiscount={
                                manualDiscount && manualDiscountAmount > 0
                                  ? {
                                      amount: manualDiscountAmount,
                                      reason: manualDiscount.reason,
                                    }
                                  : null
                              }
                              totalDue={totalDue}
                            />

                            {/* Voucher + Diskon Kasir + Split bill — dipindah dari
                                keranjang ke sini supaya keranjang fokus ke item. */}
                            <div className="pos-voucher-box rounded-md border border-[#34343c] bg-[#15151b] p-3">
                              <p className="garage-mono mb-2 text-[10px] uppercase tracking-wide text-[#b8b8bf]">
                                Kode voucher
                              </p>
                              <div className="flex gap-2">
                                <Input
                                  value={posVoucherCode}
                                  onChange={(event) => {
                                    setPosVoucherCode(event.target.value.toUpperCase());
                                    setPosVoucherResult(null);
                                  }}
                                  placeholder="Kode voucher"
                                  className="h-10 border-[#34343c] bg-white/[0.06] text-sm"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="garage-press h-10 shrink-0 border-[#4a4a54] px-4 text-sm"
                                  disabled={posVoucherBusy || !subtotal}
                                  onClick={() => void validatePosVoucher()}
                                >
                                  {posVoucherBusy ? "Cek..." : "Cek"}
                                </Button>
                              </div>
                              {posVoucherResult ? (
                                <p
                                  className={`mt-1.5 text-[11px] ${
                                    posVoucherResult.valid ? "text-[#86efac]" : "text-[#ffc2c8]"
                                  }`}
                                >
                                  {posVoucherResult.message}
                                </p>
                              ) : null}
                            </div>

                            <div
                              className={`flex items-center justify-between gap-2 rounded-md border p-3 ${
                                manualDiscountAwaitingApproval
                                  ? "border-[#f5a742]/55 bg-[#f5a742]/10"
                                  : manualDiscount
                                    ? "border-[#f5a742]/40 bg-[#f5a742]/8"
                                    : "border-[#34343c] bg-[#15151b]"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="garage-mono text-[10px] uppercase tracking-wide text-[#b8b8bf]">
                                  Diskon Kasir
                                </p>
                                {manualDiscount ? (
                                  <p className="truncate text-xs font-semibold text-[#ffd08a]">
                                    {manualDiscount.type === "percent"
                                      ? `-${manualDiscount.rawValue}%`
                                      : `-${currency.format(manualDiscount.amount)}`}
                                    {manualDiscountAwaitingApproval ? (
                                      <span className="ml-1 text-[10px] font-normal text-[#ffd79a]">
                                        (menunggu approval)
                                      </span>
                                    ) : null}
                                  </p>
                                ) : (
                                  <p className="truncate text-xs text-[#8f8f99]">Belum dipakai</p>
                                )}
                              </div>
                              <div className="flex shrink-0 gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="garage-press h-9 border-[#4a4a54] px-3 text-xs"
                                  onClick={openManualDiscountDialog}
                                  disabled={!cartLines.length}
                                  aria-label={manualDiscount ? "Ubah diskon kasir" : "Atur diskon kasir"}
                                >
                                  <Percent className="size-3" />
                                  <span className="ml-1">{manualDiscount ? "Ubah" : "Atur"}</span>
                                </Button>
                                {manualDiscount ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="garage-press size-9 border-[#d11a2a]/45 bg-[#d11a2a]/14 text-[#ffe1e5]"
                                    onClick={clearManualDiscount}
                                    aria-label="Hapus diskon kasir"
                                  >
                                    <X className="size-3" />
                                  </Button>
                                ) : null}
                              </div>
                            </div>

                            {manualDiscountAwaitingApproval && manualDiscount?.approvalId ? (
                              discountPinOpen ? (
                                <ManagerPinPanel
                                  approvalId={manualDiscount.approvalId}
                                  onCancel={() => setDiscountPinOpen(false)}
                                  onDecided={(status, decidedByName) => {
                                    setDiscountPinOpen(false);
                                    const by = decidedByName ? ` oleh ${decidedByName}` : "";
                                    if (status === "approved") {
                                      setManualDiscount((current) =>
                                        current ? { ...current, approvalStatus: "approved" } : null,
                                      );
                                      setPosNotice(`Diskon manual disetujui${by} — bisa lanjut bayar.`);
                                    } else {
                                      setManualDiscount(null);
                                      setPosNotice(`Diskon manual ditolak${by}.`);
                                    }
                                  }}
                                />
                              ) : (
                                <Button
                                  type="button"
                                  className="garage-press h-11 w-full gap-2 bg-[#f5a742] text-sm font-bold text-black hover:bg-[#ffb85c]"
                                  onClick={() => setDiscountPinOpen(true)}
                                >
                                  <ShieldAlert className="size-4" />
                                  Manajer ada di sini — setujui dengan PIN
                                </Button>
                              )
                            ) : null}

                            {totalDue > 0 && cartLines.length > 0 ? (
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentOpen(false);
                                    setCartSplitOpen(true);
                                  }}
                                  disabled={cartItemCount < 2}
                                  title={cartItemCount < 2 ? "Butuh minimal 2 porsi untuk dipisah" : undefined}
                                  className="garage-press flex w-full items-center justify-center gap-1.5 rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/14 py-2.5 text-xs font-bold text-[#ffe1e5] transition-colors hover:border-[#d11a2a] hover:bg-[#d11a2a]/22 disabled:opacity-40"
                                >
                                  <Scissors className="size-3.5" />
                                  Split per produk
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSplitPeopleCount("2");
                                    setSplitBillOpen(true);
                                  }}
                                  className="pos-split-bill-button garage-press flex w-full items-center justify-center gap-1.5 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 py-2.5 text-xs font-semibold text-[#ffd79a] transition-colors hover:border-[#f5a742]/70 hover:bg-[#f5a742]/18 hover:text-[#ffeac2]"
                                >
                                  <Users className="size-3.5" />
                                  Bagi rata
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {paymentStep === "table" ? (
                          <CheckoutOrderStep
                            orderType={orderType}
                            tableLabel={tableLabel}
                            selectedTableNumber={selectedTableNumber}
                            selectedTableLiveRow={selectedTableLiveRow}
                            selectedTableAvailability={selectedTableAvailability}
                            dineInTableMissing={dineInTableMissing}
                            tablePickerRows={tablePickerRows}
                            tableLiveDataReady={tableLiveDataReady}
                            paymentPending={paymentPending}
                            onOrderTypeChange={(value) => {
                              setOrderType(value);
                              setPaymentError(null);
                            }}
                            onTableChange={(value) => {
                              setSelectedTableNumber(value);
                              setPaymentError(null);
                            }}
                          />
                        ) : null}
                        <MemberQrScanDialog
                          open={memberQrOpen}
                          busy={memberQrBusy}
                          error={memberQrError}
                          onDetect={(payload) => void verifyMemberQr(payload)}
                          onOpenChange={setMemberQrOpen}
                        />
                        {paymentStep === "customer" ? (
                          <CheckoutCustomerStep
                            mode={posCustomerMode}
                            guestName={guestName}
                            guestPhone={guestPhone}
                            memberPhone={memberPhone}
                            selectedMember={selectedMember}
                            memberLookupLoading={memberLookupLoading}
                            memberError={memberError}
                            memberCreatedPin={memberCreatedPin}
                            estimatedMemberPoints={estimatedMemberPoints}
                            pointsToUse={pointsToUse}
                            maxPointsToUse={maxPointsToUse}
                            minPointsToUse={settings.memberRedeemMinPoints}
                            pointValue={settings.memberPointValue}
                            onPointsToUseChange={setPosPointsToUse}
                            memberQrVerified={memberQrVerified}
                            onScanMemberQr={() => {
                              setMemberQrError(null);
                              setMemberQrOpen(true);
                            }}
                            memberOptions={posMemberOptions}
                            onModeChange={setPosCustomerMode}
                            onGuestNameChange={setGuestName}
                            onGuestPhoneChange={handleGuestPhoneChange}
                            onMemberPhoneChange={handleMemberPhoneChange}
                            onLookupMember={() => void lookupPosMember()}
                            onSelectMember={selectPosMember}
                            onClearMember={() => {
                              setSelectedMember(null);
                              setMemberCreatedPin(null);
                            }}
                          />
                        ) : null}
                        {paymentStep === "payment" ? (
                          <div className="space-y-3">
                            {pointsDiscountAmount > 0 ? (
                              <div className="flex items-center justify-between gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 px-3 py-2 text-sm">
                                <span className="text-[#ffe2b8]">Potongan poin member ({pointsToUse} poin)</span>
                                <span className="garage-mono font-semibold text-[#ffd08a]">
                                  −{currency.format(pointsDiscountAmount)}
                                </span>
                              </div>
                            ) : null}
                            {cartItemCount >= 2 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentOpen(false);
                                  setCartSplitOpen(true);
                                }}
                                disabled={paymentPending}
                                className="garage-press flex w-full items-center justify-center gap-1.5 rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/14 py-2.5 text-sm font-bold text-[#ffe1e5] transition-colors hover:border-[#d11a2a] hover:bg-[#d11a2a]/22"
                              >
                                <Scissors className="size-4" />
                                Bayar terpisah per tamu (split per produk)
                              </button>
                            ) : null}
                            <div className="grid gap-2 sm:grid-cols-2">
                              {paymentMethods.map((method) => (
                                <Button
                                  key={method}
                                  type="button"
                                  variant={selectedPaymentMethod === method ? "default" : "outline"}
                                  className={`garage-press h-12 ${
                                    selectedPaymentMethod === method
                                      ? "bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                                      : "border-[#4a4a54]"
                                  }`}
                                  disabled={paymentPending}
                                  onClick={() => selectPaymentMethod(method)}
                                >
                                  {paymentMethodLabel(method)}
                                </Button>
                              ))}
                            </div>
                            {selectedPaymentMethod === "Cash" ? (
                              <CashPaymentPanel
                                cashReceived={cashReceived}
                                cashReceivedValue={cashReceivedValue}
                                cashPaymentReady={cashPaymentReady}
                                cashChange={cashChange}
                                cashShortage={cashShortage}
                                quickCashAmounts={quickCashAmounts}
                                totalDue={totalDue}
                                paymentPending={paymentPending}
                                onCashReceivedChange={setCashReceived}
                              />
                            ) : null}
                            {selectedPaymentMethod === "QRIS" ? (
                              <QrisPaymentPanel
                                imagePath={paymentBrandConfig.qrisImagePath}
                                imageReady={qrisImageReady}
                                onImageReadyChange={setQrisImageReady}
                                paymentReference={paymentReference}
                                onPaymentReferenceChange={setPaymentReference}
                                totalDue={totalDue}
                                referenceRequired={settings.qrisReferenceRequired}
                              />
                            ) : null}
                            {selectedPaymentMethod === "Bank Transfer" ? (
                              <BankTransferPaymentPanel
                                selectedProvider={paymentProviderValue}
                                selectedAccount={selectedBankAccount}
                                paymentReference={paymentReference}
                                onProviderChange={setPaymentProvider}
                                onPaymentReferenceChange={setPaymentReference}
                              />
                            ) : null}
                            {selectedPaymentMethod === "E-Wallet" ? (
                              <EWalletPaymentPanel
                                selectedProvider={paymentProviderValue}
                                selectedAccount={selectedEWalletAccount}
                                paymentReference={paymentReference}
                                onProviderChange={setPaymentProvider}
                                onPaymentReferenceChange={setPaymentReference}
                              />
                            ) : null}
                          </div>
                        ) : null}
                        {paymentError && (
                          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                            <AlertTriangle className="size-4" />
                            <AlertTitle>Pembayaran gagal</AlertTitle>
                            <AlertDescription>{paymentError}</AlertDescription>
                          </Alert>
                        )}
                        {paymentResult && (
                          <Alert className="border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#f4f4f5]">
                            <Check className="size-4" />
                            <AlertTitle>Pembayaran tercatat</AlertTitle>
                            <AlertDescription>{paymentResult}</AlertDescription>
                          </Alert>
                        )}
                      </div>
                      <div className="-mx-4 -mb-4 shrink-0 border-t border-[#34343c] bg-[#111116] p-4">
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                          <Button
                            type="button"
                            variant="outline"
                            className="garage-press h-11 border-[#4a4a54]"
                            disabled={paymentPending}
                            onClick={() =>
                              setPaymentStep((step) =>
                                step === "payment"
                                  ? "customer"
                                  : step === "customer"
                                    ? "table"
                                    : step === "table"
                                      ? "summary"
                                      : "summary",
                              )
                            }
                          >
                            {paymentStep === "summary" ? "Ringkasan" : "Kembali"}
                          </Button>
                          {paymentStep === "summary" ? (
                            <Button
                              className="garage-press h-11 text-base font-semibold sm:min-w-44"
                              disabled={!cartLines.length}
                              onClick={() => setPaymentStep("table")}
                            >
                              Lanjut
                            </Button>
                          ) : null}
                          {paymentStep === "table" ? (
                            <Button
                              className="garage-press h-11 text-base font-semibold sm:min-w-44"
                              disabled={dineInTableMissing}
                              onClick={() => setPaymentStep("customer")}
                            >
                              Lanjut Pelanggan
                            </Button>
                          ) : null}
                          {paymentStep === "customer" ? (
                            <Button
                              className="garage-press h-11 text-base font-semibold sm:min-w-44"
                              disabled={posCustomerMode === "member" && !selectedMember}
                              onClick={() => setPaymentStep("payment")}
                            >
                              Lanjut Pembayaran
                            </Button>
                          ) : null}
                          {paymentStep === "payment" && orderType !== "delivery" ? (
                            <Button
                              type="button"
                              variant="outline"
                              data-testid="pos-open-bill"
                              className="garage-press h-11 border-[#f5a742]/70 bg-[#f5a742]/10 text-base font-semibold text-[#ffd08a] hover:bg-[#f5a742]/20 sm:min-w-44"
                              disabled={paymentPending || !cartLines.length}
                              onClick={() => void submitOpenBill()}
                            >
                              <Clock aria-hidden className="size-4" />
                              Bayar nanti
                            </Button>
                          ) : null}
                          {paymentStep === "payment" ? (
                            <Button
                              className="garage-press h-11 text-base font-semibold sm:min-w-44"
                              disabled={paymentPending || !cartLines.length || !checkoutReady}
                              onClick={() => void submitOrder(selectedPaymentMethod)}
                            >
                              {paymentPending
                                ? "Mencatat..."
                                : selectedPaymentMethod === "Cash" && cashReceived !== "" && cashPaymentReady
                                  ? cashConfirmLabel(cashReceivedValue, totalDue)
                                  : qrisReferenceMissing
                                    ? "Isi referensi QRIS"
                                    : "Konfirmasi Bayar"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </aside>
        </div>
        </>
      )}

      <Dialog
        open={Boolean(variantItem)}
        onOpenChange={(open) => {
          if (!open) {
            setVariantItem(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-hidden border-[#34343c] bg-[#111116]">
          <DialogHeader>
            <DialogTitle>{variantItem?.name ?? "Pilih varian"}</DialogTitle>
            <DialogDescription>
              Tap varian untuk langsung masuk ke keranjang.
            </DialogDescription>
          </DialogHeader>
          <div className="garage-scroll max-h-[58vh] overflow-y-auto pr-1">
            <div className="grid gap-2 sm:grid-cols-2">
              {variantItem?.variants.map((variant) => (
                <Button
                  key={variant.id}
                  type="button"
                  variant="outline"
                  className="garage-press h-auto min-h-16 justify-between border-[#4a4a54] px-3 py-3"
                  onClick={() => {
                    addItem(variantItem.id, variant.id);
                    setVariantItem(null);
                  }}
                >
                  <span className="text-left">
                    <span className="block text-sm font-semibold">{variant.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {currency.format(variant.price)}
                    </span>
                  </span>
                  <Plus className="size-4" />
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clearCartOpen} onOpenChange={setClearCartOpen}>
        <DialogContent className="border-[#34343c] bg-[#111116]">
          <DialogHeader>
            <DialogTitle>Hapus keranjang?</DialogTitle>
            <DialogDescription>
              Semua item di current bill akan dihapus dari cart.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="garage-press border-[#4a4a54]"
              onClick={() => setClearCartOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="garage-press bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
              onClick={() => {
                setCart([]);
                setClearCartOpen(false);
              }}
            >
              <Trash2 className="mr-2 size-4" />
              Hapus keranjang
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PARK DIALOG â€” input label sebelum park */}
      <Dialog open={parkDialogOpen} onOpenChange={setParkDialogOpen}>
        <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PauseCircle className="size-5 text-[#f5a742]" />
              Parkir Bill Saat Ini
            </DialogTitle>
            <DialogDescription>
              Cart akan disimpan sementara dan kasir bisa layani customer lain dulu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
              <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                Bill yang akan di-park
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {cartLines.length} item · {currency.format(estimateCartTotal(cart))}
              </p>
              <p className="mt-0.5 text-[10px] text-[#8f8f99]">
                {orderType === "dine-in" && selectedTableNumber
                  ? `Meja ${selectedTableNumber}`
                  : orderType === "takeaway"
                    ? "Take Away"
                    : "Delivery"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
                Label (opsional)
              </p>
              <Input
                value={parkLabel}
                onChange={(event) => setParkLabel(event.target.value)}
                placeholder={`Misal: Budi T-04, baju biru, dll`}
                maxLength={60}
                className="mt-1 h-10 border-[#34343c] bg-white/[0.06]"
                autoFocus
              />
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                Kosongkan untuk auto-label berdasarkan meja/order type.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 border-[#4a4a54]"
                onClick={() => setParkDialogOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="button"
                className="garage-press h-10 gap-2"
                onClick={() => parkCurrentOrder(parkLabel)}
              >
                <PauseCircle className="size-4" />
                Parkir Sekarang
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PARKED ORDERS LIST DIALOG */}
      <Dialog open={parkedListOpen} onOpenChange={setParkedListOpen}>
        <DialogContent className="max-h-[80svh] overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="size-5 text-[#f5a742]" />
              Parked Orders ({parkedOrders.length})
            </DialogTitle>
            <DialogDescription>
              Bill yang sedang ditahan. Klik Lanjutkan untuk meneruskan transaksi.
            </DialogDescription>
          </DialogHeader>
          {parkedOrders.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#8f8f99]">
              <Archive className="mx-auto mb-2 size-6 text-[#4a4a54]" />
              Tidak ada bill yang sedang di-park.
            </div>
          ) : (
            <div className="garage-scroll max-h-[60svh] space-y-2 overflow-y-auto pr-1">
              {parkedOrders.map((parked) => {
                // Pakai parkedAt langsung sebagai display tanpa Date.now() di render
                const parkedDate = new Date(parked.parkedAt);
                const ageMinutes = Math.max(
                  0,
                  Math.floor((parkedListNowTick - parkedDate.getTime()) / 60_000),
                );
                return (
                  <div
                    key={parked.id}
                    className="rounded-md border border-[#34343c] bg-[#17171c] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">
                          {parked.label}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                          {parked.itemCount} item ·{" "}
                          {currency.format(parked.estimatedTotal)} ·{" "}
                          {ageMinutes === 0 ? "baru saja" : `${ageMinutes}m lalu`}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[#8f8f99]">
                          {parked.orderType === "dine-in" &&
                          parked.selectedTableNumber
                            ? `Meja ${parked.selectedTableNumber}`
                            : parked.orderType}
                          {parked.posCustomerMode === "member" &&
                            parked.memberPhone &&
                            ` · Member ${parked.memberPhone}`}
                          {parked.posCustomerMode === "guest" &&
                            parked.guestName &&
                            ` · ${parked.guestName}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="garage-press h-8 gap-1 text-xs"
                          onClick={() => resumeParkedOrder(parked)}
                        >
                          <ArrowRight className="size-3" />
                          Lanjutkan
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="garage-press h-8 border-[#d11a2a]/45 bg-[#d11a2a]/10 px-2 text-[#ffc2c8]"
                          onClick={async () => {
                            const ok = await askConfirm({
                              title: "Hapus parked bill?",
                              message: `Hapus parked bill "${parked.label}"?`,
                              confirmLabel: "Hapus",
                              danger: true,
                            });
                            if (ok) deleteParkedOrder(parked.id);
                          }}
                          aria-label="Hapus parked bill"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end border-t border-[#34343c] pt-3">
            <p className="text-[10px] text-[#8f8f99]">
              Auto-hapus saat browser cache clear · max 20 bill
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* SPLIT BILL CALCULATOR DIALOG */}
      <Dialog open={splitBillOpen} onOpenChange={setSplitBillOpen}>
        <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-[#f5a742]" />
              Bagi Rata (Split Bill)
            </DialogTitle>
            <DialogDescription>
              Kalkulator untuk customer yang bayar terpisah. Tidak mengubah total bill di kasir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
              <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                Total Bill
              </p>
              <p className="mt-1 garage-display text-2xl font-bold text-[#ffd79a]">
                {currency.format(totalDue)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
                Bagi jadi berapa orang?
              </p>
              <Input
                type="number"
                min={2}
                max={20}
                value={splitPeopleCount}
                onChange={(event) =>
                  setSplitPeopleCount(event.target.value.replace(/\D/g, ""))
                }
                className="mt-1 h-12 border-[#34343c] bg-white/[0.06] text-center text-2xl font-bold"
                autoFocus
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSplitPeopleCount(String(n))}
                    className={`garage-press flex-1 rounded-md border px-2 py-1.5 text-xs font-bold ${
                      splitPeopleCount === String(n)
                        ? "border-[#f5a742] bg-[#f5a742]/16 text-[#ffd79a]"
                        : "border-[#34343c] bg-white/[0.04] text-[#d6d6dc] hover:border-[#4a4a54]"
                    }`}
                  >
                    {n} org
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const count = Math.max(2, Math.min(20, Number(splitPeopleCount) || 0));
              if (!count || count < 2) return null;
              const exactPerPerson = totalDue / count;
              const roundedPerPerson = Math.ceil(exactPerPerson / 1000) * 1000;
              const totalRounded = roundedPerPerson * count;
              const extraOverpay = totalRounded - totalDue;
              return (
                <div className="space-y-2">
                  <div className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 p-4 text-center">
                    <p className="garage-mono text-[10px] uppercase tracking-wide text-[#ffd79a]">
                      Per Orang (rounded ke Rp 1.000)
                    </p>
                    <p className="mt-1 garage-display text-3xl font-bold text-white">
                      {currency.format(roundedPerPerson)}
                    </p>
                    <p className="mt-1 text-[10px] text-[#ffd79a]/80">
                      × {count} orang = {currency.format(totalRounded)}
                      {extraOverpay > 0 && ` (lebih ${currency.format(extraOverpay)})`}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3 text-center">
                    <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                      Exact (tanpa pembulatan)
                    </p>
                    <p className="mt-1 font-mono text-sm font-semibold text-[#d6d6dc]">
                      {currency.format(Math.round(exactPerPerson))} per orang
                    </p>
                  </div>
                  <p className="text-center text-[10px] text-[#8f8f99]">
                    Kasir tetap input total ({currency.format(totalDue)}) di kasir.
                    Customer urus bagi-bagi sendiri.
                  </p>
                </div>
              );
            })()}

            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 w-full border-[#4a4a54]"
              onClick={() => setSplitBillOpen(false)}
            >
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {staleShift && !locked && !shiftDialogOpen && (
        <div className="fixed inset-0 z-[110] flex min-h-screen items-center justify-center bg-[#050506]/95 p-4">
          <div role="alertdialog" aria-labelledby="stale-shift-title" className="garage-panel w-full max-w-md rounded-md p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffe0ad]">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h2 id="stale-shift-title" className="garage-display garage-chrome text-2xl">
                  Shift belum ditutup
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#d6d6dc]">
                  Shift {cashSession.code} sudah terbuka lebih dari 20 jam. Hitung uang laci lalu
                  tutup shift dulu, kemudian buka shift baru untuk transaksi hari ini.
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="garage-press mt-5 h-11 w-full bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
              onClick={() => setShiftDialogOpen(true)}
            >
              Tutup shift sekarang
            </Button>
          </div>
        </div>
      )}
      {fullscreenNeedsAttention && !locked && (
        <div className="fixed inset-0 z-[120] flex min-h-screen items-center justify-center bg-[#050506] p-4">
          <div className="garage-panel w-full max-w-md rounded-md p-5 shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffe0ad]">
                <LockKeyhole className="size-5" />
              </div>
              <div>
                <h2 className="garage-display garage-chrome text-2xl">
                  {fullscreenStarted ? "Layar keluar fullscreen" : "Kunci fullscreen POS"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#d6d6dc]">
                  Mode layar penuh menjaga layar kasir tetap fokus saat transaksi berjalan.
                  Cetak struk dilakukan manual setelah pembayaran selesai.
                </p>
              </div>
            </div>
            {fullscreenError && (
              <Alert className="mt-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Layar penuh gagal</AlertTitle>
                <AlertDescription>{fullscreenError}</AlertDescription>
              </Alert>
            )}
            <Button
              type="button"
              className="garage-press mt-5 h-11 w-full bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
              onClick={() => void requestPosFullscreen()}
            >
              <Square className="mr-2 size-4" />
              {fullscreenActionLabel}
            </Button>
            <p className="mt-3 text-xs leading-5 text-[#9f9faa]">
              Gunakan tombol Cetak Struk di langkah Selesai. Browser akan membuka dialog print
              untuk memilih printer thermal 57/58 mm.
            </p>
          </div>
        </div>
      )}

      {locked && (
        <div className="fixed inset-0 z-[120] flex min-h-screen items-center justify-center bg-[#050506] p-4">
          <div className="garage-panel w-full max-w-sm rounded-md p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/14 text-[#ffc2c8]">
                <LockKeyhole className="size-5" />
              </div>
              <div>
                <h2 className="garage-display garage-chrome text-2xl">Kasir terkunci</h2>
                <p className="mt-1 text-sm leading-6 text-[#d6d6dc]">
                  Masukkan password akun {me.user.name} untuk membuka kasir.
                </p>
              </div>
            </div>
            {fullscreenNeedsAttention && (
              <Alert className="mt-4 border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Layar keluar fullscreen</AlertTitle>
                <AlertDescription>
                  Masuk fullscreen lagi sebelum melanjutkan POS.
                </AlertDescription>
                <Button
                  type="button"
                  className="garage-press mt-3 h-10 w-full bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                  onClick={() => void requestPosFullscreen()}
                >
                  <Square className="mr-2 size-4" />
                  {fullscreenActionLabel}
                </Button>
              </Alert>
            )}
            <form onSubmit={(event) => void unlockCashier(event)} className="mt-5 space-y-3">
              <Input
                type="password"
                value={unlockPassword}
                onChange={(event) => setUnlockPassword(event.target.value)}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                placeholder="Password akun"
                autoComplete="current-password"
              />
              {lockError && (
                <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Buka kunci gagal</AlertTitle>
                  <AlertDescription>{lockError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="garage-press h-11 w-full">
                Unlock POS
              </Button>
            </form>
            {!isCashierKiosk && (
              <Button
                type="button"
                variant="outline"
                className="garage-press mt-3 h-11 w-full border-[#4a4a54] bg-white/[0.06]"
                disabled={signOutPending}
                onClick={() => void signOutFromLockedPos()}
              >
                <LogOut className="mr-2 size-4" />
                {signOutPending ? "Keluar..." : "Keluar"}
              </Button>
            )}
          </div>
        </div>
      )}
      {completedReceipt ? (
        <div className="garage-print-root">
          <PrintableReceipt receipt={completedReceipt} />
        </div>
      ) : null}

      {/* Dialog: Diskon Kasir (manual discount, frontend-only) */}
      <Dialog
        open={manualDiscountOpen}
        onOpenChange={(open) => {
          setManualDiscountOpen(open);
          if (!open) setManualDiscountError(null);
        }}
      >
        <DialogContent
          data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
          className="border-[#34343c] bg-[#111116] sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Diskon Kasir</DialogTitle>
            <DialogDescription>
              Potongan goodwill kasir. Di atas {settings.manualDiscountApprovalPct ?? 10}%
              bill otomatis masuk Approvals. Maks {settings.manualDiscountMaxPct}% per bill.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void applyManualDiscount();
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className={`garage-press h-11 ${
                  manualDiscountTypeInput === "amount"
                    ? "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd08a]"
                    : "border-[#4a4a54] bg-white/[0.055]"
                }`}
                onClick={() => setManualDiscountTypeInput("amount")}
              >
                <Banknote className="mr-2 size-4" />
                Nominal (Rp)
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`garage-press h-11 ${
                  manualDiscountTypeInput === "percent"
                    ? "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd08a]"
                    : "border-[#4a4a54] bg-white/[0.055]"
                }`}
                onClick={() => setManualDiscountTypeInput("percent")}
              >
                <Percent className="mr-2 size-4" />
                Persen (%)
              </Button>
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                {manualDiscountTypeInput === "percent"
                  ? "Persen diskon (1–100)"
                  : "Nominal diskon (Rp)"}
              </p>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={manualDiscountTypeInput === "percent" ? 100 : undefined}
                value={manualDiscountValueInput}
                onChange={(event) =>
                  setManualDiscountValueInput(event.target.value)
                }
                placeholder={manualDiscountTypeInput === "percent" ? "10" : "5000"}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                autoFocus
              />
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                Alasan / approval (wajib)
              </p>
              <Input
                value={manualDiscountReasonInput}
                onChange={(event) =>
                  setManualDiscountReasonInput(event.target.value.slice(0, 60))
                }
                placeholder="mis. Komplain dapur lama, Member ultah, Promo kasir"
                className="h-11 border-[#34343c] bg-white/[0.06]"
                maxLength={60}
              />
            </div>
            <div className="rounded-md border border-[#34343c] bg-[#0f0f14] p-2.5">
              <div className="flex items-center justify-between text-xs text-[#b8b8bf]">
                <span>Sebelum diskon kasir</span>
                <span className="garage-mono">
                  {currency.format(Math.max(0, total - voucher))}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm font-semibold text-[#ffd08a]">
                <span>Setelah diskon kasir</span>
                <span className="garage-mono">
                  {(() => {
                    const raw = Number(manualDiscountValueInput);
                    if (!Number.isFinite(raw) || raw <= 0)
                      return currency.format(Math.max(0, total - voucher));
                    const base = Math.max(0, total - voucher);
                    const cut =
                      manualDiscountTypeInput === "percent"
                        ? Math.min(base, Math.round((base * raw) / 100))
                        : Math.min(base, Math.round(raw));
                    return currency.format(Math.max(0, base - cut));
                  })()}
                </span>
              </div>
            </div>
            {manualDiscountError ? (
              <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Diskon kasir</AlertTitle>
                <AlertDescription>{manualDiscountError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
                onClick={() => setManualDiscountOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" className="garage-press h-10">
                <Check className="mr-2 size-4" />
                Terapkan
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Daftar Member (kasir) */}
      <Dialog open={memberRegOpen} onOpenChange={setMemberRegOpen}>
        <DialogContent
          data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
          className="border-[#34343c] bg-[#111116] sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Daftar Member Baru</DialogTitle>
            <DialogDescription>
              Daftarkan pelanggan jadi member Silver. Pakai PIN sederhana yang mudah
              diingat (mis. 6 digit). Tier lebih tinggi diatur lewat menu Membership.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-[#d6d6dc]">Nama</span>
              <Input
                value={memberRegName}
                onChange={(e) => setMemberRegName(e.target.value)}
                placeholder="Nama pelanggan"
                className="h-11 border-[#34343c] bg-white/[0.06]"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-[#d6d6dc]">Nomor HP</span>
              <Input
                value={memberRegPhone}
                onChange={(e) => setMemberRegPhone(e.target.value)}
                placeholder="0813..."
                inputMode="tel"
                className="h-11 border-[#34343c] bg-white/[0.06]"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-[#d6d6dc]">PIN</span>
              <Input
                value={memberRegPin}
                onChange={(e) => setMemberRegPin(e.target.value)}
                placeholder="Min. 6 digit"
                type="password"
                className="h-11 border-[#34343c] bg-white/[0.06]"
              />
            </div>
            {memberRegMsg ? (
              <p className="rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/12 px-3 py-2 text-xs font-semibold text-[#ffb4bd]">
                {memberRegMsg}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54]"
              onClick={() => setMemberRegOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="garage-press h-10"
              disabled={memberRegBusy}
              onClick={() => void submitMemberRegister()}
            >
              {memberRegBusy ? "Mendaftar..." : "Daftarkan (Silver)"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Atur Stok Habis */}
      <Dialog open={soldOutDialogOpen} onOpenChange={setSoldOutDialogOpen}>
        <DialogContent
          data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
          className="flex max-h-[88svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-xl"
        >
          <DialogHeader>
            <DialogTitle>Atur Menu Digital</DialogTitle>
            <DialogDescription>
              Ketuk item untuk tandai HABIS (terkunci di POS &amp; Menu Digital QR),
              atau tekan ikon kamera untuk set foto menu.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              value={soldOutQuery}
              onChange={(event) => setSoldOutQuery(event.target.value)}
              placeholder="Cari item..."
              className="h-10 border-[#34343c] bg-white/[0.06]"
            />
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54] bg-white/[0.055] px-3 text-xs"
              onClick={() => void clearAllSoldOut()}
              disabled={!soldOutIds.size || soldOutPendingIds.size > 0}
            >
              Reset ({soldOutIds.size})
            </Button>
          </div>
          <div className="garage-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {(() => {
              const q = soldOutQuery.trim().toLowerCase();
              const filtered = menuItems.filter((item) =>
                q ? item.name.toLowerCase().includes(q) : true,
              );
              if (!filtered.length) {
                return (
                  <p className="py-6 text-center text-xs text-[#8f8f99]">
                    Tidak ada item.
                  </p>
                );
              }
              return filtered.map((item) => {
                const isSoldOut = soldOutIds.has(item.id);
                const isPending = soldOutPendingIds.has(item.id);
                const hasPhoto = Boolean(item.imageUrl);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition ${
                      isSoldOut
                        ? "border-[#d11a2a]/55 bg-[#d11a2a]/14"
                        : "border-[#34343c] bg-white/[0.04]"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => void updateSoldOutStock(item.id, !isSoldOut)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded px-1 py-1 text-left transition hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-70"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {item.name}
                        </p>
                        <p className="truncate text-[11px] text-[#b8b8bf]">
                          {item.category} &middot; {item.section}
                        </p>
                      </div>
                      {isPending ? (
                        <Badge className="border-[#f5a742]/55 bg-[#f5a742]/14 px-2 text-[10px] text-[#ffd08a]">
                          Sync...
                        </Badge>
                      ) : isSoldOut ? (
                        <Badge className="border-[#d11a2a]/55 bg-[#d11a2a]/22 px-2 text-[10px] font-extrabold text-[#ffe1e5]">
                          <Ban className="mr-1 size-3" />
                          HABIS
                        </Badge>
                      ) : (
                        <Badge className="border-[#4a4a54] bg-white/[0.08] px-2 text-[10px] text-[#d6d6dc]">
                          Tersedia
                        </Badge>
                      )}
                    </button>
                    <button
                      type="button"
                      title={hasPhoto ? "Ganti foto menu" : "Unggah foto menu"}
                      aria-label={`Unggah foto ${item.name}`}
                      disabled={menuPhotoUploadingId === item.id}
                      onClick={() => openMenuPhotoPicker(item.id)}
                      className={`garage-press flex size-9 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-60 ${
                        hasPhoto
                          ? "border-[#79e2b9]/45 bg-[#79e2b9]/12 text-[#8df7cc] hover:bg-[#79e2b9]/20"
                          : "border-[#4a4a54] bg-white/[0.05] text-[#d6d6dc] hover:bg-white/[0.1]"
                      }`}
                    >
                      {menuPhotoUploadingId === item.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Camera className="size-4" />
                      )}
                    </button>
                    {hasPhoto ? (
                      <button
                        type="button"
                        title="Hapus foto"
                        aria-label={`Hapus foto ${item.name}`}
                        onClick={() => void removeMenuItemPhoto(item.id)}
                        className="garage-press flex size-9 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/10 text-[#ffb4bd] transition hover:bg-[#d11a2a]/20"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                );
              });
            })()}
          </div>
          <input
            ref={menuPhotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void onMenuPhotoSelected(event)}
          />
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              className="garage-press h-10"
              onClick={() => setSoldOutDialogOpen(false)}
            >
              Selesai
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Riwayat Struk Shift (reprint) */}
      <Dialog
        open={receiptHistoryOpen}
        onOpenChange={(open) => {
          setReceiptHistoryOpen(open);
          if (!open) {
            setReprintTargetId(null);
            setReprintStatus("idle");
            setReprintError(null);
          }
        }}
      >
        <DialogContent
          data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
          className="flex max-h-[88svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>Riwayat Struk Shift</DialogTitle>
            <DialogDescription>
              {receiptHistory.length} struk terakhir dari device ini. Untuk
              riwayat penjualan lengkap, gunakan menu Riwayat Penjualan.
            </DialogDescription>
          </DialogHeader>
          {reprintStatus === "error" && reprintError ? (
            <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Cetak ulang gagal</AlertTitle>
              <AlertDescription>{reprintError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="garage-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {receiptHistory.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#8f8f99]">
                Belum ada struk yang dicetak di shift ini.
              </p>
            ) : (
              receiptHistory.map((receipt) => {
                const isTarget = reprintTargetId === receipt.invoiceNo;
                const printing = isTarget && reprintStatus === "printing";
                const success = isTarget && reprintStatus === "success";
                return (
                  <div
                    key={`${receipt.invoiceNo}-${receipt.createdAt}`}
                    className="rounded-md border border-[#34343c] bg-white/[0.04] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="garage-mono text-[10px] uppercase tracking-wide text-[#b8b8bf]">
                          {receipt.invoiceNo}
                        </p>
                        <p className="truncate text-sm font-semibold text-white">
                          {receipt.orderNo} · {receipt.tableLabel}
                        </p>
                        <p className="text-[11px] text-[#b8b8bf]">
                          {formatReceiptDate(receipt.createdAt)} ·{" "}
                          {receipt.payment.method}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="garage-mono text-sm font-extrabold text-[#ffd08a]">
                          {currency.format(receipt.total)}
                        </p>
                        <p className="text-[10px] text-[#8f8f99]">
                          {receipt.items.reduce((sum, it) => sum + it.qty, 0)} item
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                      {success ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#4ade80]">
                          <Check className="size-3.5" />
                          Terkirim ke printer
                        </span>
                      ) : null}
                      {canCancelOrder ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="garage-press h-9 border-[#d11a2a]/45 bg-[#d11a2a]/14 px-3 text-xs text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                          onClick={() =>
                            setCancelTarget({
                              orderNo: receipt.orderNo,
                              tableLabel: receipt.tableLabel,
                              total: receipt.total,
                            })
                          }
                        >
                          <Ban className="mr-1.5 size-3.5" />
                          Batal / Refund
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-9 border-[#4a4a54] bg-white/[0.055] px-3 text-xs"
                        onClick={() => void reprintReceipt(receipt)}
                        disabled={printing}
                      >
                        {printing ? (
                          <>
                            <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                            Mencetak...
                          </>
                        ) : (
                          <>
                            <Printer className="mr-1.5 size-3.5" />
                            Cetak ulang
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#d11a2a]/45 bg-[#d11a2a]/14 text-[#ffe1e5] hover:bg-[#d11a2a]/22"
              onClick={clearReceiptHistory}
              disabled={!receiptHistory.length}
            >
              <Trash2 className="mr-2 size-4" />
              Bersihkan
            </Button>
            <Button
              type="button"
              className="garage-press h-10"
              onClick={() => setReceiptHistoryOpen(false)}
            >
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PosInvoiceDeleteDialog
        target={invoiceDeleteTarget}
        onClose={() => setInvoiceDeleteTarget(null)}
        onDeleted={(message) => {
          setInvoiceDeleteTarget(null);
          setSelectedCustomerOrderId(null);
          setPosNotice(message);
          void loadCustomerOrders({ silent: true });
          void loadTableLiveData({ silent: true });
          void loadKitchenTickets();
          invalidateGarageCache([GARAGE_TAGS.orders, GARAGE_TAGS.finance, GARAGE_TAGS.kitchen, GARAGE_TAGS.dashboard]);
        }}
      />
      <PosOrderCancelDialog
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onFinished={handleCancelFinished}
      />

      <PosCartSplitDialog
        open={cartSplitOpen}
        lines={cartSplitLines}
        orderType={orderType}
        tableNumber={selectedTableNumber || undefined}
        tableLabel={tableLabel}
        settings={settings}
        qrisReady={qrisImageReady}
        blockedReason={cartSplitBlockedReason}
        onGuestPaid={handleSplitGuestPaid}
        onClose={(paid, assignment) => void handleSplitClose(paid, assignment)}
        onPrintReceipt={(receipt) => void reprintReceipt(receipt)}
      />

      <PosTableBillSplitDialog
        bill={tableSplitBill}
        tableLabel={tableDetail?.tableLabel ?? ""}
        roundingMode={settings.roundingMode}
        onClose={() => setTableSplitBill(null)}
        onSplit={(result) => void handleTableBillSplit(result)}
      />

      {/* Dialog: Kas Keluar / Masuk Laci */}
      <CashDrawerDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        role={me.role}
        threshold={settings.cashMovementPinThreshold}
        shiftOpen={shiftOpen}
        themeScope={isCashierKiosk ? cashierTheme : undefined}
        onRecorded={handleCashMovementRecorded}
      />

    </section>
  );
}

function PaymentWizardProgress({ step }: { step: PaymentStep }) {
  const steps: Array<{ id: PaymentStep; label: string; shortLabel: string }> = [
    { id: "summary", label: "Ringkasan", shortLabel: "Ringkas" },
    { id: "table", label: "Meja", shortLabel: "Meja" },
    { id: "customer", label: "Pelanggan", shortLabel: "Plg." },
    { id: "payment", label: "Pembayaran", shortLabel: "Bayar" },
    { id: "done", label: "Selesai", shortLabel: "Selesai" },
  ];
  const currentIndex = steps.findIndex((item) => item.id === step);

  return (
    <div className="grid grid-cols-5 gap-1">
      {steps.map((item, index) => {
        const active = index <= currentIndex;
        return (
          <div
            key={item.id}
            className={`rounded-md border px-1 py-2 text-center sm:px-2 ${
              active
                ? "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffe0ad]"
                : "border-[#34343c] bg-white/[0.04] text-[#8f8f99]"
            }`}
            title={`Step ${index + 1}: ${item.label}`}
          >
            <p className="garage-mono text-[11px]">Step {index + 1}</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight">
              <span className="sm:hidden">{item.shortLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

function CheckoutSummaryCard({
  cartLines,
  cartItemCount,
  subtotal,
  service,
  tax,
  serviceChargePct,
  taxPct,
  roundingAdjustment,
  voucher,
  manualDiscount,
  totalDue,
}: {
  cartLines: Array<CartLine & { item: MenuItem; variant: MenuVariant }>;
  cartItemCount: number;
  subtotal: number;
  service: number;
  tax: number;
  serviceChargePct: number;
  taxPct: number;
  roundingAdjustment: number;
  voucher: number;
  manualDiscount: { amount: number; reason: string } | null;
  totalDue: number;
}) {
  return (
    <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
            Ringkasan order
          </p>
          <h3 className="mt-1 text-xl font-black text-white">{cartItemCount} item</h3>
        </div>
        <div className="text-right">
          <p className="garage-mono text-[10px] text-[#b8b8bf]">Total bayar</p>
          <p className="text-xl font-black text-[#ffd08a]">{currency.format(totalDue)}</p>
        </div>
      </div>
      <div className="garage-scroll mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
        {cartLines.map((line) => (
          <div
            key={`${line.itemId}-${line.variantId}`}
            className="flex items-start justify-between gap-3 rounded-md border border-[#34343c] bg-[#202027]/78 p-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{line.item.name}</p>
              <p className="text-xs text-[#b8b8bf]">
                {line.variant.label} x {line.qty}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-white">
              {currency.format(line.variant.price * line.qty)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-1 border-t border-[#34343c] pt-3 text-sm sm:grid-cols-2">
        <BillRow label="Subtotal" value={currency.format(subtotal)} />
        {service > 0 ? (
          <BillRow label={`Service ${serviceChargePct}%`} value={currency.format(service)} />
        ) : null}
        {tax > 0 ? <BillRow label={`PB1 ${taxPct}%`} value={currency.format(tax)} /> : null}
        {roundingAdjustment !== 0 ? (
          <BillRow
            label="Pembulatan"
            value={`${roundingAdjustment > 0 ? "+" : "-"} ${currency.format(Math.abs(roundingAdjustment))}`}
          />
        ) : null}
        {voucher > 0 ? (
          <BillRow label="Voucher" value={`- ${currency.format(voucher)}`} accent />
        ) : null}
        {manualDiscount && manualDiscount.amount > 0 ? (
          <BillRow
            label={`Diskon kasir (${manualDiscount.reason})`}
            value={`- ${currency.format(manualDiscount.amount)}`}
            accent
          />
        ) : null}
      </div>
    </div>
  );
}

function CheckoutOrderStep({
  orderType,
  tableLabel,
  selectedTableNumber,
  selectedTableLiveRow,
  selectedTableAvailability,
  dineInTableMissing,
  tablePickerRows,
  tableLiveDataReady,
  paymentPending,
  onOrderTypeChange,
  onTableChange,
}: {
  orderType: OrderType;
  tableLabel: string;
  selectedTableNumber: string;
  selectedTableLiveRow: TableLiveRow | null;
  selectedTableAvailability: TableAvailability;
  dineInTableMissing: boolean;
  tablePickerRows: TableLiveRow[];
  tableLiveDataReady: boolean;
  paymentPending: boolean;
  onOrderTypeChange: (value: OrderType) => void;
  onTableChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
        <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
          Tipe order
        </p>
        <Tabs
          value={orderType}
          onValueChange={(value) => onOrderTypeChange(value as OrderType)}
          className="mt-2 w-full"
        >
          <TabsList className="grid w-full grid-cols-3 bg-[#202027]">
            <TabsTrigger value="dine-in" disabled={paymentPending}>
              Dine in
            </TabsTrigger>
            <TabsTrigger value="takeaway" disabled={paymentPending}>
              Take away
            </TabsTrigger>
            <TabsTrigger value="delivery" disabled={paymentPending}>
              Delivery
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {orderType === "dine-in" ? (
        <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
          <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-end">
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">No meja</p>
              <Select value={selectedTableNumber} onValueChange={onTableChange} disabled={paymentPending}>
                <SelectTrigger className="h-11 w-full border-[#34343c] bg-white/[0.06]">
                  <SelectValue placeholder="Pilih meja" />
                </SelectTrigger>
                <SelectContent>
                  {tablePickerRows.map((table) => {
                    const availability = tableAvailabilityState(table, tableLiveDataReady);
                    return (
                      <SelectItem key={table.tableNumber} value={table.tableNumber}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="pos-table-indicator"
                            data-state={availability}
                            aria-hidden="true"
                          />
                          <span>Meja {table.tableNumber}</span>
                          <span className="garage-mono ml-auto text-[10px] opacity-80">
                            {tableAvailabilityLabel(availability)}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <Badge
              className={`${tableLiveStatusTone(selectedTableLiveRow)} inline-flex h-11 max-w-full items-center gap-1.5 px-3 text-[11px]`}
            >
              {selectedTableNumber ? (
                <span
                  className="pos-table-indicator"
                  data-state={selectedTableAvailability}
                  aria-hidden="true"
                />
              ) : null}
              <span className="truncate">
                {selectedTableNumber
                  ? `${tableLabel} - ${tableAvailabilityLabel(selectedTableAvailability)}`
                  : "Meja belum dipilih"}
              </span>
            </Badge>
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#b8b8bf]" aria-label="Keterangan status meja">
            {(["ready", "held", "bill", "reserved", "cleaning"] as const).map((state) => (
              <li key={state} className="inline-flex items-center gap-1.5">
                <span className="pos-table-indicator" data-state={state} aria-hidden="true" />
                {state === "bill" ? "Terisi" : tableAvailabilityLabel(state)}
              </li>
            ))}
          </ul>
          <div className="garage-scroll mt-2 grid max-h-[min(50svh,420px)] grid-cols-5 gap-1.5 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-8">
            {tablePickerRows.map((table) => {
              const selected = table.tableNumber === selectedTableNumber;
              const availability = tableAvailabilityState(table, tableLiveDataReady);

              return (
                <button
                  key={table.tableNumber}
                  type="button"
                  className={`garage-press relative min-h-14 rounded-md border p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                    selected
                      ? "border-white bg-white/15 text-white ring-2 ring-white"
                      : availability === "ready"
                        ? "border-[#4a4a54] bg-white/[0.04] text-white hover:border-white/50"
                        : availability === "bill" || availability === "full"
                          ? "border-[#f5a742]/60 bg-[#f5a742]/10 text-[#ffd08a]"
                          : availability === "paid"
                            ? "border-[#d4d4d8]/55 bg-white/[0.07] text-white"
                            : availability === "cleaning"
                              ? "border-[#ff2a3a]/60 bg-[#d11a2a]/12 text-[#ffc2c8]"
                              : "border-[#303038] bg-black/16 text-[#d4d4d8]"
                  }`}
                  disabled={paymentPending}
                  onClick={() => onTableChange(table.tableNumber)}
                  aria-pressed={selected}
                  aria-label={`Meja ${table.tableNumber}, ${tableAvailabilityLabel(availability)}${selected ? ", dipilih" : ""}`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="garage-mono text-[18px] font-black tabular-nums leading-none">{table.tableNumber}</span>
                    {selected ? (
                      <Check className="size-4 text-white" aria-hidden />
                    ) : (
                      <span className="pos-table-indicator" data-state={availability} aria-hidden="true" />
                    )}
                  </span>
                  <span className="mt-1 block truncate text-[11px] font-semibold leading-tight">
                    {tableAvailabilityLabel(availability)}
                  </span>
                </button>
              );
            })}
          </div>

          {dineInTableMissing ? (
            <Alert className="mt-3 border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Nomor meja wajib</AlertTitle>
              <AlertDescription>Pilih meja untuk order dine-in.</AlertDescription>
            </Alert>
          ) : null}
          {selectedTableLiveRow ? (
            <TableSessionInfoCard
              tableLabel={tableLabel}
              row={selectedTableLiveRow}
            />
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
          <p className="text-base font-semibold text-white">{tableLabel}</p>
          <p className="mt-1 text-xs text-[#b8b8bf]">Order ini tidak memakai nomor meja.</p>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TableSessionInfoCard â€” UX upgrade untuk meja yang dipilih.
// Kalau meja kosong → tampilkan card hijau "siap dipakai".
// Kalau meja butuh dibersihkan → card merah "perlu cleaning".
// Kalau meja punya session aktif (sudah ada order) → card amber
// "ORDER TAMBAHAN â€” akan masuk ke bill session yang sama".
// Ini menggantikan warning generic lama yang cuma bilang "status: pending".
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TableSessionInfoCard({
  tableLabel,
  row,
}: {
  tableLabel: string;
  row: TableLiveRow;
}) {
  const status = row.status;
  const hasActiveOrder = Boolean(row.currentOrderId);

  // Status "empty" + tidak butuh cleaning → kartu netral "siap dipakai"
  if (status === "empty" && !row.needsCleaning) {
    return (
      <div className="mt-3 rounded-md border border-white/20 bg-white/[0.05] p-3">
        <div className="flex items-center gap-2">
          <Check className="size-4 text-white" />
          <p className="garage-mono text-[11px] uppercase tracking-wide text-white">
            {tableLabel} siap dipakai
          </p>
        </div>
        <p className="mt-1 text-xs text-[#d4d4d8]">
          Meja kosong dan bersih. Lanjut ke step berikutnya.
        </p>
      </div>
    );
  }

  // Needs cleaning → red warning
  if (row.needsCleaning && !hasActiveOrder) {
    return (
      <div className="mt-3 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-[#ffc2c8]" />
          <p className="garage-mono text-[11px] uppercase tracking-wide text-[#ffc2c8]">
            {tableLabel} perlu dibersihkan
          </p>
        </div>
        <p className="mt-1 text-xs text-[#ffe1e5]">
          Status meja: butuh cleaning sebelum customer baru duduk.
        </p>
      </div>
    );
  }

  // Active session â€” INI inti fitur Add Order
  if (hasActiveOrder) {
    const customerName = row.customerName?.trim() || "Tamu";
    const customerPhone = row.customerPhone?.trim();
    const kitchenStatus = row.kitchenStatus?.replace(/_/g, " ");
    const totalLabel = row.total > 0 ? currency.format(row.total) : "-";
    const minutesLabel =
      row.timerMinutes > 0
        ? row.timerMinutes >= 60
          ? `${Math.floor(row.timerMinutes / 60)}j ${row.timerMinutes % 60}m lalu`
          : `${row.timerMinutes} menit lalu`
        : "baru saja";

    return (
      <div className="mt-3 rounded-md border border-[#f5a742]/55 bg-gradient-to-br from-[#f5a742]/14 to-[#f5a742]/4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#f5a742]/55 bg-[#f5a742]/18 text-[#ffd79a]">
            <Plus className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="garage-mono text-[11px] font-bold uppercase tracking-wide text-[#ffd79a]">
                ORDER TAMBAHAN
              </p>
              <span className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/14 px-1.5 py-0.5 font-mono text-[11px] text-[#ffd79a]">
                {tableLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#f4f4f5]">
              Order ini akan ditambahkan ke bill yang sama. Customer bisa bayar
              sekaligus di akhir.
            </p>
          </div>
        </div>

        {/* Info order sebelumnya */}
        <div className="mt-3 rounded-md border border-[#34343c] bg-black/30 p-3">
          <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
            Order Aktif di {tableLabel}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-[10px] text-[#8f8f99]">No. Order</p>
              <p className="garage-mono text-sm font-semibold text-white">
                {row.orderNo ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#8f8f99]">Pelanggan</p>
              <p className="text-sm font-semibold text-white">{customerName}</p>
              {customerPhone && (
                <p className="font-mono text-[10px] text-[#8f8f99]">{customerPhone}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-[#8f8f99]">Total Saat Ini</p>
              <p className="garage-mono text-sm font-bold text-[#ffd79a]">{totalLabel}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#8f8f99]">Status</p>
              <p className="text-sm font-semibold capitalize text-white">
                {kitchenStatus || tableLiveStatusLabel(row)}
              </p>
              <p className="font-mono text-[10px] text-[#8f8f99]">
                Dibuat {minutesLabel}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-[#b8b8bf]">
          Mau order untuk customer berbeda? Pilih meja lain yang masih kosong (warna
          hijau di picker atas).
        </p>
      </div>
    );
  }

  // Fallback â€” status unknown / lain
  return (
    <div className="mt-3 rounded-md border border-[#34343c] bg-white/[0.04] p-3">
      <p className="text-xs text-[#b8b8bf]">
        {tableLabel} berstatus {tableLiveStatusLabel(row)}.
      </p>
    </div>
  );
}

function CheckoutCustomerStep({
  mode,
  guestName,
  guestPhone,
  memberPhone,
  selectedMember,
  memberLookupLoading,
  memberError,
  memberCreatedPin,
  estimatedMemberPoints,
  pointsToUse,
  maxPointsToUse,
  minPointsToUse,
  pointValue,
  onPointsToUseChange,
  memberQrVerified,
  onScanMemberQr,
  memberOptions,
  onModeChange,
  onGuestNameChange,
  onGuestPhoneChange,
  onMemberPhoneChange,
  onLookupMember,
  onSelectMember,
  onClearMember,
}: {
  mode: PosCustomerMode;
  guestName: string;
  guestPhone: string;
  memberPhone: string;
  selectedMember: PosMemberLookupResponse | null;
  memberLookupLoading: boolean;
  memberError: string | null;
  memberCreatedPin: string | null;
  estimatedMemberPoints: number;
  pointsToUse: number;
  maxPointsToUse: number;
  minPointsToUse: number;
  pointValue: number;
  onPointsToUseChange: (points: number) => void;
  memberQrVerified: boolean;
  onScanMemberQr: () => void;
  memberOptions: Customer[];
  onModeChange: (mode: PosCustomerMode) => void;
  onGuestNameChange: (value: string) => void;
  onGuestPhoneChange: (value: string) => void;
  onMemberPhoneChange: (value: string) => void;
  onLookupMember: () => void;
  onSelectMember: (customer: Customer) => void;
  onClearMember: () => void;
}) {
  const [memberSearch, setMemberSearch] = useState("");
  const memberSearchResults = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (query.length < 2) return memberOptions.slice(0, 6);
    return memberOptions
      .filter((customer) => {
        const haystack = [
          customer.name,
          customer.phone,
          customer.memberCode,
          customer.cardTier,
          customer.tier,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [memberOptions, memberSearch]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant={mode === "guest" ? "default" : "outline"}
          className={`garage-press h-12 ${
            mode === "guest" ? "bg-[#d11a2a] text-white hover:bg-[#ff2a3a]" : "border-[#4a4a54]"
          }`}
          onClick={() => onModeChange("guest")}
        >
          Tamu (non-member)
        </Button>
        <Button
          type="button"
          variant={mode === "member" ? "default" : "outline"}
          className={`garage-press h-12 ${
            mode === "member" ? "bg-[#d11a2a] text-white hover:bg-[#ff2a3a]" : "border-[#4a4a54]"
          }`}
          onClick={() => onModeChange("member")}
        >
          Member
        </Button>
      </div>

      {mode === "guest" ? (
        <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
          <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
            Tamu (non-member)
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                Nama (tampil di tiket produksi & antar)
              </p>
              <Input
                value={guestName}
                onChange={(event) => onGuestNameChange(event.target.value)}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                placeholder="Nama pelanggan"
              />
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">No WA opsional</p>
              <Input
                value={guestPhone}
                onChange={(event) => onGuestPhoneChange(event.target.value)}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                placeholder="08xxxxxxxxxx"
              />
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#b8b8bf]">
            Nomor WA dibutuhkan untuk mengaktifkan tracking invoice dan tombol kirim link invoice.
            Jika nomor cocok dengan database member, POS otomatis memilih member tersebut.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
              Member customer
            </p>
            <Badge className="garage-mono border-[#4a4a54] bg-white/[0.06] px-2 text-[10px] text-[#d4d4d8]">
              {selectedMember ? selectedMember.member.level : "Cari member"}
            </Badge>
          </div>
          {selectedMember ? (
            <div className="mt-3 rounded-md border border-[#34343c] bg-black/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {selectedMember.member.name}
                  </p>
                  <p className="garage-mono mt-0.5 truncate text-[11px] text-[#b8b8bf]">
                    {selectedMember.member.phone}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="garage-press h-8 px-2 text-xs text-[#d4d4d8]"
                  onClick={onClearMember}
                >
                  Lepas
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
                  <p className="garage-mono text-[11px] text-[#8f8f99]">Poin</p>
                  <p className="text-xs font-semibold text-white">
                    {selectedMember.member.totalPoints}
                  </p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
                  <p className="garage-mono text-[11px] text-[#8f8f99]">Pengali</p>
                  <p className="text-xs font-semibold text-white">
                    x{selectedMember.member.multiplier}
                  </p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
                  <p className="garage-mono text-[11px] text-[#8f8f99]">Estimasi</p>
                  <p className="text-xs font-semibold text-[#ffd08a]">+{estimatedMemberPoints}</p>
                </div>
              </div>
              <PosPointsRedeemBox
                balance={selectedMember.member.points}
                pointsToUse={pointsToUse}
                maxPointsToUse={maxPointsToUse}
                minPointsToUse={minPointsToUse}
                pointValue={pointValue}
                onChange={onPointsToUseChange}
                verified={memberQrVerified}
                onScan={onScanMemberQr}
              />
              {memberCreatedPin ? (
                <Alert className="mt-3 border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]">
                  <ShieldCheck className="size-4" />
                  <AlertTitle>PIN sementara</AlertTitle>
                  <AlertDescription>Berikan ke customer: {memberCreatedPin}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                  Pilih otomatis dari database
                </p>
                <Input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  className="h-11 border-[#34343c] bg-white/[0.06]"
                  placeholder="Cari member nama / HP / kode"
                />
                <div className="garage-scroll mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {memberSearchResults.length > 0 ? (
                    memberSearchResults.map((customer) => (
                      <button
                        key={customer.id ?? customer.phone}
                        type="button"
                        className="garage-press grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-[#34343c] bg-white/[0.04] px-3 py-2 text-left transition hover:border-[#f5a742]/55 hover:bg-[#f5a742]/10"
                        onClick={() => onSelectMember(customer)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-white">
                            {customer.name}
                          </span>
                          <span className="garage-mono mt-0.5 block truncate text-[10px] text-[#b8b8bf]">
                            {customer.phone}
                            {customer.memberCode ? ` - ${customer.memberCode}` : ""}
                          </span>
                        </span>
                        <Badge className="garage-mono border-[#4a4a54] bg-black/30 px-2 text-[10px] text-[#ffd08a]">
                          {customer.cardTier ?? customer.tier}
                        </Badge>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-md border border-[#34343c] bg-white/[0.03] p-3 text-xs text-[#8f8f99]">
                      Member tidak ditemukan di database aktif.
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input
                  value={memberPhone}
                  onChange={(event) => onMemberPhoneChange(event.target.value)}
                  className="h-11 border-[#34343c] bg-white/[0.06]"
                  placeholder="No HP member"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 border-[#4a4a54] px-4"
                  disabled={memberLookupLoading}
                  onClick={onLookupMember}
                >
                  {memberLookupLoading ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                </Button>
              </div>
              <div className="rounded-md border border-[#34343c] bg-white/[0.035] p-3 text-xs leading-5 text-[#b8b8bf]">
                Member baru wajib registrasi sendiri lewat portal member. POS hanya memilih
                akun member yang sudah aktif.
              </div>
            </div>
          )}
          {memberError ? (
            <Alert className="mt-3 border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Member</AlertTitle>
              <AlertDescription>{memberError}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ CartLineNoteRow â€” input catatan per item di cart â”€â”€â”€
// UX: default collapsed (cuma tombol "+ Catatan" kecil). Klik → expand input.
// Auto-save on blur. Visible chip dengan icon jika sudah ada catatan.
function CartLineNoteRow({
  note,
  onChange,
}: {
  note: string;
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(Boolean(note));
  const [draft, setDraft] = useState(note);

  // Sync external note changes (misalnya cart di-clear)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from prop
    setDraft(note);
    if (!note) setExpanded(false);
  }, [note]);

  const commit = () => {
    if (draft === note) return;
    onChange(draft);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-2 flex items-center gap-1 text-[10px] font-mono text-[#8f8f99] hover:text-[#ffd79a]"
      >
        <Plus className="size-3" />
        Tambah catatan untuk dapur
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-[#f5a742]/30 bg-[#f5a742]/6 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="garage-mono text-[10px] uppercase tracking-wide text-[#ffd79a]">
          📝 Catatan untuk dapur
        </p>
        {!draft && (
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              onChange("");
            }}
            className="text-[10px] text-[#8f8f99] underline hover:text-[#d6d6dc]"
          >
            Batal
          </button>
        )}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        maxLength={120}
        placeholder="Misal: less ice, no garlic, extra spicy, dibungkus terpisah"
        className="mt-1 h-9 w-full rounded-md border border-[#34343c] bg-white/[0.06] px-2 text-xs text-white placeholder:text-[#6e6e76] focus:border-[#f5a742] focus:outline-none"
        autoFocus={!note}
      />
      <p className="mt-1 text-right text-[11px] text-[#8f8f99]">{draft.length}/120</p>
    </div>
  );
}

function CashPaymentPanel({
  cashReceived,
  cashReceivedValue,
  cashPaymentReady,
  cashChange,
  cashShortage,
  quickCashAmounts,
  totalDue,
  paymentPending,
  onCashReceivedChange,
}: {
  cashReceived: string;
  cashReceivedValue: number;
  cashPaymentReady: boolean;
  cashChange: number;
  cashShortage: number;
  quickCashAmounts: number[];
  totalDue: number;
  paymentPending: boolean;
  onCashReceivedChange: (value: string) => void;
}) {
  const exactCash = cashReceivedValue === totalDue && totalDue > 0;
  return (
    <div className="garage-surface rounded-md p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Banknote className="size-4 text-[#f5a742]" />
          <p className="garage-mono text-[12px] tracking-wide">UANG DITERIMA DARI PELANGGAN</p>
        </div>
        <span className="garage-mono text-[11px] text-[#b8b8bf]">
          Total Tagihan {currency.format(totalDue)}
        </span>
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 garage-mono text-base font-semibold text-[#d6d6dc]">
          Rp
        </span>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={cashReceived ? Number(cashReceived).toLocaleString("id-ID") : ""}
          onChange={(event) =>
            onCashReceivedChange(event.target.value.replace(/\D/g, ""))
          }
          placeholder="0"
          className="garage-mono h-14 border-[#34343c] bg-white/[0.06] pl-10 pr-3 text-right text-2xl font-bold tracking-wide text-white"
        />
      </div>
      <Button
        type="button"
        className={`garage-press mt-2 h-11 w-full justify-center gap-2 text-sm font-semibold ${
          exactCash
            ? "bg-[#f5a742] text-[#1a1a20] hover:bg-[#ffba5a]"
            : "border border-[#f5a742]/55 bg-[#f5a742]/12 text-[#ffd08a] hover:bg-[#f5a742]/20"
        }`}
        disabled={paymentPending || totalDue <= 0}
        onClick={() => onCashReceivedChange(String(totalDue))}
      >
        <Equal className="size-4" />
        Uang Pas ({currency.format(totalDue)})
      </Button>
      {quickCashAmounts.length > 0 && (
        <div className="mt-3">
          <p className="garage-mono mb-1 text-[11px] text-[#b8b8bf]">
            Pilihan cepat nominal uang
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quickCashAmounts.map((amount) => (
              <Button
                key={amount}
                type="button"
                variant="outline"
                className="garage-press h-11 border-[#4a4a54] px-2 text-sm font-semibold"
                disabled={paymentPending}
                onClick={() => onCashReceivedChange(String(amount))}
              >
                {currency.format(amount)}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div
        className={`mt-3 rounded-md border p-4 ${
          cashPaymentReady
            ? "border-[#f5a742]/45 bg-[#f5a742]/10"
            : "border-[#d11a2a]/45 bg-[#d11a2a]/12"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="garage-mono text-[12px] tracking-wide text-[#d6d6dc]">
              {cashPaymentReady ? "KEMBALIAN UNTUK PELANGGAN" : "UANG MASIH KURANG"}
            </p>
            <p
              className={`garage-display mt-1 text-4xl font-bold leading-none ${
                cashPaymentReady ? "text-[#ffd08a]" : "text-[#ffc2c8]"
              }`}
            >
              {currency.format(cashPaymentReady ? cashChange : cashShortage)}
            </p>
          </div>
          <Badge
            className={
              cashPaymentReady
                ? "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]"
                : "border-[#d11a2a]/45 bg-[#d11a2a]/14 text-[#ffc2c8]"
            }
          >
            {cashPaymentReady ? "CUKUP" : "KURANG"}
          </Badge>
        </div>
        <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
          <BillRow label="Total tagihan" value={currency.format(totalDue)} />
          <BillRow
            label="Uang diterima"
            value={currency.format(cashReceivedValue)}
          />
          <BillRow
            label={cashPaymentReady ? "Kembalian pelanggan" : "Sisa kurang"}
            value={currency.format(cashPaymentReady ? cashChange : cashShortage)}
            accent
          />
        </div>
      </div>
    </div>
  );
}

function QrisPaymentPanel({
  imagePath,
  imageReady,
  paymentReference,
  onImageReadyChange,
  onPaymentReferenceChange,
  totalDue,
  referenceRequired = false,
}: {
  imagePath: string;
  imageReady: boolean;
  paymentReference: string;
  onImageReadyChange: (ready: boolean) => void;
  onPaymentReferenceChange: (value: string) => void;
  totalDue?: number;
  referenceRequired?: boolean;
}) {
  // Buka layar QRIS customer-facing di window/tab kedua (untuk monitor pelanggan).
  // window.open dari handler klik = tidak diblokir popup-blocker (gesture user).
  const openCustomerDisplay = () => {
    const params = new URLSearchParams();
    if (totalDue && totalDue > 0) params.set("amount", String(totalDue));
    const url = `/display/payment${params.toString() ? `?${params.toString()}` : ""}`;
    window.open(url, "garage-qris-display", "noopener,noreferrer");
  };
  return (
    <div className="garage-surface rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <QrCode className="size-4 text-[#f5a742]" />
          <p className="garage-mono">QRIS GARAGE</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openCustomerDisplay}
          className="h-7 gap-1 border-[#f5a742]/55 bg-[#f5a742]/10 px-2 text-[10px] font-bold uppercase tracking-wider text-[#ffd79a] hover:bg-[#f5a742]/20"
        >
          <QrCode className="size-3" />
          Layar Customer
        </Button>
      </div>
      {imageReady ? (
        <div className="mt-3 flex flex-col items-center rounded-md border border-[#4a4a54] bg-white p-3 text-[#111116]">
          <Image
            src={imagePath}
            alt="QRIS resmi GARAGE"
            width={180}
            height={180}
            className="h-[180px] w-[180px] object-contain"
            onLoad={() => onImageReadyChange(true)}
            onError={() => onImageReadyChange(false)}
          />
          <p className="mt-2 text-center text-xs font-semibold">
            Scan QRIS merchant resmi GARAGE
          </p>
        </div>
      ) : (
        <Alert className="mt-3 border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertTitle>QRIS resmi belum dikonfigurasi</AlertTitle>
          <AlertDescription>
            Taruh file QRIS merchant resmi di `public/payments/qris-garage.png`.
          </AlertDescription>
        </Alert>
      )}
      <p className="mt-3 flex gap-2 text-sm font-semibold text-[#ffd08a]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        Pastikan status BERHASIL di notifikasi merchant/bank. Screenshot pelanggan saja tidak cukup.
      </p>
      <div className="mt-3">
        <p className="garage-mono mb-1">{referenceRequired ? "Referensi wajib" : "Referensi opsional"}</p>
        <Input
          value={paymentReference}
          onChange={(event) => onPaymentReferenceChange(event.target.value.slice(0, 80))}
          className="h-10 border-[#34343c] bg-white/[0.06]"
          placeholder="No. Ref / RRN dari notifikasi QRIS"
          aria-label="Referensi QRIS"
        />
      </div>
    </div>
  );
}

function BankTransferPaymentPanel({
  selectedProvider,
  selectedAccount,
  paymentReference,
  onProviderChange,
  onPaymentReferenceChange,
}: {
  selectedProvider: string;
  selectedAccount: (typeof bankAccounts)[number];
  paymentReference: string;
  onProviderChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
}) {
  return (
    <div className="garage-surface rounded-md p-3">
      <div className="flex items-center gap-2">
        <Landmark className="size-4 text-[#f5a742]" />
        <p className="garage-mono">Transfer bank</p>
      </div>
      <Select value={selectedProvider} onValueChange={onProviderChange}>
        <SelectTrigger className="mt-3 h-10 w-full border-[#34343c] bg-white/[0.06]">
          <SelectValue placeholder="Pilih bank" />
        </SelectTrigger>
        <SelectContent>
          {bankAccounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.bank}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="mt-3 rounded-md border border-[#4a4a54] bg-[#0f0f14] p-3">
        <BillRow label="Bank" value={selectedAccount.bank} />
        <BillRow label="Atas nama" value={selectedAccount.accountName} />
        <BillRow label="Rekening" value={selectedAccount.accountNumber} accent />
      </div>
      <div className="mt-3">
        <p className="garage-mono mb-1">Referensi opsional</p>
        <Input
          value={paymentReference}
          onChange={(event) => onPaymentReferenceChange(event.target.value)}
          className="h-10 border-[#34343c] bg-white/[0.06]"
          placeholder="Nomor transaksi / catatan kasir"
        />
      </div>
    </div>
  );
}

function EWalletPaymentPanel({
  selectedProvider,
  selectedAccount,
  paymentReference,
  onProviderChange,
  onPaymentReferenceChange,
}: {
  selectedProvider: string;
  selectedAccount: (typeof eWalletAccounts)[number];
  paymentReference: string;
  onProviderChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
}) {
  return (
    <div className="garage-surface rounded-md p-3">
      <div className="flex items-center gap-2">
        <WalletCards className="size-4 text-[#f5a742]" />
        <p className="garage-mono">E-Wallet</p>
      </div>
      <Select value={selectedProvider} onValueChange={onProviderChange}>
        <SelectTrigger className="mt-3 h-10 w-full border-[#34343c] bg-white/[0.06]">
          <SelectValue placeholder="Pilih e-wallet" />
        </SelectTrigger>
        <SelectContent>
          {eWalletAccounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.provider}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="mt-3 rounded-md border border-[#4a4a54] bg-[#0f0f14] p-3">
        <BillRow label="Provider" value={selectedAccount.provider} />
        <BillRow label="Akun" value={selectedAccount.accountName} />
        <BillRow label="Nomor/ID" value={selectedAccount.accountNumber} accent />
      </div>
      <div className="mt-3">
        <p className="garage-mono mb-1">Referensi opsional</p>
        <Input
          value={paymentReference}
          onChange={(event) => onPaymentReferenceChange(event.target.value)}
          className="h-10 border-[#34343c] bg-white/[0.06]"
          placeholder="Nomor transaksi / catatan kasir"
        />
      </div>
    </div>
  );
}

interface PaymentCompletePanelProps {
  receipt: OrderReceipt;
  autoPrint: boolean;
  onNewTransaction: () => void;
  onClose: () => void;
}

type PrintStatus = "idle" | "printing" | "success" | "error";

type OpenBillSaved = {
  orderId: string;
  orderNo: string;
  total: number;
  tableLabel: string | null;
  customerName?: string | null;
};

function OpenBillSavedPanel({
  bill,
  printing,
  onPrint,
  onNewTransaction,
  onClose,
}: {
  bill: OpenBillSaved;
  printing: boolean;
  onPrint: () => void;
  onNewTransaction: () => void;
  onClose: () => void;
}) {
  const who = [bill.tableLabel, bill.customerName].filter(Boolean).join(" · ") || "Take away";
  return (
    <div className="space-y-3" data-testid="pos-open-bill-saved">
      <div className="rounded-lg border-2 border-[#f5a742]/70 bg-[#f5a742]/10 p-4 text-center">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#ffd08a]">Tagihan disimpan · belum bayar</p>
        <p className="mt-2 text-lg font-bold text-white">{who}</p>
        <p className="garage-display mt-1 text-4xl font-bold tabular-nums text-white">{currency.format(bill.total)}</p>
        <p className="mt-1 font-mono text-sm text-[#e5e2dc]">{bill.orderNo}</p>
      </div>
      <p className="rounded-md border border-[#4a4a54] bg-white/[0.04] p-3 text-sm leading-relaxed text-[#e5e2dc]">
        Pesanan sudah masuk Bar/Dapur. Saat pelanggan selesai, buka <b>Pesanan Pelanggan</b> atau detail meja lalu tekan{" "}
        <b>Final Bayar</b> untuk memilih Cash/QRIS/Transfer — kembalian tampil di sana. Voucher, poin, dan diskon dipakai saat Final Bayar.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="garage-press h-11 flex-1" disabled={printing} onClick={onPrint}>
          <Printer aria-hidden className="size-4" />
          {printing ? "Mencetak..." : "Cetak tagihan sementara"}
        </Button>
        <Button type="button" className="garage-press h-11 flex-1 text-base font-semibold" onClick={onNewTransaction}>
          Transaksi baru
        </Button>
        <Button type="button" variant="ghost" className="garage-press h-11" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </div>
  );
}

function PaymentCompletePanel({
  receipt,
  autoPrint,
  onNewTransaction,
  onClose,
}: PaymentCompletePanelProps) {
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");
  const [printError, setPrintError] = useState("");
  const [waPhone, setWaPhone] = useState(receipt.customer?.phone || "");
  const [waEditing, setWaEditing] = useState(!receipt.customer?.phone);
  const [waSentTo, setWaSentTo] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const invoiceWebUrl = receipt.invoiceWebUrl || null;
  const hasInvoiceLink = Boolean(invoiceWebUrl);
  const invoicePdfUrl = receipt.invoicePdfUrl || null;

  const handlePrint = useCallback(async () => {
    setPrintStatus("printing");
    setPrintError("");
    try {
      const res = await printThermal({
        receipt,
        printerName: receipt.settings?.defaultPrinterName || undefined,
        copies: receipt.settings?.receiptCopies,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        message?: string;
      };
      if (!res.ok) {
        setPrintStatus("error");
        setPrintError(data.error?.message || data.message || "Gagal mencetak");
        void voice.announce("warning_printer", {
          dedupKey: `print:${receipt.orderNo}`,
        });
      } else {
        setPrintStatus("success");
      }
    } catch {
      setPrintStatus("error");
      setPrintError("Koneksi gagal");
      void voice.announce("warning_printer", {
        dedupKey: `print-exc:${receipt.orderNo}`,
      });
    }
  }, [receipt]);

  useEffect(() => {
    if (!autoPrint) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void handlePrint();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoPrint, handlePrint]);

  const buildWaUrl = useCallback(
    (phone: string) => {
      // Kalau backend sudah kasih URL siap-pakai untuk nomor customer terdaftar,
      // dan kasir tidak mengubah nomornya, pakai itu langsung (sudah include
      // template message lengkap dengan link tracking & list item).
      const trimmed = phone.trim();
      const originalPhone = receipt.customer?.phone?.trim();
      if (receipt.whatsappInvoiceUrl && trimmed && trimmed === originalPhone) {
        return receipt.whatsappInvoiceUrl;
      }

      // Bangun dari template bersama (sama dengan waiter & server): item + total + link invoice.
      return (
        waLink(
          trimmed,
          buildInvoiceWhatsappMessage({
            orderNo: receipt.orderNo,
            tableLabel: receipt.tableLabel,
            total: receipt.total,
            items: receipt.items.map((item) => ({
              itemName: item.name,
              variantLabel: item.variant,
              qty: item.qty,
              lineTotal: item.lineTotal,
            })),
            invoiceUrl: invoiceWebUrl,
            paymentMethod: receipt.payment.method,
          }),
        ) ?? `https://wa.me/${normalizeWaNumber(trimmed)}`
      );
    },
    [
      invoiceWebUrl,
      receipt.customer?.phone,
      receipt.items,
      receipt.orderNo,
      receipt.payment.method,
      receipt.tableLabel,
      receipt.total,
      receipt.whatsappInvoiceUrl,
    ],
  );

  const handleSendWhatsapp = useCallback(() => {
    const trimmed = waPhone.trim();
    if (!trimmed && !receipt.whatsappInvoiceUrl) {
      setWaEditing(true);
      return;
    }
    const url = trimmed
      ? buildWaUrl(trimmed)
      : receipt.whatsappInvoiceUrl || buildWaUrl("");
    window.open(url, "garage-whatsapp", "noopener,noreferrer");
    setWaSentTo(trimmed || "WhatsApp");
    setWaEditing(false);
  }, [buildWaUrl, receipt.whatsappInvoiceUrl, waPhone]);

  const handleCopyLink = useCallback(async () => {
    if (!invoiceWebUrl) return;
    try {
      await navigator.clipboard.writeText(invoiceWebUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }, [invoiceWebUrl]);

  const handleOpenInvoice = useCallback(() => {
    if (!invoiceWebUrl) return;
    window.open(invoiceWebUrl, "_blank", "noopener,noreferrer");
  }, [invoiceWebUrl]);

  return (
    <div className="space-y-3">
      {/* Success banner */}
      <div className="flex items-center gap-3 rounded-md border border-[#22c55e]/35 bg-[#22c55e]/12 p-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#22c55e]/40 bg-[#22c55e]/20">
          <Check className="size-5 text-[#4ade80]" />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#4ade80]">Selesai</p>
          <p className="font-black text-white">{receipt.orderNo}</p>
          <p className="mt-0.5 text-sm text-[#b8b8bf]">
            {currency.format(receipt.total)}
          </p>
        </div>
      </div>

      {/* Kembalian tunai — besar supaya kasir tidak salah memberi uang. */}
      {receipt.payment?.cashReceived != null ? (
        <div
          data-testid="payment-complete-change"
          className="rounded-md border-2 border-[#f5a742]/70 bg-[#f5a742]/12 p-4 text-center"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#ffd08a]">Kembalian untuk pelanggan</p>
          <p className="garage-display mt-1 text-5xl font-bold tabular-nums text-white">
            {currency.format(receipt.payment.change ?? 0)}
          </p>
          <p className="mt-1 text-sm text-[#e4e4ea]">
            Diterima {currency.format(receipt.payment.cashReceived)} · Total {currency.format(receipt.total)}
          </p>
        </div>
      ) : null}

      {/* Print status */}
      {printStatus === "printing" && (
        <div className="flex items-center gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 p-3">
          <RefreshCw className="size-4 animate-spin text-[#f5a742]" />
          <span className="text-sm text-[#ffd79a]">Mencetak struk...</span>
        </div>
      )}

      {printStatus === "success" && (
        <div className="flex items-center gap-2 rounded-md border border-[#22c55e]/40 bg-[#22c55e]/12 p-3">
          <Check className="size-4 text-[#4ade80]" />
          <span className="text-sm text-[#dcfce7]">Struk berhasil dicetak. Ambil kertasnya.</span>
        </div>
      )}

      {printStatus === "error" && (
        <div className="flex items-start gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 p-3">
          <Printer className="mt-0.5 size-4 shrink-0 text-[#f5a742]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#ffd79a]">
              Pembayaran sukses — hanya cetak struk yang gagal.
            </p>
            <p className="mt-0.5 text-xs text-[#e6c58f]">{printError}</p>
          </div>
          <button onClick={handlePrint} className="shrink-0 text-xs text-[#f5a742] underline">Coba lagi</button>
        </div>
      )}

      <ReceiptPreviewCard receipt={receipt} />

      {/* === KIRIM INVOICE BLOCK === */}
      <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-4 text-[#25d366]" />
            <p className="garage-mono text-[12px] uppercase tracking-wide text-[#d6d6dc]">
              Kirim Invoice ke Customer
            </p>
          </div>
          {waSentTo && !waEditing && (
            <span className="garage-mono text-[10px] uppercase tracking-wide text-[#4ade80]">
              ✓ Terkirim
            </span>
          )}
        </div>

        {/* Phone row: display mode vs edit mode */}
        {!waEditing && waPhone ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-[#34343c] bg-black/30 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">Nomor tujuan</p>
              <p className="garage-mono truncate text-sm font-semibold text-white">
                {formatWaDisplay(waPhone)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWaEditing(true)}
              className="shrink-0 text-xs text-[#f5a742] underline hover:text-[#ffba5a]"
            >
              Ganti
            </button>
          </div>
        ) : (
          <div className="mb-2">
            <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
              No. WhatsApp customer
            </p>
            <Input
              type="tel"
              inputMode="numeric"
              value={waPhone}
              onChange={(event) =>
                setWaPhone(event.target.value.replace(/[^\d+]/g, ""))
              }
              placeholder="08xx xxxx xxxx"
              className="mt-1 h-10 border-[#34343c] bg-white/[0.06] font-mono"
            />
            <p className="mt-1 text-[10px] text-[#8f8f99]">
              Kosongkan untuk pilih kontak manual di WhatsApp.
            </p>
          </div>
        )}

        {/* Action buttons: WA send + Copy link + Open invoice */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            className="garage-press h-11 gap-2 bg-[#25d366] text-black hover:bg-[#34e377]"
            onClick={handleSendWhatsapp}
          >
            <MessageCircle className="size-4" />
            Kirim WhatsApp
          </Button>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-11 gap-2 border-[#4a4a54]"
            onClick={handleCopyLink}
            disabled={!hasInvoiceLink}
          >
            {copyState === "copied" ? (
              <>
                <Check className="size-4 text-[#4ade80]" />
                Link Tersalin
              </>
            ) : copyState === "error" ? (
              <>
                <X className="size-4 text-[#ffc2c8]" />
                Gagal Salin
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Salin Link Invoice
              </>
            )}
          </Button>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {hasInvoiceLink && (
            <button
              type="button"
              onClick={handleOpenInvoice}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#34343c] py-2 text-xs text-[#8f8f99] transition-colors hover:border-[#4a4a54] hover:text-[#d6d6dc]"
            >
              <ExternalLink className="size-3.5" />
              Buka halaman invoice
            </button>
          )}
          {invoicePdfUrl && (
            <a
              href={invoicePdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#34343c] py-2 text-xs text-[#8f8f99] transition-colors hover:border-[#4a4a54] hover:text-[#d6d6dc]"
            >
              <Download className="size-3.5" />
              Unduh invoice PDF
            </a>
          )}
        </div>
      </div>
      {/* === END KIRIM INVOICE BLOCK === */}

      <div className="grid gap-2 sm:grid-cols-3">
        <Button className="garage-press h-12 gap-2" onClick={handlePrint} disabled={printStatus === "printing"}>
          <Printer className="size-4" />
          {printStatus === "idle" && "Cetak Struk"}
          {printStatus === "printing" && "Mencetak..."}
          {printStatus === "success" && "Cetak Struk"}
          {printStatus === "error" && "Cetak Struk"}
        </Button>
        <Button variant="outline" className="garage-press h-12 gap-2 border-[#4a4a54]" onClick={onNewTransaction}>
          <RefreshCw className="size-4" />
          Transaksi Baru
        </Button>
        <Button variant="outline" className="garage-press h-12 gap-2 border-[#4a4a54] w-auto px-3" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// Normalisasi no HP Indonesia ke format wa.me (62xxxxxxxxxx, tanpa "+" / "-")
function normalizeWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

// Format tampilan: 6281234567890 → +62 812-3456-7890
function formatWaDisplay(phone: string): string {
  const normalized = normalizeWaNumber(phone);
  if (!normalized.startsWith("62")) return phone;
  const local = normalized.slice(2);
  if (local.length < 4) return `+62 ${local}`;
  const parts = [local.slice(0, 3), local.slice(3, 7), local.slice(7)].filter(Boolean);
  return `+62 ${parts.join("-")}`;
}


function ReceiptPreviewCard({ receipt }: { receipt: OrderReceipt }) {
  const serviceLabel = `Service ${receipt.settings?.serviceChargePct ?? 5}%`;
  const taxLabel = `PB1 ${receipt.settings?.taxPct ?? 10}%`;
  const brandName = receipt.settings?.brandName || "GARAGE";
  const brandTagline = receipt.settings?.brandTagline || "Coffee · Tebing Tinggi";
  const footer = receipt.settings?.receiptFooter || "Terima kasih sudah mampir ke GARAGE.";

  return (
    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-4">
      {receipt.isReprint ? (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-md border border-[#f5a742]/55 bg-[#f5a742]/14 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#ffd08a]">
          <Printer className="size-3.5" />
          Cetak Ulang · {formatReceiptDate(receipt.reprintAt ?? new Date().toISOString())}
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="garage-display garage-chrome text-2xl leading-none">
            {brandName}
          </p>
          <p className="text-xs text-[#b8b8bf]">{brandTagline}</p>
        </div>
        <div className="text-right">
          <p className="garage-mono text-[11px] text-[#b8b8bf]">Struk</p>
          <p className="text-sm font-semibold text-white">{receipt.orderNo}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <BillRow label="Tanggal" value={formatReceiptDate(receipt.createdAt)} />
        <BillRow label="Kasir" value={receipt.cashier.name} />
      </div>
      <div className="mt-4 space-y-2">
        {receipt.items.map((item) => (
          <div
            key={`${item.name}-${item.variant}-${item.qty}`}
            className="rounded-md border border-[#34343c] bg-[#202027]/78 p-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                <p className="text-xs text-[#b8b8bf]">
                  {item.variant} x {item.qty}
                </p>
              </div>
              <p className="garage-mono text-sm text-white">
                {currency.format(item.lineTotal)}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-[#4a4a54] bg-[#0f0f14] p-3">
        <BillRow label="Subtotal" value={currency.format(receipt.subtotal)} />
        {receipt.service > 0 ? (
          <BillRow label={serviceLabel} value={currency.format(receipt.service)} />
        ) : null}
        {receipt.tax > 0 ? (
          <BillRow label={taxLabel} value={currency.format(receipt.tax)} />
        ) : null}
        {receipt.discount > 0 ? (
          <BillRow label="Diskon" value={`- ${currency.format(receipt.discount)}`} />
        ) : null}
        <BillRow label="Total" value={currency.format(receipt.total)} large accent />
      </div>
      <div className="mt-4 rounded-md border border-[#34343c] bg-white/[0.04] px-3 py-2 text-center text-xs text-[#d6d6dc]">
        {footer}
      </div>
    </div>
  );
}

function PrintableReceipt({ receipt }: { receipt: OrderReceipt }) {
  const serviceLabel = `Service ${receipt.settings?.serviceChargePct ?? 5}%`;
  const taxLabel = `PB1 ${receipt.settings?.taxPct ?? 10}%`;
  const brandName = receipt.settings?.brandName || "GARAGE";
  const brandTagline = receipt.settings?.brandTagline || "Coffee · Tebing Tinggi";
  const footer = receipt.settings?.receiptFooter || "Terima kasih";

  return (
    <div className="garage-print-thermal">
      {receipt.isReprint ? (
        <div
          style={{
            border: "2px dashed #000",
            padding: "4px 6px",
            textAlign: "center",
            fontWeight: 900,
            letterSpacing: "0.18em",
            margin: "0 0 6px",
          }}
        >
          *** CETAK ULANG ***
          <br />
          <span style={{ fontWeight: 700, fontSize: "0.85em" }}>
            {formatReceiptDate(receipt.reprintAt ?? new Date().toISOString())}
          </span>
        </div>
      ) : null}
      <div className="garage-print-header">
        <p className="garage-print-brand">{brandName}</p>
        <p>{brandTagline}</p>
        <p>{receipt.outlet.name}</p>
        {receipt.settings?.outletAddress ? <p>{receipt.settings.outletAddress}</p> : null}
        {receipt.settings?.outletPhone ? <p>{receipt.settings.outletPhone}</p> : null}
        {receipt.settings?.npwp ? <p>NPWP {receipt.settings.npwp}</p> : null}
      </div>
      <div className="garage-print-meta">
        <div><span>Invoice</span><strong>{receipt.invoiceNo}</strong></div>
        <div><span>Status</span><strong>{receipt.invoiceStatus}</strong></div>
        <div><span>Order</span><strong>{receipt.orderNo}</strong></div>
        <div>
          <span>KDS</span>
          <strong>{receipt.ticketNos.length > 1 ? receipt.ticketNos.join(", ") : receipt.ticketNo}</strong>
        </div>
        <div><span>Tanggal</span><strong>{formatReceiptDate(receipt.createdAt)}</strong></div>
        <div><span>Kasir</span><strong>{receipt.cashier.name}</strong></div>
      </div>
      <div className="garage-print-lines">
        {receipt.items.map((item) => (
          <div key={`${item.name}-${item.variant}-${item.qty}`} className="garage-print-line">
            <div>
              <strong>{item.name}</strong>
              <span>
                {item.variant} x {item.qty} @ {currency.format(item.unitPrice)}
              </span>
            </div>
            <strong>{currency.format(item.lineTotal)}</strong>
          </div>
        ))}
      </div>
      <div className="garage-print-totals">
        <ReceiptPrintRow label="Subtotal" value={receipt.subtotal} />
        {receipt.service > 0 ? <ReceiptPrintRow label={serviceLabel} value={receipt.service} /> : null}
        {receipt.tax > 0 ? (
          <ReceiptPrintRow label={taxLabel} value={receipt.tax} />
        ) : null}
        {receipt.discount > 0 ? (
          <ReceiptPrintRow label="Diskon" value={-receipt.discount} />
        ) : null}
        <ReceiptPrintRow label="Total" value={receipt.total} strong />
        {receipt.payment.cashReceived !== null && (
          <>
            <ReceiptPrintRow label="Diterima" value={receipt.payment.cashReceived} />
            <ReceiptPrintRow label="Kembalian" value={receipt.payment.change ?? 0} />
          </>
        )}
      </div>
      <div className="garage-print-footer">
        <p>{footer}</p>
      </div>
    </div>
  );
}

function ReceiptPrintRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "garage-print-total-row strong" : "garage-print-total-row"}>
      <span>{label}</span>
      <strong>{currency.format(value)}</strong>
    </div>
  );
}

function formatReceiptDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Pakai poin member di kasir: potongan = poin × nilai poin, maks sesuai Pengaturan. */
function PosPointsRedeemBox({
  balance,
  pointsToUse,
  maxPointsToUse,
  minPointsToUse,
  pointValue,
  onChange,
  verified,
  onScan,
}: {
  balance: number;
  pointsToUse: number;
  maxPointsToUse: number;
  minPointsToUse: number;
  pointValue: number;
  onChange: (points: number) => void;
  verified: boolean;
  onScan: () => void;
}) {
  const canUse = maxPointsToUse >= minPointsToUse;
  return (
    <div className="mt-3 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#ffe2b8]">Pakai poin</p>
        <p className="garage-mono text-[11px] text-[#ffd08a]">
          1 poin = {currency.format(pointValue)} · saldo {balance}
        </p>
      </div>
      {canUse && !verified ? (
        <div className="mt-2 space-y-1.5">
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 w-full border-[#f5a742]/50 text-sm text-[#ffd08a]"
            onClick={onScan}
          >
            <QrCode className="mr-2 size-4" />
            Scan QR member untuk pakai poin
          </Button>
          <p className="text-[11px] text-[#e4e4e7]">
            Poin hanya bisa dipakai setelah QR di kartu/aplikasi member dipindai. Nomor HP saja tidak cukup.
          </p>
        </div>
      ) : canUse ? (
        <>
          <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#ffd08a]">
            <ShieldCheck className="size-3.5" />
            QR member terverifikasi
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={maxPointsToUse}
              value={pointsToUse || ""}
              placeholder={`${minPointsToUse}–${maxPointsToUse}`}
              onChange={(event) => onChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
              aria-label="Jumlah poin dipakai"
              className="h-10 border-[#34343c] bg-black/30 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 shrink-0 border-[#f5a742]/50 px-3 text-xs text-[#ffd08a]"
              onClick={() => onChange(maxPointsToUse)}
            >
              Maks {maxPointsToUse}
            </Button>
            {pointsToUse > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="garage-press h-10 shrink-0 px-2 text-xs text-[#d4d4d8]"
                onClick={() => onChange(0)}
              >
                Batal
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[11px] text-[#e4e4e7]">
            {pointsToUse > 0
              ? `Potongan ${currency.format(pointsToUse * pointValue)} (${pointsToUse} poin).`
              : `Minimal ${minPointsToUse} poin, maksimal ${maxPointsToUse} poin untuk tagihan ini.`}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-[11px] text-[#e4e4e7]">
          {balance < minPointsToUse
            ? `Poin bisa dipakai mulai ${minPointsToUse} poin.`
            : "Tagihan ini belum bisa memakai poin (batas potongan terlalu kecil)."}
        </p>
      )}
    </div>
  );
}
