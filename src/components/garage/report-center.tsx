"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  ChefHat,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Sheet,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadReportFile, fileSizeLabel } from "@/lib/report-download-client";
import { reportFileName } from "@/lib/report-file-name";
import {
  canShiftForward,
  PERIOD_PRESETS,
  periodError,
  periodLabel,
  presetPeriod,
  shiftPeriod,
  type PeriodPreset,
  type ReportPeriod,
} from "@/lib/report-periods";
import { REPORT_CATALOG, REPORT_MODULES, type ReportModule } from "@/lib/reports/catalog";
import { todayWibKey } from "@/lib/date-range";

type Format = "pdf" | "xlsx" | "csv";
type Division = "semua" | "bar" | "kitchen";

const MODULE_ICON: Record<ReportModule, LucideIcon> = {
  penjualan: BarChart3,
  pembelian: ShoppingBasket,
  stok: Boxes,
  produksi: ChefHat,
  keuangan: Landmark,
};

const DIVISIONS: Array<{ id: Division; label: string }> = [
  { id: "semua", label: "Semua" },
  { id: "bar", label: "Bar" },
  { id: "kitchen", label: "Kitchen" },
];

const FORMATS: Array<{ id: Format; label: string; icon: LucideIcon }> = [
  { id: "pdf", label: "PDF", icon: FileText },
  { id: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { id: "csv", label: "CSV", icon: Sheet },
];

const chip = (active: boolean) =>
  `garage-press min-h-10 rounded-md border px-3 text-xs font-semibold transition-colors sm:text-sm ${
    active ? "border-[#f5a742] bg-[#f5a742] text-black" : "border-[#3a3a44] bg-[#17171d] text-[#e4e4e8] hover:bg-white/[0.06]"
  }`;

type Status = { kind: "ok" | "error"; text: string } | null;

/**
 * Pusat Laporan (Owner/Manajer): pilih modul → jenis → divisi → periode →
 * unduh PDF/Excel/CSV. File dibuat server (/api/reports/export) dengan format
 * standar Garage; status hanya "berhasil" bila file benar-benar diterima.
 */
export function ReportCenter() {
  const today = todayWibKey();
  const [module, setModule] = useState<ReportModule>("penjualan");
  const [typeByModule, setTypeByModule] = useState<Record<ReportModule, string>>(() => ({
    penjualan: "day",
    pembelian: "detail",
    stok: "posisi",
    produksi: "ringkasan",
    keuangan: "pnl",
  }));
  const [division, setDivision] = useState<Division>("bar");
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [period, setPeriod] = useState<ReportPeriod>(() => presetPeriod("today"));
  const [busy, setBusy] = useState<Format | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const catalog = REPORT_CATALOG[module];
  const type = typeByModule[module];
  const entry = catalog.types.find((t) => t.id === type) ?? catalog.types[0];
  const effectiveDivision: Division = entry.division ? division : "semua";
  const error = periodError(period.from, period.to, { today });
  const filePreview = useMemo(
    () =>
      error
        ? null
        : reportFileName({
            kind: entry.kind,
            division: entry.division && effectiveDivision !== "semua" ? effectiveDivision : null,
            from: period.from,
            to: period.to,
            ext: "pdf",
          }).replace(/\.pdf$/, ""),
    [entry, effectiveDivision, period, error],
  );

  function choosePreset(next: PeriodPreset) {
    setPreset(next);
    setStatus(null);
    if (next === "custom") {
      setPeriod((current) => ({ ...current, unit: "range" }));
      return;
    }
    setPeriod(presetPeriod(next, today));
  }

  function choosePeriodForSalesType(nextType: string) {
    // Laporan penjualan mingguan/bulanan/tahunan → periode default yang sesuai.
    const map: Record<string, PeriodPreset> = { day: "today", week: "this_week", month: "this_month", year: "this_year" };
    if (module === "penjualan" && map[nextType]) choosePreset(map[nextType]);
  }

  async function download(format: Format) {
    if (error) {
      setStatus({ kind: "error", text: error });
      return;
    }
    setBusy(format);
    setStatus(null);
    try {
      const params = new URLSearchParams({
        module,
        type: entry.id,
        format,
        from: period.from,
        to: period.to,
        division: effectiveDivision,
      });
      const file = await downloadReportFile(`/api/reports/export?${params.toString()}`, `${filePreview ?? "GARAGE_LAPORAN"}.${format}`);
      setStatus({ kind: "ok", text: `${file.filename} diunduh (${fileSizeLabel(file.size)}).` });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Gagal membuat laporan." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="garage-panel garage-animate-in" data-testid="report-center">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="size-5 text-[#f5a742]" aria-hidden />
          Pusat Laporan
        </CardTitle>
        <CardDescription className="text-[#c9c9d1]">
          Laporan resmi per modul dalam PDF, Excel, atau CSV — kop Garage, periode, ringkasan, subtotal & total, nomor halaman.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 1. Modul */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" role="tablist" aria-label="Modul laporan">
          {REPORT_MODULES.map((id) => {
            const Icon = MODULE_ICON[id];
            const active = id === module;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setModule(id);
                  setStatus(null);
                }}
                className={`garage-press flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  active ? "border-[#f5a742] bg-[#f5a742]/15 text-[#ffd79a]" : "border-[#34343c] bg-[#15151b] text-[#e4e4e8] hover:bg-white/[0.05]"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="leading-tight">{REPORT_CATALOG[id].label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-[#c9c9d1]">{catalog.description}</p>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 2. Jenis & divisi */}
          <div className="space-y-3">
            {catalog.types.length > 1 ? (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#b9b9c3]">Jenis laporan</span>
                <select
                  className="h-11 w-full rounded-md border border-[#3a3a44] bg-[#17171d] px-3 text-sm text-[#f4f4f5]"
                  value={entry.id}
                  onChange={(event) => {
                    setTypeByModule((current) => ({ ...current, [module]: event.target.value }));
                    choosePeriodForSalesType(event.target.value);
                    setStatus(null);
                  }}
                >
                  {catalog.types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-sm text-[#e4e4e8]">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#b9b9c3]">Jenis laporan</span>
                {entry.label}
              </p>
            )}
            {entry.division ? (
              <div>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#b9b9c3]">Divisi</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Divisi">
                  {DIVISIONS.map((d) => (
                    <button key={d.id} type="button" role="radio" aria-checked={division === d.id} className={chip(division === d.id)} onClick={() => setDivision(d.id)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* 3. Periode */}
          <div className="space-y-3">
            <span className="block text-xs font-bold uppercase tracking-wide text-[#b9b9c3]">Periode</span>
            <div className="flex flex-wrap gap-2">
              {PERIOD_PRESETS.map((p) => (
                <button key={p.id} type="button" className={chip(preset === p.id)} aria-pressed={preset === p.id} onClick={() => choosePreset(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            {preset === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-[#b9b9c3]">
                  Dari
                  <input
                    type="date"
                    className="mt-1 h-11 w-full rounded-md border border-[#3a3a44] bg-[#17171d] px-2 text-sm text-[#f4f4f5] [color-scheme:dark]"
                    value={period.from}
                    max={today}
                    onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value, unit: "range" }))}
                  />
                </label>
                <label className="text-xs text-[#b9b9c3]">
                  Sampai
                  <input
                    type="date"
                    className="mt-1 h-11 w-full rounded-md border border-[#3a3a44] bg-[#17171d] px-2 text-sm text-[#f4f4f5] [color-scheme:dark]"
                    value={period.to}
                    min={period.from || undefined}
                    onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value, unit: "range" }))}
                  />
                </label>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Periode sebelumnya"
                className="garage-press grid size-10 shrink-0 place-items-center rounded-md border border-[#3a3a44] bg-[#17171d] text-[#e4e4e8] hover:bg-white/[0.06] disabled:opacity-40"
                disabled={Boolean(error)}
                onClick={() => {
                  setPeriod((current) => shiftPeriod(current, -1));
                  setStatus(null);
                }}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <div className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-[#34343c] bg-[#111116] px-3 text-sm font-semibold text-[#f4f4f5]">
                <CalendarDays className="size-4 shrink-0 text-[#f5a742]" aria-hidden />
                <span className="truncate" data-testid="report-period-label">
                  {error ? "—" : periodLabel(period)}
                </span>
              </div>
              <button
                type="button"
                aria-label="Periode berikutnya"
                className="garage-press grid size-10 shrink-0 place-items-center rounded-md border border-[#3a3a44] bg-[#17171d] text-[#e4e4e8] hover:bg-white/[0.06] disabled:opacity-40"
                disabled={Boolean(error) || !canShiftForward(period, today)}
                onClick={() => {
                  setPeriod((current) => shiftPeriod(current, 1));
                  setStatus(null);
                }}
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
            {error ? (
              <p className="flex items-center gap-1.5 text-sm text-[#ffc2c8]" role="alert">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
          </div>
        </div>

        {/* 4. Unduh */}
        <div className="space-y-2 rounded-lg border border-[#34343c] bg-[#111116] p-3">
          <p className="break-all text-xs text-[#b9b9c3]">
            Nama file: <span className="font-mono text-[#f4f4f5]">{filePreview ? `${filePreview}.pdf / .xlsx / .csv` : "—"}</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                disabled={busy !== null || Boolean(error)}
                onClick={() => void download(id)}
                className="garage-press inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#c41a1a]/60 bg-[#c41a1a] px-2 text-sm font-bold text-white transition hover:bg-[#e83030] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === id ? <Download className="size-4 animate-bounce motion-reduce:animate-none" aria-hidden /> : <Icon className="size-4" aria-hidden />}
                {busy === id ? "Membuat…" : label}
              </button>
            ))}
          </div>
          <div aria-live="polite" className="min-h-5">
            {status ? (
              <p className={`flex items-start gap-1.5 text-sm ${status.kind === "ok" ? "text-[#86efac]" : "text-[#ffc2c8]"}`}>
                {status.kind === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
                <span className="break-all">{status.text}</span>
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
