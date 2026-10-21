"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";
import type { EventMenuSelection } from "@/lib/event-menu-display";

export function EventBundlePicker({ entry, products, onClose, onConfirm }: {
  entry: EventMenuEntry;
  products: EventMenuProduct[];
  onClose: () => void;
  onConfirm: (selections: EventMenuSelection[], label: string) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const availableGroups = entry.groups.map((group) => ({
    ...group,
    available: group.options.flatMap((option) => {
      const product = products.find((p) => p.id === option.itemId);
      const variant = product?.variants.find((v) => v.id === option.variantId);
      return product && variant && product.stock !== "sold_out" ? [{ ...option, label: `${product.name} · ${variant.label}` }] : [];
    }),
  }));
  const complete = availableGroups.length > 0 && availableGroups.every((group) => group.available.some((option) => `${option.itemId}::${option.variantId}` === choices[group.id]));

  return <Dialog open onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{entry.name}</DialogTitle><DialogDescription>Pilih komponen paket. Harga paket tetap {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(entry.price)}.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={(e) => {
    e.preventDefault(); if (!complete) return;
    const selected = availableGroups.map((group) => ({ group, option: group.available.find((option) => `${option.itemId}::${option.variantId}` === choices[group.id])! }));
    onConfirm(selected.map(({ group, option }) => ({ groupId: group.id, itemId: option.itemId, variantId: option.variantId })), selected.map(({ group, option }) => `${group.quantity}× ${option.label}`).join(" + "));
  }}>{availableGroups.map((group) => <div key={group.id} className="grid gap-2"><label className="text-sm font-semibold" htmlFor={`bundle-${group.id}`}>{group.name} × {group.quantity}</label><select id={`bundle-${group.id}`} required value={choices[group.id] ?? ""} onChange={(e) => setChoices((current) => ({ ...current, [group.id]: e.target.value }))} className="min-h-11 rounded-md border border-garage-line bg-garage-bg-2 px-3 text-base text-garage-fg"><option value="">Pilih {group.name}</option>{group.available.map((option) => <option key={`${option.itemId}:${option.variantId}`} value={`${option.itemId}::${option.variantId}`}>{option.label}</option>)}</select>{!group.available.length && <p role="alert" className="text-sm text-garage-red-bright">Komponen sedang tidak tersedia.</p>}</div>)}<div className="flex justify-end gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={onClose}>Batal</Button><Button type="submit" className="min-h-11" disabled={!complete}>Tambah Paket</Button></div></form></DialogContent></Dialog>;
}
