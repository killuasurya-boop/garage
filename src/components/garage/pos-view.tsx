"use client";

import {
AlertTriangle,
Archive,
ArrowLeft,
ArrowRight,
Ban,
Banknote,
BarChart3,
Bell,
Check,
ClipboardCheck,
Clock,
Copy,
CreditCard,
Equal,
ExternalLink,
FileText,
History,
Info,
Landmark,
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
Search,
Settings,
ShieldAlert,
ShieldCheck,
ShoppingCart,
Square,
SunMedium,
Timer,
Trash2,
Users,
Volume2,
Wallet,
WalletCards,
X
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
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
hasAwaitingTableBill,
hasOpenTableBill,
initialsForProfile,
isPaidOnlyTable,
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
ShiftNumberPicker,
type CashierThemeMode
} from "@/components/garage/garage-app-pickers";
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
import {
Table,
TableBody,
TableCell,
TableHead,
TableHeader,
TableRow,
} from "@/components/ui/table";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { garageApi } from "@/lib/api-client";
import { GARAGE_TAGS, invalidateGarageCache } from "@/lib/garage-cache";
import type {
AppSettings,
CartLine,
CashSession,
ClosingChecklistItem,
Customer,
CustomerOrder,
CustomerOrderActionResponse,
GarageMe,
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
VoucherValidation
} from "@/lib/garage-api-types";
import { menuFilterMatches } from "@/lib/garage-api-types";
import {
currency
} from "@/lib/garage-data";
import {
garageQrOrderPath,
garageQrOrderUrl,
isLocalQrBaseUrl,
} from "@/lib/garage-qr";
import { voice } from "@/lib/garage-voice";
import { normalizePhone } from "@/lib/member-types";

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

const GARAGE_BRAND_LOGO_SRC = "/garage-brand/logo-website.png";
const GARAGE_BRAND_LOGO_WIDTH = 1024;
const GARAGE_BRAND_LOGO_HEIGHT = 325;
const GARAGE_BUSINESS_NAME = "Garage Coffee & Motor";
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

const menuPrimaryGroups: MenuFilter[] = ["All", "Dapur", "Bar"];
const menuSubCategories: Record<"Dapur" | "Bar", MenuFilter[]> = {
  Dapur: ["Makanan", "Cemilan"],
  Bar: ["Coffee", "Non-Coffee"],
};
const qrPublicBaseUrl = process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
const qrPrintPath = "/order/qr-print";
const pilotQrPrintPath = "/order/qr-print?tables=01,25,50";
const initialVisibleProducts = 40;
const productLoadStep = 20;

type PaymentStep = "summary" | "table" | "customer" | "payment" | "done";
type ShiftResetTableMode = "none" | "completed" | "all";
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

const qrOrderActionGuides = [
  {
    label: "Accept",
    tone: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]",
    description: "Validasi order dan buat ticket KDS. Order belum dianggap lunas.",
  },
  {
    label: "Terima Pembayaran",
    tone: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#dcfce7]",
    description: "Konfirmasi cash, QRIS, atau transfer. Sistem mencatat payment, membuat struk, dan memproses point member bila ada.",
  },
  {
    label: "Reject",
    tone: "border-[#4a4a54] bg-[#202027] text-[#d6d6dc]",
    description: "Tolak order agar tidak masuk antrian kitchen.",
  },
];

