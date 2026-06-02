"use client";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { KPICard } from "@/components/ceo/cards/KPICard";
import { RevenueChart } from "@/components/ceo/charts/RevenueChart";
import { GroupedBarChart } from "@/components/ceo/charts/GroupedBarChart";
import { RadialProgressChart } from "@/components/ceo/charts/RadialProgressChart";
import { RiskAlertCard } from "@/components/ceo/cards/RiskAlertCard";
import { DataTable, type Column } from "@/components/ceo/tables/DataTable";
import { Badge } from "@/components/ceo/ui/Badge";
import { budgetVsActual, kpiData, riskAlerts } from "@/components/ceo/data/mockData";

type CostRow = { name: string; budget: number; actual: number; variance: number };

const fmtIdr = (v: number) => `Rp ${(v / 1_000_000).toFixed(2)}jt`;

export default function FinancialPage() {
  const finKpis = kpiData.filter((k) => ["totalRevenue", "profitMargin", "cashFlow", "burnRate"].includes(k.key));

  const costRows: CostRow[] = budgetVsActual.map((b) => ({
    name: b.name,
    budget: b.budget,
    actual: b.actual,
    variance: ((b.actual - b.budget) / b.budget) * 100,
  }));

  const costCols: Column<CostRow>[] = [
    { key: "name", header: "Pos Biaya", sortable: true },
    { key: "budget", header: "Rencana", align: "right", sortable: true, render: (r) => fmtIdr(r.budget) },
    { key: "actual", header: "Aktual", align: "right", sortable: true, render: (r) => fmtIdr(r.actual) },
    {
      key: "variance",
      header: "Selisih",
      align: "right",
      sortable: true,
      render: (r) => (
        <Badge tone={r.variance > 5 ? "red" : r.variance > 0 ? "amber" : "success"}>{r.variance.toFixed(1)}%</Badge>
      ),
    },
  ];

  const finRisks = riskAlerts.filter((r) => r.department === "Keuangan" || r.department === "Pembelian");

  return (
    <div className="space-y-5">
      <PageHeader kicker="Keuangan" title="Kontrol Finance GARAGE" subtitle="Omzet, HPP, biaya operasional, kas, settlement, dan approval owner." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {finKpis.map(({ key, ...k }) => (
          <KPICard key={key} {...k} />
        ))}
      </div>

      <Panel title="Omzet vs Biaya" subtitle="Pantauan tahun berjalan">
        <RevenueChart />
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Rencana vs Aktual" subtitle="Pos biaya bulan ini" className="lg:col-span-2">
          <GroupedBarChart
            data={budgetVsActual}
            xKey="name"
            series={[
              { key: "budget", name: "Rencana", color: "var(--garage-silver)" },
              { key: "actual", name: "Aktual", color: "var(--garage-red-bright)" },
            ]}
            formatValue={(v) => `${(v / 1_000_000).toFixed(1)}jt`}
          />
        </Panel>
        <Panel title="Kas & Settlement" subtitle="Cadangan kas operasional">
          <div className="flex flex-col items-center justify-center py-3">
            <RadialProgressChart value={62} label="Kas aman" unit="%" accent="var(--garage-success)" size={180} />
            <p className="mt-2 text-center text-xs text-zinc-400">
              Estimasi <span className="font-mono text-zinc-100">14.8 bulan</span> pada biaya jalan sekarang.
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Ringkasan P&L" subtitle="Bahasa owner, siap dibaca cepat" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "Omzet", value: "Rp 12.48 jt", tone: "success" as const },
              { label: "HPP", value: "Rp 4.41 jt", tone: "amber" as const },
              { label: "Biaya Operasional", value: "Rp 2.89 jt", tone: "amber" as const },
              { label: "Laba Bersih", value: "Rp 5.18 jt", tone: "success" as const },
              { label: "Margin Bersih", value: "34.2%", tone: "success" as const },
              { label: "Settlement", value: "Rp 6.02 jt", tone: "success" as const },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-4">
                <p className="text-[10px] font-semibold uppercase text-zinc-400">{c.label}</p>
                <p className="mt-1 font-[var(--garage-font-display)] text-xl font-black text-zinc-50">{c.value}</p>
                <Badge tone={c.tone} className="mt-2">aman</Badge>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Alert Finance" subtitle="Auto-flag dari kas dan pembelian">
          <div className="space-y-2">
            {finRisks.length === 0 ? (
              <p className="text-xs text-zinc-500">Belum ada alert finance atau pembelian.</p>
            ) : (
              finRisks.map((r) => <RiskAlertCard key={r.id} alert={r} />)
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Rincian Biaya Operasional" subtitle="Selisih > 5% masuk Approval Owner">
        <DataTable rows={costRows} columns={costCols} pageSize={5} searchableKeys={["name"]} />
      </Panel>
    </div>
  );
}
