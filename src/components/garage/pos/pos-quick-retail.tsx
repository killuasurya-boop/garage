"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Banknote, Minus, Package, Plus, QrCode, ScanLine, ShoppingBag, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { garageApi } from "@/lib/api-client";
import type { AppSettings, MenuItem, OrderCreateResponse, OrderReceipt } from "@/lib/garage-api-types";
import { calculateBillingTotals } from "@/lib/garage-billing";
import {
  idempotencyAttemptFor,
  isUncertainSubmitError,
  markAttemptAfterError,
  UNCERTAIN_SUBMIT_MESSAGE,
  type IdempotencyAttempt,
} from "@/lib/idempotency-client";
import { quickCashOptions } from "@/lib/pos-cash";
import {
  isQuickRetailProduct,
  matchQuickRetail,
  QUICK_RETAIL_ALL_TAB,
  QUICK_RETAIL_FAVORITE_STORAGE_KEY,
  QUICK_RETAIL_FAVORITE_TAB,
  quickRetailItemsForTab,
  quickRetailTabs,
} from "@/lib/quick-retail";
import { cashConfirmLabel, normalizePaymentReference } from "@/lib/tender-guard";

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

type Line = { itemId: string; variantId: string; qty: number };
type Tender = "Cash" | "QRIS";

/** Harga jual efektif (sama dengan server: promo hanya bila lebih murah). */
function unitPriceOf(item: MenuItem, variantPrice: number) {
  return item.promoActive && item.promoPrice && item.promoPrice > 0 && item.promoPrice < variantPrice
    ? item.promoPrice
    : variantPrice;
}

/**
 * Penjualan Langsung / Quick Retail (PRD §09.3, POS-05): produk kemasan tanpa
 * meja & tanpa label take away. Scan barcode/SKU atau cari nama, bayar Tunai
 * atau QRIS saat itu juga (tender guard berlaku), tanpa tiket Bar/Dapur.
 * Harga, stok & aturan produk divalidasi ulang di server (`saleChannel`).
 */
