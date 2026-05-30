"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ChevronUp,
  CheckCircle2,
  Clock,
  FileText,
  LogIn,
  MessageCircle,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingCart,
  TicketPercent,
  User,
  X,
} from "lucide-react";

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
import type { MemberLevel } from "@/lib/member-types";

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
};

type QrContext = {
  tableLabel: string;
  orderType: OrderType;
  source: "qr_table" | "qr_takeaway" | "instagram" | "campaign";
  outletId?: string;
  campaign?: string;
};

type CartLine = {
  item: MenuItem;
  variant: MenuItem["variants"][number];
  qty: number;
  key: string;
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

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("id-ID");

const customerPaymentMethods: CustomerPaymentMethod[] = ["Cash", "QRIS", "Bank Transfer"];
const customerBankAccounts = [
  { id: "BCA", label: "BCA - GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "BRI", label: "BRI - GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "BNI", label: "BNI - GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "BANK SUMUT", label: "BANK SUMUT - GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
];
const qrisProvider = "QRIS GARAGE";
const qrisImagePath = "/payments/qris-garage.png";

function cartKey(itemId: string, variantId: string) {
  return `${itemId}::${variantId}`;
}

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

async function postJson<T>(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
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
    campaign: params.get("campaign")?.trim() || undefined,
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
  const label = tableLabel.trim();
  if (/take/i.test(label)) return "TA";
  if (/qr/i.test(label)) return "QR";
  return label.slice(0, 2).toUpperCase();
}

const ALL_CATEGORY = "Semua";

function QuantityControl({
  label,
  qty,
  onMinus,
  onPlus,
  disabled = false,
}: {
  label: string;
  qty: number;
  onMinus: () => void;
  onPlus: () => void;
  disabled?: boolean;
}) {
  if (qty <= 0) {
    return (
      <button
        type="button"
        className="garage-press inline-flex h-11 min-w-[112px] shrink-0 items-center justify-center gap-2 rounded-md bg-[#d11a2a] px-4 text-sm font-black text-white transition hover:bg-[#ff2a3a] disabled:cursor-not-allowed disabled:bg-[#4a4a54] disabled:text-[#b8b8bf]"
        aria-label={`Tambah ${label}`}
        disabled={disabled}
        onClick={onPlus}
      >
        <Plus className="size-4" />
        {disabled ? "Habis" : "Tambah"}
      </button>
    );
  }

  return (
    <div className="inline-flex h-11 shrink-0 items-center overflow-hidden rounded-md border border-[#4a4a54] bg-[#15151b]">
      <button
        type="button"
        className="garage-press flex size-11 items-center justify-center text-white"
        aria-label={`Kurangi ${label}`}
        onClick={onMinus}
      >
        <Minus className="size-4" />
      </button>
      <span className="garage-mono flex min-w-10 items-center justify-center border-x border-[#34343c] px-2 text-center text-sm font-semibold text-white">
        {qty}
      </span>
      <button
        type="button"
        className="garage-press flex size-11 items-center justify-center text-white"
        aria-label={`Tambah ${label}`}
        disabled={disabled}
        onClick={onPlus}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
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
    <div className={`flex justify-between gap-4 ${strong ? "text-white" : "text-[#d0d0d6]"}`}>
      <span>{label}</span>
      <strong className={strong ? "text-lg text-white" : "text-white"}>{value}</strong>
    </div>
  );
}

function CartList({ lines }: { lines: CartLine[] }) {
  if (!lines.length) {
    return (
      <div className="rounded-md border border-dashed border-[#4a4a54] p-4 text-center text-sm text-[#b8b8bf]">
        Keranjang kosong.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lines.map((line) => (
        <div
          key={line.key}
          className="flex items-start justify-between gap-3 rounded-md border border-[#34343c] bg-white/[0.04] p-3"
        >
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-semibold text-white">{line.item.name}</p>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              {line.qty}x {line.variant.label}
            </p>
          </div>
          <p className="garage-mono shrink-0 text-sm font-semibold text-white">
            {rupiah.format(line.variant.price * line.qty)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function MemberOrderPage({
  initialQrContext,
  initialReturnPath,
  initialSearchQuery,
  initialMenuItems,
}: {
  initialQrContext?: QrContext;
  initialReturnPath?: string;
  initialSearchQuery?: string;
  initialMenuItems?: MenuItem[];
}) {
  const hasInitialMenuItems = Boolean(initialMenuItems?.length);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [mode, setMode] = useState<"guest" | "member">("guest");
  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => initialMenuItems ?? []);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState(() =>
    (initialSearchQuery ?? readInitialSearchQuery()).trim().slice(0, 80),
  );
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherResult, setVoucherResult] = useState<VoucherValidation | null>(null);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CustomerPaymentMethod>("Cash");
  const [paymentProvider, setPaymentProvider] = useState(customerBankAccounts[0].id);
  const [paymentReference, setPaymentReference] = useState("");
  const [returnPath] = useState(() => initialReturnPath ?? readReturnPath());
  const [qrContext] = useState<QrContext>(() => initialQrContext ?? readQrContext());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!hasInitialMenuItems);
  const [message, setMessage] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<CustomerOrderCreateResponse | null>(null);
  const [orderStatus, setOrderStatus] = useState<PublicOrderStatus | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const loadProfile = useCallback(async () => {
    try {
      const profile = await getJson<{ member: MemberProfile }>("/api/member/profile");
      setMember(profile.member);
      setMode("member");
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
            setMenuItems(menu);
          }
        })
        .catch((error) => {
          if (alive) {
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
  }, [hasInitialMenuItems, loadProfile]);

  useEffect(() => {
    const updateScrollState = () => setShowScrollTop(window.scrollY > 520);
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  useEffect(() => {
    if (!lastOrder?.order.id) {
      return;
    }

    let alive = true;
    const loadStatus = async () => {
      try {
        const status = await getJson<PublicOrderStatus>(
          `/api/customer/orders/${lastOrder.order.id}/public-status`,
        );
        if (alive) {
          setOrderStatus(status);
        }
      } catch {
        if (alive) {
          setOrderStatus(null);
        }
      }
    };

    void loadStatus();
    const intervalId = window.setInterval(loadStatus, 8_000);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [lastOrder?.order.id]);

  const categories = useMemo(
    () => [ALL_CATEGORY, ...Array.from(new Set(menuItems.map((item) => item.category)))],
    [menuItems],
  );
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const filteredMenu = useMemo(
    () =>
      menuItems.filter((item) => {
        const matchesCategory = category === ALL_CATEGORY || item.category === category;
        const matchesQuery = [
          item.name,
          item.category,
          item.section,
          item.tags.join(" "),
          item.variants.map((variant) => variant.label).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
        return matchesCategory && matchesQuery;
      }),
    [category, menuItems, normalizedQuery],
  );
  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([key, qty]) => {
          const [itemId, variantId] = key.split("::");
          const item = menuItems.find((entry) => entry.id === itemId);
          const variant = item?.variants.find((entry) => entry.id === variantId);
          if (!item || !variant || qty <= 0) return null;
          return { item, variant, qty, key };
        })
        .filter((line): line is CartLine => Boolean(line)),
    [cart, menuItems],
  );

  const subtotal = cartLines.reduce((sum, line) => sum + line.variant.price * line.qty, 0);
  const service = Math.round(subtotal * 0.05);
  const tax = 0;
  const discount = Math.min(25000, Math.round(subtotal * 0.1));
  const voucherDiscount = voucherResult?.valid ? voucherResult.discount : 0;
  const total = subtotal + service + tax - discount - voucherDiscount;
  const itemCount = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const discountLabel = mode === "member" ? "Voucher member" : "Promo QR";
  const loginHref = `/member-login?next=${encodeURIComponent(returnPath)}`;
  const guestNameMissing = mode === "guest" && !guestName.trim();
  const guestPhoneMissing = mode === "guest" && !guestPhone.trim();
  const memberMissing = mode === "member" && !member;
  const soldOutCartLine = cartLines.find((line) => line.item.stock === "sold_out");
  const cashPaymentLabel =
    qrContext.orderType === "delivery"
      ? "COD"
      : qrContext.orderType === "takeaway"
        ? "Bayar Saat Ambil"
        : "Bayar di Meja / Kasir";
  const paymentProviderValue =
    paymentMethod === "QRIS"
      ? qrisProvider
      : paymentMethod === "Bank Transfer"
        ? paymentProvider
        : "";
  const canCheckout =
    cartLines.length > 0 &&
    !busy &&
    !guestNameMissing &&
    !guestPhoneMissing &&
    !memberMissing &&
    !soldOutCartLine;
  const checkoutBlockReason = memberMissing
    ? "Login member untuk lanjut."
    : soldOutCartLine
      ? `${soldOutCartLine.item.name} sedang habis. Hapus dari keranjang.`
    : guestNameMissing && guestPhoneMissing
      ? "Lengkapi nama dan WhatsApp."
      : guestNameMissing
        ? "Lengkapi nama customer."
        : guestPhoneMissing
          ? "Lengkapi nomor WhatsApp."
          : "";

  function add(itemId: string, variantId: string, delta: number) {
    const item = menuItems.find((entry) => entry.id === itemId);
    if (item?.stock === "sold_out") {
      setMessage(`${item.name} sedang habis.`);
      return;
    }

    setCart((current) => {
      const key = cartKey(itemId, variantId);
      const nextQty = Math.max(0, (current[key] ?? 0) + delta);
      const next = { ...current };
      if (nextQty === 0) delete next[key];
      else next[key] = nextQty;
      return next;
    });
  }

  function openCheckout() {
    setMessage("");
    setLastOrder(null);
    setOrderStatus(null);
    if (!cartLines.length) {
      setMessage("Pilih menu terlebih dahulu.");
      return;
    }
    setCheckoutOpen(true);
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
        subtotal,
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

  async function checkout() {
    setBusy(true);
    setMessage("");
    setLastOrder(null);
    setOrderStatus(null);
    try {
      if (!cartLines.length) {
        throw new Error("Pilih menu terlebih dahulu.");
      }
      if (memberMissing) {
        throw new Error("Login member diperlukan untuk checkout member.");
      }
      if (soldOutCartLine) {
        throw new Error(`${soldOutCartLine.item.name} sedang habis. Hapus dari keranjang.`);
      }
      if (guestNameMissing || guestPhoneMissing) {
        throw new Error("Nama dan nomor WhatsApp guest wajib diisi.");
      }

      const result = await postJson<CustomerOrderCreateResponse>("/api/customer/orders", {
        orderType: qrContext.orderType,
        tableLabel: qrContext.tableLabel,
        outletId: qrContext.outletId,
        customerMode: mode,
        guestName: mode === "guest" ? guestName.trim() : undefined,
        guestPhone: mode === "guest" ? guestPhone.trim() : undefined,
        customerNote: customerNote.trim() || undefined,
        source: qrContext.source,
        campaign: qrContext.campaign,
        voucherCode: voucherCode.trim() || undefined,
        paymentMethod,
        paymentProvider: paymentProviderValue || undefined,
        paymentReference: paymentReference.trim() || undefined,
        items: cartLines.map((line) => ({
          itemId: line.item.id,
          variantId: line.variant.id,
          qty: line.qty,
        })),
      });

      setCart({});
      setCustomerNote("");
      setPaymentReference("");
      setCheckoutOpen(false);
      setMessage(`${result.order.orderNo} masuk ke kasir. Pembayaran menunggu konfirmasi.`);
      setLastOrder(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout gagal.");
    } finally {
      setBusy(false);
    }
  }

  const checkoutContent = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`garage-press min-h-16 rounded-md border p-3 text-left ${
            mode === "guest"
              ? "border-[#d11a2a] bg-[#d11a2a]/18"
              : "border-[#34343c] bg-white/[0.04]"
          }`}
          onClick={() => setMode("guest")}
        >
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-4 shrink-0 text-[#f5a742]" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Guest</p>
              <p className="truncate text-xs text-[#b8b8bf]">Pakai WhatsApp</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          className={`garage-press min-h-16 rounded-md border p-3 text-left ${
            mode === "member"
              ? "border-[#d11a2a] bg-[#d11a2a]/18"
              : "border-[#34343c] bg-white/[0.04]"
          }`}
          onClick={() => setMode("member")}
        >
          <div className="flex items-center gap-2">
            <User className="size-4 shrink-0 text-[#f5a742]" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Member</p>
              <p className="truncate text-xs text-[#b8b8bf]">
                {member ? `${member.level} - ${number.format(member.totalPoints)} pts` : "Login dulu"}
              </p>
            </div>
          </div>
        </button>
      </div>

      {mode === "guest" ? (
        <div className="grid gap-2.5">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b8b8bf]">
              Nama
            </span>
            <input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              className={`h-11 w-full rounded-md border bg-white/[0.055] px-4 text-white outline-none transition focus:border-[#f5a742] ${
                guestNameMissing ? "border-[#d11a2a]/70" : "border-[#34343c]"
              }`}
              placeholder="Nama customer"
              autoComplete="name"
            />
            {guestNameMissing ? (
              <span className="text-xs text-[#ffb0b8]">Nama wajib diisi.</span>
            ) : null}
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b8b8bf]">
              WhatsApp
            </span>
            <input
              value={guestPhone}
              onChange={(event) => setGuestPhone(event.target.value)}
              className={`h-11 w-full rounded-md border bg-white/[0.055] px-4 text-white outline-none transition focus:border-[#f5a742] ${
                guestPhoneMissing ? "border-[#d11a2a]/70" : "border-[#34343c]"
              }`}
              placeholder="0813..."
              autoComplete="tel"
              inputMode="tel"
            />
            {guestPhoneMissing ? (
              <span className="text-xs text-[#ffb0b8]">Nomor WhatsApp wajib diisi.</span>
            ) : null}
          </label>
        </div>
      ) : member ? (
        <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
          <p className="text-sm font-semibold text-white">{member.name}</p>
          <p className="mt-1 text-xs text-[#b8b8bf]">{member.phone}</p>
        </div>
      ) : (
        <div className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3">
          <p className="text-sm font-semibold text-white">Login member diperlukan.</p>
          <Link
            href={loginHref}
            className="mt-3 flex h-11 items-center justify-center gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 text-sm font-semibold text-[#ffd79a]"
          >
            <LogIn size={15} />
            Login member
          </Link>
        </div>
      )}

      <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
        <div className="flex items-center gap-2">
          <TicketPercent className="size-4 shrink-0 text-[#f5a742]" />
          <p className="text-sm font-semibold text-white">Voucher / promo</p>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={voucherCode}
            onChange={(event) => {
              setVoucherCode(event.target.value);
              setVoucherResult(null);
            }}
            className="h-11 min-w-0 flex-1 rounded-md border border-[#34343c] bg-[#111116] px-3 text-sm uppercase text-white outline-none transition placeholder:normal-case placeholder:text-[#777782] focus:border-[#f5a742]"
            placeholder="Kode voucher opsional"
            autoComplete="off"
          />
          <button
            type="button"
            className="garage-press h-11 shrink-0 rounded-md border border-[#4a4a54] px-3 text-xs font-bold text-white disabled:opacity-50"
            disabled={voucherBusy || !subtotal}
            onClick={() => void checkVoucher()}
          >
            {voucherBusy ? "Cek..." : "Cek"}
          </button>
        </div>
        {voucherResult ? (
          <p
            className={`mt-2 text-xs leading-5 ${
              voucherResult.valid ? "text-[#dcfce7]" : "text-[#ffb0b8]"
            }`}
          >
            {voucherResult.message}
            {voucherResult.valid ? ` Diskon ${rupiah.format(voucherResult.discount)}.` : ""}
          </p>
        ) : null}
      </div>

      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b8b8bf]">
          Catatan
        </span>
        <input
          value={customerNote}
          onChange={(event) => setCustomerNote(event.target.value)}
          className="h-11 w-full rounded-md border border-[#34343c] bg-white/[0.055] px-4 text-sm text-white outline-none transition placeholder:text-[#777782] focus:border-[#f5a742]"
          placeholder="Contoh: tidak pedas, gula sedikit"
        />
      </label>

      <div className="rounded-md border border-[#34343c] bg-[#15151b]/84 p-3">
        <p className="text-sm font-black text-white">Metode Pembayaran</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {customerPaymentMethods.map((method) => {
            const label = method === "Cash" ? cashPaymentLabel : method === "QRIS" ? "Bayar QRIS" : "Transfer Bank";
            const selected = paymentMethod === method;
            return (
              <button
                key={method}
                type="button"
                className={`garage-press min-h-14 rounded-md border p-2.5 text-left transition ${
                  selected
                    ? "border-[#d11a2a] bg-[#d11a2a]/18 text-white"
                    : "border-[#34343c] bg-white/[0.04] text-[#d6d6dc]"
                }`}
                onClick={() => {
                  setPaymentMethod(method);
                  setPaymentReference("");
                }}
              >
                <span className="block text-sm font-black">{label}</span>
                <span className="mt-1 block text-[11px] leading-4 text-[#b8b8bf]">
                  Kasir konfirmasi sebelum lunas.
                </span>
              </button>
            );
          })}
        </div>

        {paymentMethod === "Cash" ? (
          <p className="mt-3 rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3 text-xs leading-5 text-[#ffd79a]">
            Pilih ini jika pembayaran dilakukan langsung ke karyawan.
          </p>
        ) : null}

        {paymentMethod === "QRIS" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            <div className="rounded-md border border-[#34343c] bg-white p-2">
              <Image
                src={qrisImagePath}
                alt="QRIS GARAGE"
                width={220}
                height={220}
                className="aspect-square w-full rounded object-contain"
              />
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b8b8bf]">
                Referensi QRIS
              </span>
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                className="h-11 w-full rounded-md border border-[#34343c] bg-white/[0.055] px-4 text-sm text-white outline-none transition placeholder:text-[#777782] focus:border-[#f5a742]"
                placeholder="Opsional: nama / 4 digit ref"
              />
              <span className="text-xs leading-5 text-[#b8b8bf]">
                Setelah bayar, kasir tetap akan mengecek mutasi/struk QRIS.
              </span>
            </label>
          </div>
        ) : null}

        {paymentMethod === "Bank Transfer" ? (
          <div className="mt-3 grid gap-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b8b8bf]">
                Rekening tujuan
              </span>
              <select
                value={paymentProvider}
                onChange={(event) => setPaymentProvider(event.target.value)}
                className="h-11 w-full rounded-md border border-[#34343c] bg-[#15151b] px-3 text-sm text-white outline-none transition focus:border-[#f5a742]"
              >
                {customerBankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="rounded-md border border-[#34343c] bg-black/15 p-3 text-xs leading-5 text-[#d6d6dc]">
              No rekening: {customerBankAccounts.find((account) => account.id === paymentProvider)?.accountNumber ?? "-"}
            </p>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b8b8bf]">
                Referensi transfer
              </span>
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                className="h-11 w-full rounded-md border border-[#34343c] bg-white/[0.055] px-4 text-sm text-white outline-none transition placeholder:text-[#777782] focus:border-[#f5a742]"
                placeholder="Opsional: nama pengirim / no ref"
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="max-h-32 overflow-y-auto pr-1">
        <CartList lines={cartLines} />
      </div>

      <div className="space-y-1.5 rounded-md border border-[#34343c] bg-[#15151b]/84 p-3 text-sm">
        <BillLine label="Item" value={`${itemCount}`} />
        <BillLine label="Subtotal" value={rupiah.format(subtotal)} />
        <BillLine label="Service" value={rupiah.format(service)} />
        {discount > 0 ? (
          <BillLine label={discountLabel} value={`- ${rupiah.format(discount)}`} />
        ) : null}
        {voucherDiscount > 0 ? (
          <BillLine label="Voucher tambahan" value={`- ${rupiah.format(voucherDiscount)}`} />
        ) : null}
      </div>

      {message ? (
        <p className="rounded-md border border-[#d11a2a]/35 bg-[#d11a2a]/12 p-3 text-sm leading-6 text-[#ffd7da]">
          {message}
        </p>
      ) : null}
    </>
  );

  const checkoutFooter = (
    <div className="grid grid-cols-1 items-center gap-3 border-t border-[#34343c] bg-[#111116] p-3 shadow-[0_-18px_34px_rgba(17,17,22,0.74)] sm:grid-cols-[minmax(0,1fr)_210px] sm:p-4">
      <div className="min-w-0 flex-1">
        <p className="garage-mono text-[10px] text-[#b8b8bf]">Total estimasi</p>
        <p className="truncate text-lg font-black text-white">{rupiah.format(total)}</p>
      </div>
      <div className="min-w-0">
        <button
          className="garage-press flex h-12 w-full min-w-0 items-center justify-center rounded-md bg-[#d11a2a] px-3 text-center text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#ff2a3a] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
          onClick={checkout}
          disabled={!canCheckout}
        >
          {busy ? "Mengirim..." : "Kirim ke Kasir"}
        </button>
        {!canCheckout && checkoutBlockReason ? (
          <p className="mt-2 text-center text-[11px] font-semibold text-[#ffb0b8]">
            {checkoutBlockReason}
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <main
      className={`garage-shell min-h-screen overflow-x-hidden text-white ${
        cartLines.length
          ? "pb-[calc(10.5rem+env(safe-area-inset-bottom))] sm:pb-36"
          : "pb-6 lg:pb-8"
      }`}
    >
      <section className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-7 sm:py-6 lg:px-10">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="block w-[min(180px,46vw)] sm:w-[220px]"
            aria-label="Kembali ke website Garage"
          >
            <Image
              src="/garage-brand/logo-website.png"
              alt="Garage Coffee & Motor"
              width={1024}
              height={325}
              priority
              sizes="(max-width: 768px) 46vw, 220px"
              className="h-auto w-full object-contain drop-shadow-[0_14px_34px_rgba(0,0,0,0.5)]"
            />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <div className="garage-mono flex size-12 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/60 bg-[#d11a2a]/22 text-lg font-black text-white">
              {compactTableNumber(qrContext.tableLabel)}
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="garage-mono text-[10px] text-[#b8b8bf]">Lokasi order</p>
              <p className="truncate text-sm font-semibold text-white">{qrContext.tableLabel}</p>
            </div>
            <Link
              href={loginHref}
              className="garage-press inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 px-3 text-xs font-semibold text-[#ffd79a] sm:px-4"
            >
              <LogIn size={14} />
              <span className="max-w-[86px] truncate sm:max-w-[160px]">
                {member ? member.name : "Login"}
              </span>
            </Link>
          </div>
        </header>

        <section className="mt-5">
          <div className="min-w-0">
            <div className="rounded-md border border-[#34343c] bg-[#111116]/84 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 border border-[#f5a742]/35 bg-[#f5a742]/10 px-3 py-1 text-xs font-semibold uppercase text-[#ffd79a]">
                    <QrCode size={14} />
                    {qrContext.tableLabel}
                  </div>
                  <h1 className="garage-display mt-3 text-[clamp(38px,10vw,76px)] leading-none">
                    Pilih Menu
                  </h1>
                </div>
                {cartLines.length ? (
                  <div className="grid grid-cols-2 gap-2 sm:w-[220px]">
                    <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                      <p className="garage-mono text-[10px] text-[#8f8f98]">ITEM</p>
                      <p className="mt-1 text-xl font-black text-white">{itemCount}</p>
                    </div>
                    <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                      <p className="garage-mono text-[10px] text-[#8f8f98]">TOTAL</p>
                      <p className="mt-1 truncate text-sm font-black text-white">
                        {rupiah.format(total)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="sticky top-0 z-20 -mx-4 mt-4 border-y border-[#34343c] bg-[#09090b]/96 px-4 py-3 backdrop-blur-xl sm:-mx-7 sm:px-7 lg:top-0 lg:mx-0 lg:rounded-md lg:border lg:px-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8d8d96]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-12 w-full rounded-md border border-[#34343c] bg-white/[0.055] pl-10 pr-10 text-white outline-none transition placeholder:text-[#777782] focus:border-[#f5a742]"
                  placeholder="Cari nasi, kopi, snack..."
                />
                {query ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-[#b8b8bf]"
                    aria-label="Hapus pencarian"
                    onClick={() => setQuery("")}
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              <div className="garage-scroll-x mt-3 flex gap-2 pb-1">
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`garage-press h-10 shrink-0 rounded-md border px-4 text-sm font-semibold transition ${
                      category === item
                        ? "border-[#d11a2a] bg-[#d11a2a] text-white"
                        : "border-[#34343c] bg-white/[0.05] text-[#d6d6dc]"
                    }`}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {message && !checkoutOpen ? (
              <div className="mt-4 rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3 text-sm leading-6 text-[#ffd7da]">
                {message}
              </div>
            ) : null}

            {lastOrder ? (
              <div className="mt-4 rounded-md border border-[#22c55e]/35 bg-[#22c55e]/10 p-4">
                {(() => {
                  const invoicePdfUrl = customerInvoicePdfUrl(orderStatus, lastOrder);
                  const invoiceWebUrl = customerInvoiceWebUrl(orderStatus, lastOrder);
                  const whatsappInvoiceUrl = customerWhatsappInvoiceUrl(orderStatus, lastOrder);
                  return (
                    <>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#86efac]" />
                  <div className="min-w-0">
                    <p className="text-lg font-black text-white">
                      {lastOrder.order.orderNo} menunggu validasi kasir
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#dcfce7]">
                      {orderStatus?.message ??
                        `${qrContext.tableLabel} sudah diterima sistem. Kasir akan accept sebelum masuk kitchen.`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="garage-mono rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 px-2 py-1 text-[10px] text-[#ffd79a]">
                        {lastOrder.order.paymentMethod ?? "Cash"}
                      </span>
                      <span className="garage-mono rounded-md border border-[#22c55e]/35 bg-[#22c55e]/12 px-2 py-1 text-[10px] text-[#dcfce7]">
                        {orderStatus?.kitchenStatus ?? "waiting_cashier"}
                      </span>
                      <span className="garage-mono rounded-md border border-[#34343c] bg-white/[0.05] px-2 py-1 text-[10px] text-[#d6d6dc]">
                        Update otomatis 8 detik
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-white">{lastOrder.memberCta}</p>
                  </div>
                </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    {invoiceWebUrl ? (
                      <a
                        href={invoiceWebUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="garage-press inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/12 text-sm font-semibold text-[#ffe7b8] sm:w-auto sm:px-4"
                      >
                        <FileText size={16} />
                        Buka tracking invoice
                      </a>
                    ) : invoicePdfUrl ? (
                      <a
                        href={invoicePdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="garage-press inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/12 text-sm font-semibold text-[#ffe7b8] sm:w-auto sm:px-4"
                      >
                        <FileText size={16} />
                        Buka PDF invoice
                      </a>
                    ) : (
                      <span className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#4a4a54] bg-white/[0.04] text-sm font-semibold text-[#b8b8bf] sm:w-auto sm:px-4">
                        <FileText size={16} />
                        Tracking belum dibuat
                      </span>
                    )}
                    {whatsappInvoiceUrl ? (
                      <a
                        href={whatsappInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="garage-press inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#22c55e]/40 bg-[#22c55e]/12 text-sm font-semibold text-[#dcfce7] sm:w-auto sm:px-4"
                      >
                        <MessageCircle size={16} />
                        Kirim link invoice WA
                      </a>
                    ) : (
                      <span className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#4a4a54] bg-white/[0.04] text-sm font-semibold text-[#b8b8bf] sm:w-auto sm:px-4">
                        <MessageCircle size={16} />
                        WA belum siap
                      </span>
                    )}
                  </div>
                    </>
                  );
                })()}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="garage-panel min-h-44 animate-pulse rounded-md p-4">
                    <div className="h-3 w-24 rounded bg-white/10" />
                    <div className="mt-4 h-7 w-4/5 rounded bg-white/10" />
                    <div className="mt-3 h-4 w-1/2 rounded bg-white/10" />
                    <div className="mt-7 h-12 rounded bg-white/10" />
                  </div>
                ))
              ) : filteredMenu.length ? (
                filteredMenu.map((item) => (
                  <article
                    key={item.id}
                    className={`garage-panel flex min-h-[188px] min-w-0 flex-col rounded-md p-4 ${
                      item.stock === "sold_out" ? "opacity-70" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="garage-mono text-[10px] text-[#b8b8bf]">{item.category}</p>
                        <h2 className="mt-2 line-clamp-2 min-h-[48px] text-xl font-black leading-tight text-white">
                          {item.name}
                        </h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#d0d0d6]">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5 text-[#f5a742]" />
                            {item.prep}
                          </span>
                          <span className="truncate">{item.section}</span>
                        </div>
                      </div>
                      <span
                        className={`garage-mono shrink-0 rounded-md border px-2 py-1 text-[10px] ${
                          item.stock === "sold_out"
                            ? "border-[#d11a2a]/55 bg-[#d11a2a]/18 text-[#ffc2c8]"
                            : "border-[#f5a742]/35 bg-[#f5a742]/10 text-[#ffd79a]"
                        }`}
                      >
                        {item.stock === "sold_out" ? "HABIS" : item.stock}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {item.variants.map((variant) => {
                        const key = cartKey(item.id, variant.id);
                        const qty = cart[key] ?? 0;
                        const label = `${item.name} ${variant.label}`;
                        return (
                          <div
                            key={variant.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-[#34343c] bg-white/[0.04] p-2"
                          >
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-semibold text-white">
                                {variant.label}
                              </p>
                              <p className="text-sm font-black text-[#f5a742]">
                                {rupiah.format(variant.price)}
                              </p>
                            </div>
                            <QuantityControl
                              label={label}
                              qty={qty}
                              onMinus={() => add(item.id, variant.id, -1)}
                              onPlus={() => add(item.id, variant.id, 1)}
                              disabled={item.stock === "sold_out"}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))
              ) : (
                <div className="garage-panel col-span-full flex min-h-52 flex-col items-center justify-center rounded-md p-6 text-center">
                  <Search className="size-8 text-[#6e6e76]" />
                  <p className="mt-3 text-sm font-semibold text-white">Menu tidak ditemukan</p>
                  <p className="mt-1 text-xs text-[#b8b8bf]">Ubah pencarian atau kategori.</p>
                </div>
              )}
            </div>
          </div>

        </section>
      </section>

      {cartLines.length ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 lg:px-8"
        >
          <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_minmax(124px,34%)] items-center gap-3 rounded-2xl border border-[#34343c] bg-[#0b0b0e]/96 p-3 shadow-[0_-18px_54px_rgba(0,0,0,0.52)] backdrop-blur-xl sm:grid-cols-[minmax(0,1fr)_190px] sm:p-4">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <div className="garage-mono flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#d11a2a]/55 bg-[#d11a2a]/20 text-base font-black text-white">
                {compactTableNumber(qrContext.tableLabel)}
              </div>
              <div className="min-w-0">
                <p className="garage-mono truncate text-[10px] text-[#b8b8bf]">
                  {qrContext.tableLabel} - {itemCount} item
                </p>
                <p className="truncate text-lg font-black text-white sm:text-xl">
                  {rupiah.format(total)}
                </p>
              </div>
            </div>
            <button
              className="garage-press flex h-12 min-w-0 items-center justify-center gap-2 rounded-xl bg-[#d11a2a] px-3 text-sm font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#ff2a3a] sm:px-4"
              onClick={openCheckout}
            >
              <ShoppingCart className="size-4" />
              Checkout
            </button>
          </div>
        </div>
      ) : null}

      {showScrollTop ? (
        <button
          type="button"
          aria-label="Kembali ke atas"
          className={`garage-press fixed right-4 z-50 flex size-11 items-center justify-center rounded-full border border-[#f5a742]/45 bg-[#111116]/94 text-[#ffd79a] shadow-[0_14px_34px_rgba(0,0,0,0.38)] backdrop-blur-xl ${
            cartLines.length
              ? "bottom-[calc(8.5rem+env(safe-area-inset-bottom))] sm:bottom-28"
              : "bottom-5 lg:bottom-6"
          }`}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ChevronUp className="size-5" />
        </button>
      ) : null}

      <Sheet open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <SheetContent
          side="bottom"
          className="garage-shell inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[92svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border-[#34343c] bg-[#111116] p-0 text-white sm:inset-x-4 sm:bottom-4 sm:w-[min(640px,calc(100vw-32px))] sm:rounded-2xl sm:border"
        >
          <SheetHeader className="border-b border-[#34343c] p-3 text-left sm:p-4">
            <div className="flex items-start gap-3 pr-8">
              <div className="garage-mono flex size-11 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/60 bg-[#d11a2a]/22 text-lg font-black text-white sm:size-12">
                {compactTableNumber(qrContext.tableLabel)}
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-lg font-black text-white sm:text-xl">
                  Checkout {qrContext.tableLabel}
                </SheetTitle>
                <SheetDescription className="mt-1 text-xs text-[#b8b8bf] sm:text-sm">
                  Cek data customer, lalu kirim order ke kasir.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-3 p-3 sm:gap-4 sm:p-4">{checkoutContent}</div>
          </div>
          {checkoutFooter}
        </SheetContent>
      </Sheet>
    </main>
  );
}
