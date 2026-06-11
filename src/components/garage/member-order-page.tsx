"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChefHat,
  ChevronUp,
  CheckCircle2,
  Clock,
  Coffee,
  Cookie,
  CupSoda,
  FileText,
  Flame,
  GlassWater,
  LogIn,
  UtensilsCrossed,
  MessageCircle,
  Minus,
  PackageCheck,
  Plus,
  QrCode,
  ReceiptText,
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
  fullWidth = false,
}: {
  label: string;
  qty: number;
  onMinus: () => void;
  onPlus: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  if (qty <= 0) {
    return (
      <button
        type="button"
        className={`garage-press inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#d11a2a] px-4 text-sm font-black text-white transition hover:bg-[#ff2a3a] disabled:cursor-not-allowed disabled:bg-[#4a4a54] disabled:text-[#b8b8bf] ${
          fullWidth ? "w-full" : "min-w-[112px] shrink-0"
        }`}
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
    <div
      className={`inline-flex h-11 items-center overflow-hidden rounded-md border border-[#4a4a54] bg-[#15151b] ${
        fullWidth ? "w-full justify-between" : "shrink-0"
      }`}
    >
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
    <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-semibold text-white">{line.item.name}</p>
          <p className="mt-1 text-xs text-[#b8b8bf]">
            {line.variant.label} &middot; {rupiah.format(line.variant.price * line.qty)}
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
          <p className="garage-mono shrink-0 text-sm font-semibold text-white">{line.qty}x</p>
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
            className="mt-2 h-9 w-full rounded-md border border-[#34343c] bg-[#111116] px-3 text-xs text-white outline-none transition placeholder:text-[#777782] focus:border-[#f5a742]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="garage-press mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#f5a742]"
          >
            <Plus className="size-3" /> Tambah catatan
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
      <div className="rounded-md border border-dashed border-[#4a4a54] p-4 text-center text-sm text-[#b8b8bf]">
        Keranjang kosong.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lines.map((line) => (
        <CartRow key={line.key} line={line} onAdjust={onAdjust} onNote={onNote} />
      ))}
    </div>
  );
}

// Placeholder profesional saat menu belum berfoto: ikon garis monokrom
// (gaya industrial Garage), bukan emoji. Tampil di kartu & sheet detail.
function categoryGlyph(category: string, className: string) {
  if (category === "Coffee") return <Coffee strokeWidth={1.25} className={className} />;
  if (category === "Non-Coffee") return <CupSoda strokeWidth={1.25} className={className} />;
  if (category === "Cemilan") return <Cookie strokeWidth={1.25} className={className} />;
  return <UtensilsCrossed strokeWidth={1.25} className={className} />;
}

function CategoryPlaceholder({ category, large = false }: { category: string; large?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_32%,#2a2724,#131211)]">
      {categoryGlyph(category, `${large ? "size-12" : "size-8"} text-[#7c7c84]`)}
      <span
        className={`garage-mono font-bold uppercase tracking-[0.24em] text-[#6e6e77] ${
          large ? "text-[11px]" : "text-[9px]"
        }`}
      >
        {category}
      </span>
    </div>
  );
}

