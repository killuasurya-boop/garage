"use client";

// Owner Access Approval Center (I3, PRD V4.0 §06.6, SYS-01). Owner memutuskan
// pengajuan akses staf: jabatan & outlet dipilih Owner (allowlist), alasan wajib.
import { CheckCircle2, MessageSquareWarning, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import { garageApi } from "@/lib/api-client";

type RequestRow = {
  id: string;
  status: "pending_owner_approval" | "needs_info" | "approved" | "rejected";
  legalName: string;
  accountName: string;
  email: string;
  emailVerified: boolean;
  phone: string;
  whatsappVerified: boolean;
  requestedPosition: string;
  note: string | null;
  infoRequest: string | null;
  decisionReason: string | null;
  approvedRole: string | null;
  approvedOutlet: string | null;
  decidedAt: string | null;
  createdAt: string;
};
type Outlet = { id: string; code: string; name: string };
type Decision = "approve" | "reject" | "request_info";

const ROLES = ["Kasir", "Waiter", "Manajer"] as const;
const WORKSTATIONS = [
  { value: "", label: "Tidak ditugaskan produksi" },
  { value: "bar", label: "Bar" },
  { value: "dapur", label: "Dapur" },
  { value: "all", label: "Bar + Dapur" },
  { value: "helper_bar", label: "Helper Bar" },
  { value: "helper_dapur", label: "Helper Dapur" },
  { value: "kurir", label: "Kurir" },
];
const STATUS_LABEL: Record<RequestRow["status"], { label: string; tone: "amber" | "info" | "success" | "red" }> = {
  pending_owner_approval: { label: "Menunggu Owner", tone: "amber" },
  needs_info: { label: "Minta info", tone: "info" },
  approved: { label: "Disetujui", tone: "success" },
  rejected: { label: "Ditolak", tone: "red" },
};
const fieldClass = "w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100";

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

function DecisionForm({ row, outlets, onDone }: { row: RequestRow; outlets: Outlet[]; onDone: () => void }) {
  const [decision, setDecision] = useState<Decision>("approve");
  const [role, setRole] = useState<(typeof ROLES)[number]>("Kasir");
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [position, setPosition] = useState(row.requestedPosition);
  const [workstation, setWorkstation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body =
        decision === "approve"
          ? { decision, role, outletId, position, workstation: workstation || null, reason }
          : { decision, reason };
      await garageApi.post(`/api/control/access-requests/${row.id}/decision`, body);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan.");
    } finally {
      setBusy(false);
    }
  }

  const id = (name: string) => `${name}-${row.id}`;
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Keputusan">
        {(
          [
            ["approve", "Setujui", CheckCircle2],
            ["request_info", "Minta info", MessageSquareWarning],
            ["reject", "Tolak", XCircle],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={decision === value}
            onClick={() => setDecision(value)}
            className={`garage-press inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold ${
              decision === value ? "border-[var(--garage-red)] bg-[var(--garage-red)] text-white" : "border-white/15 text-zinc-200"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {decision === "approve" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={id("role")} className="space-y-1 text-xs uppercase text-zinc-400">
            Peran
            <select id={id("role")} className={fieldClass} value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}>
              {ROLES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label htmlFor={id("outlet")} className="space-y-1 text-xs uppercase text-zinc-400">
            Outlet
            <select id={id("outlet")} className={fieldClass} value={outletId} onChange={(e) => setOutletId(e.target.value)}>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.code} · {outlet.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={id("position")} className="space-y-1 text-xs uppercase text-zinc-400">
            Jabatan
            <input id={id("position")} className={fieldClass} value={position} onChange={(e) => setPosition(e.target.value)} />
          </label>
          <label htmlFor={id("ws")} className="space-y-1 text-xs uppercase text-zinc-400">
            Workstation
            <select id={id("ws")} className={fieldClass} value={workstation} onChange={(e) => setWorkstation(e.target.value)}>
              {WORKSTATIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <label htmlFor={id("reason")} className="block space-y-1 text-xs uppercase text-zinc-400">
        {decision === "request_info" ? "Info yang diminta" : "Alasan keputusan"}
        <textarea id={id("reason")} rows={2} className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error ? <p className="text-sm text-[#ffb1b1]" role="alert">{error}</p> : null}
      <button
        type="button"
        disabled={busy || reason.trim().length < 3 || (decision === "approve" && !outletId)}
        onClick={() => void submit()}
        className="garage-press inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--garage-red)] px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        <ShieldCheck className="size-4" aria-hidden />
        {busy ? "Menyimpan…" : "Simpan keputusan"}
      </button>
    </div>
  );
}

export function AccessApprovalCenter() {
  const [status, setStatus] = useState<"open" | "all">("open");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    garageApi
      .get<{ requests: RequestRow[]; outlets: Outlet[] }>(`/api/control/access-requests?status=${status}`, { cache: "no-store" })
      .then((data) => {
        if (cancelled) return;
        setRows(data.requests);
        setOutlets(data.outlets);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Gagal memuat pengajuan."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, reloadKey]);

  return (
    <div className="space-y-4">
      <PageHeader
        kicker="SYS-01"
        title="Persetujuan Akses Staf"
        subtitle="Pendaftar baru tidak bisa membuka POS, shift, keuangan, stok, atau payroll sampai Owner menyetujui. Peran & outlet ditentukan Owner."
        actions={
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              reload();
            }}
            aria-label="Muat ulang pengajuan"
            className="garage-press inline-flex size-10 items-center justify-center rounded-lg border border-white/15 text-zinc-100"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          </button>
        }
      />
      <div className="flex gap-2" role="tablist" aria-label="Filter status">
        {(
          [
            ["open", "Perlu keputusan"],
            ["all", "Semua"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => {
              setLoading(true);
              setStatus(value);
            }}
            className={`garage-press min-h-10 rounded-lg border px-3 text-sm font-semibold ${status === value ? "border-[var(--garage-amber)] text-[#ffd8a8]" : "border-white/15 text-zinc-300"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-[#ffb1b1]" role="alert">{error}</p> : null}
      {!loading && !rows.length ? <Panel><p className="text-sm text-zinc-300">Tidak ada pengajuan.</p></Panel> : null}

      <div className="grid gap-3">
        {rows.map((row) => {
          const badge = STATUS_LABEL[row.status];
          const open = row.status === "pending_owner_approval" || row.status === "needs_info";
          return (
            <Panel key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-zinc-50">{row.legalName}</p>
                  <p className="text-sm text-zinc-300">Melamar: {row.requestedPosition}</p>
                </div>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </div>
              <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex flex-wrap gap-1"><dt className="text-zinc-400">Email:</dt><dd className="break-all text-zinc-100">{row.email}</dd><dd className={row.emailVerified ? "text-[#a8f0c4]" : "text-[#ffd8a8]"}>({row.emailVerified ? "terverifikasi" : "belum terverifikasi"})</dd></div>
                <div className="flex flex-wrap gap-1"><dt className="text-zinc-400">WhatsApp:</dt><dd className="text-zinc-100">{row.phone}</dd><dd className={row.whatsappVerified ? "text-[#a8f0c4]" : "text-[#ffd8a8]"}>({row.whatsappVerified ? "terverifikasi" : "belum terverifikasi"})</dd></div>
                <div className="flex gap-1"><dt className="text-zinc-400">Diajukan:</dt><dd className="text-zinc-100">{formatTime(row.createdAt)}</dd></div>
                {row.decidedAt ? <div className="flex gap-1"><dt className="text-zinc-400">Diputuskan:</dt><dd className="text-zinc-100">{formatTime(row.decidedAt)}</dd></div> : null}
                {row.approvedRole ? <div className="flex gap-1"><dt className="text-zinc-400">Akses:</dt><dd className="text-zinc-100">{row.approvedRole} · {row.approvedOutlet}</dd></div> : null}
              </dl>
              {row.note ? <p className="mt-2 text-sm text-zinc-300">Catatan pemohon: {row.note}</p> : null}
              {row.infoRequest ? <p className="mt-1 text-sm text-[#ffd8a8]">Info diminta: {row.infoRequest}</p> : null}
              {row.decisionReason ? <p className="mt-1 text-sm text-zinc-300">Alasan: {row.decisionReason}</p> : null}
              {!row.emailVerified || !row.whatsappVerified ? (
                <p className="mt-2 text-xs text-[#ffd8a8]">
                  Verifikasi otomatis email/WhatsApp belum aktif. Pastikan identitas & nomor pemohon secara langsung sebelum menyetujui.
                </p>
              ) : null}
              {open ? (
                openId === row.id ? (
                  <DecisionForm
                    row={row}
                    outlets={outlets}
                    onDone={() => {
                      setOpenId(null);
                      setLoading(true);
                      reload();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenId(row.id)}
                    className="garage-press mt-3 inline-flex min-h-10 items-center rounded-lg border border-white/15 px-3 text-sm font-semibold text-zinc-100"
                  >
                    Putuskan
                  </button>
                )
              ) : null}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
