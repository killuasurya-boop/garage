"use client";

// Quick View Menu V5 (papan 02): foto 3:4, nama, deskripsi, harga varian terpilih, pilihan varian (Panas/Dingin
// dari data), catatan opsional, stepper & "Tambah ke Daftar". HP = lembar bawah dengan pegangan geser-tutup;
// tablet/desktop = modal tengah 720–840 px. Ukuran S/M/L & level gula di papan baru tampil bila produk punya
// datanya (belum ada di sistem) — tidak ada pilihan palsu.
// Stepper menunjukkan jumlah varian ini di Daftar Pilihan: tombol menyimpan selisihnya (tambah/kurangi/hapus).
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Clock, Flame, Minus, Plus, Snowflake, StickyNote } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MenuItem } from "@/lib/garage-api-types";

import { MenuPhoto } from "../menu-card";
import { cartKey, rupiah, variantPrice } from "../order-ui";
import { notePlaceholder } from "./menu-v5-model";

type Variant = MenuItem["variants"][number] & { eventUnavailable?: string | false | null };

function variantIcon(label: string) {
  if (/hot|panas/i.test(label)) return <Flame className="size-4" aria-hidden />;
  if (/cold|ice|iced|dingin/i.test(label)) return <Snowflake className="size-4" aria-hidden />;
  return null;
}

function unavailable(item: MenuItem, variant: Variant) {
  return item.stock === "sold_out" || Boolean(variant.eventUnavailable);
}

