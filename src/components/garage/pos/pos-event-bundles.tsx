"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Package, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EventBundlePicker } from "@/components/garage/events/event-bundle-picker";
import { EventBundleVisual } from "@/components/garage/events/event-bundle-visual";
import { garageApi } from "@/lib/api-client";
import { bundleUnavailableReason, type EventMenuSelection } from "@/lib/event-menu-display";
import type { EventMenuContext, EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";
import { MAX_TABLE_NUMBER, parseTableNumber, tableLabelFor } from "@/lib/garage-tables";
import { idempotencyAttemptFor, type IdempotencyAttempt } from "@/lib/idempotency-client";

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

type PosEventMenu = { event: EventMenuContext; entries: EventMenuEntry[]; products: EventMenuProduct[] };

type BundleLine = {
  key: string;
  entry: EventMenuEntry;
  selections: EventMenuSelection[];
  label: string;
  qty: number;
};

/** Komponen paket untuk tiket Bar/Dapur (rokok/minuman botol disaring pemanggil). */
export type PosBundleChitLine = { itemId: string; variantId: string; name: string; variant: string; qty: number };

export type PosBundleSaved = { orderId: string; orderNo: string; total: number; tableLabel: string | null; customerName: string | null; chitLines: PosBundleChitLine[] };

type RegularCartItem = { itemId: string; variantId: string; qty: number; note?: string };

/**
 * Paket Event di POS (owner, Okt 2026): kasir memilih isi paket (rokok + minuman Hot/Cold + cemilan),
 * lalu tagihan disimpan lewat jalur Bayar nanti (`/api/orders/open-bill` + eventItems) dan langsung
 * dilanjutkan ke Final Bayar. Harga, kuota, dan pemecahan komponen dihitung ulang di server.
 */
export function PosEventBundles({ shiftOpen, regularCart, regularCartTotal, makeKey, onSaved }: {
  shiftOpen: boolean;
  regularCart: RegularCartItem[];
  regularCartTotal: number;
  makeKey: () => string;
  onSaved: (saved: PosBundleSaved, includedRegularCart: boolean) => Promise<void> | void;
}) {
  const [menu, setMenu] = useState<PosEventMenu | null>(null);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<EventMenuEntry | null>(null);
  const [lines, setLines] = useState<BundleLine[]>([]);
  const [orderType, setOrderType] = useState<"takeaway" | "dine-in">("takeaway");
  const [customerName, setCustomerName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [includeCart, setIncludeCart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loadFailed, setLoadFailed] = useState(false);
  const attemptRef = useRef<IdempotencyAttempt | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await garageApi.get<PosEventMenu | null>("/api/pos/event-menu", { cache: "no-store" });
      setMenu(data && data.entries.length ? data : null);
      setNow(Date.now());
      setLoadFailed(false);
    } catch {
      // Paket event opsional: POS reguler tetap jalan, tapi kasir diberi tahu & bisa coba lagi.
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  if (!menu) {
    return loadFailed ? (
      <Button type="button" variant="outline" className="garage-press h-11 shrink-0 gap-2 border-[#f5a742]/60 bg-[#f5a742]/10 px-3 text-sm font-bold text-[#ffd08a]" onClick={() => void load()}>
        <RefreshCw aria-hidden className="size-4" /> Paket event gagal dimuat · Coba lagi
      </Button>
    ) : null;
  }
  const products = menu.products;
  const productOf = (itemId: string) => products.find((product) => product.id === itemId);
  const bundleTotal = lines.reduce((sum, line) => sum + line.entry.price * line.qty, 0);
  const withCart = includeCart && regularCart.length > 0;
  const parsedTable = parseTableNumber(tableNumber);
  const ready = lines.length > 0 && shiftOpen && !busy && (orderType === "takeaway" ? customerName.trim().length > 0 : Boolean(parsedTable));
  // Alasan tombol simpan belum aktif — ditampilkan, bukan diam-diam.
  const blocker = !lines.length ? "Pilih minimal satu paket."
    : !shiftOpen ? "Buka shift kasir dulu."
    : orderType === "takeaway" && !customerName.trim() ? "Isi nama pelanggan untuk take away."
    : orderType === "dine-in" && !parsedTable ? `Isi nomor meja 1–${MAX_TABLE_NUMBER}.`
    : null;

  function addLine(entry: EventMenuEntry, selections: EventMenuSelection[], label: string) {
    const key = `${entry.id}:${JSON.stringify(selections)}`;
    setLines((current) => current.some((line) => line.key === key)
      ? current.map((line) => line.key === key ? { ...line, qty: Math.min(25, line.qty + 1) } : line)
      : [...current, { key, entry, selections, label, qty: 1 }]);
    setPicking(null);
  }

  function changeQty(key: string, delta: number) {
    setLines((current) => current.flatMap((line) => {
      if (line.key !== key) return [line];
      const qty = line.qty + delta;
      return qty <= 0 ? [] : [{ ...line, qty: Math.min(25, qty) }];
    }));
  }

  function reset() {
    setLines([]);
    setCustomerName("");
    setTableNumber("");
    setError(null);
    attemptRef.current = null;
  }

  async function save() {
    if (!menu || !ready) return;
    setBusy(true);
    setError(null);
    const tableLabel = orderType === "dine-in" && parsedTable ? tableLabelFor(parsedTable) : undefined;
    const body = {
      orderType,
      tableLabel,
      customerName: customerName.trim() || undefined,
      eventId: menu.event.id,
      eventItems: lines.map((line) => ({ entryId: line.entry.id, qty: line.qty, selections: line.selections })),
      items: withCart ? regularCart : [],
    };
    const attempt = idempotencyAttemptFor(attemptRef.current, body, makeKey);
    attemptRef.current = attempt;
    try {
      const result = await garageApi.post<{ orderId: string; orderNo: string; total: number; tableLabel: string | null }>(
        "/api/orders/open-bill",
        body,
        { headers: { "X-Idempotency-Key": attempt.key } },
      );
      const chitLines = lines.flatMap((line) => line.selections.map((selection) => {
        const product = productOf(selection.itemId);
        const group = line.entry.groups.find((row) => row.id === selection.groupId);
        return {
          itemId: selection.itemId,
          variantId: selection.variantId,
          name: product?.name ?? selection.itemId,
          variant: product?.variants.find((variant) => variant.id === selection.variantId)?.label ?? selection.variantId,
          qty: line.qty * (group?.quantity ?? 1),
        };
      }));
      const saved = { ...result, customerName: customerName.trim() || null, chitLines };
      reset();
      setOpen(false);
      await onSaved(saved, withCart);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paket gagal disimpan.");
      void load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-testid="pos-event-bundles"
        className="garage-press h-11 shrink-0 gap-2 border-[#f5a742]/60 bg-[#f5a742]/12 px-3 text-sm font-bold text-[#ffd08a] hover:bg-[#f5a742]/20"
        onClick={() => { setNow(Date.now()); setOpen(true); void load(); }}
      >
        <Package aria-hidden className="size-4" />
        Paket Event
        {lines.length ? <span className="rounded-full bg-[#f5a742] px-1.5 text-xs text-black">{lines.reduce((n, line) => n + line.qty, 0)}</span> : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-[#3a3a42] px-5 pb-4 pt-5 text-left">
            <DialogTitle className="flex items-center gap-2 pr-8 text-xl">
              <Package aria-hidden className="size-5 text-[#f5a742]" />
              Paket Event · {menu.event.title}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#d4d4d8]">
              Tap paket, pilih isinya, lalu Simpan &amp; Final Bayar. Harga paket sudah final (termasuk layanan &amp; pajak). Rokok diserahkan kasir; minuman &amp; cemilan masuk Bar/Dapur.
            </DialogDescription>
          </DialogHeader>
          <div className="garage-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
            <div className="grid content-start gap-2 sm:grid-cols-2">
              {menu.entries.map((entry) => {
                const reason = bundleUnavailableReason(entry, products, now);
                const quotaLeft = entry.quota === null ? null : Math.max(0, entry.quota - entry.usedQuantity);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={Boolean(reason)}
                    onClick={() => setPicking(entry)}
                    className="garage-press flex min-w-0 flex-col overflow-hidden rounded-md border border-[#4a4a54] bg-[#25252d] text-left transition hover:border-[#f5a742]/70 disabled:cursor-not-allowed"
                  >
                    <EventBundleVisual entry={entry} products={products} className="aspect-[16/9] w-full rounded-none border-0 border-b" />
                    <span className="flex flex-1 flex-col justify-between gap-2 p-3">
                      <span className="break-words text-base font-bold leading-5 text-white">{entry.name}</span>
                      <span className="flex flex-wrap items-end justify-between gap-1">
                        <span className="font-mono text-lg font-bold tabular-nums text-[#ffd08a]">{currency.format(entry.price)}</span>
                        <span className={`text-sm font-semibold ${reason ? "rounded bg-[#f5a742]/15 px-1.5 text-[#ffd08a]" : "text-[#d4d4d8]"}`}>
                          {reason ?? (quotaLeft !== null ? `Sisa ${quotaLeft}` : `${entry.groups.length} komponen`)}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid content-start gap-3 rounded-md border border-[#3a3a42] bg-[#18181f] p-3">
              <p className="text-sm font-bold text-white">Paket dipilih</p>
              {lines.length ? lines.map((line) => (
                <div key={line.key} className="rounded-md border border-[#3a3a42] bg-[#25252d] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold text-white">{line.entry.name}</p>
                    <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-white">{currency.format(line.entry.price * line.qty)}</p>
                  </div>
                  <ul className="mt-1.5 grid gap-0.5 text-sm leading-6 text-[#e4e4e7]">
                    {line.label.split(" · ").map((part, index) => <li key={`${part}-${index}`} className="break-words">• {part}</li>)}
                  </ul>
                  <div className="mt-2 flex items-center justify-end gap-1">
                    <Button type="button" size="icon" variant="outline" className="size-11" aria-label={`Kurangi ${line.entry.name}`} onClick={() => changeQty(line.key, -1)}>
                      {line.qty === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                    </Button>
                    <span className="min-w-10 text-center font-mono text-base font-bold text-white">{line.qty}</span>
                    <Button type="button" size="icon" variant="outline" className="size-11" aria-label={`Tambah ${line.entry.name}`} onClick={() => changeQty(line.key, 1)}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>
              )) : <p className="text-sm text-[#c8c8cc]">Belum ada paket.</p>}
              <div className="grid grid-cols-2 gap-2">
                {(["takeaway", "dine-in"] as const).map((type) => (
                  <Button key={type} type="button" variant={orderType === type ? "default" : "outline"} className="h-11 text-base" onClick={() => setOrderType(type)}>
                    {type === "takeaway" ? "Take away" : "Dine-in"}
                  </Button>
                ))}
              </div>
              {orderType === "dine-in" ? (
                <Input aria-label="Nomor meja" aria-invalid={Boolean(tableNumber) && !parsedTable} className="h-12 text-base" inputMode="numeric" placeholder={`Nomor meja (1–${MAX_TABLE_NUMBER})`} value={tableNumber} onChange={(event) => setTableNumber(event.target.value)} />
              ) : null}
              <Input aria-label="Nama pelanggan" className="h-12 text-base" placeholder={orderType === "takeaway" ? "Nama pelanggan (wajib)" : "Nama pelanggan (opsional)"} value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={60} />
              {regularCart.length ? (
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[#e5e2dc]">
                  <input type="checkbox" className="size-4" checked={includeCart} onChange={(event) => setIncludeCart(event.target.checked)} />
                  Sertakan isi keranjang ({regularCart.reduce((n, item) => n + item.qty, 0)} item · {currency.format(regularCartTotal)})
                </label>
              ) : null}
              <div className="flex items-baseline justify-between gap-2 border-t border-[#3a3a42] pt-2">
                <span className="text-sm text-[#d4d4d8]">Subtotal</span>
                <span className="font-mono text-xl font-bold tabular-nums text-white">{currency.format(bundleTotal + (withCart ? regularCartTotal : 0))}</span>
              </div>
              <p className="text-sm leading-5 text-[#d4d4d8]">Paket: harga final. {withCart ? "Menu reguler: + service/PB1 sesuai pengaturan. " : ""}Total pasti tampil di Final Bayar.</p>
              {blocker && !busy ? <p role="status" className="text-sm font-semibold text-[#ffd08a]">{blocker}</p> : null}
              {error ? <p role="alert" className="rounded-md border border-[#d11a2a]/50 bg-[#d11a2a]/12 p-2 text-sm text-[#ffd6d6]">{error}</p> : null}
              <Button type="button" className="h-12 text-base font-semibold" disabled={!ready} onClick={() => void save()}>
                {busy ? "Menyimpan…" : "Simpan & Final Bayar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {picking ? (
        <EventBundlePicker key={picking.id} entry={picking} products={products} now={now} onClose={() => setPicking(null)} onConfirm={(selections, label) => addLine(picking, selections, label)} />
      ) : null}
    </>
  );
}
