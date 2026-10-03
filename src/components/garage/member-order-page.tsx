"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Banknote,
  ChefHat,
  ChevronUp,
  Check,
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
} from "lucide-react";

import { CategoryNav, type CategoryTab } from "@/components/garage/order/category-nav";
import { HeroRail, type HeroKind } from "@/components/garage/order/hero-rail";
import {
  MENU_GRID_CLASS,
  MenuCard,
  MenuCardSkeleton,
  MenuPhoto,
  needsDetailSheet,
} from "@/components/garage/order/menu-card";
import {
  MenuSectionList,
  buildMenuGroups,
  categorySectionId,
} from "@/components/garage/order/menu-section-list";
import { OrderCartBar, type LastAdded } from "@/components/garage/order/order-cart-bar";
import { OrderHeader } from "@/components/garage/order/order-header";
import { OrderHelpSheet } from "@/components/garage/order/order-help-sheet";
import {
  QuantityControl,
  cartKey,
  categoryIcon,
  itemCartQty,
  itemHasPromo,
  itemMinPrice,
  lineUnitPrice,
  parseCartKey,
  resolveAddons,
  rupiah,
  variantPrice,
  type MenuAddon,
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
import type { MemberLevel } from "@/lib/member-types";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/garage-app-settings-types";
import { calculateBillingTotals, capVoucherDiscountBySettings, qrPromoDiscount } from "@/lib/garage-billing";
import { resolveOrderCampaign } from "@/lib/order-campaign";

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
  // Add-on terpilih (sudah divalidasi terhadap menu saat ini).
  addons: MenuAddon[];
  // Harga per porsi = varian (promo) + add-on.
  unitPrice: number;
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
const customerBankAccounts = [
  { id: "BCA", label: "BCA - GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "BRI", label: "BRI - GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "BNI", label: "BNI - GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
  { id: "BANK SUMUT", label: "BANK SUMUT - GARAGE Coffee & Motor", accountNumber: "Belum dikonfigurasi" },
];
const qrisProvider = "QRIS GARAGE";
const qrisImagePath = "/payments/qris-garage.png";

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

function getOrCreateChatToken(): string {
  if (typeof window === "undefined") return "";
  try {
    let t = window.localStorage.getItem("garage:chatToken");
    if (!t || t.length < 12) {
      const raw =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `c${Date.now()}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      t = raw.replace(/-/g, "");
      window.localStorage.setItem("garage:chatToken", t);
    }
    return t;
  } catch {
    return `c${Date.now()}${Math.random().toString(36).slice(2)}`;
  }
}

type ChatMsg = { id: string; sender: string; body: string; createdAt: string };

function ChatBubble({ msg }: { msg: ChatMsg }) {
  if (msg.sender === "system") {
    return (
      <p className="mx-auto w-fit rounded-full border border-garage-amber/30 bg-garage-amber/10 px-3 py-1 text-center text-[11px] font-semibold text-[#ffd79a]">
        {msg.body}
      </p>
    );
  }
  const mine = msg.sender === "customer";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
          mine
            ? "rounded-br-sm bg-garage-red text-white"
            : "rounded-bl-sm border border-garage-line bg-white/[0.06] text-garage-fg"
        }`}
      >
        {!mine ? (
          <span className="mb-0.5 block text-[10px] font-bold uppercase text-garage-amber">Kasir</span>
        ) : null}
        <span className="whitespace-pre-wrap break-words">{msg.body}</span>
      </div>
    </div>
  );
}

function CustomerChatPanel({ tableLabel }: { tableLabel: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const tokenRef = useRef<string>("");

  const ensureToken = useCallback(() => {
    if (!tokenRef.current) tokenRef.current = getOrCreateChatToken();
    return tokenRef.current;
  }, []);

  const mergeMessages = useCallback((incoming: ChatMsg[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const next = [...prev];
      for (const m of incoming) {
        if (!seenRef.current.has(m.id)) {
          seenRef.current.add(m.id);
          next.push(m);
        }
      }
      return next;
    });
    lastIdRef.current = incoming[incoming.length - 1].id;
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    async function poll() {
      try {
        const token = ensureToken();
        if (!token) return;
        const after = lastIdRef.current;
        const url = `/api/customer/chat?token=${encodeURIComponent(token)}${
          after ? `&afterId=${encodeURIComponent(after)}` : ""
        }`;
        const data = await getJson<{ threadId: string | null; status: string; messages: ChatMsg[] }>(url);
        if (active) mergeMessages(data.messages);
      } catch {
        /* offline sesaat - polling berikutnya coba lagi */
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [open, ensureToken, mergeMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    const tk = ensureToken();
    try {
      await postJson("/api/customer/chat", { chatToken: tk, tableLabel, body });
      setInput("");
      const data = await getJson<{ messages: ChatMsg[] }>(
        `/api/customer/chat?token=${encodeURIComponent(tk)}${
          lastIdRef.current ? `&afterId=${encodeURIComponent(lastIdRef.current)}` : ""
        }`,
      );
      mergeMessages(data.messages);
    } catch {
      setError("Gagal mengirim. Coba lagi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="garage-press mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-garage-red/45 bg-garage-red/12 px-3 py-2.5 text-xs font-bold text-[#ffc2c8] transition hover:bg-garage-red/20"
      >
        <MessageCircle className="size-4" />
        Chat langsung dengan kasir
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[80vh] flex-col gap-0 border-garage-line bg-garage-bg-1 p-0"
        >
          <SheetHeader className="border-b border-garage-line p-4 text-left">
            <SheetTitle className="flex items-center gap-2 font-sans text-white">
              <MessageCircle className="size-4 text-garage-amber" /> Chat Kasir
            </SheetTitle>
            <SheetDescription className="text-garage-dim">
              {tableLabel} - kasir akan balas secepatnya.
            </SheetDescription>
          </SheetHeader>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <p className="mt-6 text-center text-sm text-garage-mute">
                Mulai chat dengan kasir - tanya menu, ralat pesanan, atau minta bantuan.
              </p>
            ) : (
              messages.map((m) => <ChatBubble key={m.id} msg={m} />)
            )}
          </div>
          {error ? <p className="px-4 pb-1 text-xs text-[#fca5a5]">{error}</p> : null}
          <div className="flex items-end gap-2 border-t border-garage-line p-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Tulis pesan..."
              className="max-h-24 min-h-11 flex-1 resize-none rounded-md border border-garage-line-2 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-garage-mute focus:border-garage-red/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              className="garage-press h-11 shrink-0 rounded-md bg-garage-red px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {sending ? "..." : "Kirim"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
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
  onAdjust?: (key: string, delta: number) => void;
  onNote?: (key: string, value: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const hasNote = line.note.trim().length > 0;
  const showNote = Boolean(onNote) && (noteOpen || hasNote);

  return (
    <div className="border-b border-garage-line/70 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold leading-snug text-white">{line.item.name}</p>
          {line.addons.length ? (
            <p className="mt-0.5 text-[13px] leading-5 text-garage-dim">
              + {line.addons.map((addon) => addon.label).join(", ")}
            </p>
          ) : null}
          <p className="mt-0.5 text-sm text-garage-dim">
            {line.item.variants.length > 1 ? `${line.variant.label} · ` : ""}
            <span className="font-mono tabular-nums text-white">
              {rupiah.format(line.unitPrice * line.qty)}
            </span>
          </p>
        </div>
        {onAdjust ? (
          <QuantityControl
            label={`${line.item.name} ${line.variant.label}`}
            qty={line.qty}
            onMinus={() => onAdjust(line.key, -1)}
            onPlus={() => onAdjust(line.key, 1)}
          />
        ) : (
          <p className="shrink-0 font-mono text-sm font-bold tabular-nums text-white">{line.qty}x</p>
        )}
      </div>
      {onNote ? (
        showNote ? (
          <input
            value={line.note}
            onChange={(event) => onNote(line.key, event.target.value)}
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
  onAdjust?: (key: string, delta: number) => void;
  onNote?: (key: string, value: string) => void;
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

// Sheet detail item — memilih varian + qty. Foto hanya bila ada; keranjang
// diperbarui langsung dari stepper per varian.
function MenuDetailSheet({
  item,
  cart,
  onAdjust,
  onClose,
}: {
  item: MenuItem | null;
  cart: Record<string, number>;
  onAdjust: (itemId: string, variantId: string, delta: number, addonIds?: string[]) => void;
  onClose: () => void;
}) {
  // Add-on terpilih untuk item yang sedang dibuka (otomatis kosong lagi saat ganti item).
  const [addonState, setAddonState] = useState<{ itemId: string; ids: string[] }>({ itemId: "", ids: [] });
  const selectedAddonIds = item && addonState.itemId === item.id ? addonState.ids : [];
  const selectedAddons = item ? resolveAddons(item, selectedAddonIds) : [];
  const itemAddons = item?.addons ?? [];

  function toggleAddon(id: string) {
    if (!item) return;
    const next = selectedAddonIds.includes(id)
      ? selectedAddonIds.filter((entry) => entry !== id)
      : [...selectedAddonIds, id];
    setAddonState({ itemId: item.id, ids: next });
  }

  const totalInCart = item ? itemCartQty(item, cart) : 0;
  // Nilai semua baris item ini di keranjang (semua varian & kombinasi add-on).
  const totalValue = item
    ? Object.entries(cart).reduce((sum, [key, qty]) => {
        const parsed = parseCartKey(key);
        if (parsed.itemId !== item.id) return sum;
        const variant = item.variants.find((entry) => entry.id === parsed.variantId);
        if (!variant) return sum;
        return sum + lineUnitPrice(item, variant, resolveAddons(item, parsed.addonIds)) * qty;
      }, 0)
    : 0;
  const multiVariant = (item?.variants.length ?? 0) > 1;

  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent
        side="bottom"
        className="inset-x-0 bottom-0 z-[95] mx-auto flex max-h-[90svh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border-garage-line bg-garage-bg-1 p-0 text-white sm:inset-x-4 sm:bottom-4 sm:w-[min(520px,calc(100vw-32px))] sm:rounded-xl sm:border"
      >
        {item ? (
          <>
            <div className="relative aspect-[4/3] max-h-[42svh] w-full shrink-0 overflow-hidden bg-garage-bg-2">
              <MenuPhoto item={item} iconClassName="size-16" eager />
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-garage-bg-1 to-transparent"
                aria-hidden
              />
              {itemHasPromo(item) ? (
                <span className="absolute left-3 top-3 rounded-sm bg-garage-red px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
                  Promo
                </span>
              ) : null}
            </div>
            <SheetHeader className="border-b border-garage-line px-4 pb-4 pt-2 text-left">
              <div className="flex items-center gap-2 pr-8">
                {categoryIcon(item.category, "size-4 text-garage-amber")}
                <span className="text-[13px] font-semibold text-garage-dim">
                  {item.category} · {item.section}
                </span>
              </div>
              <SheetTitle className="mt-1 font-sans text-xl font-bold leading-snug text-white">{item.name}</SheetTitle>
              {item.description ? (
                <p className="text-sm leading-6 text-garage-dim">{item.description}</p>
              ) : null}
              <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-garage-dim">
                <span className="flex items-baseline gap-1.5">
                  {multiVariant ? <span className="text-xs font-medium text-garage-dim">mulai</span> : null}
                  <span className="font-mono text-lg font-bold tabular-nums text-white">
                    {rupiah.format(itemMinPrice(item))}
                  </span>
                </span>
                {item.prep ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden /> Siap ± {item.prep.replace(/m$/, " menit")}
                  </span>
                ) : null}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {itemAddons.length ? (
                <fieldset className="mb-4">
                  <legend className="mb-2.5 text-sm font-bold text-garage-dim">
                    Tambahan <span className="font-medium">(opsional, pilih dulu)</span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {itemAddons.map((addon) => {
                      const active = selectedAddonIds.includes(addon.id);
                      return (
                        <button
                          key={addon.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleAddon(addon.id)}
                          className={`garage-press inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition-colors ${
                            active
                              ? "border-garage-red bg-garage-red/15 text-white"
                              : "border-garage-line-2 bg-garage-bg-2 text-garage-fg hover:border-garage-amber/60"
                          }`}
                        >
                          {active ? <Check className="size-4 text-garage-red-bright" aria-hidden /> : null}
                          {addon.label}
                          <span className="font-mono text-xs tabular-nums text-garage-dim">
                            {addon.price > 0 ? `+${rupiah.format(addon.price)}` : "Gratis"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}
              <p className="mb-2.5 text-sm font-bold text-garage-dim">
                {multiVariant ? "Pilih varian" : "Jumlah pesanan"}
              </p>
              <div className="space-y-2">
                {item.variants.map((variant) => {
                  const qty = cart[cartKey(item.id, variant.id, selectedAddonIds)] ?? 0;
                  const addonExtra = selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
                  return (
                    <div
                      key={variant.id}
                      className={`flex items-center justify-between gap-3 rounded-md border p-3 transition-colors ${
                        qty > 0 ? "border-garage-red/70 bg-garage-red/10" : "border-garage-line bg-garage-bg-2"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-base font-bold text-white">
                          {multiVariant ? variant.label : item.name}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 font-mono text-sm font-bold tabular-nums text-garage-dim">
                          {variantPrice(item, variant) < variant.price ? (
                            <>
                              <span className="text-[#ff8a8a]">
                                {rupiah.format(variantPrice(item, variant) + addonExtra)}
                              </span>
                              <span className="text-xs font-semibold text-garage-mute line-through">
                                {rupiah.format(variant.price + addonExtra)}
                              </span>
                            </>
                          ) : (
                            rupiah.format(variant.price + addonExtra)
                          )}
                        </p>
                      </div>
                      <QuantityControl
                        label={`${item.name} ${variant.label}`}
                        qty={qty}
                        onMinus={() => onAdjust(item.id, variant.id, -1, selectedAddonIds)}
                        onPlus={() => onAdjust(item.id, variant.id, 1, selectedAddonIds)}
                        disabled={item.stock === "sold_out"}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-garage-line bg-garage-bg-1 p-3 sm:p-4">
              <button
                type="button"
                onClick={onClose}
                className={`garage-press flex h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-4 text-sm font-bold transition-colors ${
                  totalInCart > 0
                    ? "bg-garage-red text-white hover:bg-garage-red-bright"
                    : "justify-center border border-garage-line-2 bg-garage-bg-2 text-white hover:bg-garage-bg-3"
                }`}
              >
                {totalInCart > 0 ? (
                  <>
                    <span>Simpan ke pesanan ({totalInCart})</span>
                    <span className="font-mono tabular-nums">{rupiah.format(totalValue)}</span>
                  </>
                ) : (
                  "Tutup"
                )}
              </button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
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
  // Tick per detik HANYA saat ada station sedang dimasak (hemat render).
  useEffect(() => {
    if (!anyCooking) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [anyCooking]);

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
        Pesanan ditolak kasir. Silakan hubungi staf.
      </div>
    );
  }

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
            <p className="text-base font-bold text-[#bbf7d0]">Pesanan siap</p>
            <p className="text-sm text-[#dcfce7]">Silakan ambil atau akan segera diantar.</p>
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
                {entry.station}: {label}
              </span>
            );
          })}
        </div>
      ) : null}

      <p className="text-xs text-garage-mute">Update otomatis tiap 8 detik</p>
    </div>
  );
}

export function MemberOrderPage({
  initialQrContext,
  initialReturnPath,
  initialSearchQuery,
  initialMenuItems,
  bestSellerIds,
  billing,
  initialOrderingOpen,
}: {
  initialQrContext?: QrContext;
  initialReturnPath?: string;
  initialSearchQuery?: string;
  initialMenuItems?: MenuItem[];
  bestSellerIds?: string[];
  // Pengaturan tagihan outlet dari server (sama dengan createCustomerOrder).
  billing?: Pick<
    AppSettings,
    "serviceChargePct" | "taxPct" | "roundingMode" | "voucherMaxDiscountPct" | "qrPromoPct" | "qrPromoMaxAmount"
  >;
  // Ada shift kasir buka (server). undefined = belum diketahui → anggap buka.
  initialOrderingOpen?: boolean;
}) {
  const hasInitialMenuItems = Boolean(initialMenuItems?.length);
  const bestSellerSet = useMemo(() => new Set(bestSellerIds ?? []), [bestSellerIds]);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [mode, setMode] = useState<"guest" | "member">("guest");
  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => initialMenuItems ?? []);
  const [cart, setCart] = useState<Record<string, number>>({});
  // Catatan per-item keranjang (mis. "less ice"), keyed by cartKey item::variant.
  const [cartNotes, setCartNotes] = useState<Record<string, string>>({});
  // Item yang dibuka di sheet detail (pilih varian + qty).
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  // false = kasir belum buka shift → menu tetap bisa dilihat, tapi order belum bisa dikirim.
  const [orderingOpen, setOrderingOpen] = useState(initialOrderingOpen !== false);
  // Konfirmasi singkat "X masuk keranjang" di bar keranjang mobile (hilang setelah 2,2 dtk).
  const [lastAdded, setLastAdded] = useState<LastAdded | null>(null);
  const lastAddedTimerRef = useRef<number | null>(null);
  // Penanda unik tiap penambahan (key animasi notifikasi) — counter, bukan jam.
  const lastAddedStampRef = useRef(0);
  useEffect(
    () => () => {
      if (lastAddedTimerRef.current) window.clearTimeout(lastAddedTimerRef.current);
    },
    [],
  );
  const [query, setQuery] = useState(() =>
    (initialSearchQuery ?? readInitialSearchQuery()).trim().slice(0, 80),
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  // Pesan error nama baru tampil setelah kolom disentuh (bukan saat dialog baru dibuka).
  const [guestNameTouched, setGuestNameTouched] = useState(false);
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
  // Order yang dilanjutkan dari kunjungan sebelumnya (persist via localStorage)
  // supaya tracker tidak hilang saat halaman di-refresh.
  const [trackedOrderId, setTrackedOrderId] = useState<string | null>(null);
  const [trackedOrderNo, setTrackedOrderNo] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [helpMessage, setHelpMessage] = useState("");
  const [helpBusy, setHelpBusy] = useState<string | null>(null);
  // Field opsional checkout disembunyikan dulu agar tampilan minimalis.
  const [showVoucherField, setShowVoucherField] = useState(false);
  const [showNoteField, setShowNoteField] = useState(false);
  const deferredQuery = useDeferredValue(query);

  async function callService(type: "call" | "bill" | "water", label: string) {
    setHelpBusy(type);
    setHelpMessage("");
    try {
      await postJson("/api/customer/service-requests", {
        tableLabel: qrContext.tableLabel,
        outletId: qrContext.outletId,
        type,
      });
      setHelpMessage(`${label} terkirim. Pelayan akan segera datang ke ${qrContext.tableLabel}.`);
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

  // Poll status untuk order yang di-resume (tanpa sesi lastOrder aktif).
  useEffect(() => {
    if (lastOrder || !trackedOrderId) return;
    let alive = true;
    const loadStatus = async () => {
      try {
        const status = await getJson<PublicOrderStatus>(
          `/api/customer/orders/${trackedOrderId}/public-status`,
        );
        if (!alive) return;
        setOrderStatus(status);
        const finished =
          ["delivered", "completed", "rejected"].includes(status.kitchenStatus) ||
          status.orderStatus === "paid";
        if (finished) {
          // Sudah selesai â€” berhenti menyimpan supaya kunjungan berikutnya bersih.
          try {
            window.localStorage.removeItem("garage:trackedOrder");
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (alive) {
          setTrackedOrderId(null);
          try {
            window.localStorage.removeItem("garage:trackedOrder");
          } catch {
            /* ignore */
          }
        }
      }
    };
    void loadStatus();
    const intervalId = window.setInterval(loadStatus, 8_000);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [lastOrder, trackedOrderId]);

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
          const { itemId, variantId, addonIds } = parseCartKey(key);
          const item = menuItems.find((entry) => entry.id === itemId);
          const variant = item?.variants.find((entry) => entry.id === variantId);
          if (!item || !variant || qty <= 0) return null;
          const addons = resolveAddons(item, addonIds);
          return {
            item,
            variant,
            addons,
            unitPrice: lineUnitPrice(item, variant, addons),
            qty,
            key,
            note: cartNotes[key] ?? "",
          };
        })
        .filter((line): line is CartLine => Boolean(line)),
    [cart, menuItems, cartNotes],
  );

  // Harga promo per produk ikut dihitung (sama dengan effectiveMenuPrice di server).
  // Harga add-on juga ikut (sama dengan createCustomerOrder).
  const subtotal = cartLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  // Rumus SAMA dengan server (createCustomerOrder): service → PB1 → pembulatan
  // outlet, lalu promo QR (Pengaturan qrPromoPct/qrPromoMaxAmount) & voucher.
  // Dulu PB1 & pembulatan tidak dihitung → total di HP lebih murah dari tagihan kasir.
  const billingSettings = { ...DEFAULT_APP_SETTINGS, ...(billing ?? {}) };
  const { service, tax, grossTotal } = calculateBillingTotals(subtotal, billingSettings);
  const roundingAdjustment = grossTotal - (subtotal + service + tax);
  const promoDiscount = qrPromoDiscount(subtotal, billingSettings);
  const voucherDiscount = voucherResult?.valid
    ? capVoucherDiscountBySettings(voucherResult.discount, subtotal, billingSettings)
    : 0;
  const discount = Math.min(grossTotal, promoDiscount);
  const total = Math.max(0, grossTotal - Math.min(grossTotal, promoDiscount + voucherDiscount));
  const itemCount = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const discountLabel = mode === "member" ? "Voucher member" : "Promo QR";
  const loginHref = `/member-login?next=${encodeURIComponent(returnPath)}`;
  const guestNameMissing = mode === "guest" && !guestName.trim();
  const showGuestNameError = guestNameMissing && guestNameTouched;
  // Nomor WhatsApp guest OPSIONAL â€” tidak memblok checkout.
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
    !memberMissing &&
    !soldOutCartLine &&
    orderingOpen;
  const checkoutBlockReason = !orderingOpen
    ? "Kasir belum buka. Order bisa dikirim setelah outlet buka."
    : memberMissing
    ? "Login member untuk lanjut."
    : soldOutCartLine
      ? `${soldOutCartLine.item.name} sedang habis. Hapus dari keranjang.`
      : guestNameMissing
        ? "Lengkapi nama customer."
        : "";
  const channelLabel =
    qrContext.orderType === "takeaway"
      ? "Takeaway"
      : qrContext.orderType === "delivery"
        ? "Delivery"
        : "Dine-in";
  const etaLabel =
    qrContext.orderType === "takeaway" ? "Siap ambil 15–20 menit" : "Diantar ke meja";

  // Ubah qty satu baris keranjang (kunci item::varian[::add-on]).
  function adjustKey(key: string, delta: number) {
    const { itemId, variantId, addonIds } = parseCartKey(key);
    const item = menuItems.find((entry) => entry.id === itemId);
    if (item?.stock === "sold_out" && delta > 0) {
      setMessage(`${item.name} sedang habis.`);
      return;
    }

    if (delta > 0 && item) {
      const variant = item.variants.find((entry) => entry.id === variantId);
      const addons = resolveAddons(item, addonIds);
      const detail = [
        variant && item.variants.length > 1 ? variant.label : "",
        ...addons.map((addon) => addon.label),
      ].filter(Boolean);
      const name = detail.length ? `${item.name} (${detail.join(", ")})` : item.name;
      lastAddedStampRef.current += 1;
      setLastAdded({ name, stamp: lastAddedStampRef.current });
      if (lastAddedTimerRef.current) window.clearTimeout(lastAddedTimerRef.current);
      lastAddedTimerRef.current = window.setTimeout(() => setLastAdded(null), 2200);
    }

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

  function add(itemId: string, variantId: string, delta: number, addonIds: string[] = []) {
    adjustKey(cartKey(itemId, variantId, addonIds), delta);
  }

  function setLineNote(key: string, value: string) {
    setCartNotes((notes) => ({ ...notes, [key]: value.slice(0, 160) }));
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
      if (guestNameMissing) {
        throw new Error("Nama customer wajib diisi.");
      }

      const existingChatToken =
        typeof window !== "undefined"
          ? (() => {
              try {
                return window.localStorage.getItem("garage:chatToken") || undefined;
              } catch {
                return undefined;
              }
            })()
          : undefined;
      const result = await postJson<CustomerOrderCreateResponse>("/api/customer/orders", {
        orderType: qrContext.orderType,
        tableLabel: qrContext.tableLabel,
        outletId: qrContext.outletId,
        customerMode: mode,
        guestName: mode === "guest" ? guestName.trim() : undefined,
        customerNote: customerNote.trim() || undefined,
        source: qrContext.source,
        campaign: qrContext.campaign,
        voucherCode: voucherCode.trim() || undefined,
        paymentMethod,
        paymentProvider: paymentProviderValue || undefined,
        paymentReference: paymentReference.trim() || undefined,
        chatToken: existingChatToken && existingChatToken.length >= 12 ? existingChatToken : undefined,
        items: cartLines.map((line) => ({
          itemId: line.item.id,
          variantId: line.variant.id,
          qty: line.qty,
          note: line.note.trim() || undefined,
          addonIds: line.addons.length ? line.addons.map((addon) => addon.id) : undefined,
        })),
      });

      setCart({});
      setCartNotes({});
      setCustomerNote("");
      setPaymentReference("");
      setCheckoutOpen(false);
      setMessage(`${result.order.orderNo} masuk ke kasir. Pembayaran menunggu konfirmasi.`);
      setLastOrder(result);
      // Persist supaya tracker tetap ada walau halaman di-refresh.
      try {
        window.localStorage.setItem(
          "garage:trackedOrder",
          JSON.stringify({ id: result.order.id, orderNo: result.order.orderNo }),
        );
      } catch {
        /* localStorage tidak tersedia */
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout gagal.");
    } finally {
      setBusy(false);
    }
  }

  const searching = normalizedQuery.length > 0;
  const menuGroups = useMemo(() => buildMenuGroups(menuItems), [menuItems]);
  // Banner atas: item "Unggulan" pilihan admin → kalau belum ada, item promo → Terlaris.
  const hero = useMemo<{ kind: HeroKind; items: MenuItem[] }>(() => {
    const available = menuItems.filter((item) => item.stock !== "sold_out");
    const featured = available.filter((item) => item.featured);
    if (featured.length) return { kind: "featured", items: featured.slice(0, 8) };
    const promo = available.filter(itemHasPromo);
    if (promo.length) return { kind: "promo", items: promo.slice(0, 8) };
    const best = (bestSellerIds ?? [])
      .map((id) => available.find((item) => item.id === id))
      .filter((item): item is MenuItem => Boolean(item))
      .slice(0, 6);
    return { kind: "best", items: best };
  }, [bestSellerIds, menuItems]);
  const heroLabel = hero.kind === "featured" ? "Unggulan" : hero.kind === "promo" ? "Promo" : "Terlaris";
  const categoryTabs = useMemo<CategoryTab[]>(
    () => [
      ...(hero.items.length ? [{ id: HERO_SECTION_ID, label: heroLabel }] : []),
      ...menuGroups.map((group) => ({ id: categorySectionId(group.category), label: group.category })),
    ],
    [hero.items.length, heroLabel, menuGroups],
  );

  function quickAdd(item: MenuItem) {
    if (!needsDetailSheet(item)) add(item.id, item.variants[0].id, 1);
    else setDetailItem(item);
  }

  const billLines = (
    <>
      <BillLine label="Subtotal" value={rupiah.format(subtotal)} />
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
    </>
  );

  const inputClass =
    "h-11 w-full rounded-md border bg-garage-bg-2 px-3.5 text-base text-white outline-none transition-colors placeholder:text-garage-mute focus:border-garage-amber";

  const checkoutContent = (
    <>
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
          <CartList lines={cartLines} onAdjust={adjustKey} onNote={setLineNote} />
        </div>
        <div className="mt-2 space-y-1.5 border-t border-garage-line pt-3 text-sm">{billLines}</div>
      </section>

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
        <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Metode pembayaran">
          {customerPaymentMethods.map((method) => {
            const label = method === "Cash" ? "Tunai" : method === "QRIS" ? "QRIS" : "Transfer";
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
            <strong className="text-white">{cashPaymentLabel}</strong> — bayar tunai langsung ke staf. Kasir
            mengonfirmasi sebelum pesanan diproses.
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
            <label className="grid gap-1.5">
              <span className="text-sm font-bold text-garage-dim">Rekening tujuan</span>
              <select
                value={paymentProvider}
                onChange={(event) => setPaymentProvider(event.target.value)}
                className={`${inputClass} border-garage-line`}
              >
                {customerBankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="rounded-md border border-garage-line bg-garage-bg-1 px-3 py-2.5 text-sm text-garage-dim">
              No. rekening:{" "}
              <span className="font-mono font-bold tabular-nums text-white">
                {customerBankAccounts.find((account) => account.id === paymentProvider)?.accountNumber ?? "-"}
              </span>
            </p>
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
          <p className="truncate font-mono text-xl font-bold tabular-nums text-white">{rupiah.format(total)}</p>
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

  const invoiceButtonClass =
    "garage-press inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-bold transition-colors sm:w-auto";

  return (
    <main
      className={`garage-shell min-h-screen overflow-x-clip text-white ${
        cartLines.length ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-12" : "pb-12"
      }`}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <OrderHeader
          tableLabel={qrContext.tableLabel}
          tableCode={compactTableNumber(qrContext.tableLabel)}
          dineIn={qrContext.orderType === "dine-in"}
          channelLabel={channelLabel}
          etaLabel={etaLabel}
          loginHref={loginHref}
          memberName={member?.name}
          onHelp={() => setHelpOpen(true)}
        />

        {!voucherResult?.valid && qrContext.campaign === "landing_menu" ? (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-garage-amber/40 bg-garage-amber/10 px-3.5 py-3">
            <TicketPercent className="size-5 shrink-0 text-garage-amber" aria-hidden />
            <p className="min-w-0 text-sm text-garage-dim">
              <strong className="text-white">Welcome QR — diskon Rp 5.000</strong> otomatis terpakai untuk
              transaksi pertama.
            </p>
          </div>
        ) : null}

        <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0">
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

            {!lastOrder && trackedOrderId && orderStatus ? (
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

            {lastOrder ? (
              <section className="mb-5 rounded-lg border border-garage-success/35 bg-garage-bg-1 p-4">
                {(() => {
                  const invoicePdfUrl = customerInvoicePdfUrl(orderStatus, lastOrder);
                  const invoiceWebUrl = customerInvoiceWebUrl(orderStatus, lastOrder);
                  const whatsappInvoiceUrl = customerWhatsappInvoiceUrl(orderStatus, lastOrder);
                  return (
                    <>
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#86efac]" />
                        <div className="min-w-0 flex-1">
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
                          {mode !== "guest" ? (
                            <p className="mt-3 text-sm font-semibold text-white">{lastOrder.memberCta}</p>
                          ) : null}
                        </div>
                      </div>
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

            <CategoryNav
              query={query}
              onQueryChange={setQuery}
              tabs={categoryTabs}
              resultCount={filteredMenu.length}
            />

            {loading ? (
              <div className={`${MENU_GRID_CLASS} pt-5`}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <MenuCardSkeleton key={index} />
                ))}
              </div>
            ) : searching ? (
              filteredMenu.length ? (
                <div className={`${MENU_GRID_CLASS} pt-4`}>
                  {filteredMenu.map((item) => (
                    <MenuCard
                      key={item.id}
                      item={item}
                      popular={bestSellerSet.has(item.id)}
                      cartQty={itemCartQty(item, cart)}
                      onAdd={(variantId, delta) => add(item.id, variantId, delta)}
                      onOpen={() => setDetailItem(item)}
                    />
                  ))}
                </div>
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
            ) : menuGroups.length ? (
              <>
                <HeroRail
                  id={HERO_SECTION_ID}
                  kind={hero.kind}
                  items={hero.items}
                  cart={cart}
                  onQuickAdd={quickAdd}
                  onOpen={setDetailItem}
                />
                <MenuSectionList
                  groups={menuGroups}
                  cart={cart}
                  bestSellerSet={bestSellerSet}
                  onAdd={add}
                  onOpen={setDetailItem}
                />
                <p className="mt-8 border-t border-garage-line pt-4 text-center text-sm text-garage-mute">
                  Pesanan dikonfirmasi kasir sebelum diproses dapur &amp; bar.
                </p>
              </>
            ) : (
              <div className="mt-6 rounded-lg border border-dashed border-garage-line-2 p-8 text-center text-sm text-garage-dim">
                Menu belum tersedia. Silakan hubungi staf GARAGE.
              </div>
            )}
          </div>

          <aside className="hidden lg:sticky lg:top-4 lg:block">
            <div className="rounded-lg border border-garage-line bg-garage-bg-1 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.35)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-white">Pesanan Anda</h2>
                  <p className="mt-0.5 text-sm text-garage-dim">
                    {channelLabel} · {qrContext.tableLabel}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-garage-dim">
                  {itemCount} item
                </span>
              </div>

              <div className="mt-3 max-h-[40vh] overflow-y-auto pr-1">
                <CartList lines={cartLines} onAdjust={adjustKey} onNote={setLineNote} />
              </div>

              {cartLines.length ? (
                <div className="mt-3 space-y-1.5 border-t border-garage-line pt-3 text-sm">
                  {billLines}
                  <div className="mt-2 flex items-center justify-between border-t border-garage-line pt-3">
                    <span className="text-sm font-semibold text-garage-dim">Total estimasi</span>
                    <strong className="font-mono text-xl font-bold tabular-nums text-white">
                      {rupiah.format(total)}
                    </strong>
                  </div>
                </div>
              ) : null}

              <button
                className="garage-press mt-4 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-garage-red px-4 text-[15px] font-bold text-white transition-colors hover:bg-garage-red-bright disabled:cursor-not-allowed disabled:opacity-60"
                onClick={openCheckout}
                disabled={!cartLines.length}
              >
                <ShoppingBag className="size-4" />
                Checkout
              </button>
              {!cartLines.length ? (
                <p className="mt-3 text-center text-sm text-garage-dim">
                  Pilih menu untuk melihat total dan lanjut checkout.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      {cartLines.length ? <OrderCartBar itemCount={itemCount} total={total} onOpen={openCheckout} lastAdded={lastAdded} /> : null}

      {showScrollTop ? (
        <button
          type="button"
          aria-label="Kembali ke atas"
          className={`garage-press fixed right-4 z-30 flex size-11 cursor-pointer items-center justify-center rounded-md border border-garage-line-2 bg-garage-bg-1/95 text-white shadow-[0_12px_32px_rgba(0,0,0,0.4)] transition-colors hover:border-garage-amber/60 ${
            cartLines.length ? "bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-6" : "bottom-5 lg:bottom-6"
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

      <MenuDetailSheet
        item={detailItem}
        cart={cart}
        onAdjust={add}
        onClose={() => setDetailItem(null)}
      />

      {qrContext.orderType === "dine-in" ? (
        <OrderHelpSheet
          open={helpOpen}
          onOpenChange={setHelpOpen}
          tableLabel={qrContext.tableLabel}
          busyType={helpBusy}
          message={helpMessage}
          onRequest={(type, label) => void callService(type, label)}
        >
          <CustomerChatPanel tableLabel={qrContext.tableLabel} />
        </OrderHelpSheet>
      ) : null}

      <Sheet open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <SheetContent
          side="bottom"
          className="inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[92svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border-garage-line bg-garage-bg-1 p-0 text-white sm:inset-x-4 sm:bottom-4 sm:w-[min(640px,calc(100vw-32px))] sm:rounded-xl sm:border"
        >
          <SheetHeader className="border-b border-garage-line p-4 text-left">
            <SheetTitle className="pr-8 font-sans text-xl font-bold text-white">Checkout · {qrContext.tableLabel}</SheetTitle>
            <SheetDescription className="text-sm text-garage-dim">
              Cek pesanan, isi nama, pilih pembayaran, lalu kirim ke kasir.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-3 p-3 sm:p-4">{checkoutContent}</div>
          </div>
          {checkoutFooter}
        </SheetContent>
      </Sheet>
    </main>
  );
}