// Kartu menu ringkas: foto/ikon, nama, waktu, harga (atau "mulai"),
// dan satu aksi yang jelas. Item multi-varian membuka sheet detail;
// item satu-varian langsung pakai stepper di kartu.
function MenuCard({
  item,
  cartQty,
  popular = false,
  onAdd,
  onOpen,
}: {
  item: MenuItem;
  cartQty: number;
  popular?: boolean;
  onAdd: (variantId: string, delta: number) => void;
  onOpen: () => void;
}) {
  const soldOut = item.stock === "sold_out";
  const minPrice = Math.min(...item.variants.map((variant) => variant.price));
  const multiVariant = item.variants.length > 1;
  const singleVariantId = item.variants[0]?.id;

  return (
    <article
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#3a3a3a] bg-[#1c1b1b] transition hover:border-[#d4af37]/45 ${
        soldOut ? "opacity-70" : ""
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={soldOut}
        aria-label={`Lihat ${item.name}`}
        className="relative block aspect-square w-full overflow-hidden bg-gradient-to-br from-[#2a2622] to-[#161616] text-left"
      >
        {item.imageUrl ? (
          // Foto menu berasal dari URL bebas (di-set admin) â€” pakai <img> biasa
          // supaya tidak terikat remotePatterns next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <CategoryPlaceholder category={item.category} />
        )}
        {item.imageUrl ? (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/25" />
        ) : null}
        <span className="absolute left-2 top-2 rounded-full bg-[#0d0d0d]/85 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#f2ca50] backdrop-blur">
          {item.category}
        </span>
        {!soldOut && popular ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#f5a742] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#1a1206] shadow-[0_6px_16px_rgba(0,0,0,0.4)]">
            <Flame className="size-3" /> Paling laku
          </span>
        ) : !soldOut && item.stock === "limited" ? (
          <span className="absolute right-2 top-2 rounded-full border border-[#f2ca50]/55 bg-[#f2ca50]/15 px-2 py-0.5 text-[10px] font-bold text-[#ffe7a4]">
            Terbatas
          </span>
        ) : null}
        {soldOut ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-black uppercase tracking-widest text-[#ffb4ac]">
            Habis
          </span>
        ) : null}
        {cartQty > 0 ? (
          <span className="absolute bottom-2 right-2 rounded-full bg-[#d11a2a] px-2 py-0.5 text-[11px] font-black text-white shadow-[0_6px_16px_rgba(0,0,0,0.4)]">
            {cartQty} di keranjang
          </span>
        ) : null}
      </button>

      <div className="flex flex-1 flex-col p-3">
        <h2 className="line-clamp-2 min-h-[2.6em] text-sm font-black leading-snug text-white">
          {item.name}
        </h2>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-[#b8b8bf]">
          <Clock className="size-3 text-[#f5a742]" /> {item.prep} &middot; {item.section}
        </p>
        {/* Footer kartu: harga selalu tampil penuh di atas, aksi full-width di
            bawah. Mencegah tombol menutupi harga di kartu sempit (mobile 2 kolom). */}
        <div className="mt-2.5 flex flex-col gap-2">
          <p className="flex items-baseline gap-1.5">
            {multiVariant ? (
              <span className="text-[10px] uppercase tracking-wide text-[#b8b8bf]">mulai</span>
            ) : null}
            <span className="truncate text-base font-black text-[#f2ca50]">
              {rupiah.format(minPrice)}
            </span>
          </p>
          {soldOut ? (
            <span className="w-full rounded-md border border-[#4a4a54] py-2 text-center text-xs font-bold text-[#888]">
              Habis
            </span>
          ) : multiVariant ? (
            <button
              type="button"
              onClick={onOpen}
              className="garage-press inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-[#d11a2a] px-4 text-sm font-black text-white transition hover:bg-[#ff2a3a]"
            >
              <Plus className="size-4" /> Pilih
            </button>
          ) : (
            <QuantityControl
              label={item.name}
              qty={cartQty}
              fullWidth
              onMinus={() => singleVariantId && onAdd(singleVariantId, -1)}
              onPlus={() => singleVariantId && onAdd(singleVariantId, 1)}
            />
          )}
        </div>
      </div>
    </article>
  );
}