const qrControlStatusFilters = [
  { value: "all", label: "Semua status" },
  { value: "pending_cashier", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
];

const qrControlSourceFilters = [
  { value: "all", label: "Semua source" },
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

const qrWorkTabs: Array<{ value: QrWorkTab; label: string }> = [
  { value: "incoming", label: "Antrean" },
  { value: "history", label: "History" },
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
  onSignOut,
  signOutPending,
  signOutError,
  themeMode,
  onThemeChange,
  cashierTheme,
  onCashierThemeChange,
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
  onSignOut: () => Promise<void> | void;
  signOutPending: boolean;
  signOutError: string | null;
  themeMode: GarageThemeMode;
  onThemeChange: (theme: GarageThemeMode) => void;
  cashierTheme: CashierThemeMode;
  onCashierThemeChange: (theme: CashierThemeMode) => void;
}) {
  const [orderType, setOrderType] = useState<OrderType>("dine-in");
  const [selectedTableNumber, setSelectedTableNumber] = useState("");
  const [menuCategory, setMenuCategory] = useState<MenuFilter>("All");
  const [bestsellerOnly, setBestsellerOnly] = useState(false);
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
  // Split bill calculator â€” display only, tidak ubah payment flow.
  // Untuk group customer yang bayar terpisah (bagi rata).
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [splitPeopleCount, setSplitPeopleCount] = useState("2");
  const [manualDiscount, setManualDiscount] = useState<ManualDiscount | null>(null);
  const [manualDiscountOpen, setManualDiscountOpen] = useState(false);
  const [manualDiscountTypeInput, setManualDiscountTypeInput] =
    useState<"amount" | "percent">("amount");
  const [manualDiscountValueInput, setManualDiscountValueInput] = useState("");
  const [manualDiscountReasonInput, setManualDiscountReasonInput] = useState("");
  const [manualDiscountError, setManualDiscountError] = useState<string | null>(null);
  // Sold-out flag per item (frontend-only). Persist ke localStorage.
  const [soldOutIds, setSoldOutIds] = useState<Set<string>>(new Set());
  const [soldOutDialogOpen, setSoldOutDialogOpen] = useState(false);
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
  // Catat Pengeluaran (kasbon laci kasir) â€” POST /api/finance/expenses
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("Kasbon");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState("Cash");
  const [expensePending, setExpensePending] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  // Quick Count Stok (hanya tampil utk role yg punya inventory:write)
  const canQuickCount =
    me.role === "Manager Operasional" ||
    me.role === "Supervisor Shift" ||
    me.role === "Gudang" ||
    me.role === "Owner / CEO" ||
    me.role === "Admin";
  type QuickCountItem = {
    sku: string;
    name: string;
    category: string;
    onHand: number;
    unit: string;
  };
  const [quickCountOpen, setQuickCountOpen] = useState(false);
  const [quickCountItems, setQuickCountItems] = useState<QuickCountItem[]>([]);
  const [quickCountLoading, setQuickCountLoading] = useState(false);
  const [quickCountQuery, setQuickCountQuery] = useState("");
  const [quickCountDraft, setQuickCountDraft] = useState<Record<string, string>>({});
  const [quickCountSubmitting, setQuickCountSubmitting] = useState(false);
  const [quickCountError, setQuickCountError] = useState<string | null>(null);
  const [quickCountResult, setQuickCountResult] = useState<{
    success: number;
    failed: number;
  } | null>(null);
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
  // Wire: defaultPaymentMethod dari /control/settings â†’ POS payment.
  // Mapping lowercase setting â†’ PaymentMethod label.
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
  const [qrisImageReady, setQrisImageReady] = useState(true);
  // Wire: shiftOpeningCashDefault dari /control/settings â†’ Shift & Cash
  // Default settings 500K, tapi form max 500K & multiple of 50K. Coerce ke valid range.
  const _shiftOpeningDefault = (() => {
    const raw = Number(settings?.shiftOpeningCashDefault ?? 50000);
    if (!Number.isFinite(raw) || raw < 50000) return 50000;
    const capped = Math.min(500000, raw);
    return Math.round(capped / 50000) * 50000;
  })();
  const [openingCash, setOpeningCash] = useState(String(_shiftOpeningDefault));
  const [openingShiftNumber, setOpeningShiftNumber] = useState<1 | 2>(1);
  const [actualCash, setActualCash] = useState(() =>
    String(cashSession.expectedCash ?? cashSession.openingCash ?? 0),
  );
  const [shiftClosingNote, setShiftClosingNote] = useState("");
  const [shiftResetTableMode, setShiftResetTableMode] =
    useState<ShiftResetTableMode>("completed");
  const [shiftChecklist, setShiftChecklist] = useState<ClosingChecklistItem[]>(
    cashSession.checklist,
  );
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [shiftPending, setShiftPending] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [posNotice, setPosNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
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
  const [shiftHandoverPending, setShiftHandoverPending] = useState(false);
  const [dismissedQrNoticeKey, setDismissedQrNoticeKey] = useState<string | null>(null);
  const [qrNoticePulseKey, setQrNoticePulseKey] = useState<string | null>(null);
  const [qrTablesOpen, setQrTablesOpen] = useState(false);
  const [selectedQrTable, setSelectedQrTable] = useState("01");
  const [qrPreviewSvg, setQrPreviewSvg] = useState<string | null>(null);
  const [qrPreviewLoading, setQrPreviewLoading] = useState(false);
  const [resetTableDialogOpen, setResetTableDialogOpen] = useState(false);
  const [selectedTableToReset, setSelectedTableToReset] = useState<TableLiveRow | null>(null);
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
    [],
  );
  const isCashierKiosk = me.role === "Kasir";
  const canManagePosSettings = me.role === "Owner / CEO" || me.role === "Admin";
  const canResetAllTablesOnClose = ["Owner / CEO", "Admin", "Manager Operasional"].includes(
    me.role,
  );
  const activeCashierToolOpen =
    cashierToolOpen === "settings" && !canManagePosSettings ? null : cashierToolOpen;

  const tablePickerRows = useMemo(
    () =>
      tableNumbers.map(
        (table) =>
          tableLiveRows.find((row) => row.tableNumber === table) ??
          fallbackTableLiveRow(table),
      ),
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
    setActualCash(String(cashSession.expectedCash ?? cashSession.openingCash ?? 0));
    setShiftClosingNote(cashSession.closingNote ?? "");
    setShiftChecklist(cashSession.checklist);
  }, [
    shiftOpen,
    cashSession.expectedCash,
    cashSession.openingCash,
    cashSession.closingNote,
    cashSession.checklist,
  ]);
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
        ]
          .join(" ")
          .toLowerCase(),
        isBestseller: item.tags.some((t) => t.toLowerCase() === "bestseller"),
      })),
    [menuItems],
  );
  const filteredMenu = useMemo(() => {
    const result: MenuItem[] = [];
    for (const entry of indexedMenu) {
      if (!menuFilterMatches(menuCategory, entry.item.category)) continue;
      if (bestsellerOnly && !entry.isBestseller) continue;
      if (normalizedMenuQuery && !entry.searchIndex.includes(normalizedMenuQuery))
        continue;
      result.push(entry.item);
    }
    return result;
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

  // Lookup map idâ†’MenuItem dipakai di cart, sold-out check, dan voice
  // announce. Hindari .find() O(N) per line per render (sebelumnya O(NÂ·M)).
  const menuItemsById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of menuItems) map.set(item.id, item);
    return map;
  }, [menuItems]);

  const cartLines = useMemo(
    () =>
      cart
        .map((line) => {
          const item = menuItemsById.get(line.itemId);
          const variant = item?.variants.find(
            (entry) => entry.id === line.variantId,
          );

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
  const showQrNotice =
    customerOrders.length > 0 && dismissedQrNoticeKey !== customerOrderNoticeKey;
  const qrNoticeIsNew =
    showQrNotice && qrNoticePulseKey === customerOrderNoticeKey;
  const subtotal = cartLines.reduce(
    (total, line) => total + line.variant.price * line.qty,
    0,
  );
  const serviceChargePct = settings.serviceChargePct;
  const taxPct = settings.taxPct;
  const service = Math.round(subtotal * (serviceChargePct / 100));
  const tax = Math.round((subtotal + service) * (taxPct / 100));
  const total = subtotal + service + tax;
  const voucher = posVoucherResult?.valid ? posVoucherResult.discount : 0;
  // Manual discount dihitung dari total SETELAH voucher (urutan: voucher â†’ manual)
  const manualDiscountAmount = manualDiscount
    ? manualDiscount.type === "percent"
      ? Math.min(
          Math.max(0, total - voucher),
          Math.round(((total - voucher) * manualDiscount.rawValue) / 100),
        )
      : Math.min(Math.max(0, total - voucher), manualDiscount.amount)
    : 0;
  const totalDue = Math.max(0, total - voucher - manualDiscountAmount);
  const estimatedMemberPoints = selectedMember
    ? Math.floor(
        Math.floor((totalDue / 1000) * settings.pointsPerThousand) *
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
  const qrisPaymentReady =
    selectedPaymentMethod !== "QRIS" || qrisImageReady;
  const paymentReady = cashPaymentReady && qrisPaymentReady;
  const manualDiscountAwaitingApproval =
    manualDiscount?.approvalStatus === "pending";
  const checkoutReady =
    paymentReady && !dineInTableMissing && !manualDiscountAwaitingApproval;
  const actualCashValue = Number(actualCash || 0);
  const actualCashReady =
    Number.isFinite(actualCashValue) && actualCashValue >= 0;
  const shiftDiscrepancyPreview = actualCashReady
    ? Math.round(actualCashValue) - cashSession.expectedCash
    : 0;
  const quickCashAmounts = useMemo(
    () =>
      [10000, 20000, 50000, 100000].filter((amount) => amount >= totalDue),
    [totalDue],
  );

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
          setPosNotice("Diskon manual disetujui â€” bisa lanjut bayar.");
        } else if (json.data.status === "rejected") {
          setManualDiscount(null);
          setPosNotice("Diskon manual ditolak supervisor.");
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
    if (cashierPosSettings.qrSoundMode === "off") {
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
  }, [cashierPosSettings.qrSoundMode, emitQrNotificationTone, getQrNotificationAudioContext]);

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
          if (cashierPosSettings.qrSoundMode === "airport") {
            void voice.announce("airport_qr", {
              force: true,
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
        error instanceof Error ? error.message : "QR customer orders gagal dimuat.",
      );
    } finally {
      if (!options.silent) {
        setCustomerOrdersLoading(false);
      }
    }
  }, [cashierPosSettings.qrSoundMode, playQrOrderNotificationSound]);

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
    } catch (error) {
      setTableLiveError(
        error instanceof Error ? error.message : "Table map gagal dimuat.",
      );
    } finally {
      if (!options.silent) {
        setTableLiveLoading(false);
      }
    }
  }, []);

  const resetTableCleaning = useCallback(async (tableNumber: string) => {
    setTableLiveLoading(true);
    setResetTableDialogOpen(false);
    try {
      await garageApi.patch(`/api/tables/${tableNumber}/status`, {
        status: "empty",
        needsCleaning: false,
      });
      await loadTableLiveData({ silent: true });
      setPosNotice(`Meja ${tableNumber} siap digunakan.`);
    } catch (error) {
      setTableLiveError(
        error instanceof Error ? error.message : "Gagal reset meja.",
      );
    } finally {
      setTableLiveLoading(false);
      setSelectedTableToReset(null);
    }
  }, [loadTableLiveData]);

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
        error instanceof Error ? error.message : "Refresh POS gagal.",
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
    ? "Masuk Fullscreen Lagi"
    : "Kunci Fullscreen";

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
  }, [cashierPosSettings.autoLockDelay, isCashierKiosk, locked]);

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
    if (!shiftOpen) {
      return;
    }

    const tick = () => {
      // Pause polling saat tab/window di-background â€” kasir nggak butuh
      // refresh QR/table saat lagi buka modul lain atau monitor mati.
      if (typeof document !== "undefined" && document.hidden) return;
      void loadCustomerOrders({ silent: true });
      void loadQrControlInsights({ silent: true });
      void loadTableLiveData({ silent: true });
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
  }, [loadCustomerOrders, loadQrControlInsights, loadTableLiveData, shiftOpen]);

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
    } = {},
  ) {
    if (customerOrderActionId) {
      return;
    }

    setCustomerOrderActionId(`${order.id}:${action}`);
    setCustomerOrderError(null);
    try {
      const finalCashReceived =
        action === "paid" && customerOrderPaymentMethod(order) === "Cash"
          ? options.cashReceived ?? order.cashReceived ?? order.cashDeposited ?? order.total
          : options.cashReceived;
      const finalCashDeposited =
        action === "paid" && customerOrderPaymentMethod(order) === "Cash"
          ? options.cashDeposited ?? order.cashDeposited ?? finalCashReceived
          : options.cashDeposited;
      const result = await garageApi.patch<CustomerOrderActionResponse>(
        `/api/customer/orders/${order.id}/status`,
        {
          action,
          paymentMethod: action === "paid" ? customerOrderPaymentMethod(order) : undefined,
          paymentProvider: action === "paid" ? customerOrderPaymentProvider(order) : undefined,
          paymentReference: action === "paid" ? customerOrderPaymentReference(order) : undefined,
          cashReceived: finalCashReceived,
          cashDeposited: finalCashDeposited,
          paymentNote: options.paymentNote,
        },
      );
      const ticketLabel = result.ticketNos.length ? result.ticketNos.join(", ") : "tanpa ticket baru";
      setPosNotice(
        action === "reject"
          ? `${order.orderNo} ditolak.`
          : action === "whatsapp_sent"
            ? `${order.orderNo} ditandai invoice WhatsApp terkirim.`
            : action === "waiter_cash_received"
              ? `${order.orderNo} cash diterima waiter.`
              : action === "waiter_cash_deposited"
                ? `${order.orderNo} setoran waiter menunggu konfirmasi kasir.`
                : `${order.orderNo} ${action === "paid" ? "pembayaran diterima" : "accepted"} - ${ticketLabel}.`,
      );
      await loadCustomerOrders({ silent: true });
      await loadQrControlInsights({ silent: true });
      await loadTableLiveData({ silent: true });
      if (action === "accept" || action === "paid") {
        await onOrderCreated();
      }
      if (action === "paid" || action === "reject") {
        setSelectedCustomerOrderId(null);
        setQrOrdersOpen(false);
      }
    } catch (error) {
      setCustomerOrderError(
        error instanceof Error ? error.message : "Aksi QR customer order gagal.",
      );
    } finally {
      setCustomerOrderActionId(null);
    }
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
    // ID + timestamp safe di event handler (bukan render body)
    // eslint-disable-next-line react-hooks/purity -- event handler
    const idSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  function resumeParkedOrder(parked: ParkedOrder) {
    if (cart.length) {
      const confirm = window.confirm(
        `Cart aktif punya ${cart.length} item. Mau di-park dulu sebelum resume "${parked.label}"?`,
      );
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
          `Diskon ${currency.format(computed)} diajukan ke Approvals. Tunggu supervisor sebelum bayar.`,
        );
      } catch (error) {
        setManualDiscountError(
          error instanceof Error ? error.message : "Gagal mengajukan approval diskon.",
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
    try {
      const res = await fetch("/api/print/thermal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt: reprintPayload,
          printerName: reprintPayload.settings?.defaultPrinterName || undefined,
          copies: reprintPayload.settings?.receiptCopies,
        }),
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

  function clearReceiptHistory() {
    if (!receiptHistory.length) return;
    const confirm = window.confirm(
      `Hapus ${receiptHistory.length} struk dari riwayat shift?`,
    );
    if (!confirm) return;
    setReceiptHistory([]);
    setPosNotice("Riwayat struk shift dihapus.");
  }

  // Void/refund (cuma manager/finance/owner)
  const canVoidOrder =
    me.role === "Manager Operasional" ||
    me.role === "Supervisor Shift" ||
    me.role === "Finance / CFO" ||
    me.role === "Owner / CEO" ||
    me.role === "Admin";
  const [voidingReceiptId, setVoidingReceiptId] = useState<string | null>(null);
  const canRequestVoidApproval =
    !canVoidOrder &&
    (me.role === "Kasir" ||
      me.role === "Waiter 1" ||
      me.role === "Waiter 2");
  async function requestVoidReceiptApproval(receipt: OrderReceipt) {
    const reason = window.prompt(
      `Minta approval void untuk ${receipt.orderNo}?\n\nTotal: ${currency.format(receipt.total)}\n\nAlasan (min 3 karakter):`,
    );
    if (!reason || reason.trim().length < 3) return;
    setVoidingReceiptId(receipt.invoiceNo);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(receipt.orderNo)}/void-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        data?: { approvalId?: string };
      };
      if (!res.ok) {
        window.alert(
          `Pengajuan void gagal: ${data.error?.message ?? "Cek koneksi atau permission."}`,
        );
        return;
      }
      setPosNotice(
        `Void ${receipt.orderNo} diajukan ke Approvals (${data.data?.approvalId ?? "pending"}).`,
      );
    } catch {
      window.alert("Pengajuan void gagal: koneksi error.");
    } finally {
      setVoidingReceiptId(null);
    }
  }
  async function voidReceiptOrder(receipt: OrderReceipt) {
    const reason = window.prompt(
      `Alasan void order ${receipt.orderNo}? (wajib minimal 3 karakter)\n\nTotal: ${currency.format(receipt.total)}\n\nStok bahan baku akan dikembalikan, struk lama harus dihancurkan.`,
    );
    if (!reason || reason.trim().length < 3) return;
    setVoidingReceiptId(receipt.invoiceNo);
    try {
      // Order ID tidak ada di OrderReceipt â€” pakai invoiceNo sebagai fallback
      // melalui endpoint search. Kalau gagal, fall back ke orderNo
      const idForVoid = receipt.orderNo;
      const res = await fetch(
        `/api/orders/${encodeURIComponent(idForVoid)}/void`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        data?: { stockReversed?: number };
      };
      if (!res.ok) {
        window.alert(
          `Void gagal: ${data.error?.message ?? "Cek koneksi atau permission."}`,
        );
        return;
      }
      setReceiptHistory((current) =>
        current.filter((r) => r.invoiceNo !== receipt.invoiceNo),
      );
      setPosNotice(
        `Order ${receipt.orderNo} void. ${data.data?.stockReversed ?? 0} bahan dikembalikan.`,
      );
      // Void mengubah orders/finance/inventory — refresh view terkait.
      invalidateGarageCache([
        GARAGE_TAGS.orders,
        GARAGE_TAGS.finance,
        GARAGE_TAGS.inventory,
        GARAGE_TAGS.dashboard,
      ]);
    } catch {
      window.alert("Void gagal: koneksi error.");
    } finally {
      setVoidingReceiptId(null);
    }
  }

  // â”€â”€â”€ Catat Pengeluaran (kasbon kasir) â”€â”€â”€
  function openExpenseDialog(presetCategory?: string) {
    setExpenseError(null);
    setExpenseCategory(presetCategory ?? "Kasbon");
    setExpenseDescription("");
    setExpenseAmount("");
    setExpenseNote("");
    setExpensePaymentMethod("Cash");
    setExpenseDialogOpen(true);
  }

  // â”€â”€â”€ Quick Count Stok â”€â”€â”€
  async function openQuickCount() {
    setQuickCountQuery("");
    setQuickCountDraft({});
    setQuickCountError(null);
    setQuickCountResult(null);
    setQuickCountOpen(true);
    setQuickCountLoading(true);
    try {
      const items = await garageApi.get<QuickCountItem[]>("/api/inventory");
      setQuickCountItems(items);
    } catch (error) {
      setQuickCountError(
        error instanceof Error ? error.message : "Gagal memuat inventory.",
      );
    } finally {
      setQuickCountLoading(false);
    }
  }

  async function submitQuickCount() {
    const entries = Object.entries(quickCountDraft)
      .map(([sku, value]) => {
        const fisik = Number(value);
        const item = quickCountItems.find((i) => i.sku === sku);
        if (!item || value === "" || !Number.isFinite(fisik) || fisik < 0) return null;
        return { item, fisik, delta: fisik - item.onHand };
      })
      .filter((e): e is { item: QuickCountItem; fisik: number; delta: number } =>
        Boolean(e),
      );

    if (!entries.length) {
      setQuickCountError("Isi minimal 1 item sebelum submit.");
      return;
    }

    setQuickCountSubmitting(true);
    setQuickCountError(null);
    let success = 0;
    let failed = 0;
    const baseNote = `Quick count POS oleh ${me.user.name}`;
    for (const entry of entries) {
      try {
        const patch = await fetch(
          `/api/inventory/${encodeURIComponent(entry.item.sku)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              onHand: entry.fisik,
              movement: `${baseNote} (selisih ${entry.delta >= 0 ? "+" : ""}${entry.delta})`,
            }),
          },
        );
        if (!patch.ok) {
          failed += 1;
          continue;
        }
        await fetch("/api/inventory/movements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemSku: entry.item.sku,
            type: entry.delta >= 0 ? "stock_in" : "stock_out",
            qty: entry.delta,
            note: `${baseNote}: sistem ${entry.item.onHand} â†’ fisik ${entry.fisik} ${entry.item.unit}`,
          }),
        }).catch(() => {
          /* movement gagal tapi onHand sudah update */
        });
        success += 1;
      } catch {
        failed += 1;
      }
    }
    setQuickCountSubmitting(false);
    setQuickCountResult({ success, failed });
    if (success > 0) {
      setPosNotice(`Quick count: ${success} item disimpan.`);
      await onOrderCreated();
    }
  }

  async function submitExpense() {
    if (!shiftOpen) {
      setExpenseError("Buka shift terlebih dahulu sebelum mencatat pengeluaran.");
      return;
    }
    const amount = Number(expenseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setExpenseError("Nominal pengeluaran tidak valid.");
      return;
    }
    const description = expenseDescription.trim();
    if (description.length < 2) {
      setExpenseError("Deskripsi pengeluaran wajib diisi.");
      return;
    }
    setExpensePending(true);
    setExpenseError(null);
    try {
      await garageApi.post("/api/finance/expenses", {
        category: expenseCategory.trim() || "Lain-lain",
        description,
        amount: Math.round(amount),
        paymentMethod: expensePaymentMethod || "Cash",
        notes: expenseNote.trim() || undefined,
      });
      setExpenseDialogOpen(false);
      const approvalNote =
        amount >= 1_000_000 ? " Â· butuh approval manager" : "";
      setPosNotice(
        `Pengeluaran ${currency.format(Math.round(amount))} dicatat.${approvalNote}`,
      );
    } catch (error) {
      setExpenseError(
        error instanceof Error ? error.message : "Gagal mencatat pengeluaran.",
      );
    } finally {
      setExpensePending(false);
    }
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
    setActualCash(String(cashSession.expectedCash ?? cashSession.openingCash ?? 0));
    setShiftClosingNote(cashSession.closingNote ?? "");
    setShiftResetTableMode("completed");
    setShiftChecklist(cashSession.checklist);
    setOpeningShiftNumber(shiftOpen ? 2 : 1);
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

  function shiftChecklistReady() {
    if (!shiftChecklist.length || shiftChecklist.some((item) => !item.done)) {
      setShiftError("Checklist tutup shift wajib dicentang semua sebelum close.");
      return false;
    }

    return true;
  }

  async function openShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const openingCashValue = parseOpeningCashAmount();
    if (openingCashValue === null) {
      return;
    }

    setShiftPending(true);
    setShiftError(null);
    try {
      await garageApi.post<CashSession>("/api/finance/cash-sessions", {
        openingCash: openingCashValue,
        shiftNumber: openingShiftNumber,
      });
      await onCashSessionOpened();
      setShiftDialogOpen(false);
    } catch (error) {
      setShiftError(error instanceof Error ? error.message : "Mulai shift gagal.");
    } finally {
      setShiftPending(false);
    }
  }

  async function closeShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const actualCashInput = parseCashAmount(actualCash, "Uang aktual di laci", { required: true });
    if (actualCashInput === null) {
      return;
    }
    if (!shiftChecklistReady()) {
      return;
    }

    setShiftPending(true);
    setShiftError(null);
    try {
      const closedSession = await garageApi.patch<CashSession>(
        `/api/finance/cash-sessions/${cashSession.id}/close`,
        {
          actualCash: actualCashInput,
          checklist: shiftChecklist,
          closingNote: shiftClosingNote,
          resetTableMode: shiftResetTableMode,
        },
      );
      await onCashSessionOpened();
      setShiftDialogOpen(false);
      setPosNotice(
        closedSession.resetTables?.requested
          ? `Shift ditutup. ${closedSession.resetTables.count} meja direset ke kosong.`
          : "Shift ditutup tanpa reset meja.",
      );
      // Voice notification: bunyi kalau ada selisih kas (lebih atau kurang
      // dari expected) sehingga Manager langsung tahu untuk verifikasi.
      if (closedSession.discrepancy !== 0) {
        void voice.announce("cash_anomaly", {
          force: true,
          dedupKey: `cash-anomaly-${closedSession.id}`,
        });
      }
    } catch (error) {
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
      setFullscreenError("Fullscreen tidak tersedia di device/browser ini.");
      setPosNotice("Fullscreen tidak tersedia di device/browser ini.");
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
      setLockError("Masukkan PIN lock POS.");
      return;
    }

    try {
      await garageApi.post<{ status: boolean }>("/api/pos/unlock", {
        password: unlockPassword,
      });
      setUnlockPassword("");
      setLocked(false);
    } catch (error) {
      setLockError(error instanceof Error ? error.message : "PIN lock POS tidak cocok.");
    }
  }

  async function signOutFromLockedPos() {
    setLockError(null);
    await signOutFromPos();
  }

  async function submitOrder(paymentMethod: PaymentMethod) {
    if (dineInTableMissing) {
      setPaymentError("Pilih nomor meja sebelum konfirmasi bayar.");
      return;
    }

    if (!cashPaymentReady) {
      setPaymentError("Uang diterima belum cukup untuk pembayaran cash.");
      return;
    }

    if (manualDiscount?.approvalStatus === "pending") {
      setPaymentError("Diskon manual masih menunggu approval supervisor.");
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

    // Anti double-submit: generate idempotency key per submission attempt.
    // Klik dobel kasir / retry network akan kirim key sama â†’ server return order yang sama.
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      const result = await garageApi.post<OrderCreateResponse>(
        "/api/orders",
        {
        orderType,
        tableNumber: orderType === "dine-in" ? selectedTableNumber : undefined,
        tableLabel,
        paymentMethod,
        paymentProvider: paymentProviderValue || undefined,
        paymentReference: paymentReference.trim() || undefined,
        cashReceived: paymentMethod === "Cash" ? cashReceivedValue : undefined,
        customerId: posCustomerMode === "member" ? selectedMember?.customerId : undefined,
        memberPhone: posCustomerMode === "member" ? selectedMember?.member.phone : undefined,
        guestName: posCustomerMode === "guest" ? guestName.trim() || undefined : undefined,
        guestPhone: posCustomerMode === "guest" ? guestPhone.trim() || undefined : undefined,
        voucherCode: posVoucherResult?.valid ? posVoucherResult.code : undefined,
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
        },
        { headers: { "X-Idempotency-Key": idempotencyKey } },
      );

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
        if (item.category === "Makanan" || item.category === "Cemilan") {
          hasKitchenItem = true;
        } else if (item.category === "Coffee" || item.category === "Non-Coffee") {
          hasBarItem = true;
        }
        if (hasKitchenItem && hasBarItem) break;
      }
      if (hasKitchenItem) {
        void voice.announce("order_new_kitchen", {
          customerName: voiceCustomerName,
          table: voiceTable,
          dedupKey: `${result.orderNo}-kitchen`,
        });
      }
      if (hasBarItem) {
        void voice.announce("order_new_bar", {
          customerName: voiceCustomerName,
          table: voiceTable,
          dedupKey: `${result.orderNo}-bar`,
        });
      }
      setCompletedReceipt(result.receipt);
      setReceiptHistory((current) =>
        [result.receipt, ...current].slice(0, settings.receiptHistoryMax),
      );
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
      setPaymentError(error instanceof Error ? error.message : "Payment failed.");
    } finally {
      setPaymentPending(false);
    }
  }

  if (!shiftOpen) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center p-3">
        <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
          <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Mulai Shift Kasir</DialogTitle>
              <DialogDescription>
                Pilih shift dan isi uang modal awal.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(event) => void openShift(event)} className="space-y-4">
              <ShiftNumberPicker
                value={openingShiftNumber}
                onChange={setOpeningShiftNumber}
              />
              <OpeningCashPresetPicker value={openingCash} onChange={setOpeningCash} />
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
          <Button
            type="button"
            className="garage-press mt-5 h-11 w-full"
            onClick={prepareShiftDialog}
          >
            Mulai Shift Kasir
          </Button>
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
              {signOutPending ? "Logging out..." : "Logout"}
            </Button>
          </div>
          {signOutError && (
            <Alert className="mt-3 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Logout gagal</AlertTitle>
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
            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#22c55e]/45 bg-[#22c55e]/12 px-3 text-sm text-[#dcfce7]"
                onClick={() => setCashierMenuOpen(false)}
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
                {shiftOpen ? "Shift Aktif / Closing" : "Mulai Shift"}
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
                <Badge className={`${customerOrders.length ? statusClass.pending_cashier : statusClass.info} px-2 text-[10px]`}>
                  {customerOrders.length}
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
                Contacts / Member
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
                Reports Shift
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
                History Penjualan
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
                Catat Pengeluaran
              </Button>
              {canQuickCount ? (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                  onClick={() => {
                    setCashierMenuOpen(false);
                    void openQuickCount();
                  }}
                >
                  <ClipboardCheck className="size-4" />
                  Quick Count Stok
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
                  Settings POS
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
                Voice Announcement
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
                {signOutPending ? "Logging out..." : "Logout"}
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
                {shiftOpen ? "Shift Aktif / Closing" : "Mulai Shift"}
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
                <Badge className={`${customerOrders.length ? statusClass.pending_cashier : statusClass.info} px-2 text-[10px]`}>
                  {customerOrders.length}
                </Badge>
              </Button>
              {([
                ["contacts", Users, "Contacts / Member"],
                ["reports", BarChart3, "Reports Shift"],
                ...(canManagePosSettings
                  ? ([["settings", Settings, "Settings POS"]] as const)
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
                History Penjualan
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
                Catat Pengeluaran
              </Button>
              {canQuickCount ? (
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 justify-start gap-2 border-[#4a4a54] bg-white/[0.055] px-3 text-sm"
                  onClick={() => void openQuickCount()}
                >
                  <ClipboardCheck className="size-4" />
                  Quick Count Stok
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
                Voice Announcement
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
                Refresh POS
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 justify-start gap-2 border-[#d11a2a]/55 bg-[#d11a2a]/14 px-3 text-sm text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                disabled={signOutPending}
                onClick={() => void signOutFromPos()}
              >
                <LogOut className="size-4" />
                {signOutPending ? "Logging out..." : "Logout"}
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
                ? "Contacts / Member"
                : activeCashierToolOpen === "reports"
                  ? "Reports Shift"
                  : "Settings POS"}
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
                    Refresh
                  </Button>
                  {cashSession.id ? (
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
                  <AlertTitle>Report shift gagal</AlertTitle>
                  <AlertDescription>{shiftReportError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Gross sales", currency.format(shiftReportSummary?.sales.gross ?? 0)],
                  ["Cash", currency.format(shiftReportCashTotal)],
                  ["Non-cash", currency.format(shiftReportNonCashTotal)],
                  ["Modal awal", currency.format(cashSession.openingCash)],
                  ["Kas seharusnya", currency.format(cashSession.expectedCash)],
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
                      <p className="text-[10px] text-[#b8b8bf]">Paid</p>
                    </div>
                    <div className="rounded border border-[#f5a742]/35 bg-[#f5a742]/10 p-2">
                      <p className="text-lg font-black text-[#ffd08a]">
                        {customerOrders.length}
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
                            {currency.format(method.total)}
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
                          {currency.format(session.expectedCash)}
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
                      Preset kontras khusus POS kasir, tidak mengubah tema Owner/Admin.
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
                      <Badge className={`${customerOrders.length ? statusClass.pending_cashier : statusClass.info} ml-auto px-2 text-[10px]`}>
                        {customerOrders.length}
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
                    {isFullscreen ? "Fullscreen Aktif" : "Kunci Fullscreen"}
                  </Button>
                </div>
                {fullscreenError ? (
                  <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>Fullscreen gagal</AlertTitle>
                    <AlertDescription>{fullscreenError}</AlertDescription>
                  </Alert>
                ) : null}
              </TabsContent>

              <TabsContent value="printer" className="mt-3 space-y-3">
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
                    {cashierRefreshing ? "Refreshing..." : "Refresh POS"}
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
                <TabsTrigger value="range">Range</TabsTrigger>
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

      {/* Dialog konfirmasi reset meja ke kosong/hijau */}
      <Dialog open={resetTableDialogOpen} onOpenChange={setResetTableDialogOpen}>
        <DialogContent className="border-[#34343c] bg-[#111116] max-w-xs sm:max-w-sm">
          <DialogHeader className="text-left">
            <DialogTitle>Reset Meja {selectedTableToReset?.tableNumber}</DialogTitle>
            <DialogDescription>
              Meja akan ditandai bersih dan siap digunakan. Status berubah menjadi hijau.
            </DialogDescription>
          </DialogHeader>
          {selectedTableToReset?.orderNo && (
            <div className="rounded-md border border-[#d11a2a]/35 bg-[#d11a2a]/10 p-3">
              <p className="text-sm text-[#ffc2c8]">
                <span className="font-semibold">Order aktif: </span>
                {selectedTableToReset.orderNo} ({selectedTableToReset.timerMinutes}m)
              </p>
              <p className="mt-1 text-xs text-[#b8b8bf]">
                Order belum close. Reset meja akan menghilangkan referensi order.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-11 border-[#4a4a54] bg-white/[0.055] text-sm"
              onClick={() => {
                setResetTableDialogOpen(false);
                setSelectedTableToReset(null);
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="garage-press h-11 text-sm"
              disabled={tableLiveLoading}
              onClick={() => {
                if (selectedTableToReset) {
                  void resetTableCleaning(selectedTableToReset.tableNumber);
                }
              }}
            >
              <span className="mr-1.5 size-2 rounded-full bg-white/70" />
              {tableLiveLoading ? "Resetting..." : "Tandai Bersih"}
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
                placeholder="Nama customer"
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
          <VoiceStatusBadge onOpen={() => setVoiceDialogOpen(true)} />
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
          <Button
            type="button"
            variant="outline"
            className={`garage-press h-10 gap-1.5 border-[#d11a2a]/55 bg-[#d11a2a]/14 px-2.5 text-xs text-[#ffe1e5] hover:bg-[#d11a2a]/22 ${
              isCashierKiosk ? "xl:hidden" : ""
            }`}
            disabled={signOutPending}
            onClick={() => void signOutFromPos()}
            aria-label="Logout POS"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">
              {signOutPending ? "Logout..." : "Logout"}
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
              customerOrders.length
                ? "qr-order-notice border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffe0ad] hover:bg-[#f5a742]/20"
                : "border-[#4a4a54] bg-white/[0.055] text-[#d4d4d8] hover:bg-white/[0.09]"
            } ${isCashierKiosk ? "xl:hidden" : ""}`}
            onClick={() => setQrOperationsOpen(true)}
          >
            <Bell className="size-3.5" />
            QR
            <Badge className={`${customerOrders.length ? statusClass.pending_cashier : statusClass.info} px-1.5 text-[10px]`}>
              {customerOrders.length}
            </Badge>
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Refresh POS data"
            className={`garage-press h-10 gap-1.5 border-[#4a4a54] bg-white/[0.055] px-2.5 text-xs text-[#d4d4d8] hover:bg-white/[0.09] ${
              isCashierKiosk ? "xl:hidden" : ""
            }`}
            disabled={cashierRefreshing}
            onClick={() => void refreshCashierData()}
          >
            <RefreshCw className={`size-3.5 ${cashierRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">
              {cashierRefreshing ? "Refresh..." : "Refresh"}
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
              customerOrders.length
                ? "qr-order-notice border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffe0ad] hover:bg-[#f5a742]/20"
                : "border-[#4a4a54] bg-white/[0.055] text-[#d4d4d8] hover:bg-white/[0.09]"
            }`}
            onClick={() => setQrOperationsOpen(true)}
          >
            <Bell className="size-3.5" />
            <span className="hidden sm:inline">QR / Operasional</span>
            <span className="sm:hidden">QR</span>
            <Badge className={`${customerOrders.length ? statusClass.pending_cashier : statusClass.info} px-1.5 text-[10px]`}>
              {customerOrders.length}
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
                aria-label="Open POS actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>POS action</DropdownMenuLabel>
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
              {!isCashierKiosk && (
                <DropdownMenuItem onClick={() => void exitPosToDashboard()}>
                  <BarChart3 className="mr-2 size-4" />
                  Dashboard
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => void onOrderCreated()}>
                <RefreshCw className="mr-2 size-4" />
                Refresh POS
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={signOutPending}
                onClick={() => void signOutFromPos()}
              >
                <LogOut className="mr-2 size-4" />
                {signOutPending ? "Logging out..." : "Logout"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            {signOutPending ? "Logging out..." : "Logout"}
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
                Refresh POS
              </DropdownMenuItem>
              {!isCashierKiosk && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={signOutPending}
                    onClick={() => void signOutFromPos()}
                  >
                    <LogOut className="mr-2 size-4" />
                    {signOutPending ? "Logging out..." : "Sign out"}
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
          <AlertTitle>Logout gagal</AlertTitle>
          <AlertDescription>{signOutError}</AlertDescription>
        </Alert>
      )}

      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {shiftOpen ? "Tutup / Ganti Shift Kasir" : "Mulai Shift Kasir"}
            </DialogTitle>
            <DialogDescription>
              {shiftOpen
                ? "Isi uang aktual, checklist, lalu pilih aksi."
                : "Pilih shift dan isi uang modal awal."}
            </DialogDescription>
          </DialogHeader>
          {shiftOpen ? (
            <form onSubmit={(event) => void closeShift(event)} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <p className="garage-mono text-[10px] text-[#b8b8bf]">Kas seharusnya</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {currency.format(cashSession.expectedCash)}
                  </p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <p className="garage-mono text-[10px] text-[#b8b8bf]">Selisih</p>
                  <p
                    className={`mt-1 text-lg font-semibold ${
                      shiftDiscrepancyPreview === 0 ? "text-[#dcfce7]" : "text-[#ffd08a]"
                    }`}
                  >
                    {shiftDiscrepancyPreview >= 0 ? "+" : ""}
                    {currency.format(shiftDiscrepancyPreview)}
                  </p>
                </div>
              </div>
              {(closeShiftActiveTables.length > 0 || customerOrders.length > 0) && (
                <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffe0ad]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Cek handover</AlertTitle>
                  <AlertDescription>
                    {closeShiftActiveTables.length} meja aktif, {customerOrders.length} QR pending.
                  </AlertDescription>
                </Alert>
              )}
              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                  Uang aktual di laci saat ini
                </p>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={actualCash}
                  onChange={(event) => setActualCash(event.target.value)}
                  className="h-11 border-[#34343c] bg-white/[0.06]"
                />
              </div>
              <div className="space-y-2">
                <p className="garage-mono text-[10px] text-[#b8b8bf]">Checklist tutup shift</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {shiftChecklist.map((item, index) => (
                    <label
                      key={`${item.label}-${index}`}
                      className="flex items-center gap-2 rounded-md border border-[#34343c] bg-white/[0.04] px-3 py-2 text-xs text-[#f4f4f5]"
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(event) =>
                          setShiftChecklist((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, done: event.target.checked }
                                : entry,
                            ),
                          )
                        }
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">Catatan kasir</p>
                <Textarea
                  value={shiftClosingNote}
                  onChange={(event) => setShiftClosingNote(event.target.value)}
                  maxLength={500}
                  placeholder="Contoh: cash kurang Rp 5.000 karena pembulatan kembalian."
                  className="min-h-20 border-[#34343c] bg-white/[0.06]"
                />
              </div>
              <div className="space-y-2">
                <p className="garage-mono text-[10px] text-[#b8b8bf]">Reset meja</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      mode: "none" as const,
                      label: "Tidak",
                    },
                    {
                      mode: "completed" as const,
                      label: "Selesai",
                    },
                    {
                      mode: "all" as const,
                      label: "Semua",
                    },
                  ].map((option) => {
                    const disabled = option.mode === "all" && !canResetAllTablesOnClose;
                    const active = shiftResetTableMode === option.mode;
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        disabled={disabled}
                        onClick={() => setShiftResetTableMode(option.mode)}
                        className={`garage-press h-10 rounded-md border px-2 text-center text-xs font-semibold transition ${
                          active
                            ? "border-[#f5a742] bg-[#f5a742]/18 text-[#fff0cf]"
                            : "border-[#34343c] bg-black/15 text-[#d6d6dc]"
                        } ${disabled ? "cursor-not-allowed opacity-45" : "hover:border-[#f5a742]/70"}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {shiftError && (
                <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Shift gagal</AlertTitle>
                  <AlertDescription>{shiftError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="garage-press h-11 w-full" disabled={shiftPending}>
                {shiftPending ? "Memproses..." : "Tutup Shift"}
              </Button>
            </form>
          ) : (
            <form onSubmit={(event) => void openShift(event)} className="space-y-4">
              <ShiftNumberPicker
                value={openingShiftNumber}
                onChange={setOpeningShiftNumber}
              />
              <OpeningCashPresetPicker value={openingCash} onChange={setOpeningCash} />
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

      {!shiftOpen ? (
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
        </div>
      ) : (
        <>
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
                Order QR masuk langsung muncul di daftar. Pilih Accept, Final Bayar, atau Reject.
              </SheetDescription>
            </SheetHeader>
            <div className="garage-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="garage-panel garage-animate-in rounded-md p-2 sm:p-2.5">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Bell className="size-3.5 text-[#f5a742]" />
                <p className="garage-mono text-[11px] text-[#b8b8bf]">Antrean QR kasir</p>
                <Badge className={`${customerOrders.length ? statusClass.pending_cashier : statusClass.info} px-2 text-[10px]`}>
                  {customerOrders.length ? `${customerOrders.length} baru` : "Kosong"}
                </Badge>
                <span className="hidden text-xs text-[#d6d6dc] md:inline">
                  Order dari scan meja langsung diproses di sini.
                </span>
              </div>
              <p className="mt-1 text-xs text-[#d6d6dc] md:hidden">
                Accept masuk KDS, Final Bayar menutup pembayaran kasir.
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
                        <p className="text-sm font-bold text-white">Print semua QR meja</p>
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
                            src={GARAGE_BRAND_LOGO_SRC}
                            alt="Garage Coffee & Motor"
                            width={GARAGE_BRAND_LOGO_WIDTH}
                            height={GARAGE_BRAND_LOGO_HEIGHT}
                            sizes="112px"
                            className="h-auto w-28 object-contain"
                          />
                          <span className="border border-[#d11a2a] px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#d11a2a]">
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
                          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[#5f554b]">
                            GARAGE Coffee & Motor
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
                          Copy Link
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
                Refresh QR
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
                  <Badge className={`${qrInsights?.shiftReport.gate === "WATCH" ? statusClass.warning : statusClass.ready} shrink-0 px-2 text-[9px]`}>
                    {qrInsights?.shiftReport.gate ?? "Memuat"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {[
                    ["Total", qrInsights ? String(qrInsights.summary.total) : "-"],
                    ["Paid", qrInsights ? String(qrInsights.summary.paid) : "-"],
                    [
                      "Avg",
                      qrInsights?.summary.averageProcessingMinutes == null
                        ? "-"
                        : `${qrInsights.summary.averageProcessingMinutes}m`,
                    ],
                    ["SLA >3m", qrInsights ? String(qrInsights.summary.pendingOverSla) : "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border border-[#303038] bg-black/12 px-2 py-1">
                      <p className="garage-mono text-[9px] uppercase tracking-[0.1em] text-[#8f8f98]">
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
              <AlertTitle>Table map gagal</AlertTitle>
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
                const canReject = canRejectCustomerOrder(order);
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
                          {order.customerName ?? "Customer"} - {order.customerPhone ?? "No WA"}
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
                    {order.customerNote ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#ffd08a]">
                        Catatan: {order.customerNote}
                      </p>
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
                          Accept
                        </Button>
                      ) : null}
                      {canFinalize ? (
                        <Button
                          type="button"
                          size="sm"
                          className="garage-press h-9 flex-[1.4] basis-[120px] bg-[#22c55e] px-2 text-[11px] text-white hover:bg-[#16a34a]"
                          disabled={Boolean(busyAction)}
                          onClick={() => void decideCustomerOrder(order, "paid")}
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
                          onClick={() => void decideCustomerOrder(order, "reject")}
                        >
                          Reject
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
                  const canReject = canRejectCustomerOrder(order);
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
                            {order.customerName ?? "Customer"} - {formatReceiptDate(order.createdAt)}
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
                            Accept
                          </Button>
                        ) : null}
                        {canFinalize ? (
                          <Button
                            type="button"
                            size="sm"
                            className="garage-press h-8 flex-1 basis-[104px] bg-[#22c55e] px-2 text-[11px] text-white hover:bg-[#16a34a]"
                            disabled={Boolean(busyAction)}
                            onClick={() => void decideCustomerOrder(order, "paid")}
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
                            onClick={() => void decideCustomerOrder(order, "reject")}
                          >
                            Reject
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
                    <p className="text-sm font-semibold text-white">History order digital kosong</p>
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
                    Live table map
                  </p>
                  <h3 className="mt-1 text-base font-black text-white">50 meja outlet</h3>
                </div>
                <Badge className={`${tableLiveRows.some((row) => hasOpenTableBill(row) || tableNeedsCleaning(row)) ? statusClass.warning : statusClass.ready} w-fit px-2 text-[10px]`}>
                  {tableLiveRows.filter(tableHasLiveSession).length} aktif
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-10 2xl:grid-cols-[repeat(25,minmax(0,1fr))]">
                {(tableLiveRows.length ? tableLiveRows : tableNumbers.map((table) => ({
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
                } satisfies TableLiveRow))).map((table) => {
                  const isNeedsCleaning = tableNeedsCleaning(table);
                  const isEmpty = table.status === "empty" && !tableHasLiveSession(table);
                  const hasBill = hasOpenTableBill(table);
                  const paidOnly = isPaidOnlyTable(table);
                  const isActive = tableHasLiveSession(table) && !isNeedsCleaning && !paidOnly;
                  const toneClass =
                    hasAwaitingTableBill(table)
                      ? "border-[#f5a742]/65 bg-[#f5a742]/16"
                      : hasBill
                        ? "border-[#f5a742]/65 bg-[#f5a742]/16"
                      : paidOnly
                        ? "border-[#22c55e]/55 bg-[#22c55e]/12"
                        : table.status === "rejected"
                          ? "border-[#d11a2a]/55 bg-[#d11a2a]/12"
                          : isNeedsCleaning
                            ? "border-[#d11a2a]/55 bg-[#d11a2a]/14"
                            : isActive
                              ? "border-[#d4d4d8]/35 bg-white/[0.07]"
                              : "border-[#303038] bg-black/12";
                  return (
                    <button
                      key={table.tableNumber}
                      type="button"
                      className={`garage-press relative min-h-[76px] w-full rounded-md border p-2 text-left transition sm:min-h-[80px] ${toneClass}`}
                      onClick={() => {
                        if (isNeedsCleaning) {
                          setSelectedTableToReset(table);
                          setResetTableDialogOpen(true);
                        } else {
                          setQrInsightFilters((current) => ({
                            ...current,
                            table: table.tableNumber,
                          }));
                          setQrWorkTab("qr_control");
                        }
                      }}
                    >
                      {/* Indicator dot */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="garage-mono text-base font-black text-white sm:text-lg">
                          {table.tableNumber}
                        </span>
                        <span className={`size-2 shrink-0 rounded-full ${
                          hasAwaitingTableBill(table)
                            ? "bg-[#f5a742]"
                            : hasBill
                              ? "bg-[#f5a742]"
                            : paidOnly
                              ? "bg-[#22c55e]"
                              : table.status === "rejected"
                                ? "bg-[#d11a2a]"
                                : isNeedsCleaning
                                  ? "bg-[#d11a2a]"
                                  : isActive
                                    ? "bg-[#d4d4d8]"
                                    : "bg-[#4a4a54]"
                        }`} />
                      </div>

                      {/* Show Bersihkan button for needs_cleaning tables */}
                      {isNeedsCleaning ? (
                        <div className="mt-2 flex flex-col gap-1">
                          <span className="break-normal text-center text-[10px] font-bold uppercase tracking-wide text-[#ffc2c8] sm:text-xs">
                            Perlu Bersih
                          </span>
                          <span className="flex items-center justify-center gap-1 rounded border border-[#22c55e]/55 bg-[#22c55e]/20 px-1 py-0.5 text-[9px] font-bold text-[#dcfce7] sm:text-[10px]">
                            <span className="size-1.5 shrink-0 rounded-full bg-[#22c55e] sm:size-2" />
                            Tap Bersihkan
                          </span>
                        </div>
                      ) : table.orderNo ? (
                        <div className="mt-1.5">
                          <p className="truncate text-[10px] font-semibold leading-tight text-[#d6d6dc] sm:text-[11px]">
                            {tableLiveStatusLabel(table)}
                          </p>
                          <p className="garage-mono mt-0.5 truncate text-[9px] text-[#8f8f98] sm:text-[10px]">
                            {table.orderNo} ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· {table.timerMinutes}m
                          </p>
                        </div>
                      ) : (
                        <div className="mt-1.5">
                          <p className="garage-mono text-[10px] font-semibold text-[#d6d6dc] sm:text-[11px]">
                            {isEmpty ? "Siap" : table.status.replace(/_/g, " ")}
                          </p>
                          <p className="garage-mono mt-0.5 text-[9px] text-[#6f6f78] sm:text-[10px]">
                            {isEmpty ? "Meja kosong" : "Aktif"}
                          </p>
                        </div>
                      )}
                    </button>
                  );
                })}
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
                  <p className="text-sm font-semibold text-white">Meja dan issue QR</p>
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
                      <p className="text-sm font-semibold text-white">Repeat customer</p>
                      <p className="mt-0.5 text-xs text-[#b8b8bf]">Follow-up WhatsApp manual</p>
                    </div>
                    <Badge className={`${statusClass[qrInsights.summary.repeatGuests ? "warning" : "info"]} px-2 text-[10px]`}>
                      {qrInsights.summary.repeatGuests} repeat guest
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
              className="hidden"
            >
              <Bell className="size-4 text-[#f5a742]" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <AlertTitle>{customerOrders.length} QR order menunggu kasir</AlertTitle>
                  <AlertDescription>
                    Detail bisa dibuka dari kartu order. Accept untuk masuk KDS.
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
                  <Badge className={`${customerOrders.length ? statusClass.pending_cashier : statusClass.info} shrink-0 px-2 text-[10px]`}>
                    {customerOrders.length ? `${customerOrders.length} menunggu` : "Kosong"}
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
                      Accept masuk KDS, Paid untuk order yang langsung dibayar.
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
                    Refresh
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
                                <div className="flex min-w-0 items-center gap-2">
                                  <h3 className="truncate text-base font-black text-white">{order.tableLabel}</h3>
                                  <Badge className={`${statusClass[order.orderSource] ?? statusClass.info} shrink-0 px-2 text-[10px]`}>
                                    {order.customerMode}
                                  </Badge>
                                </div>
                                <p className="garage-mono mt-0.5 truncate text-[10px] text-[#8f8f98]">
                                  {order.orderNo}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-[#d0d0d6]">
                                  {order.customerName ?? "Customer"} - {order.customerPhone ?? "No WA"}
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
                              <p className="shrink-0 text-right text-base font-black text-white">
                                {currency.format(order.total)}
                              </p>
                            </div>
                            <div className="mt-3 rounded-md border border-[#303038] bg-black/12 px-3 py-2">
                              <p className="truncate text-xs text-[#d6d6dc]">{itemSummary}</p>
                            </div>
                            {order.customerNote ? (
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#ffd08a]">
                                Catatan: {order.customerNote}
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
                                Accept
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="garage-press h-9 bg-[#22c55e] px-2 text-[11px] text-white hover:bg-[#16a34a]"
                                disabled={Boolean(busyAction)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void decideCustomerOrder(order, "paid");
                                }}
                              >
                                Terima
                              </Button>
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
                                    void decideCustomerOrder(order, "reject");
                                  }}
                                >
                                  Reject
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
                                  void decideCustomerOrder(order, "reject");
                                }}
                              >
                                Reject order
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
                  <Badge className={`${statusClass[selectedCustomerOrder.status] ?? statusClass.pending_cashier} mt-2 px-2 text-[10px]`}>
                    {selectedCustomerOrder.status}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Customer", selectedCustomerOrder.customerName ?? "Customer"],
                  ["WhatsApp", selectedCustomerOrder.customerPhone ?? "No WA"],
                  ["Source", selectedCustomerOrder.orderSource],
                  ["Mode", selectedCustomerOrder.customerMode],
                  ["Campaign", selectedCustomerOrder.campaign ?? "-"],
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
                  {selectedCustomerOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-[#303038] bg-black/12 p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {item.qty}x {item.itemName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[#b8b8bf]">
                          {item.variantLabel !== "Regular" ? item.variantLabel : "Regular"} - {currency.format(item.unitPrice)}
                        </p>
                      </div>
                      <p className="garage-mono shrink-0 text-sm font-semibold text-white">
                        {currency.format(item.lineTotal)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {selectedCustomerOrder.customerNote ? (
                <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
                  <Info className="size-4 text-[#f5a742]" />
                  <AlertTitle>Catatan customer</AlertTitle>
                  <AlertDescription>{selectedCustomerOrder.customerNote}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-3">
                  <p className="text-sm font-semibold text-white">Penjelasan action</p>
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
                    <BillRow label="Service" value={currency.format(selectedCustomerOrder.service)} />
                    <BillRow label="Discount" value={`- ${currency.format(selectedCustomerOrder.discount)}`} />
                    <Separator className="bg-[#34343c]" />
                    <BillRow label="Total" value={currency.format(selectedCustomerOrder.total)} large />
                  </div>
                </div>
              </div>

              {customerOrderNeedsWaiterCash(selectedCustomerOrder) ? (
                <div className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white">Cash meja waiter</p>
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
                        placeholder={`Diterima customer: ${currency.format(selectedCustomerOrder.total)}`}
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

              <div className="flex flex-wrap gap-2">
                {canAcceptCustomerOrder(selectedCustomerOrder) ? (
                  <Button
                    type="button"
                    className="garage-press h-11 flex-1 basis-[140px]"
                    disabled={customerOrderActionId?.startsWith(`${selectedCustomerOrder.id}:`)}
                    onClick={() => void decideCustomerOrder(selectedCustomerOrder, "accept")}
                  >
                    Accept
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
                    onClick={() => void decideCustomerOrder(selectedCustomerOrder, "paid")}
                  >
                    Finalkan Pembayaran
                  </Button>
                ) : null}
                {canRejectCustomerOrder(selectedCustomerOrder) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 flex-1 basis-[140px] border-[#4a4a54]"
                    disabled={customerOrderActionId?.startsWith(`${selectedCustomerOrder.id}:`)}
                    onClick={() => void decideCustomerOrder(selectedCustomerOrder, "reject")}
                  >
                    Reject
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
                    className="h-9 border-[#34343c] bg-white/[0.06] pl-9"
                    placeholder="Cari menu, kategori, varian"
                  />
                </div>
                <div className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-[#34343c] bg-white/[0.06] px-3 md:w-[190px]">
                  <CreditCard className="size-4 shrink-0 text-[#f5a742]" />
                  <div className="min-w-0">
                    <p className="garage-mono truncate text-[9px] uppercase tracking-[0.14em] text-[#8f8f98]">
                      Checkout
                    </p>
                    <p className="truncate text-xs font-semibold text-white">
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
                        className={`shrink-0 ${
                          active
                            ? "bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                            : "border-[#4a4a54] bg-white/[0.06] text-[#d4d4d8]"
                        }`}
                        onClick={() => setMenuCategory(group)}
                      >
                        {isAll
                          ? "Semua"
                          : group === "Dapur"
                            ? "ðŸ´ Dapur"
                            : "â˜• Bar"}
                      </Button>
                    );
                  })}
                  {/* Filter Bestseller â€” toggle untuk highlight top items */}
                  <Button
                    type="button"
                    size="sm"
                    variant={bestsellerOnly ? "default" : "outline"}
                    className={`shrink-0 ${
                      bestsellerOnly
                        ? "border-[#f5a742]/55 bg-[#f5a742] text-black hover:bg-[#ffc167]"
                        : "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a] hover:bg-[#f5a742]/22"
                    }`}
                    onClick={() => setBestsellerOnly((v) => !v)}
                  >
                    â­ Bestseller
                  </Button>
                </div>
                {(menuCategory === "Dapur" ||
                  menuCategory === "Makanan" ||
                  menuCategory === "Cemilan") && (
                  <div className="garage-scroll-x flex gap-1.5 pb-0.5">
                    <span className="self-center font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                      Dapur:
                    </span>
                    {menuSubCategories.Dapur.map((sub) => {
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
                {(menuCategory === "Bar" ||
                  menuCategory === "Coffee" ||
                  menuCategory === "Non-Coffee") && (
                  <div className="garage-scroll-x flex gap-1.5 pb-0.5">
                    <span className="self-center font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                      Bar:
                    </span>
                    {menuSubCategories.Bar.map((sub) => {
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
                  const isSoldOut = soldOutIds.has(item.id);

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
                          ) : (
                            <Badge className={`${statusClass[item.stock]} shrink-0 px-1.5 text-[10px]`}>
                              {item.stock}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-auto pt-2.5">
                          <p className="pos-product-price truncate text-[15px] font-semibold text-white sm:text-base">
                            {priceRange}
                          </p>
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
                <h2 className="garage-display garage-chrome mt-0.5 truncate text-2xl leading-none">
                  {tableLabel}
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
                    Add-On Session
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge className="garage-mono h-7 border-[#d11a2a]/45 bg-[#d11a2a]/14 px-2.5 text-[11px] text-white">
                  {orderType}
                </Badge>
                {/* Parked orders list â€” badge dengan count, klik buka dialog */}
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={`garage-press relative size-8 ${
                    parkedOrders.length > 0
                      ? "border-[#f5a742]/65 bg-[#f5a742]/12 text-[#ffd79a]"
                      : "border-[#4a4a54]"
                  }`}
                  onClick={() => setParkedListOpen(true)}
                  aria-label="Lihat parked orders"
                  title={`${parkedOrders.length} parked bill`}
                >
                  <Archive className="size-3.5" />
                  {parkedOrders.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[#f5a742] text-[9px] font-bold text-black">
                      {parkedOrders.length}
                    </span>
                  )}
                </Button>
                {/* Park current bill button */}
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="garage-press size-8 border-[#4a4a54]"
                  disabled={!cartLines.length}
                  onClick={() => {
                    setParkLabel("");
                    setParkDialogOpen(true);
                  }}
                  aria-label="Park bill saat ini"
                  title="Park bill (simpan sementara)"
                >
                  <PauseCircle className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="garage-press size-8 border-[#4a4a54] md:hidden"
                  onClick={() => setBillOpen(false)}
                  aria-label="Tutup bill"
                >
                  <span className="text-lg leading-none">x</span>
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="garage-press size-8 border-[#4a4a54]"
                  disabled={!cartLines.length}
                  onClick={() => setClearCartOpen(true)}
                  aria-label="Hapus keranjang"
                >
                  <Trash2 className="size-3.5" />
                </Button>
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
                          <p className="pos-cart-title truncate text-[15px] font-semibold leading-5 text-white">
                            {line.item.name}
                          </p>
                          <p className="pos-cart-meta mt-0.5 truncate text-xs text-[#c8c8cc]">
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
                        <p className="pos-muted-label garage-mono text-[11px] text-[#8f8f99]">
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
                  <p className="mt-3 text-sm font-semibold text-white">Cart kosong</p>
                  <p className="mt-1 max-w-52 text-xs text-[#b8b8bf]">
                    Tap menu untuk mulai membuat bill.
                  </p>
                </div>
              )}
            </div>

              <div className="pos-bill-footer mt-auto shrink-0 rounded-md border border-[#3a3a42] bg-[#18181f] p-2.5 shadow-[0_-16px_46px_rgba(0,0,0,0.28)]">
              <div className="pos-voucher-box mb-2 rounded-md border border-[#34343c] bg-[#111116] p-2">
                <div className="flex gap-2">
                  <Input
                    value={posVoucherCode}
                    onChange={(event) => {
                      setPosVoucherCode(event.target.value.toUpperCase());
                      setPosVoucherResult(null);
                    }}
                    placeholder="Kode voucher"
                    className="h-9 border-[#34343c] bg-white/[0.06] text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-9 shrink-0 border-[#4a4a54] px-3 text-xs"
                    disabled={posVoucherBusy || !subtotal}
                    onClick={() => void validatePosVoucher()}
                  >
                    {posVoucherBusy ? "Cek..." : "Cek"}
                  </Button>
                </div>
                {posVoucherResult ? (
                  <p
                    className={`mt-1 text-[10px] ${
                      posVoucherResult.valid ? "text-[#86efac]" : "text-[#ffc2c8]"
                    }`}
                  >
                    {posVoucherResult.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1 text-sm">
                <BillRow label="Subtotal" value={currency.format(subtotal)} />
                <BillRow label={`Service ${serviceChargePct}%`} value={currency.format(service)} />
                <BillRow label={`PB1 ${taxPct}%`} value={currency.format(tax)} />
                {voucher > 0 ? (
                  <BillRow label="Voucher" value={`- ${currency.format(voucher)}`} accent />
                ) : null}
                {manualDiscountAmount > 0 ? (
                  <BillRow
                    label={`Diskon kasir${manualDiscount?.type === "percent" ? ` ${manualDiscount.rawValue}%` : ""}`}
                    value={`- ${currency.format(manualDiscountAmount)}`}
                    accent
                  />
                ) : null}
              </div>

              <div
                className={`mt-2 flex items-center justify-between gap-2 rounded-md border p-2 ${
                  manualDiscountAwaitingApproval
                    ? "border-[#f5a742]/55 bg-[#f5a742]/10"
                    : "border-[#34343c] bg-[#111116]"
                }`}
              >
                <div className="min-w-0">
                  <p className="garage-mono text-[10px] uppercase tracking-wide text-[#b8b8bf]">
                    Diskon Kasir
                  </p>
                  {manualDiscount ? (
                    <>
                      <p className="truncate text-[11px] font-semibold text-[#ffd08a]">
                        {manualDiscount.type === "percent"
                          ? `${manualDiscount.rawValue}% Â· ${manualDiscount.reason}`
                          : `${currency.format(manualDiscount.amount)} Â· ${manualDiscount.reason}`}
                      </p>
                      {manualDiscountAwaitingApproval ? (
                        <p className="text-[10px] font-semibold text-[#ffd79a]">
                          Menunggu approval supervisorâ€¦
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-[10px] text-[#8f8f99]">
                      Tap untuk potongan goodwill / persetujuan kasir
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-8 border-[#4a4a54] px-2.5 text-[11px]"
                    onClick={openManualDiscountDialog}
                    disabled={!cartLines.length}
                  >
                    <Percent className="mr-1 size-3" />
                    {manualDiscount ? "Ubah" : "Atur"}
                  </Button>
                  {manualDiscount ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-8 border-[#d11a2a]/45 bg-[#d11a2a]/14 px-2 text-[#ffe1e5]"
                      onClick={clearManualDiscount}
                      aria-label="Hapus diskon kasir"
                    >
                      <X className="size-3" />
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="pos-total-box mt-2 rounded-md border border-[#4a4a54] bg-[#0f0f14] p-2.5">
                <BillRow label="Total due" value={currency.format(totalDue)} large />
                {/* Split bill button â€” display calculator untuk bagi rata. */}
                {totalDue > 0 && cartLines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSplitPeopleCount("2");
                      setSplitBillOpen(true);
                    }}
                    className="pos-split-bill-button mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-[#34343c] bg-white/[0.03] py-1.5 text-[11px] text-[#8f8f99] transition-colors hover:border-[#f5a742]/45 hover:bg-[#f5a742]/8 hover:text-[#ffd79a]"
                  >
                    <Users className="size-3" />
                    Bagi rata (split bill)
                  </button>
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
                <DialogContent
                  data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
                  className="flex max-h-[92svh] flex-col overflow-hidden sm:max-w-3xl"
                >
                  <DialogHeader>
                    <DialogTitle>
                      {paymentStep === "done" ? "Transaksi selesai" : "Checkout POS"}
                    </DialogTitle>
                    <DialogDescription>
                      {paymentStep === "done"
                        ? cashierPosSettings.receiptPrintMode === "auto"
                          ? "Struk thermal otomatis dicetak setelah transaksi selesai."
                          : "Transaksi selesai. Cetak struk tersedia dari tombol manual."
                        : "Selesaikan order kasir dari ringkasan, meja, customer, lalu pembayaran."}
                    </DialogDescription>
                  </DialogHeader>
                  {paymentStep === "done" && completedReceipt ? (
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
                                  {method}
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
                            <AlertTitle>Payment gagal</AlertTitle>
                            <AlertDescription>{paymentError}</AlertDescription>
                          </Alert>
                        )}
                        {paymentResult && (
                          <Alert className="border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#f4f4f5]">
                            <Check className="size-4" />
                            <AlertTitle>Payment recorded</AlertTitle>
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
                              Lanjut Customer
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
                          {paymentStep === "payment" ? (
                            <Button
                              className="garage-press h-11 text-base font-semibold sm:min-w-44"
                              disabled={paymentPending || !cartLines.length || !checkoutReady}
                              onClick={() => void submitOrder(selectedPaymentMethod)}
                            >
                              {paymentPending ? "Mencatat..." : "Konfirmasi Bayar"}
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
              Park Bill Saat Ini
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
                {cartLines.length} item Â· {currency.format(estimateCartTotal(cart))}
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
                placeholder={`Misal: Budi T-04, Customer biru, dll`}
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
                Park Sekarang
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
              Bill yang sedang ditahan. Klik Resume untuk lanjutkan transaksi.
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
                          {parked.itemCount} item Â·{" "}
                          {currency.format(parked.estimatedTotal)} Â·{" "}
                          {ageMinutes === 0 ? "baru saja" : `${ageMinutes}m lalu`}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[#8f8f99]">
                          {parked.orderType === "dine-in" &&
                          parked.selectedTableNumber
                            ? `Meja ${parked.selectedTableNumber}`
                            : parked.orderType}
                          {parked.posCustomerMode === "member" &&
                            parked.memberPhone &&
                            ` Â· Member ${parked.memberPhone}`}
                          {parked.posCustomerMode === "guest" &&
                            parked.guestName &&
                            ` Â· ${parked.guestName}`}
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
                          Resume
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="garage-press h-8 border-[#d11a2a]/45 bg-[#d11a2a]/10 px-2 text-[#ffc2c8]"
                          onClick={() => {
                            if (
                              window.confirm(`Hapus parked bill "${parked.label}"?`)
                            ) {
                              deleteParkedOrder(parked.id);
                            }
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
              Auto-hapus saat browser cache clear Â· max 20 bill
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
                      Ã— {count} orang = {currency.format(totalRounded)}
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
                  Fullscreen menjaga layar kasir tetap fokus saat transaksi berjalan.
                  Cetak struk dilakukan manual setelah pembayaran selesai.
                </p>
              </div>
            </div>
            {fullscreenError && (
              <Alert className="mt-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Fullscreen gagal</AlertTitle>
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
                <h2 className="garage-display garage-chrome text-2xl">Kasir locked</h2>
                <p className="mt-1 text-sm leading-6 text-[#d6d6dc]">
                  Masukkan PIN lock POS untuk membuka kasir.
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
                placeholder="PIN lock POS"
              />
              {lockError && (
                <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Unlock gagal</AlertTitle>
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
                {signOutPending ? "Logging out..." : "Sign out"}
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
                  ? "Persen diskon (1â€“100)"
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

      {/* Dialog: Atur Stok Habis */}
      <Dialog open={soldOutDialogOpen} onOpenChange={setSoldOutDialogOpen}>
        <DialogContent
          data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
          className="flex max-h-[88svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-xl"
        >
          <DialogHeader>
            <DialogTitle>Atur Stok Habis</DialogTitle>
            <DialogDescription>
              Tandai item yang habis supaya terkunci di POS dan Menu Digital QR
              semua customer.
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
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => void updateSoldOutStock(item.id, !isSoldOut)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition ${
                      isSoldOut
                        ? "border-[#d11a2a]/55 bg-[#d11a2a]/14"
                        : "border-[#34343c] bg-white/[0.04] hover:bg-white/[0.08]"
                    } disabled:cursor-wait disabled:opacity-70`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {item.name}
                      </p>
                      <p className="truncate text-[11px] text-[#b8b8bf]">
                        {item.category} Â· {item.section}
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
                );
              });
            })()}
          </div>
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
              riwayat penjualan lengkap, gunakan menu History Penjualan.
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
                          {receipt.orderNo} Â· {receipt.tableLabel}
                        </p>
                        <p className="text-[11px] text-[#b8b8bf]">
                          {formatReceiptDate(receipt.createdAt)} Â·{" "}
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
                      {canVoidOrder ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="garage-press h-9 border-[#d11a2a]/45 bg-[#d11a2a]/14 px-3 text-xs text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                          onClick={() => void voidReceiptOrder(receipt)}
                          disabled={voidingReceiptId === receipt.invoiceNo}
                        >
                          {voidingReceiptId === receipt.invoiceNo ? (
                            <>
                              <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                              Void...
                            </>
                          ) : (
                            <>
                              <Ban className="mr-1.5 size-3.5" />
                              Void
                            </>
                          )}
                        </Button>
                      ) : canRequestVoidApproval ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="garage-press h-9 border-[#f5a742]/45 bg-[#f5a742]/14 px-3 text-xs text-[#ffd79a] hover:bg-[#f5a742]/22"
                          onClick={() => void requestVoidReceiptApproval(receipt)}
                          disabled={voidingReceiptId === receipt.invoiceNo}
                        >
                          {voidingReceiptId === receipt.invoiceNo ? (
                            <>
                              <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                              Mengajukan...
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="mr-1.5 size-3.5" />
                              Minta Void
                            </>
                          )}
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

      {/* Dialog: Catat Pengeluaran (kasbon kasir) */}
      <Dialog
        open={expenseDialogOpen}
        onOpenChange={(open) => {
          setExpenseDialogOpen(open);
          if (!open) setExpenseError(null);
        }}
      >
        <DialogContent
          data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
          className="border-[#34343c] bg-[#111116] sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Catat Pengeluaran Kasir</DialogTitle>
            <DialogDescription>
              Kasbon dari laci kasir selama shift. Tercatat ke Finance &
              memengaruhi rekonsiliasi kas saat closing shift.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitExpense();
            }}
          >
            <div>
              <p className="garage-mono mb-1.5 text-[10px] text-[#b8b8bf]">
                Kategori
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    "Kasbon",
                    "Beli Air",
                    "Beli Tisu",
                    "Transport",
                    "Konsumsi Staff",
                    "Lain-lain",
                  ] as const
                ).map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    variant="outline"
                    className={`garage-press h-9 px-2 text-[11px] ${
                      expenseCategory === cat
                        ? "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd08a]"
                        : "border-[#4a4a54] bg-white/[0.055]"
                    }`}
                    onClick={() => setExpenseCategory(cat)}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                Deskripsi (wajib)
              </p>
              <Input
                value={expenseDescription}
                onChange={(event) =>
                  setExpenseDescription(event.target.value.slice(0, 180))
                }
                placeholder="mis. Beli galon Aqua, isi parkir, beli kantong plastik"
                className="h-11 border-[#34343c] bg-white/[0.06]"
                maxLength={180}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                  Nominal (Rp)
                </p>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={expenseAmount}
                  onChange={(event) => setExpenseAmount(event.target.value)}
                  placeholder="50000"
                  className="h-11 border-[#34343c] bg-white/[0.06]"
                />
              </div>
              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                  Metode bayar
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {(["Cash", "QRIS"] as const).map((method) => (
                    <Button
                      key={method}
                      type="button"
                      variant="outline"
                      className={`garage-press h-11 px-2 text-xs ${
                        expensePaymentMethod === method
                          ? "border-[#22c55e]/55 bg-[#22c55e]/14 text-[#dcfce7]"
                          : "border-[#4a4a54] bg-white/[0.055]"
                      }`}
                      onClick={() => setExpensePaymentMethod(method)}
                    >
                      {method}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                Catatan (opsional)
              </p>
              <Input
                value={expenseNote}
                onChange={(event) =>
                  setExpenseNote(event.target.value.slice(0, 200))
                }
                placeholder="Detail tambahan untuk audit"
                className="h-11 border-[#34343c] bg-white/[0.06]"
                maxLength={200}
              />
            </div>
            {Number(expenseAmount) >= 1_000_000 ? (
              <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Butuh approval manager</AlertTitle>
                <AlertDescription>
                  Pengeluaran â‰¥ Rp 1.000.000 otomatis masuk antrian approval
                  sebelum tercatat permanen.
                </AlertDescription>
              </Alert>
            ) : null}
            {expenseError ? (
              <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Pengeluaran</AlertTitle>
                <AlertDescription>{expenseError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
                onClick={() => setExpenseDialogOpen(false)}
                disabled={expensePending}
              >
                Batal
              </Button>
              <Button
                type="submit"
                className="garage-press h-10"
                disabled={expensePending}
              >
                {expensePending ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 size-4" />
                    Simpan
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Quick Count Stok (POS â€” manager/gudang/supervisor) */}
      <Dialog
        open={quickCountOpen}
        onOpenChange={(open) => {
          setQuickCountOpen(open);
          if (!open) {
            setQuickCountError(null);
            setQuickCountResult(null);
          }
        }}
      >
        <DialogContent
          data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
          className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle>Quick Count Stok</DialogTitle>
            <DialogDescription>
              Hitung cepat stok fisik dari POS. Input qty fisik per item; sistem
              hitung selisih & log movement saat submit.
            </DialogDescription>
          </DialogHeader>

          {quickCountResult ? (
            <div className="space-y-3">
              <Alert
                className={
                  quickCountResult.failed > 0
                    ? "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]"
                    : "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]"
                }
              >
                {quickCountResult.failed > 0 ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <Check className="size-4" />
                )}
                <AlertTitle>Quick count selesai</AlertTitle>
                <AlertDescription>
                  {quickCountResult.success} item berhasil diupdate
                  {quickCountResult.failed > 0
                    ? `, ${quickCountResult.failed} gagal.`
                    : "."}
                </AlertDescription>
              </Alert>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
                  onClick={() => {
                    setQuickCountResult(null);
                    setQuickCountDraft({});
                    void openQuickCount();
                  }}
                >
                  Count lagi
                </Button>
                <Button
                  type="button"
                  className="garage-press h-10"
                  onClick={() => setQuickCountOpen(false)}
                >
                  Tutup
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={quickCountQuery}
                  onChange={(event) => setQuickCountQuery(event.target.value)}
                  className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
                  placeholder="Cari item untuk di-count..."
                />
              </div>

              <div className="garage-scroll min-h-[200px] flex-1 overflow-auto rounded-md border border-[#34343c] bg-black/10">
                {quickCountLoading ? (
                  <p className="py-8 text-center text-xs text-[#8f8f99]">
                    Memuat inventory...
                  </p>
                ) : (
                  (() => {
                    const q = quickCountQuery.trim().toLowerCase();
                    const filtered = quickCountItems.filter((item) =>
                      q
                        ? `${item.name} ${item.sku} ${item.category}`
                            .toLowerCase()
                            .includes(q)
                        : true,
                    );
                    if (!filtered.length) {
                      return (
                        <p className="py-8 text-center text-xs text-[#8f8f99]">
                          Tidak ada item.
                        </p>
                      );
                    }
                    return (
                      <Table className="min-w-[560px]">
                        <TableHeader className="sticky top-0 z-10 bg-[#1b1b21]">
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Sistem</TableHead>
                            <TableHead className="text-right">Fisik</TableHead>
                            <TableHead className="text-right">Selisih</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((item) => {
                            const draftStr = quickCountDraft[item.sku] ?? "";
                            const draftNum = Number(draftStr);
                            const hasInput =
                              draftStr !== "" && Number.isFinite(draftNum);
                            const delta = hasInput ? draftNum - item.onHand : 0;
                            return (
                              <TableRow key={item.sku}>
                                <TableCell className="min-w-[200px]">
                                  <p className="text-sm font-medium text-white">
                                    {item.name}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {item.sku} Â· {item.category}
                                  </p>
                                </TableCell>
                                <TableCell className="text-right text-zinc-200">
                                  {item.onHand} {item.unit}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    value={draftStr}
                                    onChange={(event) =>
                                      setQuickCountDraft((current) => ({
                                        ...current,
                                        [item.sku]: event.target.value,
                                      }))
                                    }
                                    placeholder="â€”"
                                    className="ml-auto h-9 w-24 border-[#34343c] bg-white/[0.06] text-right"
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  {hasInput ? (
                                    <span
                                      className={`garage-mono text-sm font-semibold ${
                                        delta === 0
                                          ? "text-[#86efac]"
                                          : delta > 0
                                            ? "text-[#7dd3fc]"
                                            : "text-[#ffc2c8]"
                                      }`}
                                    >
                                      {delta > 0 ? "+" : ""}
                                      {delta}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-[#8f8f99]">
                                      â€”
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    );
                  })()
                )}
              </div>

              {quickCountError ? (
                <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Quick count</AlertTitle>
                  <AlertDescription>{quickCountError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-xs text-[#b8b8bf]">
                  <span className="garage-mono text-[#ffd08a]">
                    {
                      Object.values(quickCountDraft).filter(
                        (v) => v !== "" && Number.isFinite(Number(v)),
                      ).length
                    }
                  </span>{" "}
                  item siap submit
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
                    onClick={() => setQuickCountOpen(false)}
                    disabled={quickCountSubmitting}
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    className="garage-press h-10"
                    onClick={() => void submitQuickCount()}
                    disabled={
                      quickCountSubmitting ||
                      Object.values(quickCountDraft).filter(
                        (v) => v !== "" && Number.isFinite(Number(v)),
                      ).length === 0
                    }
                  >
                    {quickCountSubmitting ? (
                      <>
                        <RefreshCw className="mr-2 size-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 size-4" />
                        Submit
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PaymentWizardProgress({ step }: { step: PaymentStep }) {
  const steps: Array<{ id: PaymentStep; label: string; shortLabel: string }> = [
    { id: "summary", label: "Ringkasan", shortLabel: "Ringkas" },
    { id: "table", label: "Meja", shortLabel: "Meja" },
    { id: "customer", label: "Customer", shortLabel: "Cust." },
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
            <p className="garage-mono text-[9px]">Step {index + 1}</p>
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
          <p className="garage-mono text-[10px] text-[#b8b8bf]">Total due</p>
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
        <BillRow label={`Service ${serviceChargePct}%`} value={currency.format(service)} />
        <BillRow label={`PB1 ${taxPct}%`} value={currency.format(tax)} />
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

          <div className="garage-scroll mt-3 grid max-h-52 grid-cols-5 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-10">
            {tablePickerRows.map((table) => {
              const selected = table.tableNumber === selectedTableNumber;
              const availability = tableAvailabilityState(table, tableLiveDataReady);

              return (
                <button
                  key={table.tableNumber}
                  type="button"
                  className={`garage-press min-h-14 rounded-md border p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5a742]/70 ${
                    selected
                      ? "border-[#f5a742]/80 bg-[#f5a742]/12 text-white ring-2 ring-[#f5a742]/55"
                      : availability === "ready"
                        ? "border-[#22c55e]/50 bg-[#22c55e]/10 text-[#dcfce7]"
                        : availability === "paid"
                          ? "border-[#22c55e]/55 bg-[#22c55e]/12 text-[#dcfce7]"
                        : availability === "bill"
                          ? "border-[#f5a742]/55 bg-[#f5a742]/12 text-[#ffd08a]"
                        : availability === "cleaning" || availability === "full"
                          ? "border-[#d11a2a]/55 bg-[#d11a2a]/12 text-[#ffc2c8]"
                          : "border-[#303038] bg-black/16 text-[#d4d4d8]"
                  }`}
                  disabled={paymentPending}
                  onClick={() => onTableChange(table.tableNumber)}
                  aria-label={`Pilih Meja ${table.tableNumber}`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="garage-mono text-sm font-black">{table.tableNumber}</span>
                    <span className="pos-table-indicator" data-state={availability} aria-hidden="true" />
                  </span>
                  <span className="mt-1 block truncate text-[9px] font-semibold leading-3">
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
// Kalau meja kosong â†’ tampilkan card hijau "siap dipakai".
// Kalau meja butuh dibersihkan â†’ card merah "perlu cleaning".
// Kalau meja punya session aktif (sudah ada order) â†’ card amber
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

  // Status "empty" + tidak butuh cleaning â†’ green ready card
  if (status === "empty" && !row.needsCleaning) {
    return (
      <div className="mt-3 rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 p-3">
        <div className="flex items-center gap-2">
          <Check className="size-4 text-[#86efac]" />
          <p className="garage-mono text-[11px] uppercase tracking-wide text-[#86efac]">
            {tableLabel} siap dipakai
          </p>
        </div>
        <p className="mt-1 text-xs text-[#dcfce7]">
          Meja kosong dan bersih. Lanjut ke step berikutnya.
        </p>
      </div>
    );
  }

  // Needs cleaning â†’ red warning
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
    const customerName = row.customerName?.trim() || "Guest";
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
              <span className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/14 px-1.5 py-0.5 font-mono text-[9px] text-[#ffd79a]">
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
              <p className="text-[10px] text-[#8f8f99]">Order No</p>
              <p className="garage-mono text-sm font-semibold text-white">
                {row.orderNo ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#8f8f99]">Customer</p>
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
          Guest Customer
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
            Guest customer
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">Nama opsional</p>
              <Input
                value={guestName}
                onChange={(event) => onGuestNameChange(event.target.value)}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                placeholder="Nama customer"
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
                  <p className="garage-mono text-[9px] text-[#8f8f99]">Points</p>
                  <p className="text-xs font-semibold text-white">
                    {selectedMember.member.totalPoints}
                  </p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
                  <p className="garage-mono text-[9px] text-[#8f8f99]">Multiplier</p>
                  <p className="text-xs font-semibold text-white">
                    x{selectedMember.member.multiplier}
                  </p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
                  <p className="garage-mono text-[9px] text-[#8f8f99]">Estimasi</p>
                  <p className="text-xs font-semibold text-[#ffd08a]">+{estimatedMemberPoints}</p>
                </div>
              </div>
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
// UX: default collapsed (cuma tombol "+ Catatan" kecil). Klik â†’ expand input.
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
          ðŸ“ Catatan untuk dapur
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
      <p className="mt-1 text-right text-[9px] text-[#8f8f99]">{draft.length}/120</p>
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
          <p className="garage-mono text-[12px] tracking-wide">UANG DITERIMA DARI CUSTOMER</p>
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
              {cashPaymentReady ? "KEMBALIAN UNTUK CUSTOMER" : "UANG MASIH KURANG"}
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
            label={cashPaymentReady ? "Kembalian customer" : "Sisa kurang"}
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
}: {
  imagePath: string;
  imageReady: boolean;
  paymentReference: string;
  onImageReadyChange: (ready: boolean) => void;
  onPaymentReferenceChange: (value: string) => void;
  totalDue?: number;
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
      <div className="mt-3">
        <p className="garage-mono mb-1">Referensi opsional</p>
        <Input
          value={paymentReference}
          onChange={(event) => onPaymentReferenceChange(event.target.value)}
          className="h-10 border-[#34343c] bg-white/[0.06]"
          placeholder="Kode/ref pembayaran QRIS"
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
        <p className="garage-mono">Bank transfer</p>
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

  const handlePrint = useCallback(async () => {
    setPrintStatus("printing");
    setPrintError("");
    try {
      const res = await fetch("/api/print/thermal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt,
          printerName: receipt.settings?.defaultPrinterName || undefined,
          copies: receipt.settings?.receiptCopies,
        }),
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

      // Bangun manual: normalisasi nomor (0xxx â†’ 62xxx) + template ringkas
      const normalized = normalizeWaNumber(trimmed);
      const lines = [
        `Invoice GARAGE Coffee & Motor`,
        `Order: ${receipt.orderNo}`,
        `Total: ${currency.format(receipt.total)}`,
      ];
      if (invoiceWebUrl) {
        lines.push(``);
        lines.push(`Invoice & tracking:`);
        lines.push(invoiceWebUrl);
      }
      lines.push(``);
      lines.push(`Terima kasih sudah mampir ke GARAGE.`);
      const text = encodeURIComponent(lines.join("\n"));
      return `https://wa.me/${normalized}?text=${text}`;
    },
    [
      invoiceWebUrl,
      receipt.customer?.phone,
      receipt.orderNo,
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
        <div className="flex items-center gap-2 rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/12 p-3">
          <X className="size-4 text-[#ffc2c8]" />
          <span className="flex-1 text-sm text-[#ffc2c8]">{printError}</span>
          <button onClick={handlePrint} className="text-xs text-[#f5a742] underline">Coba lagi</button>
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
              âœ“ Terkirim
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
                Copy Link Invoice
              </>
            )}
          </Button>
        </div>

        {hasInvoiceLink && (
          <button
            type="button"
            onClick={handleOpenInvoice}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-[#34343c] py-2 text-xs text-[#8f8f99] transition-colors hover:border-[#4a4a54] hover:text-[#d6d6dc]"
          >
            <ExternalLink className="size-3.5" />
            Buka halaman invoice di tab baru
          </button>
        )}
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

// Format tampilan: 6281234567890 â†’ +62 812-3456-7890
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
  const brandTagline = receipt.settings?.brandTagline || "Coffee & Motor";
  const footer = receipt.settings?.receiptFooter || "Terima kasih sudah mampir ke GARAGE.";

  return (
    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-4">
      {receipt.isReprint ? (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-md border border-[#f5a742]/55 bg-[#f5a742]/14 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#ffd08a]">
          <Printer className="size-3.5" />
          Cetak Ulang Â· {formatReceiptDate(receipt.reprintAt ?? new Date().toISOString())}
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
        <BillRow label={serviceLabel} value={currency.format(receipt.service)} />
        {receipt.tax > 0 ? (
          <BillRow label={taxLabel} value={currency.format(receipt.tax)} />
        ) : null}
        {receipt.discount > 0 ? (
          <BillRow label="Discount" value={`- ${currency.format(receipt.discount)}`} />
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
  const brandTagline = receipt.settings?.brandTagline || "Coffee & Motor";
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
        <ReceiptPrintRow label={serviceLabel} value={receipt.service} />
        {receipt.tax > 0 ? (
          <ReceiptPrintRow label={taxLabel} value={receipt.tax} />
        ) : null}
        {receipt.discount > 0 ? (
          <ReceiptPrintRow label="Discount" value={-receipt.discount} />
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

