"use client";

import Link from "next/link";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Info,
  Minus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { FinanceControlDashboard } from "@/lib/finance-control";
import { BEP_STATUS_LABEL, EXPENSE_GROUP_LABEL, type ExpenseGroup } from "@/lib/finance-control-core";
import { percent, rupiah, rupiahShort, signedPercent, useCountUp } from "./finance-format";

type Tone = "ok" | "warn" | "bad" | "neutral";

const toneText: Record<Tone, string> = {
  ok: "text-[#a8f0c4]",
  warn: "text-[#ffd8a8]",
  bad: "text-[#ffb1b1]",
  neutral: "text-zinc-300",
};

const toneDot: Record<Tone, string> = {
  ok: "bg-[var(--garage-success)]",
  warn: "bg-[var(--garage-amber)]",
  bad: "bg-[var(--garage-red-bright)]",
  neutral: "bg-zinc-400",
};

const toneChip: Record<Tone, string> = {
  ok: "border-[color-mix(in_srgb,var(--garage-success)_40%,transparent)] bg-[color-mix(in_srgb,var(--garage-success)_14%,transparent)]",
  warn: "border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_16%,transparent)]",
  bad: "border-[color-mix(in_srgb,var(--garage-red)_50%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_18%,transparent)]",
  neutral: "border-white/15 bg-white/8",
};

/** Kartu dasar dashboard finance: sedikit lebih terang dari latar agar angka terbaca. */
export function FinanceCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`min-w-0 rounded-2xl border border-[color-mix(in_srgb,var(--garage-line)_85%,transparent)] bg-[var(--garage-bg-2)] p-5 shadow-[var(--garage-shadow-panel)] sm:p-6 ${className}`}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-[var(--garage-font-display)] text-base font-black uppercase tracking-wide text-zinc-50">
                {title}
              </h2>
            ) : null}
            {subtitle ? <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      )}
      {children}
    </motion.section>
  );
}

function StatusChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold uppercase ${toneChip[tone]} ${toneText[tone]}`}
    >
      <span className={`h-2 w-2 rounded-full ${toneDot[tone]}`} />
      {children}
    </span>
  );
}

// ─── KPI (PRD §21–§22) ──────────────────────────────────────────────────────

export function KpiTile({
  label,
  value,
  format = "rupiah",
  change,
  status,
  statusTone,
  footnote,
  icon: Icon,
}: {
  label: string;
  value: number | null;
  format?: "rupiah" | "percent";
  change?: number | null;
  status?: string;
  statusTone?: Tone;
  footnote?: string;
  icon: LucideIcon;
}) {
  const animated = useCountUp(value ?? 0);
  const text = value === null ? "—" : format === "percent" ? percent(animated) : rupiah(animated);
  const changeTone: Tone = change === null || change === undefined ? "neutral" : change > 0 ? "ok" : change < 0 ? "bad" : "neutral";
  const ChangeIcon = change === null || change === undefined || change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <FinanceCard className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--garage-red)] via-[var(--garage-red-bright)] to-transparent opacity-70" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-300">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/8 text-zinc-100 ring-1 ring-white/12">
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
      </div>
      <p className="mt-2 font-mono text-[28px] font-bold leading-tight tabular-nums text-zinc-50 sm:text-[30px]" aria-label={`${label} ${value === null ? "belum tersedia" : format === "percent" ? percent(value) : rupiah(value)}`}>
        {text}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {change !== undefined ? (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${toneChip[changeTone]} ${toneText[changeTone]}`}>
            <ChangeIcon className="h-3.5 w-3.5" aria-hidden />
            {change === null ? "tanpa pembanding" : signedPercent(change)}
          </span>
        ) : null}
        {status ? <StatusChip tone={statusTone ?? "neutral"}>{status}</StatusChip> : null}
      </div>
      {footnote ? <p className="mt-2 text-xs text-zinc-400">{footnote}</p> : null}
    </FinanceCard>
  );
}

// ─── Progress bar animasi (BEP & capital recovery) ─────────────────────────

