"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import {
  AlertTriangle,
  ChefHat,
  Coffee,
  Clock,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

type Ticket = {
  id: string;
  table: string;
  channel: string;
  station: string; // "Bar" | "Food"
  status: string; // "queue" | "cooking" | "ready" | "delivered"
  elapsed: number;
  items: Array<{ name?: string; qty?: number }>;
  priority?: string;
  targetMinutes: number;
  acceptedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  addonSequence: number;
};

type PerfRow = {
  staffName: string;
  stations: string[];
  totalTickets: number;
  totalProducts: number;
  onTimeTickets: number;
  lateTickets: number;
  lateRate: number;
  score: number;
  warningLevel: string;
  avgProductionMinutes: number | null;
};

type Performance = {
  range: string;
  summary: {
    onTimeTickets: number;
    lateTickets: number;
    totalTickets: number;
    totalProducts: number;
    avgScore: number | null;
    avgProductionMinutes: number | null;
    activeTickets: number;
  };
  rows: PerfRow[];
};

export default function KitchenOpsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [tRes, pRes] = await Promise.all([
        fetch("/api/kitchen/orders", { cache: "no-store" }),
        fetch("/api/kitchen/performance?range=today", { cache: "no-store" }),
      ]);
      if (!tRes.ok) throw new Error(`Tickets HTTP ${tRes.status}`);
      const tJson = (await tRes.json()) as { data?: Ticket[] };
      setTickets(tJson.data ?? []);
      if (pRes.ok) {
        const pJson = (await pRes.json()) as { data?: Performance };
        setPerf(pJson.data ?? null);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat kitchen");
    }
  }, []);

  useEffect(() => {
    const id0 = window.setTimeout(async () => {
      await refresh();
      setLoading(false);
    }, 0);
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearTimeout(id0);
      window.clearInterval(id);
    };
  }, [refresh]);

  const stats = useMemo(() => {
    const active = tickets.filter((t) => t.status !== "delivered");
    const bar = active.filter((t) => t.station === "Bar");
    const food = active.filter((t) => t.station === "Food");
    const queueCount = active.filter((t) => t.status === "queue").length;
    const cookingCount = active.filter((t) => t.status === "cooking").length;
    const readyCount = active.filter((t) => t.status === "ready").length;
    // Late = elapsed melebihi target dan masih belum ready.
    const late = active.filter((t) => {
      if (t.status === "ready") return false;
      return t.elapsed > t.targetMinutes;
    });
    return {
      active: active.length,
      bar: bar.length,
      food: food.length,
      queueCount,
      cookingCount,
      readyCount,
      lateCount: late.length,
      late,
    };
  }, [tickets]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Kitchen Ops"
        title="Operasional Dapur & Bar Live"
        subtitle="KDS routing Bar/Food, status antrian, dan performa staf hari ini."
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

      {/* KPI active */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Tiket Aktif" value={stats.active} icon={<Clock className="h-4 w-4" />} tone={stats.active > 10 ? "amber" : "chrome"} />
        <Kpi label="Antri (queue)" value={stats.queueCount} icon={<Clock className="h-4 w-4" />} tone={stats.queueCount > 5 ? "amber" : "chrome"} />
        <Kpi label="Sedang Dimasak" value={stats.cookingCount} icon={<ChefHat className="h-4 w-4" />} tone="chrome" />
        <Kpi label="Tiket Telat" value={stats.lateCount} icon={<AlertTriangle className="h-4 w-4" />} tone={stats.lateCount > 0 ? "red" : "success"} />
      </div>

      {/* Station split */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <StationCard
          title="Station Bar"
          icon={<Coffee className="h-4 w-4" />}
          active={stats.bar}
          tickets={tickets.filter((t) => t.station === "Bar" && t.status !== "delivered")}
        />
        <StationCard
          title="Station Food"
          icon={<ChefHat className="h-4 w-4" />}
          active={stats.food}
          tickets={tickets.filter((t) => t.station === "Food" && t.status !== "delivered")}
        />
      </div>

      {stats.late.length > 0 && (
        <Panel title={`Tiket Telat — ${stats.late.length}`} subtitle="Elapsed melebihi target, belum ready">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Tiket</th>
                  <th className="py-2 pr-3 font-semibold">Meja</th>
                  <th className="py-2 pr-3 font-semibold">Station</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold text-right">Target</th>
                  <th className="py-2 pr-3 font-semibold text-right">Elapsed</th>
                  <th className="py-2 font-semibold">Over by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stats.late.map((t) => (
                  <tr key={t.id} className="text-zinc-200">
                    <td className="py-2 pr-3 font-mono text-zinc-300">{t.id}</td>
                    <td className="py-2 pr-3">{t.table}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={t.station === "Bar" ? "info" : "amber"}>{t.station}</Badge>
                    </td>
                    <td className="py-2 pr-3 capitalize">{t.status}</td>
                    <td className="py-2 pr-3 text-right font-mono text-zinc-400">{t.targetMinutes}m</td>
                    <td className="py-2 pr-3 text-right font-mono">{t.elapsed}m</td>
                    <td className="py-2 font-mono text-[#ffb1b1]">+{t.elapsed - t.targetMinutes}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Performance hari ini */}
      <Panel
        title="Performa Hari Ini"
        subtitle={
          perf
            ? `On-time ${perf.summary.onTimeTickets} · Telat ${perf.summary.lateTickets} · Avg prep ${perf.summary.avgProductionMinutes ?? "—"}m`
            : "memuat metrik…"
        }
      >
        {perf && perf.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Staf</th>
                  <th className="py-2 pr-3 font-semibold">Station</th>
                  <th className="py-2 pr-3 font-semibold text-right">Tiket</th>
                  <th className="py-2 pr-3 font-semibold text-right">On-Time</th>
                  <th className="py-2 pr-3 font-semibold text-right">Telat</th>
                  <th className="py-2 pr-3 font-semibold text-right">Avg Prep</th>
                  <th className="py-2 pr-3 font-semibold text-right">Score</th>
                  <th className="py-2 font-semibold">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {perf.rows.map((r) => (
                  <tr key={r.staffName} className="text-zinc-200">
                    <td className="py-2 pr-3 font-medium">{r.staffName}</td>
                    <td className="py-2 pr-3 text-zinc-400">{r.stations.join(", ") || "—"}</td>
                    <td className="py-2 pr-3 text-right font-mono">{r.totalTickets}</td>
                    <td className="py-2 pr-3 text-right font-mono text-emerald-300">{r.onTimeTickets}</td>
                    <td className="py-2 pr-3 text-right font-mono text-[#ffb1b1]">{r.lateTickets}</td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {r.avgProductionMinutes != null ? `${r.avgProductionMinutes}m` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{r.score}</td>
                    <td className="py-2">
                      <Badge
                        tone={
                          r.warningLevel === "Aman"
                            ? "success"
                            : r.warningLevel === "Data Belum Cukup"
                              ? "muted"
                              : r.warningLevel === "SP1"
                                ? "amber"
                                : "red"
                        }
                      >
                        {r.warningLevel}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <p className="text-xs text-zinc-500">Belum ada tiket selesai hari ini.</p>
        ) : (
          <p className="text-xs text-zinc-500">Memuat performa…</p>
        )}
      </Panel>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "red" | "amber" | "success" | "chrome";
}) {
  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase text-zinc-400">{label}</p>
        <span className="text-zinc-400">{icon}</span>
      </div>
      <p className="mt-1 font-[var(--garage-font-display)] text-2xl font-black text-zinc-50">{value}</p>
      <Badge tone={tone} className="mt-2">
        {tone === "red" ? "perhatian" : tone === "amber" ? "ramai" : "aman"}
      </Badge>
    </div>
  );
}

function StationCard({
  title,
  icon,
  active,
  tickets,
}: {
  title: string;
  icon: React.ReactNode;
  active: number;
  tickets: Ticket[];
}) {
  const queue = tickets.filter((t) => t.status === "queue").length;
  const cooking = tickets.filter((t) => t.status === "cooking").length;
  const ready = tickets.filter((t) => t.status === "ready").length;
  const top = tickets.slice(0, 5);
  return (
    <Panel
      title={title}
      subtitle={`${active} tiket aktif`}
      actions={<span className="text-zinc-400">{icon}</span>}
    >
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Antri" value={queue} />
        <MiniStat label="Masak" value={cooking} />
        <MiniStat label="Ready" value={ready} icon={<CheckCircle2 className="h-3 w-3" />} />
      </div>
      <div className="mt-3 space-y-1">
        {top.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-3 py-1.5 text-[11px]"
          >
            <div className="min-w-0">
              <p className="font-mono text-zinc-200">{t.id} · {t.table}</p>
              <p className="truncate text-[10px] text-zinc-500">
                {t.items.map((i) => `${i.qty ?? 1}× ${i.name ?? "?"}`).join(", ") || "—"}
              </p>
            </div>
            <div className="text-right">
              <p className={`font-mono text-[11px] ${t.elapsed > t.targetMinutes ? "text-[#ffb1b1]" : "text-zinc-200"}`}>
                {t.elapsed}m
              </p>
              <p className="text-[9px] uppercase text-zinc-500">{t.status}</p>
            </div>
          </div>
        ))}
        {tickets.length === 0 && (
          <p className="rounded-md border border-white/5 bg-[var(--garage-bg-3)] px-3 py-2 text-center text-[11px] text-zinc-500">
            <TrendingUp className="mr-1 inline h-3 w-3" /> Station kosong
          </p>
        )}
      </div>
    </Panel>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-white/10 bg-[var(--garage-bg-3)] p-2 text-center">
      <p className="text-[9px] font-semibold uppercase text-zinc-400">
        {icon ? <span className="mr-1 inline-block align-middle">{icon}</span> : null}
        {label}
      </p>
      <p className="mt-0.5 font-[var(--garage-font-display)] text-base font-bold text-zinc-50">{value}</p>
    </div>
  );
}
