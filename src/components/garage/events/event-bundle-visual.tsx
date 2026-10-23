"use client";

import { useState } from "react";
import { Package } from "lucide-react";

import { bundleImageSources } from "@/lib/event-menu-display";
import type { EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";

/**
 * Foto paket event. Tanpa foto paket → kolase foto komponen (minuman/cemilan, bukan rokok);
 * tanpa foto sama sekali → ikon paket. Tidak pernah kosong.
 */
export function EventBundleVisual({ entry, products, className = "" }: {
  entry: EventMenuEntry;
  products: EventMenuProduct[];
  className?: string;
}) {
  // Foto yang gagal dimuat disembunyikan → kolase/ikon, tidak pernah ikon gambar rusak.
  const [failed, setFailed] = useState<string[]>([]);
  const sources = bundleImageSources(entry, products).filter((src) => !failed.includes(src));
  return (
    <div className={`relative overflow-hidden rounded-md border border-garage-line-2 bg-garage-bg-3 ${className}`}>
      {sources.length ? (
        <div className={`grid h-full w-full gap-0.5 ${sources.length === 1 ? "grid-cols-1" : sources.length === 2 ? "grid-cols-2" : "grid-cols-[2fr_1fr] grid-rows-2"}`}>
          {sources.map((src, index) => (
            // Foto dari URL bebas (upload/admin) — <img> biasa, sama dengan kartu menu.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={index === 0 ? `Foto ${entry.name}` : ""}
              loading="lazy"
              decoding="async"
              onError={() => setFailed((current) => (current.includes(src) ? current : [...current, src]))}
              className={`h-full w-full object-cover ${sources.length === 3 && index === 0 ? "row-span-2" : ""}`}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-garage-amber">
          <Package className="size-10" aria-hidden />
        </div>
      )}
      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-xs font-bold uppercase tracking-wide text-garage-amber">
        <Package className="size-3.5" aria-hidden /> Paket
      </span>
    </div>
  );
}