export function PosQuickRetail({
  shiftOpen,
  cashAllowed = true,
  menuItems,
  settings,
  qrisImagePath,
  qrisImageReady,
  makeKey,
  onCompleted,
  renderComplete,
  theme,
}: {
  /** Tema kasir aktif (POS V6) — dialog ikut tema. */
  theme?: string;
  shiftOpen: boolean;
  /** false = mode Owner tanpa shift: Tunai tidak ditawarkan (uang harus masuk laci, K4). */
  cashAllowed?: boolean;
  menuItems: MenuItem[];
  settings: AppSettings;
  qrisImagePath: string;
  qrisImageReady: boolean;
  makeKey: () => string;
  onCompleted: (result: OrderCreateResponse) => Promise<void> | void;
  renderComplete: (receipt: OrderReceipt, startNew: () => void, close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [tender, setTender] = useState<Tender>(cashAllowed ? "Cash" : "QRIS");
  const [cash, setCash] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  // Kunci idempoten dipakai ulang selama isi order sama (retry setelah koneksi putus).
  const [attempt, setAttempt] = useState<IdempotencyAttempt | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  // Hitungan ketukan per perangkat (sama dengan strip Favorit POS).
  const [favoriteCounts, setFavoriteCounts] = useState<Record<string, number>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const paySectionRef = useRef<HTMLElement>(null);
  const [focusTick, setFocusTick] = useState(0);

  useEffect(() => {
    if (focusTick === 0) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [focusTick]);

  useEffect(() => {
    if (!open) return;
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(QUICK_RETAIL_FAVORITE_STORAGE_KEY) ?? "null");
      const counts = parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
      // eslint-disable-next-line react-hooks/set-state-in-effect -- baca localStorage saat dialog dibuka
      setFavoriteCounts(counts);
      // Tab dipilih sekali saat dialog dibuka; menambah favorit tidak memindahkan tab.
      setTab(Object.values(counts).some((count) => count > 0) ? QUICK_RETAIL_FAVORITE_TAB : QUICK_RETAIL_ALL_TAB);
    } catch {
      // Storage diblokir / rusak → tanpa tab Favorit.
    }
  }, [open]);

  const retailItems = useMemo(
    () => menuItems.filter((item) => item.status !== "archived" && isQuickRetailProduct(item)),
    [menuItems],
  );
  const itemsById = useMemo(() => new Map(retailItems.map((item) => [item.id, item])), [retailItems]);
  const match = useMemo(() => matchQuickRetail(retailItems, query), [retailItems, query]);
  const tabs = useMemo(() => quickRetailTabs(retailItems, favoriteCounts), [retailItems, favoriteCounts]);
  // Default: Favorit bila ada, selain itu Semua. Saat mengetik/scan, hasil cari mengabaikan tab.
  const activeTab = tab && tabs.includes(tab) ? tab : QUICK_RETAIL_ALL_TAB;
  const visibleItems = query.trim() ? match.results : quickRetailItemsForTab(retailItems, activeTab, favoriteCounts);

  const cartLines = lines
    .map((line) => {
      const item = itemsById.get(line.itemId);
      const variant = item?.variants.find((entry) => entry.id === line.variantId);
      if (!item || !variant) return null;
      const price = unitPriceOf(item, variant.price);
      return { ...line, item, variant, price, total: price * line.qty };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
  const subtotal = cartLines.reduce((sum, line) => sum + line.total, 0);
  const { service, tax, grossTotal: total } = calculateBillingTotals(subtotal, settings);
  const cashValue = Number(cash || 0);
  const cashShort = tender === "Cash" && (cash === "" || cashValue < total);
  const referenceMissing = tender === "QRIS" && settings.qrisReferenceRequired && !normalizePaymentReference(reference);
  const canPay = shiftOpen && cartLines.length > 0 && total > 0 && !busy && !cashShort && !referenceMissing &&
    (tender === "Cash" ? cashAllowed : qrisImageReady);

  function resetSale() {
    setLines([]);
    setQuery("");
    setCash("");
    setReference("");
    setTender(cashAllowed ? "Cash" : "QRIS");
    setError(null);
    setNotice(null);
    setReceipt(null);
    setAttempt(null);
    // "Jual lagi": kasir langsung bisa scan produk berikutnya.
    setFocusTick((tick) => tick + 1);
  }

  function addLine(item: MenuItem, variantId: string) {
    const variant = item.variants.find((entry) => entry.id === variantId);
    if (!variant) return;
    if (item.stock === "sold_out") {
      setNotice(`${item.name} sedang habis.`);
      return;
    }
    setNotice(null);
    setError(null);
    setFavoriteCounts((current) => {
      const next = { ...current, [item.id]: (current[item.id] ?? 0) + 1 };
      try {
        window.localStorage.setItem(QUICK_RETAIL_FAVORITE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Tanpa storage, Favorit tetap jalan untuk sesi ini.
      }
      return next;
    });
    setLines((current) => {
      const existing = current.find((line) => line.itemId === item.id && line.variantId === variantId);
      if (existing) {
        return current.map((line) => (line === existing ? { ...line, qty: Math.min(99, line.qty + 1) } : line));
      }
      return [...current, { itemId: item.id, variantId, qty: 1 }];
    });
  }

  function changeQty(target: Line, delta: number) {
    setLines((current) =>
      current
        .map((line) => (line === target ? { ...line, qty: Math.min(99, line.qty + delta) } : line))
        .filter((line) => line.qty > 0),
    );
  }

  // Scanner barcode mengetik kode lalu Enter: kode persis langsung masuk keranjang.
  function submitSearch() {
    if (match.exact) {
      addLine(match.exact.item, match.exact.variantId);
      setQuery("");
      return;
    }
    const only = match.results.length === 1 ? match.results[0] : null;
    if (only && only.variants.length === 1) {
      addLine(only, only.variants[0].id);
      setQuery("");
      return;
    }
    if (query.trim() && match.results.length === 0) setNotice(`Kode/nama "${query.trim()}" tidak ada di produk retail aktif.`);
  }

  async function pay() {
    if (!canPay) return;
    setBusy(true);
    setError(null);
    const body = {
      orderType: "takeaway" as const,
      saleChannel: "quick_retail" as const,
      paymentMethod: tender,
      paymentReference: tender === "QRIS" ? normalizePaymentReference(reference) ?? undefined : undefined,
      cashReceived: tender === "Cash" ? cashValue : undefined,
      items: cartLines.map((line) => ({ itemId: line.itemId, variantId: line.variantId, qty: line.qty })),
    };
    const current = idempotencyAttemptFor(attempt, body, makeKey);
    setAttempt(current);
    try {
      const result = await garageApi.post<OrderCreateResponse>("/api/orders", body, {
        headers: { "X-Idempotency-Key": current.key },
      });
      setAttempt(null);
      setReceipt(result.receipt);
      setLines([]);
      await onCompleted(result);
    } catch (caught) {
      setAttempt(markAttemptAfterError(current, caught));
      setError(
        isUncertainSubmitError(caught)
          ? UNCERTAIN_SUBMIT_MESSAGE
          : caught instanceof Error ? caught.message : "Pembayaran gagal. Status order dicek dari server — coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={!shiftOpen}
        onClick={() => setOpen(true)}
        className="pos-v6-qr-open garage-press h-9 gap-1.5 border-[#f5a742]/55 bg-[#f5a742]/10 px-3 text-xs font-bold text-[#ffd79a] hover:bg-[#f5a742]/20"
        data-testid="quick-retail-open"
      >
        <ShoppingBag className="size-4" />
        Penjualan Langsung
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next && receipt) resetSale();
        }}
      >
        <DialogContent
          data-cashier-theme-scope={theme}
          className="pos-v6-qr garage-scroll max-h-[94svh] overflow-y-auto border-[#34343c] bg-[#111116] max-w-[calc(100%-1.5rem)] sm:max-w-5xl"
        >
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="size-5 text-[#f5a742]" />
              Penjualan Langsung
            </DialogTitle>
            <DialogDescription>
              Produk kemasan tanpa meja & tanpa take away. Bayar sekarang — struk & stok tercatat setelah lunas.
            </DialogDescription>
          </DialogHeader>

          {receipt ? (
            renderComplete(receipt, resetSale, () => {
              setOpen(false);
              resetSale();
            })
          ) : (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <section className="min-w-0 space-y-2" aria-label="Produk retail">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitSearch();
                  }}
                  className="pos-v6-qr-search flex items-center gap-2 rounded-xl border px-3"
                >
                  <ScanLine className="size-4 shrink-0 text-[#f5a742]" />
                  <Input
                    ref={searchRef}
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Scan barcode / ketik SKU atau nama"
                    aria-label="Scan barcode atau cari produk"
                    autoComplete="off"
                    className="h-11 border-0 bg-transparent px-0 text-base focus-visible:ring-0"
                  />
                </form>
                {notice ? <p className="text-sm font-semibold text-[#ffd08a]">{notice}</p> : null}
                {retailItems.length === 0 ? (
                  <p className="rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-sm text-[#d0d0d6]">
                    Belum ada produk retail aktif. Owner/Manajer menambah produk bertipe Retail di modul Produk.
                  </p>
                ) : (
                  <>
                    {!query.trim() ? (
                      <div className="garage-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Kategori produk">
                        {tabs.map((name) => (
                          <button
                            key={name}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === name}
                            onClick={() => setTab(name)}
                            data-active={activeTab === name}
                            className="pos-v6-qr-tab garage-press flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold"
                          >
                            {name === QUICK_RETAIL_FAVORITE_TAB ? <Star className="size-3.5 text-[#f5a742]" /> : null}
                            {name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <ul className="garage-scroll grid max-h-[52svh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:max-h-[58svh]">
                      {visibleItems.map((item) => {
                        const soldOut = item.stock === "sold_out";
                        const single = item.variants.length === 1 ? item.variants[0] : null;
                        return (
                          <li
                            key={item.id}
                            data-sold-out={soldOut}
                            className="pos-v6-qr-card flex min-w-0 flex-col overflow-hidden rounded-xl border"
                          >
                            <button
                              type="button"
                              disabled={soldOut || !single}
                              onClick={() => single && addLine(item, single.id)}
                              aria-label={single ? `Tambah ${item.name}` : item.name}
                              className="pos-v6-qr-photo garage-press relative block aspect-[4/3] w-full disabled:cursor-default"
                            >
                              {item.imageUrl ? (
                                // Sama dengan kartu produk POS: <img> biasa (foto upload/eksternal, lazy).
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-1.5" />
                              ) : (
                                <span className="flex h-full items-center justify-center text-[#6b6b75]">
                                  <Package className="size-9" />
                                </span>
                              )}
                              {item.stock !== "ready" ? (
                                <span
                                  className={`absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold ${
                                    soldOut ? "bg-[#d11a2a] text-white" : "bg-[#f5a742] text-black"
                                  }`}
                                >
                                  {soldOut ? "Habis" : "Terbatas"}
                                </span>
                              ) : null}
                            </button>
                            <div className="flex flex-1 flex-col gap-1.5 p-2">
                              <p className="pos-v6-qr-name line-clamp-2 break-words text-sm font-bold leading-tight">{item.name}</p>
                              {single ? (
                                <button
                                  type="button"
                                  disabled={soldOut}
                                  onClick={() => addLine(item, single.id)}
                                  className="pos-v6-qr-add garage-press mt-auto flex min-h-11 items-center justify-between gap-1 rounded-lg pl-2.5 disabled:opacity-40"
                                >
                                  <span className="pos-v6-qr-price font-mono text-base font-extrabold tabular-nums">
                                    {currency.format(unitPriceOf(item, single.price))}
                                  </span>
                                  <span className="pos-v6-qr-plus grid size-11 shrink-0 place-items-center rounded-lg">
                                    <Plus className="size-5" strokeWidth={2.75} />
                                  </span>
                                </button>
                              ) : (
                                <div className="mt-auto flex flex-col gap-1">
                                  {item.variants.map((variant) => (
                                    <button
                                      key={variant.id}
                                      type="button"
                                      disabled={soldOut}
                                      onClick={() => addLine(item, variant.id)}
                                      className="pos-v6-qr-variant garage-press flex min-h-11 items-center justify-between gap-1 rounded-lg border px-2.5 text-sm disabled:opacity-40"
                                    >
                                      <span className="min-w-0 truncate font-semibold">{variant.label}</span>
                                      <span className="pos-v6-qr-price shrink-0 font-mono font-bold tabular-nums">
                                        {currency.format(unitPriceOf(item, variant.price))}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                      {visibleItems.length === 0 ? (
                        <li className="col-span-full p-2 text-sm text-[#d0d0d6]">Tidak ada produk yang cocok.</li>
                      ) : null}
                    </ul>
                  </>
                )}
              </section>

              <section ref={paySectionRef} className="min-w-0 scroll-mt-4 space-y-3" aria-label="Keranjang & pembayaran">
                <div className="pos-v6-qr-cart rounded-xl border p-3">
                  <p className="pos-v6-qr-carthead mb-2 flex items-center gap-2 text-sm font-bold">
                    <ShoppingBag className="size-4" aria-hidden /> Pesanan ({cartLines.reduce((sum, line) => sum + line.qty, 0)})
                  </p>
                  {cartLines.length === 0 ? (
                    <p className="text-sm text-[#d0d0d6]">Keranjang kosong. Scan atau pilih produk.</p>
                  ) : (
                    <ul className="garage-scroll max-h-48 space-y-2 overflow-y-auto pr-1">
                      {cartLines.map((line) => (
                        <li key={`${line.itemId}:${line.variantId}`} className="pos-v6-qr-line flex items-center gap-2 rounded-lg p-1.5">
                          <span className="pos-v6-line-thumb size-11" aria-hidden>
                            {line.item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- foto produk dari storage
                              <img src={line.item.imageUrl} alt="" loading="lazy" />
                            ) : (
                              <Package className="size-5" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="pos-v6-qr-name break-words text-sm font-semibold">
                              {line.item.name}
                              {line.variant.label !== "Regular" ? ` · ${line.variant.label}` : ""}
                            </p>
                            <p className="pos-v6-qr-price font-mono text-sm font-bold tabular-nums">{currency.format(line.total)}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label={line.qty === 1 ? `Hapus ${line.item.name}` : `Kurangi ${line.item.name}`}
                              onClick={() => changeQty(line, -1)}
                              className="pos-v6-qr-step garage-press flex size-11 items-center justify-center rounded-lg border"
                            >
                              {line.qty === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                            </button>
                            <span className="pos-v6-qr-name w-7 text-center font-mono text-base font-bold">{line.qty}</span>
                            <button
                              type="button"
                              aria-label={`Tambah ${line.item.name}`}
                              onClick={() => changeQty(line, 1)}
                              className="pos-v6-qr-step garage-press flex size-11 items-center justify-center rounded-lg border"
                            >
                              <Plus className="size-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <dl className="pos-v6-qr-sum mt-3 space-y-1 border-t pt-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt>Subtotal</dt>
                      <dd className="garage-mono">{currency.format(subtotal)}</dd>
                    </div>
                    {service > 0 ? (
                      <div className="flex justify-between gap-2">
                        <dt>Service</dt>
                        <dd className="garage-mono">{currency.format(service)}</dd>
                      </div>
                    ) : null}
                    {tax > 0 ? (
                      <div className="flex justify-between gap-2">
                        <dt>Pajak</dt>
                        <dd className="garage-mono">{currency.format(tax)}</dd>
                      </div>
                    ) : null}
                    <div className="pos-v6-qr-total flex items-center justify-between gap-2 rounded-xl px-3 py-2.5">
                      <dt className="font-bold">Total Tagihan</dt>
                      <dd className="font-mono text-2xl font-extrabold tabular-nums">{currency.format(total)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Metode bayar">
                  {(["Cash", "QRIS"] as Tender[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      role="radio"
                      aria-checked={tender === method}
                      disabled={busy || (method === "QRIS" && !qrisImageReady) || (method === "Cash" && !cashAllowed)}
                      title={method === "Cash" && !cashAllowed ? "Tunai butuh shift yang sedang buka" : undefined}
                      onClick={() => {
                        // Ganti metode sebelum bayar tidak mencatat apa pun (tender guard §09.2).
                        setTender(method);
                        setError(null);
                      }}
                      data-active={tender === method}
                      className="pos-v6-method garage-press disabled:opacity-40"
                    >
                      {method === "Cash" ? <Banknote className="size-4" /> : <QrCode className="size-4" />}
                      {method === "Cash" ? "Tunai" : "QRIS"}
                    </button>
                  ))}
                </div>

                {tender === "Cash" ? (
                  <div className="pos-v6-cash space-y-1.5 rounded-xl p-3">
                    <p className="pos-v6-cash-label text-[13px] font-bold">Uang Diterima</p>
                    <Input
                      inputMode="numeric"
                      value={cash ? Number(cash).toLocaleString("id-ID") : ""}
                      onChange={(event) => setCash(event.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                      placeholder="Uang diterima (wajib)"
                      aria-label="Uang diterima"
                      className="pos-v6-cash-input h-12 text-right font-mono text-xl font-bold tabular-nums"
                    />
                    <div className="grid grid-cols-3 gap-1.5">
                      {/* Uang pas selalu tombol pertama, lalu nominal cepat di atas total. */}
                      {[total, ...quickCashOptions(total, 6).filter((amount) => amount !== total)].slice(0, 6).map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setCash(String(amount))}
                          data-selected={cashValue === amount}
                          className="pos-v6-quickcash garage-press h-11 rounded-lg border text-sm font-bold tabular-nums"
                        >
                          {amount === total ? "Uang pas" : currency.format(amount)}
                        </button>
                      ))}
                    </div>
                    {cash !== "" ? (
                      <div className="pos-v6-change flex items-center justify-between gap-3 rounded-xl border p-3" data-state={cashValue >= total ? "ok" : "short"} role="status" aria-live="polite">
                        <span className="pos-v6-change-label text-[13px] font-extrabold uppercase tracking-wide">
                          {cashValue >= total ? "Kembalian" : "Uang kurang"}
                        </span>
                        <span className="pos-v6-change-value font-mono text-2xl font-extrabold tabular-nums">
                          {currency.format(Math.abs(cashValue - total))}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="pos-v6-paypanel space-y-2 rounded-xl p-3">
                    {qrisImageReady ? (
                      <div className="mx-auto w-fit rounded-md bg-white p-2">
                        <Image src={qrisImagePath} alt="QRIS resmi Garage" width={150} height={150} className="size-[150px] object-contain" />
                      </div>
                    ) : null}
                    <p className="pos-v6-warn flex gap-2 text-sm font-semibold">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      Pastikan status BERHASIL di notifikasi merchant/bank. Screenshot pelanggan saja tidak cukup.
                    </p>
                    <Input
                      value={reference}
                      onChange={(event) => setReference(event.target.value.slice(0, 80))}
                      placeholder={settings.qrisReferenceRequired ? "No. Ref / RRN QRIS (wajib)" : "No. Ref / RRN QRIS (opsional)"}
                      aria-label="Referensi QRIS"
                      className="pos-v6-cash-input h-11"
                    />
                  </div>
                )}

                {error ? (
                  <p role="alert" className="rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/14 p-2 text-sm font-semibold text-[#ffe1e5]">
                    {error}
                  </p>
                ) : null}

                <Button
                  type="button"
                  onClick={() => void pay()}
                  disabled={!canPay}
                  className="pos-v6-qr-pay garage-press h-13 min-h-[52px] w-full rounded-xl text-base font-bold"
                  data-testid="quick-retail-pay"
                >
                  {busy
                    ? "Memproses…"
                    : tender === "Cash"
                      ? cashShort
                        ? "Isi uang diterima"
                        : cashConfirmLabel(cashValue, total)
                      : referenceMissing
                        ? "Isi referensi QRIS"
                        : `QRIS berhasil · ${currency.format(total)}`}
                </Button>
              </section>

              {/* HP/tablet kecil: total & tombol ke pembayaran selalu terlihat saat memilih produk. */}
              {cartLines.length > 0 ? (
                <div className="pos-v6-qr-sticky sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center gap-3 border-t px-4 py-3 md:hidden">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#d0d0d6]">
                      {cartLines.reduce((sum, line) => sum + line.qty, 0)} item
                    </p>
                    <p className="pos-v6-qr-price font-mono text-xl font-black tabular-nums">{currency.format(total)}</p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => paySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="pos-v6-qr-pay garage-press h-12 rounded-xl px-5 text-base font-bold"
                  >
                    Bayar
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
