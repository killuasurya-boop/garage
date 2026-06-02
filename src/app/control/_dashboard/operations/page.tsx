"use client";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { RadialProgressChart } from "@/components/ceo/charts/RadialProgressChart";
import { DonutChart } from "@/components/ceo/charts/DonutChart";
import { DataTable, type Column } from "@/components/ceo/tables/DataTable";
import { Badge } from "@/components/ceo/ui/Badge";
import { RiskAlertCard } from "@/components/ceo/cards/RiskAlertCard";
import { departmentPerformance, projectProgress, riskAlerts } from "@/components/ceo/data/mockData";

const resourceMix = [
  { name: "Produksi", value: 38, color: "var(--garage-red-bright)" },
  { name: "Service", value: 28, color: "var(--garage-amber)" },
  { name: "Stok", value: 18, color: "var(--garage-silver)" },
  { name: "Admin", value: 16, color: "color-mix(in srgb, var(--garage-red) 68%, black)" },
];

type Project = (typeof projectProgress)[number];

const projCols: Column<Project>[] = [
  { key: "project", header: "Project", sortable: true },
  { key: "owner", header: "Owner" },
  {
    key: "progress",
    header: "Progress",
    align: "right",
    sortable: true,
    render: (r) => (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{
              width: `${r.progress}%`,
              background:
                r.status === "Aman"
                  ? "var(--garage-success)"
                  : r.status === "Perlu perhatian"
                    ? "var(--garage-amber)"
                    : "var(--garage-red-bright)",
            }}
          />
        </div>
        <span className="font-mono text-xs text-zinc-200">{r.progress}%</span>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <Badge tone={r.status === "Aman" ? "success" : r.status === "Perlu perhatian" ? "amber" : "red"}>{r.status}</Badge>
    ),
  },
];

export default function OperationsPage() {
  const opsRisks = riskAlerts.filter((r) => ["Stok", "Operasional", "Pembelian"].includes(r.department));
  return (
    <div className="space-y-5">
      <PageHeader kicker="Operasional" title="Kontrol Operasional GARAGE" subtitle="Performa divisi, project, SLA, dan bottleneck outlet." />

      <Panel title="Performa Divisi" subtitle="Skor vs target">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
          {departmentPerformance.map((d) => (
            <div key={d.dept} className="flex flex-col items-center rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3">
              <RadialProgressChart
                value={d.score}
                label={d.dept}
                accent={d.score >= d.target ? "var(--garage-success)" : d.score >= d.target - 8 ? "var(--garage-amber)" : "var(--garage-red-bright)"}
                size={120}
              />
              <p className="mt-1 text-[10px] uppercase text-zinc-500">target {d.target}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Progress Project" subtitle="Inisiatif aktif" className="lg:col-span-2">
          <DataTable rows={projectProgress} columns={projCols} pageSize={5} searchableKeys={["project", "owner"]} />
        </Panel>
        <Panel title="Alokasi Resource" subtitle="Pembagian tenaga kerja">
          <DonutChart data={resourceMix} centerLabel="Teralokasi" centerValue="100%" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Status SLA" subtitle="Minggu ini" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Order ke serve", value: "4m 12s", tone: "success" as const },
              { label: "Rata-rata dapur", value: "6m 04s", tone: "amber" as const },
              { label: "Replenish stok", value: "92%", tone: "success" as const },
              { label: "Rekon kas", value: "98%", tone: "success" as const },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-400">{s.label}</p>
                <p className="mt-1 font-[var(--garage-font-display)] text-lg font-black text-zinc-50">{s.value}</p>
                <Badge tone={s.tone} className="mt-2">SLA</Badge>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Alert Bottleneck" subtitle="Auto-flag operasional">
          <div className="space-y-2">
            {opsRisks.length === 0 ? (
              <p className="text-xs text-zinc-500">Belum ada bottleneck aktif.</p>
            ) : (
              opsRisks.map((r) => <RiskAlertCard key={r.id} alert={r} />)
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
