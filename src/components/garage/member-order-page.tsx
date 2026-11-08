"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  Bike,
  ChefHat,
  ChevronUp,
  CheckCircle2,
  Clock,
  Coffee,
  FileText,
  Landmark,
  LogIn,
  UtensilsCrossed,
  MessageCircle,
  Package,
  PackageCheck,
  Plus,
  QrCode,
  ReceiptText,
  Search,
  Send,
  ShoppingBag,
  TicketPercent,
  User,
  MapPin,
} from "lucide-react";

import { AyaFloatingPet, requestAyaChirp, type LaneX } from "@/components/garage/aya/aya-floating-pet";
import { AyaGreeting } from "@/components/garage/order/aya-greeting";
import { AyaGuideBubble, useAyaOrderGuide } from "@/components/garage/order/aya-order-guide";
import { CategoryNav, type CategoryTab } from "@/components/garage/order/category-nav";
import {
  MENU_GRID_CLASS,
  MenuCardSkeleton,
} from "@/components/garage/order/menu-card";
import {
  MenuSectionList,
  buildMenuGroups,
  categorySectionId,
} from "@/components/garage/order/menu-section-list";
import "@/components/garage/order/v5/order-v5.css";
import { HeaderV5 } from "@/components/garage/order/v5/header-v5";
import { HeroV5, heroPhotoItems } from "@/components/garage/order/v5/hero-v5";
import {
  AyaCardV5,
  BottomNavV5,
  CategoryTilesV5,
  FilterChipsV5,
  SidebarV5,
  useActiveSection,
  type BottomNavTab,
  type CategoryLink,
} from "@/components/garage/order/v5/layout-v5";
import { MENU_GRID_V5, MENU_LIST_V5, MenuCardV5 } from "@/components/garage/order/v5/menu-card-v5";
import { CHIP_LABEL, availableChips, categoryPhoto, filterByChip, heroCtaLabel, type MenuChip } from "@/components/garage/order/v5/menu-v5-model";
import { decodeDaftar, encodeDaftar, readSavedCart, savedCartKey, writeSavedCart } from "@/components/garage/order/v5/saved-cart";
import { QuickViewV5 } from "@/components/garage/order/v5/quick-view-v5";
import { DaftarListV5, DaftarSheetV5, DaftarSummaryV5, ShowToWaiterSheetV5 } from "@/components/garage/order/v5/daftar-pilihan-v5";
import { useMenuFavorites } from "@/components/garage/order/v5/use-menu-favorites";
import { flyToList, playMenuSfx } from "@/components/garage/order/v5/menu-feedback";
import { AyaChatV5 } from "@/components/garage/order/v5/aya-chat-v5";
import type { AyaNav } from "@/components/garage/order/v5/aya-menu-assistant";
import { AyaNavGuideV5, spotlightElement, type AyaNavGuideState } from "@/components/garage/order/v5/aya-nav-guide";
import { FullscreenExitV5, WelcomeV5, welcomeSeen } from "@/components/garage/order/v5/welcome-v5";
import { TableInfoPickerV5, readTableInfo, writeTableInfo, type TableInfo } from "@/components/garage/order/v5/table-info-v5";
import { MENU_TOAST_MS, MenuToastStackV5, SuccessCheckV5, pushMenuToast, type MenuToast } from "@/components/garage/order/v5/toast-v5";
import { OrderHelpSheet } from "@/components/garage/order/order-help-sheet";
import {
  CustomerTablePicker,
  OrderTypeChooser,
  TableJoinCodeCard,
  releaseTableHold,
  requestTableHold,
  type TableHoldState,
} from "@/components/garage/order/customer-table-picker";
import {
  QuantityControl,
  cartKey,
  categoryIcon,
  itemCartQty,
  itemHasPromo,
  rupiah,
  variantPrice,
} from "@/components/garage/order/order-ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  CustomerOrderCreateResponse,
  MenuItem,
  OrderType,
  PublicOrderStatus,
  VoucherValidation,
} from "@/lib/garage-api-types";
import { maxRedeemablePoints, type MemberLevel } from "@/lib/member-types";
import { deliveryQuote } from "@/lib/garage-delivery-rules";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/garage-app-settings-types";
import { calculateOrderBilling, capVoucherDiscountBySettings, qrPromoDiscount } from "@/lib/garage-billing";
import { resolveOrderCampaign } from "@/lib/order-campaign";
import { QRIS_IMAGE_SRC } from "@/lib/garage-qris";
import { parseBankAccounts } from "@/lib/bank-accounts";
import { PaymentProofPanel } from "@/components/garage/order/payment-proof-panel";
import { CourierLiveCard, FulfillmentBadge, TrackerSteps } from "@/components/garage/order-progress";
import { OrderPushButton } from "@/components/garage/order-push-button";
import { EventBundlePicker } from "@/components/garage/events/event-bundle-picker";
import { BundleAgeConfirm, bundleAgeConfirmed } from "@/components/garage/events/bundle-age-confirm";
import { randomId } from "@/lib/random-id";
import { EventBundleSection } from "@/components/garage/order/event-bundle-section";
import { bundleHasRestricted, eventEntryAvailable, mergeMainEventMenu, type EventDigitalMenuContext, type EventMenuSelection, type EventDisplayVariant } from "@/lib/event-menu-display";
import type { EventMenuEntry } from "@/lib/event-menu-types";
import { checkoutNeedsRecovery, checkoutRejectionIsDefinitive, freezeEventSubmission, restoreEventSubmission, type FrozenEventSubmission } from "@/lib/event-checkout-submission";
import {
  adoptChatTokenForOrder,
  CustomerChatPanel,
  existingGenericChatToken,
} from "@/components/garage/customer-chat-panel";


type ApiEnvelope<T> =
  | { data: T; error?: never }
  | { error: { message: string; code: string }; data?: never }
  | { success: true; data: T }
  | { success: false; message: string };

type MemberProfile = {
  id: string;
  name: string;
  phone: string;
  level: MemberLevel;
  totalPoints: number;
  points?: number;
};

type QrContext = {
  tableLabel: string;
  orderType: OrderType;
  source: "qr_table" | "qr_takeaway" | "instagram" | "campaign";
  outletId?: string;
  campaign?: string;
  /** Nomor meja QR tidak valid / meja nonaktif → checkout diblokir dengan pesan ini. */
  tableIssue?: string;
  /** Info netral (bukan error), mis. pengunjung dari Instagram otomatis Take away. */
  tableHint?: string;
  /** Link umum tanpa meja → langkah awal pilih tipe pesanan (Dine-in / Take away / Delivery). */
  chooseType?: boolean;
  /** Nomor meja dari QR meja ("07") → konfirmasi lalu kunci meja. */
  presetTable?: string;
};

type CartLine = {
  item: MenuItem;
  variant: MenuItem["variants"][number];
  qty: number;
  key: string;
  note: string;
};

type CustomerPaymentMethod = "Cash" | "QRIS" | "Bank Transfer";

export type CustomerOrderQrContext = QrContext;

function customerInvoicePdfUrl(
  orderStatus: PublicOrderStatus | null,
  lastOrder: CustomerOrderCreateResponse | null,
) {
  return orderStatus?.invoicePdfUrl ?? lastOrder?.order.invoicePdfUrl ?? null;
}

function customerInvoiceWebUrl(
  orderStatus: PublicOrderStatus | null,
  lastOrder: CustomerOrderCreateResponse | null,
) {
  return orderStatus?.invoiceWebUrl ?? lastOrder?.order.invoiceWebUrl ?? null;
}

function customerWhatsappInvoiceUrl(
  orderStatus: PublicOrderStatus | null,
  lastOrder: CustomerOrderCreateResponse | null,
) {
  return orderStatus?.whatsappInvoiceUrl ?? lastOrder?.whatsapp.url ?? null;
}

const HERO_SECTION_ID = "menu-unggulan";

const number = new Intl.NumberFormat("id-ID");

const customerPaymentMethods: CustomerPaymentMethod[] = ["Cash", "QRIS", "Bank Transfer"];
const qrisProvider = "QRIS GARAGE";
const qrisImagePath = QRIS_IMAGE_SRC;

function uuidOrUndefined(value: string | null) {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

async function getJson<T>(url: string) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const json = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok) {
    if ("error" in json && json.error) throw new Error(json.error.message);
    if ("success" in json && !json.success) throw new Error(json.message);
    throw new Error("Request gagal.");
  }
  if ("success" in json) {
    if (!json.success) throw new Error(json.message);
    return json.data;
  }
  if ("error" in json && json.error) throw new Error(json.error.message);
  return json.data;
}

/** Error API dengan kode (mis. TABLE_OCCUPIED) supaya UI bisa bereaksi tepat. */
class ApiError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
  }
}

async function postJson<T>(url: string, payload: unknown, idempotencyKey?: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}) },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const json = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok) {
    if ("error" in json && json.error) throw new ApiError(json.error.message, json.error.code, response.status);
    if ("success" in json && !json.success) throw new ApiError(json.message, undefined, response.status);
    throw new ApiError("Request gagal.", undefined, response.status);
  }
  if ("success" in json) {
    if (!json.success) throw new Error(json.message);
    return json.data;
  }
  if ("error" in json && json.error) throw new Error(json.error.message);
  return json.data;
}

/** Status akhir: tidak perlu dipoll lagi. */
function isTrackedOrderFinished(status: PublicOrderStatus) {
  if (status.orderStatus === "rejected" || status.kitchenStatus === "rejected") return true;
  if (status.steps?.length) return status.steps.every((step) => step.state === "done");
  return status.kitchenStatus === "delivered" || status.kitchenStatus === "completed";
}

/** Browser memblokir getar sebelum pengguna menyentuh halaman (dan mencatat error). */
function canVibrate() {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return typeof navigator.vibrate === "function" && (activation ? activation.hasBeenActive : true);
}

function ChatLaunchButton({ label, unread, onClick, compact = false }: { label: string; unread: number; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={compact ? "garage-press inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-garage-line px-3 text-sm font-bold text-garage-dim transition-colors hover:bg-garage-bg-3 focus-visible:outline-2 focus-visible:outline-garage-amber" : "garage-press mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-garage-red/45 bg-garage-red/12 px-3 py-2.5 text-sm font-bold text-[#ffc9c9] transition hover:bg-garage-red/20"}
    >
      <MessageCircle className="size-4" aria-hidden />
      {compact ? "Chat kasir" : label}
      {unread > 0 ? (
        <span className="rounded-full bg-garage-amber px-2 py-0.5 text-xs font-black text-black" aria-label={`${unread} pesan baru dari kasir`}>
          {unread} baru
        </span>
      ) : null}
    </button>
  );
}

function readQrContext(): QrContext {
  if (typeof window === "undefined") {
    return { tableLabel: "Meja QR", orderType: "dine-in", source: "qr_table" };
  }

  const params = new URLSearchParams(window.location.search);
  const rawTable = params.get("tableLabel") ?? params.get("table");
  const source = params.get("source");
  const normalizedSource =
    source === "instagram" || source === "campaign" || source === "qr_takeaway"
      ? source
      : "qr_table";
  const orderType: OrderType =
    normalizedSource === "qr_takeaway" ? "takeaway" : "dine-in";
  const tableLabel = rawTable
    ? rawTable.toLowerCase().startsWith("meja")
      ? rawTable
      : `Meja ${rawTable}`
    : orderType === "dine-in"
      ? "Meja QR"
      : "Take away";

  return {
    tableLabel,
    orderType,
    source: normalizedSource,
    outletId: uuidOrUndefined(params.get("outletId")),
    campaign: resolveOrderCampaign((key) => params.get(key)),
  };
}

function readReturnPath() {
  if (typeof window === "undefined") {
    return "/order";
  }

  return window.location.pathname + window.location.search;
}

function readInitialSearchQuery() {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  return (params.get("q") ?? params.get("item") ?? "").trim().slice(0, 80);
}

function compactTableNumber(tableLabel: string) {
  const match = tableLabel.match(/\d+/);
  if (match) return match[0].padStart(2, "0");
  if (tableLabel.includes("?")) return "?";
  const label = tableLabel.trim();
  if (/take/i.test(label)) return "TA";
  if (/qr/i.test(label)) return "QR";
  return label.slice(0, 2).toUpperCase();
}

function BillLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "text-white" : "text-garage-dim"}`}>
      <span>{label}</span>
      <strong className={`font-mono tabular-nums ${strong ? "text-lg text-white" : "text-white"}`}>{value}</strong>
    </div>
  );
}

function CartRow({
  line,
  onAdjust,
  onNote,
}: {
  line: CartLine;
  onAdjust?: (itemId: string, variantId: string, delta: number) => void;
  onNote?: (itemId: string, variantId: string, value: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const hasNote = line.note.trim().length > 0;
  const showNote = Boolean(onNote) && (noteOpen || hasNote);

  return (
    <div className="border-b border-garage-line/70 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-bold leading-snug text-white">{line.item.name}</p>
          <p className="mt-0.5 break-words text-sm text-garage-dim">
            {line.item.variants.length > 1 ? `${line.variant.label} · ` : ""}
            <span className="font-mono tabular-nums text-white">
              {rupiah.format(variantPrice(line.item, line.variant) * line.qty)}
            </span>
          </p>
        </div>
        {onAdjust ? (
          <QuantityControl
            label={`${line.item.name} ${line.variant.label}`}
            qty={line.qty}
            onMinus={() => onAdjust(line.item.id, line.variant.id, -1)}
            onPlus={() => onAdjust(line.item.id, line.variant.id, 1)}
          />
        ) : (
          <p className="shrink-0 font-mono text-sm font-bold tabular-nums text-white">{line.qty}x</p>
        )}
      </div>
      {onNote ? (
        showNote ? (
          <input
            value={line.note}
            onChange={(event) => onNote(line.item.id, line.variant.id, event.target.value)}
            maxLength={160}
            autoFocus={noteOpen && !hasNote}
            placeholder="Catatan item (mis. less ice, tanpa bawang)"
            aria-label={`Catatan ${line.item.name}`}
            className="mt-2 h-10 w-full rounded-md border border-garage-line bg-garage-bg-1 px-3 text-sm text-white outline-none transition-colors placeholder:text-garage-mute focus:border-garage-amber"
          />
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="garage-press mt-1 inline-flex h-11 cursor-pointer items-center gap-1 text-sm font-semibold text-garage-amber hover:underline"
          >
            <Plus className="size-3.5" /> Catatan item
          </button>
        )
      ) : null}
    </div>
  );
}

function CartList({
  lines,
  onAdjust,
  onNote,
}: {
  lines: CartLine[];
  onAdjust?: (itemId: string, variantId: string, delta: number) => void;
  onNote?: (itemId: string, variantId: string, value: string) => void;
}) {
  if (!lines.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-garage-line-2 p-5 text-center text-sm text-garage-dim">
        <ShoppingBag className="size-6 text-garage-mute" aria-hidden />
        Keranjang masih kosong.
      </div>
    );
  }

  return (
    <div>
      {lines.map((line) => (
        <CartRow key={line.key} line={line} onAdjust={onAdjust} onNote={onNote} />
      ))}
    </div>
  );
}

function StepHeading({ step, title, aside }: { step: number; title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-garage-red font-mono text-xs font-bold text-white">
        {step}
      </span>
      <h3 className="text-base font-bold text-white">{title}</h3>
      {aside ? <span className="ml-auto">{aside}</span> : null}
    </div>
  );
}

function StationIcon({ station }: { station: string }) {
  if (station === "Bar") return <Coffee className="size-3.5" aria-hidden />;
  if (station === "Packaging" || station === "Packing") return <Package className="size-3.5" aria-hidden />;
  return <UtensilsCrossed className="size-3.5" aria-hidden />;
}

function formatMmSs(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Tracker live pelanggan: headline ETA (countdown mulus per detik saat dimasak),
// stepper berikon, dan ETA per station (Bar/Dapur). Data dari public-status,
// di-poll tiap 8 detik; di antara poll, countdown tetap turun mulus via tick lokal.
function OrderTracker({ status }: { status: PublicOrderStatus | null }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const ks = status?.kitchenStatus ?? "waiting_cashier";
  const rejected = ks === "rejected" || status?.orderStatus === "rejected";
  const done = ks === "delivered" || ks === "completed";

  const rawStations = status?.stations ?? [];
  const anyCooking = rawStations.some(
    (entry) => entry.status === "cooking" && entry.cookingStartedAt,
  );
  const courierMoving = status?.deliveryStatus === "on_the_way" || status?.deliveryStatus === "picked_up";
  // Tick per detik HANYA saat ada station sedang dimasak (hemat render); saat
  // kurir jalan cukup tiap 20 detik untuk teks "update x menit lalu".
  useEffect(() => {
    if (!anyCooking && !courierMoving) return;
    const id = window.setInterval(() => setNowMs(Date.now()), anyCooking ? 1000 : 20_000);
    return () => window.clearInterval(id);
  }, [anyCooking, courierMoving]);

  const stations = rawStations.map((entry) => {
    const ready = entry.status === "ready" || entry.status === "delivered";
    let remainingSec: number | null;
    if (ready) {
      remainingSec = 0;
    } else if (entry.status === "cooking" && entry.cookingStartedAt) {
      const elapsed = (nowMs - new Date(entry.cookingStartedAt).getTime()) / 1000;
      remainingSec = Math.max(0, entry.targetSeconds - elapsed);
    } else {
      remainingSec = entry.etaSeconds;
    }
    return { ...entry, ready, remainingSec };
  });

  const pending = stations.filter((entry) => !entry.ready);
  const headlineSec = pending.length
    ? Math.max(...pending.map((entry) => entry.remainingSec ?? 0))
    : null;
  const allReady = stations.length > 0 && stations.every((entry) => entry.ready);

  if (rejected) {
    return (
      <div className="mt-3 rounded-md border border-garage-red/50 bg-garage-red/12 p-3 text-sm font-semibold text-[#ffc9c9]">
        Pesanan ditolak{status?.rejectionReason ? `: ${status.rejectionReason}` : " kasir"}. Silakan pesan ulang atau hubungi staf.
      </div>
    );
  }
  const typedSteps = status?.steps ?? [];
  const isDeliveryOrder = status?.fulfillment === "delivery";

  const steps = [
    { label: "Masuk kasir", icon: ReceiptText },
    { label: "Diproses", icon: ChefHat },
    { label: "Siap", icon: PackageCheck },
  ];
  const stepIndex = ks === "ready" || done ? 2 : ks === "queue" || ks === "cooking" ? 1 : 0;

  return (
    <div className="mt-3 space-y-3">
      {allReady || ks === "ready" ? (
        <div className="flex items-center gap-3 rounded-md border border-garage-success/45 bg-garage-success/12 p-3">
          <PackageCheck className="size-7 shrink-0 text-[#86efac]" />
          <div className="min-w-0">
            <p className="text-base font-bold text-[#bbf7d0]">
              {status?.fulfillment === "takeaway" ? "Pesanan siap diambil" : isDeliveryOrder ? "Pesanan siap diantar" : "Pesanan siap"}
            </p>
            <p className="text-sm text-[#dcfce7]">
              {status?.fulfillment === "takeaway"
                ? "Ambil di kasir Garage, sebutkan nomor pesanan."
                : isDeliveryOrder
                  ? "Sedang dipacking dan diserahkan ke kurir."
                  : "Segera diantar ke meja Anda."}
            </p>
          </div>
        </div>
      ) : done ? (
        <div className="flex items-center gap-3 rounded-md border border-garage-success/35 bg-garage-success/10 p-3">
          <CheckCircle2 className="size-7 shrink-0 text-[#86efac]" />
          <p className="text-sm font-bold text-[#dcfce7]">Pesanan selesai. Terima kasih!</p>
        </div>
      ) : anyCooking && headlineSec != null ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-garage-amber/45 bg-garage-amber/10 p-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-[#ffd9b3]">Estimasi siap dalam</p>
            <p className="font-mono text-3xl font-bold tabular-nums leading-none text-white">
              {formatMmSs(headlineSec)}
            </p>
          </div>
          <ChefHat className="size-8 shrink-0 text-garage-amber" />
        </div>
      ) : ks === "queue" ? (
        <div className="flex items-center gap-3 rounded-md border border-garage-line bg-garage-bg-2 p-3">
          <Clock className="size-6 shrink-0 text-garage-amber" />
          <p className="text-sm font-semibold text-garage-fg">
            Masuk antrean dapur
            {headlineSec != null ? ` — perkiraan ± ${Math.max(1, Math.round(headlineSec / 60))} menit.` : "."}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-garage-line bg-garage-bg-2 p-3">
          <Clock className="size-6 shrink-0 text-garage-amber" />
          <p className="text-sm font-semibold text-garage-fg">Menunggu konfirmasi kasir…</p>
        </div>
      )}

      {typedSteps.length ? (
        <>
          <FulfillmentBadge fulfillment={status?.fulfillment} tableLabel={status?.tableLabel} compact />
          <TrackerSteps steps={typedSteps} />
          {isDeliveryOrder && status?.courier ? (
            <CourierLiveCard courier={status.courier} deliveryStatus={status.deliveryStatus} nowMs={nowMs} />
          ) : null}
        </>
      ) : (
        <div className="flex items-start gap-1.5">
          {steps.map((step, index) => {
            const reached = index <= stepIndex;
            const current = index === stepIndex && !done;
            const Icon = step.icon;
            return (
              <div key={step.label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`flex size-8 items-center justify-center rounded-md border transition-colors ${
                    reached
                      ? "border-garage-success/55 bg-garage-success/15 text-[#86efac]"
                      : "border-garage-line bg-garage-bg-2 text-garage-mute"
                  } ${current ? "ring-2 ring-garage-amber/60" : ""}`}
                >
                  <Icon className="size-4" />
                </div>
                <span
                  className={`text-center text-xs font-bold ${
                    current ? "text-[#ffd9b3]" : reached ? "text-[#dcfce7]" : "text-garage-mute"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {stations.length ? (
        <div className="flex flex-wrap gap-2">
          {stations.map((entry) => {
            const tone = entry.ready
              ? "border-garage-success/45 bg-garage-success/12 text-[#bbf7d0]"
              : entry.status === "cooking"
                ? "border-garage-amber/45 bg-garage-amber/12 text-[#ffd9b3]"
                : "border-garage-line bg-garage-bg-2 text-garage-dim";
            const label = entry.ready
              ? "Siap"
              : entry.status === "cooking" && entry.remainingSec != null
                ? formatMmSs(entry.remainingSec)
                : entry.remainingSec != null
                  ? `± ${Math.max(1, Math.round(entry.remainingSec / 60))} mnt`
                  : "Antre";
            return (
              <span
                key={entry.station}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-bold tabular-nums ${tone}`}
              >
                <StationIcon station={entry.station} />
                {entry.station}
                {entry.verb && !entry.ready ? ` · ${entry.verb}` : ""}: {label}
              </span>
            );
          })}
        </div>
      ) : null}

      <p className="text-xs text-garage-mute">Update otomatis tiap 8 detik</p>
    </div>
  );
}

/** Kartu Menu V5 dengan aksi berbasis id (aksi tidak dibungkus closure saat render induk). */
function V5CardSlot({
  item,
  index,
  layout,
  cartQty,
  popular,
  favorite,
  onToggleFavorite,
  onAdd,
  onOpen,
}: {
  item: MenuItem;
  index: number;
  layout: "grid" | "list";
  cartQty: number;
  popular: boolean;
  favorite: boolean;
  onToggleFavorite: (itemId: string) => void;
  onAdd: (itemId: string, variantId: string, delta: number) => void;
  onOpen: (item: MenuItem) => void;
}) {
  return (
    <MenuCardV5
      item={item}
      index={index}
      layout={layout}
      cartQty={cartQty}
      popular={popular}
      favorite={favorite}
      onToggleFavorite={() => onToggleFavorite(item.id)}
      onAdd={(variantId, delta) => onAdd(item.id, variantId, delta)}
      onOpen={() => onOpen(item)}
    />
  );
}

/** Sumber "Menu Pilihan": unggulan admin → promo → terlaris. */
type HeroKind = "featured" | "promo" | "best";

// Menu V5: jalur aman AYA berbeda di HP (di atas navigasi bawah) dan desktop (tepi bawah layar).
const DESKTOP_QUERY = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function readDesktop() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

export function MemberOrderPage({
  initialQrContext,
  initialReturnPath,
  initialSearchQuery,
  initialMenuItems,
  bestSellerIds,
  billing,
  initialOrderingOpen,
  staffOrder,
  eventContext,
}: {
  initialQrContext?: QrContext;
  initialReturnPath?: string;
  initialSearchQuery?: string;
  initialMenuItems?: MenuItem[];
  bestSellerIds?: string[];
  // Pengaturan tagihan outlet dari server (sama dengan createCustomerOrder).
  billing?: Pick<
    AppSettings,
    | "serviceChargePct"
    | "taxPct"
    | "roundingMode"
    | "voucherMaxDiscountPct"
    | "qrPromoPct"
    | "qrPromoMaxAmount"
    | "pointsPerThousand"
    | "memberPointValue"
    | "memberRedeemMaxPct"
    | "memberRedeemMinPoints"
    | "deliveryEnabled"
    | "deliveryFee"
    | "deliveryMinItems"
    | "deliveryBaseKm"
    | "deliveryPerKmFee"
    | "deliveryMaxKm"
    | "deliveryMinSpend"
    | "deliveryAreaNote"
    | "garageWhatsapp"
    | "unpaidOrderAutoRejectMinutes"
  > & {
    /** Menu V5: mode menu digital outlet (bawaan "self_order"). */
    digitalMenuMode?: AppSettings["digitalMenuMode"];
    /** Delivery sementara tidak bisa dipilih (mis. tidak ada kurir siap antar). */
    deliveryUnavailableReason?: string | null;
    /** Semua kurir sedang mengantar → pesanan delivery masuk antrean. */
    deliveryCouriersBusy?: boolean;
    /** Titik Garage untuk ongkir per km (null = ongkir flat). */
    deliveryOrigin?: { lat: number; lng: number } | null;
  };
  // Ada shift kasir buka (server). undefined = belum diketahui → anggap buka.
  initialOrderingOpen?: boolean;
  // Mode waiter (/order?mode=waiter, sesi staf dicek server): nama pemesan otomatis,
  // order dikirim ke /api/waiter/orders (menunggu kasir), lalu kembali ke daftar meja.
  staffOrder?: { name: string; backHref: string } | null;
  eventContext?: EventDigitalMenuContext;
}) {
  const hasInitialMenuItems = initialMenuItems !== undefined || Boolean(eventContext && eventContext.mode !== "main");
  const bestSellerSet = useMemo(() => new Set(bestSellerIds ?? []), [bestSellerIds]);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [mode, setMode] = useState<"guest" | "member">("guest");
  const [menuItemState, setMenuItems] = useState<MenuItem[]>(() => initialMenuItems ?? []);
  const [cart, setCart] = useState<Record<string, number>>({});
  // Catatan per-item keranjang (mis. "less ice"), keyed by cartKey item::variant.
  const [cartNotes, setCartNotes] = useState<Record<string, string>>({});
  // Item yang dibuka di sheet detail (pilih varian + qty).
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [bundleEntry, setBundleEntry] = useState<EventMenuEntry | null>(null);
  const [ageGateEntry, setAgeGateEntry] = useState<EventMenuEntry | null>(null);
  const [eventSelections, setEventSelections] = useState<Record<string, EventMenuSelection[]>>({});
  const eventSubmission = useRef<FrozenEventSubmission | null>(null);
  const [uncertainSubmission, setUncertainSubmission] = useState<FrozenEventSubmission | null>(null);
  const [pendingRestored, setPendingRestored] = useState(false);
  const [eventNow, setEventNow] = useState(() => Date.now());
  const mainEventMenu = eventContext?.mode === "main";
  const menuItems = useMemo(() => {
    if (!eventContext) return menuItemState;
    if (eventContext.mode === "main") return mergeMainEventMenu(menuItemState, eventContext, eventNow).map(item => {
      const stored = menuItemState.find(row => row.id === item.id);
      return item.id.startsWith("event:") && stored ? { ...item, variants: stored.variants } : item;
    });
    return menuItemState.map((item) => {
      const entry = eventContext.entries.find((row) => `event:${row.id}` === item.id);
      return entry ? { ...item, stock: eventEntryAvailable(entry, eventContext.products, eventNow) ? "ready" as const : "sold_out" as const } : item;
    });
  }, [menuItemState, eventContext, eventNow]);
  useEffect(() => {
    if (!eventContext) return;
    const timer = window.setInterval(() => setEventNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [eventContext]);
  // false = kasir belum buka shift → menu tetap bisa dilihat, tapi order belum bisa dikirim.
  const [orderingOpen, setOrderingOpen] = useState(initialOrderingOpen !== false);
  // Toast bertingkat papan 06 (sukses / stok terbatas / gagal), hilang sendiri atau ditutup.
  const [toasts, setToasts] = useState<MenuToast[]>([]);
  const toastTimersRef = useRef(new Map<number, number>());
  const toastSeqRef = useRef(0);
  const dismissToast = useCallback((id: number) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);
  const showToast = useCallback(
    (toast: Omit<MenuToast, "id">) => {
      const id = ++toastSeqRef.current;
      setToasts((list) => pushMenuToast(list, { ...toast, id }));
      toastTimersRef.current.set(id, window.setTimeout(() => dismissToast(id), MENU_TOAST_MS[toast.tone]));
    },
    [dismissToast],
  );
  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);
  // Tombol terakhir yang ditekan = asal titik "terbang ke Daftar".
  const lastPressRef = useRef<{ el: Element; at: number } | null>(null);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const el = event.target instanceof Element ? event.target.closest("button") : null;
      if (el) lastPressRef.current = { el, at: performance.now() };
    };
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true });
  }, []);
  const [query, setQuery] = useState(() =>
    (initialSearchQuery ?? readInitialSearchQuery()).trim().slice(0, 80),
  );
  const [helpOpen, setHelpOpen] = useState(false);
  // Menu V5 (Owner, Nov 2026): filter chip, tampilan kotak/daftar, laci navigasi HP, tab navigasi bawah, panggil AYA.
  const [menuChip, setMenuChip] = useState<MenuChip>("all");
  const [menuView, setMenuView] = useState<"grid" | "list">("grid");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navTab, setNavTab] = useState<BottomNavTab>("home");
  const [ayaChatOpen, setAyaChatOpen] = useState(false);
  // Master prompt V5: navigasi pintar AYA, welcome fullscreen, meja info (mode Daftar Pilihan), muat ulang menu.
  const [ayaExpandToken, setAyaExpandToken] = useState(0);
  const [ayaNavGuide, setAyaNavGuide] = useState<AyaNavGuideState | null>(null);
  const [ayaAutoNav, setAyaAutoNav] = useState(true);
  const ayaNavReturn = useRef<{ scrollY: number; chip: MenuChip } | null>(null);
  const ayaSpotlightCleanup = useRef<(() => void) | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [tableInfoOpen, setTableInfoOpen] = useState(false);
  const [menuLoadFailed, setMenuLoadFailed] = useState(false);
  const [menuReload, setMenuReload] = useState(0);
  // F3: Quick View (varian awal), lembar Daftar Pilihan HP, layar Tunjukkan ke Waiter.
  const [detailVariant, setDetailVariant] = useState<string | null>(null);
  const [daftarOpen, setDaftarOpen] = useState(false);
  const [showWaiterOpen, setShowWaiterOpen] = useState(false);
  const [waiterQrUrl, setWaiterQrUrl] = useState<string | null>(null);
  const favorites = useMenuFavorites();
  const isDesktop = useSyncExternalStore(subscribeDesktop, readDesktop, () => false);
  // Jalur AYA (audit F2): HP = tepat di atas navigasi bawah (tinggi diukur, ikut safe-area);
  // desktop = dibatasi kolom tengah supaya tidak berhenti di atas sidebar/panel kanan.
  const [navHeight, setNavHeight] = useState(72);
  const [laneX, setLaneX] = useState<LaneX | undefined>(undefined);
  const [guestName, setGuestName] = useState("");
  // Pesan error nama baru tampil setelah kolom disentuh (bukan saat dialog baru dibuka).
  const [guestNameTouched, setGuestNameTouched] = useState(false);
  // Mode waiter: nomor order terakhir yang terkirim ke kasir (panel sukses).
  const [staffSentOrderNo, setStaffSentOrderNo] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherResult, setVoucherResult] = useState<VoucherValidation | null>(null);
  // Pakai poin member saat checkout (maks sesuai Pengaturan).
  const [usePoints, setUsePoints] = useState(false);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CustomerPaymentMethod>("Cash");
  // Pesan dari luar Garage (link tanpa meja): Take away atau Delivery.
  const [fulfillment, setFulfillment] = useState<"takeaway" | "delivery">("takeaway");
  const [guestPhone, setGuestPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryLandmark, setDeliveryLandmark] = useState("");
  // Lokasi pelanggan (opsional) — supaya jarak kurir bisa ditampilkan di pelacak.
  const [customerLocation, setCustomerLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "loading" | "denied">("idle");
  const requestCustomerLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationState("denied");
      return;
    }
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCustomerLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationState("idle");
      },
      () => setLocationState("denied"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };
  const [paymentProvider, setPaymentProvider] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [returnPath] = useState(() => initialReturnPath ?? readReturnPath());
  const [qrContext, setQrContext] = useState<QrContext>(() => initialQrContext ?? readQrContext());
  // Pilih tipe pesanan & meja (PDF owner, Okt 2026).
  const [typeChosen, setTypeChosen] = useState(() => !qrContext.chooseType);
  const [tableHold, setTableHold] = useState<TableHoldState | null>(null);
  const [tableHoldRestored, setTableHoldRestored] = useState(false);
  const [tablePickerRequested, setTablePickerRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!hasInitialMenuItems);
  const [message, setMessage] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<CustomerOrderCreateResponse | null>(null);
  const [orderStatus, setOrderStatus] = useState<PublicOrderStatus | null>(null);
  // Order yang dilanjutkan dari kunjungan sebelumnya (persist via localStorage)
  // supaya tracker tidak hilang saat halaman di-refresh.
  const [trackedOrderId, setTrackedOrderId] = useState<string | null>(null);
  const [trackedOrderNo, setTrackedOrderNo] = useState<string | null>(null);
  // Live chat (satu panel untuk seluruh halaman; tombol pemicu punya badge sendiri).
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [helpMessage, setHelpMessage] = useState("");
  const [helpBusy, setHelpBusy] = useState<string | null>(null);
  // Field opsional checkout disembunyikan dulu agar tampilan minimalis.
  const [showVoucherField, setShowVoucherField] = useState(false);
  const [showNoteField, setShowNoteField] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const pendingStorageKey = `garage:eventCheckout:pending:${qrContext.outletId ?? "default"}`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const frozen = restoreEventSubmission(window.sessionStorage.getItem(pendingStorageKey));
        if (frozen) { eventSubmission.current = frozen; setUncertainSubmission(frozen); }
      } catch { /* Retain in-memory protection when session storage is unavailable. */ }
      setPendingRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingStorageKey]);

  function clearPendingSubmission() {
    eventSubmission.current = null;
    setUncertainSubmission(null);
    try { window.sessionStorage.removeItem(pendingStorageKey); } catch { /* session storage unavailable */ }
  }

  async function callService(type: "call" | "bill" | "water" | "move", label: string) {
    setHelpBusy(type);
    setHelpMessage("");
    try {
      await postJson("/api/customer/service-requests", {
        tableLabel: qrContext.tableLabel,
        outletId: qrContext.outletId,
        type,
      });
      setHelpMessage(
        type === "move"
          ? `Permintaan pindah dari ${qrContext.tableLabel} terkirim. Waiter/kasir akan datang & memindahkan pesananmu.`
          : `${label} terkirim. Pelayan akan segera datang ke ${qrContext.tableLabel}.`,
      );
    } catch {
      setHelpMessage("Gagal mengirim panggilan. Coba lagi sebentar.");
    } finally {
      setHelpBusy(null);
    }
  }

  const loadProfile = useCallback(async () => {
    try {
      const profile = await getJson<{ member: MemberProfile | null }>("/api/member/profile?optional=1");
      setMember(profile.member);
      if (profile.member) setMode("member");
    } catch {
      setMember(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const profileTimeoutId = window.setTimeout(() => {
      void loadProfile();
    }, 0);

    if (hasInitialMenuItems) {
      return () => {
        alive = false;
        window.clearTimeout(profileTimeoutId);
      };
    }

    const menuTimeoutId = window.setTimeout(() => {
      getJson<MenuItem[]>("/api/customer/menu")
        .then((menu) => {
          if (alive) {
            setMenuItems(eventContext?.mode === "main" ? mergeMainEventMenu(menu, eventContext) : menu);
            setMenuLoadFailed(false);
          }
        })
        .catch((error) => {
          if (alive) {
            setMenuLoadFailed(true);
            setMessage(error instanceof Error ? error.message : "Menu gagal dimuat.");
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 0);

    return () => {
      alive = false;
      window.clearTimeout(profileTimeoutId);
      window.clearTimeout(menuTimeoutId);
    };
  }, [hasInitialMenuItems, loadProfile, eventContext, menuReload]);

  // Cek ulang status buka/tutup outlet: tiap 60 dtk + saat checkout dibuka, supaya banner
  // "Belum buka" hilang sendiri begitu kasir membuka shift (tanpa refresh halaman).
  const refreshOrderingStatus = useCallback(async () => {
    try {
      const query = qrContext.outletId ? `?outletId=${encodeURIComponent(qrContext.outletId)}` : "";
      const status = await getJson<{ open: boolean }>(`/api/customer/ordering-status${query}`);
      setOrderingOpen(status.open);
    } catch {
      /* jaringan gagal → pertahankan status terakhir; server tetap memvalidasi saat kirim */
    }
  }, [qrContext.outletId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => void refreshOrderingStatus(), 60_000);
    return () => window.clearInterval(intervalId);
  }, [refreshOrderingStatus]);

  useEffect(() => {
    const updateScrollState = () => setShowScrollTop(window.scrollY > 520);
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  // Resume: baca order terakhir dari localStorage saat mount (kalau belum ada
  // sesi aktif), supaya tracker tetap muncul setelah refresh/buka ulang.
  useEffect(() => {
    if (lastOrder) return;
    try {
      const raw = window.localStorage.getItem("garage:trackedOrder");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; orderNo?: string };
      if (parsed?.id) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from storage
        setTrackedOrderId(parsed.id);
        setTrackedOrderNo(parsed.orderNo ?? null);
      }
    } catch {
      /* localStorage tidak tersedia */
    }
  }, [lastOrder]);

  // Satu poller untuk pesanan aktif (baru dibuat atau di-resume):
  // - tiap 8 dtk, jeda saat tab disembunyikan, langsung cek saat kembali;
  // - berhenti setelah status akhir (selesai/diterima/ditolak);
  // - error jaringan TIDAK menghapus pelacak (hanya 404 = pesanan tidak ada).
  const trackId = lastOrder?.order.id ?? trackedOrderId;
  useEffect(() => {
    if (!trackId) return;
    let alive = true;
    let stopped = false;
    let intervalId = 0;
    const loadStatus = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/api/customer/orders/${trackId}/public-status`, { cache: "no-store" });
        if (response.status === 404) {
          if (!alive) return;
          stopped = true;
          window.clearInterval(intervalId);
          if (!lastOrder) {
            setTrackedOrderId(null);
            try {
              window.localStorage.removeItem("garage:trackedOrder");
            } catch {
              /* ignore */
            }
          }
          return;
        }
        const json = (await response.json().catch(() => ({}))) as { data?: PublicOrderStatus };
        if (!alive || !response.ok || !json.data) return;
        const status = json.data;
        setOrderStatus(status);
        if (isTrackedOrderFinished(status)) {
          stopped = true;
          window.clearInterval(intervalId);
          try {
            window.localStorage.removeItem("garage:trackedOrder");
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* jaringan putus sesaat — coba lagi di putaran berikutnya */
      }
    };
    void loadStatus();
    intervalId = window.setInterval(loadStatus, 8_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [trackId, lastOrder]);

  // Perubahan langkah status → getar + judul tab (pelanggan sering menaruh HP).
  const currentStepKey = orderStatus?.steps?.find((step) => step.state === "current")?.key ?? null;
  const currentStepLabel = orderStatus?.steps?.find((step) => step.state === "current")?.label ?? null;
  const previousStepRef = useRef<string | null>(null);
  useEffect(() => {
    const signature = `${orderStatus?.orderNo ?? ""}:${currentStepKey ?? (orderStatus && isTrackedOrderFinished(orderStatus) ? "done" : "")}`;
    const previous = previousStepRef.current;
    previousStepRef.current = signature;
    if (!previous || previous === signature || !orderStatus) return;
    try {
      if (canVibrate()) navigator.vibrate(currentStepKey === "pickup" || currentStepKey === "arrived" ? [200, 100, 200, 100, 200] : [150]);
    } catch {
      /* tidak didukung */
    }
    if (document.visibilityState === "hidden") {
      document.title = `🔔 ${currentStepLabel ?? "Pesanan diperbarui"} · Garage`;
    }
  }, [orderStatus, currentStepKey, currentStepLabel]);

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const filteredMenu = useMemo(
    () =>
      menuItems.filter((item) =>
        [
          item.name,
          item.category,
          item.section,
          item.description ?? "",
          item.tags.join(" "),
          item.variants.map((variant) => variant.label).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [menuItems, normalizedQuery],
  );
  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([key, qty]) => {
          const [itemId, variantId] = key.split("::");
          const item = menuItems.find((entry) => entry.id === itemId);
          const variant = item?.variants.find((entry) => entry.id === variantId);
          if (!item || !variant || qty <= 0) return null;
          return { item, variant, qty, key, note: cartNotes[key] ?? "" };
        })
        .filter((line): line is CartLine => Boolean(line)),
    [cart, menuItems, cartNotes],
  );

  // Harga promo per produk ikut dihitung (sama dengan effectiveMenuPrice di server).
  const subtotal = cartLines.reduce((sum, line) => sum + variantPrice(line.item, line.variant) * line.qty, 0);
  // Rumus SAMA dengan server (createCustomerOrder): service → PB1 → pembulatan
  // outlet, lalu promo QR (Pengaturan qrPromoPct/qrPromoMaxAmount) & voucher.
  // Dulu PB1 & pembulatan tidak dihitung → total di HP lebih murah dari tagihan kasir.
  const billingSettings = { ...DEFAULT_APP_SETTINGS, ...(billing ?? {}) };
  // Mode menu outlet (Menu V5): "waiter_list" = pelanggan hanya menyusun Daftar Pilihan → Tunjukkan ke Waiter.
  // Mode Pesankan waiter (staffOrder) selalu bisa mengirim pesanan.
  const waiterList = !staffOrder && billingSettings.digitalMenuMode === "waiter_list";
  /** Mode Daftar Pilihan: meja info dari pemilih (tanpa kunci meja) bila QR tidak membawa nomor meja. */
  const infoTableLabel = waiterList && qrContext.orderType === "dine-in" ? (tableInfo?.tableLabel ?? (/\d/.test(qrContext.tableLabel) ? qrContext.tableLabel : null)) : null;
  // Rekening transfer dari Pengaturan → Pembayaran (bukan lagi hardcode).
  const customerBankAccounts = parseBankAccounts(billingSettings.bankAccountsText);
  const selectedBank = customerBankAccounts.find((account) => account.id === paymentProvider) ?? customerBankAccounts[0] ?? null;
  // Paket event = harga final (tanpa service/PB1/promo/voucher), sama dengan server.
  const packageSubtotal = cartLines.reduce((sum, line) => sum + (line.item.id.startsWith("event:") && line.item.productType === "bundle" ? variantPrice(line.item, line.variant) * line.qty : 0), 0);
  const regularSubtotal = subtotal - packageSubtotal;
  const { service, tax, regularGrossTotal } = calculateOrderBilling({ regularSubtotal, packageSubtotal }, billingSettings);
  const roundingAdjustment = regularGrossTotal - (regularSubtotal + service + tax);
  const promoDiscount = qrPromoDiscount(regularSubtotal, billingSettings);
  const voucherDiscount = voucherResult?.valid
    ? capVoucherDiscountBySettings(voucherResult.discount, regularSubtotal, billingSettings)
    : 0;
  const discount = Math.min(regularGrossTotal, promoDiscount);
  // ---------------------------------------------------------------------------
  // Pilih meja (PDF owner, Okt 2026): dine-in pelanggan wajib memilih/konfirmasi
  // meja sebelum menu; meja dikunci di server & diperpanjang selama aktif.
  // ---------------------------------------------------------------------------
  const tableHoldKey = `garage:tableHold:${qrContext.outletId ?? "default"}`;
  // Mode Daftar Pilihan (Menu V5): pelanggan tidak checkout → tidak perlu kunci meja (yang butuh shift buka);
  // nomor meja dari QR tetap dipakai untuk layar "Tunjukkan ke Waiter".
  const needsTable = qrContext.orderType === "dine-in" && !staffOrder && !qrContext.tableIssue && !waiterList;

  // Welcome fullscreen (sekali per sesi tab), meja info & pilihan navigasi AYA dipulihkan dari sessionStorage.
  useEffect(() => {
    if (staffOrder) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage hanya ada di client
    if (!welcomeSeen()) setWelcomeOpen(true);
    try {
      if (window.sessionStorage.getItem("garage:aya-autonav") === "off") setAyaAutoNav(false);
    } catch {
      /* abaikan */
    }
  }, [staffOrder]);
  useEffect(() => {
    if (!waiterList) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage hanya ada di client
    setTableInfo(readTableInfo(qrContext.outletId));
  }, [waiterList, qrContext.outletId]);

  const saveTableHold = useCallback(
    (hold: TableHoldState | null) => {
      setTableHold(hold);
      try {
        if (hold) window.sessionStorage.setItem(tableHoldKey, JSON.stringify({ ...hold, savedAt: Date.now() }));
        else window.sessionStorage.removeItem(tableHoldKey);
      } catch {
        /* sessionStorage tidak tersedia */
      }
      if (hold) setQrContext((context) => ({ ...context, tableLabel: hold.tableLabel }));
    },
    [tableHoldKey],
  );

  // Pulihkan meja yang sudah dipilih (refresh halaman). QR meja lain → abaikan yang lama.
  useEffect(() => {
    if (tableHoldRestored) return;
    let restored: (TableHoldState & { savedAt?: number }) | null = null;
    try {
      const raw = window.sessionStorage.getItem(tableHoldKey);
      restored = raw ? (JSON.parse(raw) as TableHoldState & { savedAt?: number }) : null;
    } catch {
      restored = null;
    }
    const tooOld = !restored?.savedAt || Date.now() - restored.savedAt > 12 * 60 * 60 * 1000;
    const otherTable = Boolean(qrContext.presetTable && restored && restored.tableNumber !== qrContext.presetTable);
    if (restored && !tooOld && !otherTable && needsTable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTableHold(restored);
      setQrContext((context) => ({ ...context, tableLabel: restored.tableLabel }));
    } else if (restored?.token && otherTable) {
      void releaseTableHold(restored.token, qrContext.outletId);
    }
    setTableHoldRestored(true);
  }, [needsTable, qrContext.outletId, qrContext.presetTable, tableHoldKey, tableHoldRestored]);

  // Perpanjang kunci meja tiap 2 menit selama pelanggan masih memilih menu.
  const holdToken = tableHold?.mode === "new" ? tableHold.token : null;
  const holdTable = tableHold?.tableNumber ?? null;
  useEffect(() => {
    if (!holdToken || !holdTable || !needsTable) return;
    let alive = true;
    const renew = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const next = await requestTableHold({ table: holdTable, outletId: qrContext.outletId, holdToken });
        if (alive) saveTableHold(next);
      } catch (error) {
        if (!alive) return;
        saveTableHold(null);
        setMessage(error instanceof Error ? error.message : "Meja kamu sudah tidak tersedia. Pilih meja lagi.");
      }
    };
    const id = window.setInterval(renew, 120_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [holdToken, holdTable, needsTable, qrContext.outletId, saveTableHold]);

  const showTablePicker =
    typeChosen && needsTable && tableHoldRestored && !lastOrder && (!tableHold || tablePickerRequested);

  function chooseOrderType(value: "dine-in" | "takeaway" | "delivery") {
    if (value === "dine-in") {
      setQrContext((context) => ({
        ...context,
        orderType: "dine-in",
        tableLabel: tableHold?.tableLabel ?? "Pilih meja",
        tableHint: undefined,
      }));
    } else {
      if (tableHold?.token) void releaseTableHold(tableHold.token, qrContext.outletId);
      if (tableHold) saveTableHold(null);
      setQrContext((context) => ({
        ...context,
        orderType: "takeaway",
        tableLabel: "Take away",
      }));
      setFulfillment(value);
    }
    setTypeChosen(true);
  }

  // Take away ↔ Delivery hanya untuk order dari link (bukan QR meja / mode waiter).
  const canChooseFulfillment = qrContext.orderType === "takeaway" && !staffOrder;
  const deliveryAvailable = canChooseFulfillment && billingSettings.deliveryEnabled;
  const effectiveOrderType: OrderType =
    deliveryAvailable && fulfillment === "delivery" ? "delivery" : qrContext.orderType;
  const isDelivery = effectiveOrderType === "delivery";
  // Panduan cara pesan Aya (OD-01): customer tetap memesan sendiri; Aya menunjuk tombolnya.
  const orderGuide = useAyaOrderGuide({
    orderingOpen,
    hasCart: cartLines.length > 0,
    hasOrderType: !staffOrder && !qrContext.tableIssue,
    orderType: effectiveOrderType,
    blocked: !typeChosen || showTablePicker,
  });
  // Chat diikat ke pesanan yang sedang dilacak (bukti kepemilikan = token invoice).
  const chatOrderId = lastOrder?.order.id ?? trackedOrderId ?? null;
  const chatOrderNo = lastOrder?.order.orderNo ?? trackedOrderNo ?? null;
  const chatOrderToken =
    (orderStatus?.invoiceWebUrl ?? lastOrder?.order.invoiceWebUrl ?? "").split("/invoice/")[1]?.split(/[?#]/)[0] || null;
  const chatLabel = chatOrderId
    ? (orderStatus?.fulfillment === "delivery"
        ? "Delivery"
        : orderStatus?.fulfillment === "takeaway"
          ? "Take away"
          : (orderStatus?.tableLabel ?? qrContext.tableLabel))
    : canChooseFulfillment
      ? `${isDelivery ? "Delivery" : "Take away"}${guestName.trim() ? ` · ${guestName.trim()}` : ""}`.slice(0, 40)
      : qrContext.tableLabel;
  // Ongkir di luar service & pajak (sama dengan server).
  // Ongkir per km (rumus sama dengan server): lokasi pelanggan → jarak dari Garage.
  const deliveryQuoteResult = deliveryQuote(
    {
      baseFee: billingSettings.deliveryFee,
      baseKm: billingSettings.deliveryBaseKm,
      perKmFee: billingSettings.deliveryPerKmFee,
      maxKm: billingSettings.deliveryMaxKm,
    },
    billingSettings.deliveryOrigin ?? null,
    customerLocation,
  );
  const deliveryOutOfRange = isDelivery && !deliveryQuoteResult.ok;
  const deliveryFee = isDelivery && deliveryQuoteResult.ok ? deliveryQuoteResult.fee : 0;
  // Poin member: maks = saldo & % harga menu setelah promo/voucher (sama dgn server).
  const maxPointsUsable =
    mode === "member" && member && !staffOrder
      ? maxRedeemablePoints({
          balance: member.points ?? member.totalPoints,
          base: Math.max(0, regularSubtotal - promoDiscount - voucherDiscount),
          pointValue: billingSettings.memberPointValue,
          maxPct: billingSettings.memberRedeemMaxPct,
        })
      : 0;
  const canUsePoints = maxPointsUsable >= billingSettings.memberRedeemMinPoints;
  const pointsUsed = usePoints && canUsePoints ? maxPointsUsable : 0;
  // Semua potongan (promo, voucher, poin) hanya dari menu reguler; paket event tetap utuh (sama dgn server).
  const regularDiscount = Math.min(regularGrossTotal, promoDiscount + voucherDiscount);
  const pointsDiscount = Math.min(
    Math.max(0, regularGrossTotal - regularDiscount),
    pointsUsed * billingSettings.memberPointValue,
  );
  const total = Math.max(0, regularGrossTotal - regularDiscount - pointsDiscount) + packageSubtotal + deliveryFee;
  const itemCount = cartLines.reduce((sum, line) => sum + line.qty, 0);

  // Daftar Pilihan bertahan saat reload / sempat keluar ke website (audit F2): sessionStorage per outlet & meja.
  const cartStoreKey = savedCartKey(qrContext.outletId, qrContext.tableLabel);
  const cartRestored = useRef(false);
  useEffect(() => {
    if (cartRestored.current || !menuItems.length) return;
    cartRestored.current = true;
    // QR "Tunjukkan ke Waiter" (?daftar=...) menang atas simpanan lokal: waiter langsung mendapat daftar pelanggan.
    const params = new URLSearchParams(window.location.search);
    const daftarParam = params.get("daftar");
    const fromQr = daftarParam ? decodeDaftar(daftarParam, menuItems) : null;
    if (daftarParam) {
      params.delete("daftar");
      const rest = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    }
    if (fromQr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- isi sekali dari QR pelanggan setelah mount
      setCart(fromQr.cart);
      setCartNotes(fromQr.notes);
      const count = Object.values(fromQr.cart).reduce((sum, qty) => sum + qty, 0);
      setMessage(`Daftar Pilihan pelanggan dimuat (${count} item). Cek jumlah & catatan, lalu kirim.`);
      return;
    }
    const saved = readSavedCart(cartStoreKey, menuItems);
    if (!saved) return;
    setCart((current) => (Object.keys(current).length ? current : saved.cart));
    setCartNotes((current) => (Object.keys(current).length ? current : saved.notes));
  }, [cartStoreKey, menuItems]);
  useEffect(() => {
    if (!cartRestored.current) return;
    writeSavedCart(cartStoreKey, cart, cartNotes);
  }, [cartStoreKey, cart, cartNotes]);

  // Ukur navigasi bawah (HP) & kolom tengah (desktop) untuk jalur aman AYA.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".gm5-bottom-nav");
    const main = document.getElementById("menu-v5-main");
    const measure = () => {
      if (nav && nav.offsetHeight) setNavHeight(nav.offsetHeight);
      if (main && window.matchMedia(DESKTOP_QUERY).matches) {
        const rect = main.getBoundingClientRect();
        setLaneX({ min: Math.round(rect.left), max: Math.round(rect.right) });
      } else setLaneX(undefined);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (nav) observer.observe(nav);
    if (main) observer.observe(main);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Tab navigasi bawah mengikuti posisi gulir (Beranda di atas, Menu setelah turun).
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setNavTab((tab) => (tab === "home" || tab === "menu" ? (window.scrollY < 240 ? "home" : "menu") : tab));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  /** Lembar (checkout/bantuan) ditutup → tab navigasi bawah kembali mengikuti posisi gulir. */
  function releaseNavTab() {
    setNavTab((tab) => (tab === "list" || tab === "info" ? (window.scrollY < 240 ? "home" : "menu") : tab));
  }
  const allowedPaymentMethods: CustomerPaymentMethod[] = isDelivery ? ["QRIS"] : customerPaymentMethods;
  const phoneDigits = guestPhone.replace(/\D/g, "");
  const deliveryPhoneMissing = isDelivery && mode === "guest" && phoneDigits.length < 8;
  const deliveryAddressMissing = isDelivery && deliveryAddress.trim().length < 10;
  const deliveryBelowMin =
    isDelivery && billingSettings.deliveryMinSpend > 0 && subtotal < billingSettings.deliveryMinSpend;
  const discountLabel = mode === "member" ? "Voucher member" : "Promo QR";
  const loginHref = `/member-login?next=${encodeURIComponent(returnPath)}`;
  const guestNameMissing = !staffOrder && mode === "guest" && !guestName.trim();
  const showGuestNameError = guestNameMissing && guestNameTouched;
  // Nomor WhatsApp guest OPSIONAL — tidak memblok checkout.
  const memberMissing = mode === "member" && !member;
  const soldOutCartLine = cartLines.find((line) => line.item.stock === "sold_out");
  const hasEventCartLines = cartLines.some(line => line.item.id.startsWith("event:") || (line.variant as EventDisplayVariant).eventPrice);
  const staleEventLine = eventContext && cartLines.find(line => {
    const entryId = line.item.id.startsWith("event:") ? line.item.id.slice(6) : (line.variant as EventDisplayVariant).eventEntryId;
    const entry = eventContext.entries.find(row => row.id === entryId);
    return entry && !eventEntryAvailable(entry, eventContext.products, eventNow);
  });
  const eventTimeUnavailable = Boolean(eventContext && (eventNow < Date.parse(eventContext.startsAt) || eventNow >= Date.parse(eventContext.endsAt)));
  const eventUnavailable = Boolean(eventContext && (eventContext.preview || staleEventLine || (eventTimeUnavailable && (!mainEventMenu || hasEventCartLines))));
  const cashPaymentLabel =
    effectiveOrderType === "takeaway" ? "Bayar di kasir" : "Bayar di Meja / Kasir";
  const paymentProviderValue =
    paymentMethod === "QRIS"
      ? qrisProvider
      : paymentMethod === "Bank Transfer"
        ? selectedBank
          ? `${selectedBank.bank} ${selectedBank.number}`
          : "Transfer"
        : "";
  const canCheckout =
    cartLines.length > 0 &&
    !busy &&
    pendingRestored &&
    !uncertainSubmission &&
    !guestNameMissing &&
    !memberMissing &&
    !soldOutCartLine &&
    !eventUnavailable &&
    orderingOpen &&
    !qrContext.tableIssue &&
    !(needsTable && !tableHold) &&
    !deliveryPhoneMissing &&
    !deliveryAddressMissing &&
    !deliveryBelowMin &&
    !deliveryOutOfRange;
  const checkoutBlockReason = uncertainSubmission
    ? "Periksa pesanan sebelumnya sebelum mengirim pesanan baru."
    : eventUnavailable
    ? mainEventMenu ? "Paket atau harga event di keranjang sudah tidak berlaku. Muat ulang menu sebelum melanjutkan." : "Menu event belum dibuka atau sudah berakhir. Kembali ke menu reguler untuk pesanan baru."
    : qrContext.tableIssue
    ? qrContext.tableIssue
    : needsTable && !tableHold
    ? "Pilih meja dulu."
    : deliveryOutOfRange && !deliveryQuoteResult.ok
    ? deliveryQuoteResult.reason
    : deliveryBelowMin
    ? `Minimal belanja delivery ${rupiah.format(billingSettings.deliveryMinSpend)}.`
    : deliveryPhoneMissing
    ? "Isi nomor WhatsApp untuk delivery."
    : deliveryAddressMissing
    ? "Isi alamat pengantaran lengkap."
    : !orderingOpen
    ? "Kasir belum buka. Order bisa dikirim setelah outlet buka."
    : memberMissing
    ? "Login member untuk lanjut."
    : soldOutCartLine
      ? `${soldOutCartLine.item.name} sedang habis. Hapus dari keranjang.`
      : guestNameMissing
        ? "Lengkapi nama customer."
        : "";
  const channelLabel =
    effectiveOrderType === "takeaway"
      ? "Takeaway"
      : effectiveOrderType === "delivery"
        ? "Delivery"
        : "Dine-in";
  // Delivery: tanpa estimasi waktu (keputusan owner).
  const etaLabel =
    effectiveOrderType === "takeaway"
      ? "Siap ambil 15–20 menit"
      : effectiveOrderType === "delivery"
        ? "Diantar kurir Garage"
        : "Diantar ke meja";

  // Paket berisi rokok → konfirmasi 21+ dulu (sekali per sesi); menu biasa tetap bebas.
  function openBundle(entry: EventMenuEntry) {
    if (eventContext && bundleHasRestricted(entry, eventContext.products) && !bundleAgeConfirmed()) setAgeGateEntry(entry);
    else setBundleEntry(entry);
  }

  function add(itemId: string, variantId: string, delta: number) {
    const item = menuItems.find((entry) => entry.id === itemId);
    const displayVariant = item?.variants.find(row => row.id === variantId) as EventDisplayVariant | undefined;
    const entry = eventContext?.entries.find((row) => `event:${row.id}` === itemId || row.id === displayVariant?.eventEntryId);
    if (delta > 0 && entry && !eventEntryAvailable(entry, eventContext!.products)) {
      setMessage("Menu event sedang tidak tersedia atau jadwalnya sudah berakhir.");
      return;
    }
    if (delta > 0 && entry?.kind === "bundle" && variantId === "event") {
      setDetailItem(null);
      openBundle(entry);
      return;
    }
    if (delta > 0 && item?.stock === "sold_out") {
      setMessage(`${item.name} sedang habis.`);
      return;
    }

    if (delta > 0 && item) {
      if (mainEventMenu && displayVariant?.eventPrice) setMenuItems(current => current.map(row => row.id === item.id ? item : row));
      const variant = item.variants.find((entry) => entry.id === variantId);
      const name = variant && item.variants.length > 1 ? `${item.name} (${variant.label})` : item.name;
      showToast({ tone: "success", title: name, detail: "masuk Daftar Pilihan" });
      if (item.stock === "limited") showToast({ tone: "warning", title: "Stok terbatas", detail: `${item.name} tinggal sedikit.` });
      const press = lastPressRef.current;
      if (press && press.el.isConnected && performance.now() - press.at < 800) flyToList(press.el);
    }
    if (delta !== 0) playMenuSfx(delta > 0 ? "add" : "remove", { staff: Boolean(staffOrder) });

    const key = cartKey(itemId, variantId);
    setCart((current) => {
      const nextQty = Math.max(0, (current[key] ?? 0) + delta);
      const next = { ...current };
      if (nextQty === 0) delete next[key];
      else next[key] = nextQty;
      // Bersihkan catatan kalau item dihapus dari keranjang.
      if (nextQty === 0) {
        setCartNotes((notes) => {
          if (!(key in notes)) return notes;
          const copy = { ...notes };
          delete copy[key];
          return copy;
        });
      }
      return next;
    });
  }

  function setLineNote(itemId: string, variantId: string, value: string) {
    const key = cartKey(itemId, variantId);
    setCartNotes((notes) => ({ ...notes, [key]: value.slice(0, 160) }));
  }

  function openCheckout() {
    // Mode Daftar Pilihan: pelanggan tidak checkout sendiri (server juga menolak).
    if (waiterList) {
      openShowWaiter();
      return;
    }
    setMessage("");
    setLastOrder(null);
    setOrderStatus(null);
    if (!cartLines.length) {
      setMessage("Pilih menu terlebih dahulu.");
      return;
    }
    setCheckoutOpen(true);
    void refreshOrderingStatus();
  }

  async function checkVoucher() {
    const code = voucherCode.trim();
    if (!code) {
      setVoucherResult({
        valid: false,
        code: "",
        title: null,
        discount: 0,
        message: "Masukkan kode voucher.",
      });
      return;
    }

    setVoucherBusy(true);
    try {
      const result = await postJson<VoucherValidation>("/api/vouchers/validate", {
        code,
        subtotal: regularSubtotal,
        customerMode: mode,
      });
      setVoucherResult(result);
    } catch (error) {
      setVoucherResult({
        valid: false,
        code,
        title: null,
        discount: 0,
        message: error instanceof Error ? error.message : "Voucher gagal dicek.",
      });
    } finally {
      setVoucherBusy(false);
    }
  }

  function adoptCustomerOrder(result: CustomerOrderCreateResponse, submitted?: FrozenEventSubmission) {
    const cartUnchanged = !submitted || submitted.cartSignature === JSON.stringify(cart) || !cartLines.length;
    if (cartUnchanged) {
      setCart({});
      setCartNotes({});
      setCustomerNote("");
      setPaymentReference("");
    }
    clearPendingSubmission();
    setCheckoutOpen(false);
    setMessage(`${result.order.orderNo} masuk ke kasir. Pembayaran menunggu konfirmasi.${cartUnchanged ? "" : " Perubahan keranjang belum dikirim."}`);
    setLastOrder(result);
    const submittedTable = submitted?.payload.tableLabel ?? qrContext.tableLabel;
    if (needsTable && tableHold && result.joinCode && submittedTable === tableHold.tableLabel) {
      saveTableHold({ ...tableHold, mode: "join", token: null, joinCode: result.joinCode, expiresAt: null });
    }
    adoptChatTokenForOrder(result.order.id);
    try {
      window.localStorage.setItem("garage:trackedOrder", JSON.stringify({ id: result.order.id, orderNo: result.order.orderNo }));
    } catch { /* localStorage tidak tersedia */ }
  }

  async function recoverPreviousOrder() {
    if (!uncertainSubmission || busy || eventContext?.preview) return;
    const frozen = uncertainSubmission;
    setBusy(true);
    try {
      // Reconcile the original attempt even if the event ended or the cart was edited.
      const result = await postJson<CustomerOrderCreateResponse>("/api/customer/orders", frozen.payload, frozen.key);
      adoptCustomerOrder(result, frozen);
    } catch (error) {
      if (error instanceof ApiError && checkoutRejectionIsDefinitive(error.code, error.status)) {
        clearPendingSubmission();
        if (error.code?.startsWith("TABLE_")) {
          saveTableHold(null);
          setCheckoutOpen(false);
        }
        setMessage(`${error.message} Pesanan sebelumnya tidak dapat dibuat. Muat ulang menu sebelum mencoba lagi.`);
      } else {
        setMessage(error instanceof ApiError && !checkoutNeedsRecovery(error.status) ? `${error.message} Hubungi kasir untuk memastikan pesanan sebelumnya sebelum membuat pesanan baru.` : "Konfirmasi pesanan sebelumnya belum diterima. Periksa kembali dengan tombol di bawah; jangan kirim pesanan baru.");
      }
    } finally { setBusy(false); }
  }

  async function checkout() {
    if (busy || uncertainSubmission || !pendingRestored) return;
    let attemptedSubmission: FrozenEventSubmission | undefined;
    setBusy(true);
    setMessage("");
    setLastOrder(null);
    setOrderStatus(null);
    try {
      if (eventUnavailable) {
        throw new Error("Menu event belum dibuka atau sudah berakhir. Silakan kembali ke menu reguler.");
      }
      if (!cartLines.length) {
        throw new Error("Pilih menu terlebih dahulu.");
      }
      if (memberMissing) {
        throw new Error("Login member diperlukan untuk checkout member.");
      }
      if (soldOutCartLine) {
        throw new Error(`${soldOutCartLine.item.name} sedang habis. Hapus dari keranjang.`);
      }
      if (guestNameMissing) {
        throw new Error("Nama customer wajib diisi.");
      }

      if (staffOrder) {
        const sent = await postJson<CustomerOrderCreateResponse>("/api/waiter/orders", {
          tableLabel: qrContext.tableLabel,
          outletId: qrContext.outletId,
          customerNote: customerNote.trim() || undefined,
          customerName: guestName.trim() || undefined,
          items: cartLines.map((line) => ({
            itemId: line.item.id,
            variantId: line.variant.id,
            qty: line.qty,
            note: line.note.trim() || undefined,
          })),
        });
        setCart({});
        setGuestName("");
        setCartNotes({});
        setCustomerNote("");
        setCheckoutOpen(false);
        setStaffSentOrderNo(sent.order.orderNo);
        setMessage("");
        return;
      }

      const existingChatToken = existingGenericChatToken();
      const orderPayload = {
        orderType: effectiveOrderType,
        tableLabel: isDelivery ? undefined : qrContext.tableLabel,
        tableHoldToken: needsTable && tableHold?.mode === "new" ? tableHold.token ?? undefined : undefined,
        tableJoinCode: needsTable && tableHold?.mode === "join" ? tableHold.joinCode ?? undefined : undefined,
        guestPhone: mode === "guest" && phoneDigits.length >= 8 ? guestPhone.trim() : undefined,
        deliveryAddress: isDelivery
          ? [deliveryAddress.trim(), deliveryLandmark.trim() ? `Patokan: ${deliveryLandmark.trim()}` : ""]
              .filter(Boolean)
              .join(" — ")
          : undefined,
        customerLat: isDelivery ? customerLocation?.lat : undefined,
        customerLng: isDelivery ? customerLocation?.lng : undefined,
        outletId: qrContext.outletId,
        customerMode: mode,
        guestName: mode === "guest" ? guestName.trim() : undefined,
        customerNote: customerNote.trim() || undefined,
        source: qrContext.source,
        campaign: qrContext.campaign,
        voucherCode: voucherCode.trim() || undefined,
        pointsToRedeem: pointsUsed > 0 ? pointsUsed : undefined,
        paymentMethod,
        paymentProvider: paymentProviderValue || undefined,
        paymentReference: paymentReference.trim() || undefined,
        chatToken: existingChatToken,
        ...(eventContext && (!mainEventMenu || !eventTimeUnavailable) ? {
          eventId: eventContext.eventId,
          eventItems: cartLines.filter(line => !mainEventMenu || line.item.id.startsWith("event:")).map((line) => ({
            entryId: line.item.id.slice("event:".length),
            qty: line.qty,
            note: line.note.trim() || undefined,
            selections: eventSelections[line.variant.id],
          })),
        } : {}),
        items: eventContext && !mainEventMenu ? [] : cartLines.filter(line => !line.item.id.startsWith("event:")).map((line) => ({
          itemId: line.item.id,
          variantId: line.variant.id,
          qty: line.qty,
          note: line.note.trim() || undefined,
        })),
      };
      if (orderPayload.eventId) {
        const fingerprint = JSON.stringify(orderPayload);
        if (eventSubmission.current?.fingerprint !== fingerprint) eventSubmission.current = freezeEventSubmission(orderPayload, randomId("checkout"), JSON.stringify(cart));
        attemptedSubmission = eventSubmission.current;
        try { window.sessionStorage.setItem(pendingStorageKey, JSON.stringify(attemptedSubmission)); } catch { /* In-memory retry protection remains active. */ }
      }
      const result = await postJson<CustomerOrderCreateResponse>("/api/customer/orders", attemptedSubmission?.payload ?? orderPayload, attemptedSubmission?.key);
      adoptCustomerOrder(result, attemptedSubmission);
      playMenuSfx("checkout-success", { staff: Boolean(staffOrder) });
    } catch (error) {
      playMenuSfx("checkout-error", { staff: Boolean(staffOrder) });
      showToast({ tone: "error", title: "Pesanan gagal dikirim.", detail: error instanceof Error ? error.message : undefined });
      if (attemptedSubmission && checkoutNeedsRecovery(error instanceof ApiError ? error.status : undefined)) {
        setUncertainSubmission(attemptedSubmission);
        setMessage("Konfirmasi pesanan belum diterima. Periksa pesanan sebelumnya sebelum mengirim lagi agar pesanan tidak ganda.");
      } else {
        clearPendingSubmission();
        setMessage(error instanceof Error ? error.message : "Checkout gagal.");
      }
      // Meja tidak valid lagi (diambil orang lain / kode salah) → pilih meja ulang.
      if (error instanceof ApiError && error.code?.startsWith("TABLE_")) {
        saveTableHold(null);
        setCheckoutOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const recoveryPanel = uncertainSubmission ? (
    <section className="rounded-lg border border-garage-amber/50 bg-garage-bg-2 p-3 sm:p-4" aria-label="Pemulihan pesanan sebelumnya">
      <p className="text-sm font-bold text-garage-fg">Pastikan pesanan sebelumnya terlebih dahulu</p>
      <p className="mt-1 text-sm leading-relaxed text-garage-dim">Koneksi terputus saat mengirim. Tombol ini memeriksa percobaan yang sama, termasuk setelah jadwal event berakhir.</p>
      {eventContext?.preview ? <Link href={qrContext.outletId ? `/order?outletId=${encodeURIComponent(qrContext.outletId)}` : "/order"} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-garage-line px-4 text-sm font-bold text-white hover:bg-garage-bg-3">Periksa di menu utama</Link> : <button type="button" disabled={busy} onClick={() => void recoverPreviousOrder()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-garage-red px-4 text-sm font-bold text-white hover:bg-garage-red-bright disabled:cursor-wait disabled:opacity-60 sm:w-auto">{busy ? "Memeriksa…" : "Periksa pesanan sebelumnya"}</button>}
    </section>
  ) : null;

  const searching = normalizedQuery.length > 0;
  const bundleItems = useMemo(() => menuItems.filter(item => item.id.startsWith("event:") && item.productType === "bundle"), [menuItems]);
  const menuGroups = useMemo(() => buildMenuGroups(menuItems.filter(item => !item.id.startsWith("event:") || item.productType !== "bundle")), [menuItems]);
  // Banner atas: item "Unggulan" pilihan admin → kalau belum ada, item promo → Terlaris.
  const hero = useMemo<{ kind: HeroKind; items: MenuItem[] }>(() => {
    if (bundleItems.length) return { kind: "featured", items: [] };
    const available = menuItems.filter((item) => item.stock !== "sold_out" && !item.id.startsWith("event:"));
    const featured = available.filter((item) => item.featured);
    if (featured.length) return { kind: "featured", items: featured.slice(0, 8) };
    const promo = available.filter(itemHasPromo);
    if (promo.length) return { kind: "promo", items: promo.slice(0, 8) };
    const best = (bestSellerIds ?? [])
      .map((id) => available.find((item) => item.id === id))
      .filter((item): item is MenuItem => Boolean(item))
      .slice(0, 6);
    return { kind: "best", items: best };
  }, [bestSellerIds, menuItems, bundleItems.length]);
  const heroLabel = hero.kind === "featured" ? "Unggulan" : hero.kind === "promo" ? "Promo" : "Terlaris";
  const categoryTabs = useMemo<CategoryTab[]>(
    () => [
      ...(bundleItems.length ? [{ id: "menu-paket-event", label: "Paket Bundling" }] : []),
      ...(hero.items.length ? [{ id: HERO_SECTION_ID, label: heroLabel }] : []),
      ...menuGroups.map((group) => ({ id: categorySectionId(group.category), label: group.category })),
    ],
    [bundleItems.length, hero.items.length, heroLabel, menuGroups],
  );

  const regularMenu = useMemo(() => menuItems.filter((item) => !item.id.startsWith("event:")), [menuItems]);
  const v5Categories = useMemo<CategoryLink[]>(
    () => menuGroups.map((group) => ({ id: categorySectionId(group.category), label: group.category, photo: categoryPhoto(regularMenu, group.category) })),
    [menuGroups, regularMenu],
  );
  const heroPhotos = useMemo(() => heroPhotoItems(hero.items, regularMenu), [hero.items, regularMenu]);
  const v5SectionIds = useMemo(() => v5Categories.map((category) => category.id), [v5Categories]);
  const activeSection = useActiveSection(v5SectionIds);
  const v5Chips = useMemo(() => {
    const chips = availableChips(regularMenu, bestSellerSet, favorites.ids);
    return chips.includes(menuChip) ? chips : [...chips, menuChip];
  }, [regularMenu, bestSellerSet, favorites.ids, menuChip]);
  const chipItems = useMemo(
    () => filterByChip(regularMenu, menuChip, bestSellerSet, favorites.ids),
    [regularMenu, menuChip, bestSellerSet, favorites.ids],
  );
  const v5GridClass = menuView === "list" ? MENU_LIST_V5 : MENU_GRID_V5;
  const heroChip: MenuChip = hero.kind === "featured" ? "signature" : hero.kind === "promo" ? "promo" : "best";

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Sisakan ruang untuk CategoryNav yang sticky.
    window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - 120), behavior: reduce ? "auto" : "smooth" });
  }

  function toggleFavorite(itemId: string) {
    playMenuSfx(favorites.has(itemId) ? "favorite-off" : "favorite-on", { staff: Boolean(staffOrder) });
    favorites.toggle(itemId);
  }

  // Kartu V5 = komponen terpisah yang menerima aksi sebagai prop (bukan closure di render).
  const renderV5Card = (item: MenuItem, index: number) => (
    <V5CardSlot
      key={item.id}
      item={item}
      index={index}
      layout={menuView}
      cartQty={itemCartQty(item, cart)}
      popular={bestSellerSet.has(item.id)}
      favorite={favorites.ids.includes(item.id)}
      onToggleFavorite={toggleFavorite}
      onAdd={add}
      onOpen={openMenuItem}
    />
  );

  function smoothTop() {
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function chooseChip(chip: MenuChip) {
    setMenuChip(chip);
    setDrawerOpen(false);
    setNavTab(chip === "favorite" ? "favorite" : chip === "all" ? "home" : "menu");
    window.requestAnimationFrame(() => scrollToSection("menu-v5-results"));
  }

  function jumpToCategory(id: string | undefined) {
    setMenuChip("all");
    setDrawerOpen(false);
    setNavTab("menu");
    if (id) window.requestAnimationFrame(() => scrollToSection(id));
  }

  function goHome() {
    setMenuChip("all");
    setDrawerOpen(false);
    setNavTab("home");
    smoothTop();
  }

  function openList() {
    setDrawerOpen(false);
    setNavTab("list");
    setDaftarOpen(true);
  }

  function onBottomNav(tab: BottomNavTab) {
    if (tab === "home") return goHome();
    if (tab === "menu") return jumpToCategory(v5Categories[0]?.id);
    if (tab === "favorite") return chooseChip("favorite");
    if (tab === "list") return openList();
    setNavTab("info");
    if (qrContext.orderType === "dine-in" && !staffOrder) setHelpOpen(true);
    else setAyaChatOpen(true);
  }

  function focusMenuSearch() {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Cari menu"]');
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ block: "center" });
  }

  function openMenuItem(item: MenuItem, variantId?: string) {
    const entry = eventContext?.entries.find(row => row.kind === "bundle" && `event:${row.id}` === item.id);
    if (entry) openBundle(entry);
    else {
      setDetailVariant(variantId ?? null);
      setDetailItem(item);
      playMenuSfx("quickview-open", { staff: Boolean(staffOrder) });
    }
  }

  /** URL Pesankan waiter berisi Daftar Pilihan (hanya dine-in dengan nomor meja). */
  function buildWaiterQrUrl() {
    const label = tableHold?.tableLabel ?? infoTableLabel ?? qrContext.tableLabel;
    const table = effectiveOrderType === "dine-in" ? label.match(/\d+/)?.[0] : null;
    if (!table) return null;
    const params = new URLSearchParams({ table, mode: "waiter", daftar: encodeDaftar(cart, cartNotes) });
    if (qrContext.outletId) params.set("outletId", qrContext.outletId);
    return `${window.location.origin}/order?${params.toString()}`;
  }

  function openShowWaiter() {
    setDaftarOpen(false);
    setWaiterQrUrl(buildWaiterQrUrl());
    setShowWaiterOpen(true);
  }

  /** Tombol utama Daftar Pilihan: Checkout (pesan sendiri) atau Tunjukkan ke Waiter (mode Daftar Pilihan). */
  function daftarPrimary() {
    if (waiterList) return openShowWaiter();
    setDaftarOpen(false);
    openCheckout();
  }

  // ---------------------------------------------------------------------------
  // Navigasi pintar AYA (master prompt §8): buka kategori/filter/bantuan, sorot, bisa dibatalkan.
  // Setelah pelanggan menekan "Batalkan", AYA hanya menawarkan tombol (tidak pindah otomatis lagi).
  // ---------------------------------------------------------------------------
  function handleAyaNavigate(nav: AyaNav) {
    ayaSpotlightCleanup.current?.();
    ayaNavReturn.current = { scrollY: window.scrollY, chip: menuChip };
    let targetId: string | null = null;
    let note: string | undefined;
    if (nav.kind === "category") {
      const match = v5Categories.find((category) => category.label.toLowerCase() === nav.category.toLowerCase());
      if (match) {
        jumpToCategory(match.id);
        targetId = match.id;
      } else note = `Kategori ${nav.category} belum ada di menu outlet ini.`;
    } else if (nav.kind === "chip") {
      chooseChip(nav.chip);
      targetId = "menu-v5-results";
    } else if (qrContext.orderType === "dine-in" && !staffOrder) {
      setHelpOpen(true);
      note = "Pilih jenis bantuan, waiter akan datang ke mejamu.";
    } else {
      note = "Silakan menuju kasir — staf kami siap membantu.";
    }
    setAyaNavGuide({ id: Date.now(), label: nav.label, note });
    if (targetId) {
      const id = targetId;
      window.setTimeout(() => {
        ayaSpotlightCleanup.current = spotlightElement(id);
      }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 60 : 450);
    }
  }

  function dismissAyaNav() {
    setAyaNavGuide(null);
  }

  function cancelAyaNav() {
    ayaSpotlightCleanup.current?.();
    ayaSpotlightCleanup.current = null;
    const back = ayaNavReturn.current;
    if (back) {
      setMenuChip(back.chip);
      window.requestAnimationFrame(() => window.scrollTo({ top: back.scrollY, behavior: "auto" }));
    }
    setAyaAutoNav(false);
    try {
      window.sessionStorage.setItem("garage:aya-autonav", "off");
    } catch {
      /* abaikan */
    }
    setAyaNavGuide(null);
  }

  function backToAya() {
    ayaSpotlightCleanup.current?.();
    setAyaNavGuide(null);
    setAyaChatOpen(true);
    setAyaExpandToken((value) => value + 1);
  }

  function clearDaftar() {
    setCart((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key.startsWith("event:"))));
    setCartNotes({});
  }

  const billLines = (
    <>
      {packageSubtotal > 0 ? <>
        <BillLine label="Paket event (harga final)" value={rupiah.format(packageSubtotal)} />
        {regularSubtotal > 0 ? <BillLine label="Menu reguler" value={rupiah.format(regularSubtotal)} /> : null}
      </> : <BillLine label="Subtotal" value={rupiah.format(subtotal)} />}
      {service > 0 ? <BillLine label="Service" value={rupiah.format(service)} /> : null}
      {tax > 0 ? <BillLine label="PB1" value={rupiah.format(tax)} /> : null}
      {roundingAdjustment !== 0 ? (
        <BillLine
          label="Pembulatan"
          value={`${roundingAdjustment > 0 ? "+" : "-"} ${rupiah.format(Math.abs(roundingAdjustment))}`}
        />
      ) : null}
      {discount > 0 ? <BillLine label={discountLabel} value={`- ${rupiah.format(discount)}`} /> : null}
      {voucherDiscount > 0 ? (
        <BillLine label="Voucher tambahan" value={`- ${rupiah.format(voucherDiscount)}`} />
      ) : null}
      {pointsDiscount > 0 ? (
        <BillLine label={`Poin member (${pointsUsed} poin)`} value={`- ${rupiah.format(pointsDiscount)}`} />
      ) : null}
      {deliveryFee > 0 ? <BillLine label="Ongkir (Tebing Tinggi)" value={rupiah.format(deliveryFee)} /> : null}
    </>
  );

  const inputClass =
    "h-11 w-full rounded-md border bg-garage-bg-2 px-3.5 text-base text-white outline-none transition-colors placeholder:text-garage-mute focus:border-garage-amber";

  const checkoutContent = (
    <>
      {canChooseFulfillment ? (
        <section className="rounded-lg border border-garage-line bg-garage-bg-2/60 p-3.5">
          <p className="text-sm font-bold text-white">Cara pesan</p>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-garage-line bg-garage-bg-1 p-1" role="radiogroup" aria-label="Cara pesan">
            {(
              [
                ["takeaway", "Take away", "Ambil di Garage", ShoppingBag],
                [
                  "delivery",
                  "Delivery",
                  deliveryAvailable
                    ? `Ongkir mulai ${rupiah.format(billingSettings.deliveryFee)}`
                    : billingSettings.deliveryUnavailableReason ?? "Sedang tidak tersedia",
                  Bike,
                ],
              ] as const
            ).map(([value, label, hint, Icon]) => {
              const selected = (value === "delivery" ? isDelivery : !isDelivery);
              const disabled = value === "delivery" && !deliveryAvailable;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => {
                    setFulfillment(value);
                    // Delivery wajib bayar QRIS dulu (tanpa COD).
                    if (value === "delivery") setPaymentMethod("QRIS");
                  }}
                  className={`garage-press flex min-h-12 items-center gap-2 rounded-sm px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected ? "bg-garage-red text-white" : "text-garage-dim hover:bg-garage-bg-3"
                  }`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{label}</span>
                    <span className={`block text-xs ${selected ? "text-white/85" : "text-garage-mute"}`}>{hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {isDelivery ? (
            <div className="mt-3 grid gap-3">
              <ul className="list-disc space-y-0.5 pl-5 text-sm leading-6 text-garage-dim">
                <li>
                  {billingSettings.deliveryMinSpend > 0
                    ? `Minimal belanja ${rupiah.format(billingSettings.deliveryMinSpend)}`
                    : "Tanpa minimal belanja"}{" "}
                  · ongkir {rupiah.format(billingSettings.deliveryFee)}
                  {billingSettings.deliveryOrigin
                    ? ` untuk ${billingSettings.deliveryBaseKm.toLocaleString("id-ID")} km pertama, +${rupiah.format(
                        billingSettings.deliveryPerKmFee,
                      )}/km berikutnya${
                        billingSettings.deliveryMaxKm > 0 ? ` (maks ${billingSettings.deliveryMaxKm.toLocaleString("id-ID")} km)` : ""
                      }`
                    : ""}
                  .
                </li>
                <li>Wajib bayar QRIS dulu; pesanan dibuat & diantar setelah pembayaran dicek kasir.</li>
                <li>{billingSettings.deliveryAreaNote}</li>
              </ul>
              {billingSettings.deliveryCouriersBusy ? (
                <p className="rounded-md border border-garage-amber/50 bg-garage-amber/10 px-3 py-2 text-sm font-semibold text-white" role="status">
                  Semua kurir sedang mengantar. Pesananmu masuk antrean dan diantar kurir berikutnya yang selesai.
                </p>
              ) : null}
              {deliveryBelowMin ? (
                <p className="rounded-md border border-garage-amber/50 bg-garage-amber/10 px-3 py-2 text-sm font-semibold text-white" role="alert">
                  Tambah belanja {rupiah.format(Math.max(0, billingSettings.deliveryMinSpend - subtotal))} lagi untuk delivery.
                </p>
              ) : null}
              {mode === "guest" ? (
                <label className="grid gap-1.5">
                  <span className="text-sm font-bold text-garage-dim">No. WhatsApp</span>
                  <input
                    value={guestPhone}
                    onChange={(event) => setGuestPhone(event.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    className={`${inputClass} border-garage-line`}
                    placeholder="08xxxxxxxxxx"
                  />
                </label>
              ) : null}
              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-garage-dim">Alamat lengkap</span>
                <textarea
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  rows={3}
                  maxLength={240}
                  autoComplete="street-address"
                  className="w-full rounded-md border border-garage-line bg-garage-bg-2 px-3.5 py-2.5 text-base text-white outline-none transition-colors placeholder:text-garage-mute focus:border-garage-amber"
                  placeholder="Jalan, nomor rumah, kelurahan"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-garage-dim">Patokan (opsional)</span>
                <input
                  value={deliveryLandmark}
                  onChange={(event) => setDeliveryLandmark(event.target.value)}
                  maxLength={50}
                  className={`${inputClass} border-garage-line`}
                  placeholder="Contoh: depan masjid, pagar hijau"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={requestCustomerLocation}
                  disabled={locationState === "loading"}
                  className={`garage-press inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold transition-colors ${
                    customerLocation
                      ? "border-garage-amber/60 bg-garage-amber/12 text-[#ffd79a]"
                      : "border-garage-line-2 bg-garage-bg-2 text-white hover:bg-garage-bg-3"
                  }`}
                >
                  <MapPin className="size-4" aria-hidden />
                  {locationState === "loading"
                    ? "Mencari lokasi…"
                    : customerLocation
                      ? "Lokasi tersimpan ✓"
                      : "Pakai lokasi saya (opsional)"}
                </button>
                <span className="text-xs text-garage-dim">
                  {locationState === "denied"
                    ? "Izin lokasi ditolak — alamat saja cukup, ongkir dasar berlaku."
                    : billingSettings.deliveryOrigin
                      ? "Ongkir dihitung dari jarak lokasi Anda ke Garage."
                      : "Membantu kurir & menampilkan jarak kurir ke Anda."}
                </span>
              </div>
              {deliveryQuoteResult.ok && deliveryQuoteResult.distanceKm != null ? (
                <p className="rounded-md border border-white/12 bg-garage-bg-2 px-3 py-2 text-sm text-white" role="status">
                  Jarak ± <strong>{deliveryQuoteResult.distanceKm.toLocaleString("id-ID")} km</strong> · ongkir{" "}
                  <strong className="font-mono tabular-nums">{rupiah.format(deliveryQuoteResult.fee)}</strong>
                </p>
              ) : null}
              {!deliveryQuoteResult.ok ? (
                <p className="rounded-md border border-garage-red/55 bg-garage-red/12 px-3 py-2 text-sm font-semibold text-[#ffc9c9]" role="alert">
                  {deliveryQuoteResult.reason} Silakan pilih Take away.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-garage-dim">
              Ambil di Garage. Bayar QRIS/Transfer dulu atau bayar di kasir — pesanan dibuat setelah lunas.
            </p>
          )}
        </section>
      ) : null}

      {/* 1. PESANAN — review item: ubah qty, catatan per item, rincian tagihan. */}
      <section className="rounded-lg border border-garage-line bg-garage-bg-2/60 p-3.5">
        <StepHeading
          step={1}
          title="Pesanan"
          aside={
            <span className="font-mono text-sm font-bold tabular-nums text-garage-dim">{itemCount} item</span>
          }
        />
        <div className="mt-2">
          <CartList lines={cartLines} onAdjust={add} onNote={setLineNote} />
        </div>
        <div className="mt-2 space-y-1.5 border-t border-garage-line pt-3 text-sm">{billLines}</div>
      </section>

      {staffOrder ? (
        <section className="rounded-lg border border-garage-line bg-garage-bg-2/60 p-3.5 text-sm leading-6 text-garage-dim">
          Dipesan oleh <strong className="text-white">{staffOrder.name}</strong> untuk{" "}
          <strong className="text-white">{qrContext.tableLabel}</strong>. Pesanan masuk ke kasir untuk
          divalidasi; pembayaran di kasir saat bill.
          <label className="mt-3 grid gap-1.5">
            <span className="text-sm font-bold text-garage-dim">Nama tamu (opsional)</span>
            <input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              maxLength={40}
              className={`${inputClass} border-garage-line`}
              placeholder="Dicetak di chit Bar/Dapur bersama nomor meja"
              autoComplete="off"
            />
          </label>
        </section>
      ) : (
        <>
      {/* 2. DATA PEMESAN */}
      <section className="rounded-lg border border-garage-line bg-garage-bg-2/60 p-3.5">
        <StepHeading step={2} title="Data pemesan" />
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-md border border-garage-line bg-garage-bg-1 p-1" role="radiogroup" aria-label="Jenis pemesan">
          {(
            [
              ["guest", "Guest", "Tanpa login", ShoppingBag],
              ["member", "Member", member ? `${member.level} · ${number.format(member.totalPoints)} pts` : "Kumpulkan poin", User],
            ] as const
          ).map(([value, label, hint, Icon]) => {
            const selected = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(value)}
                className={`garage-press flex min-h-12 cursor-pointer items-center gap-2 rounded-sm px-3 text-left transition-colors ${
                  selected ? "bg-garage-red text-white" : "text-garage-dim hover:bg-garage-bg-3"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{label}</span>
                  <span className={`block truncate text-xs ${selected ? "text-white/85" : "text-garage-mute"}`}>
                    {hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {mode === "guest" ? (
          <label className="mt-3 grid gap-1.5">
            <span className="text-sm font-bold text-garage-dim">Nama</span>
            <input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              onBlur={() => setGuestNameTouched(true)}
              aria-invalid={showGuestNameError}
              aria-describedby={showGuestNameError ? "guest-name-error" : undefined}
              className={`${inputClass} ${showGuestNameError ? "border-garage-red/70" : "border-garage-line"}`}
              placeholder="Nama untuk dipanggil"
              autoComplete="name"
            />
            {showGuestNameError ? (
              <span id="guest-name-error" role="alert" className="text-sm font-semibold text-[#ffb3b3]">
                Nama wajib diisi.
              </span>
            ) : null}
          </label>
        ) : member ? (
          <div className="mt-3 rounded-md border border-garage-line bg-garage-bg-1 p-3">
            <p className="text-sm font-bold text-white">{member.name}</p>
            <p className="mt-0.5 font-mono text-sm tabular-nums text-garage-dim">{member.phone}</p>
            <div className="mt-3 rounded-md border border-garage-amber/40 bg-garage-amber/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Pakai poin</p>
                  <p className="mt-0.5 text-xs text-garage-dim">
                    Saldo {number.format(member.points ?? member.totalPoints)} poin · 1 poin = {rupiah.format(billingSettings.memberPointValue)}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={usePoints && canUsePoints}
                  disabled={!canUsePoints}
                  onClick={() => setUsePoints((value) => !value)}
                  className={`garage-press h-9 shrink-0 rounded-full px-4 text-sm font-bold transition-colors disabled:opacity-50 ${
                    usePoints && canUsePoints
                      ? "bg-garage-amber text-black"
                      : "border border-garage-amber/50 text-white"
                  }`}
                >
                  {usePoints && canUsePoints ? "Dipakai" : "Pakai"}
                </button>
              </div>
              <p className="mt-2 text-xs text-white">
                {canUsePoints
                  ? usePoints
                    ? `Potongan ${rupiah.format(pointsDiscount)} (${pointsUsed} poin).`
                    : `Bisa potong sampai ${rupiah.format(maxPointsUsable * billingSettings.memberPointValue)} (${maxPointsUsable} poin).`
                  : (member.points ?? member.totalPoints) < billingSettings.memberRedeemMinPoints
                    ? `Poin bisa dipakai mulai ${billingSettings.memberRedeemMinPoints} poin.`
                    : "Tambah pesanan untuk bisa memakai poin."}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-garage-amber/40 bg-garage-amber/10 p-3">
            <p className="text-sm font-semibold text-white">Login member untuk mengumpulkan poin.</p>
            <Link
              href={loginHref}
              className="garage-press mt-3 flex h-11 items-center justify-center gap-2 rounded-md border border-garage-amber/50 text-sm font-bold text-white transition-colors hover:bg-garage-amber/15"
            >
              <LogIn size={15} />
              Login member
            </Link>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {!showVoucherField && !voucherResult ? (
            <button
              type="button"
              onClick={() => setShowVoucherField(true)}
              className="garage-press inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-md border border-garage-line-2 px-3 text-sm font-semibold text-white transition-colors hover:bg-garage-bg-3"
            >
              <TicketPercent className="size-4 text-garage-amber" /> Kode promo
            </button>
          ) : null}
          {!showNoteField && !customerNote ? (
            <button
              type="button"
              onClick={() => setShowNoteField(true)}
              className="garage-press inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-md border border-garage-line-2 px-3 text-sm font-semibold text-white transition-colors hover:bg-garage-bg-3"
            >
              <Plus className="size-4 text-garage-amber" /> Catatan pesanan
            </button>
          ) : null}
        </div>

        {showVoucherField || voucherResult ? (
          <div className="mt-3">
            <label htmlFor="order-voucher" className="text-sm font-bold text-garage-dim">
              Kode voucher / promo
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="order-voucher"
                value={voucherCode}
                onChange={(event) => {
                  setVoucherCode(event.target.value);
                  setVoucherResult(null);
                }}
                className={`${inputClass} min-w-0 flex-1 border-garage-line uppercase placeholder:normal-case`}
                placeholder="Masukkan kode"
                autoComplete="off"
              />
              <button
                type="button"
                className="garage-press h-11 shrink-0 cursor-pointer rounded-md border border-garage-line-2 px-4 text-sm font-bold text-white transition-colors hover:bg-garage-bg-3 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={voucherBusy || !subtotal}
                onClick={() => void checkVoucher()}
              >
                {voucherBusy ? "Cek…" : "Pakai"}
              </button>
            </div>
            {voucherResult ? (
              <p className={`mt-2 text-sm ${voucherResult.valid ? "text-[#bbf7d0]" : "text-[#ffb3b3]"}`}>
                {voucherResult.message}
                {voucherResult.valid ? ` Diskon ${rupiah.format(voucherResult.discount)}.` : ""}
              </p>
            ) : null}
          </div>
        ) : null}

        {showNoteField || customerNote ? (
          <label className="mt-3 grid gap-1.5">
            <span className="text-sm font-bold text-garage-dim">Catatan pesanan</span>
            <input
              value={customerNote}
              onChange={(event) => setCustomerNote(event.target.value)}
              className={`${inputClass} border-garage-line`}
              placeholder="Contoh: tidak pedas, gula sedikit"
            />
          </label>
        ) : null}
      </section>

      {/* 3. PEMBAYARAN */}
      <section className="rounded-lg border border-garage-line bg-garage-bg-2/60 p-3.5">
        <StepHeading step={3} title="Pembayaran" />
        <div
          className={`mt-3 grid gap-2 ${allowedPaymentMethods.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}
          role="radiogroup"
          aria-label="Metode pembayaran"
        >
          {allowedPaymentMethods.map((method) => {
            const label =
              method === "Cash"
                ? effectiveOrderType === "takeaway"
                  ? "Bayar di kasir"
                  : "Tunai"
                : method === "QRIS"
                  ? "QRIS"
                  : "Transfer";
            const Icon = method === "Cash" ? Banknote : method === "QRIS" ? QrCode : Landmark;
            const selected = paymentMethod === method;
            return (
              <button
                key={method}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`garage-press flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border px-2 text-sm font-bold transition-colors ${
                  selected
                    ? "border-garage-red bg-garage-red/15 text-white"
                    : "border-garage-line bg-garage-bg-1 text-garage-dim hover:border-garage-line-2 hover:text-white"
                }`}
                onClick={() => {
                  setPaymentMethod(method);
                  setPaymentReference("");
                }}
              >
                <Icon className={`size-5 ${selected ? "text-garage-amber" : ""}`} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>

        {paymentMethod === "Cash" ? (
          <p className="mt-3 text-sm leading-6 text-garage-dim">
            <strong className="text-white">{cashPaymentLabel}</strong> —{" "}
            {effectiveOrderType === "takeaway"
              ? "datang & bayar langsung di kasir Garage. Pesanan dibuat setelah lunas."
              : "bayar tunai langsung ke staf. Kasir mengonfirmasi sebelum pesanan diproses."}
          </p>
        ) : effectiveOrderType !== "dine-in" ? (
          <p className="mt-3 text-sm leading-6 text-garage-dim">
            Pesanan dibuat setelah pembayaran dicek kasir. Setelah kirim pesanan, tekan{" "}
            <strong className="text-white">Kirim bukti bayar via WhatsApp</strong>.
          </p>
        ) : null}

        {paymentMethod === "QRIS" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-[132px_minmax(0,1fr)]">
            <div className="mx-auto w-[180px] rounded-md bg-white p-2 sm:w-auto">
              <Image
                src={qrisImagePath}
                alt="QRIS GARAGE"
                width={220}
                height={220}
                className="aspect-square w-full rounded-sm object-contain"
              />
            </div>
            <label className="grid content-start gap-1.5">
              <span className="text-sm font-bold text-garage-dim">Referensi QRIS (opsional)</span>
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                className={`${inputClass} border-garage-line`}
                placeholder="Nama / 4 digit ref"
              />
              <span className="text-sm leading-6 text-garage-dim">
                Kasir tetap mengecek mutasi/struk QRIS sebelum lunas.
              </span>
            </label>
          </div>
        ) : null}

        {paymentMethod === "Bank Transfer" ? (
          <div className="mt-3 grid gap-3">
            {customerBankAccounts.length === 0 ? (
              <p className="rounded-md border border-garage-amber/45 bg-garage-amber/10 px-3 py-2.5 text-sm text-[#ffd79a]">
                Rekening transfer belum diatur. Tanyakan nomor rekening ke kasir, atau pilih QRIS.
              </p>
            ) : (
              <>
                {customerBankAccounts.length > 1 ? (
                  <label className="grid gap-1.5">
                    <span className="text-sm font-bold text-garage-dim">Rekening tujuan</span>
                    <select
                      value={selectedBank?.id ?? ""}
                      onChange={(event) => setPaymentProvider(event.target.value)}
                      className={`${inputClass} border-garage-line`}
                    >
                      {customerBankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.bank} - {account.holder}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="rounded-md border border-garage-line bg-garage-bg-1 px-3 py-2.5 text-sm text-garage-dim" data-testid="bank-account-card">
                  <p className="font-bold text-white">{selectedBank?.bank}</p>
                  <p className="mt-0.5">
                    No. rekening:{" "}
                    <span className="font-mono text-base font-bold tabular-nums text-white">{selectedBank?.number}</span>
                  </p>
                  <p className="mt-0.5">a.n. {selectedBank?.holder}</p>
                </div>
              </>
            )}
            <label className="grid gap-1.5">
              <span className="text-sm font-bold text-garage-dim">Referensi transfer (opsional)</span>
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                className={`${inputClass} border-garage-line`}
                placeholder="Nama pengirim / no. ref"
              />
            </label>
          </div>
        ) : null}
      </section>

        </>
      )}

      {recoveryPanel}
      {message ? (
        <p className="rounded-md border border-garage-red/45 bg-garage-red/12 p-3 text-sm leading-6 text-[#ffd6d6]" role="alert">
          {message}
        </p>
      ) : null}
    </>
  );

  const checkoutFooter = (
    <div className="border-t border-garage-line bg-garage-bg-1 p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-garage-dim">Total estimasi</p>
          <p className="font-mono text-xl font-bold tabular-nums text-white">{rupiah.format(total)}</p>
        </div>
        <button
          className="garage-press flex h-12 min-w-[168px] cursor-pointer items-center justify-center gap-2 rounded-md bg-garage-red px-4 text-[15px] font-bold text-white transition-colors hover:bg-garage-red-bright disabled:cursor-not-allowed disabled:opacity-60"
          onClick={checkout}
          disabled={!canCheckout}
        >
          <Send className="size-4" aria-hidden />
          {busy ? "Mengirim…" : "Kirim ke kasir"}
        </button>
      </div>
      {!canCheckout && checkoutBlockReason ? (
        <p className="mt-2 text-right text-sm font-semibold text-[#ffb3b3]">{checkoutBlockReason}</p>
      ) : null}
    </div>
  );

  const v5Sidebar = (
    <SidebarV5
      categories={v5Categories}
      chips={v5Chips}
      activeChip={menuChip}
      activeSection={activeSection}
      favoriteCount={favorites.ids.length}
      listCount={itemCount}
      onHome={goHome}
      onJump={jumpToCategory}
      onChip={chooseChip}
      onOpenList={openList}
      onRecommend={staffOrder ? undefined : () => { setDrawerOpen(false); setAyaChatOpen(true); }}
      member={member ? { name: member.name, points: member.points ?? member.totalPoints ?? null } : null}
      memberHref={loginHref}
      registerHref={`${loginHref}&mode=register`}
      pointsPerThousand={billingSettings.pointsPerThousand}
      orderingOpen={staffOrder ? undefined : orderingOpen}
      staff={Boolean(staffOrder)}
    />
  );

  const invoiceButtonClass =
    "garage-press inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-bold transition-colors sm:w-auto";

  return (
    <main
      className="gm5 garage-shell min-h-screen overflow-x-clip pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-white lg:pb-12"
    >
      <div className="mx-auto w-full max-w-[1560px] px-4 sm:px-6">
        <HeaderV5
          dineIn={effectiveOrderType === "dine-in"}
          tableLabel={infoTableLabel ?? qrContext.tableLabel}
          tableCode={compactTableNumber(infoTableLabel ?? qrContext.tableLabel)}
          onTable={waiterList && effectiveOrderType === "dine-in" ? () => setTableInfoOpen(true) : undefined}
          channelLabel={channelLabel}
          loginHref={loginHref}
          memberName={member?.name}
          staff={staffOrder}
          onOpenDrawer={() => setDrawerOpen(true)}
          onSearch={focusMenuSearch}
          onAya={staffOrder ? undefined : () => setAyaChatOpen(true)}
          notice={
            staffOrder || (!trackId && !chatUnread)
              ? null
              : {
                  count: chatUnread,
                  label: chatUnread ? "Chat kasir" : "Status pesanan",
                  onOpen: () => (chatUnread ? setChatOpen(true) : smoothTop()),
                }
          }
          info={etaLabel}
          titleLevel={eventContext && !mainEventMenu ? 2 : 1}
          nav={[
            { key: "home", label: "Beranda", onSelect: goHome, current: menuChip === "all" && navTab !== "menu" && !activeSection },
            {
              key: "menu",
              label: "Menu",
              onSelect: () => jumpToCategory(v5Categories[0]?.id),
              current: menuChip === "all" && (navTab === "menu" || Boolean(activeSection)),
              menu: v5Categories.map((category) => ({ key: category.id, label: category.label, icon: categoryIcon(category.label, "size-4 text-[#ede6dc]"), onSelect: () => jumpToCategory(category.id) })),
            },
            ...(hero.items.length ? [{ key: "pick", label: "Rekomendasi", onSelect: () => jumpToCategory(HERO_SECTION_ID) }] : []),
            ...(v5Chips.includes("promo") ? [{ key: "promo", label: "Promo", onSelect: () => chooseChip("promo"), current: menuChip === "promo" }] : []),
            { key: "about", label: "Tentang", href: "/" },
          ]}
        />
        {eventContext ? <div className="my-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-garage-amber/35 bg-garage-bg-2 px-4 py-2.5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="text-sm font-semibold text-garage-amber">{eventContext.preview ? "Preview internal" : eventTimeUnavailable ? "Periode event selesai" : "Spesial event"}</p><p className="break-words text-base font-bold text-white">{eventContext.title}</p></div><p className="mt-1 text-sm leading-5 text-garage-dim">{eventContext.preview ? "Tinjau tampilan. Pengiriman order dinonaktifkan." : eventTimeUnavailable ? "Muat ulang untuk melihat menu dan harga yang berlaku saat ini." : mainEventMenu ? "Paket pilihan dan menu satuan, satu keranjang." : "Harga khusus event sesuai periode yang berlaku."}</p></div>{eventTimeUnavailable && mainEventMenu ? <button type="button" disabled={Boolean(uncertainSubmission)} onClick={() => window.location.reload()} className="min-h-11 shrink-0 rounded-md border border-garage-line-2 px-4 text-sm font-bold text-white hover:bg-garage-bg-3 disabled:opacity-40">Muat ulang menu</button> : !mainEventMenu ? <Link href="/order" className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-garage-line-2 px-4 text-sm font-bold text-white hover:bg-garage-bg-3">Menu utama</Link> : null}</div> : null}
        {uncertainSubmission ? <div className="mb-3">{recoveryPanel}</div> : null}

        {!voucherResult?.valid && qrContext.campaign === "landing_menu" ? (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-garage-amber/40 bg-garage-amber/10 px-3.5 py-3">
            <TicketPercent className="size-5 shrink-0 text-garage-amber" aria-hidden />
            <p className="min-w-0 text-sm text-garage-dim">
              <strong className="text-white">Welcome QR — diskon Rp 5.000</strong> otomatis terpakai untuk
              transaksi pertama.
            </p>
          </div>
        ) : null}

        <div className="mt-3 grid gap-6 lg:grid-cols-[208px_minmax(0,1fr)_300px] lg:items-start xl:grid-cols-[236px_minmax(0,1fr)_340px]">
          <aside className="gm5-side-scroll hidden lg:sticky lg:top-3 lg:block lg:max-h-[calc(100svh-24px)] lg:overflow-y-auto lg:overscroll-contain lg:pb-2" aria-label="Panel navigasi">
            {v5Sidebar}
          </aside>
          <div id="menu-v5-main" className="min-w-0">
            {!staffOrder && !qrContext.tableIssue ? (
              <div className="mb-3 space-y-2" role="status">
                {/* Pembeda tipe pesanan: Makan di tempat / Take away / Delivery. */}
                <div data-aya-anchor="order-type" className="flex flex-wrap items-center gap-2 rounded-lg border border-garage-line bg-garage-bg-1 p-2.5">
                  <div className="flex min-w-[130px] flex-1 items-center gap-2.5"><span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-garage-line text-garage-amber">{effectiveOrderType === "takeaway" ? <ShoppingBag className="size-5" aria-hidden /> : effectiveOrderType === "delivery" ? <Bike className="size-5" aria-hidden /> : <UtensilsCrossed className="size-5" aria-hidden />}</span><div className="min-w-0"><p className="text-sm font-bold text-garage-fg">{effectiveOrderType === "takeaway" ? "Take away" : effectiveOrderType === "delivery" ? "Delivery" : qrContext.tableLabel}</p><p className="text-sm text-garage-dim">{effectiveOrderType === "takeaway" ? "Ambil di kasir" : effectiveOrderType === "delivery" ? "Diantar ke alamatmu" : "Diantar ke meja"}</p></div></div>
                  {qrContext.chooseType && typeChosen && !lastOrder ? <button type="button" aria-label="Ubah tipe pesanan" onClick={() => setTypeChosen(false)} className="garage-press min-h-11 shrink-0 rounded-md border border-garage-line px-3 text-sm font-bold text-garage-fg hover:bg-garage-bg-3 focus-visible:outline-2 focus-visible:outline-garage-amber">Ubah</button> : null}
                  {canChooseFulfillment ? <ChatLaunchButton compact label="Chat kasir (take away & delivery)" unread={chatUnread} onClick={() => setChatOpen(true)} /> : null}
                </div>
                {needsTable && tableHold ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/12 bg-garage-bg-1 px-3 py-2">
                    <p className="min-w-0 text-sm text-garage-dim">
                      {tableHold.mode === "join" ? (
                        <>
                          Gabung di <strong className="text-white">{tableHold.tableLabel}</strong> dengan kode teman semeja.
                        </>
                      ) : (
                        <>
                          <strong className="text-white">{tableHold.tableLabel}</strong> dikunci untukmu sampai checkout.
                        </>
                      )}
                    </p>
                    {!lastOrder ? (
                      <button
                        type="button"
                        onClick={() => setTablePickerRequested(true)}
                        className="garage-press min-h-11 rounded-md border border-white/20 px-3 text-sm font-bold text-white hover:bg-white/10"
                      >
                        Ganti meja
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {waiterList && effectiveOrderType === "dine-in" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/12 bg-garage-bg-1 px-3 py-2">
                    <p className="min-w-0 flex-1 text-sm leading-5 text-garage-dim">
                      {infoTableLabel ? (
                        <>
                          Kamu melihat menu untuk <strong className="text-white">{infoTableLabel}</strong>. Penanda untuk waiter, bukan pesanan.
                        </>
                      ) : (
                        <>Pilih nomor mejamu supaya waiter tahu kamu duduk di mana (tidak membuat pesanan).</>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setTableInfoOpen(true)}
                      className="garage-press min-h-11 rounded-md border border-white/20 px-3 text-sm font-bold text-white hover:bg-white/10"
                    >
                      {infoTableLabel ? "Ubah meja" : "Pilih meja"}
                    </button>
                  </div>
                ) : null}
                {qrContext.tableHint ? <p className="px-1 text-sm leading-6 text-garage-dim">{qrContext.tableHint}</p> : null}
              </div>
            ) : null}
            {qrContext.tableIssue ? (
              <div
                className="mb-4 flex items-start gap-3 rounded-md border border-garage-red-bright/55 bg-garage-red/12 px-3.5 py-3"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#ff8a8a]" aria-hidden />
                <div className="min-w-0 text-sm leading-6">
                  <p className="font-bold text-white">Meja belum dikenali</p>
                  <p className="text-garage-dim">{qrContext.tableIssue}</p>
                </div>
              </div>
            ) : null}
            {!orderingOpen ? (
              <div
                className="mb-4 flex items-start gap-3 rounded-md border border-garage-amber/50 bg-garage-amber/10 px-3.5 py-3"
                role="status"
              >
                <Clock className="mt-0.5 size-5 shrink-0 text-garage-amber" aria-hidden />
                <div className="min-w-0 text-sm leading-6">
                  <p className="font-bold text-white">Outlet belum buka</p>
                  <p className="text-garage-dim">
                    Menu tetap bisa dilihat dan dipilih. Pesanan bisa dikirim setelah kasir membuka shift
                    &mdash; halaman ini menyesuaikan otomatis.
                  </p>
                </div>
              </div>
            ) : null}

                        {message && !checkoutOpen ? (
              <div
                className="mb-4 rounded-md border border-garage-amber/40 bg-garage-amber/10 p-3.5 text-sm leading-6 text-garage-fg"
                role="status"
              >
                {message}
              </div>
            ) : null}

            {staffOrder && staffSentOrderNo ? (
              <section
                className="mb-5 rounded-lg border border-garage-success/35 bg-garage-bg-1 p-4"
                role="status"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#86efac]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-white">
                      <span className="font-mono tabular-nums">{staffSentOrderNo}</span> terkirim ke kasir
                    </p>
                    <p className="mt-1 text-sm text-garage-dim">
                      {qrContext.tableLabel} · menunggu validasi kasir, lalu masuk Bar/Dapur.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link
                    href={staffOrder.backHref}
                    className="garage-press inline-flex h-11 items-center justify-center rounded-md bg-garage-red text-sm font-bold text-white hover:bg-garage-red-bright"
                  >
                    Kembali ke meja
                  </Link>
                  <button
                    type="button"
                    onClick={() => setStaffSentOrderNo(null)}
                    className="garage-press inline-flex h-11 items-center justify-center rounded-md border border-garage-line-2 text-sm font-bold text-white hover:bg-garage-bg-3"
                  >
                    Tambah pesanan
                  </button>
                </div>
              </section>
            ) : null}

            {!staffOrder && !lastOrder && trackedOrderId && orderStatus ? (
              <section className="mb-5 rounded-lg border border-garage-success/35 bg-garage-bg-1 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#86efac]" />
                  <div className="min-w-0">
                    <p className="text-base font-bold text-white">
                      Status pesanan{" "}
                      <span className="font-mono tabular-nums">{trackedOrderNo ?? orderStatus.orderNo}</span>
                    </p>
                    <p className="mt-1 text-sm leading-6 text-garage-dim">{orderStatus.message}</p>
                  </div>
                </div>
                <OrderTracker status={orderStatus} />
                {orderStatus.tableJoin ? (
                  <div className="mt-3">
                    <TableJoinCodeCard tableLabel={orderStatus.tableJoin.tableLabel} joinCode={orderStatus.tableJoin.joinCode} />
                  </div>
                ) : null}
                <ChatLaunchButton label="Tanya kasir soal pesanan ini" unread={chatUnread} onClick={() => setChatOpen(true)} />
                <OrderPushButton orderId={trackedOrderId} orderToken={chatOrderToken} />
                {orderStatus.invoiceWebUrl ? (
                  <a
                    href={orderStatus.invoiceWebUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`${invoiceButtonClass} mt-4 border-garage-line-2 text-white hover:bg-garage-bg-3`}
                  >
                    <FileText size={16} />
                    Buka halaman tracking
                  </a>
                ) : null}
              </section>
            ) : null}

            {!staffOrder && lastOrder ? (
              <section className="mb-5 rounded-lg border border-garage-success/35 bg-garage-bg-1 p-4">
                {(() => {
                  const invoicePdfUrl = customerInvoicePdfUrl(orderStatus, lastOrder);
                  const invoiceWebUrl = customerInvoiceWebUrl(orderStatus, lastOrder);
                  const whatsappInvoiceUrl = customerWhatsappInvoiceUrl(orderStatus, lastOrder);
                  return (
                    <>
                      <div className="flex items-start gap-3">
                        <SuccessCheckV5 className="mt-0.5 size-9 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="gm5-title text-lg leading-tight text-[#86efac]">Berhasil!</p>
                          <p className="text-base font-bold text-white">
                            <span className="font-mono tabular-nums">{lastOrder.order.orderNo}</span> menunggu
                            validasi kasir
                          </p>
                          <p className="mt-1 text-sm leading-6 text-garage-dim">
                            {orderStatus?.message ??
                              `${qrContext.tableLabel} sudah diterima sistem. Kasir akan accept sebelum masuk kitchen.`}
                          </p>
                          <span className="mt-2 inline-flex rounded-sm border border-garage-line-2 px-2 py-0.5 text-xs font-bold text-garage-dim">
                            {lastOrder.order.paymentMethod ?? "Cash"}
                          </span>
                          <OrderTracker status={orderStatus} />
                          {(orderStatus?.tableJoin?.joinCode ?? lastOrder.joinCode) && lastOrder.order.fulfillment === "dine-in" ? (
                            <div className="mt-3">
                              <TableJoinCodeCard
                                tableLabel={orderStatus?.tableJoin?.tableLabel ?? lastOrder.order.tableLabel}
                                joinCode={(orderStatus?.tableJoin?.joinCode ?? lastOrder.joinCode) as string}
                              />
                            </div>
                          ) : null}
                          <ChatLaunchButton label="Tanya kasir soal pesanan ini" unread={chatUnread} onClick={() => setChatOpen(true)} />
                          <OrderPushButton orderId={lastOrder.order.id} orderToken={chatOrderToken} />
                          {mode !== "guest" ? (
                            <p className="mt-3 text-sm font-semibold text-white">{lastOrder.memberCta}</p>
                          ) : null}
                        </div>
                      </div>
                      {lastOrder.order.paymentMethod && lastOrder.order.paymentMethod !== "Cash" && chatOrderToken ? (
                        <PaymentProofPanel
                          token={chatOrderToken}
                          order={lastOrder.order}
                          invoiceUrl={invoiceWebUrl && typeof window !== "undefined" ? new URL(invoiceWebUrl, window.location.origin).toString() : invoiceWebUrl}
                          garageWhatsapp={billingSettings.garageWhatsapp}
                          alreadyPaid={orderStatus?.orderStatus === "paid"}
                        />
                      ) : null}
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        {invoiceWebUrl ? (
                          <a
                            href={invoiceWebUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`${invoiceButtonClass} border-garage-line-2 text-white hover:bg-garage-bg-3`}
                          >
                            <FileText size={16} />
                            Buka tracking invoice
                          </a>
                        ) : invoicePdfUrl ? (
                          <a
                            href={invoicePdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`${invoiceButtonClass} border-garage-line-2 text-white hover:bg-garage-bg-3`}
                          >
                            <FileText size={16} />
                            Buka PDF invoice
                          </a>
                        ) : (
                          <span className={`${invoiceButtonClass} border-garage-line text-garage-mute`}>
                            <FileText size={16} />
                            Tracking belum dibuat
                          </span>
                        )}
                        {whatsappInvoiceUrl ? (
                          <a
                            href={whatsappInvoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`${invoiceButtonClass} border-garage-success/45 text-[#dcfce7] hover:bg-garage-success/12`}
                          >
                            <MessageCircle size={16} />
                            Kirim link invoice WA
                          </a>
                        ) : (
                          <span className={`${invoiceButtonClass} border-garage-line text-garage-mute`}>
                            <MessageCircle size={16} />
                            WA belum siap
                          </span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </section>
            ) : null}

            {!searching ? (
              <>
                <HeroV5
                  items={heroPhotos}
                  onSeeMenu={() => jumpToCategory(hero.items.length ? HERO_SECTION_ID : v5Categories[0]?.id)}
                  onOpenItem={openMenuItem}
                  ctaLabel={heroCtaLabel({ waiterList, orderingOpen, staff: Boolean(staffOrder) })}
                  eta={staffOrder ? undefined : etaLabel}
                />
                <CategoryTilesV5 categories={v5Categories} onJump={jumpToCategory} />
              </>
            ) : null}

            <div className="mt-4">
              <CategoryNav
                query={query}
                onQueryChange={setQuery}
                tabs={categoryTabs}
                resultCount={filteredMenu.length}
                onTabSelect={(id) => {
                  if (menuChip === "all") return false;
                  jumpToCategory(id);
                  return true;
                }}
              />
            </div>

            <div id="menu-v5-results" className="scroll-mt-[124px]">
              <FilterChipsV5 chips={v5Chips} active={menuChip} onChange={chooseChip} layout={menuView} onLayout={setMenuView} />
            </div>

            {loading ? (
              <div className={`${MENU_GRID_CLASS} gm5-skeleton pt-5`} role="status" aria-label="Memuat menu">
                {Array.from({ length: 6 }).map((_, index) => (
                  <MenuCardSkeleton key={index} />
                ))}
              </div>
            ) : searching ? (
              filteredMenu.length ? (
                <div className={`${v5GridClass} pt-4`}>{filteredMenu.map(renderV5Card)}</div>
              ) : (
                <div className="mt-6 flex flex-col items-center rounded-lg border border-dashed border-garage-line-2 p-8 text-center">
                  <Search className="size-7 text-garage-mute" aria-hidden />
                  <p className="mt-3 text-base font-bold text-white">Menu tidak ditemukan</p>
                  <p className="mt-1 text-sm text-garage-dim">Coba kata lain, misalnya &ldquo;latte&rdquo; atau &ldquo;nasi&rdquo;.</p>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="garage-press mt-4 h-11 cursor-pointer rounded-md border border-garage-line-2 px-4 text-sm font-bold text-white transition-colors hover:bg-garage-bg-3"
                  >
                    Hapus pencarian
                  </button>
                </div>
              )
            ) : menuChip !== "all" ? (
              <section className="pt-5" aria-label={CHIP_LABEL[menuChip]}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="gm5-title gm5-section-title text-[22px] leading-none text-white">{CHIP_LABEL[menuChip]}</h2>
                  <button type="button" onClick={() => chooseChip("all")} className="min-h-11 cursor-pointer px-2 text-sm font-semibold text-[#ede6dc] hover:text-white">
                    Semua menu
                  </button>
                </div>
                {chipItems.length ? (
                  <div className={`${v5GridClass} mt-4`}>{chipItems.map(renderV5Card)}</div>
                ) : (
                  <div className="gm5-panel mt-4 flex flex-col items-center p-8 text-center">
                    <p className="text-base font-bold text-white">{menuChip === "favorite" ? "Belum ada favorit" : "Belum ada menu"}</p>
                    <p className="mt-1 text-sm text-[#cfc9c4]">
                      {menuChip === "favorite" ? "Ketuk ikon hati pada menu untuk menyimpannya di sini." : "Tidak ada menu di pilihan ini saat ini."}
                    </p>
                  </div>
                )}
              </section>
            ) : menuGroups.length || bundleItems.length ? (
              <>
                <EventBundleSection items={bundleItems} entries={eventContext?.entries ?? []} products={eventContext?.products ?? []} cart={cart} now={eventNow} onChoose={openMenuItem} />
                {hero.items.length ? (
                  <section id={HERO_SECTION_ID} data-order-section={heroLabel} className="scroll-mt-[124px] pt-6">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="gm5-title gm5-section-title text-[22px] leading-none text-white">Menu Pilihan</h2>
                      <button type="button" onClick={() => chooseChip(heroChip)} className="min-h-11 cursor-pointer px-2 text-sm font-semibold text-[#ede6dc] hover:text-white">
                        Lihat Semua →
                      </button>
                    </div>
                    <div className={`${v5GridClass} mt-4`}>{hero.items.map(renderV5Card)}</div>
                  </section>
                ) : null}
                {!staffOrder ? (
                  <div className="mt-6 lg:hidden">
                    <AyaCardV5 compact onAsk={() => setAyaChatOpen(true)} />
                  </div>
                ) : null}
                <MenuSectionList
                  v5
                  renderItem={renderV5Card}
                  gridClassName={v5GridClass}
                  groups={menuGroups}
                  cart={cart}
                  bestSellerSet={bestSellerSet}
                  onAdd={add}
                  onOpen={openMenuItem}
                />
                <p className="mt-8 border-t border-garage-line pt-4 text-center text-sm text-garage-mute">
                  {waiterList ? "Pesanan resmi dicatat waiter, lalu diproses dapur & bar." : "Pesanan dikonfirmasi kasir sebelum diproses dapur & bar."}
                </p>
              </>
            ) : (
              <div className="mt-6 rounded-lg border border-dashed border-garage-line-2 p-8 text-center text-sm text-garage-dim">
                Menu belum tersedia. Silakan hubungi staf GARAGE.
              </div>
            )}
          </div>

          <aside className="hidden lg:sticky lg:top-3 lg:flex lg:flex-col lg:gap-4" aria-label="Daftar Pilihan">
            <div className="gm5-panel flex max-h-[calc(100dvh-13rem)] flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="gm5-title gm5-section-title text-xl text-white">
                    Daftar Pilihan
                    {itemCount ? <span className="gm5-count gm5-pop" key={itemCount}>{itemCount}</span> : null}
                  </h2>
                  <p className="mt-1 text-sm text-[#cfc9c4]">
                    {channelLabel} · {qrContext.tableLabel}
                  </p>
                </div>
              </div>

              <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                <DaftarListV5 lines={cartLines} onAdjust={add} onEdit={(line) => openMenuItem(line.item, line.variant.id)} compact />
              </div>
              <div className="mt-3 shrink-0">
                <DaftarSummaryV5
                  waiterList={waiterList}
                  hasItems={cartLines.length > 0}
                  subtotal={subtotal}
                  total={total}
                  billLines={billLines}
                  onPrimary={daftarPrimary}
                  onClear={clearDaftar}
                />
              </div>
            </div>
            {!staffOrder ? <AyaCardV5 onAsk={() => setAyaChatOpen(true)} /> : null}
          </aside>
        </div>
      </div>

      <MenuToastStackV5 toasts={toasts} onDismiss={dismissToast} />
      <BottomNavV5 active={navTab} listCount={itemCount} listTotal={waiterList ? subtotal : total} onSelect={onBottomNav} staff={Boolean(staffOrder)} />

      {showScrollTop ? (
        <button
          type="button"
          aria-label="Kembali ke atas"
          className={`garage-press fixed right-4 z-30 hidden size-11 cursor-pointer items-center justify-center rounded-md border border-garage-line-2 bg-garage-bg-1/95 text-white shadow-[0_12px_32px_rgba(0,0,0,0.4)] transition-colors hover:border-garage-amber/60 lg:flex ${
            cartLines.length ? "bottom-[calc(8rem+env(safe-area-inset-bottom))] lg:bottom-6" : "bottom-5 lg:bottom-6"
          }`}
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            })
          }
        >
          <ChevronUp className="size-5" />
        </button>
      ) : null}

      <QuickViewV5
        item={detailItem}
        initialVariantId={detailVariant}
        cart={cart}
        notes={cartNotes}
        onAdjust={add}
        onNote={setLineNote}
        onClose={() => {
          setDetailItem(null);
          playMenuSfx("quickview-close", { staff: Boolean(staffOrder) });
        }}
      />
      <DaftarSheetV5
        open={daftarOpen}
        onOpenChange={(open) => {
          setDaftarOpen(open);
          if (!open) releaseNavTab();
        }}
        count={itemCount}
      >
        <DaftarListV5 lines={cartLines} onAdjust={add} onEdit={(line) => { setDaftarOpen(false); openMenuItem(line.item, line.variant.id); }} />
        <div className="mt-3">
          <DaftarSummaryV5
            waiterList={waiterList}
            hasItems={cartLines.length > 0}
            subtotal={subtotal}
            total={total}
            billLines={billLines}
            onPrimary={daftarPrimary}
            onClear={clearDaftar}
          />
        </div>
      </DaftarSheetV5>
      <ShowToWaiterSheetV5
        open={showWaiterOpen}
        onOpenChange={(open) => {
          setShowWaiterOpen(open);
          if (!open) releaseNavTab();
        }}
        lines={cartLines}
        subtotal={subtotal}
        tableLabel={tableHold?.tableLabel ?? qrContext.tableLabel}
        dineIn={effectiveOrderType === "dine-in"}
        qrUrl={waiterQrUrl}
        onCallWaiter={qrContext.orderType === "dine-in" ? () => void callService("call", "Panggilan waiter") : undefined}
        callBusy={helpBusy === "call"}
        callMessage={helpMessage || null}
      />
      {ageGateEntry ? <BundleAgeConfirm onCancel={() => setAgeGateEntry(null)} onConfirm={() => { setBundleEntry(ageGateEntry); setAgeGateEntry(null); }} /> : null}
      {bundleEntry && eventContext ? <EventBundlePicker key={bundleEntry.id} entry={bundleEntry} products={eventContext.products} now={eventNow} onClose={() => setBundleEntry(null)} onConfirm={(selections, label) => {
        const itemId = `event:${bundleEntry.id}`;
        const variantId = `bundle-${encodeURIComponent(JSON.stringify(selections))}`;
        setEventSelections((current) => ({ ...current, [variantId]: selections }));
        setMenuItems((current) => current.map((item) => item.id !== itemId || item.variants.some((variant) => variant.id === variantId) ? item : { ...item, variants: [...item.variants, { id: variantId, label, price: bundleEntry.price }] }));
        const key = cartKey(itemId, variantId);
        setCart((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
        setBundleEntry(null);
        showToast({ tone: "success", title: bundleEntry.name, detail: "masuk Daftar Pilihan" });
        playMenuSfx("add", { staff: Boolean(staffOrder) });
      }} /> : null}

      {!staffOrder ? (
        <AyaFloatingPet scope="order" guide={orderGuide.petGuide} onGuideExit={orderGuide.stop} laneBottom={isDesktop ? 12 : navHeight + 4} laneX={isDesktop ? laneX : undefined}>
          {({ close, hide }) =>
            orderGuide.active && orderGuide.step ? (
              <AyaGuideBubble
                title={orderGuide.step.title}
                text={orderGuide.step.text}
                index={orderGuide.index}
                total={orderGuide.total}
                onPrev={orderGuide.prev}
                onNext={orderGuide.next}
                onStop={() => {
                  orderGuide.stop();
                  close();
                }}
                onFinish={() => {
                  orderGuide.stop();
                  close();
                  requestAyaChirp("guideDone");
                }}
              />
            ) : (
              <AyaGreeting
                name={member?.name ?? guestName}
                heroLabel={hero.items.length ? heroLabel : null}
                onShowHero={() => scrollToSection(HERO_SECTION_ID)}
                onFocusSearch={focusMenuSearch}
                onHelp={qrContext.orderType === "dine-in" ? () => setHelpOpen(true) : undefined}
                onStartGuide={orderGuide.start}
                onChat={() => setAyaChatOpen(true)}
                onClose={close}
                onHide={hide}
              />
            )
          }
        </AyaFloatingPet>
      ) : null}

      {!staffOrder ? (
        <AyaChatV5
          open={ayaChatOpen}
          onOpenChange={(open) => {
            setAyaChatOpen(open);
            if (!open) releaseNavTab();
          }}
          items={regularMenu}
          bestSellerIds={bestSellerIds}
          onAdd={add}
          onOpenItem={(item) => {
            setAyaChatOpen(false);
            openMenuItem(item);
          }}
          onStartGuide={orderGuide.start}
          onStaff={qrContext.orderType === "dine-in" ? () => setHelpOpen(true) : canChooseFulfillment ? () => setChatOpen(true) : undefined}
          staffLabel={qrContext.orderType === "dine-in" ? (waiterList ? "Panggil waiter" : "Panggil staf") : "Chat kasir"}
          onNavigate={handleAyaNavigate}
          autoNavigate={ayaAutoNav}
          mode={waiterList ? "waiter_list" : "self_order"}
          tableLabel={effectiveOrderType === "dine-in" ? (tableHold?.tableLabel ?? infoTableLabel ?? qrContext.tableLabel) : null}
          historyScope={`${qrContext.outletId ?? "default"}:${qrContext.tableLabel}`}
          menuState={menuLoadFailed && !regularMenu.length ? "error" : loading && !regularMenu.length ? "loading" : "ready"}
          onRetryMenu={() => {
            setLoading(true);
            setMenuReload((value) => value + 1);
          }}
          expandToken={ayaExpandToken}
        />
      ) : null}

      {!staffOrder ? (
        <AyaNavGuideV5 guide={ayaNavGuide} onBackToAya={backToAya} onCancel={cancelAyaNav} onDismiss={dismissAyaNav} />
      ) : null}
      {!staffOrder ? <FullscreenExitV5 /> : null}
      {welcomeOpen ? (
        <WelcomeV5
          tableLabel={effectiveOrderType === "dine-in" ? (infoTableLabel ?? qrContext.tableLabel) : null}
          onDone={({ voice }) => {
            setWelcomeOpen(false);
            // Suara dipilih → sapaan suara sudah diputar oleh welcome; jangan dobel.
            if (!voice) requestAyaChirp("greeting");
          }}
        />
      ) : null}
      {waiterList ? (
        <TableInfoPickerV5
          open={tableInfoOpen}
          onOpenChange={setTableInfoOpen}
          outletId={qrContext.outletId}
          current={tableInfo ?? (infoTableLabel ? { tableNumber: infoTableLabel.match(/\d+/)?.[0]?.padStart(2, "0") ?? "", tableLabel: infoTableLabel } : null)}
          onConfirm={(info) => {
            setTableInfo(info);
            writeTableInfo(qrContext.outletId, info);
          }}
        />
      ) : null}

      {qrContext.orderType === "dine-in" && !staffOrder ? (
        <OrderHelpSheet
          open={helpOpen}
          onOpenChange={(open) => {
            setHelpOpen(open);
            if (!open) releaseNavTab();
          }}
          tableLabel={qrContext.tableLabel}
          busyType={helpBusy}
          message={helpMessage}
          onRequest={(type, label) => void callService(type, label)}
        >
          <ChatLaunchButton
            label="Chat langsung dengan kasir"
            unread={chatUnread}
            onClick={() => {
              setHelpOpen(false);
              setChatOpen(true);
            }}
          />
        </OrderHelpSheet>
      ) : null}

      {!staffOrder ? (
        <CustomerChatPanel
          tableLabel={chatLabel}
          orderId={chatOrderId}
          orderToken={chatOrderToken}
          orderNo={chatOrderNo}
          open={chatOpen}
          onOpenChange={setChatOpen}
          onUnreadChange={setChatUnread}
          hideTrigger
        />
      ) : null}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="gm5 z-[85] w-[86vw] max-w-[340px] overflow-y-auto border-[color:var(--gm5-line)] bg-[var(--menu-charcoal)] p-4 text-white">
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="sr-only">Navigasi menu</SheetTitle>
            <SheetDescription className="sr-only">Kategori, filter, favorit, dan informasi Garage Coffee.</SheetDescription>
          </SheetHeader>
          {v5Sidebar}
        </SheetContent>
      </Sheet>
      <Sheet
        open={checkoutOpen}
        onOpenChange={(open) => {
          setCheckoutOpen(open);
          if (!open) releaseNavTab();
        }}
      >
        <SheetContent
          side="bottom"
          className="inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[92svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border-garage-line bg-garage-bg-1 p-0 text-white sm:inset-x-4 sm:bottom-4 sm:w-[min(640px,calc(100vw-32px))] sm:rounded-xl sm:border"
        >
          <SheetHeader className="border-b border-garage-line p-4 text-left">
            <SheetTitle className="pr-8 font-sans text-xl font-bold text-white">
              Checkout · {isDelivery ? "Delivery" : qrContext.tableLabel}
            </SheetTitle>
            <SheetDescription className="text-sm text-garage-dim">
              {staffOrder
                ? "Cek pesanan lalu kirim ke kasir."
                : "Cek pesanan, isi nama, pilih pembayaran, lalu kirim ke kasir."}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-3 p-3 sm:p-4">{checkoutContent}</div>
          </div>
          {checkoutFooter}
        </SheetContent>
      </Sheet>
      {!staffOrder && !typeChosen ? (
        <OrderTypeChooser
          deliveryEnabled={billingSettings.deliveryEnabled}
          deliveryNote={billingSettings.deliveryUnavailableReason ?? null}
          onChoose={chooseOrderType}
        />
      ) : null}
      {showTablePicker ? (
        <CustomerTablePicker
          outletId={qrContext.outletId}
          current={tableHold}
          presetTable={tableHold ? null : qrContext.presetTable}
          onPicked={(hold) => {
            saveTableHold(hold);
            setTablePickerRequested(false);
            setMessage("");
          }}
          onClose={
            tableHold
              ? () => setTablePickerRequested(false)
              : qrContext.chooseType
                ? () => setTypeChosen(false)
                : undefined
          }
        />
      ) : null}
    </main>
  );
}
