"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Download,
  FileText,
  PackageSearch,
  RefreshCw,
  Save,
  Scale,
  TrendingUp,
} from "lucide-react";

import { KPICard } from "@/components/ceo/cards/KPICard";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import {
  calculateBundleMargin,
  calculateProfitMaxPayroll,
  enrichProfitMaxMenu,
  profitMaxActions,
  profitMaxBundles,
  profitMaxEmployees,
  profitMaxHealthIndicators,
  profitMaxIngredients,
  profitMaxMenus,
  profitMaxMetrics,
  profitMaxOverheads,
  profitMaxOverview,
  profitMaxRecipes,
  profitMaxScenarios,
  type ProfitMaxHealthIndicator,
} from "@/components/ceo/data/profitMaxData";

const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

type EnrichedMenu = ReturnType<typeof enrichProfitMaxMenu>;
type EnrichedBundle = ReturnType<typeof calculateBundleMargin>;
type EnrichedPayroll = ReturnType<typeof calculateProfitMaxPayroll>;

type ProfitMaxRemoteData = {
  generatedAt?: string;
  dataSource?: Record<string, string>;
  overview?: Partial<typeof profitMaxOverview> & {
    menuSkuCount?: number;
    healthyMenuCount?: number;
    criticalMenuCount?: number;
    averageMargin?: number;
    totalPayroll?: number;
    totalOverhead?: number;
  };
  menuRows?: EnrichedMenu[];
  ingredients?: typeof profitMaxIngredients;
  employees?: EnrichedPayroll[];
  overheads?: typeof profitMaxOverheads;
  bundles?: EnrichedBundle[];
  scenarios?: typeof profitMaxScenarios;
  healthIndicators?: typeof profitMaxHealthIndicators;
};

type SavedCalculationType = "hpp" | "roi" | "promo" | "bundling" | "overhead";

function formatIdr(value: number) {
  return `Rp ${idr.format(Math.round(value))}`;
}

function formatIndicatorValue(indicator: ProfitMaxHealthIndicator, value: number) {
  if (indicator.unit === "idr") return formatIdr(value);
  if (indicator.unit === "percent") return `${value.toLocaleString("id-ID")}%`;
  return value.toLocaleString("id-ID");
}

function suggestedPrice(hpp: number, targetMargin: number) {
  return Math.ceil(hpp / (1 - targetMargin / 100) / 500) * 500;
}

function NumberInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase text-zinc-500">{label}</span>
      <div className="flex items-center overflow-hidden rounded-lg border border-white/10 bg-[var(--garage-bg-3)]">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-h-10 w-full bg-transparent px-3 font-mono text-sm text-zinc-100 outline-none"
        />
        {suffix ? <span className="border-l border-white/10 px-3 text-[11px] font-semibold uppercase text-zinc-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 w-full rounded-lg border border-white/10 bg-[var(--garage-bg-3)] px-3 text-sm text-zinc-100 outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MiniMetric({ label, value, tone = "chrome" }: { label: string; value: string; tone?: "red" | "amber" | "success" | "chrome" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-4">
      <p className="text-[10px] font-semibold uppercase text-zinc-400">{label}</p>
      <p className="mt-1 font-[var(--garage-font-display)] text-xl font-black text-zinc-50">{value}</p>
      <Badge tone={tone} className="mt-2">
        ProfitMax
      </Badge>
    </div>
  );
}

