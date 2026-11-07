"use client";

// AI Governance (Batch 7): mode AYA (Dijeda / Baca saja / Eksekusi terkendali) dari dua saklar
// server yang sudah ada, batas risiko tool R0–R3 (baca-saja, dari registry kode), aturan tetap,
// operasi R2/R3 30 hari, dan efektivitas kasus AYA. Panel tidak bisa melonggarkan aturan server.
import "./decision-center.css";

import {
  Ban,
  Bot,
  CheckCircle2,
  CircleDashed,
  Gauge,
  Lock,
  Loader2,
  Moon,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  SunMedium,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AI_MODE_LABEL, settingsForMode, type AiMode } from "@/lib/ai-governance";
import { DECISION_CHANNEL_LABEL } from "@/lib/smart-approval";
import type { AiGovernanceOverview } from "@/lib/ai-governance-server";

const THEME_KEY = "garage:decision-center-theme";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: { "content-type": "application/json" }, ...init });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message ?? `Gagal memuat (${res.status}).`);
  return json.data as T;
}

const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const MODE_ICON: Record<AiMode, typeof Bot> = { paused: PauseCircle, read_only: Lock, controlled: ShieldCheck };
const OP_LABEL: Record<string, { label: string; tone: string }> = {
  executed: { label: "Berhasil", tone: "green" },
  failed: { label: "Gagal", tone: "red" },
  confirmed: { label: "Tidak pasti", tone: "amber" },
  pending: { label: "Menunggu konfirmasi", tone: "neutral" },
  expired: { label: "Kedaluwarsa", tone: "neutral" },
};
const VERDICT_LABEL: Record<string, { label: string; tone: string }> = {
  improved: { label: "Membaik", tone: "green" },
  unchanged: { label: "Tidak berubah", tone: "amber" },
  worse: { label: "Memburuk", tone: "red" },
  unknown: { label: "Belum bisa diukur", tone: "neutral" },
};
const CASE_STATUS: Record<string, string> = { open: "Terbuka", monitoring: "Dipantau", resolved: "Selesai", dismissed: "Ditutup" };

