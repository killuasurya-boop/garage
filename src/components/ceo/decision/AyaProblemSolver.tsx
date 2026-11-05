"use client";

// AYA Smart Problem Solver V4 (Batch 5) — Owner menulis masalah → bukti R0 → fakta/dugaan/opsi →
// keputusan Owner → tautan pelaksanaan resmi → verifikasi. UI hanya menampilkan data server.
import "./decision-center.css";

import {
  Bot,
  CheckCircle2,
  CircleDashed,
  Database,
  FileSearch,
  Gauge,
  History,
  Link2,
  Loader2,
  Moon,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  SunMedium,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { ProblemDiagnosis } from "@/lib/garage-problem-solver";

type CaseRow = { id: string; caseNo: string; question: string; status: string; analysisStatus: string; domains: string[]; version: number; updatedAt: string };
type CaseEvent = { id: string; kind: string; actorName: string | null; caseVersion: number; operationId: string | null; payload: Record<string, unknown>; createdAt: string };
type DiagnosisView = ProblemDiagnosis & { ai?: { status: string; explanation: string; provider: string | null; note: string } | null };
type CaseDetail = { id: string; caseNo: string; question: string; status: string; mode: string; version: number; diagnosisHash: string; diagnosis: DiagnosisView; events: CaseEvent[] };

const THEME_KEY = "garage:decision-center-theme";
const DOMAIN_LABEL: Record<string, string> = {
  dashboard: "Dashboard", pos: "POS", shift_kas: "Kas & Shift", keuangan: "Keuangan", gudang: "WMS/Gudang", dapur_bar: "Bar & Dapur",
  produk_harga: "Produk", bahan_resep: "Resep/HPP", marketing: "Marketing", karyawan: "Karyawan", meja_qr: "Meja & QR", event: "Event", sistem: "Sistem",
};
const SUPPORT: Record<string, { label: string; tone: string }> = {
  didukung: { label: "Didukung data", tone: "red" },
  lemah: { label: "Lemah", tone: "amber" },
  tidak_didukung: { label: "Tidak didukung", tone: "green" },
  belum_diuji: { label: "Belum diuji", tone: "neutral" },
};
const STATUS_LABEL: Record<string, string> = { open: "Terbuka", monitoring: "Dipantau", resolved: "Selesai", dismissed: "Ditutup" };
const ANALYSIS_LABEL: Record<string, string> = { EVIDENCE_READY: "Bukti cukup (awal)", NEED_REVIEW: "Perlu ditinjau", DATA_UNAVAILABLE: "Data tidak tersedia" };
const EVENT_LABEL: Record<string, string> = { analysis: "Analisis", decision: "Keputusan Owner", action_linked: "Pelaksanaan resmi ditautkan", verification: "Verifikasi hasil" };
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

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

function Block({ title, icon: Icon, children }: { title: string; icon: typeof Bot; children: React.ReactNode }) {
  return (
    <section className="dc-card dc-enter p-4">
      <h3 className="dc-sec-h mb-2"><Icon className="size-4" aria-hidden /> {title}</h3>
      {children}
    </section>
  );
}

export function AyaProblemSolver() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const [withAi, setWithAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [current, setCurrent] = useState<CaseDetail | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [operationId, setOperationId] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* opsional */
    }
  }, []);

  const loadCases = useCallback(async () => {
    try {
      setCases(await api<CaseRow[]>("/api/ai/problem-cases"));
    } catch {
      /* daftar riwayat opsional */
    }
  }, []);
  const openCase = useCallback(async (id: string) => {
    setError(null);
    try {
      setCurrent(await api<CaseDetail>(`/api/ai/problem-cases/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kasus gagal dimuat.");
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void loadCases(), 0);
    return () => window.clearTimeout(id);
  }, [loadCases]);

  async function investigate() {
    if (message.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ case: { id: string } | null }>("/api/ai/problem-solver", {
        method: "POST",
        body: JSON.stringify({ message: message.trim(), mode, withAi, saveCase: true }),
      });
      if (res.case) await openCase(res.case.id);
      setMessage("");
      await loadCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Investigasi gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function caseAction(body: Record<string, unknown>, key: string) {
    if (!current) return;
    setActionBusy(key);
    setError(null);
    try {
      await api(`/api/ai/problem-cases/${current.id}`, { method: "POST", body: JSON.stringify(body) });
      setNote("");
      setOperationId("");
      await Promise.all([openCase(current.id), loadCases()]);
    } catch (err) {
      const e = err as Error & { code?: string };
      setError(e.message);
      if (e.code === "STALE") void openCase(current.id);
    } finally {
      setActionBusy(null);
    }
  }

  const d = current?.diagnosis;
  const report = d?.report;
  const decide = (decision: string, optionId?: string) =>
    caseAction({ action: "decide", decision, optionId, note: note.trim() || undefined, expectedDiagnosisHash: current?.diagnosisHash }, `${decision}:${optionId ?? ""}`);

  return (
    <div className="dc-root" data-theme={theme} data-testid="aya-solver">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="dc-muted flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider"><Bot className="size-3.5" aria-hidden /> AYA Intelligence · Baca-saja</p>
          <h1 className="dc-title text-2xl sm:text-3xl">AYA Problem Solver</h1>
          <p className="dc-muted text-sm">Tulis masalah, ide, atau pertanyaan. AYA membaca bukti resmi lintas modul — tidak mengubah data apa pun.</p>
        </div>
        <div className="dc-soft flex p-1" role="radiogroup" aria-label="Tema">
          {(["light", "dark"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={theme === value} className="dc-tab !min-h-9 !border-0" data-active={theme === value}
              onClick={() => { setTheme(value); try { window.localStorage.setItem(THEME_KEY, value); } catch { /* abaikan */ } }}>
              {value === "light" ? <SunMedium className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
              <span className="sr-only sm:not-sr-only">{value === "light" ? "Terang" : "Gelap"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <section className="dc-card p-4">
            <label htmlFor="aya-input" className="dc-sec-h mb-2"><Sparkles className="size-4" aria-hidden /> Masalah / pertanyaan</label>
            <textarea id="aya-input" className="dc-textarea" rows={3} value={message} onChange={(e) => setMessage(e.target.value.slice(0, 3000))}
              placeholder="Mis. Kenapa kas shift malam selisih Rp250.000 kemarin? / Stok susu minus terus / Dapur lambat jam makan siang" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="dc-soft flex p-1" role="radiogroup" aria-label="Mode">
                {(["quick", "full"] as const).map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={mode === value} className="dc-tab !min-h-9 !border-0" data-active={mode === value} onClick={() => setMode(value)}>
                    {value === "quick" ? "Quick Scan" : "Full Investigation"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={withAi} onChange={(e) => setWithAi(e.target.checked)} className="size-4" />
                Penjelasan AI (data tersensor)
              </label>
              <button type="button" className="dc-btn ml-auto" data-variant="reject" onClick={() => void investigate()} disabled={busy || message.trim().length < 5} data-testid="aya-submit">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Investigasi
              </button>
            </div>
            <p className="dc-muted mt-2 text-[11px]">Kata “ACC” atau “jalankan semua” tidak mengubah apa pun — tindakan selalu draf sampai Anda setujui lewat jalur resmi.</p>
          </section>

          {error ? <p className="dc-card p-3 text-sm font-bold" role="alert" style={{ color: "var(--dc-red)" }}>{error}</p> : null}

          {!current ? (
            <div className="dc-soft dc-muted grid min-h-[220px] place-items-center p-6 text-center text-sm">
              <div><FileSearch className="mx-auto mb-2 size-8" aria-hidden />Hasil investigasi tampil di sini: masalah, fakta, dugaan, opsi, dan bukti.</div>
            </div>
          ) : d && report ? (
            <div className="space-y-3" data-testid="aya-report">
              <section className="dc-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="dc-muted font-mono text-xs">{current.caseNo} · versi {current.version}</p>
                    <h2 className="dc-title text-lg">{report.masalah}</h2>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="dc-pill" data-tone={d.analysis.status === "EVIDENCE_READY" ? "green" : d.analysis.status === "NEED_REVIEW" ? "amber" : "red"}>{ANALYSIS_LABEL[d.analysis.status]}</span>
                    <span className="dc-pill" data-tone="neutral">{STATUS_LABEL[current.status] ?? current.status}</span>
                    <span className="dc-pill" data-tone="neutral">Eksekusi: belum dilakukan</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Modul yang diperiksa">
                  {d.domains.map((domain) => <span key={domain} className="dc-pill" data-tone="neutral"><Database className="size-3" aria-hidden /> {DOMAIN_LABEL[domain] ?? domain}</span>)}
                </div>
              </section>

              <div className="grid gap-3 xl:grid-cols-2">
                <Block title="Fakta terverifikasi" icon={CheckCircle2}>
                  {report.fakta.length ? <ul className="dc-list space-y-1 text-sm">{report.fakta.map((f, i) => <li key={i} className="dc-text-2">{f}</li>)}</ul> : <p className="dc-muted text-sm">Belum ada fakta — sumber tidak terbaca.</p>}
                </Block>
                <Block title="Dugaan (diuji dengan data)" icon={Gauge}>
                  <ul className="space-y-2 text-sm">
                    {report.dugaan.map((h) => (
                      <li key={h.id} className="dc-soft p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-bold">{h.text}</span>
                          <span className="dc-pill" data-tone={SUPPORT[h.support]?.tone}>{SUPPORT[h.support]?.label ?? h.support}</span>
                        </div>
                        <p className="dc-muted mt-1 text-xs">Cara membuktikan: {h.howToProve}</p>
                      </li>
                    ))}
                  </ul>
                </Block>
                <Block title="Akar masalah & dampak" icon={FileSearch}>
                  <p className="text-sm font-bold">{report.akarMasalah}</p>
                  {report.dampak.length ? <ul className="dc-list mt-2 space-y-1 text-sm">{report.dampak.map((x, i) => <li key={i} className="dc-text-2">{x}</li>)}</ul> : null}
                </Block>
                <Block title="Belum diketahui / keterbatasan" icon={CircleDashed}>
                  <ul className="dc-list space-y-1 text-sm">{report.belumDiketahui.map((x, i) => <li key={i} className="dc-text-2">{x}</li>)}</ul>
                </Block>
              </div>

              <Block title="Opsi solusi & rekomendasi AYA" icon={ShieldCheck}>
                <p className="mb-2 text-sm font-bold">⭐ {report.rekomendasi}</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {report.opsi.map((option) => (
                    <div key={option.id} className="dc-soft flex flex-col gap-2 p-3" data-recommended={option.recommended}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black">{option.id}. {option.title}</span>
                        <span className="dc-pill" data-tone={option.risk === "R3" ? "R3" : option.risk === "R2" ? "R2" : "R1"}>{option.risk}</span>
                      </div>
                      <p className="dc-text-2 text-xs">{option.consequence}</p>
                      {option.recommended ? <span className="dc-pill self-start" data-tone="green">Disarankan</span> : null}
                      <button type="button" className="dc-btn mt-auto !min-h-10 text-xs" onClick={() => void decide("choose_option", option.id)} disabled={Boolean(actionBusy) || current.status === "resolved" || current.status === "dismissed"}>
                        Pilih opsi ini
                      </button>
                    </div>
                  ))}
                </div>
                <p className="dc-muted mt-2 text-[11px]">Memilih opsi hanya mencatat keputusan. Perubahan data tetap lewat AI Command Center / modul resmi (pratinjau → ACC → 2FA untuk R3), lalu tautkan operasinya di bawah.</p>
              </Block>

              {d.ai ? (
                <Block title="Penjelasan AYA (AI)" icon={Bot}>
                  <p className="dc-text-2 whitespace-pre-wrap text-sm">{d.ai.explanation}</p>
                  <p className="dc-muted mt-1 text-[11px]">{d.ai.note}{d.ai.provider ? ` · ${d.ai.provider}` : ""}</p>
                </Block>
              ) : null}

              <Block title="Bukti per sumber" icon={Database}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead className="dc-muted"><tr><th className="py-1">Sumber (tool R0)</th><th>Status</th><th>Dicek</th><th>Waktu data</th><th>Baris</th></tr></thead>
                    <tbody>
                      {d.evidence.map((row) => (
                        <tr key={row.tool} className="border-t">
                          <td className="py-1.5 font-mono">{row.tool}</td>
                          <td>{row.status === "available" ? <span style={{ color: "var(--dc-green)" }}>Terbaca</span> : <span style={{ color: "var(--dc-red)" }}>{row.error}{row.errorRef ? ` (ref ${row.errorRef})` : ""}</span>}</td>
                          <td>{when(row.checkedAt)}</td>
                          <td>{row.dataAsOf ? when(row.dataAsOf) : "tidak tersedia"}</td>
                          <td>{row.recordCount ?? "—"}{row.truncated ? " (dibatasi)" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Block>

              <Block title="Keputusan, pelaksanaan & verifikasi" icon={History}>
                <ol className="space-y-1.5 text-sm" aria-label="Linimasa kasus">
                  {current.events.map((event) => (
                    <li key={event.id} className="flex flex-wrap gap-x-2">
                      <span className="dc-muted font-mono text-xs">{when(event.createdAt)}</span>
                      <span className="font-bold">{EVENT_LABEL[event.kind] ?? event.kind}</span>
                      <span className="dc-text-2">
                        {event.kind === "decision" ? `${String(event.payload.decision)}${event.payload.optionTitle ? ` · ${String(event.payload.optionTitle)}` : ""}${event.payload.note ? ` · "${String(event.payload.note)}"` : ""}` : null}
                        {event.kind === "action_linked" ? `${String(event.payload.tool)} · ${String(event.payload.outcome)}` : null}
                        {event.kind === "verification" ? `hasil: ${String(event.payload.verdict)}` : null}
                        {event.kind === "analysis" ? `v${event.caseVersion} · ${ANALYSIS_LABEL[String(event.payload.analysisStatus)] ?? ""}` : null}
                      </span>
                      <span className="dc-muted">— {event.actorName ?? "-"}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 grid gap-2">
                  <textarea className="dc-textarea !min-h-16" value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Catatan keputusan (wajib untuk tunda/tutup)" aria-label="Catatan keputusan" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="dc-btn" onClick={() => void caseAction({ action: "rerun", withAi }, "rerun")} disabled={Boolean(actionBusy)}><RefreshCw className="size-4" aria-hidden /> Analisis ulang</button>
                    <button type="button" className="dc-btn" onClick={() => void caseAction({ action: "verify" }, "verify")} disabled={Boolean(actionBusy)}><Gauge className="size-4" aria-hidden /> Verifikasi hasil</button>
                    <button type="button" className="dc-btn" onClick={() => void decide("defer")} disabled={Boolean(actionBusy) || note.trim().length < 5}>Tunda</button>
                    <button type="button" className="dc-btn" data-variant="approve" onClick={() => void decide("resolve")} disabled={Boolean(actionBusy)}><CheckCircle2 className="size-4" aria-hidden /> Tandai selesai</button>
                    <button type="button" className="dc-btn" onClick={() => void decide("dismiss")} disabled={Boolean(actionBusy) || note.trim().length < 5}><XCircle className="size-4" aria-hidden /> Tutup</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input className="dc-input !w-auto flex-1 font-mono text-xs" placeholder="ID operasi resmi (dari AI Command Center)" value={operationId} onChange={(e) => setOperationId(e.target.value.trim())} aria-label="ID operasi" />
                    <button type="button" className="dc-btn" onClick={() => void caseAction({ action: "link_operation", operationId }, "link")} disabled={Boolean(actionBusy) || !/^[0-9a-f-]{36}$/i.test(operationId)}>
                      <Link2 className="size-4" aria-hidden /> Tautkan pelaksanaan
                    </button>
                  </div>
                  {actionBusy ? <p className="dc-muted flex items-center gap-2 text-xs"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Memproses…</p> : null}
                </div>
              </Block>
            </div>
          ) : null}
        </div>

        <aside className="min-w-0" aria-label="Riwayat kasus">
          <section className="dc-card p-3">
            <h3 className="dc-sec-h mb-2"><History className="size-4" aria-hidden /> Riwayat kasus</h3>
            {!cases.length ? (
              <p className="dc-muted text-sm">Belum ada kasus.</p>
            ) : (
              <ul className="garage-scroll max-h-[70vh] space-y-1.5 overflow-y-auto">
                {cases.map((row) => (
                  <li key={row.id}>
                    <button type="button" className="dc-row !grid-cols-[minmax(0,1fr)_auto]" data-active={row.id === current?.id} onClick={() => void openCase(row.id)}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{row.question}</span>
                        <span className="dc-muted block font-mono text-[11px]">{row.caseNo} · {when(row.updatedAt)}</span>
                      </span>
                      <span className="dc-pill" data-tone={row.status === "resolved" ? "green" : row.status === "dismissed" ? "neutral" : "amber"}>{STATUS_LABEL[row.status] ?? row.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
