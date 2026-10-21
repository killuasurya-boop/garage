"use client";

import { useState } from "react";
import { Check, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";
import type { EventMenuSelection } from "@/lib/event-menu-display";
import { rupiah } from "@/components/garage/order/order-ui";

export function EventBundlePicker({ entry, products, now, onClose, onConfirm }: {
  entry: EventMenuEntry;
  products: EventMenuProduct[];
  now: number;
  onClose: () => void;
  onConfirm: (selections: EventMenuSelection[], label: string) => void;
}) {
  const availableGroups = entry.groups.map((group) => ({
    ...group,
    available: group.options.flatMap((option) => {
      const product = products.find((p) => p.id === option.itemId);
      const variant = product?.variants.find((v) => v.id === option.variantId);
      return product && variant && product.stock !== "sold_out" ? [{ ...option, label: product.name, variant: variant.label }] : [];
    }),
  }));
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(availableGroups.filter(group => group.available.length === 1).map(group => [group.id, `${group.available[0].itemId}::${group.available[0].variantId}`])));
  const scheduled = now >= Date.parse(entry.startsAt) && now < Date.parse(entry.endsAt);
  const complete = scheduled && availableGroups.length > 0 && availableGroups.every((group) => group.available.some((option) => `${option.itemId}::${option.variantId}` === choices[group.id]));

  return <Dialog open onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
    <DialogHeader className="border-b border-garage-line bg-garage-bg-2 px-5 pb-5 pt-6 text-left"><span className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-garage-amber"><Package className="size-4" aria-hidden /> Paket event</span><DialogTitle className="pr-7 text-xl leading-7">{entry.name}</DialogTitle><DialogDescription className="leading-6">Pilih isi paketmu. Harga tetap <strong className="font-mono text-base font-bold tabular-nums text-garage-fg">{rupiah.format(entry.price)}</strong> per paket.</DialogDescription></DialogHeader>
    <form className="flex min-h-0 flex-col" onSubmit={(event) => {
      event.preventDefault(); if (!complete) return;
      const selected = availableGroups.map(group => ({ group, option: group.available.find(option => `${option.itemId}::${option.variantId}` === choices[group.id])! }));
      onConfirm(selected.map(({ group, option }) => ({ groupId: group.id, itemId: option.itemId, variantId: option.variantId })), selected.map(({ group, option }) => `${group.quantity}× ${option.label} · ${option.variant}`).join(" + "));
    }}><div className="grid min-h-0 gap-5 overflow-y-auto overscroll-contain px-5 py-5">{availableGroups.map((group, index) => <fieldset key={group.id} className="grid min-w-0 gap-3"><legend className="mb-3 flex w-full items-center gap-2 text-base font-bold text-garage-fg"><span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-garage-bg-3 font-mono text-sm text-garage-dim">{index + 1}</span>{group.name}<span className="ml-auto text-sm font-medium text-garage-dim">{group.quantity} porsi</span></legend>{group.available.length === 1 ? <div className="flex items-center gap-3 rounded-md border border-garage-line-2 bg-garage-bg-2 p-3"><Check className="size-5 shrink-0 text-garage-amber" aria-hidden /><div className="min-w-0"><p className="break-words text-base font-semibold text-garage-fg">{group.available[0].label}</p><p className="mt-0.5 text-sm text-garage-dim">{group.available[0].variant} · Sudah termasuk</p></div></div> : <><label className="sr-only" htmlFor={`bundle-${group.id}`}>{group.name}</label><select id={`bundle-${group.id}`} required value={choices[group.id] ?? ""} onChange={(event) => setChoices(current => ({ ...current, [group.id]: event.target.value }))} className="min-h-12 w-full min-w-0 rounded-md border border-garage-line-2 bg-garage-bg-2 px-3 text-base text-garage-fg focus:border-garage-amber focus:outline-2 focus:outline-garage-amber"><option value="">Pilih satu opsi</option>{group.available.map(option => <option key={`${option.itemId}:${option.variantId}`} value={`${option.itemId}::${option.variantId}`}>{option.label} · {option.variant}</option>)}</select><p className="text-sm text-garage-dim">Pilih satu opsi untuk {group.quantity} porsi dalam paket.</p></>}{!group.available.length && <p role="alert" className="text-sm text-garage-red-bright">Komponen sedang tidak tersedia.</p>}</fieldset>)}{!scheduled && <p role="alert" className="text-sm text-garage-red-bright">Jadwal paket sudah berakhir. Muat ulang menu untuk pilihan terbaru.</p>}</div>
      <div className="flex shrink-0 gap-3 border-t border-garage-line bg-garage-bg-2 px-5 py-4"><Button type="button" variant="outline" className="min-h-12 px-4 text-base" onClick={onClose}>Batal</Button><Button type="submit" className="min-h-12 flex-1 text-base" disabled={!complete}>Tambah paket</Button></div>
    </form>
  </DialogContent></Dialog>;
}
