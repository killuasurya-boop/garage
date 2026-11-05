"use client";

// Owner Decision Center (Smart Approval V3, Batch 4). Semua angka dari server; tombol keputusan memanggil
// jalur resmi (STALE + status pelaksanaan + 2FA untuk R3). "Disetujui" ≠ "Berhasil dijalankan".
import "./decision-center.css";

import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleDashed,
  Clock,
  FileText,
  Gavel,
  Hourglass,
  ListChecks,
  Loader2,
  Moon,
  PencilLine,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  SunMedium,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APPROVAL_CATEGORY_LABEL, type ApprovalCategory } from "@/lib/approval-rules";
import type { DecisionApproval, DecisionExplanation, DecisionSubject } from "@/lib/decision-center";
import { EXECUTION_STATUS_LABEL, REVIEW_STATE_LABEL } from "@/lib/smart-approval";

type QueueItem = DecisionApproval & { priority?: number };
type Overview = {
  generatedAt: string;
  kpi: { pending: number; highRisk: number; failedExecution: number; parked: number; decidedToday: number; avgDecisionMinutes: number | null; approvedToday: number; rejectedToday: number };
  queue: QueueItem[];
  decided: QueueItem[];
};
type Detail = {
  approval: DecisionApproval;
  subject: DecisionSubject;
  snapshotHash: string;
  checkedAt: string;
  explanation: DecisionExplanation;
  timeline: Array<{ time: string; actor: string; action: string; status: string }>;
  stepUp: { challengeId: string; nonce: string; expiresAt: string; twoFactorEnabled: boolean } | null;
};
type Action = "approve" | "reject" | "defer" | "request_revision";

