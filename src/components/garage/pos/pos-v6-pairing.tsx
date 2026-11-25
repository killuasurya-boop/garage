"use client";

// "Sering dibeli bersama" di keranjang POS (Fase 5, owner 25 Nov 2026).
// Jangkar = item baris keranjang terakhir. Saran dari `GET /api/pos/upsell` (order lunas outlet ini, 30 hari,
// minimal 3 order bersama) — tanpa data = tidak tampil. Maks 3 saran yang ada di menu, tidak habis, belum di keranjang.
// Klik = alur tap produk biasa (dialog varian bila multi-varian).

import { useEffect, useState } from "react";

import { garageApi } from "@/lib/api-client";
import type { MenuItem } from "@/lib/garage-api-types";
import type { PairingSuggestion } from "@/lib/pos-insights";

const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; suggestions: PairingSuggestion[] }>();

export function PosV6Pairing({
  anchor,
  menuById,
  cartItemIds,
  soldOutIds,
  disabled,
  onPick,
}: {
  anchor: MenuItem | null;
  menuById: ReadonlyMap<string, MenuItem>;
  cartItemIds: ReadonlySet<string>;
  soldOutIds: ReadonlySet<string>;
  /** Offline / terkunci → tidak memuat & tidak tampil. */
  disabled?: boolean;
  onPick: (item: MenuItem) => void;
}) {
  const anchorId = anchor?.id ?? null;
  const [loaded, setLoaded] = useState<{ id: string; suggestions: PairingSuggestion[] } | null>(null);

  useEffect(() => {
    if (!anchorId || disabled) return;
    const hit = cache.get(anchorId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- isi dari cache modul, tanpa request
      setLoaded({ id: anchorId, suggestions: hit.suggestions });
      return;
    }
    let cancelled = false;
    garageApi
      .get<{ suggestions: PairingSuggestion[] }>(`/api/pos/upsell?menuItemId=${encodeURIComponent(anchorId)}&limit=6`, {
        cache: "no-store",
      })
      .then((data) => {
        const suggestions = data.suggestions ?? [];
        cache.set(anchorId, { at: Date.now(), suggestions });
        if (!cancelled) setLoaded({ id: anchorId, suggestions });
      })
      .catch(() => undefined); // saran tidak kritis: gagal = tidak tampil
    return () => {
      cancelled = true;
    };
  }, [anchorId, disabled]);

  if (!anchor || disabled || !loaded || loaded.id !== anchor.id) return null;
  const picks = loaded.suggestions
    .map((row) => ({ row, item: menuById.get(row.menuItemId) }))
    .filter((entry): entry is { row: PairingSuggestion; item: MenuItem } =>
      Boolean(entry.item) && !cartItemIds.has(entry.row.menuItemId) && !soldOutIds.has(entry.row.menuItemId),
    )
    .slice(0, 3);
  if (!picks.length) return null;

  return (
    <section className="pos-v6-pairing mt-2 rounded-md border border-[var(--pos-border,#3a3a42)] p-2" data-testid="pos-pairing" aria-label="Sering dibeli bersama">
      <p className="truncate text-xs font-semibold text-[var(--pos-muted,#c4c4cc)]">
        Sering dibeli bersama <span className="text-[var(--pos-text,#f4f4f5)]">{anchor.name}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {picks.map(({ row, item }) => (
          <button
            key={row.menuItemId}
            type="button"
            onClick={() => onPick(item)}
            className="pos-v6-pairing-btn inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-md border border-[var(--pos-border,#3a3a42)] px-2.5 text-left text-sm font-semibold text-[var(--pos-text,#f4f4f5)] transition-colors hover:border-[var(--pos-accent,#d11a2a)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pos-accent,#d11a2a)]"
            title={`Dibeli bersama di ${row.pairCount} order (30 hari)`}
            aria-label={`Tambah ${item.name}, dibeli bersama di ${row.pairCount} order`}
          >
            <span className="truncate">+ {item.name}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--pos-muted,#c4c4cc)]">{row.pairCount}×</span>
          </button>
        ))}
      </div>
    </section>
  );
}
