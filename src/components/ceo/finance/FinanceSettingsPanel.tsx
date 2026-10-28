"use client";

import { ArrowLeft, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { FinanceSettingsBundle } from "@/lib/finance-control";
import { EXPENSE_GROUP_LABEL, type ExpenseGroup } from "@/lib/finance-control-core";
import { FinanceCard, EmptyNote } from "./FinanceCards";
import { rupiah } from "./finance-format";

type Draft = FinanceSettingsBundle;

const input =
  "min-h-10 w-full min-w-0 rounded-lg border border-white/15 bg-[var(--garage-input-bg)] px-2.5 text-sm text-zinc-100 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-[var(--garage-focus-ring)]";
const th = "px-2 py-2 text-left text-[11px] font-bold uppercase text-zinc-400";
const td = "px-2 py-1.5 align-middle";

const COST_CLASS = [
  ["fixed", "Tetap"],
  ["variable", "Variabel"],
  ["semi_variable", "Semi variabel"],
  ["reserve", "Cadangan"],
] as const;

const TREATMENT = [
  ["accrue", "Akru harian ke P&L"],
  ["budget_only", "Budget saja"],
  ["reserve", "Cadangan (bukan expense)"],
] as const;

function NumberInput({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  // Tampil dengan pemisah ribuan (500.000.000) agar nominal besar mudah dibaca.
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      className={`${input} text-right font-mono tabular-nums`}
      value={Number.isFinite(value) ? new Intl.NumberFormat("id-ID").format(value) : ""}
      onChange={(event) => {
        const raw = event.target.value.trim();
        const digits = Number(raw.replace(/[^\d]/g, "")) || 0;
        onChange(raw.startsWith("-") ? -digits : digits);
      }}
    />
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-bold uppercase text-zinc-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-zinc-400">{hint}</span> : null}
    </label>
  );
}

function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-[#ffb1b1] active:scale-95"
    >
      {children}
    </button>
  );
}

