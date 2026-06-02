"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import { Star, Puzzle, Tractor, Trash2, Info, RefreshCw } from "lucide-react";

type MenuVariant = {
  id: string;
  label: string;
  price: number;
  baseCost?: number;
  soldQty?: number;
};

type MenuItem = {
  id: string;
  name: string;
  category: string;
  section?: string;
  variants: MenuVariant[];
  status?: string;
};

type Quadrant = "star" | "puzzle" | "plowhorse" | "dog";

type EngineeringRow = {
  itemId: string;
  itemName: string;
  category: string;
  variantLabel: string;
  price: number;
  cost: number;
  marginRp: number;
  marginPct: number;
  volume: number;
  quadrant: Quadrant;
};

const quadrantMeta: Record<
  Quadrant,
  { label: string; tone: "success" | "amber" | "chrome" | "red"; icon: typeof Star; advice: string }
> = {
  star: {
    label: "Star",
    tone: "success",
    icon: Star,
    advice: "Margin & volume tinggi — promosikan, jadikan signature.",
  },
  puzzle: {
    label: "Puzzle",
    tone: "amber",
    icon: Puzzle,
    advice: "Margin tinggi, volume rendah — naikkan awareness / cross-sell.",
  },
  plowhorse: {
    label: "Plowhorse",
    tone: "chrome",
    icon: Tractor,
    advice: "Volume tinggi, margin tipis — naikkan harga atau efisiensi resep.",
  },
  dog: {
    label: "Dog",
    tone: "red",
    icon: Trash2,
    advice: "Margin & volume rendah — pertimbangkan dihapus dari menu.",
  },
};

