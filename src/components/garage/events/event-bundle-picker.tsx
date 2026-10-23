"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EventBundleVisual } from "@/components/garage/events/event-bundle-visual";
import type { EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";
import { bundleSelectionLabel, type EventMenuSelection } from "@/lib/event-menu-display";
import { rupiah } from "@/components/garage/order/order-ui";

type Option = { itemId: string; variantId: string; name: string; variant: string };

const keyOf = (option: { itemId: string; variantId: string }) => `${option.itemId}::${option.variantId}`;
const showVariant = (label: string) => label.toLowerCase() !== "regular";

/** Kelompokkan opsi per produk supaya Hot/Cold tampil berdampingan dalam satu kartu. */
function byProduct(options: Option[]) {
  const map = new Map<string, Option[]>();
  for (const option of options) map.set(option.itemId, [...(map.get(option.itemId) ?? []), option]);
  return [...map.values()];
}

export function EventBundlePicker({ entry, products, now, onClose, onConfirm }: {
  entry: EventMenuEntry;
  products: EventMenuProduct[];
  now: number;
  onClose: () => void;
  onConfirm: (selections: EventMenuSelection[], label: string) => void;
}) {
  const availableGroups = entry.groups.map((group) => ({
    ...group,
    available: group.options.flatMap((option): Option[] => {
      const product = products.find((p) => p.id === option.itemId);
      const variant = product?.variants.find((v) => v.id === option.variantId);
      return product && variant && product.stock !== "sold_out" ? [{ ...option, name: product.name, variant: variant.label }] : [];
    }),
  }));
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(availableGroups.filter(group => group.available.length === 1).map(group => [group.id, keyOf(group.available[0])])));
  const scheduled = now >= Date.parse(entry.startsAt) && now < Date.parse(entry.endsAt);
  const complete = scheduled && availableGroups.length > 0 && availableGroups.every((group) => group.available.some((option) => keyOf(option) === choices[group.id]));
  const choose = (groupId: string, option: Option) => setChoices((current) => ({ ...current, [groupId]: keyOf(option) }));

  return <Dialog open onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
    <DialogHeader className="flex-row items-center gap-4 border-b border-garage-line bg-garage-bg-2 px-5 pb-4 pt-5 text-left">
      <EventBundleVisual entry={entry} products={products} className="hidden size-20 shrink-0 sm:block" />
      <div className="min-w-0">
        <DialogTitle className="pr-7 text-xl leading-7">{entry.name}</DialogTitle>
        <DialogDescription className="leading-6">Pilih isi paketmu. Harga final <strong className="font-mono text-base font-bold tabular-nums text-garage-fg">{rupiah.format(entry.price)}</strong> per paket, sudah termasuk layanan &amp; pajak.</DialogDescription>
      </div>
    </DialogHeader>
    <form className="flex min-h-0 flex-col" onSubmit={(event) => {
      event.preventDefault(); if (!complete) return;
      const selections = availableGroups.map((group) => {
        const option = group.available.find((row) => keyOf(row) === choices[group.id])!;
        return { groupId: group.id, itemId: option.itemId, variantId: option.variantId };
      });
      onConfirm(selections, bundleSelectionLabel(entry, selections, products));
    }}>
      <div className="garage-scroll grid min-h-0 gap-6 overflow-y-auto overscroll-contain px-5 py-5">
        {availableGroups.map((group, index) => <fieldset key={group.id} className="grid min-w-0 gap-3">
          <legend className="mb-3 flex w-full items-center gap-2 text-base font-bold text-garage-fg">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-garage-bg-3 font-mono text-sm text-garage-dim">{index + 1}</span>
            {group.name}
            {group.quantity > 1 ? <span className="ml-auto text-sm font-medium text-garage-dim">Jumlah {group.quantity}</span> : null}
          </legend>
          {group.available.length === 1 ? (
            <div className="flex items-center gap-3 rounded-md border border-garage-line-2 bg-garage-bg-2 p-3">
              <Check className="size-5 shrink-0 text-garage-amber" aria-hidden />
              <div className="min-w-0">
                <p className="break-words text-base font-semibold text-garage-fg">{group.available[0].name}</p>
                <p className="mt-0.5 text-sm text-garage-dim">{showVariant(group.available[0].variant) ? `${group.available[0].variant} · ` : ""}Sudah termasuk</p>
              </div>
            </div>
          ) : group.available.length ? (
            <div role="radiogroup" aria-label={group.name} className="grid gap-2 sm:grid-cols-2">
              {byProduct(group.available).map((variants) => {
                const productSelected = variants.some((option) => keyOf(option) === choices[group.id]);
                return <div key={variants[0].itemId} className={`rounded-md border p-2.5 transition-colors ${productSelected ? "border-garage-amber bg-garage-amber/10" : "border-garage-line-2 bg-garage-bg-2"}`}>
                  {variants.length === 1 ? (
                    <button type="button" role="radio" aria-checked={productSelected} onClick={() => choose(group.id, variants[0])} className="garage-press flex min-h-12 w-full items-center justify-between gap-2 rounded-md px-2 text-left focus-visible:outline-2 focus-visible:outline-garage-amber">
                      <span className="min-w-0 break-words text-base font-semibold text-garage-fg">{variants[0].name}{showVariant(variants[0].variant) ? <span className="font-normal text-garage-dim"> · {variants[0].variant}</span> : null}</span>
                      {productSelected ? <Check className="size-5 shrink-0 text-garage-amber" aria-hidden /> : null}
                    </button>
                  ) : <>
                    <p className="break-words px-1 pb-2 text-base font-semibold text-garage-fg">{variants[0].name}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {variants.map((option) => {
                        const selected = keyOf(option) === choices[group.id];
                        return <button key={option.variantId} type="button" role="radio" aria-checked={selected} aria-label={`${option.name} ${option.variant}`} onClick={() => choose(group.id, option)} className={`garage-press min-h-12 rounded-md border px-2 text-base font-bold transition-colors focus-visible:outline-2 focus-visible:outline-garage-amber ${selected ? "border-garage-amber bg-garage-amber/20 text-garage-amber" : "border-garage-line-2 bg-garage-bg-3 text-garage-fg hover:border-garage-amber/60"}`}>{option.variant}</button>;
                      })}
                    </div>
                  </>}
                </div>;
              })}
            </div>
          ) : <p role="alert" className="text-sm text-garage-red-bright">Komponen sedang tidak tersedia.</p>}
        </fieldset>)}
        {!scheduled && <p role="alert" className="text-sm text-garage-red-bright">Jadwal paket sudah berakhir. Muat ulang menu untuk pilihan terbaru.</p>}
      </div>
      <div className="flex shrink-0 gap-3 border-t border-garage-line bg-garage-bg-2 px-5 py-4"><Button type="button" variant="outline" className="min-h-12 px-4 text-base" onClick={onClose}>Batal</Button><Button type="submit" className="min-h-12 flex-1 text-base" disabled={!complete}>{complete ? "Tambah paket" : "Lengkapi pilihan"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
