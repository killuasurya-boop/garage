"use client";

import { ArrowRight } from "lucide-react";
import type { MenuItem } from "@/lib/garage-api-types";
import { EventBundleVisual } from "@/components/garage/events/event-bundle-visual";
import { bundleGroupSummary, bundleUnavailableReason } from "@/lib/event-menu-display";
import type { EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";
import { rupiah, itemCartQty } from "./order-ui";

export function EventBundleSection({ items, entries, products, cart, now, onChoose }: {
  items: MenuItem[];
  entries: EventMenuEntry[];
  products: EventMenuProduct[];
  cart: Record<string, number>;
  now: number;
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
        const reason = entry ? bundleUnavailableReason(entry, products, now) : item.stock === "sold_out" ? "Tidak tersedia" : null;
        const quantity = itemCartQty(item, cart);
        return <article key={item.id} className={`garage-hover-lift flex min-w-0 flex-col overflow-hidden rounded-lg border bg-garage-bg-2 ${quantity ? "border-garage-amber" : "border-garage-line-2"}`}>
          {entry ? <EventBundleVisual entry={entry} products={products} className="aspect-[4/3] w-full rounded-none border-0 border-b" /> : null}
          <div className="flex flex-1 flex-col p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 break-words text-lg font-bold leading-7 text-white">{item.name}</h3>
              {quantity ? <span className="shrink-0 rounded-md bg-garage-amber px-2 py-1 text-sm font-bold text-black">{quantity} di keranjang</span> : null}
            </div>
            {item.description && <p className="mt-2 text-sm leading-6 text-garage-dim">{item.description}</p>}
            <ul className="my-4 grid gap-2.5 border-y border-garage-line py-3 text-sm leading-6">
              {entry?.groups.map(group => {
                const summary = bundleGroupSummary(group, products);
                return <li key={group.id} className="min-w-0">
                  <p className="break-words text-garage-fg"><span className="font-semibold text-garage-amber">{summary.label}:</span> {summary.choice}</p>
                  {summary.detail ? <p className="break-words text-garage-dim">{summary.detail}</p> : null}
                </li>;
              })}
            </ul>
            <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
              <strong className="font-mono text-2xl font-bold tabular-nums text-white">{rupiah.format(item.variants[0]?.price ?? 0)}</strong>
              <span className="text-sm text-garage-dim">Harga final · termasuk layanan &amp; pajak</span>
            </div>
            {reason ? <p className="mt-3 rounded-md border border-garage-amber/40 bg-garage-amber/10 px-3 py-2 text-sm font-semibold text-garage-amber" role="status">{reason}</p> : null}
            <button type="button" onClick={() => onChoose(item)} disabled={Boolean(reason)} className="garage-press mt-4 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-garage-red px-4 text-base font-bold text-white transition-colors hover:bg-garage-red-bright focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-garage-amber disabled:cursor-not-allowed disabled:bg-garage-bg-3 disabled:text-garage-dim">{reason ? "Belum bisa dipesan" : "Pilih paket"}{!reason && <ArrowRight className="size-4" aria-hidden />}</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