// Sheet detail item â€” momen "memilih": foto besar, info, daftar varian
// dengan harga + stepper. Keranjang diperbarui langsung.
function MenuDetailSheet({
  item,
  cart,
  onAdjust,
  onClose,
}: {
  item: MenuItem | null;
  cart: Record<string, number>;
  onAdjust: (itemId: string, variantId: string, delta: number) => void;
  onClose: () => void;
}) {
  const totalInCart = item
    ? item.variants.reduce((sum, variant) => sum + (cart[cartKey(item.id, variant.id)] ?? 0), 0)
    : 0;

  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent
        side="bottom"
        className="garage-shell inset-x-0 bottom-0 z-[95] mx-auto flex max-h-[90svh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border-[#34343c] bg-[#111116] p-0 text-white sm:inset-x-4 sm:bottom-4 sm:w-[min(520px,calc(100vw-32px))] sm:rounded-2xl sm:border"
      >
        {item ? (
          <>
            <div className="relative aspect-square w-full shrink-0 overflow-hidden">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <CategoryPlaceholder category={item.category} large />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111116] via-[#111116]/10 to-transparent" />
              <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-[#0d0d0d]/80 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[#f2ca50] backdrop-blur">
                {item.category}
              </span>
            </div>
            <SheetHeader className="border-b border-[#34343c] px-4 pb-4 pt-3 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle
                    className="text-lg font-black leading-tight tracking-normal text-white sm:text-xl"
                    style={{
                      fontFamily:
                        'var(--font-space-grotesk), "Space Grotesk", ui-sans-serif, system-ui, sans-serif',
                    }}
                  >
                    {item.name}
                  </SheetTitle>
                  <SheetDescription className="mt-1.5 flex items-center gap-1 text-xs text-[#b8b8bf]">
                    <Clock className="size-3.5 text-[#f5a742]" /> {item.prep} &middot; {item.section}
                  </SheetDescription>
                </div>
                <div className="shrink-0 text-right">
                  <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8a8a93]">
                    {item.variants.length > 1 ? "Mulai" : "Harga"}
                  </p>
                  <p className="text-base font-black text-[#f2ca50]">
                    {rupiah.format(Math.min(...item.variants.map((variant) => variant.price)))}
                  </p>
                </div>
              </div>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-[#d6d6dc]">
                {item.variants.length > 1 ? "Pilih varian" : "Jumlah pesanan"}
              </p>
              <div className="space-y-2">
                {item.variants.map((variant) => {
                  const qty = cart[cartKey(item.id, variant.id)] ?? 0;
                  const singleVariant = item.variants.length === 1;
                  return (
                    <div
                      key={variant.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border p-3.5 transition ${
                        qty > 0
                          ? "border-[#d11a2a]/55 bg-[#d11a2a]/10 ring-1 ring-inset ring-[#d11a2a]/30"
                          : "border-[#34343c] bg-white/[0.04]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="line-clamp-1 text-base font-bold text-white">
                            {variant.label}
                          </p>
                          {qty > 0 ? (
                            <span className="shrink-0 rounded-full bg-[#d11a2a] px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white">
                              {qty}&times; di keranjang
                            </span>
                          ) : null}
                        </div>
                        {/* Harga per-varian hanya untuk multi-varian â€” item satu varian
                            harganya sudah jelas di header (hindari tampil 2x). */}
                        {!singleVariant ? (
                          <p className="mt-0.5 text-sm font-black text-[#f2ca50]">
                            {rupiah.format(variant.price)}
                          </p>
                        ) : null}
                      </div>
                      <QuantityControl
                        label={`${item.name} ${variant.label}`}
                        qty={qty}
                        onMinus={() => onAdjust(item.id, variant.id, -1)}
                        onPlus={() => onAdjust(item.id, variant.id, 1)}
                        disabled={item.stock === "sold_out"}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-[#34343c] bg-[#111116] p-3 sm:p-4">
              <button
                type="button"
                onClick={onClose}
                className="garage-press flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#d11a2a] px-4 text-sm font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#ff2a3a]"
              >
                {totalInCart > 0 ? `Selesai (${totalInCart} item)` : "Tutup"}
              </button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function stationEmoji(station: string) {
  if (station === "Bar") return "☕"; // coffee
  if (station === "Packaging" || station === "Packing") return "\u{1F4E6}"; // box
  return "\u{1F37D}\u{FE0F}"; // plate â€” Dapur
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
      <div className="mt-3 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm font-semibold text-[#ffb0b8]">
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
      {/* Headline status */}
      {allReady || ks === "ready" ? (
        <div className="flex items-center gap-3 rounded-lg border border-[#22c55e]/45 bg-[#22c55e]/12 p-3">
          <PackageCheck className="size-7 shrink-0 text-[#86efac]" />
          <div className="min-w-0">
            <p className="text-base font-black text-[#bbf7d0]">Pesanan SIAP {"\u{1F389}"}</p>
            <p className="text-xs text-[#dcfce7]">Silakan ambil atau akan segera diantar.</p>
          </div>
        </div>
      ) : done ? (
        <div className="flex items-center gap-3 rounded-lg border border-[#22c55e]/35 bg-[#22c55e]/10 p-3">
          <CheckCircle2 className="size-7 shrink-0 text-[#86efac]" />
          <p className="text-sm font-bold text-[#dcfce7]">Pesanan selesai. Terima kasih!</p>
        </div>
      ) : anyCooking && headlineSec != null ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#f5a742]/40 bg-[#f5a742]/10 p-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#ffd79a]">
              Estimasi siap dalam
            </p>
            <p className="font-mono text-3xl font-black tabular-nums leading-none text-white">
              {formatMmSs(headlineSec)}
            </p>
          </div>
          <ChefHat className="size-8 shrink-0 text-[#f5a742]" />
        </div>
      ) : ks === "queue" ? (
        <div className="flex items-center gap-3 rounded-lg border border-[#34343c] bg-white/[0.05] p-3">
          <Clock className="size-6 shrink-0 text-[#f5a742]" />
          <p className="text-sm font-semibold text-[#e7e7ea]">
            Masuk antrean dapur
            {headlineSec != null ? ` — perkiraan ± ${Math.max(1, Math.round(headlineSec / 60))} menit.` : "."}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-[#34343c] bg-white/[0.05] p-3">
          <Clock className="size-6 shrink-0 text-[#f5a742]" />
          <p className="text-sm font-semibold text-[#e7e7ea]">Menunggu konfirmasi kasir…</p>
        </div>
      )}

      {/* Stepper berikon */}
      <div className="flex items-start gap-1.5">
        {steps.map((step, index) => {
          const reached = index <= stepIndex;
          const current = index === stepIndex && !done;
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`flex size-8 items-center justify-center rounded-full border transition ${
                  reached
                    ? "border-[#22c55e]/55 bg-[#22c55e]/15 text-[#86efac]"
                    : "border-[#34343c] bg-white/[0.04] text-[#8f8f99]"
                } ${current ? "ring-2 ring-[#f5a742]/55" : ""}`}
              >
                <Icon className="size-4" />
              </div>
              <span
                className={`text-center text-[10px] font-bold ${
                  current ? "text-[#ffd79a]" : reached ? "text-[#dcfce7]" : "text-[#8f8f99]"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ETA per station */}
      {stations.length ? (
        <div className="flex flex-wrap gap-2">
          {stations.map((entry) => {
            const tone = entry.ready
              ? "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#bbf7d0]"
              : entry.status === "cooking"
                ? "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd79a]"
                : "border-[#34343c] bg-white/[0.05] text-[#d6d6dc]";
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
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums ${tone}`}
              >
                <span>{stationEmoji(entry.station)}</span>
                {entry.station}: {label}
              </span>
            );
          })}
        </div>
      ) : null}

      <p className="garage-mono text-[10px] text-[#9a9aa3]">Update otomatis tiap 8 detik</p>
    </div>
  );
}

export function MemberOrderPage({
  initialQrContext,
  initialReturnPath,
  initialSearchQuery,
  initialMenuItems,
  bestSellerIds,
}: {
  initialQrContext?: QrContext;
  initialReturnPath?: string;
  initialSearchQuery?: string;
  initialMenuItems?: MenuItem[];
  bestSellerIds?: string[];
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
  const [query, setQuery] = useState(() =>
    (initialSearchQuery ?? readInitialSearchQuery()).trim().slice(0, 80),
  );
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [guestName, setGuestName] = useState("");
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
          return { item, variant, qty, key, note: cartNotes[key] ?? "" };
        })
        .filter((line): line is CartLine => Boolean(line)),
    [cart, menuItems, cartNotes],
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
    !soldOutCartLine;
  const checkoutBlockReason = memberMissing
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
    qrContext.orderType === "takeaway" ? "Siap ambil 15-20 menit" : "Dikirim ke kasir";

  function add(itemId: string, variantId: string, delta: number) {
    const item = menuItems.find((entry) => entry.id === itemId);
    if (item?.stock === "sold_out") {
      setMessage(`${item.name} sedang habis.`);
      return;
    }

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
      if (guestNameMissing) {
        throw new Error("Nama customer wajib diisi.");
      }

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
        items: cartLines.map((line) => ({
          itemId: line.item.id,
          variantId: line.variant.id,
          qty: line.qty,
          note: line.note.trim() || undefined,
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

  const checkoutContent = (
    <>
      {/* PESANAN â€” review item paling atas: lihat semua item, ubah qty,
          tambah catatan per-item, dan subtotal langsung terlihat. */}
      <div className="rounded-lg border border-[#34343c] bg-[#15151b]/84 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black uppercase tracking-[0.04em] text-white">Pesanan</p>
          <span className="rounded-full border border-[#f5a742]/45 bg-[#f5a742]/12 px-2.5 py-0.5 text-xs font-bold text-[#ffd79a]">
            {itemCount} item
          </span>
        </div>
        <div className="mt-3">
          <CartList lines={cartLines} onAdjust={add} onNote={setLineNote} />
        </div>
        <div className="mt-3 space-y-1.5 border-t border-[#34343c] pt-3 text-sm">
          <BillLine label="Subtotal" value={rupiah.format(subtotal)} />
          <BillLine label="Service" value={rupiah.format(service)} />
          {discount > 0 ? (
            <BillLine label={discountLabel} value={`- ${rupiah.format(discount)}`} />
          ) : null}
          {voucherDiscount > 0 ? (
            <BillLine label="Voucher tambahan" value={`- ${rupiah.format(voucherDiscount)}`} />
          ) : null}
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#d6d6dc]">
        Data Customer
      </p>
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
              <p className="text-sm font-bold text-white">Guest</p>
              <p className="truncate text-xs text-[#c7c7ce]">Tanpa login, langsung pesan</p>
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
              <p className="text-sm font-bold text-white">Member</p>
              <p className="truncate text-xs text-[#c7c7ce]">
                {member ? `${member.level} - ${number.format(member.totalPoints)} pts` : "Login dulu"}
              </p>
            </div>
          </div>
        </button>
      </div>

      {mode === "guest" ? (
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#d6d6dc]">
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
            <span className="text-xs font-semibold text-[#ffb0b8]">Nama wajib diisi.</span>
          ) : null}
        </label>
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

      {/* Ekstra opsional â€” disembunyikan agar minimalis */}
      <div className="flex flex-wrap gap-2">
        {!showVoucherField && !voucherResult ? (
          <button
            type="button"
            onClick={() => setShowVoucherField(true)}
            className="garage-press inline-flex items-center gap-1.5 rounded-full border border-[#4a4a54] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-[#ffd79a] hover:bg-white/[0.08]"
          >
            <TicketPercent className="size-3.5" /> Punya kode promo?
          </button>
        ) : null}
        {!showNoteField && !customerNote ? (
          <button
            type="button"
            onClick={() => setShowNoteField(true)}
            className="garage-press inline-flex items-center gap-1.5 rounded-full border border-[#4a4a54] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-[#d6d6dc] hover:bg-white/[0.08]"
          >
            <Plus className="size-3.5" /> Tambah catatan
          </button>
        ) : null}
      </div>

      {showVoucherField || voucherResult ? (
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
              placeholder="Kode voucher"
              autoComplete="off"
            />
            <button
              type="button"
              className="garage-press h-11 shrink-0 rounded-md border border-[#4a4a54] px-4 text-xs font-bold text-white disabled:opacity-50"
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
      ) : null}

      {showNoteField || customerNote ? (
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#d6d6dc]">
            Catatan
          </span>
          <input
            value={customerNote}
            onChange={(event) => setCustomerNote(event.target.value)}
            className="h-11 w-full rounded-md border border-[#34343c] bg-white/[0.055] px-4 text-sm text-white outline-none transition placeholder:text-[#777782] focus:border-[#f5a742]"
            placeholder="Contoh: tidak pedas, gula sedikit"
          />
        </label>
      ) : null}

      <div className="rounded-lg border border-[#34343c] bg-[#15151b]/84 p-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#d6d6dc]">
          Pembayaran
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {customerPaymentMethods.map((method) => {
            const label = method === "Cash" ? "Tunai" : method === "QRIS" ? "QRIS" : "Transfer";
            const selected = paymentMethod === method;
            return (
              <button
                key={method}
                type="button"
                className={`garage-press flex min-h-11 items-center justify-center rounded-md border px-2 text-center text-sm font-bold transition ${
                  selected
                    ? "border-[#d11a2a] bg-[#d11a2a]/18 text-white"
                    : "border-[#34343c] bg-white/[0.04] text-[#d6d6dc] hover:bg-white/[0.07]"
                }`}
                onClick={() => {
                  setPaymentMethod(method);
                  setPaymentReference("");
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-5 text-[#b8b8bf]">
          Bayar saat di kasir / meja. Kasir konfirmasi sebelum lunas.
        </p>

        {paymentMethod === "Cash" ? (
          <p className="mt-3 rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3 text-xs font-semibold leading-5 text-[#ffe0aa]">
            {cashPaymentLabel} — bayar tunai langsung ke karyawan.
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
      className={`garage-shell min-h-screen overflow-x-hidden bg-[#0d0d0d] text-white ${
        cartLines.length
          ? "pb-[calc(10.5rem+env(safe-area-inset-bottom))] sm:pb-36 lg:pb-8"
          : "pb-6 lg:pb-8"
      }`}
    >
      <section className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-7 sm:py-7 lg:px-10">
        <header className="flex items-center justify-between gap-4">
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
            <div className="garage-mono flex size-12 shrink-0 items-center justify-center rounded-md border border-[#d4af37]/55 bg-[#d4af37]/14 text-lg font-black text-[#ffe7a4]">
              {compactTableNumber(qrContext.tableLabel)}
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="garage-mono text-[10px] text-[#b8b8bf]">{channelLabel}</p>
              <p className="truncate text-sm font-semibold text-white">{etaLabel}</p>
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

        {qrContext.orderType === "dine-in" ? (
          <div className="mt-5 rounded-lg border border-[#34343c] bg-[#15151b]/80 p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-[#f5a742]" />
              <p className="text-sm font-black text-white">
                Butuh bantuan di {qrContext.tableLabel}?
              </p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(
                [
                  ["call", "Panggil pelayan", Bell],
                  ["bill", "Minta bill", FileText],
                  ["water", "Air / tisu", GlassWater],
                ] as const
              ).map(([type, label, Icon]) => (
                <button
                  key={type}
                  type="button"
                  disabled={helpBusy === type}
                  onClick={() => void callService(type, label)}
                  className="garage-press flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-md border border-[#4a4a54] bg-white/[0.04] px-2 py-2 text-center text-xs font-bold text-[#e7e7ea] transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  <Icon className="size-5 text-[#f5a742]" />
                  {helpBusy === type ? "Mengirim..." : label}
                </button>
              ))}
            </div>
            {helpMessage ? (
              <p className="mt-2 rounded-md border border-[#22c55e]/35 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#dcfce7]">
                {helpMessage}
              </p>
            ) : null}
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0">
            <div className="rounded-lg border border-[#4d4635] bg-[#15130f] p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-sm border border-[#d4af37]/35 bg-[#d4af37]/10 px-3 py-1 text-xs font-black uppercase text-[#ffe7a4]">
                    <QrCode size={14} />
                    {channelLabel} - {qrContext.campaign ?? "landing menu"}
                  </div>
                  <h1 className="garage-display mt-3 text-[clamp(30px,7vw,54px)] leading-none">
                    Digital Menu GARAGE
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d0c5af]">
                    Pilih menu, cek estimasi total, lalu kirim order ke kasir untuk validasi.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4d4635] bg-[#201f1f] px-3 py-1 text-[11px] font-semibold text-white">
                      <span className="size-2 animate-pulse rounded-full bg-[#f2ca50]" aria-hidden />
                      Buka sekarang
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4d4635] bg-[#201f1f] px-3 py-1 text-[11px] font-semibold text-white">
                      <Clock size={12} className="text-[#f2ca50]" />
                      {qrContext.orderType === "takeaway" ? "Estimasi siap 8-12 mnt" : etaLabel}
                    </span>
                    <span className="garage-mono rounded-full border border-[#4d4635] bg-[#201f1f] px-3 py-1 text-[10px] uppercase text-[#d0c5af]">
                      QRIS · Cash · Transfer
                    </span>
                  </div>
                </div>
                {cartLines.length ? (
                  <div className="grid grid-cols-2 gap-2 sm:w-[260px]">
                    <div className="rounded-md border border-[#4d4635] bg-[#201f1f] p-3">
                      <p className="garage-mono text-[10px] text-[#8f8f98]">ITEM</p>
                      <p className="mt-1 text-xl font-black text-white">{itemCount}</p>
                    </div>
                    <div className="rounded-md border border-[#4d4635] bg-[#201f1f] p-3">
                      <p className="garage-mono text-[10px] text-[#8f8f98]">TOTAL</p>
                      <p className="mt-1 truncate text-sm font-black text-[#f2ca50]">
                        {rupiah.format(total)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="sticky top-2 z-20 mt-5 rounded-lg border border-[#34343c] bg-[#0d0d0d]/96 px-3.5 py-3.5 backdrop-blur-xl sm:px-4 lg:top-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8d8d96]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-12 w-full rounded-md border border-[#404040] bg-[#121212] pl-10 pr-10 text-white outline-none transition placeholder:text-[#777782] focus:border-[#d4af37]"
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
              <div className="garage-scroll-x mt-3.5 flex items-center gap-2.5 pb-1">
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`garage-press h-11 shrink-0 rounded-md border px-4 text-sm font-semibold transition ${
                      category === item
                        ? "border-[#d4af37] bg-[#d4af37] text-[#241a00]"
                        : "border-[#404040] bg-[#201f1f] text-[#d6d6dc]"
                    }`}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
                <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#d20419]/55 bg-[#d20419]/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-[#ffb4ac]">
                  <TicketPercent size={12} />
                  Promo
                </span>
              </div>
            </div>

            {!voucherResult?.valid && qrContext.campaign === "landing_menu" ? (
              <div className="mt-5 flex items-center justify-between gap-3 rounded-md border border-[#4d4635] border-l-4 border-l-[#f2ca50] bg-[#15130f] p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="garage-mono text-[10px] font-black uppercase tracking-widest text-[#f2ca50]">
                    Limited Offer
                  </p>
                  <h3 className="mt-1 truncate text-base font-black text-white sm:text-lg">
                    Welcome QR — diskon Rp 5.000
                  </h3>
                  <p className="mt-0.5 text-xs text-[#d0c5af]">
                    Otomatis terpakai di cart untuk transaksi pertama.
                  </p>
                </div>
                <TicketPercent className="size-6 shrink-0 text-[#f2ca50]" />
              </div>
            ) : null}

            {message && !checkoutOpen ? (
              <div className="mt-5 rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-4 text-sm leading-6 text-[#ffd7da]">
                {message}
              </div>
            ) : null}

            {!lastOrder && trackedOrderId && orderStatus ? (
              <div className="mt-5 rounded-md border border-[#22c55e]/35 bg-[#22c55e]/10 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#86efac]" />
                  <div className="min-w-0">
                    <p className="text-lg font-black text-white">
                      Status pesanan {trackedOrderNo ?? orderStatus.orderNo}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#dcfce7]">{orderStatus.message}</p>
                  </div>
                </div>
                <OrderTracker status={orderStatus} />
                {orderStatus.invoiceWebUrl ? (
                  <a
                    href={orderStatus.invoiceWebUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="garage-press mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/12 text-sm font-semibold text-[#ffe7b8] sm:w-auto sm:px-4"
                  >
                    <FileText size={16} />
                    Buka halaman tracking
                  </a>
                ) : null}
              </div>
            ) : null}

            {lastOrder ? (
              <div className="mt-5 rounded-md border border-[#22c55e]/35 bg-[#22c55e]/10 p-4 sm:p-5">
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
                    <div className="mt-3">
                      <span className="garage-mono rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 px-2 py-1 text-[10px] text-[#ffd79a]">
                        {lastOrder.order.paymentMethod ?? "Cash"}
                      </span>
                    </div>
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

            <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
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
                  <MenuCard
                    key={item.id}
                    item={item}
                    popular={bestSellerSet.has(item.id)}
                    cartQty={item.variants.reduce(
                      (sum, variant) => sum + (cart[cartKey(item.id, variant.id)] ?? 0),
                      0,
                    )}
                    onAdd={(variantId, delta) => add(item.id, variantId, delta)}
                    onOpen={() => setDetailItem(item)}
                  />
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

          <aside className="hidden lg:block">
            <div className="sticky top-5 rounded-lg border border-[#4d4635] bg-[#15130f] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="garage-mono text-[10px] uppercase text-[#d0c5af]/75">
                    Order summary
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white">{channelLabel}</h2>
                  <p className="mt-1 text-sm text-[#d0c5af]">{etaLabel}</p>
                </div>
                <div className="garage-mono flex size-12 shrink-0 items-center justify-center rounded-md border border-[#d4af37]/45 bg-[#d4af37]/12 text-base font-black text-[#ffe7a4]">
                  {compactTableNumber(qrContext.tableLabel)}
                </div>
              </div>

              <div className="mt-4 max-h-[34vh] overflow-y-auto pr-1">
                <CartList lines={cartLines} onAdjust={add} onNote={setLineNote} />
              </div>

              <div className="mt-4 space-y-1.5 rounded-md border border-[#404040] bg-[#121212] p-3 text-sm">
                <BillLine label="Item" value={`${itemCount}`} />
                <BillLine label="Subtotal" value={rupiah.format(subtotal)} />
                <BillLine label="Service" value={rupiah.format(service)} />
                {discount > 0 ? (
                  <BillLine label={discountLabel} value={`- ${rupiah.format(discount)}`} />
                ) : null}
                {voucherDiscount > 0 ? (
                  <BillLine label="Voucher tambahan" value={`- ${rupiah.format(voucherDiscount)}`} />
                ) : null}
                <div className="mt-3 flex items-center justify-between border-t border-[#404040] pt-3">
                  <span className="text-sm font-semibold text-[#d0c5af]">Total estimasi</span>
                  <strong className="text-xl font-black text-[#f2ca50]">
                    {rupiah.format(total)}
                  </strong>
                </div>
              </div>

              <button
                className="garage-press mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#d4af37] px-4 text-sm font-black uppercase tracking-[0.06em] text-[#241a00] transition hover:bg-[#f2ca50] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={openCheckout}
                disabled={!cartLines.length}
              >
                <ShoppingCart className="size-4" />
                Checkout
              </button>
              {!cartLines.length ? (
                <p className="mt-3 text-center text-xs leading-5 text-[#d0c5af]">
                  Pilih menu untuk melihat total dan lanjut checkout.
                </p>
              ) : null}
            </div>
          </aside>

        </section>
      </section>

      {cartLines.length ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:hidden"
        >
          <button
            type="button"
            onClick={openCheckout}
            className="garage-press flex w-full max-w-md items-center justify-between gap-3 rounded-full bg-[#f2ca50] px-5 py-3.5 text-[#241a00] shadow-[0_18px_44px_rgba(0,0,0,0.55)] transition hover:bg-[#ffd97a] active:scale-[0.97]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <ShoppingCart className="size-6" />
                <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full border-2 border-[#f2ca50] bg-[#241a00] text-[10px] font-black text-[#f2ca50]">
                  {itemCount}
                </span>
              </div>
              <div className="flex min-w-0 flex-col items-start leading-tight">
                <span className="garage-mono text-[11px] font-bold uppercase tracking-wide text-[#4a3a08]">
                  {itemCount} item &middot; Subtotal
                </span>
                <span className="truncate text-xl font-black leading-tight text-[#1c1500]">
                  {rupiah.format(total)}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#241a00] px-4 py-2.5 text-[#ffd97a] shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
              <span className="text-xs font-black uppercase tracking-[0.06em]">
                Lihat Pesanan
              </span>
              <ChevronUp className="size-4" />
            </div>
          </button>
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

      <MenuDetailSheet
        item={detailItem}
        cart={cart}
        onAdjust={add}
        onClose={() => setDetailItem(null)}
      />

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
                <SheetTitle
                  className="text-lg font-black tracking-normal text-white sm:text-xl"
                  style={{
                    fontFamily:
                      'var(--font-space-grotesk), "Space Grotesk", ui-sans-serif, system-ui, sans-serif',
                  }}
                >
                  Checkout {qrContext.tableLabel}
                </SheetTitle>
                <SheetDescription className="mt-1 text-xs text-[#cdcdd4] sm:text-sm">
                  Cek pesanan, isi nama, lalu kirim ke kasir.
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
