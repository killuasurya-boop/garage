"use client";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { SalesFunnelChart } from "@/components/ceo/charts/SalesFunnelChart";
import { HBarChart } from "@/components/ceo/charts/HBarChart";
import { Badge } from "@/components/ceo/ui/Badge";
import { departmentSatisfaction, hiringFunnel, hrMetrics } from "@/components/ceo/data/mockData";
import { Users2, Smile, UserCheck, UserPlus, UserMinus, GraduationCap } from "lucide-react";
import { TeamLeaderboardWidget } from "@/components/garage/admin/team-leaderboard";

const kpis = [
  { label: "Jumlah Staff", value: String(hrMetrics.headcount), icon: Users2, tone: "success" as const, change: "+3 bulan ini" },
  { label: "Kehadiran", value: `${hrMetrics.attendanceRate}%`, icon: UserCheck, tone: "success" as const, change: "+1.2 pts" },
  { label: "Kepuasan", value: `${hrMetrics.satisfaction} / 5`, icon: Smile, tone: "success" as const, change: "+0.2" },
  { label: "Posisi Kosong", value: String(hrMetrics.openRoles), icon: UserPlus, tone: "amber" as const, change: "2 kritis" },
  { label: "Attrition (12b)", value: `${hrMetrics.attritionRate}%`, icon: UserMinus, tone: "amber" as const, change: "+0.8 pts" },
  { label: "Training Pending", value: String(hrMetrics.pendingTraining), icon: GraduationCap, tone: "amber" as const, change: "jatuh tempo 7h" },
];

function HeatmapCell({ score }: { score: number }) {
  const t = Math.max(0, Math.min(1, (score - 3) / 1.5));
  const bg = `color-mix(in srgb, var(--garage-success) ${Math.round(t * 60 + 12)}%, var(--garage-bg-3))`;
  return (
    <div
      className="flex h-12 items-center justify-center rounded-md border border-white/10 text-xs font-bold text-zinc-50"
      style={{ background: bg }}
    >
      {score.toFixed(1)}
    </div>
  );
}

const teamPerformance = [
  { team: "POS / Bar", value: 92 },
  { team: "Dapur", value: 88 },
  { team: "Stok", value: 74 },
  { team: "Keuangan", value: 86 },
  { team: "Tim", value: 81 },
  { team: "Marketing", value: 79 },
];

export default function HRTeamPage() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Tim" title="Kontrol SDM GARAGE" subtitle="Kehadiran, training, hiring, dan performa staff." />

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
        <Panel title="Pipeline Hiring" subtitle="Melamar sampai diterima" className="lg:col-span-2">
          <SalesFunnelChart data={hiringFunnel} />
        </Panel>
        <Panel title="Kepuasan Divisi" subtitle="Skor / 5 - survey terakhir">
          <div className="grid grid-cols-2 gap-2">
            {departmentSatisfaction.map((d) => (
              <div key={d.dept} className="space-y-1">
                <p className="truncate text-[10px] uppercase text-zinc-400">{d.dept}</p>
                <HeatmapCell score={d.score} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 mt-5">
        <Panel title="Perbandingan Performa Tim" subtitle="Skor / 100" className="lg:col-span-2">
          <HBarChart data={teamPerformance} categoryKey="team" valueKey="value" formatValue={(v) => `${v}`} />
        </Panel>
        <Panel title="Staff Leaderboard" subtitle="Gamifikasi Performa Karyawan (KPI & Kecepatan)">
          <TeamLeaderboardWidget />
        </Panel>
      </div>
    </div>
  );
}
