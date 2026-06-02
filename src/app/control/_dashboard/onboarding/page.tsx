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
  weight: number;
  ok: boolean;
  manual?: boolean;
};

type Report = {
  generatedAt: string;
  progressPct: number;
  ready: boolean;
  checks: Check[];
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
