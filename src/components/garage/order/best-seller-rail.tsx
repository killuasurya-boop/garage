"use client";

import { Flame, Plus } from "lucide-react";

import type { MenuItem } from "@/lib/garage-api-types";

import { categoryIcon, itemCartQty, itemMinPrice, rupiah } from "./order-ui";

// Rail "Terlaris": baris horizontal statis (tanpa auto-rotate), maksimal 6 item.
// Item satu varian langsung masuk keranjang; multi-varian membuka sheet detail.
export function BestSellerRail({
  id,
  items,
  cart,
  onQuickAdd,
  onOpen,
}: {
  id: string;
  items: MenuItem[];
  cart: Record<string, number>;
  onQuickAdd: (item: MenuItem) => void;
  onOpen: (item: MenuItem) => void;
}) {
  if (!items.length) return null;

  return (
    <section id={id} data-order-section="Terlaris" className="scroll-mt-[124px] pt-5">
      <div className="mb-3 flex items-center gap-2">
        <Flame className="size-4 text-garage-amber" aria-hidden />
        <h2 className="garage-display text-[22px] leading-none tracking-wide text-white">Terlaris</h2>
        <span className="min-w-0 truncate text-xs font-semibold text-garage-dim">Favorit pelanggan</span>
      </div>
      <div className="garage-scroll-x -mx-4 flex gap-3 px-4 pb-1 sm:mx-0 sm:px-0">
        {items.map((item) => {
          const qty = itemCartQty(item, cart);
          return (
            <article
              key={item.id}
              className="flex w-[160px] shrink-0 flex-col rounded-lg border border-garage-line bg-garage-bg-2 p-3 transition-colors hover:border-garage-line-2"
            >
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="min-w-0 flex-1 cursor-pointer text-left"
                aria-label={`Lihat detail ${item.name}`}
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    className="mb-2.5 aspect-[4/3] w-full rounded-md object-cover"
                  />
                ) : (
                  <span className="mb-2.5 flex size-9 items-center justify-center rounded-md bg-garage-amber/12">
                    {categoryIcon(item.category, "size-[18px] text-garage-amber")}
                  </span>
                )}
                <span className="line-clamp-2 min-h-[2.5em] text-sm font-bold leading-snug text-white">
                  {item.name}
                </span>
              </button>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-sm font-bold tabular-nums text-white">
                  {rupiah.format(itemMinPrice(item))}
                </span>
                <button
                  type="button"
                  onClick={() => onQuickAdd(item)}
                  className="garage-press relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md bg-garage-red text-white transition-colors hover:bg-garage-red-bright"
                  aria-label={item.variants.length > 1 ? `Pilih varian ${item.name}` : `Tambah ${item.name}`}
                >
                  <Plus className="size-4" strokeWidth={2.5} />
                  {qty > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-sm bg-white px-1 text-[11px] font-bold tabular-nums text-garage-bg-0">
                      {qty}
                    </span>
                  ) : null}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
