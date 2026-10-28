"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderPlus, RefreshCw, ShieldAlert } from "lucide-react";

import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import {
  RISK_DISPOSITION_LABEL,
  RISK_DISPOSITIONS,
  RISK_LEVEL_LABEL,
  type RiskDisposition,
  type RiskLevel,
} from "@/lib/risk-rules";

type RiskAlert = {
  id: string;
  ruleId: string;
  ruleVersion: number;
  riskLevel: RiskLevel;
  title: string;
  explanation: string;
  eventAt: string;
  sessionCode: string | null;
  personName: string | null;
  personRole: string | null;
  custodyScope: string;
  completeness: string;
  disposition: RiskDisposition;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  auditCaseId: string | null;
  viewerIsSubject: boolean;
};

const dateTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const CUSTODY_LABEL: Record<string, string> = {
  cashier: "Laci kasir",
  manager: "Pemeriksa/Manajer",
  qris: "Rekonsiliasi QRIS",
  bank: "Setoran bank",
  system: "Sistem",
};
const levelTone = (level: number) => (level >= 4 ? "red" : level === 3 ? "amber" : level === 2 ? "chrome" : "muted");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: { "content-type": "application/json" }, ...init });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json.data;
}

/**
 * B6 (PRD §14): alert risiko LV1–LV5 = prioritas pemeriksaan, bukan vonis. Owner/Manajer
 * memberi disposisi + catatan bukti; kesimpulan akhir (Terbukti/Ditutup) hanya Owner.
 */
export function RiskAlertsPanel({ isOwner = true }: { isOwner?: boolean }) {
  const [filter, setFilter] = useState<RiskDisposition | "ALL">("OPEN");
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [disposition, setDisposition] = useState<RiskDisposition>("EXPLAINED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ alerts: RiskAlert[] }>(`/api/control/risk?disposition=${filter}`);
      setAlerts(data.alerts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat alert risiko");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOpenId(null);
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  const choices = RISK_DISPOSITIONS.filter((d) => d !== "OPEN" && (isOwner || (d !== "SUBSTANTIATED" && d !== "CLOSED")));

  return (
    <Panel
      title="Alert Risiko"
      subtitle="Prioritas pemeriksaan, bukan vonis. Setiap alert menyebut aturan & buktinya."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as RiskDisposition | "ALL")}
            className="h-9 rounded-md border border-white/15 bg-black/30 px-2 text-xs text-zinc-100"
            aria-label="Filter status alert"
          >
            <option value="ALL">Semua status</option>
            {RISK_DISPOSITIONS.map((d) => (
              <option key={d} value={d}>
                {RISK_DISPOSITION_LABEL[d]}
              </option>
            ))}
          </select>
          {isOwner ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => api("/api/control/risk", { method: "POST", body: JSON.stringify({ days: 30 }) }))}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 px-3 text-xs font-semibold text-zinc-100 hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Pindai ulang 30 hari
            </button>
          ) : null}
        </div>
      }
    >
      {error ? <p className="mb-2 text-xs font-semibold text-[#ffb1b1]">{error}</p> : null}
      {loading ? (
        <p className="text-xs text-zinc-400">Memuat…</p>
      ) : alerts.length === 0 ? (
        <p className="text-xs text-zinc-400">Tidak ada alert untuk filter ini.</p>
      ) : (
        <ul className="space-y-2" data-testid="risk-alerts">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-lg border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={levelTone(alert.riskLevel)}>{RISK_LEVEL_LABEL[alert.riskLevel]}</Badge>
                <span className="text-sm font-semibold text-zinc-50">{alert.title}</span>
                <Badge tone={alert.disposition === "OPEN" ? "amber" : "muted"}>{RISK_DISPOSITION_LABEL[alert.disposition]}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-300">{alert.explanation}</p>
              <p className="mt-1 text-[11px] text-zinc-400">
                {dateTime.format(new Date(alert.eventAt))} · {alert.sessionCode ?? "-"} · {CUSTODY_LABEL[alert.custodyScope] ?? alert.custodyScope}
                {alert.personName ? ` · terkait ${alert.personName}` : ""} · aturan {alert.ruleId} v{alert.ruleVersion} · bukti{" "}
                {alert.completeness === "complete" ? "lengkap" : "sebagian"}
              </p>
              {alert.reviewedAt ? (
                <p className="mt-1 text-[11px] text-zinc-300">
                  Diperiksa {alert.reviewerName ?? "-"} · {dateTime.format(new Date(alert.reviewedAt))}
                  {alert.reviewNote ? ` · ${alert.reviewNote}` : ""}
                </p>
              ) : null}
              {alert.viewerIsSubject && !isOwner ? (
                <p className="mt-2 text-[11px] text-zinc-400">Alert ini tentang Anda — diperiksa Owner/Manajer lain.</p>
              ) : openId === alert.id ? (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {choices.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDisposition(d)}
                        className={`min-h-9 rounded-md border px-2.5 text-xs font-semibold ${
                          disposition === d ? "border-[var(--garage-amber)] bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)] text-white" : "border-white/15 text-zinc-300"
                        }`}
                      >
                        {RISK_DISPOSITION_LABEL[d]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Dasar keputusan / bukti yang diperiksa (min. 10 karakter)"
                    className="min-h-16 w-full rounded-md border border-white/15 bg-black/30 p-2 text-xs text-zinc-100"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || note.trim().length < 10}
                      onClick={() => void run(() => api(`/api/control/risk/${alert.id}`, { method: "PATCH", body: JSON.stringify({ disposition, note }) }))}
                      className="h-9 rounded-md bg-[var(--garage-amber)] px-3 text-xs font-bold text-black disabled:opacity-50"
                    >
                      Simpan pemeriksaan
                    </button>
                    <button type="button" onClick={() => setOpenId(null)} className="h-9 rounded-md border border-white/15 px-3 text-xs text-zinc-300">
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {alert.disposition === "OPEN" || isOwner ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(alert.id);
                        setDisposition("EXPLAINED");
                        setNote("");
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 px-3 text-xs font-semibold text-zinc-100 hover:bg-white/10"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" /> Periksa
                    </button>
                  ) : null}
                  {alert.auditCaseId ? (
                    <Badge tone="info">Kasus dibuka</Badge>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => api(`/api/control/risk/${alert.id}/case`, { method: "POST" }))}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 px-3 text-xs font-semibold text-zinc-100 hover:bg-white/10 disabled:opacity-50"
                    >
                      <FolderPlus className="h-3.5 w-3.5" /> Jadikan kasus
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
