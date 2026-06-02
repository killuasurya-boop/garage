"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { RadialProgressChart } from "@/components/ceo/charts/RadialProgressChart";
import { RiskAlertCard } from "@/components/ceo/cards/RiskAlertCard";
import { Badge } from "@/components/ceo/ui/Badge";
import { complianceChecklist, riskAlerts, type Severity } from "@/components/ceo/data/mockData";
import { Brain, Check, XCircle } from "lucide-react";

const levels: (Severity | "all")[] = ["all", "critical", "high", "medium", "low"];
const levelLabel: Record<(typeof levels)[number], string> = {
  all: "semua",
  critical: "kritis",
  high: "tinggi",
  medium: "sedang",
  low: "rendah",
};

function quadrant(prob: number, impact: number) {
  const p = prob >= 0.5 ? 1 : 0;
  const i = impact >= 0.5 ? 1 : 0;
  return p * 2 + i; // 0..3
}

export default function RiskCenterPage() {
  const [filter, setFilter] = useState<(typeof levels)[number]>("all");
  const filtered = useMemo(() => (filter === "all" ? riskAlerts : riskAlerts.filter((r) => r.level === filter)), [filter]);

  // Risk matrix: 2x2 (low/high probability x low/high impact)
  const matrix = useMemo(() => {
    const buckets: { label: string; items: typeof riskAlerts }[] = [
      { label: "Peluang rendah - dampak rendah", items: [] },
      { label: "Peluang rendah - dampak tinggi", items: [] },
      { label: "Peluang tinggi - dampak rendah", items: [] },
      { label: "Peluang tinggi - dampak tinggi", items: [] },
    ];
    for (const r of riskAlerts) buckets[quadrant(r.probability, r.impact)].items.push(r);
    return buckets;
  }, []);

  const overallScore = Math.round(
    100 - (riskAlerts.reduce((acc, r) => acc + r.probability * r.impact * 25, 0) / riskAlerts.length),
  );

  return (
    <div className="space-y-5">
      <PageHeader kicker="Risiko" title="Risk Control GARAGE" subtitle="Postur risiko, matrix, compliance, dan alert owner." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Skor Risiko Overall" subtitle="Semakin tinggi semakin aman">
          <div className="flex flex-col items-center justify-center py-3">
            <RadialProgressChart
              value={overallScore}
              label="Aman"
              accent={overallScore >= 70 ? "var(--garage-success)" : overallScore >= 50 ? "var(--garage-amber)" : "var(--garage-red-bright)"}
              size={200}
            />
            <p className="mt-2 text-xs text-zinc-400">
              {riskAlerts.filter((r) => r.level === "critical").length} kritis - {riskAlerts.filter((r) => r.level === "high").length} tinggi
            </p>
          </div>
        </Panel>

        <Panel title="Matrix Risiko" subtitle="Peluang x dampak" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2">
            {matrix.map((q, idx) => {
              const tone = idx === 3 ? "red" : idx === 1 || idx === 2 ? "amber" : "success";
              const bg =
                idx === 3
                  ? "bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)]"
                  : idx === 1 || idx === 2
                    ? "bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)]"
                    : "bg-emerald-500/12";
              return (
                <div key={q.label} className={`min-h-[140px] rounded-lg border border-white/10 p-3 ${bg}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase text-zinc-300">{q.label}</p>
                    <Badge tone={tone as "red" | "amber" | "success"}>{q.items.length}</Badge>
                  </div>
                  <ul className="space-y-1 text-[11px] text-zinc-200">
                    {q.items.length === 0 ? <li className="text-zinc-500">Belum ada item</li> : q.items.map((r) => (
                      <li key={r.id} className="truncate">- {r.title}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel
        title="Semua Alert"
        subtitle="Filter berdasarkan severity"
        actions={
          <div className="flex flex-wrap items-center gap-1">
            {levels.map((l) => (
              <button
                key={l}
                onClick={() => setFilter(l)}
                className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase transition ${
                  filter === l
                    ? "border-[color-mix(in_srgb,var(--garage-red)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)] text-[#ffd0d0]"
                    : "border-white/10 bg-[var(--garage-bg-3)] text-zinc-300 hover:bg-[var(--garage-bg-1)]"
                }`}
              >
                {levelLabel[l]}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-zinc-500">Belum ada alert pada severity ini.</p>
          ) : (
            filtered.map((r) => <RiskAlertCard key={r.id} alert={r} />)
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Checklist Compliance" subtitle="Item wajib operasional">
          <ul className="space-y-2">
            {complianceChecklist.map((c) => {
              const passed = c.status === "passed";
              return (
                <li key={c.item} className="flex items-center justify-between rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-2.5">
                  <span className="flex items-center gap-2 text-xs text-zinc-200">
                    {passed ? <Check className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-amber-300" />}
                    {c.item}
                  </span>
                  <Badge tone={passed ? "success" : "amber"}>{passed ? "aman" : "pending"}</Badge>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Alert Prediktif" subtitle="Risiko dekat yang dibaca AI">
          <ul className="space-y-2">
            {[
              { title: "Selisih kas naik - berpotensi tembus batas dalam 6 hari", confidence: 72 },
              { title: "Risiko stok biji kopi kurang untuk 10 hari ke depan", confidence: 64 },
              { title: "Risiko attrition staff naik di tim Marketing", confidence: 58 },
              { title: "CAC marketing bisa lewat Rp 220rb akhir bulan", confidence: 51 },
            ].map((p) => (
              <li key={p.title} className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)]">
                    <Brain className="h-4 w-4 text-[#ffd8a8]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-100">{p.title}</p>
                    <p className="mt-1 text-[10px] uppercase text-zinc-500">
                      Confidence <span className="font-mono text-amber-300">{p.confidence}%</span>
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
