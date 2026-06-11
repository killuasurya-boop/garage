"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ChefHat,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

type Brief = {
  generatedAt: string;
  headline: string;
  revenueToday: number;
  attendance: { present: number; absent: number; lateIn: number; totalStaff: number };
  inventory: {
    lowCount: number;
    lowItems: Array<{ sku: string; name: string; onHand: number; min: number; unit: string }>;
  };
  kitchen: {
    activeTickets: number;
    lateTickets: number;
    lateList: Array<{
      ticketNo: string;
      station: string;
      status: string;
      tableLabel: string;
      elapsed: number;
      overBy: number;
    }>;
  };
  approvals?: { pending?: number; pendingHighRisk?: number } | null;
  audit?: { eventsToday?: number; criticalToday?: number; warningsToday?: number } | null;
  finance?: { guard?: { level?: string; healthScore?: number; brief?: string } } | null;
  recommendedActions: Array<{ label: string; severity: "info" | "warn" | "danger"; href?: string }>;
};

const compact = (n: number) => {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return `Rp ${Math.round(n)}`;
};

const timeFmt = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export default function BriefingPage() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/daily-brief", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: Brief };
      setBrief(json.data ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat briefing");
    }
  }, []);

  useEffect(() => {
    const id0 = window.setTimeout(async () => {
      await refresh();
      setLoading(false);
    }, 0);
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearTimeout(id0);
      window.clearInterval(id);
    };
  }, [refresh]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Daily Owner Briefing"
        title="Ringkasan Harian"
        subtitle={brief ? `Diperbarui ${timeFmt.format(new Date(brief.generatedAt))}` : "Memuat…"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/owner/daily-brief/export?format=pdf"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_12%,transparent)] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#ffd8a8] hover:bg-[color-mix(in_srgb,var(--garage-amber)_20%,transparent)]"
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </a>
            <a
              href="/api/owner/daily-brief/export?format=xlsx"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </a>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Segarkan
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_12%,transparent)] p-3 text-xs text-[#ffb1b1]">
          {error}
        </div>
      )}

      {/* Headline panel */}
      <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--garage-amber)_10%,transparent)] to-transparent p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 h-5 w-5 shrink-0 text-[#ffd8a8]" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase text-[#ffd8a8]">Headline</p>
            <p className="mt-1 font-[var(--garage-font-display)] text-base font-semibold leading-relaxed text-zinc-50 sm:text-lg">
              {brief?.headline ?? (loading ? "Menyusun briefing…" : "—")}
            </p>
          </div>
        </div>
      </div>

      {/* Recommended actions */}
      {brief && brief.recommendedActions.length > 0 && (
        <Panel title="Rekomendasi Tindakan" subtitle="Prioritas berdasarkan sinyal hari ini">
          <ul className="space-y-2">
            {brief.recommendedActions.map((a, idx) => {
              const tone =
                a.severity === "danger" ? "red" : a.severity === "warn" ? "amber" : "chrome";
              const Icon =
                a.severity === "danger"
                  ? ShieldAlert
                  : a.severity === "warn"
                    ? AlertTriangle
                    : CheckCircle2;
              const body = (
                <div
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    a.severity === "danger"
                      ? "border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_10%,transparent)] text-[#ffb1b1]"
                      : a.severity === "warn"
                        ? "border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_10%,transparent)] text-[#ffd8a8]"
                        : "border-white/10 bg-[var(--garage-bg-3)] text-zinc-200"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 text-xs">{a.label}</span>
                  <Badge tone={tone}>{a.severity}</Badge>
                  {a.href && <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                </div>
              );
              return (
                <li key={idx}>
                  {a.href ? (
                    <Link href={a.href} className="block">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {/* Cards detail */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DomainCard
          icon={<Wallet className="h-4 w-4" />}
          title="Keuangan"
          href="/control/cashflow"
          rows={
            brief
              ? [
                  ["Revenue hari ini", compact(brief.revenueToday)],
                  brief.finance?.guard?.level
                    ? [
                        "Finance Guard",
                        `${brief.finance.guard.level} (${brief.finance.guard.healthScore ?? "—"})`,
                      ]
                    : null,
                  brief.finance?.guard?.brief ? ["Catatan", brief.finance.guard.brief] : null,
                ].filter(Boolean) as Array<[string, string]>
              : []
          }
        />
        <DomainCard
          icon={<Users className="h-4 w-4" />}
          title="Kehadiran"
          href="/os?module=team-management"
          rows={
            brief
              ? ([
                  ["Hadir", `${brief.attendance.present} / ${brief.attendance.totalStaff}`],
                  brief.attendance.lateIn > 0 ? ["Telat punch in", String(brief.attendance.lateIn)] : null,
                  brief.attendance.absent > 0 ? ["Belum punch", String(brief.attendance.absent)] : null,
                ].filter(Boolean) as Array<[string, string]>)
              : []
          }
        />
        <DomainCard
          icon={<Boxes className="h-4 w-4" />}
          title="Inventory"
          href="/control/inventory-intel"
          rows={
            brief
              ? ([
                  ["Item stok rendah", String(brief.inventory.lowCount)],
                  ...brief.inventory.lowItems
                    .slice(0, 3)
                    .map((i) => [i.name, `${i.onHand} ${i.unit} (min ${i.min})`] as [string, string]),
                ] as Array<[string, string]>)
              : []
          }
          emptyMsg={brief && brief.inventory.lowCount === 0 ? "Semua stok aman ✓" : undefined}
        />
        <DomainCard
          icon={<ChefHat className="h-4 w-4" />}
          title="Dapur & Bar"
          href="/control/kitchen-ops"
          rows={
            brief
              ? ([
                  ["Tiket aktif", String(brief.kitchen.activeTickets)],
                  brief.kitchen.lateTickets > 0
                    ? ["Tiket telat", String(brief.kitchen.lateTickets)]
                    : null,
                  ...brief.kitchen.lateList
                    .slice(0, 3)
                    .map(
                      (t) =>
                        [
                          `${t.ticketNo} · ${t.tableLabel}`,
                          `+${t.overBy}m (${t.station})`,
                        ] as [string, string],
                    ),
                ].filter(Boolean) as Array<[string, string]>)
              : []
          }
          emptyMsg={
            brief && brief.kitchen.activeTickets === 0 ? "Tidak ada tiket aktif" : undefined
          }
        />
      </div>

      <Panel title="Tentang Briefing Ini" subtitle="Metodologi">
        <p className="text-xs leading-relaxed text-zinc-400">
          Briefing dihasilkan deterministik dari sinyal operasional hari ini — tidak menggunakan LLM
          untuk menjaga konsistensi & biaya rendah. Auto-refresh tiap 60 detik. Klik kartu domain
          untuk drill-down ke modul detail.
        </p>
      </Panel>
    </div>
  );
}

function DomainCard({
  icon,
  title,
  href,
  rows,
  emptyMsg,
}: {
  icon: React.ReactNode;
  title: string;
  href?: string;
  rows: Array<[string, string]>;
  emptyMsg?: string;
}) {
  const body = (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-4 transition hover:border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)]">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-zinc-400">
          {icon} {title}
        </p>
        {href && <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />}
      </div>
      <div className="mt-2 space-y-1">
        {rows.length === 0 && emptyMsg ? (
          <p className="text-xs text-emerald-300">{emptyMsg}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-zinc-500">
            <Clock className="mr-1 inline h-3 w-3" /> Memuat…
          </p>
        ) : (
          rows.map(([k, v], i) => (
            <div
              key={`${k}-${i}`}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="truncate text-zinc-400">{k}</span>
              <span className="font-mono font-semibold text-zinc-100">{v}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