function classify(marginPct: number, volume: number, medMargin: number, medVolume: number): Quadrant {
  if (marginPct >= medMargin && volume >= medVolume) return "star";
  if (marginPct >= medMargin && volume < medVolume) return "puzzle";
  if (marginPct < medMargin && volume >= medVolume) return "plowhorse";
  return "dog";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export default function MenuEngineeringPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      // Coba endpoint engineering (agregasi 30 hari). Fallback ke /api/menu
      // bila endpoint baru belum tersedia — biar dev/staging tetap jalan.
      const engRes = await fetch("/api/menu/engineering").catch(() => null);
      if (engRes && engRes.ok) {
        const json = (await engRes.json()) as {
          data?: {
            variants?: Array<{
              itemId: string;
              itemName: string;
              category: string;
              variantId: string;
              variantLabel: string;
              price: number;
              baseCost: number;
              soldQty: number;
            }>;
          };
        };
        const grouped = new Map<string, MenuItem>();
        for (const v of json.data?.variants ?? []) {
          const cur = grouped.get(v.itemId);
          const variant = {
            id: v.variantId,
            label: v.variantLabel,
            price: v.price,
            baseCost: v.baseCost,
            soldQty: v.soldQty,
          };
          if (cur) cur.variants.push(variant);
          else
            grouped.set(v.itemId, {
              id: v.itemId,
              name: v.itemName,
              category: v.category,
              variants: [variant],
            });
        }
        setItems(Array.from(grouped.values()));
        setError(null);
        return;
      }
      const res = await fetch("/api/menu");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: { menu?: MenuItem[] } };
      setItems(json.data?.menu ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat menu");
    }
  };

  useEffect(() => {
    const id = window.setTimeout(async () => {
      await refresh();
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Untuk volume awal kami pakai field `soldQty` jika ada; jika tidak ada
  // backend belum menyuplai, semua item akan diklasifikasi berdasarkan margin
  // saja (volume = 0 → masuk Puzzle/Dog). Saat backend menambahkan agregasi
  // 30-hari per varian, kuadran akan langsung akurat.
  const rows = useMemo<EngineeringRow[]>(() => {
    const raw: Omit<EngineeringRow, "quadrant">[] = [];
    for (const item of items) {
      for (const v of item.variants ?? []) {
        const cost = v.baseCost ?? 0;
        const margin = v.price - cost;
        const marginPct = v.price > 0 ? (margin / v.price) * 100 : 0;
        raw.push({
          itemId: item.id,
          itemName: item.name,
          category: item.category,
          variantLabel: v.label,
          price: v.price,
          cost,
          marginRp: margin,
          marginPct,
          volume: v.soldQty ?? 0,
        });
      }
    }
    const medMargin = median(raw.map((r) => r.marginPct));
    const medVolume = median(raw.map((r) => r.volume));
    return raw.map((r) => ({
      ...r,
      quadrant: classify(r.marginPct, r.volume, medMargin || 1, medVolume || 1),
    }));
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<Quadrant, number> = { star: 0, puzzle: 0, plowhorse: 0, dog: 0 };
    for (const r of rows) c[r.quadrant] += 1;
    return c;
  }, [rows]);

  const hasVolume = rows.some((r) => r.volume > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Menu Engineering"
        title="Quadrant Menu GARAGE"
        subtitle="Klasifikasi Star / Puzzle / Plowhorse / Dog berdasarkan margin & volume."
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Segarkan
          </button>
        }
      />

      {error && (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_12%,transparent)] p-3 text-xs text-[#ffb1b1]">
          {error}
        </div>
      )}

      {!hasVolume && !loading && rows.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_12%,transparent)] p-3 text-xs text-[#ffd8a8]">
          <Info className="size-3.5 mt-0.5 shrink-0" />
          <span>
            Data volume penjualan per varian belum tersedia dari API. Klasifikasi sementara
            hanya berdasarkan margin — item akan otomatis pindah kuadran begitu backend
            agregasi 30 hari aktif.
          </span>
        </div>
      )}

      {/* 4 KPI kuadran */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(quadrantMeta) as Quadrant[]).map((q) => {
          const m = quadrantMeta[q];
          const Icon = m.icon;
          return (
            <div
              key={q}
              className="rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase text-zinc-400">{m.label}</p>
                <Icon className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-1 font-[var(--garage-font-display)] text-2xl font-black text-zinc-50">
                {counts[q]}
              </p>
              <Badge tone={m.tone} className="mt-2">
                {q === "star" ? "promosikan" : q === "puzzle" ? "dorong" : q === "plowhorse" ? "revisi harga" : "review hapus"}
              </Badge>
              <p className="mt-2 text-[10px] leading-snug text-zinc-500">{m.advice}</p>
            </div>
          );
        })}
      </div>

      {/* Tabel lengkap */}
      <Panel
        title="Daftar Varian Menu"
        subtitle={`${rows.length} varian dari ${items.length} item`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">Item</th>
                <th className="py-2 pr-3 font-semibold">Varian</th>
                <th className="py-2 pr-3 font-semibold">Kategori</th>
                <th className="py-2 pr-3 font-semibold text-right">Harga</th>
                <th className="py-2 pr-3 font-semibold text-right">Cost</th>
                <th className="py-2 pr-3 font-semibold text-right">Margin %</th>
                <th className="py-2 pr-3 font-semibold text-right">Volume</th>
                <th className="py-2 font-semibold">Kuadran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-zinc-500">
                    Memuat menu…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-zinc-500">
                    Belum ada item menu.
                  </td>
                </tr>
              )}
              {rows
                .sort((a, b) => b.marginPct - a.marginPct)
                .map((r, i) => {
                  const m = quadrantMeta[r.quadrant];
                  return (
                    <tr key={`${r.itemId}-${i}`} className="text-zinc-200">
                      <td className="py-2 pr-3 font-medium">{r.itemName}</td>
                      <td className="py-2 pr-3 text-zinc-400">{r.variantLabel}</td>
                      <td className="py-2 pr-3 text-zinc-400">{r.category}</td>
                      <td className="py-2 pr-3 text-right font-mono">{idr.format(r.price)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-zinc-400">{idr.format(r.cost)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{r.marginPct.toFixed(1)}%</td>
                      <td className="py-2 pr-3 text-right font-mono text-zinc-400">{r.volume}</td>
                      <td className="py-2">
                        <Badge tone={m.tone}>{m.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