export function QuickViewV5({
  item,
  initialVariantId,
  cart,
  notes,
  onAdjust,
  onNote,
  onClose,
}: {
  item: MenuItem | null;
  initialVariantId?: string | null;
  cart: Record<string, number>;
  notes: Record<string, string>;
  onAdjust: (itemId: string, variantId: string, delta: number) => void;
  onNote: (itemId: string, variantId: string, value: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent
        side="bottom"
        // Jangan fokus otomatis ke kolom catatan: di HP keyboard langsung menutupi foto & harga.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
        }}
        className="gm5 inset-x-0 bottom-0 z-[95] mx-auto flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[20px] border border-[color:var(--gm5-line)] bg-[#0e0e0e] p-0 text-white sm:bottom-auto sm:top-1/2 sm:max-h-[88svh] sm:w-[min(820px,calc(100vw-48px))] sm:-translate-y-1/2 sm:rounded-[20px]"
      >
        {item ? <QuickViewBody key={item.id} item={item} initialVariantId={initialVariantId} cart={cart} notes={notes} onAdjust={onAdjust} onNote={onNote} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function QuickViewBody({
  item,
  initialVariantId,
  cart,
  notes,
  onAdjust,
  onNote,
  onClose,
}: {
  item: MenuItem;
  initialVariantId?: string | null;
  cart: Record<string, number>;
  notes: Record<string, string>;
  onAdjust: (itemId: string, variantId: string, delta: number) => void;
  onNote: (itemId: string, variantId: string, value: string) => void;
  onClose: () => void;
}) {
  const variants = item.variants as Variant[];
  const firstChoice =
    variants.find((variant) => variant.id === initialVariantId) ??
    variants.find((variant) => (cart[cartKey(item.id, variant.id)] ?? 0) > 0) ??
    variants.find((variant) => !unavailable(item, variant)) ??
    variants[0];
  const [variantId, setVariantId] = useState(firstChoice?.id ?? "");
  const variant = variants.find((entry) => entry.id === variantId) ?? firstChoice;
  const inList = variant ? cart[cartKey(item.id, variant.id)] ?? 0 : 0;
  const [qty, setQty] = useState(inList || 1);
  const [note, setNote] = useState(variant ? notes[cartKey(item.id, variant.id)] ?? "" : "");
  const blocked = !variant || unavailable(item, variant);
  const price = variant ? variantPrice(item, variant) : 0;
  const strike = variant && price < variant.price ? variant.price : null;
  const multi = variants.length > 1;

  function pick(next: Variant) {
    setVariantId(next.id);
    const current = cart[cartKey(item.id, next.id)] ?? 0;
    setQty(current || 1);
    setNote(notes[cartKey(item.id, next.id)] ?? "");
  }

  function save() {
    if (!variant) return;
    const delta = qty - inList;
    if (delta !== 0) onAdjust(item.id, variant.id, delta);
    if (qty > 0) onNote(item.id, variant.id, note.trim());
    onClose();
  }

  // Geser pegangan ke bawah untuk menutup (HP).
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { y: event.clientY, dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, event.clientY - drag.current.y);
    setDragY(drag.current.dy);
  };
  const onHandleUp = () => {
    const dy = drag.current?.dy ?? 0;
    drag.current = null;
    setDragY(0);
    if (dy > 90) onClose();
  };

  // Label pendek di HP supaya tidak terpotong; lengkap di layar lebar.
  const [label, short] = qty === 0 ? (inList ? ["Hapus dari Daftar", "Hapus"] : ["Tambah ke Daftar", "Tambah"]) : inList ? ["Simpan Daftar", "Simpan"] : ["Tambah ke Daftar", "Tambah"];

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}>
      <div
        className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-1 pb-1 pt-2.5 sm:hidden"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        aria-hidden
      >
        <span className="h-1.5 w-12 rounded-full bg-white/35" />
        <span className="text-xs text-[#cfc9c4]">Geser ke bawah untuk menutup</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-7">
          <div className="gm5-card-photo relative aspect-[4/3] max-h-[34svh] w-full overflow-hidden rounded-2xl sm:aspect-[3/4] sm:max-h-none">
            <MenuPhoto item={item} iconClassName="size-16" eager />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <SheetHeader className="gap-1.5 p-0 pr-10 text-left">
              <SheetTitle className="gm5-title font-menu-display break-words text-[26px] font-bold leading-tight text-white sm:text-[30px]">{item.name}</SheetTitle>
              {item.description ? <p className="text-base leading-6 text-[#d4d4d4]">{item.description}</p> : null}
              <SheetDescription className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-[26px] font-bold tabular-nums text-white">{rupiah.format(price)}</span>
                {strike ? <span className="font-mono text-sm tabular-nums text-[#a7a09b] line-through">{rupiah.format(strike)}</span> : null}
                {item.prep ? (
                  <span className="inline-flex items-center gap-1 text-sm text-[#cfc9c4]">
                    <Clock className="size-3.5" aria-hidden /> Siap ± {item.prep.replace(/m$/, " menit")}
                  </span>
                ) : null}
              </SheetDescription>
            </SheetHeader>

            {multi ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-[#ede6dc]">Pilih varian</p>
                <div
                  role="radiogroup"
                  aria-label={`Varian ${item.name}`}
                  className={variants.length <= 3 ? "grid gap-1 rounded-full border border-[color:var(--gm5-line)] bg-[#141214] p-1" : "flex flex-wrap gap-2"}
                  style={variants.length <= 3 ? { gridTemplateColumns: `repeat(${variants.length}, minmax(0, 1fr))` } : undefined}
                >
                  {variants.map((entry) => {
                    const off = unavailable(item, entry);
                    const count = cart[cartKey(item.id, entry.id)] ?? 0;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        role="radio"
                        aria-checked={entry.id === variant?.id}
                        disabled={off}
                        onClick={() => pick(entry)}
                        className="gm5-chip !min-h-11 justify-center !px-3 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {variantIcon(entry.label)}
                        <span className="truncate">{entry.label}</span>
                        {count ? <span className="gm5-count !min-w-5 !bg-white !text-[#0e0e0e]">{count}</span> : null}
                        {variants.length > 3 ? <span className="font-mono text-xs tabular-nums opacity-80">{rupiah.format(variantPrice(item, entry))}</span> : null}
                      </button>
                    );
                  })}
                </div>
                {variant?.eventUnavailable ? <p className="mt-2 text-sm font-semibold text-[var(--garage-amber)]">Varian ini sedang tidak tersedia.</p> : null}
              </div>
            ) : null}

            <label className="block">
              <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#ede6dc]">
                <StickyNote className="size-4" aria-hidden /> Catatan <span className="font-normal text-[#a7a09b]">(opsional)</span>
              </span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 160))}
                maxLength={160}
                autoComplete="off"
                name="catatan-menu"
                placeholder={notePlaceholder(item)}
                className="h-12 w-full rounded-full border border-white/15 bg-[#141214] px-4 text-base text-white outline-none placeholder:text-[#8f8984] hover:border-white/25 focus:border-[var(--menu-red)]"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-white/10 bg-[#0e0e0e] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-4">
        <span className="gm5-stepper shrink-0">
          <button type="button" className="gm5-step gm5-step-minus" onClick={() => setQty((value) => Math.max(0, value - 1))} disabled={qty <= 0} aria-label="Kurangi jumlah">
            <Minus className="size-4" strokeWidth={2.6} aria-hidden />
          </button>
          <span className="gm5-step-count" aria-label={`Jumlah ${qty}`}>{qty}</span>
          <button type="button" className="gm5-step gm5-step-plus" onClick={() => setQty((value) => Math.min(99, value + 1))} disabled={blocked} aria-label="Tambah jumlah">
            <Plus className="size-4" strokeWidth={2.6} aria-hidden />
          </button>
        </span>
        <button
          type="button"
          onClick={save}
          disabled={blocked ? qty > 0 || !inList : qty === 0 && !inList}
          className="gm5-btn-red min-h-12 min-w-0 flex-1 justify-between px-5 text-[15px]"
        >
          <span className="min-w-0">
            {blocked && !inList ? "Tidak tersedia" : (
              <>
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </>
            )}
          </span>
          {qty > 0 ? <span className="shrink-0 font-mono tabular-nums">{rupiah.format(price * qty)}</span> : null}
        </button>
      </div>
    </div>
  );
}
