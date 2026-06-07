"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  RefreshCw,
  Rocket,
} from "lucide-react";

type Check = {
  id: string;
  label: string;
  description: string;
  target: number;
  actual: number;
  href: string;
  weight?: number;
  ok: boolean;
  manual?: boolean;
};

type OperationalGroup = {
  id: string;
  title: string;
  description: string;
  done: number;
  total: number;
  ready: boolean;
  items: Check[];
};

type Report = {
  generatedAt: string;
  progressPct: number;
  ready: boolean;
  checks: Check[];
  operationalProgressPct?: number;
  operationalReady?: boolean;
  evidenceSummary?: {
    readiness: {
      generatedAt: string;
      status: "GO" | "CONDITIONAL GO" | "NO-GO";
      pass: number;
      warn: number;
      fail: number;
    } | null;
    finalMvpUat: {
      generatedAt: string;
      passCount: number;
      total: number;
    } | null;
  };
  operationalGroups?: OperationalGroup[];
};

export default function OnboardingPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/onboarding", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: Report };
      setReport(json.data ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat onboarding");
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(async () => {
      await refresh();
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Onboarding"
        title="Setup Go-Live"
        subtitle="Checklist supaya Garage OS siap dipakai operasional."
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

      {/* Progress */}
      <div
        className={`rounded-lg border p-5 ${
          report?.ready
            ? "border-[color-mix(in_srgb,var(--garage-success)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-success)_8%,transparent)]"
            : "border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_8%,transparent)]"
        }`}
      >
        <div className="flex items-center gap-3">
          <Rocket
            className={`h-6 w-6 shrink-0 ${
              report?.ready ? "text-[#a8f0c4]" : "text-[#ffd8a8]"
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase text-zinc-400">Progress</p>
              <p className="font-mono text-lg font-bold text-zinc-50">
                {report?.progressPct ?? 0}%
              </p>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-all ${
                  report?.ready ? "bg-[var(--garage-success)]" : "bg-[var(--garage-amber)]"
                }`}
                style={{ width: `${report?.progressPct ?? 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-300">
              {report?.ready
                ? "✓ Garage OS siap go-live."
                : `${report?.checks.filter((c) => c.ok).length ?? 0}/${report?.checks.length ?? 0} checklist selesai — lanjutkan item di bawah.`}
            </p>
          </div>
        </div>
      </div>

      <Panel title="Checklist Setup" subtitle="Klik tiap baris untuk pergi ke modul terkait">
        {loading && <p className="text-xs text-zinc-500">Memuat…</p>}
        <ul className="space-y-2">
          {report?.checks.map((c) => {
            const internal = c.href.startsWith("/");
            const inner = (
              <div
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition ${
                  c.ok
                    ? "border-[color-mix(in_srgb,var(--garage-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--garage-success)_6%,transparent)]"
                    : "border-white/10 bg-[var(--garage-bg-3)] hover:border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)]"
                }`}
              >
                {c.ok ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#a8f0c4]" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-zinc-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-100">{c.label}</p>
                  <p className="text-[11px] text-zinc-400">{c.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[11px] text-zinc-400">
                    {c.actual}/{c.target}
                  </span>
                  {c.manual && <Badge tone="info">manual</Badge>}
                  {c.ok ? <Badge tone="success">selesai</Badge> : <Badge tone="amber">to-do</Badge>}
                  {internal && <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />}
                </div>
              </div>
            );
            return (
              <li key={c.id}>
                {internal ? (
                  <Link href={c.href}>{inner}</Link>
                ) : (
                  <a href={c.href} target="_blank" rel="noreferrer">
                    {inner}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title="Checklist MVP Operasional"
        subtitle="Acuan final sampai GARAGE siap dipakai 1 shift operasional nyata"
      >
        <div className="mb-4 rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-zinc-500">
                Progress operasional
              </p>
              <p className="mt-1 text-sm text-zinc-300">
                Selesai jika QR/POS ke Kitchen, Waiter, Kasir, Receipt, bersih meja, report, dan backup berjalan end-to-end.
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-2xl font-black text-zinc-50">
                {report?.operationalProgressPct ?? 0}%
              </p>
              {report?.operationalReady ? (
                <Badge tone="success">MVP siap</Badge>
              ) : (
                <Badge tone="amber">butuh UAT</Badge>
              )}
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full transition-all ${
                report?.operationalReady
                  ? "bg-[var(--garage-success)]"
                  : "bg-[var(--garage-amber)]"
              }`}
              style={{ width: `${report?.operationalProgressPct ?? 0}%` }}
            />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-black/10 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-zinc-500">
                Readiness audit terakhir
              </p>
              {report?.evidenceSummary?.readiness ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      report.evidenceSummary.readiness.status === "GO"
                        ? "success"
                        : report.evidenceSummary.readiness.status === "NO-GO"
                          ? "red"
                          : "amber"
                    }
                  >
                    {report.evidenceSummary.readiness.status}
                  </Badge>
                  <span className="font-mono text-[11px] text-zinc-400">
                    {report.evidenceSummary.readiness.pass} pass /
                    {report.evidenceSummary.readiness.warn} warn /
                    {report.evidenceSummary.readiness.fail} fail
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500">
                  Belum ada report. Jalankan <code>npm.cmd run readiness:audit</code>.
                </p>
              )}
            </div>
            <div className="rounded-md border border-white/10 bg-black/10 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-zinc-500">
                Final MVP API UAT terakhir
              </p>
              {report?.evidenceSummary?.finalMvpUat ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      report.evidenceSummary.finalMvpUat.passCount ===
                      report.evidenceSummary.finalMvpUat.total
                        ? "success"
                        : "amber"
                    }
                  >
                    {report.evidenceSummary.finalMvpUat.passCount}/
                    {report.evidenceSummary.finalMvpUat.total} PASS
                  </Badge>
                  <span className="font-mono text-[11px] text-zinc-400">
                    {new Date(report.evidenceSummary.finalMvpUat.generatedAt).toLocaleString("id-ID")}
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500">
                  Belum ada report. Jalankan <code>npm.cmd run final-mvp:uat</code>.
                </p>
              )}
            </div>
          </div>
        </div>

        {loading && <p className="text-xs text-zinc-500">Memuat checklist MVP...</p>}
        <div className="grid gap-3 xl:grid-cols-2">
          {report?.operationalGroups?.map((group) => (
            <div
              key={group.id}
              className={`rounded-lg border p-4 ${
                group.ready
                  ? "border-[color-mix(in_srgb,var(--garage-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--garage-success)_5%,transparent)]"
                  : "border-white/10 bg-[var(--garage-bg-3)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-100">{group.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                    {group.description}
                  </p>
                </div>
                <Badge tone={group.ready ? "success" : "amber"}>
                  {group.done}/{group.total}
                </Badge>
              </div>

              <ul className="mt-3 space-y-2">
                {group.items.map((item) => {
                  const internal = item.href.startsWith("/");
                  const inner = (
                    <div
                      className={`flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-left transition ${
                        item.ok
                          ? "border-[color-mix(in_srgb,var(--garage-success)_25%,transparent)] bg-[color-mix(in_srgb,var(--garage-success)_6%,transparent)]"
                          : "border-white/10 bg-black/10 hover:border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)]"
                      }`}
                    >
                      {item.ok ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#a8f0c4]" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-zinc-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-zinc-200">
                          {item.label}
                        </p>
                        <p className="font-mono text-[10px] text-zinc-500">
                          {item.actual}/{item.target}
                        </p>
                      </div>
                      {item.manual && <Badge tone="info">manual</Badge>}
                      {internal && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />}
                    </div>
                  );

                  return (
                    <li key={item.id}>
                      {internal ? (
                        <Link href={item.href}>{inner}</Link>
                      ) : (
                        <a href={item.href} target="_blank" rel="noreferrer">
                          {inner}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Catatan Manual" subtitle="Hal yang tidak bisa di-detect otomatis">
        <ul className="ml-4 list-disc space-y-1 text-xs text-zinc-400">
          <li>
            <strong>Backup DB</strong>: jalankan <code>npm run backup</code> manual atau pasang
            cron/Task Scheduler di host. Setelah berjalan, anggap item ✓.
          </li>
          <li>
            <strong>Permission matrix</strong>: jalankan <code>npm run check:permissions</code> di
            terminal. Output ✓ berarti semua role aman.
          </li>
          <li>
            <strong>Thermal printer</strong>: test 1 receipt nyata dari POS sebelum opening.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
