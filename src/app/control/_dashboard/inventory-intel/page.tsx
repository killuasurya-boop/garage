"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import { AlertTriangle, Boxes, PackageCheck, PackageX, RefreshCw, TrendingDown } from "lucide-react";

type InventoryItem = {
  sku?: string;
  id?: string;
  name: string;
  category?: string;
  unit?: string;
  onHand: number;
  min: number;
  status: string;
  // Diisi oleh /api/inventory/intel.
  outQty?: number;
  wasteQty?: number;
  dailyUse?: number;
  daysLeft?: number | null;
};

type Movement = {
  sku?: string;
  type?: string; // "in" | "out" | "waste" | dll.
  qty?: number;
  createdAt?: string;
};

const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

export default function InventoryIntelPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      // Endpoint agregasi server-side (preferred).
      const intelRes = await fetch("/api/inventory/intel").catch(() => null);
      if (intelRes && intelRes.ok) {
        const json = (await intelRes.json()) as {
          data?: {
            summary?: { wastePct?: number; wasteEvents?: number };
            items?: Array<
              InventoryItem & {
                outQty?: number;
                wasteQty?: number;
                dailyUse?: number;
                daysLeft?: number | null;
              }
            >;
          };
        };
        const items = json.data?.items ?? [];
        setItems(items);
        // Sintesis movement minimal untuk reuse perhitungan stats (wastePct).
        const fakeMov: Movement[] = items.flatMap((i) => {
          const w = i.wasteQty ?? 0;
          const o = i.outQty ?? 0;
          const out: Movement[] = [];
          if (w > 0) out.push({ sku: i.sku, type: "waste", qty: w });
          if (o > 0) out.push({ sku: i.sku, type: "out", qty: o });
          return out;
        });
        setMovements(fakeMov);
        setError(null);
        return;
      }
      // Fallback ke endpoint lama.
      const [invRes, movRes] = await Promise.all([
        fetch("/api/inventory"),
        fetch("/api/inventory/movements").catch(() => null),
      ]);
      if (!invRes.ok) throw new Error(`Inventory HTTP ${invRes.status}`);
      const invJson = (await invRes.json()) as {
        data?: InventoryItem[] | { rows?: InventoryItem[] };
      };
      const list = Array.isArray(invJson.data)
        ? invJson.data
        : invJson.data?.rows ?? [];
      setItems(list);
      if (movRes && movRes.ok) {
        const movJson = (await movRes.json()) as {
          data?: Movement[] | { rows?: Movement[] };
        };
        const movList = Array.isArray(movJson.data)
          ? movJson.data
          : movJson.data?.rows ?? [];
        setMovements(movList);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat inventaris");
    }
  };

  useEffect(() => {
    const id = window.setTimeout(async () => {
      await refresh();
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const stats = useMemo(() => {
    const low = items.filter((i) => i.status === "low").length;
    const watch = items.filter((i) => i.status === "watch").length;
    const safe = items.filter((i) => i.status === "safe" || i.status === "ready").length;
    const wasteOut = movements.filter((m) => m.type === "waste").length;
    const wasteQty = movements
      .filter((m) => m.type === "waste")
      .reduce((sum, m) => sum + (m.qty ?? 0), 0);
    const outQty = movements
      .filter((m) => m.type === "out" || m.type === "waste")
      .reduce((sum, m) => sum + (m.qty ?? 0), 0);
    const wastePct = outQty > 0 ? (wasteQty / outQty) * 100 : 0;
    return { low, watch, safe, wasteOut, wastePct };
  }, [items, movements]);

  // Item yang paling cepat habis: pakai daysLeft dari server, fallback: onHand/min.
  const fastest = useMemo(() => {
    return [...items]
      .map((i) => {
        const ratio = i.min > 0 ? i.onHand / i.min : 99;
        return { ...i, ratio };
      })
      .sort((a, b) => {
        if (a.daysLeft != null && b.daysLeft != null) return a.daysLeft - b.daysLeft;
        if (a.daysLeft != null) return -1;
        if (b.daysLeft != null) return 1;
        return a.ratio - b.ratio;
      })
      .slice(0, 10);
  }, [items]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Inventory Intelligence"
        title="Stok, Wastage & Reorder"
        subtitle="Pantau cepat-habis, wastage, dan kesehatan stok harian."
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Item Stok Rendah" value={stats.low} icon={<PackageX className="h-4 w-4" />} tone="red" hint="butuh reorder" />
        <Kpi label="Item Watch" value={stats.watch} icon={<AlertTriangle className="h-4 w-4" />} tone="amber" hint="mendekati batas" />
        <Kpi label="Item Aman" value={stats.safe} icon={<PackageCheck className="h-4 w-4" />} tone="success" hint="di atas minimum" />
        <Kpi
          label="Wastage %"
          value={Number(stats.wastePct.toFixed(1))}
          suffix="%"
          icon={<TrendingDown className="h-4 w-4" />}
          tone={stats.wastePct > 5 ? "red" : stats.wastePct > 2 ? "amber" : "success"}
          hint={`${stats.wasteOut} event waste`}
        />
      </div>

      <Panel title="Cepat Habis (Top 10)" subtitle="Sortir berdasarkan hari tersisa atau rasio terhadap minimum">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">SKU</th>
                <th className="py-2 pr-3 font-semibold">Nama</th>
                <th className="py-2 pr-3 font-semibold">Kategori</th>
                <th className="py-2 pr-3 font-semibold text-right">On Hand</th>
                <th className="py-2 pr-3 font-semibold text-right">Min</th>
                <th className="py-2 pr-3 font-semibold text-right">Hari Tersisa</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-zinc-500">
                    Memuat inventaris…
                  </td>
                </tr>
              )}
              {!loading && fastest.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-zinc-500">
                    Tidak ada item inventaris.
                  </td>
                </tr>
              )}
              {fastest.map((i) => (
                <tr key={i.sku ?? i.id ?? i.name} className="text-zinc-200">
                  <td className="py-2 pr-3 font-mono text-zinc-400">{i.sku ?? "—"}</td>
                  <td className="py-2 pr-3 font-medium">{i.name}</td>
                  <td className="py-2 pr-3 text-zinc-400">{i.category ?? "—"}</td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {idr.format(i.onHand)} {i.unit ?? ""}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-zinc-400">
                    {idr.format(i.min)} {i.unit ?? ""}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {i.daysLeft != null ? `${idr.format(i.daysLeft)}h` : "—"}
                  </td>
                  <td className="py-2">
                    {i.status === "low" ? (
                      <Badge tone="red">Low</Badge>
                    ) : i.status === "watch" ? (
                      <Badge tone="amber">Watch</Badge>
                    ) : (
                      <Badge tone="success">Aman</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Supplier Intelligence" subtitle="Data agregasi supplier akan tersedia setelah modul receivings mencatat ≥ 30 transaksi">
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-4 text-xs text-zinc-400">
          <Boxes className="h-5 w-5 text-zinc-500" />
          Tabel supplier (on-time %, lead time rata-rata, harga naik/turun) akan otomatis muncul di sini
          ketika data <code className="rounded bg-white/10 px-1">supplier_receivings</code> mencukupi.
        </div>
      </Panel>
    </div>
  );
}

function Kpi({
  label,
  value,
  suffix,
  icon,
  tone,
  hint,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  tone: "red" | "amber" | "success" | "chrome";
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase text-zinc-400">{label}</p>
        <span className="text-zinc-400">{icon}</span>
      </div>
      <p className="mt-1 font-[var(--garage-font-display)] text-2xl font-black text-zinc-50">
        {value}
        {suffix ? <span className="ml-1 text-base font-bold text-zinc-300">{suffix}</span> : null}
      </p>
      {hint && (
        <Badge tone={tone} className="mt-2">
          {hint}
        </Badge>
      )}
    </div>
  );
}