export function AiGovernancePanel() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [data, setData] = useState<AiGovernanceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<AiMode | "load" | null>("load");
  const [confirmControlled, setConfirmControlled] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* opsional */
    }
  }, []);

  const load = useCallback(async () => {
    setBusy("load");
    try {
      setData(await api<AiGovernanceOverview>("/api/control/ai-governance"));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function changeMode(mode: AiMode) {
    if (mode === "controlled" && !confirmControlled) {
      setConfirmControlled(true);
      return;
    }
    setBusy(mode);
    setConfirmControlled(false);
    try {
      await api("/api/admin/settings", { method: "POST", body: JSON.stringify({ updates: settingsForMode(mode) }) });
      await load();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  const current = data?.mode.value;

  return (
    <div className="dc-root" data-theme={theme} data-testid="ai-governance">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="dc-muted flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider"><Bot className="size-3.5" aria-hidden /> AYA Intelligence · Tata kelola</p>
          <h1 className="dc-title text-2xl sm:text-3xl">AI Governance</h1>
          <p className="dc-muted text-sm">Atur seberapa jauh AYA boleh bertindak. Batas risiko & aturan keamanan ditetapkan server — panel ini tidak bisa melonggarkannya.</p>
        </div>
        <div className="flex gap-2">
          <div className="dc-soft flex p-1" role="radiogroup" aria-label="Tema">
            {(["light", "dark"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={theme === value} className="dc-tab !min-h-9 !border-0" data-active={theme === value}
                onClick={() => { setTheme(value); try { window.localStorage.setItem(THEME_KEY, value); } catch { /* abaikan */ } }}>
                {value === "light" ? <SunMedium className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
                <span className="sr-only sm:not-sr-only">{value === "light" ? "Terang" : "Gelap"}</span>
              </button>
            ))}
          </div>
          <button type="button" className="dc-btn !min-h-11 !px-3" onClick={() => void load()} aria-label="Muat ulang" disabled={busy === "load"}>
            <RefreshCw className={`size-4 ${busy === "load" ? "animate-spin" : ""}`} aria-hidden />
          </button>
        </div>
      </div>

      {error ? <p className="dc-card mb-3 p-3 text-sm font-bold" role="alert" style={{ color: "var(--dc-red)" }}>{error}</p> : null}

      {!data ? (
        <div className="dc-soft dc-muted grid min-h-[220px] place-items-center p-6 text-sm">
          {busy === "load" ? <Loader2 className="size-5 animate-spin" aria-label="Memuat" /> : "Data tata kelola belum tersedia."}
        </div>
      ) : (
        <div className="space-y-3">
          <section className="dc-card dc-enter p-4" aria-labelledby="gov-mode">
            <h2 id="gov-mode" className="dc-sec-h mb-3"><Gauge className="size-4" aria-hidden /> Mode AYA (ChatGPT)</h2>
            <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Mode AYA">
              {(["paused", "read_only", "controlled"] as AiMode[]).map((mode) => {
                const Icon = MODE_ICON[mode];
                const active = current === mode;
                return (
                  <button key={mode} type="button" role="radio" aria-checked={active} data-testid={`gov-mode-${mode}`}
                    className="dc-soft dc-option flex flex-col items-start gap-1 p-3 text-left" data-recommended={active}
                    disabled={busy !== null} onClick={() => void changeMode(mode)}>
                    <span className="flex items-center gap-2 text-sm font-black">
                      {busy === mode ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
                      {AI_MODE_LABEL[mode].title}
                      {active ? <span className="dc-pill" data-tone="green">Aktif</span> : null}
                    </span>
                    <span className="dc-text-2 text-xs">{AI_MODE_LABEL[mode].detail}</span>
                  </button>
                );
              })}
            </div>
            {confirmControlled ? (
              <div className="dc-soft mt-3 flex flex-wrap items-center justify-between gap-2 p-3" role="alert">
                <p className="text-sm">Buka perubahan data dari ChatGPT? Setiap perubahan tetap lewat preview + konfirmasi Anda; aksi kritis tetap minta kode 2FA.</p>
                <div className="flex gap-2">
                  <button type="button" className="dc-btn !min-h-9" onClick={() => setConfirmControlled(false)}>Batal</button>
                  <button type="button" className="dc-btn !min-h-9" data-variant="reject" data-testid="gov-confirm-controlled" onClick={() => void changeMode("controlled")}>Ya, buka</button>
                </div>
              </div>
            ) : null}
            <p className="dc-muted mt-2 text-[11px]">Perubahan mode tercatat di audit log. AYA sendiri tidak bisa mengubah mode ini (ditolak di server).</p>
          </section>

          <div className="grid gap-3 lg:grid-cols-4">
            {[
              { label: "Operasi R2/R3 · 30 hari", value: data.operations.total, sub: `${data.operations.executed} berhasil · ${data.operations.failed} gagal`, tone: "amber" },
              { label: "Tidak pasti", value: data.operations.uncertain, sub: "Dikonfirmasi tanpa hasil tercatat — cek manual", tone: data.operations.uncertain ? "red" : "neutral" },
              { label: "Efektivitas solusi AYA", value: data.cases.effectivenessPct === null ? "—" : `${data.cases.effectivenessPct}%`, sub: `${data.cases.verified} kasus terverifikasi dari ${data.cases.total}`, tone: "green" },
              { label: "Pelaksanaan approval gagal", value: data.approvals.executionFailed, sub: `${data.approvals.auto} disetujui otomatis · ${data.approvals.pendingDocuments} dokumen menunggu`, tone: data.approvals.executionFailed ? "red" : "neutral" },
            ].map((kpi, index) => (
              <div key={kpi.label} className="dc-kpi" data-tone={kpi.tone} style={{ animationDelay: `${index * 50}ms` }}>
                <div className="min-w-0">
                  <p className="dc-text-2 text-xs font-bold">{kpi.label}</p>
                  <p className="dc-kpi-value mt-1">{kpi.value}</p>
                  <p className="dc-muted mt-1 text-[11px]">{kpi.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <section className="dc-card p-4" aria-labelledby="gov-quality" data-testid="gov-quality">
            <h2 id="gov-quality" className="dc-sec-h mb-1"><Gauge className="size-4" aria-hidden /> Kualitas keputusan · {data.windowDays} hari</h2>
            <p className="dc-muted mb-3 text-xs">Diukur dari data nyata. Kesesuaian = keputusan Anda searah rekomendasi aturan yang tercatat saat memutus di Decision Center — bahan menilai aturan, bukan klaim AI belajar sendiri.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="dc-soft p-3">
                <p className="dc-text-2 text-xs font-bold">Sejalan dengan rekomendasi</p>
                <p className="dc-kpi-value mt-1">{data.quality.recommendation.followedPct === null ? "—" : `${data.quality.recommendation.followedPct}%`}</p>
                <p className="dc-muted text-[11px]">{data.quality.recommendation.followed} dari {data.quality.recommendation.recorded} keputusan tercatat</p>
              </div>
              <div className="dc-soft p-3">
                <p className="dc-text-2 text-xs font-bold">Pelaksanaan berhasil</p>
                <p className="dc-kpi-value mt-1">{data.quality.execution.successPct === null ? "—" : `${data.quality.execution.successPct}%`}</p>
                <p className="dc-muted text-[11px]">{data.quality.execution.succeeded} dari {data.quality.execution.attempted} · {data.quality.uncertain} tidak pasti</p>
              </div>
              <div className="dc-soft p-3">
                <p className="dc-text-2 text-xs font-bold">Kedaluwarsa / digantikan</p>
                <p className="dc-kpi-value mt-1">{data.quality.expired + data.quality.superseded}</p>
                <p className="dc-muted text-[11px]">{data.quality.expired} kedaluwarsa · {data.quality.superseded} sumber berubah</p>
              </div>
              <div className="dc-soft p-3">
                <p className="dc-text-2 text-xs font-bold">Jalur keputusan</p>
                <ul className="mt-1 space-y-0.5 text-[11px]">
                  {Object.entries(data.quality.byChannel).length ? (
                    Object.entries(data.quality.byChannel)
                      .sort((a, b) => b[1] - a[1])
                      .map(([via, n]) => (
                        <li key={via} className="flex justify-between gap-2">
                          <span className="dc-muted min-w-0 truncate">{DECISION_CHANNEL_LABEL[via as keyof typeof DECISION_CHANNEL_LABEL] ?? via}</span>
                          <span className="font-bold">{n}</span>
                        </li>
                      ))
                  ) : (
                    <li className="dc-muted">Belum ada keputusan.</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className="dc-card p-4" aria-labelledby="gov-tools">
              <h2 id="gov-tools" className="dc-sec-h mb-1"><ShieldCheck className="size-4" aria-hidden /> Batas risiko tool ({data.tools.total})</h2>
              <p className="dc-muted mb-3 text-xs">Tingkat risiko ditetapkan di kode (registry), bukan setelan. R2/R3 selalu preview + konfirmasi; R3 + kode 2FA.</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {data.tools.byRisk.map((row) => (
                  <span key={row.risk} className="dc-pill" data-tone={row.risk === "R3" ? "red" : row.risk === "R2" ? "amber" : row.risk === "R1" ? "green" : "neutral"}>
                    {row.risk} · {row.label}: {row.count}
                  </span>
                ))}
              </div>
              <div className="dc-list max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {data.tools.domains.map((domain) => (
                  <details key={domain.id} className="dc-soft p-2.5">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-bold">
                      <span className="min-w-0 truncate">{domain.label}</span>
                      <span className="dc-muted shrink-0 text-xs">
                        {domain.total ? `${domain.total} tool${domain.risks.R3 ? ` · ${domain.risks.R3} R3` : ""}` : "Belum ada tool"}
                      </span>
                    </summary>
                    {domain.tools.length ? (
                      <ul className="mt-2 space-y-1 text-xs">
                        {domain.tools.map((tool) => (
                          <li key={tool.name} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate"><code className="dc-muted">{tool.name}</code> {tool.title}</span>
                            <span className="dc-pill shrink-0" data-tone={tool.risk === "R3" ? "red" : tool.risk === "R2" ? "amber" : "neutral"}>{tool.risk}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </details>
                ))}
              </div>
            </section>

            <div className="space-y-3">
              <section className="dc-card p-4" aria-labelledby="gov-rules">
                <h2 id="gov-rules" className="dc-sec-h mb-2"><Lock className="size-4" aria-hidden /> Aturan tetap (tidak bisa diubah dari layar)</h2>
                <ul className="space-y-1.5 text-sm">
                  {data.guardrails.map((rule) => (
                    <li key={rule} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: "var(--dc-green)" }} aria-hidden /><span>{rule}</span></li>
                  ))}
                </ul>
                <h3 className="dc-sec-h mb-2 mt-4"><Ban className="size-4" aria-hidden /> Dilarang total (R4)</h3>
                <ul className="space-y-1.5 text-sm">
                  {data.forbidden.map((rule) => (
                    <li key={rule} className="flex gap-2"><XCircle className="mt-0.5 size-4 shrink-0" style={{ color: "var(--dc-red)" }} aria-hidden /><span>{rule}</span></li>
                  ))}
                </ul>
              </section>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="dc-card p-4" aria-labelledby="gov-ops">
              <h2 id="gov-ops" className="dc-sec-h mb-2"><CircleDashed className="size-4" aria-hidden /> Operasi terbaru</h2>
              {data.operations.recent.length ? (
                <ul className="space-y-1.5 text-sm">
                  {data.operations.recent.map((op) => {
                    const meta = OP_LABEL[op.status] ?? { label: op.status, tone: "neutral" };
                    return (
                      <li key={op.id} className="dc-soft flex items-center justify-between gap-2 p-2">
                        <span className="min-w-0">
                          <code className="block truncate text-xs font-bold">{op.tool}</code>
                          <span className="dc-muted text-[11px]">{when(op.createdAt)} · {op.risk} · {op.source === "chatgpt" ? "ChatGPT" : "Layar Owner"}</span>
                        </span>
                        <span className="dc-pill shrink-0" data-tone={meta.tone}>{meta.label}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="dc-muted text-sm">Belum ada operasi R2/R3 dalam {data.windowDays} hari.</p>
              )}
              <Link href="/control/ai-command" className="dc-muted mt-2 inline-block text-xs underline">Buka timeline lengkap di AI Command</Link>
            </section>

            <section className="dc-card p-4" aria-labelledby="gov-cases">
              <h2 id="gov-cases" className="dc-sec-h mb-2"><Bot className="size-4" aria-hidden /> Monitoring kasus AYA</h2>
              <div className="mb-2 flex flex-wrap gap-2 text-xs">
                {Object.entries(data.cases.status).map(([key, value]) => (
                  <span key={key} className="dc-pill" data-tone="neutral">{CASE_STATUS[key] ?? key}: {value}</span>
                ))}
              </div>
              {data.cases.recent.length ? (
                <ul className="space-y-1.5 text-sm">
                  {data.cases.recent.map((c) => {
                    const verdict = c.verdict ? VERDICT_LABEL[c.verdict] ?? VERDICT_LABEL.unknown : null;
                    return (
                      <li key={c.id} className="dc-soft flex items-center justify-between gap-2 p-2">
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{c.question}</span>
                          <span className="dc-muted text-[11px]">{c.caseNo} · {CASE_STATUS[c.status] ?? c.status}</span>
                        </span>
                        <span className="dc-pill shrink-0" data-tone={verdict?.tone ?? "neutral"}>{verdict?.label ?? "Belum diverifikasi"}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="dc-muted text-sm">Belum ada kasus. Mulai dari AYA Problem Solver.</p>
              )}
              <p className="dc-muted mt-2 text-[11px]">Efektivitas dihitung dari kasus yang sudah diukur ulang, bukan dari jawaban AI.</p>
              <Link href="/control/aya-solver" className="dc-muted mt-1 inline-block text-xs underline">Buka AYA Problem Solver</Link>
            </section>
          </div>
          <p className="dc-muted text-[11px]">Data per {when(data.generatedAt)}.</p>
        </div>
      )}
    </div>
  );
}
