"use client";

import { ChevronRight, ShoppingBag } from "lucide-react";

import { rupiah } from "./order-ui";

// Bar keranjang mobile (fixed bawah, < lg). Boxy, merah Garage, total tabular.
export function OrderCartBar({
  itemCount,
  total,
  onOpen,
}: {
  itemCount: number;
  total: number;
  onOpen: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-garage-line bg-garage-bg-0/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="garage-press mx-auto flex h-14 w-full max-w-lg cursor-pointer items-center justify-between gap-3 rounded-lg bg-garage-red px-4 text-white shadow-[0_12px_32px_rgba(0,0,0,0.45)] transition-colors hover:bg-garage-red-bright"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="relative">
            <ShoppingBag className="size-5" aria-hidden />
            <span className="absolute -right-2.5 -top-2 flex min-w-5 items-center justify-center rounded-sm bg-white px-1 text-[11px] font-bold tabular-nums text-garage-bg-0">
              {itemCount}
            </span>
          </span>
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-xs font-semibold text-white/90">{itemCount} item</span>
            <span className="truncate font-mono text-lg font-bold tabular-nums">{rupiah.format(total)}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-bold uppercase tracking-wide">
          Lihat pesanan <ChevronRight className="size-4" aria-hidden />
        </span>
      </button>
    </div>
  );
}