export function FinanceSettingsPanel() {
  const [original, setOriginal] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/finance/control-settings", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        setError(json?.error?.message ?? "Gagal memuat pengaturan.");
        return;
      }
      setOriginal(json.data);
      setDraft(json.data);
    })();
  }, []);

  const dirty = useMemo(() => JSON.stringify(original) !== JSON.stringify(draft), [original, draft]);
  const payrollTotal = draft?.payrollPositions.filter((row) => row.active).reduce((sum, row) => sum + row.monthlySalary * row.headcount, 0) ?? 0;
  const dailyTotals = useMemo(() => {
    const items = draft?.costItems.filter((item) => item.active) ?? [];
    return {
      accrue: items.filter((item) => item.treatment === "accrue" && item.code !== "GAJI").reduce((sum, item) => sum + item.dailyAmount, 0),
      wage: items.find((item) => item.code === "GAJI" && item.treatment !== "reserve")?.dailyAmount ?? 0,
      wageInPnl: items.some((item) => item.code === "GAJI" && item.treatment === "accrue"),
      reserve: items.filter((item) => item.treatment === "reserve").reduce((sum, item) => sum + item.dailyAmount, 0),
    };
  }, [draft]);

  if (error) return <EmptyNote text={error} />;
  if (!draft || !original) return <div className="h-64 animate-pulse rounded-2xl bg-[var(--garage-bg-2)] motion-reduce:animate-none" />;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setSettings = (patch: Partial<Draft["settings"]>) => set({ settings: { ...draft.settings, ...patch } });

  async function save() {
    if (!draft || !original) return;
    if (reason.trim().length < 3) {
      toast.error("Isi alasan perubahan (wajib untuk audit trail).");
      return;
    }
    setSaving(true);
    const changed = (key: keyof Draft) => JSON.stringify(original[key]) !== JSON.stringify(draft[key]);
    const body = {
      reason: reason.trim(),
      ...(changed("settings") ? { settings: draft.settings } : {}),
      ...(changed("costItems") ? { costItems: draft.costItems } : {}),
      ...(changed("payrollPositions") ? { payrollPositions: draft.payrollPositions } : {}),
      ...(changed("categories") ? { categories: draft.categories } : {}),
      ...(changed("capital")
        ? { capital: draft.capital.map(({ date, type, amount, description }) => ({ date, type, amount, description })) }
        : {}),
    };
    try {
      const response = await fetch("/api/finance/control-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Gagal menyimpan.");
      setOriginal(json.data.bundle);
      setDraft(json.data.bundle);
      setReason("");
      toast.success(`Tersimpan: ${json.data.changed.join(", ") || "tidak ada perubahan"}. Snapshot dihitung ulang.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function rebuild() {
    const response = await fetch("/api/finance/snapshots/rebuild", { method: "POST" });
    const json = await response.json();
    if (response.ok) toast.success(`Snapshot ${json.data.days} hari dihitung ulang.`);
    else toast.error(json?.error?.message ?? "Gagal menghitung ulang snapshot.");
  }

  return (
    <div className="space-y-5 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/control/financial" className="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-300 hover:text-zinc-50">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Dashboard keuangan
          </Link>
          <h1 className="mt-1 font-[var(--garage-font-display)] text-3xl font-black uppercase text-zinc-50">Pengaturan Finance</h1>
          <p className="text-sm text-zinc-300">Master data untuk P&L, BEP, cashflow, dan capital recovery. Setiap perubahan tercatat di audit log.</p>
        </div>
        <button
          type="button"
          onClick={() => void rebuild()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-bold text-zinc-100 hover:bg-white/12 active:scale-[0.98]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Hitung ulang snapshot
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
        <FinanceCard title="Umum & kas" subtitle="Tanggal mulai bisnis menjadi awal perhitungan akru dan capital recovery">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2">
            <Field label="Tanggal mulai bisnis">
              <input type="date" className={input} value={draft.settings.businessStartDate} onChange={(e) => setSettings({ businessStartDate: e.target.value })} />
            </Field>
            <Field label="Target omzet harian" hint="Kosongkan (0) bila belum ada target.">
              <NumberInput
                label="Target omzet harian"
                value={draft.settings.revenueTargetDaily ?? 0}
                onChange={(value) => setSettings({ revenueTargetDaily: value > 0 ? value : null })}
              />
            </Field>
            <Field label="Batas approval expense" hint={`Expense ≥ ${rupiah(draft.settings.expenseApprovalThreshold)} wajib disetujui Manajer/Owner.`}>
              <NumberInput
                label="Batas approval expense"
                value={draft.settings.expenseApprovalThreshold}
                onChange={(value) => setSettings({ expenseApprovalThreshold: value })}
              />
            </Field>
            <Field
              label="Batas approval Owner"
              hint={`Expense ≥ ${rupiah(draft.settings.expenseOwnerApprovalThreshold)}: Manajer review dulu, keputusan final Owner.`}
            >
              <NumberInput
                label="Batas approval Owner"
                value={draft.settings.expenseOwnerApprovalThreshold}
                onChange={(value) => setSettings({ expenseOwnerApprovalThreshold: value })}
              />
            </Field>
            <Field label="Saldo kas awal" hint={rupiah(draft.settings.openingCash.amount)}>
              <NumberInput
                label="Saldo kas awal"
                value={draft.settings.openingCash.amount}
                onChange={(value) => setSettings({ openingCash: { ...draft.settings.openingCash, amount: value, isSet: true } })}
              />
            </Field>
            <Field label="Per tanggal">
              <input
                type="date"
                className={input}
                value={draft.settings.openingCash.date}
                onChange={(e) => setSettings({ openingCash: { ...draft.settings.openingCash, date: e.target.value, isSet: true } })}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Isi saldo kas riil pada awal tanggal tersebut (sudah termasuk modal yang disetor sampai tanggal itu). Kas = saldo awal + uang
            masuk POS + setoran modal berikutnya − semua pengeluaran.
            {!draft.settings.openingCash.isSet ? " Saldo awal belum dikonfirmasi." : ""}
          </p>
        </FinanceCard>

        <FinanceCard
          title="Modal (capital injection)"
          subtitle="Modal bukan revenue — hanya dasar capital recovery & kas masuk"
          actions={
            <button
              type="button"
              onClick={() =>
                set({
                  capital: [
                    ...draft.capital,
                    { id: `new-${Date.now()}`, date: draft.settings.businessStartDate, type: "injection", amount: 0, description: "" },
                  ],
                })
              }
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-bold uppercase text-zinc-100 hover:bg-white/15"
            >
              <Plus className="h-4 w-4" aria-hidden /> Tambah
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <th className={`${th} w-44`}>Tanggal</th>
                  <th className={`${th} w-48`}>Jenis</th>
                  <th className={`${th} w-48 text-right`}>Nominal</th>
                  <th className={th}>Keterangan</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {draft.capital.map((row, index) => {
                  const update = (patch: Partial<typeof row>) =>
                    set({ capital: draft.capital.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
                  return (
                    <tr key={row.id} className="border-t border-white/8">
                      <td className={td}><input type="date" aria-label={`Tanggal modal baris ${index + 1}`} className={input} value={row.date} onChange={(e) => update({ date: e.target.value })} /></td>
                      <td className={td}>
                        <select aria-label={`Jenis modal baris ${index + 1}`} className={input} value={row.type} onChange={(e) => update({ type: e.target.value })}>
                          <option value="injection">Setoran modal</option>
                          <option value="withdrawal">Penarikan modal</option>
                        </select>
                      </td>
                      <td className={td}><NumberInput label="Nominal modal" value={row.amount} onChange={(amount) => update({ amount })} /></td>
                      <td className={td}><input aria-label={`Keterangan modal baris ${index + 1}`} className={input} value={row.description} onChange={(e) => update({ description: e.target.value })} /></td>
                      <td className={td}>
                        <IconButton label="Hapus baris modal" onClick={() => set({ capital: draft.capital.filter((_, i) => i !== index) })}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </FinanceCard>
      </div>

      <FinanceCard
        title="Biaya harian (operating cost master)"
        subtitle={`Total ${rupiah(dailyTotals.accrue + dailyTotals.wage + dailyTotals.reserve)}/hari · operasional ${rupiah(dailyTotals.accrue + dailyTotals.wage)} (akru ${rupiah(dailyTotals.accrue)} + upah ${rupiah(dailyTotals.wage)}${dailyTotals.wageInPnl ? "" : " hanya patokan BEP"}) · Save Money ${rupiah(dailyTotals.reserve)}`}
        actions={
          <button
            type="button"
            onClick={() =>
              set({
                costItems: [
                  ...draft.costItems,
                  { code: `BIAYA${draft.costItems.length + 1}`, name: "Biaya baru", dailyAmount: 0, costClass: "fixed", treatment: "accrue", active: true, sortOrder: draft.costItems.length + 1 },
                ],
              })
            }
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-bold uppercase text-zinc-100 hover:bg-white/15"
          >
            <Plus className="h-4 w-4" aria-hidden /> Tambah
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr>
                <th className={th}>Kode</th>
                <th className={th}>Nama</th>
                <th className={`${th} text-right`}>Nilai / hari</th>
                <th className={th}>Kelas biaya</th>
                <th className={th}>Perlakuan</th>
                <th className={th}>Aktif</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {draft.costItems.map((item, index) => {
                const update = (patch: Partial<typeof item>) =>
                  set({ costItems: draft.costItems.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
                return (
                  <tr key={`${item.code}-${index}`} className="border-t border-white/8">
                    <td className={`${td} w-32`}><input aria-label={`Kode biaya baris ${index + 1}`} className={`${input} font-mono uppercase`} value={item.code} onChange={(e) => update({ code: e.target.value.toUpperCase() })} /></td>
                    <td className={td}><input aria-label={`Nama biaya baris ${index + 1}`} className={input} value={item.name} onChange={(e) => update({ name: e.target.value })} /></td>
                    <td className={`${td} w-40`}><NumberInput label={`Nilai ${item.name}`} value={item.dailyAmount} onChange={(dailyAmount) => update({ dailyAmount })} /></td>
                    <td className={`${td} w-40`}>
                      <select aria-label={`Kelas biaya ${item.name}`} className={input} value={item.costClass} onChange={(e) => update({ costClass: e.target.value as typeof item.costClass })}>
                        {COST_CLASS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    <td className={`${td} w-60`}>
                      <select aria-label={`Perlakuan biaya ${item.name}`} className={input} value={item.treatment} onChange={(e) => update({ treatment: e.target.value as typeof item.treatment })}>
                        {TREATMENT.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    <td className={td}>
                      <input type="checkbox" aria-label={`Aktifkan ${item.name}`} className="h-5 w-5 accent-[var(--garage-red)]" checked={item.active} onChange={(e) => update({ active: e.target.checked })} />
                    </td>
                    <td className={td}>
                      <IconButton label={`Hapus ${item.name}`} onClick={() => set({ costItems: draft.costItems.filter((_, i) => i !== index) })}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          Kode <span className="font-mono text-zinc-200">GAJI</span> = upah karyawan per hari: dipakai sebagai biaya tetap upah untuk BEP
          (bila kosong, dipakai payroll master ÷ 30). Payroll aktual di laba-rugi selalu dari Payroll V2. Save Money adalah cadangan laba —
          tidak mengurangi laba bersih maupun target BEP.
        </p>
      </FinanceCard>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <FinanceCard
          title="Biaya tidak tetap (bahan baku)"
          subtitle="Pemakaian dihitung otomatis dari resep setiap penjualan; anggaran ini jadi acuan harian"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(
              [
                ["barMin", "Belanja Bar — minimal"],
                ["barMax", "Belanja Bar — maksimal"],
                ["dapurMin", "Belanja Dapur — minimal"],
                ["dapurMax", "Belanja Dapur — maksimal"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <NumberInput
                  label={label}
                  value={draft.settings.variableBudget[key]}
                  onChange={(value) => setSettings({ variableBudget: { ...draft.settings.variableBudget, [key]: value } })}
                />
              </Field>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Total anggaran {rupiah(draft.settings.variableBudget.barMin + draft.settings.variableBudget.dapurMin)} –{" "}
            {rupiah(draft.settings.variableBudget.barMax + draft.settings.variableBudget.dapurMax)} / hari. Daftar belanja otomatis
            (stok habis/menipis) tampil di Finance → Biaya Harian &amp; Belanja.
          </p>
        </FinanceCard>

        <FinanceCard title="Metode balik modal (BEP/Payback)" subtitle="Menentukan cara menghitung modal kembali, ROI, dan estimasi balik modal">
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Target profit bersih / bulan"
              hint={
                (draft.settings.netProfitTargetMonthly ?? 0) > 0
                  ? `≈ ${rupiah(Math.round((draft.settings.netProfitTargetMonthly ?? 0) / 30))}/hari · patokan estimasi balik modal.`
                  : "Patokan balik modal: sisa modal ÷ target. Isi 0 bila belum ada."
              }
            >
              <NumberInput
                label="Target profit bersih per bulan"
                value={draft.settings.netProfitTargetMonthly ?? 0}
                onChange={(value) => setSettings({ netProfitTargetMonthly: value > 0 ? value : null })}
              />
            </Field>
            <Field
              label="Biaya bahan baku dihitung dari"
              hint="Belanja gudang: setiap penerimaan barang (dibayar cash) langsung jadi biaya Bar/Dapur."
            >
              <select
                className={input}
                value={draft.settings.cogsBasis}
                onChange={(e) => setSettings({ cogsBasis: e.target.value as Draft["settings"]["cogsBasis"] })}
              >
                <option value="purchase">Belanja masuk gudang (Bar/Dapur)</option>
                <option value="recipe">Pemakaian resep (HPP) + susut</option>
              </select>
            </Field>
          </div>
          <Field label="Metode perhitungan">
            <select
              className={input}
              value={draft.settings.capitalRecoveryMethod}
              onChange={(e) => setSettings({ capitalRecoveryMethod: e.target.value as Draft["settings"]["capitalRecoveryMethod"] })}
            >
              {draft.capitalRecoveryMethods.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </Field>
          <ul className="mt-3 space-y-1.5 text-xs text-zinc-300">
            {draft.capitalRecoveryMethods.map((method) => (
              <li key={method.value}>
                <span className="font-bold text-zinc-100">{method.label}:</span> {method.hint}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-400">
            Saldo kas tidak pernah dihitung sebagai &quot;modal kembali&quot;. Estimasi balik modal ditampilkan dua: sesuai target
            profit bersih, dan sesuai laju aktual 30 hari terakhir (diperbarui setiap hari).
          </p>
        </FinanceCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <FinanceCard
          title="Payroll master (budget)"
          subtitle={`Total ${rupiah(payrollTotal)}/bulan · ${rupiah(Math.round(payrollTotal / 30))}/hari`}
          actions={
            <button
              type="button"
              onClick={() => set({ payrollPositions: [...draft.payrollPositions, { position: "Posisi baru", monthlySalary: 0, headcount: 1, active: true }] })}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-bold uppercase text-zinc-100 hover:bg-white/15"
            >
              <Plus className="h-4 w-4" aria-hidden /> Tambah
            </button>
          }
        >
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full min-w-[480px]">
              <thead className="sticky top-0 bg-[var(--garage-bg-2)]">
                <tr>
                  <th className={th}>Posisi</th>
                  <th className={`${th} text-right`}>Gaji / bulan</th>
                  <th className={th}>Orang</th>
                  <th className={th}>Aktif</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {draft.payrollPositions.map((row, index) => {
                  const update = (patch: Partial<typeof row>) =>
                    set({ payrollPositions: draft.payrollPositions.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
                  return (
                    <tr key={index} className="border-t border-white/8">
                      <td className={td}><input aria-label={`Nama posisi baris ${index + 1}`} className={input} value={row.position} onChange={(e) => update({ position: e.target.value })} /></td>
                      <td className={`${td} w-40`}><NumberInput label={`Gaji ${row.position}`} value={row.monthlySalary} onChange={(monthlySalary) => update({ monthlySalary })} /></td>
                      <td className={`${td} w-20`}><NumberInput label={`Jumlah ${row.position}`} value={row.headcount} onChange={(headcount) => update({ headcount })} /></td>
                      <td className={td}><input type="checkbox" aria-label={`Aktifkan ${row.position}`} className="h-5 w-5 accent-[var(--garage-red)]" checked={row.active} onChange={(e) => update({ active: e.target.checked })} /></td>
                      <td className={td}>
                        <IconButton label={`Hapus ${row.position}`} onClick={() => set({ payrollPositions: draft.payrollPositions.filter((_, i) => i !== index) })}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </FinanceCard>

        <FinanceCard title="Ambang Financial Health" subtitle="Batas yang dipakai untuk status SEHAT / PERHATIAN / KRITIS">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(
              [
                ["hppRatioMax", "Maks. HPP (% omzet)"],
                ["opexRatioMax", "Maks. biaya operasional (% omzet)"],
                ["payrollRatioMax", "Maks. payroll (% omzet)"],
                ["cashRunwaySafeDays", "Kas aman (hari biaya)"],
                ["cashRunwayWarnDays", "Kas kritis di bawah (hari)"],
                ["cashVarianceTolerance", "Toleransi selisih kas (Rp)"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <NumberInput
                  label={label}
                  value={draft.settings.thresholds[key]}
                  onChange={(value) => setSettings({ thresholds: { ...draft.settings.thresholds, [key]: value } })}
                />
              </Field>
            ))}
          </div>
        </FinanceCard>
      </div>

      <FinanceCard
        title="Klasifikasi kategori expense"
        subtitle="Menentukan apakah pengeluaran masuk P&L, hanya cashflow, atau cadangan"
        actions={
          draft.unclassifiedCategories.length ? (
            <button
              type="button"
              onClick={() =>
                set({
                  categories: [
                    ...draft.categories,
                    ...draft.unclassifiedCategories.map((name) => ({ name, groupKey: "opex" as ExpenseGroup, costClass: "variable" as const, costItemCode: null })),
                  ],
                  unclassifiedCategories: [],
                })
              }
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--garage-amber)_20%,transparent)] px-3 text-xs font-bold uppercase text-[#ffd8a8] hover:brightness-110"
            >
              <Plus className="h-4 w-4" aria-hidden /> {draft.unclassifiedCategories.length} kategori baru
            </button>
          ) : null
        }
      >
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[760px]">
            <thead className="sticky top-0 bg-[var(--garage-bg-2)]">
              <tr>
                <th className={th}>Kategori</th>
                <th className={th}>Kelompok</th>
                <th className={th}>Kelas biaya</th>
                <th className={th}>Terhubung ke biaya harian</th>
              </tr>
            </thead>
            <tbody>
              {draft.categories.map((row, index) => {
                const update = (patch: Partial<typeof row>) =>
                  set({ categories: draft.categories.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
                return (
                  <tr key={row.name} className="border-t border-white/8">
                    <td className={`${td} text-sm font-semibold text-zinc-100`}>{row.name}</td>
                    <td className={td}>
                      <select aria-label={`Kelompok kategori ${row.name}`} className={input} value={row.groupKey} onChange={(e) => update({ groupKey: e.target.value as ExpenseGroup })}>
                        {(Object.keys(EXPENSE_GROUP_LABEL) as ExpenseGroup[]).map((key) => (
                          <option key={key} value={key}>{EXPENSE_GROUP_LABEL[key]}</option>
                        ))}
                      </select>
                    </td>
                    <td className={`${td} w-40`}>
                      <select aria-label={`Kelas biaya kategori ${row.name}`} className={input} value={row.costClass} onChange={(e) => update({ costClass: e.target.value as typeof row.costClass })}>
                        {COST_CLASS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    <td className={`${td} w-56`}>
                      <select aria-label={`Item biaya kategori ${row.name}`} className={input} value={row.costItemCode ?? ""} onChange={(e) => update({ costItemCode: e.target.value || null })}>
                        <option value="">— tidak —</option>
                        {draft.costItems.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          Kategori yang terhubung ke biaya harian berperlakuan &quot;akru&quot; hanya dihitung di cashflow (P&L sudah memakai nilai akru) agar tidak dobel.
          Belanja bahan tidak masuk P&L langsung — HPP dihitung dari resep × harga bahan.
        </p>
      </FinanceCard>

      {/* Bar simpan hanya muncul saat ada perubahan; padding bawah halaman mencegah konten tertutup. */}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[color-mix(in_srgb,var(--garage-bg-0)_92%,transparent)] p-3 backdrop-blur-sm md:left-auto md:right-4 md:bottom-4 md:w-[560px] md:rounded-2xl md:border">
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Alasan perubahan pengaturan keuangan"
              className={`${input} flex-1`}
              placeholder="Alasan perubahan (wajib)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setDraft(original)}
              disabled={saving}
              className="min-h-10 rounded-xl border border-white/15 px-3 text-sm font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--garage-red)] px-4 text-sm font-bold text-white hover:bg-[var(--garage-red-bright)] active:scale-[0.98] disabled:opacity-50"
            >
              <Save className="h-4 w-4" aria-hidden /> {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
