"use client";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { SalesFunnelChart } from "@/components/ceo/charts/SalesFunnelChart";
import { HBarChart } from "@/components/ceo/charts/HBarChart";
import { GenericAreaChart } from "@/components/ceo/charts/GenericAreaChart";
import { DataTable, type Column } from "@/components/ceo/tables/DataTable";
import { Badge } from "@/components/ceo/ui/Badge";
import { channelData, revenueData, topDeals, type Deal } from "@/components/ceo/data/mockData";
import { TrendingUp, Target, Coins, Activity } from "lucide-react";

const kpiCards = [
  { label: "Nilai Pipeline", value: "Rp 209 jt", change: "+12.4%", tone: "success" as const, icon: Coins },
  { label: "Deal Rate", value: "32%", change: "+1.8 pts", tone: "success" as const, icon: Target },
  { label: "CAC", value: "Rp 184 rb", change: "+6.2%", tone: "amber" as const, icon: TrendingUp },
  { label: "LTV", value: "Rp 4.8 jt", change: "+3.1%", tone: "success" as const, icon: Activity },
  { label: "ROAS", value: "4.2x", change: "+0.3", tone: "success" as const, icon: Target },
];

const campaigns = [
  { name: "Promo Es Kopi Aren", channel: "Sosial", spend: 4_200_000, leads: 820, conv: 7.4, roas: 5.1 },
  { name: "Office Pantry Pilot", channel: "Email", spend: 1_800_000, leads: 312, conv: 14.4, roas: 6.2 },
  { name: "Weekend Cashback", channel: "Iklan", spend: 6_800_000, leads: 1_240, conv: 4.8, roas: 3.4 },
  { name: "Referral Rewards", channel: "Referral", spend: 900_000, leads: 218, conv: 18.3, roas: 8.1 },
  { name: "SEO Long-tail", channel: "Organik", spend: 1_200_000, leads: 1_680, conv: 9.1, roas: 12.6 },
];

const conversionTrend = revenueData.map((r, i) => ({ month: r.month, rate: 22 + Math.sin(i / 2) * 4 + i * 0.5 }));

const campaignCols: Column<(typeof campaigns)[number]>[] = [
  { key: "name", header: "Campaign", sortable: true },
  { key: "channel", header: "Channel", render: (r) => <Badge tone="chrome">{r.channel}</Badge> },
  { key: "spend", header: "Biaya", align: "right", sortable: true, render: (r) => `Rp ${(r.spend / 1_000_000).toFixed(1)}jt` },
  { key: "leads", header: "Prospek", align: "right", sortable: true },
  { key: "conv", header: "Conv %", align: "right", sortable: true, render: (r) => `${r.conv.toFixed(1)}%` },
  { key: "roas", header: "ROAS", align: "right", sortable: true, render: (r) => <Badge tone={r.roas > 5 ? "success" : r.roas > 3 ? "amber" : "red"}>{r.roas.toFixed(1)}x</Badge> },
];

const stageLabel: Record<Deal["stage"], string> = {
  Qualified: "Terseleksi",
  Proposal: "Penawaran",
  Negotiation: "Negosiasi",
  "Closed Won": "Deal",
  "Closed Lost": "Batal",
};

const dealCols: Column<Deal>[] = [
  { key: "name", header: "Deal", sortable: true },
  { key: "company", header: "Akun" },
  { key: "stage", header: "Tahap", render: (r) => <Badge tone={r.stage === "Closed Won" ? "success" : r.stage === "Negotiation" ? "amber" : "chrome"}>{stageLabel[r.stage]}</Badge> },
  { key: "value", header: "Nilai", align: "right", sortable: true, render: (r) => `Rp ${(r.value / 1_000_000).toFixed(1)}jt` },
  { key: "probability", header: "Deal %", align: "right", sortable: true, render: (r) => `${r.probability}%` },
];

export default function SalesPage() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Penjualan" title="Kontrol Sales GARAGE" subtitle="Funnel, channel, campaign, dan deal korporat." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((k) => {
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
        <Panel title="Funnel Pipeline" subtitle="Dari prospek sampai deal" className="lg:col-span-2">
          <SalesFunnelChart />
        </Panel>
        <Panel title="Channel Teratas" subtitle="Porsi prospek (%)">
          <HBarChart data={channelData} categoryKey="channel" valueKey="value" formatValue={(v) => `${v}%`} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Tren Conversion Rate" subtitle="Prospek ke peluang" className="lg:col-span-2">
          <GenericAreaChart data={conversionTrend} xKey="month" yKey="rate" color="var(--garage-success)" formatValue={(v) => `${v.toFixed(0)}%`} />
        </Panel>
        <Panel title="Snapshot Deal Aktif">
          <DataTable rows={topDeals.slice(0, 6)} columns={dealCols} pageSize={6} />
        </Panel>
      </div>

      <Panel title="Performa Campaign">
        <DataTable rows={campaigns} columns={campaignCols} pageSize={5} searchableKeys={["name", "channel"]} />
      </Panel>
    </div>
  );
}
