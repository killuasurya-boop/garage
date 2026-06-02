"use client";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { GenericAreaChart } from "@/components/ceo/charts/GenericAreaChart";
import { DonutChart } from "@/components/ceo/charts/DonutChart";
import { RadialProgressChart } from "@/components/ceo/charts/RadialProgressChart";
import { HBarChart } from "@/components/ceo/charts/HBarChart";
import { Badge } from "@/components/ceo/ui/Badge";
import { activeUsersTrend, clvBySegment, customerMetrics, customerSegments } from "@/components/ceo/data/mockData";
import { Users, MessageCircle, Smile, Activity, HeartHandshake, AlertOctagon } from "lucide-react";

const kpis = [
  { label: "Pelanggan Aktif (30h)", value: customerMetrics.activeUsers.toLocaleString("id-ID"), icon: Users, tone: "success" as const, change: "+8.4%" },
  { label: "NPS", value: String(customerMetrics.nps), icon: Smile, tone: "success" as const, change: "+5 pts" },
  { label: "CSAT", value: `${customerMetrics.csat}%`, icon: HeartHandshake, tone: "success" as const, change: "+1.2 pts" },
  { label: "Churn (30h)", value: `${customerMetrics.churnRate}%`, icon: AlertOctagon, tone: "amber" as const, change: "+0.4 pts" },
  { label: "Tiket Terbuka", value: String(customerMetrics.supportOpen), icon: MessageCircle, tone: "amber" as const, change: "3 risiko SLA" },
  { label: "Support SLA", value: `${customerMetrics.supportSla}%`, icon: Activity, tone: "success" as const, change: "+2 pts" },
];

export default function CustomersPage() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Pelanggan" title="Customer Intelligence GARAGE" subtitle="Basis pelanggan, sentiment, segmentasi, dan support." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase text-zinc-400">{k.label}</p>
                <Icon className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-1 font-[var(--garage-font-display)] text-xl font-black text-zinc-50">{k.value}</p>
              <Badge tone={k.tone} className="mt-2">{k.change}</Badge>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Tren Pelanggan Aktif" subtitle="8 minggu terakhir" className="lg:col-span-2">
          <GenericAreaChart data={activeUsersTrend} xKey="week" yKey="users" color="var(--garage-red-bright)" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
        </Panel>
        <Panel title="Churn Rate" subtitle="Rolling 30 hari">
          <div className="flex flex-col items-center justify-center py-3">
            <RadialProgressChart value={customerMetrics.churnRate * 10} unit="%" label="Churn x 10" accent="var(--garage-red-bright)" size={170} />
            <p className="mt-2 text-xs text-zinc-400">
              Net retention <span className="font-mono text-emerald-300">+12.4%</span>
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Segmentasi Pelanggan" subtitle="Porsi pelanggan aktif">
          <DonutChart data={customerSegments} centerLabel="Langganan" centerValue="48%" />
        </Panel>
        <Panel title="CLV per Segment" subtitle="Nilai pelanggan (Rp)" className="lg:col-span-2">
          <HBarChart
            data={clvBySegment}
            categoryKey="segment"
            valueKey="clv"
            formatValue={(v) => `${(v / 1_000_000).toFixed(1)}jt`}
          />
        </Panel>
      </div>

      <Panel title="Status Tiket Support" subtitle="24 jam terakhir">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Terbuka", value: "14", tone: "amber" as const },
            { label: "Diproses", value: "9", tone: "chrome" as const },
            { label: "Selesai", value: "48", tone: "success" as const },
            { label: "Eskalasi", value: "2", tone: "red" as const },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3">
              <p className="text-[10px] font-semibold uppercase text-zinc-400">{s.label}</p>
              <p className="mt-1 font-[var(--garage-font-display)] text-2xl font-black text-zinc-50">{s.value}</p>
              <Badge tone={s.tone} className="mt-2">tiket</Badge>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