function ProgressBar({ pct, tone, label }: { pct: number; tone: Tone; label: string }) {
  const reduce = useReducedMotion();
  const width = Math.max(0, Math.min(100, pct));
  const fill =
    tone === "ok"
      ? "from-[color-mix(in_srgb,var(--garage-success)_70%,black)] to-[var(--garage-success)]"
      : tone === "warn"
        ? "from-[color-mix(in_srgb,var(--garage-amber)_70%,black)] to-[var(--garage-amber)]"
        : "from-[var(--garage-red-deep)] to-[var(--garage-red-bright)]";
  return (
    <div
      className="h-4 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      aria-label={label}
    >
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${fill}`}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

// ─── BEP (PRD §19) ──────────────────────────────────────────────────────────

export function BepMeterCard({ data }: { data: FinanceControlDashboard }) {
  const bep = data.bep;
  const todayBep = data.todayBep;
  const pct = bep.available ? bep.periodAchievementPct : 0;
  const animated = useCountUp(pct);
  const tone: Tone = !bep.available ? "neutral" : bep.periodStatus === "ABOVE" ? "ok" : bep.periodStatus === "NEAR" ? "warn" : "bad";

  return (
    <FinanceCard title="Break Even Point" subtitle={data.period.label}>
      {bep.available ? (
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-400">Target BEP periode</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-zinc-50">{rupiah(bep.periodTarget)}</p>
            </div>
            <p className={`font-mono text-3xl font-bold tabular-nums ${toneText[tone]}`}>{percent(animated)}</p>
          </div>
          <ProgressBar pct={pct} tone={tone} label="Pencapaian BEP" />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Aktual (net sales)" value={rupiah(bep.periodActual)} />
            <Stat label="Status" value={<StatusChip tone={tone}>{BEP_STATUS_LABEL[bep.periodStatus]}</StatusChip>} />
            <Stat label="BEP harian" value={rupiah(bep.dailyTarget)} />
            <Stat label="BEP bulanan" value={rupiah(bep.monthlyTarget)} />
            <Stat label="BEP tahunan" value={rupiah(bep.annualTarget)} />
            <Stat label="Contribution margin" value={percent(bep.contributionMarginPct)} />
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">
            Biaya tetap {rupiah(bep.fixedCostDaily)}/hari (akru biaya harian + payroll master ÷ 30).
            {bep.cmSource === "trailing_30d" ? " Margin memakai rata-rata 30 hari karena periode ini belum ada penjualan." : ""}
            {todayBep.available && data.period.key !== "today" ? ` BEP hari ini ${rupiah(todayBep.dailyTarget)}.` : ""}
          </p>
        </div>
      ) : (
        <EmptyNote icon={CircleAlert} text={bep.reason} />
      )}
    </FinanceCard>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/8">
      <p className="text-[11px] font-semibold uppercase text-zinc-400">{label}</p>
      <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-100">{value}</div>
    </div>
  );
}

export function EmptyNote({ icon: Icon = Info, text }: { icon?: LucideIcon; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm text-zinc-300">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--garage-amber)]" aria-hidden />
      <p>{text}</p>
    </div>
  );
}

// ─── Capital recovery (PRD §27–§28) ─────────────────────────────────────────

export function CapitalRecoveryCard({ data }: { data: FinanceControlDashboard }) {
  const capital = data.capital;
  const animated = useCountUp(capital.recoveryPct);
  const done = capital.initialCapital > 0 && capital.remaining === 0;
  const months = capital.estimatedPaybackMonths;

  return (
    <FinanceCard
      title="Balik Modal"
      subtitle={`Metode: ${capital.methodLabel} · sejak ${capital.startDate} · ${capital.daysRunning} hari berjalan`}
      actions={
        <Link
          href="/control/financial/settings"
          className="inline-flex min-h-9 items-center rounded-lg bg-white/10 px-3 text-xs font-bold uppercase text-zinc-100 hover:bg-white/15"
        >
          Ubah metode
        </Link>
      }
    >
      {capital.initialCapital <= 0 ? (
        <EmptyNote text="Modal awal belum dicatat. Tambahkan capital injection di Pengaturan Finance." />
      ) : (
        <div className="space-y-4">
          {done ? (
            <p className="rounded-xl bg-[color-mix(in_srgb,var(--garage-success)_14%,transparent)] px-3 py-2 text-sm font-bold uppercase text-[#a8f0c4]">
              Modal sudah kembali · {rupiah(capital.initialCapital)}
            </p>
          ) : null}
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-400">Modal awal</p>
              <p className="font-mono text-xl font-bold tabular-nums text-zinc-50">{rupiah(capital.initialCapital)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase text-zinc-400">Progress</p>
              <p className="font-mono text-3xl font-bold tabular-nums text-zinc-50">{percent(animated)}</p>
            </div>
          </div>
          <ProgressBar pct={capital.recoveryPct} tone={done ? "ok" : "warn"} label="Pengembalian modal" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Modal kembali"
              value={<span className={capital.recovered < 0 ? toneText.bad : ""}>{rupiah(capital.recovered)}</span>}
            />
            <Stat label="Sisa balik modal" value={rupiah(capital.remaining)} />
            <Stat
              label="ROI"
              value={
                <span className={capital.roiPct !== null && capital.roiPct < 0 ? toneText.bad : ""}>
                  {capital.roiPct === null ? "—" : percent(capital.roiPct)}
                </span>
              }
            />
            <Stat
              label="Rata-rata / bulan"
              value={
                capital.avgMonthlyNetProfit === null ? (
                  "Belum ada data"
                ) : (
                  <span className={capital.avgMonthlyNetProfit < 0 ? toneText.bad : ""}>{rupiah(capital.avgMonthlyNetProfit)}</span>
                )
              }
            />
            <Stat
              label="Estimasi balik modal"
              value={
                months === null
                  ? "Belum bisa diproyeksi"
                  : months === 0
                    ? "Lunas"
                    : `± ${new Intl.NumberFormat("id-ID").format(months)} bulan`
              }
            />
            <Stat label="Perkiraan tanggal" value={capital.estimatedPaybackDate ?? "—"} />
          </div>
          <p className="text-xs text-zinc-400">
            Modal kembali = akumulasi <span className="font-bold text-zinc-200">{capital.methodLabel.toLowerCase()}</span> sejak mulai bisnis.
            ROI = modal kembali ÷ modal awal. Estimasi = sisa ÷ rata-rata aktual 30 hari terakhir ({rupiah(capital.avgDailyNetProfit)}/hari),
            diperbarui setiap hari{months === null && !done ? " — muncul setelah rata-rata bernilai positif" : ""}.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs font-bold uppercase text-zinc-300">Bukan modal kembali (pembanding)</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Stat
                label="Saldo kas saat ini"
                value={capital.cashBalanceIsSet ? rupiah(capital.cashBalance) : "Saldo awal belum diatur"}
              />
              <Stat label="Aset stok bahan" value={rupiah(capital.inventoryValue)} />
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              Kas &amp; aset tidak dihitung sebagai modal kembali. Peralatan, furnitur &amp; mesin belum tercatat (modul aset belum tersedia).
            </p>
          </div>
        </div>
      )}
    </FinanceCard>
  );
}

// ─── Financial health (PRD §30) ─────────────────────────────────────────────

export function FinancialHealthCard({ data }: { data: FinanceControlDashboard }) {
  const { health } = data;
  const tone: Tone = health.level === "SEHAT" ? "ok" : health.level === "PERHATIAN" ? "warn" : "bad";
  const icons: Record<"ok" | "warn" | "bad", LucideIcon> = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle };
  const good = health.reasons.filter((reason) => reason.tone === "ok");
  const attention = health.reasons.filter((reason) => reason.tone !== "ok");

  return (
    <FinanceCard title="Financial Health" subtitle={`Skor ${health.score}/100 · ${data.period.label}`}>
      <StatusChip tone={tone}>{health.level}</StatusChip>
      <ul className="mt-4 space-y-2">
        {good.map((reason) => {
          const Icon = icons.ok;
          return (
            <li key={reason.text} className="flex items-start gap-2 text-sm text-zinc-200">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${toneText.ok}`} aria-hidden />
              {reason.text}
            </li>
          );
        })}
      </ul>
      {attention.length ? (
        <>
          <p className="mt-4 text-xs font-bold uppercase text-zinc-400">Perlu diperhatikan</p>
          <ul className="mt-2 space-y-2">
            {attention.map((reason) => {
              const Icon = icons[reason.tone];
              return (
                <li key={reason.text} className="flex items-start gap-2 text-sm text-zinc-200">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${toneText[reason.tone]}`} aria-hidden />
                  {reason.text}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </FinanceCard>
  );
}

// ─── Insight & alert (PRD §31, §41) ─────────────────────────────────────────

export function InsightCard({ insights }: { insights: string[] }) {
  return (
    <FinanceCard title="Garage Financial Insight" subtitle="Dihitung dari data aktual — tanpa angka karangan">
      {insights.length ? (
        <ul className="space-y-3">
          {insights.map((text) => (
            <li
              key={text}
              className="rounded-xl border-l-2 border-[var(--garage-amber)] bg-white/[0.04] px-3 py-2 text-sm leading-relaxed text-zinc-100"
            >
              {text}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote text="Belum cukup data transaksi untuk insight pada periode ini." />
      )}
    </FinanceCard>
  );
}

export function AlertsCard({ alerts }: { alerts: FinanceControlDashboard["alerts"] }) {
  const tone: Record<string, Tone> = { critical: "bad", watch: "warn", info: "neutral" };
  const label: Record<string, string> = { critical: "Kritis", watch: "Pantau", info: "Info" };
  return (
    <FinanceCard title="Alert Keuangan" subtitle={`${alerts.length} alert otomatis`}>
      {alerts.length ? (
        <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {alerts.map((alert) => (
            <li key={`${alert.area}-${alert.message}`} className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/8">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={tone[alert.level]}>{label[alert.level]}</StatusChip>
                <span className="text-xs font-bold uppercase text-zinc-400">{alert.area}</span>
              </div>
              <p className="mt-1.5 text-sm text-zinc-100">{alert.message}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote icon={CheckCircle2} text="Tidak ada alert. Semua indikator dalam batas." />
      )}
    </FinanceCard>
  );
}

// ─── P&L ringkas (PRD §13) ──────────────────────────────────────────────────

export function ProfitLossCard({ data }: { data: FinanceControlDashboard }) {
  const pnl = data.pnl;
  const rows: Array<{ label: string; value: number; strong?: boolean; minus?: boolean; note?: string }> = [
    { label: "Gross sales", value: pnl.grossSales },
    { label: "Diskon", value: -pnl.discount, minus: true },
    { label: "Refund", value: -pnl.refund, minus: true },
    { label: "Net sales (revenue)", value: pnl.netSales, strong: true },
    { label: "HPP resep (penjualan)", value: -pnl.cogsRecipe, minus: true },
    { label: "Susut / waste gudang", value: -pnl.cogsShrinkage, minus: true },
    { label: "HPP aktual", value: -pnl.cogs, minus: true, note: pnl.hppRatioPct !== null ? percent(pnl.hppRatioPct) : undefined },
    { label: "Gross profit", value: pnl.grossProfit, strong: true, note: pnl.grossMarginPct !== null ? percent(pnl.grossMarginPct) : undefined },
    { label: "Payroll (aktual)", value: -pnl.payroll, minus: true },
    { label: "Biaya operasional", value: -pnl.operatingExpense, minus: true },
    { label: "Operating profit", value: pnl.operatingProfit, strong: true },
    { label: "Non-operasional", value: -pnl.nonOperatingExpense, minus: true },
    { label: "Net profit", value: pnl.netProfit, strong: true, note: pnl.netMarginPct !== null ? percent(pnl.netMarginPct) : undefined },
  ];
  return (
    <FinanceCard title="Profit & Loss" subtitle={`${data.period.label} · ${pnl.orderCount} order`}>
      <dl className="divide-y divide-white/8">
        {rows.map((row) => (
          <div key={row.label} className={`flex items-center justify-between gap-3 py-2 ${row.strong ? "text-zinc-50" : "text-zinc-300"}`}>
            <dt className={`text-sm ${row.strong ? "font-bold" : ""}`}>{row.label}</dt>
            <dd className="flex items-center gap-2 font-mono text-sm tabular-nums">
              {row.note ? <span className="text-xs text-zinc-400">{row.note}</span> : null}
              <span className={row.strong ? `font-bold ${row.value < 0 ? toneText.bad : ""}` : ""}>{rupiah(row.value)}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Alokasi Save Money" value={rupiah(pnl.reserveAllocation)} />
        <Stat label={`Void (${pnl.voidCount})`} value={rupiah(pnl.voidAmount)} />
        <Stat label="Ongkir delivery (di luar penjualan)" value={rupiah(pnl.deliveryFees ?? 0)} />
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        Save Money = cadangan kas, bukan expense. Void dicatat terpisah dan tidak mengurangi revenue. Ongkir
        delivery ikut masuk kas (QRIS) tetapi tidak dihitung sebagai penjualan menu.
        {pnl.hppCoveragePct !== null ? ` HPP terukur untuk ${percent(pnl.hppCoveragePct)} penjualan.` : ""}
      </p>
    </FinanceCard>
  );
}

// ─── Payroll reconciliation + budget (PRD §8) ───────────────────────────────

export function PayrollBudgetCard({ data }: { data: FinanceControlDashboard }) {
  const recon = data.payrollRecon;
  return (
    <FinanceCard title="Payroll Reconciliation" subtitle="Master vs input harian vs aktual Payroll V2">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Payroll master / bulan" value={rupiah(recon.masterMonthly)} />
        <Stat label="Proyeksi input harian × 30" value={rupiah(recon.projectedMonthly)} />
        <Stat label="Variance" value={rupiah(recon.variance)} />
        <Stat
          label="Status"
          value={<StatusChip tone={recon.status === "SESUAI" ? "ok" : "warn"}>{recon.status}</StatusChip>}
        />
        <Stat label="Aktual bulan ini" value={rupiah(recon.actualMtd)} />
        <Stat label="Prorata master" value={`${rupiah(recon.masterProrataMtd)} (${signedPercent(recon.actualVsMasterPct)})`} />
      </div>

      <p className="mt-5 text-xs font-bold uppercase text-zinc-400">Budget biaya bulan ini</p>
      {data.expenses.budgets.length ? (
        <ul className="mt-2 space-y-3">
          {data.expenses.budgets.map((line) => {
            const tone: Tone = line.usedPct > 100 ? "bad" : line.usedPct >= 80 ? "warn" : "ok";
            return (
              <li key={line.code}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-zinc-200">{line.name}</span>
                  <span className={`font-mono tabular-nums ${toneText[tone]}`}>
                    {rupiahShort(line.actualMtd)} / {rupiahShort(line.monthlyBudget)} · {percent(line.usedPct)}
                  </span>
                </div>
                <ProgressBar pct={line.usedPct} tone={tone} label={`Budget ${line.name}`} />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyNote text="Belum ada kategori expense yang terhubung ke biaya harian." />
      )}
    </FinanceCard>
  );
}

export function CashOutGroups({ data }: { data: FinanceControlDashboard }) {
  const rows = data.cashflow.outByGroup;
  if (!rows.length) return null;
  return (
    <ul className="mt-4 space-y-1.5 text-sm">
      {rows.map((row) => (
        <li key={row.group} className="flex items-center justify-between gap-3 text-zinc-300">
          <span>{EXPENSE_GROUP_LABEL[row.group as ExpenseGroup] ?? row.group}</span>
          <span className="font-mono tabular-nums text-zinc-100">{rupiah(row.amount)}</span>
        </li>
      ))}
    </ul>
  );
}
