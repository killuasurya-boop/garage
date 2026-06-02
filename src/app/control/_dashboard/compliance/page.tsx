"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";

type Item = {
  id: string;
  category: string;
  name: string;
  issuer: string | null;
  refNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  reminderDays: number;
  status: string;
  derivedStatus: string;
  daysToExpiry: number | null;
  notes: string | null;
};

type ListResponse = {
  items: Item[];
  summary: { total: number; active: number; grace: number; expired: number; archived: number };
};

const categories = ["Pajak", "BPJS", "Izin", "Sertifikat", "Training", "Lainnya"];

export default function CompliancePage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    category: string;
    name: string;
    issuer: string;
    refNumber: string;
    issuedAt: string;
    expiresAt: string;
    reminderDays: number;
    notes: string;
  }>({
    category: "Pajak",
    name: "",
    issuer: "",
    refNumber: "",
    issuedAt: "",
    expiresAt: "",
    reminderDays: 30,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/compliance", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: ListResponse };
      setData(json.data ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat compliance");
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(async () => {
      await refresh();
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  const create = async () => {
    if (!form.name.trim()) {
      setError("Nama wajib diisi");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        category: form.category,
        name: form.name,
        issuer: form.issuer || null,
        refNumber: form.refNumber || null,
        issuedAt: form.issuedAt || null,
        expiresAt: form.expiresAt || null,
        reminderDays: form.reminderDays,
        notes: form.notes || null,
      };
      const res = await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status} — ${txt.slice(0, 120)}`);
      }
      setForm({
        category: "Pajak",
        name: "",
        issuer: "",
        refNumber: "",
        issuedAt: "",
        expiresAt: "",
        reminderDays: 30,
        notes: "",
      });
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/compliance/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arsip gagal");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus item ini permanen?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/compliance/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hapus gagal");
    } finally {
      setBusyId(null);
    }
  };

  const sorted = useMemo(() => {
    if (!data) return [] as Item[];
    return [...data.items].sort((a, b) => {
      const rank = (s: string) =>
        s === "expired" ? 0 : s === "grace" ? 1 : s === "active" ? 2 : 3;
      const r = rank(a.derivedStatus) - rank(b.derivedStatus);
      if (r !== 0) return r;
      return (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999);
    });
  }, [data]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Compliance Tracker"
        title="Pajak, BPJS, Izin & Sertifikat"
        subtitle="Pantau dokumen yang akan kadaluarsa supaya tidak kena denda atau terhenti operasi."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#ffd8a8] hover:bg-[color-mix(in_srgb,var(--garage-amber)_28%,transparent)]"
            >
              <Plus className="h-3.5 w-3.5" /> {showForm ? "Tutup Form" : "Tambah"}
            </button>
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

      {/* Form tambah */}
      {showForm && (
        <Panel title="Tambah Compliance Item" subtitle="Catat dokumen baru atau perpanjangan">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Kategori">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-xs text-zinc-100"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nama Dokumen *">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="contoh: SPT Tahunan PPh Badan 2026"
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-xs text-zinc-100"
              />
            </Field>
            <Field label="Penerbit">
              <input
                value={form.issuer}
                onChange={(e) => setForm({ ...form, issuer: e.target.value })}
                placeholder="DJP / BPJS / Pemkot / dst"
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-xs text-zinc-100"
              />
            </Field>
            <Field label="No. Referensi">
              <input
                value={form.refNumber}
                onChange={(e) => setForm({ ...form, refNumber: e.target.value })}
                placeholder="No SK/SIUP/NPWP"
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-xs text-zinc-100"
              />
            </Field>
            <Field label="Terbit">
              <input
                type="date"
                value={form.issuedAt}
                onChange={(e) => setForm({ ...form, issuedAt: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-xs text-zinc-100"
              />
            </Field>
            <Field label="Kadaluarsa">
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-xs text-zinc-100"
              />
            </Field>
            <Field label="Reminder (hari sebelum)">
              <input
                type="number"
                min={1}
                max={365}
                value={form.reminderDays}
                onChange={(e) => setForm({ ...form, reminderDays: Number(e.target.value) || 30 })}
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-xs text-zinc-100"
              />
            </Field>
            <Field label="Catatan" full>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-xs text-zinc-100"
              />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void create()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)] px-4 py-2 text-xs font-semibold uppercase text-[#ffd8a8] hover:bg-[color-mix(in_srgb,var(--garage-amber)_28%,transparent)] disabled:opacity-60"
            >
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </Panel>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Aktif"
          value={data?.summary.active ?? 0}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <Kpi
          label="Akan Kadaluarsa"
          value={data?.summary.grace ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={(data?.summary.grace ?? 0) > 0 ? "amber" : "chrome"}
        />
        <Kpi
          label="Kadaluarsa"
          value={data?.summary.expired ?? 0}
          icon={<ShieldAlert className="h-4 w-4" />}
          tone={(data?.summary.expired ?? 0) > 0 ? "red" : "success"}
        />
        <Kpi
          label="Diarsipkan"
          value={data?.summary.archived ?? 0}
          icon={<Archive className="h-4 w-4" />}
          tone="chrome"
        />
      </div>

      <Panel title="Daftar Compliance" subtitle={`${sorted.length} item, diurutkan dari yang paling kritis`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">Kategori</th>
                <th className="py-2 pr-3 font-semibold">Nama Dokumen</th>
                <th className="py-2 pr-3 font-semibold">Penerbit</th>
                <th className="py-2 pr-3 font-semibold">No. Ref</th>
                <th className="py-2 pr-3 font-semibold">Kadaluarsa</th>
                <th className="py-2 pr-3 font-semibold text-right">Hari</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-zinc-500">
                    Memuat…
                  </td>
                </tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-zinc-500">
                    <ClipboardCheck className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    Belum ada compliance item. Klik <strong>Tambah</strong> untuk mulai.
                  </td>
                </tr>
              )}
              {sorted.map((it) => (
                <tr key={it.id} className="text-zinc-200">
                  <td className="py-2 pr-3">
                    <Badge tone="info">{it.category}</Badge>
                  </td>
                  <td className="py-2 pr-3 font-medium">{it.name}</td>
                  <td className="py-2 pr-3 text-zinc-400">{it.issuer ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-zinc-400">{it.refNumber ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-zinc-400">{it.expiresAt ?? "—"}</td>
                  <td
                    className={`py-2 pr-3 text-right font-mono ${
                      it.daysToExpiry == null
                        ? "text-zinc-500"
                        : it.daysToExpiry < 0
                          ? "text-[#ffb1b1]"
                          : it.daysToExpiry <= it.reminderDays
                            ? "text-[#ffd8a8]"
                            : "text-zinc-200"
                    }`}
                  >
                    {it.daysToExpiry == null
                      ? "—"
                      : it.daysToExpiry < 0
                        ? `${Math.abs(it.daysToExpiry)}h lewat`
                        : `${it.daysToExpiry}h`}
                  </td>
                  <td className="py-2 pr-3">
                    {it.derivedStatus === "active" && <Badge tone="success">Aktif</Badge>}
                    {it.derivedStatus === "grace" && <Badge tone="amber">Akan kadaluarsa</Badge>}
                    {it.derivedStatus === "expired" && <Badge tone="red">Kadaluarsa</Badge>}
                    {it.derivedStatus === "archived" && <Badge tone="muted">Diarsipkan</Badge>}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      {it.derivedStatus !== "archived" && (
                        <button
                          type="button"
                          onClick={() => void archive(it.id)}
                          disabled={busyId === it.id}
                          className="rounded-md border border-white/10 bg-[var(--garage-bg-3)] p-1 text-zinc-300 hover:text-zinc-100 disabled:opacity-60"
                          title="Arsipkan"
                        >
                          <Archive className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void remove(it.id)}
                        disabled={busyId === it.id}
                        className="rounded-md border border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_10%,transparent)] p-1 text-[#ffb1b1] hover:bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)] disabled:opacity-60"
                        title="Hapus"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Catatan" subtitle="Untuk Owner & Admin">
        <ul className="ml-4 list-disc space-y-1 text-xs text-zinc-400">
          <li>Status di-compute server-side dari <code>expiresAt</code> + <code>reminderDays</code> tiap GET.</li>
          <li>Daftar diurutkan: kadaluarsa → akan kadaluarsa → aktif → arsip; lalu hari tersisa ascending.</li>
          <li>Tambahkan item baru saat memperpanjang sertifikat — jangan edit yang lama (jejak audit).</li>
          <li>Setelah jalankan <code>npm run db:generate</code> dan <code>npm run db:migrate</code> sekali untuk membuat tabel.</li>
        </ul>
      </Panel>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <label className="text-[10px] font-semibold uppercase text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "red" | "amber" | "success" | "chrome";
}) {
  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase text-zinc-400">{label}</p>
        <span className="text-zinc-400">{icon}</span>
      </div>
      <p className="mt-1 font-[var(--garage-font-display)] text-2xl font-black text-zinc-50">{value}</p>
      <Badge tone={tone} className="mt-2">
        {tone === "red" ? "tindak" : tone === "amber" ? "siapkan" : "ok"}
      </Badge>
    </div>
  );
}
