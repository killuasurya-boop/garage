"use client";

import { ArrowRight, Package } from "lucide-react";
import type { MenuItem } from "@/lib/garage-api-types";
import type { EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";
import { rupiah, itemCartQty } from "./order-ui";

export function EventBundleSection({ items, entries, products, cart, onChoose }: {
  items: MenuItem[];
  entries: EventMenuEntry[];
  products: EventMenuProduct[];
  cart: Record<string, number>;
  onChoose: (item: MenuItem) => void;
}) {
  if (!items.length) return null;
  return <section id="menu-paket-event" className="scroll-mt-[136px] pt-6" aria-labelledby="bundle-section-title">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div><p className="mb-1 text-sm font-semibold text-garage-amber">Pilihan spesial acara</p><h2 id="bundle-section-title" className="garage-display text-2xl text-white">Paket Bundling</h2><p className="mt-1 text-sm leading-6 text-garage-dim">Pilih isi paket, lalu gabungkan dengan menu lain dalam satu pesanan.</p></div>
      <span className="mt-1 shrink-0 rounded-md border border-garage-line bg-garage-bg-2 px-2.5 py-1.5 font-mono text-sm tabular-nums text-garage-dim">{items.length} paket</span>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map(item => {
        const entry = entries.find(row => `event:${row.id}` === item.id);
        const unavailable = item.stock === "sold_out";
        const quantity = itemCartQty(item, cart);
        return <article key={item.id} className={`flex min-w-0 flex-col rounded-lg border bg-garage-bg-2 p-4 sm:p-5 ${quantity ? "border-garage-amber" : "border-garage-line-2"}`}>
          <div className="mb-4 flex items-center justify-between gap-3"><span className="inline-flex size-11 items-center justify-center rounded-md border border-garage-amber/30 bg-garage-amber/10 text-garage-amber"><Package className="size-6" aria-hidden /></span><span className="text-sm font-semibold text-garage-dim">{quantity ? `${quantity} di keranjang` : "Harga paket"}</span></div>
          <h3 className="break-words text-lg font-bold leading-7 text-white">{item.name}</h3>
          {item.description && <p className="mt-2 text-sm leading-6 text-garage-dim">{item.description}</p>}
          <ul className="my-4 grid gap-2 border-y border-garage-line py-3 text-sm leading-6 text-garage-dim">{entry?.groups.map(group => <li key={group.id} className="flex items-start gap-2"><span className="shrink-0 font-mono font-bold text-garage-amber">{group.quantity}×</span><span>{group.options.length === 1 ? products.find(product => product.id === group.options[0].itemId)?.name ?? group.name : `${group.name.replace(/^pilih\s+/i, "")} pilihan`}</span></li>)}</ul>
          <div className="mt-auto flex flex-wrap items-end justify-between gap-2"><strong className="font-mono text-2xl font-bold tabular-nums text-white">{rupiah.format(item.variants[0]?.price ?? 0)}</strong><span className="text-sm text-garage-dim">per paket</span></div>
          <button type="button" onClick={() => onChoose(item)} disabled={unavailable} className="mt-4 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-garage-red px-4 text-base font-bold text-white transition-colors hover:bg-garage-red-bright focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-garage-amber disabled:cursor-not-allowed disabled:bg-garage-bg-3 disabled:text-garage-dim">{unavailable ? "Paket tidak tersedia" : "Pilih paket"}{!unavailable && <ArrowRight className="size-4" aria-hidden />}</button>
        </article>;
      })}
    </div>
  </section>;
}