const THEME_KEY = "garage:decision-center-theme";
const rp = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `Rp${Math.round(n).toLocaleString("id-ID")}`);
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.floor(m / 60)} jam lalu` : `${Math.floor(m / 1440)} hari lalu`;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: { "content-type": "application/json" }, ...init });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!res.ok || !json || json.data === undefined) {
    const err = new Error(json?.error?.message ?? `Gagal (${res.status}).`) as Error & { code?: string };
    err.code = json?.error?.code;
    throw err;
  }
  return json.data;
}

const ACTION_META: Record<Action, { label: string; icon: typeof ThumbsUp; variant?: string; needsNote: boolean }> = {
  approve: { label: "Setujui", icon: ThumbsUp, variant: "approve", needsNote: false },
  reject: { label: "Tolak", icon: ThumbsDown, variant: "reject", needsNote: true },
  defer: { label: "Tunda", icon: Hourglass, needsNote: true },
  request_revision: { label: "Minta Revisi", icon: PencilLine, needsNote: true },
};

function TierPill({ tier }: { tier: string }) {
  const label = tier === "R3" ? "Risiko tinggi · R3" : tier === "R2" ? "Sedang · R2" : "Rendah · R1";
  return <span className="dc-pill" data-tone={tier}>{tier === "R3" ? <ShieldAlert className="size-3.5" aria-hidden /> : null}{label}</span>;
}

function ExecPill({ a }: { a: DecisionApproval }) {
  const tone = a.executionStatus === "succeeded" ? "green" : a.executionStatus === "failed" ? "red" : a.executionStatus === "running" ? "amber" : "neutral";
  if (a.status === "pending" && a.executionStatus === "not_required") return null;
  return <span className="dc-pill" data-tone={tone}>{EXECUTION_STATUS_LABEL[a.executionStatus]}</span>;
}

/** Tahap: Pengajuan → Review → Keputusan → Eksekusi → Verifikasi (status nyata, bukan dekorasi). */
function Stepper({ a }: { a: DecisionApproval }) {
  const decided = a.status !== "pending";
  const exec = a.executionStatus;
  const steps: Array<{ label: string; state: "done" | "current" | "todo" | "failed"; sub: string }> = [
    { label: "Pengajuan", state: "done", sub: when(a.createdAt) },
    { label: "Review", state: decided || a.reviewState ? "done" : "current", sub: a.reviewState ? REVIEW_STATE_LABEL[a.reviewState] : decided ? "Selesai" : "Menunggu" },
    { label: "Keputusan", state: decided ? "done" : a.reviewState ? "current" : "todo", sub: decided ? (a.status === "approved" ? "Disetujui" : "Ditolak") : "Menunggu Anda" },
    {
      label: "Eksekusi",
      state: exec === "failed" ? "failed" : exec === "succeeded" || (decided && exec === "not_required") ? "done" : exec === "running" ? "current" : "todo",
      sub: exec === "failed" ? "Gagal" : exec === "succeeded" ? when(a.executedAt) : decided && exec === "not_required" ? "Tidak perlu" : exec === "running" ? "Berjalan" : "-",
    },
    { label: "Verifikasi", state: exec === "succeeded" ? "done" : "todo", sub: exec === "succeeded" ? "Tercatat di sistem" : exec === "legacy" ? "Tanpa bukti (lama)" : "-" },
  ];
  return (
    <ol className="flex items-start" aria-label="Tahap pengajuan">
      {steps.map((step, index) => (
        <li key={step.label} className="contents">
          <div className="dc-step" data-state={step.state}>
            <span className="dc-step-dot" aria-hidden>
              {step.state === "done" ? <CheckCircle2 className="size-4" /> : step.state === "failed" ? <XCircle className="size-4" /> : index + 1}
            </span>
            <span className="font-bold">{step.label}</span>
            <span className="dc-muted leading-tight">{step.sub}</span>
          </div>
          {index < steps.length - 1 ? <span className="dc-step-line" data-done={step.state === "done"} aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

function Section({ title, icon: Icon, children, tone }: { title: string; icon: typeof Bot; children: React.ReactNode; tone?: string }) {
  return (
    <section className="dc-card dc-enter p-4" data-tone={tone}>
      <h3 className="dc-sec-h mb-2">
        <Icon className="size-4" aria-hidden /> {title}
      </h3>
      {children}
    </section>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="dc-muted text-sm">{empty}</p>;
  return (
    <ul className="dc-list space-y-1 text-sm">
      {items.map((item, i) => (
        <li key={i} className="dc-text-2">{item}</li>
      ))}
    </ul>
  );
}

export function DecisionCenter() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [tierFilter, setTierFilter] = useState<"all" | "R3" | "R2" | "R1">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [askText, setAskText] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askAnswer, setAskAnswer] = useState<{ answer: string; note: string } | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* preferensi opsional */
    }
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      setLoadError(null);
      setOverview(await api<Overview>("/api/control/decision-center"));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal memuat.");
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailState("loading");
    setDetailError(null);
    setAskAnswer(null);
    try {
      setDetail(await api<Detail>(`/api/control/decision-center/${encodeURIComponent(id)}`));
      setDetailState("idle");
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Gagal memuat detail.");
      setDetailState("error");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void loadOverview(), 0);
    const id = window.setInterval(() => void loadOverview(), 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [loadOverview]);

  const items = useMemo(() => {
    if (!overview) return [];
    const base = tab === "pending" ? overview.queue : tab === "all" ? [...overview.queue, ...overview.decided] : overview.decided.filter((row) => row.status === tab);
    const q = query.trim().toLowerCase();
    return base
      .filter((row) => tierFilter === "all" || row.riskTier === tierFilter)
      .filter((row) => !q || [row.id, row.type, row.requester, row.reason, row.amount].join(" ").toLowerCase().includes(q));
  }, [overview, tab, tierFilter, query]);

  function select(id: string) {
    setSelectedId(id);
    void loadDetail(id);
  }

  function setThemePref(next: "dark" | "light") {
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* abaikan */
    }
  }

  function openDialog(action: Action) {
    setDialog(action);
    setNote("");
    setCode("");
    setActionError(null);
  }

  async function submitDecision() {
    if (!detail || !dialog) return;
    setBusy(true);
    setActionError(null);
    try {
      const needs2fa = (dialog === "approve" || dialog === "reject") && detail.approval.riskTier === "R3";
      const result = await api<{ approval: DecisionApproval; executed: boolean }>(`/api/control/decision-center/${encodeURIComponent(detail.approval.id)}`, {
        method: "POST",
        body: JSON.stringify({
          action: dialog,
          note: note.trim() || undefined,
          expectedSnapshotHash: detail.snapshotHash,
          ...(needs2fa && detail.stepUp ? { challengeId: detail.stepUp.challengeId, nonce: detail.stepUp.nonce, code: code.trim() } : {}),
        }),
      });
      setDialog(null);
      setToast(
        dialog === "approve"
          ? result.executed
            ? "Disetujui & pelaksanaan berhasil tercatat."
            : "Disetujui (tanpa pelaksanaan otomatis)."
          : dialog === "reject"
            ? "Pengajuan ditolak."
            : dialog === "defer"
              ? "Pengajuan ditunda."
              : "Permintaan revisi tersimpan.",
      );
      await Promise.all([loadOverview(), loadDetail(detail.approval.id)]);
    } catch (error) {
      const err = error as Error & { code?: string };
      setActionError(err.message);
      if (err.code === "STALE" || err.code === "CHALLENGE_EXPIRED" || err.code === "CHALLENGE_USED") void loadDetail(detail.approval.id);
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    if (!detail || askText.trim().length < 3) return;
    setAskBusy(true);
    try {
      const res = await api<{ answer: string; note: string }>(`/api/control/decision-center/${encodeURIComponent(detail.approval.id)}`, {
        method: "POST",
        body: JSON.stringify({ action: "ask", question: askText.trim() }),
      });
      setAskAnswer(res);
    } catch (error) {
      setAskAnswer({ answer: error instanceof Error ? error.message : "AYA belum dapat menjawab.", note: "" });
    } finally {
      setAskBusy(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const k = overview?.kpi;
  const a = detail?.approval;
  const ex = detail?.explanation;
  const recTone = ex ? (ex.recommendation.action === "reject" ? "red" : ex.recommendation.action === "approve" || ex.recommendation.action === "approve_with_note" ? undefined : "amber") : undefined;

  return (
    <div className="dc-root" data-theme={theme} data-testid="decision-center">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="dc-muted flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
            <Gavel className="size-3.5" aria-hidden /> Smart Approval · AYA Intelligence
          </p>
          <h1 className="dc-title text-2xl sm:text-3xl">Owner Decision Center</h1>
          <p className="dc-muted text-sm">Masalah, bukti, analisis, rekomendasi, dan hasil nyata setiap keputusan dalam satu tempat.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="dc-soft flex p-1" role="radiogroup" aria-label="Tema">
            <button type="button" role="radio" aria-checked={theme === "light"} className="dc-tab !min-h-9 !border-0" data-active={theme === "light"} onClick={() => setThemePref("light")}>
              <SunMedium className="size-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Terang</span>
            </button>
            <button type="button" role="radio" aria-checked={theme === "dark"} className="dc-tab !min-h-9 !border-0" data-active={theme === "dark"} onClick={() => setThemePref("dark")}>
              <Moon className="size-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Gelap</span>
            </button>
          </div>
          <button type="button" className="dc-btn" onClick={() => void loadOverview()} aria-label="Muat ulang">
            <RefreshCw className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Ringkasan keputusan">
        {[
          { label: "Menunggu", value: k?.pending, icon: Clock, tone: "amber" },
          { label: "Risiko tinggi (R3)", value: k?.highRisk, icon: AlertTriangle, tone: "red" },
          { label: "Gagal dijalankan", value: k?.failedExecution, icon: XCircle, tone: k?.failedExecution ? "red" : undefined },
          { label: "Rata-rata waktu keputusan", value: k?.avgDecisionMinutes, suffix: " mnt", icon: Hourglass },
          { label: "Diputus hari ini", value: k?.decidedToday, icon: CheckCircle2, tone: "green", sub: k ? `${k.approvedToday} setuju · ${k.rejectedToday} tolak` : undefined },
        ].map((kpi) => (
          <div key={kpi.label} className="dc-card dc-kpi" data-tone={kpi.tone}>
            <span className="dc-kpi-icon"><kpi.icon className="size-5" aria-hidden /></span>
            <div className="min-w-0">
              <p className="dc-muted text-xs font-bold">{kpi.label}</p>
              <p className="dc-kpi-value">{kpi.value === undefined ? "…" : kpi.value === null ? "—" : `${kpi.value}${kpi.suffix ?? ""}`}</p>
              {kpi.sub ? <p className="dc-muted text-[11px]">{kpi.sub}</p> : null}
            </div>
          </div>
        ))}
      </div>

      {loadError ? (
        <p className="dc-card mb-3 p-3 text-sm" role="alert" style={{ color: "var(--dc-red)" }}>{loadError}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        {/* Daftar pengajuan */}
        <section className={`${selectedId ? "hidden lg:block" : ""} min-w-0`} aria-label="Daftar pengajuan">
          <div className="mb-2 flex flex-wrap gap-1.5" role="tablist">
            {(
              [
                ["pending", `Menunggu (${overview?.queue.length ?? 0})`],
                ["approved", "Disetujui"],
                ["rejected", "Ditolak"],
                ["all", "Semua"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} className="dc-tab" data-active={tab === value} onClick={() => setTab(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <label className="relative">
              <Search className="dc-muted pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <input className="dc-input !pl-9" placeholder="Cari pengajuan, pemohon, alasan…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cari pengajuan" />
            </label>
            <select className="dc-input !w-auto" value={tierFilter} onChange={(e) => setTierFilter(e.target.value as typeof tierFilter)} aria-label="Filter risiko">
              <option value="all">Semua risiko</option>
              <option value="R3">R3 · Tinggi</option>
              <option value="R2">R2 · Sedang</option>
              <option value="R1">R1 · Rendah</option>
            </select>
          </div>
          <div className="garage-scroll max-h-[68vh] space-y-2 overflow-y-auto pr-1">
            {!overview ? (
              <p className="dc-muted flex items-center gap-2 p-4 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden /> Memuat…</p>
            ) : !items.length ? (
              <p className="dc-soft dc-muted p-6 text-center text-sm">
                <CircleDashed className="mx-auto mb-1 size-6" aria-hidden />
                {tab === "pending" ? "Tidak ada pengajuan yang menunggu." : "Tidak ada yang cocok dengan filter."}
              </p>
            ) : (
              items.map((row) => (
                <button key={row.id} type="button" className="dc-row dc-enter" data-active={row.id === selectedId} onClick={() => select(row.id)} data-testid="dc-row">
                  <span className="dc-kpi-icon !size-9"><Scale className="size-4" aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold">{APPROVAL_CATEGORY_LABEL[row.category as ApprovalCategory] ?? row.type}</span>
                    <span className="dc-muted block truncate text-xs">{row.requester} · {row.reason}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <TierPill tier={row.riskTier} />
                      {row.reviewState ? <span className="dc-pill" data-tone="amber">{REVIEW_STATE_LABEL[row.reviewState]}</span> : null}
                      {row.executionStatus === "failed" ? <span className="dc-pill" data-tone="red">Gagal dijalankan</span> : null}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="dc-money block text-sm">{row.amountValue !== null ? rp(row.amountValue) : row.amount}</span>
                    <span className="dc-muted block text-[11px]">{ago(row.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Detail */}
        <section className={`${selectedId ? "" : "hidden lg:block"} min-w-0`} aria-label="Detail pengajuan">
          {!selectedId ? (
            <div className="dc-soft dc-muted grid min-h-[320px] place-items-center p-6 text-center text-sm">
              <div>
                <ListChecks className="mx-auto mb-2 size-8" aria-hidden />
                Pilih pengajuan untuk melihat masalah, bukti, analisis dan rekomendasi AYA.
              </div>
            </div>
          ) : detailState === "loading" && !detail ? (
            <p className="dc-muted flex items-center gap-2 p-4 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden /> Memeriksa data terbaru…</p>
          ) : detailState === "error" ? (
            <p className="dc-card p-4 text-sm" role="alert" style={{ color: "var(--dc-red)" }}>{detailError}</p>
          ) : a && ex && detail ? (
            <div className="space-y-3 pb-20 lg:pb-0" data-testid="dc-detail">
              <div className="dc-card dc-enter p-4">
                <button type="button" className="dc-btn mb-3 lg:hidden" onClick={() => setSelectedId(null)}>
                  <ArrowLeft className="size-4" aria-hidden /> Daftar
                </button>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="dc-title text-xl">{APPROVAL_CATEGORY_LABEL[a.category] ?? a.type}</h2>
                    <p className="dc-muted text-xs">
                      <span className="font-mono">{a.id.length > 22 ? `${a.id.slice(0, 22)}…` : a.id}</span> · Diajukan {a.requester} · {when(a.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TierPill tier={a.riskTier} />
                    <ExecPill a={a} />
                    <span className="dc-money text-lg">{a.amountValue !== null ? rp(a.amountValue) : a.amount}</span>
                  </div>
                </div>
                <div className="mt-4">
                  <Stepper a={a} />
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <Section title="Apa masalahnya" icon={FileText}>
                  <p className="dc-text-2 text-sm">{ex.problem}</p>
                  <p className="dc-muted mt-1 text-xs">Alasan pemohon: {a.reason}</p>
                </Section>
                <section className={`dc-reco dc-enter p-4`} data-tone={recTone}>
                  <h3 className="dc-sec-h mb-1"><Bot className="size-4" aria-hidden /> Rekomendasi AYA</h3>
                  <p className="text-lg font-black">{ex.recommendation.title}</p>
                  <p className="dc-text-2 text-sm">{ex.recommendation.reason}</p>
                  <p className="dc-muted mt-1 text-[11px]">Berbasis aturan & data saat diperiksa ({when(detail.checkedAt)}). Bukan keputusan — keputusan tetap di tangan Anda.</p>
                </section>
                <Section title="Hasil pemeriksaan" icon={ListChecks}>
                  <ul className="space-y-1.5 text-sm">
                    {ex.checks.map((check) => (
                      <li key={check.label} className="flex items-start gap-2">
                        {check.ok === true ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: "var(--dc-green)" }} aria-hidden /> : check.ok === false ? <XCircle className="mt-0.5 size-4 shrink-0" style={{ color: "var(--dc-red)" }} aria-hidden /> : <CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />}
                        <span className="min-w-0"><b>{check.label}:</b> <span className="dc-text-2">{check.value}</span> <span className="dc-muted text-[11px]">({check.source})</span></span>
                      </li>
                    ))}
                  </ul>
                </Section>
                <Section title="Analisis" icon={Sparkles}>
                  <p className="text-xs font-black uppercase" style={{ color: "var(--dc-green)" }}>Fakta</p>
                  <List items={ex.facts} empty="Tidak ada fakta tambahan." />
                  <p className="mt-2 text-xs font-black uppercase" style={{ color: "var(--dc-amber)" }}>Dugaan (belum pasti)</p>
                  <List items={ex.hypotheses} empty="Tidak ada dugaan." />
                  <p className="dc-muted mt-2 text-xs font-black uppercase">Belum diketahui</p>
                  <List items={ex.unknowns} empty="—" />
                </Section>
                <Section title="Konsekuensi keputusan" icon={Scale}>
                  <dl className="space-y-1.5 text-sm">
                    {(Object.keys(ACTION_META) as Action[]).map((action) => (
                      <div key={action}>
                        <dt className="font-bold">{ACTION_META[action].label}</dt>
                        <dd className="dc-text-2">{ex.consequences[action]}</dd>
                      </div>
                    ))}
                  </dl>
                </Section>
                <Section title="Perubahan yang akan dilakukan" icon={PencilLine}>
                  <List items={ex.changes} empty="—" />
                  {ex.beforeAfter ? (
                    <div className="mt-3 grid gap-2">
                      {ex.beforeAfter.map((row) => (
                        <div key={row.label} className="dc-soft grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-2.5 text-sm">
                          <span><span className="dc-muted block text-[11px]">{row.label} · sebelum</span><span className="dc-money">{rp(row.before)}</span></span>
                          <span aria-hidden>→</span>
                          <span><span className="dc-muted block text-[11px]">sesudah (perkiraan)</span><span className="dc-money">{rp(row.after)}</span></span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Section>
                <Section title="Risiko & manfaat" icon={AlertTriangle}>
                  <List items={ex.riskBenefit.risks} empty="—" />
                  <p className="mt-2 text-xs font-black uppercase" style={{ color: "var(--dc-green)" }}>Manfaat</p>
                  <List items={ex.riskBenefit.benefits} empty="—" />
                </Section>
                <Section title="Status pelaksanaan & tindak lanjut" icon={CheckCircle2}>
                  <p className="text-sm font-bold">{EXECUTION_STATUS_LABEL[a.executionStatus]}</p>
                  {a.executionError ? <p className="text-sm" style={{ color: "var(--dc-red)" }}>Alasan: {a.executionError}</p> : null}
                  {a.decidedAt ? <p className="dc-muted text-xs">Diputus {a.decidedByName ?? "-"} · {when(a.decidedAt)} · via {a.decidedVia ?? "-"}</p> : null}
                  <div className="mt-2"><List items={ex.followUp} empty="Tidak ada tindak lanjut." /></div>
                </Section>
              </div>

              <Section title="Timeline & dokumentasi" icon={Clock}>
                {detail.timeline.length ? (
                  <ol className="space-y-1.5 text-sm">
                    {detail.timeline.map((entry, i) => (
                      <li key={i} className="flex flex-wrap gap-x-2">
                        <span className="dc-muted font-mono text-xs">{when(entry.time)}</span>
                        <span className="font-bold">{entry.action}</span>
                        <span className="dc-muted">— {entry.actor}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="dc-muted text-sm">Belum ada catatan audit untuk pengajuan ini.</p>
                )}
              </Section>

              <Section title="Tanya AYA" icon={Bot}>
                <div className="flex gap-2">
                  <input className="dc-input" placeholder="Mis. apa risikonya kalau saya setujui?" value={askText} onChange={(e) => setAskText(e.target.value)} aria-label="Pertanyaan untuk AYA" />
                  <button type="button" className="dc-btn shrink-0" onClick={() => void ask()} disabled={askBusy || askText.trim().length < 3}>
                    {askBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Tanya
                  </button>
                </div>
                {askAnswer ? (
                  <div className="dc-soft mt-2 p-3 text-sm">
                    <p className="whitespace-pre-wrap">{askAnswer.answer}</p>
                    {askAnswer.note ? <p className="dc-muted mt-1 text-[11px]">{askAnswer.note}</p> : null}
                  </div>
                ) : null}
              </Section>

              {a.status === "pending" ? (
                <div className="dc-mobile-bar lg:static lg:border-0 lg:bg-transparent lg:p-0">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(ACTION_META) as Action[]).map((action) => {
                      const meta = ACTION_META[action];
                      return (
                        <button key={action} type="button" className="dc-btn" data-variant={meta.variant} onClick={() => openDialog(action)} data-testid={`dc-action-${action}`}>
                          <meta.icon className="size-4" aria-hidden /> {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => (open ? null : setDialog(null))}>
        <DialogContent className="dc-root !rounded-2xl sm:max-w-md" data-theme={theme}>
          {dialog && a && ex ? (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="dc-title">{ACTION_META[dialog].label} pengajuan?</DialogTitle>
                <DialogDescription className="dc-text-2">{ex.consequences[dialog]}</DialogDescription>
              </DialogHeader>
              <div className="dc-soft space-y-1 p-3 text-sm">
                <p><span className="dc-muted">Pengajuan:</span> <b>{APPROVAL_CATEGORY_LABEL[a.category]}</b></p>
                <p><span className="dc-muted">Nilai:</span> <span className="dc-money">{a.amountValue !== null ? rp(a.amountValue) : a.amount}</span></p>
                <p><span className="dc-muted">Risiko:</span> <TierPill tier={a.riskTier} /></p>
              </div>
              <label className="block text-sm font-bold">
                {ACTION_META[dialog].needsNote ? "Alasan / catatan (wajib)" : "Catatan (opsional)"}
                <textarea className="dc-textarea mt-1" value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder={dialog === "request_revision" ? "Mis. lampirkan foto struk dan alasan pelanggan" : "Tulis catatan…"} />
                <span className="dc-muted text-[11px]">{note.length}/500</span>
              </label>
              {(dialog === "approve" || dialog === "reject") && a.riskTier === "R3" ? (
                <label className="block text-sm font-bold">
                  Kode 2FA (6 angka) — wajib untuk R3
                  <input className="dc-input mt-1 font-mono tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Kode 2FA" />
                  {detail?.stepUp && !detail.stepUp.twoFactorEnabled ? (
                    <span className="mt-1 block text-[12px]" style={{ color: "var(--dc-amber)" }}>2FA belum aktif di akun Anda — aktifkan di Control → 2FA dulu.</span>
                  ) : null}
                </label>
              ) : null}
              {actionError ? <p className="text-sm font-bold" role="alert" style={{ color: "var(--dc-red)" }}>{actionError}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="dc-btn" onClick={() => setDialog(null)}>Batal</button>
                <button
                  type="button"
                  className="dc-btn"
                  data-variant={ACTION_META[dialog].variant}
                  onClick={() => void submitDecision()}
                  disabled={busy || (ACTION_META[dialog].needsNote && note.trim().length < 5) || ((dialog === "approve" || dialog === "reject") && a.riskTier === "R3" && code.length !== 6)}
                  data-testid="dc-confirm"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {ACTION_META[dialog].label}
                </button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {toast ? (
        <div className="dc-card fixed bottom-4 right-4 z-50 flex items-center gap-2 p-3 text-sm font-bold" role="status" style={{ borderColor: "var(--dc-green)" }}>
          <CheckCircle2 className="size-4" style={{ color: "var(--dc-green)" }} aria-hidden /> {toast}
        </div>
      ) : null}
    </div>
  );
}
