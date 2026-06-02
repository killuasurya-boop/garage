"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import { Building2, MapPin, PlusCircle, RefreshCw } from "lucide-react";

type Outlet = {
  id: string;
  name: string;
  code?: string;
  city?: string;
  address?: string;
  status?: string;
  revenueToday?: number;
  orderCountToday?: number;
  aovToday?: number;
};

const compact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)} rb`;
  return `Rp ${Math.round(n)}`;
};

export default function BranchesPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch("/api/outlets/list");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: { outlets?: Outlet[] } };
      setOutlets(json.data?.outlets ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat cabang");
    }
  };

  useEffect(() => {
    const id = window.setTimeout(async () => {
      await refresh();
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const ranked = useMemo(
    () => [...outlets].sort((a, b) => (b.revenueToday ?? 0) - (a.revenueToday ?? 0)),
    [outlets],
  );

  const aggregated = useMemo(() => {
    const total = outlets.reduce((s, o) => s + (o.revenueToday ?? 0), 0);
    const orders = outlets.reduce((s, o) => s + (o.orderCountToday ?? 0), 0);
    const aov = orders > 0 ? total / orders : 0;
    return { total, orders, aov };
  }, [outlets]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Branch Comparison"
        title="Perbandingan Cabang"
        subtitle="Ranking revenue, AOV, dan order count per outlet — siap untuk multi-cabang."
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Kpi label="Total Cabang" value={String(outlets.length)} icon={<Building2 className="h-4 w-4" />} />
        <Kpi label="Total Revenue Hari Ini" value={compact(aggregated.total)} icon={<Building2 className="h-4 w-4" />} />
        <Kpi label="AOV Gabungan" value={compact(aggregated.aov)} icon={<Building2 className="h-4 w-4" />} />
      </div>

      <Panel
        title="Ranking Cabang"
        subtitle="Sortir descending berdasarkan revenue hari ini"
        actions={
          outlets.length <= 1 ? (
            <Link
              href="/control/settings"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#ffd8a8] hover:bg-[color-mix(in_srgb,var(--garage-amber)_28%,transparent)]"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Tambah Cabang
            </Link>
          ) : null
        }
      >
        {loading && <p className="text-xs text-zinc-500">Memuat outlet…</p>}
        {!loading && outlets.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-6 text-center">
            <Building2 className="mx-auto h-8 w-8 text-zinc-500" />
            <p className="mt-2 text-sm font-semibold text-zinc-300">Belum ada cabang terdaftar</p>
            <p className="mt-1 text-xs text-zinc-500">
              Tambahkan outlet dari Settings → Outlets untuk memulai perbandingan.
            </p>
          </div>
        )}
        {!loading && outlets.length === 1 && (
          <div className="mb-3 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_10%,transparent)] p-3 text-xs text-[#ffd8a8]">
            Saat ini hanya ada 1 cabang aktif. Modul ini siap menampilkan perbandingan begitu Anda
            menambahkan cabang ke-2.
          </div>
        )}
        {ranked.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
                <tr>
                  <th className="py-2 pr-3 font-semibold">#</th>
                  <th className="py-2 pr-3 font-semibold">Cabang</th>
                  <th className="py-2 pr-3 font-semibold">Kota</th>
                  <th className="py-2 pr-3 font-semibold text-right">Revenue</th>
                  <th className="py-2 pr-3 font-semibold text-right">Orders</th>
                  <th className="py-2 pr-3 font-semibold text-right">AOV</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ranked.map((o, idx) => (
                  <tr key={o.id} className="text-zinc-200">
                    <td className="py-2 pr-3 font-mono text-zinc-400">{idx + 1}</td>
                    <td className="py-2 pr-3 font-medium">{o.name}</td>
                    <td className="py-2 pr-3 text-zinc-400">
                      {o.city ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {o.city}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {compact(o.revenueToday ?? 0)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-zinc-400">
                      {o.orderCountToday ?? 0}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-zinc-400">
                      {compact(o.aovToday ?? 0)}
                    </td>
                    <td className="py-2">
                      <Badge tone={o.status === "active" ? "success" : "muted"}>
                        {o.status ?? "aktif"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase text-zinc-400">{label}</p>
        <span className="text-zinc-400">{icon}</span>
      </div>
      <p className="mt-1 font-[var(--garage-font-display)] text-2xl font-black text-zinc-50">{value}</p>
    </div>
  );
}