export default function ProfitMaxPage() {
  const [remoteData, setRemoteData] = useState<ProfitMaxRemoteData | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProfitMax() {
      try {
        const response = await fetch("/api/profitmax/dashboard", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as { data?: ProfitMaxRemoteData };
        if (!cancelled) {
          setRemoteData(json.data ?? null);
          setRemoteError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRemoteError(error instanceof Error ? error.message : "Gagal memuat API ProfitMax");
        }
      }
    }
    void loadProfitMax();
    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackMenuRows = useMemo(() => profitMaxMenus.map(enrichProfitMaxMenu), []);
  const fallbackBundleRows = useMemo(() => profitMaxBundles.map(calculateBundleMargin), []);
  const fallbackPayrollRows = useMemo(() => profitMaxEmployees.map(calculateProfitMaxPayroll), []);
  const menuRows = remoteData?.menuRows ?? fallbackMenuRows;
  const bundleRows = remoteData?.bundles ?? fallbackBundleRows;
  const payrollRows = remoteData?.employees ?? fallbackPayrollRows;
  const ingredientRows = remoteData?.ingredients ?? profitMaxIngredients;
  const overheadRows = remoteData?.overheads ?? profitMaxOverheads;
  const scenarioRows = remoteData?.scenarios ?? profitMaxScenarios;
  const healthRows = remoteData?.healthIndicators ?? profitMaxHealthIndicators;
  const overview = { ...profitMaxOverview, ...(remoteData?.overview ?? {}) };

  const [hppPrice, setHppPrice] = useState(18_000);
  const [targetMargin, setTargetMargin] = useState(55);
  const [packaging, setPackaging] = useState(700);
  const [utility, setUtility] = useState(300);
  const [extraCost, setExtraCost] = useState(0);
  const [ingredientDraft, setIngredientDraft] = useState([
    { name: "Biji Kopi Robusta", qty: 18, price: 90 },
    { name: "Susu UHT Full Cream", qty: 150, price: 22 },
    { name: "Gula Aren Cair", qty: 30, price: 50 },
    { name: "Es Batu", qty: 100, price: 3 },
  ]);

  const hppCalc = useMemo(() => {
    const materialCost = ingredientDraft.reduce((sum, item) => sum + item.qty * item.price, 0);
    const totalHpp = materialCost + packaging + utility + extraCost;
    const profit = hppPrice - totalHpp;
    const margin = hppPrice > 0 ? (profit / hppPrice) * 100 : 0;
    const markup = totalHpp > 0 ? (profit / totalHpp) * 100 : 0;
    const status = margin < 0 ? "Rugi" : margin < 30 ? "Margin Rendah" : margin < 45 ? "Perlu Evaluasi" : "Aman";
    return {
      materialCost,
      totalHpp,
      profit,
      margin,
      markup,
      recommendedPrice: suggestedPrice(totalHpp, targetMargin),
      status,
    };
  }, [extraCost, hppPrice, ingredientDraft, packaging, targetMargin, utility]);

  const [roiCapital, setRoiCapital] = useState(profitMaxOverview.initialCapital);
  const [roiDailyRevenue, setRoiDailyRevenue] = useState(profitMaxOverview.dailyRevenueTarget);
  const [roiHppPct, setRoiHppPct] = useState(profitMaxOverview.targetHppRatio);
  const [roiFixedCost, setRoiFixedCost] = useState(profitMaxOverview.fixedMonthlyCost);

  const roiCalc = useMemo(() => {
    const monthlyRevenue = roiDailyRevenue * 30;
    const monthlyHpp = monthlyRevenue * (roiHppPct / 100);
    const grossProfit = monthlyRevenue - monthlyHpp;
    const netProfit = grossProfit - roiFixedCost;
    return {
      monthlyRevenue,
      monthlyHpp,
      grossProfit,
      netProfit,
      bepMonths: netProfit > 0 ? roiCapital / netProfit : 0,
      annualRoi: roiCapital > 0 ? ((netProfit * 12) / roiCapital) * 100 : 0,
    };
  }, [roiCapital, roiDailyRevenue, roiFixedCost, roiHppPct]);

  const [promoMenuCode, setPromoMenuCode] = useState("C-12");
  const [promoDiscountPct, setPromoDiscountPct] = useState(15);
  const [promoDailySales, setPromoDailySales] = useState(35);
  const promoCalc = useMemo(() => {
    const menu = menuRows.find((item) => item.code === promoMenuCode) ?? menuRows[0];
    const promoPrice = Math.max(0, menu.price * (1 - promoDiscountPct / 100));
    const profitAfterPromo = promoPrice - menu.hpp;
    const marginAfterPromo = promoPrice > 0 ? (profitAfterPromo / promoPrice) * 100 : 0;
    return {
      menu,
      promoPrice,
      revenueLoss: (menu.price - promoPrice) * promoDailySales,
      profitAfterPromo,
      marginAfterPromo,
      status: marginAfterPromo < 0 ? "RUGI" : marginAfterPromo < 30 ? "WARNING" : "HEALTHY",
    };
  }, [menuRows, promoDailySales, promoDiscountPct, promoMenuCode]);

  const [bundleCode, setBundleCode] = useState("PK-01");
  const [bundlePrice, setBundlePrice] = useState(25_000);
  const selectedBundle = useMemo(() => bundleRows.find((bundle) => bundle.code === bundleCode) ?? bundleRows[0], [bundleCode, bundleRows]);
  const bundleCalc = useMemo(() => {
    const profit = bundlePrice - selectedBundle.hpp;
    return {
      profit,
      margin: bundlePrice > 0 ? (profit / bundlePrice) * 100 : 0,
      discountValue: selectedBundle.normalPrice - bundlePrice,
      discountPercent: selectedBundle.normalPrice > 0 ? ((selectedBundle.normalPrice - bundlePrice) / selectedBundle.normalPrice) * 100 : 0,
    };
  }, [bundlePrice, selectedBundle]);

  const [targetTransactions, setTargetTransactions] = useState(4_500);
  const totalOverhead = useMemo(() => overheadRows.reduce((sum, item) => sum + item.amount, 0), [overheadRows]);
  const overheadPerPortion = targetTransactions > 0 ? totalOverhead / targetTransactions : 0;

  const [selectedEmployeeId, setSelectedEmployeeId] = useState("EMP-001");
  const selectedPayroll = payrollRows.find((employee) => employee.id === selectedEmployeeId) ?? payrollRows[0];

  const [selectedRecipeCode, setSelectedRecipeCode] = useState("C-05");
  const selectedRecipe = profitMaxRecipes.find((recipe) => recipe.code === selectedRecipeCode) ?? profitMaxRecipes[0];
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState<string | null>(null);
  const [calculationFeedback, setCalculationFeedback] = useState<string | null>(null);
  const [calculationSaving, setCalculationSaving] = useState<SavedCalculationType | null>(null);

  const urgentMenus = menuRows.filter((menu) => menu.margin < 30 || menu.status === "RUGI");

  async function submitProfitMaxAction(action: (typeof profitMaxActions)[number]) {
    setActionSubmitting(action.title);
    setActionFeedback(null);
    try {
      const risk = action.tone === "red" ? "high" : action.tone === "amber" ? "medium" : "low";
      const actionType =
        action.title.toLowerCase().includes("harga")
          ? "price_change"
          : action.title.toLowerCase().includes("signature")
            ? "promo_guard"
            : action.title.toLowerCase().includes("hpp")
              ? "recipe_hpp"
              : "overhead_review";
      const response = await fetch("/api/profitmax/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType,
          title: action.title,
          amount: action.impact,
          reason: `${action.impact}. Dibuat dari Action Queue GARAGE ProfitMax untuk ${action.owner}.`,
          risk,
          payload: {
            owner: action.owner,
            tone: action.tone,
            source: "control/profitmax",
          },
        }),
      });
      const json = (await response.json()) as { data?: { approval?: { id?: string } }; error?: { message?: string } };
      if (!response.ok) throw new Error(json.error?.message ?? `HTTP ${response.status}`);
      setActionFeedback(`Approval ProfitMax dibuat: ${json.data?.approval?.id ?? "-"}`);
    } catch (error) {
      setActionFeedback(error instanceof Error ? `Gagal membuat approval: ${error.message}` : "Gagal membuat approval ProfitMax.");
    } finally {
      setActionSubmitting(null);
    }
  }

  async function saveCalculation(type: SavedCalculationType, title: string, input: Record<string, unknown>, result: Record<string, unknown>) {
    setCalculationSaving(type);
    setCalculationFeedback(null);
    try {
      const response = await fetch("/api/profitmax/calculations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, input, result }),
      });
      const json = (await response.json()) as { data?: { calculation?: { id?: string } }; error?: { message?: string } };
      if (!response.ok) throw new Error(json.error?.message ?? `HTTP ${response.status}`);
      setCalculationFeedback(`Kalkulasi tersimpan: ${json.data?.calculation?.id ?? "-"}`);
    } catch (error) {
      setCalculationFeedback(error instanceof Error ? `Gagal simpan kalkulasi: ${error.message}` : "Gagal simpan kalkulasi ProfitMax.");
    } finally {
      setCalculationSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="ProfitMax"
        title="GARAGE ProfitMax"
        subtitle="Halaman khusus ProfitMax dari handoff zip: dashboard, kalkulator, health indicator, resep HPP, payroll, overhead, promo, dan bundling."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/control/menu-engineering"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)]"
            >
              <TrendingUp className="h-3.5 w-3.5" /> Menu Eng.
            </Link>
            <a
              href="/api/profitmax/export?format=xlsx"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)]"
            >
              <Download className="h-3.5 w-3.5" /> XLSX
            </a>
            <a
              href="/api/profitmax/export?format=pdf"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)]"
            >
              <FileText className="h-3.5 w-3.5" /> PDF
            </a>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {[
          ["Dashboard Overview", "dashboard"],
          ["Kalkulator HPP", "hpp"],
          ["ROI / Balik Modal", "roi"],
          ["Diskon Promo", "promo"],
          ["Bundling Menu", "bundling"],
          ["Kesehatan Bisnis", "health"],
          ["Resep + HPP Library", "recipes"],
          ["Slip Gaji", "payroll"],
          ["Overhead", "overhead"],
        ].map(([label, target]) => (
          <a
            key={target}
            href={`#${target}`}
            className="rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-2 text-[11px] font-black uppercase text-zinc-300 hover:border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] hover:text-zinc-50"
          >
            {label}
          </a>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-3 text-[11px] text-zinc-400">
        <RefreshCw className="h-3.5 w-3.5" />
        {remoteData ? (
          <>
            <span>API ProfitMax aktif.</span>
            {Object.entries(remoteData.dataSource ?? {}).map(([key, value]) => (
              <Badge key={key} tone={value === "garage-db" ? "success" : "chrome"}>
                {key}: {value}
              </Badge>
            ))}
          </>
        ) : (
          <span>Memakai fallback handoff zip{remoteError ? ` - API: ${remoteError}` : " sambil memuat API"}.</span>
        )}
      </div>

      {calculationFeedback ? (
        <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-3 text-xs text-zinc-300">
          {calculationFeedback}
        </div>
      ) : null}

      <section id="dashboard" className="space-y-5 scroll-mt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {profitMaxMetrics.map((metric) => (
            <KPICard key={metric.title} {...metric} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Panel title="Dashboard Overview" subtitle="Ringkasan bisnis ProfitMax yang disesuaikan dengan data GARAGE Control" className="xl:col-span-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <MiniMetric label="Omzet harian GARAGE Control" value={formatIdr(overview.dashboardDailyRevenue)} tone="success" />
              <MiniMetric label="Target ProfitMax harian" value={formatIdr(overview.dailyRevenueTarget)} />
              <MiniMetric label="Target bulanan" value={formatIdr(overview.monthlyRevenueTarget)} />
              <MiniMetric label="Fixed cost bulanan" value={formatIdr(overview.fixedMonthlyCost)} tone="amber" />
              <MiniMetric label="Net profit proyeksi" value={formatIdr(overview.netProfitPerMonth)} tone="success" />
              <MiniMetric label="ROI tahunan" value={`${overview.roiAnnualPercent}%`} tone="success" />
            </div>
          </Panel>

          <Panel title="Alert ProfitMax" subtitle="Item yang harus masuk keputusan owner">
            <div className="space-y-2">
              {urgentMenus.map((menu) => (
                <div key={menu.code} className="rounded-lg border border-[color-mix(in_srgb,var(--garage-red)_40%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_12%,transparent)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-zinc-50">{menu.name}</p>
                    <Badge tone="red">{menu.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">
                    Margin {menu.margin}% | profit {formatIdr(menu.profit)} per porsi.
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <section id="hpp" className="scroll-mt-4">
        <Panel title="Kalkulator HPP (Harga Pokok Penjualan)" subtitle="Hitung HPP, margin, markup, status, dan rekomendasi harga jual.">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_0.9fr]">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <NumberInput label="Harga jual" value={hppPrice} onChange={setHppPrice} />
                <NumberInput label="Target margin" value={targetMargin} onChange={setTargetMargin} suffix="%" />
                <NumberInput label="Kemasan" value={packaging} onChange={setPackaging} />
                <NumberInput label="Gas / listrik" value={utility} onChange={setUtility} />
              </div>
              <NumberInput label="Biaya lain per porsi" value={extraCost} onChange={setExtraCost} />

              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
                    <tr>
                      <th className="px-3 py-2">Bahan</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Harga/unit</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {ingredientDraft.map((ingredient, index) => (
                      <tr key={`${ingredient.name}-${index}`}>
                        <td className="px-3 py-2">
                          <input
                            value={ingredient.name}
                            onChange={(event) =>
                              setIngredientDraft((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, name: event.target.value } : row)))
                            }
                            className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-zinc-100 outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={ingredient.qty}
                            onChange={(event) =>
                              setIngredientDraft((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, qty: Number(event.target.value) } : row)))
                            }
                            className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-right font-mono text-zinc-100 outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={ingredient.price}
                            onChange={(event) =>
                              setIngredientDraft((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, price: Number(event.target.value) } : row)))
                            }
                            className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1.5 text-right font-mono text-zinc-100 outline-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-100">{formatIdr(ingredient.qty * ingredient.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-5 text-center">
                <Badge tone={hppCalc.margin < 30 ? "red" : hppCalc.margin < 45 ? "amber" : "success"}>{hppCalc.status}</Badge>
                <p className="mt-3 font-[var(--garage-font-display)] text-5xl font-black text-zinc-50">{hppCalc.margin.toFixed(1)}%</p>
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Margin Bersih</p>
              </div>
              <MiniMetric label="HPP bahan" value={formatIdr(hppCalc.materialCost)} />
              <MiniMetric label="HPP total" value={formatIdr(hppCalc.totalHpp)} tone="amber" />
              <MiniMetric label="Laba per porsi" value={formatIdr(hppCalc.profit)} tone={hppCalc.profit < 0 ? "red" : "success"} />
              <MiniMetric label={`Harga rekomendasi ${targetMargin}%`} value={formatIdr(hppCalc.recommendedPrice)} tone="success" />
              <MiniMetric label="Markup" value={`${hppCalc.markup.toFixed(1)}%`} />
              <button
                type="button"
                onClick={() =>
                  void saveCalculation(
                    "hpp",
                    "Kalkulator HPP",
                    { hppPrice, targetMargin, packaging, utility, extraCost, ingredientDraft },
                    hppCalc,
                  )
                }
                disabled={calculationSaving !== null}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 text-[11px] font-bold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)] disabled:cursor-wait disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {calculationSaving === "hpp" ? "Menyimpan..." : "Simpan HPP"}
              </button>
            </div>
          </div>
        </Panel>
      </section>

      <section id="roi" className="scroll-mt-4">
        <Panel title="Kalkulator ROI / Balik Modal" subtitle="Simulasi modal, target harian, HPP, fixed cost, laba bersih, BEP, dan ROI.">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.2fr]">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-1">
              <NumberInput label="Modal awal" value={roiCapital} onChange={setRoiCapital} />
              <NumberInput label="Omzet harian" value={roiDailyRevenue} onChange={setRoiDailyRevenue} />
              <NumberInput label="HPP percent" value={roiHppPct} onChange={setRoiHppPct} suffix="%" />
              <NumberInput label="Fixed cost bulanan" value={roiFixedCost} onChange={setRoiFixedCost} />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <MiniMetric label="Omzet bulanan" value={formatIdr(roiCalc.monthlyRevenue)} />
              <MiniMetric label="HPP bulanan" value={formatIdr(roiCalc.monthlyHpp)} tone="amber" />
              <MiniMetric label="Gross profit" value={formatIdr(roiCalc.grossProfit)} tone="success" />
              <MiniMetric label="Net profit" value={formatIdr(roiCalc.netProfit)} tone={roiCalc.netProfit > 0 ? "success" : "red"} />
              <MiniMetric label="BEP" value={`${roiCalc.bepMonths.toFixed(2)} bulan`} tone="success" />
              <MiniMetric label="ROI tahunan" value={`${roiCalc.annualRoi.toFixed(1)}%`} tone="success" />
              <button
                type="button"
                onClick={() =>
                  void saveCalculation(
                    "roi",
                    "Kalkulator ROI / Balik Modal",
                    { roiCapital, roiDailyRevenue, roiHppPct, roiFixedCost },
                    roiCalc,
                  )
                }
                disabled={calculationSaving !== null}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 text-[11px] font-bold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)] disabled:cursor-wait disabled:opacity-60 md:col-span-3"
              >
                <Save className="h-3.5 w-3.5" />
                {calculationSaving === "roi" ? "Menyimpan..." : "Simpan ROI"}
              </button>
            </div>
          </div>
        </Panel>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section id="promo" className="scroll-mt-4">
          <Panel title="Kalkulator Diskon Promo" subtitle="Cek margin setelah promo sebelum campaign jalan.">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <SelectInput
                  label="Menu"
                  value={promoMenuCode}
                  onChange={setPromoMenuCode}
                  options={menuRows.map((menu) => ({ value: menu.code, label: `${menu.code} - ${menu.name}` }))}
                />
                <NumberInput label="Diskon" value={promoDiscountPct} onChange={setPromoDiscountPct} suffix="%" />
                <NumberInput label="Estimasi sales" value={promoDailySales} onChange={setPromoDailySales} suffix="porsi" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <MiniMetric label="Harga normal" value={formatIdr(promoCalc.menu.price)} />
                <MiniMetric label="Harga promo" value={formatIdr(promoCalc.promoPrice)} tone="amber" />
                <MiniMetric label="Margin promo" value={`${promoCalc.marginAfterPromo.toFixed(1)}%`} tone={promoCalc.marginAfterPromo < 30 ? "red" : "success"} />
                <MiniMetric label="Revenue loss" value={formatIdr(promoCalc.revenueLoss)} tone="amber" />
              </div>
              <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3 text-xs text-zinc-300">
                Status promo: <Badge tone={promoCalc.status === "RUGI" ? "red" : promoCalc.status === "WARNING" ? "amber" : "success"}>{promoCalc.status}</Badge>
              </div>
              <button
                type="button"
                onClick={() =>
                  void saveCalculation(
                    "promo",
                    "Kalkulator Diskon Promo",
                    { promoMenuCode, promoDiscountPct, promoDailySales },
                    promoCalc,
                  )
                }
                disabled={calculationSaving !== null}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 text-[11px] font-bold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)] disabled:cursor-wait disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {calculationSaving === "promo" ? "Menyimpan..." : "Simpan Promo"}
              </button>
            </div>
          </Panel>
        </section>

        <section id="bundling" className="scroll-mt-4">
          <Panel title="Kalkulator Bundling Menu" subtitle="Simulasi harga paket, diskon, profit, dan margin bundling.">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SelectInput
                  label="Paket"
                  value={bundleCode}
                  onChange={(value) => {
                    const next = bundleRows.find((bundle) => bundle.code === value);
                    setBundleCode(value);
                    if (next) setBundlePrice(next.bundlePrice);
                  }}
                  options={bundleRows.map((bundle) => ({ value: bundle.code, label: `${bundle.code} - ${bundle.name}` }))}
                />
                <NumberInput label="Harga paket" value={bundlePrice} onChange={setBundlePrice} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <MiniMetric label="Harga normal" value={formatIdr(selectedBundle.normalPrice)} />
                <MiniMetric label="Diskon paket" value={`${bundleCalc.discountPercent.toFixed(1)}%`} tone="amber" />
                <MiniMetric label="Profit paket" value={formatIdr(bundleCalc.profit)} tone={bundleCalc.profit > 0 ? "success" : "red"} />
                <MiniMetric label="Margin paket" value={`${bundleCalc.margin.toFixed(1)}%`} tone={bundleCalc.margin < 35 ? "amber" : "success"} />
              </div>
              <p className="text-xs text-zinc-400">
                Isi paket: {selectedBundle.itemCodes.join(", ")}. Terjual contoh: {selectedBundle.sold} paket.
              </p>
              <button
                type="button"
                onClick={() =>
                  void saveCalculation(
                    "bundling",
                    "Kalkulator Bundling Menu",
                    { bundleCode, bundlePrice, selectedBundle },
                    bundleCalc,
                  )
                }
                disabled={calculationSaving !== null}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 text-[11px] font-bold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)] disabled:cursor-wait disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {calculationSaving === "bundling" ? "Menyimpan..." : "Simpan Bundling"}
              </button>
            </div>
          </Panel>
        </section>
      </div>

      <section id="health" className="scroll-mt-4">
        <Panel title="Indikator Kesehatan Bisnis" subtitle="Health indicator dari PRD ProfitMax: revenue, margin, HPP, menu rugi, dan BEP.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {healthRows.map((indicator) => (
              <div key={indicator.name} className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-zinc-50">{indicator.name}</p>
                  <Badge tone={indicator.status === "DANGER" ? "red" : indicator.status === "WARNING" ? "amber" : indicator.status === "HEALTHY" ? "success" : "chrome"}>
                    {indicator.status}
                  </Badge>
                </div>
                <p className="mt-3 font-[var(--garage-font-display)] text-2xl font-black text-zinc-50">{formatIndicatorValue(indicator, indicator.actual)}</p>
                <p className="mt-2 text-[11px] text-zinc-500">Target {formatIndicatorValue(indicator, indicator.target)}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{indicator.note}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section id="recipes" className="scroll-mt-4">
        <Panel title="Daftar Resep + HPP Library" subtitle="Library resep dari handoff untuk produksi, HPP, SOP singkat, dan quality note.">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-2">
              {profitMaxRecipes.map((recipe) => (
                <button
                  key={recipe.code}
                  type="button"
                  onClick={() => setSelectedRecipeCode(recipe.code)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectedRecipe.code === recipe.code ? "border-[color-mix(in_srgb,var(--garage-red)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_14%,transparent)]" : "border-white/10 bg-[var(--garage-bg-3)] hover:bg-white/5"
                  }`}
                >
                  <p className="text-sm font-bold text-zinc-50">{recipe.name}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{recipe.serving} | {recipe.prepMinutes} menit</p>
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">{selectedRecipe.code}</p>
                  <h3 className="mt-1 text-lg font-black uppercase text-zinc-50">{selectedRecipe.name}</h3>
                </div>
                <Badge tone="chrome">{selectedRecipe.serving}</Badge>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
                    <tr>
                      <th className="px-2 py-2 text-left">Bahan</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {selectedRecipe.ingredients.map((ingredient) => (
                      <tr key={ingredient.name}>
                        <td className="px-2 py-2 text-zinc-200">{ingredient.name}</td>
                        <td className="px-2 py-2 text-right font-mono text-zinc-400">{ingredient.qty} {ingredient.unit}</td>
                        <td className="px-2 py-2 text-right font-mono text-zinc-100">{formatIdr(ingredient.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <MiniMetric
                label="Total HPP resep"
                value={formatIdr(selectedRecipe.ingredients.reduce((sum, ingredient) => sum + ingredient.cost, 0))}
                tone="amber"
              />
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">SOP singkat</p>
                  <ol className="mt-2 space-y-1 text-xs text-zinc-300">
                    {selectedRecipe.steps.map((step, index) => (
                      <li key={step}>{index + 1}. {step}</li>
                    ))}
                  </ol>
                </div>
                <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_10%,transparent)] p-3 text-xs text-[#ffd8a8]">
                  {selectedRecipe.qualityNotes}
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </section>

      <section id="payroll" className="scroll-mt-4">
        <Panel title="Slip Gaji Karyawan" subtitle="Generator slip gaji 10 karyawan sesuai blueprint ProfitMax.">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.8fr]">
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Nama</th>
                    <th className="px-3 py-2">Posisi</th>
                    <th className="px-3 py-2 text-right">Gaji Pokok</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {payrollRows.map((employee) => (
                    <tr key={employee.id}>
                      <td className="px-3 py-2 font-mono text-zinc-500">{employee.id}</td>
                      <td className="px-3 py-2 font-semibold text-zinc-50">{employee.name}</td>
                      <td className="px-3 py-2 text-zinc-400">{employee.position}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-300">{formatIdr(employee.baseSalary)}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-100">{formatIdr(employee.totalSalary)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedEmployeeId(employee.id)}
                          className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-bold uppercase text-zinc-300 hover:bg-white/5"
                        >
                          Preview
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Preview Slip</p>
                  <h3 className="mt-1 text-lg font-black uppercase text-zinc-50">{selectedPayroll.name}</h3>
                </div>
                <FileText className="h-7 w-7 text-zinc-500" />
              </div>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between gap-3"><span className="text-zinc-500">Posisi</span><strong>{selectedPayroll.position}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-zinc-500">Gaji Pokok</span><strong>{formatIdr(selectedPayroll.baseSalary)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-zinc-500">Tunjangan</span><strong>{formatIdr(selectedPayroll.allowance)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-zinc-500">Potongan</span><strong>{formatIdr(selectedPayroll.deduction)}</strong></div>
                <div className="border-t border-white/10 pt-3">
                  <div className="flex justify-between gap-3 text-sm"><span className="text-zinc-300">Total diterima</span><strong className="text-emerald-300">{formatIdr(selectedPayroll.totalSalary)}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </section>

      <section id="overhead" className="scroll-mt-4">
        <Panel title="Biaya Overhead Calculator" subtitle="Hitung overhead bulanan dan pembebanan biaya per transaksi/porsi.">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.75fr]">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {overheadRows.map((overhead) => (
                <div key={overhead.name} className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-4">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">{overhead.category}</p>
                  <p className="mt-1 text-sm font-bold text-zinc-50">{overhead.name}</p>
                  <p className="mt-2 font-mono text-sm text-zinc-200">{formatIdr(overhead.amount)}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <NumberInput label="Target transaksi bulanan" value={targetTransactions} onChange={setTargetTransactions} suffix="trx" />
              <MiniMetric label="Total overhead bulanan" value={formatIdr(totalOverhead)} tone="amber" />
              <MiniMetric label="Overhead per porsi" value={formatIdr(overheadPerPortion)} tone="success" />
              <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3 text-xs text-zinc-400">
                Angka ini bisa dimasukkan ke kalkulator HPP sebagai biaya tambahan bila owner ingin semua menu menanggung fixed cost.
              </div>
              <button
                type="button"
                onClick={() =>
                  void saveCalculation(
                    "overhead",
                    "Biaya Overhead Calculator",
                    { targetTransactions, totalOverhead },
                    { totalOverhead, overheadPerPortion },
                  )
                }
                disabled={calculationSaving !== null}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 text-[11px] font-bold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)] disabled:cursor-wait disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {calculationSaving === "overhead" ? "Menyimpan..." : "Simpan Overhead"}
              </button>
            </div>
          </div>
        </Panel>
      </section>

      <Panel title="Data Pendukung ProfitMax" subtitle="Ingredient library, scenario, dan action queue dari zip handoff.">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-zinc-400"><PackageSearch className="h-4 w-4" /> Ingredient Stock</div>
            {ingredientRows.slice(0, 5).map((ingredient) => (
              <div key={ingredient.code} className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3 text-xs">
                <div className="flex justify-between gap-3">
                  <strong className="text-zinc-50">{ingredient.name}</strong>
                  <span className="font-mono text-zinc-400">{formatIdr(ingredient.pricePerUnit)}/{ingredient.unit}</span>
                </div>
                <p className="mt-1 text-zinc-500">Stock {ingredient.stock.toLocaleString("id-ID")} {ingredient.unit} | minimum {ingredient.minimumStock.toLocaleString("id-ID")}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-zinc-400"><Scale className="h-4 w-4" /> Skenario Visitor</div>
            {scenarioRows.map((scenario) => (
              <div key={scenario.visitors} className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3 text-xs">
                <div className="flex justify-between gap-3">
                  <strong className="text-zinc-50">{scenario.visitors} visitor/hari</strong>
                  <span className="font-mono text-zinc-200">{formatIdr(scenario.dailyRevenue)}</span>
                </div>
                <p className="mt-1 text-zinc-500">Net {formatIdr(scenario.monthlyNetProfit)} | BEP {scenario.bepMonths} bulan</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-zinc-400"><AlertTriangle className="h-4 w-4" /> Action Queue</div>
            {actionFeedback ? (
              <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-3 text-xs text-zinc-300">
                {actionFeedback}
              </div>
            ) : null}
            {profitMaxActions.map((action) => {
              const Icon = action.icon;
              return (
                <div key={action.title} className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 text-zinc-500" />
                    <div>
                      <strong className="text-zinc-50">{action.title}</strong>
                      <p className="mt-1 text-zinc-500">{action.impact} | {action.owner}</p>
                      <button
                        type="button"
                        onClick={() => void submitProfitMaxAction(action)}
                        disabled={actionSubmitting !== null}
                        className="mt-3 rounded-md border border-white/10 px-2 py-1 text-[10px] font-bold uppercase text-zinc-300 hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
                      >
                        {actionSubmitting === action.title ? "Mengirim..." : "Kirim Approval"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-3 text-[11px] text-zinc-400">
        <RefreshCw className="h-3.5 w-3.5" />
        Semua fitur dari handoff zip sudah dipakai sebagai UI khusus di halaman ini. Tahap berikutnya tinggal mengganti data statis-terhitung menjadi query database utama GARAGE jika tabel ProfitMax native sudah dibuat.
      </div>
    </div>
  );
}
