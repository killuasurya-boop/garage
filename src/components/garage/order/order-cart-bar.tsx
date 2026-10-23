"use client";

import { Check, ChevronRight, ShoppingBag } from "lucide-react";

import { rupiah } from "./order-ui";

export type LastAdded = { name: string; stamp: number };

// Bar keranjang mobile (fixed bawah, < lg). Teks jumlah item "memantul" tiap kali berubah
// (key berganti → animasi diputar ulang) dan item terakhir yang ditambahkan tampil
// sebentar di atas bar sebagai konfirmasi.
export function OrderCartBar({
  itemCount,
  total,
  onOpen,
  lastAdded,
}: {
  itemCount: number;
  total: number;
  onOpen: () => void;
  lastAdded?: LastAdded | null;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-garage-line bg-garage-bg-0/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
      {lastAdded ? (
        <p
          key={lastAdded.stamp}
          role="status"
          className="garage-toast-in mx-auto mb-2 flex max-w-lg items-center gap-1.5 text-[13px] text-garage-dim"
        >
          <Check className="size-3.5 shrink-0 text-garage-amber" aria-hidden />
          <span className="line-clamp-2 min-w-0 break-words">
            <strong className="font-semibold text-white">{lastAdded.name}</strong> masuk keranjang
          </span>
        </p>
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        className="garage-press mx-auto flex h-14 w-full max-w-lg cursor-pointer items-center justify-between gap-3 rounded-lg bg-garage-red px-4 text-white shadow-[0_12px_32px_rgba(0,0,0,0.45)] transition-colors hover:bg-garage-red-bright"
      >
        <span className="flex min-w-0 items-center gap-3">
          {/* Ikon tanpa badge angka: jumlah item sudah tertulis di sebelahnya
              (badge di atas ikon menimpa gambar tas di layar kecil). */}
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white/15">
            <ShoppingBag className="size-5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span key={itemCount} className="garage-cart-bump origin-left text-xs font-semibold text-white">
              {itemCount} item
            </span>
            <span className="whitespace-nowrap font-mono text-lg font-bold tabular-nums">{rupiah.format(total)}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[15px] font-bold">
          Lihat pesanan <ChevronRight className="size-4" aria-hidden />
        </span>
      </button>
    </div>
  );
}
