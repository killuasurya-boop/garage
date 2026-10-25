"use client";

import { discrepancyStatusLabel } from "@/lib/cash-discrepancy";
import { reportFileName } from "@/lib/report-file-name";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  Clock,
  Coffee,
  CreditCard,
  FileText,
  Landmark,
  MoreHorizontal,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { GarageEmpty } from "@/components/garage/garage-state-display";
import { currency, type ModuleId, type Role } from "@/lib/garage-data";
import type { CashSession, ClosingChecklistItem, PaymentBreakdown } from "@/lib/garage-api-types";
import type { FinanceOverview } from "@/lib/finance-types";
import { garageApi } from "@/lib/api-client";
import { GARAGE_TAGS, subscribeGarageCache } from "@/lib/garage-cache";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateFilterBar } from "@/components/garage/date-filter";
import { ReportCenter } from "@/components/garage/report-center";
import { FinanceInvoiceList } from "@/components/garage/finance-invoice-list";
import { FinanceAnomalyPanel } from "@/components/garage/finance-anomaly-panel";
import { FinanceCfoBrief } from "@/components/garage/finance/finance-cfo-brief";
import { FinanceClosingPanel } from "@/components/garage/finance/finance-closing-panel";
import { FinanceShiftTransactions } from "@/components/garage/finance/finance-shift-transactions";
import { FinanceKpi, FinanceStat } from "@/components/garage/finance/finance-kpi";
import { GarageConnectedNav } from "@/components/garage/garage-connected-nav";
import { FinanceRecentOrders } from "@/components/garage/finance/finance-recent-orders";
import {
  FinanceQuickActionDialog,
  type FinanceQuickAction,
} from "@/components/garage/finance/finance-quick-actions";
import { FinanceExpenseDialog } from "@/components/garage/finance/finance-expense-dialog";
import { FinanceMarginDialog } from "@/components/garage/finance/finance-margin-dialog";
import { FinanceDailyBudget } from "@/components/garage/finance/finance-daily-budget";
import {
  FinancePayInvoiceDialog,
  type PayableInvoice,
} from "@/components/garage/finance/finance-pay-invoice-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusClass: Record<string, string> = {
  good: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]",
  watch: "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd79a]",
  warning: "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd79a]",
  critical: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]",
  healthy: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]",
  info: "border-[#3b82f6]/45 bg-[#3b82f6]/12 text-[#93c5fd]",
};

type FinanceTab = "overview" | "invoices" | "reports";

type FinanceMode = "basic" | "full";

const FINANCE_MODE_STORAGE_KEY = "garage-finance-mode";

function readFinanceMode(): FinanceMode {
  if (typeof window === "undefined") return "basic";
  return window.localStorage.getItem(FINANCE_MODE_STORAGE_KEY) === "full"
    ? "full"
    : "basic";
}

export function FinanceView({
  cashSession,
  closingChecklist,
  paymentBreakdown,
  role,
  onNavigateModule,
}: {
  cashSession: CashSession;
  closingChecklist: ClosingChecklistItem[];
  paymentBreakdown: PaymentBreakdown[];
  role?: Role;
  onNavigateModule?: (module: ModuleId) => void;
}) {
  // ?tab=reports (tautan "Laporan" dari Control Center) langsung membuka Pusat Laporan.
  const [activeTab, setActiveTab] = useState<FinanceTab>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "reports" ? "reports" : "overview",
  );
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [quickAction, setQuickAction] = useState<FinanceQuickAction | null>(null);
  const [payInvoice, setPayInvoice] = useState<PayableInvoice | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [marginDialogOpen, setMarginDialogOpen] = useState(false);
  // Mode tampilan: "basic" hanya menampilkan info harian otomatis; "full"
  // membuka semua panel lanjutan (settlement, supplier, guard, dst).
  const [financeMode, setFinanceMode] = useState<FinanceMode>(readFinanceMode);
  const isFull = financeMode === "full";

  function toggleFinanceMode() {
    setFinanceMode((current) => {
      const next: FinanceMode = current === "basic" ? "full" : "basic";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(FINANCE_MODE_STORAGE_KEY, next);
      }
      return next;
    });
  }

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await garageApi.get<FinanceOverview>("/api/finance/overview");
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat overview finance.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch awal inline (setState hanya setelah await) supaya tidak memicu
  // cascading render — `loadOverview` dipakai untuk refresh manual/cross-module.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await garageApi.get<FinanceOverview>("/api/finance/overview");
        if (!cancelled) setOverview(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Gagal memuat overview finance.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cross-module refresh: saat tag `finance` di-invalidate (mis. order baru /
  // void di POS), refetch overview otomatis tanpa reload manual.
  useEffect(
    () =>
      subscribeGarageCache(GARAGE_TAGS.finance, () => {
        void loadOverview();
      }),
    [loadOverview],
  );

  async function downloadExport() {
    setExporting(true);
    try {
      const todayIso = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const response = await fetch(`/api/finance/export?date=${todayIso}`);
      if (!response.ok) throw new Error("Export gagal");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = reportFileName({ kind: "LAPORAN_KEUANGAN_HARIAN", from: todayIso, to: todayIso, ext: "xlsx" });
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export gagal");
    } finally {
      setExporting(false);
    }
  }

  const liveSession = overview?.cashSession ?? cashSession;
  const liveBreakdown = overview?.paymentBreakdown ?? paymentBreakdown;
  const feeLiabilityTotal =
    (overview?.feeLiability.totalAccrued ?? 0) +
    (overview?.feeLiability.totalApproved ?? 0);

  return (
    <section className="garage-finance-module min-w-0 space-y-4">
      {isFull ? <FinanceAnomalyPanel /> : null}
      {role && onNavigateModule ? (
        <GarageConnectedNav
          role={role}
          preset="finance"
          activeModule="finance"
          onNavigate={onNavigateModule}
        />
      ) : null}
      {/* Header bar */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-[#34343c] bg-[#111116] p-4 sm:flex-row sm:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
            Finance
          </p>
          <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">Operasional Keuangan</h1>
          <p className="mt-1 text-xs text-[#b8b8bf]">
            {isFull
              ? "Semua panel: penjualan, cash session, settlement, supplier, P&L, guard, dan fee."
              : "Ringkasan otomatis: penjualan, modal/HPP, laba, kas, pengeluaran, dan untung-rugi."}
          </p>
        </div>
        {activeTab === "overview" && (
          <div className="w-full min-w-0 sm:w-auto">
            <div className="garage-scroll-x flex w-full gap-2 pb-0.5 sm:flex-wrap sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className={`garage-press h-10 shrink-0 ${
                  isFull
                    ? "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a] hover:bg-[#f5a742]/20"
                    : "border-[#4a4a54] text-white"
                }`}
                onClick={toggleFinanceMode}
                aria-pressed={isFull}
                title={
                  isFull
                    ? "Mode Lengkap: semua panel tampil. Klik untuk sederhanakan."
                    : "Mode Basic: hanya info harian penting. Klik untuk buka fitur lanjutan."
                }
              >
                <SlidersHorizontal className="mr-2 size-3.5" />
                <span className="whitespace-nowrap">
                  {isFull ? "Mode: Lengkap" : "Mode: Basic"}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 shrink-0 border-[#4a4a54] text-white"
                onClick={() => void loadOverview()}
                disabled={loading}
              >
                <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
                <span className="sm:hidden">Sync</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 shrink-0 border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a] hover:bg-[#f5a742]/20"
                onClick={() => setExpenseDialogOpen(true)}
              >
                <Wallet className="mr-2 size-3.5" />
                <span className="whitespace-nowrap">Pengeluaran</span>
                {(overview?.expenseAnalysis.pendingApprovalCount ?? 0) > 0 ? (
                  <Badge className="ml-1 border-[#d11a2a]/45 bg-[#d11a2a]/14 px-1.5 text-[10px] text-[#ffc2c8]">
                    {overview?.expenseAnalysis.pendingApprovalCount}
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                className="garage-press h-10 shrink-0"
                onClick={() => void downloadExport()}
                disabled={exporting}
              >
                <FileText className="mr-2 size-3.5" />
                <span className="whitespace-nowrap">
                  {exporting ? "XLSX..." : "Export"}
                </span>
              </Button>
              {isFull ? (
                <>
                  <div className="hidden shrink-0 gap-2 md:flex">
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-10 border-[#22c55e]/45 bg-[#22c55e]/10 text-[#bbf7d0] hover:bg-[#22c55e]/18"
                      onClick={() => setMarginDialogOpen(true)}
                    >
                      <BarChart3 className="mr-2 size-3.5" />
                      Margin Menu
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-10 border-[#4a4a54] text-white"
                      onClick={() => setQuickAction("supplier")}
                    >
                      <Landmark className="mr-2 size-3.5" />
                      Invoice supplier
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-10 border-[#4a4a54] text-white"
                      onClick={() => setQuickAction("settlement")}
                    >
                      <CreditCard className="mr-2 size-3.5" />
                      Settlement
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-10 border-[#4a4a54] text-white"
                      onClick={() => setQuickAction("recipe")}
                    >
                      <Coffee className="mr-2 size-3.5" />
                      BOM
                    </Button>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-10 shrink-0 border-[#4a4a54] text-white md:hidden"
                        aria-label="Aksi finance lainnya"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="border-[#34343c] bg-[#111116] text-white"
                    >
                      <DropdownMenuItem onClick={() => setMarginDialogOpen(true)}>
                        <BarChart3 className="mr-2 size-3.5" />
                        Margin Menu
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setQuickAction("supplier")}>
                        <Landmark className="mr-2 size-3.5" />
                        Invoice supplier
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setQuickAction("settlement")}>
                        <CreditCard className="mr-2 size-3.5" />
                        Settlement
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setQuickAction("recipe")}>
                        <Coffee className="mr-2 size-3.5" />
                        BOM / Recipe
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Tab strip */}
      <div className="grid grid-cols-3 items-stretch gap-1 rounded-lg border border-[#34343c] bg-[#111116] p-1">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`garage-press rounded-md px-2 py-2.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
            activeTab === "overview"
              ? "bg-[#f5a742] text-black"
              : "text-[#d6d6dc] hover:bg-white/[0.04]"
          }`}
        >
          <span className="sm:hidden">Overview</span>
          <span className="hidden sm:inline">Overview Keuangan</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          className={`garage-press rounded-md px-2 py-2.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
            activeTab === "invoices"
              ? "bg-[#f5a742] text-black"
              : "text-[#d6d6dc] hover:bg-white/[0.04]"
          }`}
        >
          <span className="sm:hidden">Invoice</span>
          <span className="hidden sm:inline">Daftar Invoice</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reports")}
          className={`garage-press rounded-md px-2 py-2.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
            activeTab === "reports"
              ? "bg-[#f5a742] text-black"
              : "text-[#d6d6dc] hover:bg-white/[0.04]"
          }`}
        >
          <span className="sm:hidden">Laporan</span>
          <span className="hidden sm:inline">Pusat Laporan</span>
        </button>
      </div>

      {activeTab === "invoices" && (
        <div className="space-y-3">
          {/* Filter tanggal hanya untuk daftar invoice (diteruskan ke server). */}
          <DateFilterBar />
          <FinanceInvoiceList />
        </div>
      )}
      {activeTab === "reports" && <ReportCenter />}

      {activeTab === "overview" && (
        <>
      {error && (
        <Alert className="garage-panel border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertTitle>Finance</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <FinanceClosingPanel onRefreshOverview={() => void loadOverview()} />
      <FinanceCfoBrief />

      {/* KPI cards — ringkasan hari ini (otomatis dari POS + BOM) */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceKpi
          label="Penjualan hari ini"
          value={currency.format(overview?.today.revenue ?? 0)}
          sub={`${overview?.today.orderCount ?? 0} order lunas`}
          tone="good"
        />
        <FinanceKpi
          label={overview?.today.cogsBasis === "recipe" ? "Modal / HPP" : "Belanja bahan hari ini"}
          value={currency.format(overview?.today.cogsBasis === "recipe" ? (overview?.today.recipeFoodCost ?? 0) : (overview?.today.cogs ?? 0))}
          sub={
            overview?.today.cogsBasis === "recipe"
              ? `Food cost ${overview?.today.foodCostRatio ?? 0}% · dari BOM`
              : `Bar + Dapur diterima gudang · HPP resep ${currency.format(overview?.today.recipeFoodCost ?? 0)}`
          }
          tone="amber"
        />
        <FinanceKpi
          label="Laba kotor"
          value={currency.format(overview?.today.grossProfit ?? 0)}
          sub="Penjualan − HPP"
          tone="info"
        />
        <FinanceKpi
          label="Laba bersih"
          value={currency.format(overview?.today.netProfit ?? 0)}
          sub={`AOV ${currency.format(overview?.today.averageOrderValue ?? 0)}`}
          tone={(overview?.today.netProfit ?? 0) < 0 ? "warn" : "good"}
        />
        <FinanceKpi
          label="Kas di tangan"
          value={currency.format(overview?.today.cashCollected ?? 0)}
          sub={`Non-tunai ${currency.format(overview?.today.nonCashCollected ?? 0)}`}
          tone="info"
        />
        {isFull ? (
          <>
            <FinanceKpi
              label="Total biaya"
              value={currency.format(overview?.today.expense ?? 0)}
              sub="COGS, operasional, payroll accrual"
              tone="amber"
            />
            <FinanceKpi
              label="Selisih kas"
              value={currency.format(liveSession.discrepancy)}
              sub={liveSession.status === "open" ? "Shift aktif" : "Shift closed"}
              tone={liveSession.discrepancy !== 0 ? "warn" : "muted"}
            />
            <FinanceKpi
              label="Fee liability"
              value={currency.format(feeLiabilityTotal)}
              sub={`${overview?.feeLiability.accruedCount ?? 0} accrued · ${
                overview?.feeLiability.approvedPayoutCount ?? 0
              } siap bayar`}
              tone={feeLiabilityTotal > 0 ? "amber" : "muted"}
            />
          </>
        ) : null}
      </div>

      <FinanceDailyBudget overview={overview} />

      {isFull ? (
      <Card className="garage-panel garage-animate-in">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Owner final panel</CardTitle>
              <CardDescription>
                Finance guard untuk P&L, settlement, cash closing, supplier, dan food cost.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusClass[overview?.financeGuard.level ?? "info"] ?? statusClass.warning}>
                {overview?.financeGuard.level ?? "loading"}
              </Badge>
              <div className="rounded-md border border-[#34343c] bg-[#17171d] px-3 py-2 text-right">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
                  Health score
                </p>
                <p className="text-xl font-black text-white">
                  {overview?.financeGuard.healthScore ?? 0}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-3">
            <p className="text-sm text-[#d6d6dc]">
              {overview?.financeGuard.brief ?? "Menunggu data finance guard..."}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <FinanceStat
                label="P&L report"
                value={overview?.financeGuard.reportReadiness.pnl ?? "-"}
              />
              <FinanceStat
                label="Settlement"
                value={overview?.financeGuard.reportReadiness.settlement ?? "-"}
              />
              <FinanceStat
                label="Cash closing"
                value={overview?.financeGuard.reportReadiness.cashClosing ?? "-"}
              />
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {(overview?.financeGuard.risks.length
                ? overview.financeGuard.risks
                : [{ area: "Finance guard", level: "healthy", message: "Belum ada risiko kritis dari data saat ini." }]
              ).map((risk) => (
                <div key={`${risk.area}-${risk.message}`} className="garage-surface rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{risk.area}</p>
                    <Badge className={statusClass[risk.level] ?? statusClass.warning}>
                      {risk.level}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-[#b8b8bf]">{risk.message}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="garage-surface rounded-md p-4">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="size-4 text-[#f5a742]" />
              <p className="font-medium text-white">Next action</p>
            </div>
            <div className="space-y-2">
              {(overview?.financeGuard.nextActions ?? ["Muat data finance untuk melihat rekomendasi."]).map(
                (action, index) => (
                  <div key={action} className="flex gap-3 rounded-md border border-[#2b2b33] bg-[#111116] p-3">
                    <span className="font-mono text-[10px] text-[#f5a742]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="text-sm text-[#f4f4f5]">{action}</p>
                  </div>
                ),
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      ) : null}

      {overview?.bomCoverage ? (
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>HPP & BOM Coverage</CardTitle>
            <CardDescription>
              Margin guard: {overview.bomCoverage.withBom}/{overview.bomCoverage.totalVariants}{" "}
              variant punya BOM ({overview.bomCoverage.coveragePct}%).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <FinanceStat
                label="BOM coverage"
                value={`${overview.bomCoverage.coveragePct}%`}
                danger={overview.bomCoverage.coveragePct < 60}
              />
              <FinanceStat
                label="Margin rendah"
                value={String(overview.bomCoverage.lowMarginCount)}
                danger={overview.bomCoverage.lowMarginCount > 0}
              />
              <FinanceStat
                label="Tanpa BOM"
                value={String(overview.bomCoverage.noBomCount)}
                danger={overview.bomCoverage.noBomCount > 0}
              />
            </div>
            {overview.bomCoverage.lowMarginSample.length > 0 ? (
              <div className="garage-scroll max-h-40 space-y-1 overflow-y-auto">
                {overview.bomCoverage.lowMarginSample.map((row) => (
                  <div
                    key={`${row.menuName}-${row.variantLabel}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-[#23232a] bg-[#111116] px-3 py-2 text-xs"
                  >
                    <span className="text-[#d6d6dc]">
                      {row.menuName} · {row.variantLabel}
                    </span>
                    <span className="font-mono font-bold text-[#ffd79a]">
                      margin {row.marginPct}% · HPP {currency.format(row.recipeCost)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Cash session + Payment breakdown */}
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Cash session</CardTitle>
            <CardDescription>
              {liveSession.code} · status {liveSession.status}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <FinanceStat
                label="Opening cash"
                value={currency.format(liveSession.openingCash)}
              />
              <FinanceStat
                label="Expected cash"
                value={currency.format(liveSession.expectedCash)}
              />
              <FinanceStat
                label="Discrepancy"
                value={currency.format(liveSession.discrepancy)}
                danger={liveSession.discrepancy !== 0}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FinanceStat
                label="Discrepancy status"
                value={discrepancyStatusLabel(liveSession.discrepancyStatus ?? "ok")}
                danger={liveSession.discrepancyStatus === "critical"}
              />
              <FinanceStat
                label="Manager sign-off"
                value={liveSession.managerSignOffAt ? "Signed" : "Pending"}
                danger={!liveSession.managerSignOffAt && liveSession.status === "closed"}
              />
              <div className="garage-surface garage-hover-lift rounded-md p-3">
                <p className="text-xs text-muted-foreground">Closing final</p>
                <Button
                  type="button"
                  size="sm"
                  className="garage-press mt-2 h-8"
                  disabled={liveSession.status !== "open"}
                  onClick={() => setQuickAction("close-cash")}
                >
                  Tutup cash
                </Button>
              </div>
            </div>
            <div className="garage-surface rounded-md p-4">
              <div className="mb-3 flex items-center gap-2">
                <ReceiptText className="size-4 text-[#d11a2a]" />
                <p className="font-medium text-white">Closing checklist</p>
              </div>
              <div className="space-y-2">
                {closingChecklist.map((item) => (
                  <div
                    key={item.label}
                    className="garage-surface flex items-center justify-between gap-3 rounded-md px-3 py-2"
                  >
                    <span className="text-sm">{item.label}</span>
                    {item.done ? (
                      <Check className="size-4 text-[#d4d4d8]" />
                    ) : (
                      <Clock className="size-4 text-amber-300" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Payment breakdown</CardTitle>
            <CardDescription>Metode pembayaran (akumulasi).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {liveBreakdown.length === 0 ? (
              <GarageEmpty
                icon={CreditCard}
                title="Belum ada pembayaran"
                description="Pembayaran POS hari ini akan muncul di sini begitu kasir memproses transaksi."
                compact
              />
            ) : (
              liveBreakdown.map((item) => (
                <div key={item.method} className="garage-surface space-y-2 rounded-md p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{item.method}</span>
                    <span className="font-semibold text-white">
                      {currency.format(item.amount)}
                    </span>
                  </div>
                  <Progress value={item.share} className="h-2" />
                  <p className="text-right font-mono text-[10px] text-[#888]">
                    {item.share}%
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <FinanceShiftTransactions
        key={liveSession.id ?? "no-session"}
        sessionId={liveSession.id}
      />

      {/* MVP finance master panels */}
      <div
        className={
          isFull ? "grid gap-4 xl:grid-cols-[1.25fr_0.75fr]" : "grid gap-4"
        }
      >
        {isFull ? (
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Settlement & rekonsiliasi bank</CardTitle>
            <CardDescription>POS vs settlement payment provider hari ini.</CardDescription>
          </CardHeader>
          <CardContent>
            {!overview || overview.paymentSettlement.length === 0 ? (
              <GarageEmpty
                icon={Landmark}
                title="Belum ada settlement"
                description="Settlement payment provider (QRIS, e-wallet) akan tampil di sini setelah cair."
                compact
              />
            ) : (
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="font-mono text-[10px] uppercase tracking-wider text-[#8f8f99] hover:bg-transparent">
                    <TableHead className="font-normal text-[#8f8f99]">Metode</TableHead>
                    <TableHead className="font-normal text-[#8f8f99]">Provider</TableHead>
                    <TableHead className="text-right font-normal text-[#8f8f99]">Nominal</TableHead>
                    <TableHead className="text-right font-normal text-[#8f8f99]">Share</TableHead>
                    <TableHead className="font-normal text-[#8f8f99]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.paymentSettlement.map((row) => (
                    <TableRow key={`${row.method}-${row.provider}`}>
                      <TableCell className="font-semibold text-white">{row.method}</TableCell>
                      <TableCell className="text-xs text-[#d6d6dc]">{row.provider}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-[#ffd79a]">
                        {currency.format(row.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-[#b8b8bf]">
                        {row.share}%
                      </TableCell>
                      <TableCell>
                        <Badge className={statusClass[row.status.toLowerCase()] ?? statusClass.info}>
                          {row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        ) : null}

        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Expense analysis</CardTitle>
            <CardDescription>Kontrol food cost dan biaya harian coffee shop.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <FinanceStat
                label="Total expense"
                value={currency.format(overview?.expenseAnalysis.totalExpense ?? 0)}
              />
              <FinanceStat
                label="COGS / HPP"
                value={currency.format(overview?.expenseAnalysis.cogs ?? 0)}
              />
              <FinanceStat
                label="HPP dari BOM"
                value={currency.format(overview?.today.recipeFoodCost ?? 0)}
              />
              <FinanceStat
                label="Payroll accrual"
                value={currency.format(overview?.expenseAnalysis.payroll ?? 0)}
              />
              <FinanceStat
                label="Pending approval"
                value={currency.format(overview?.expenseAnalysis.pendingApproval ?? 0)}
                danger={(overview?.expenseAnalysis.pendingApprovalCount ?? 0) > 0}
              />
              <FinanceStat
                label="Cash expense"
                value={currency.format(overview?.expenseAnalysis.cashExpense ?? 0)}
              />
            </div>
            <div className="space-y-2">
              {(overview?.expenseAnalysis.categories ?? []).map((row) => (
                <div key={row.category} className="garage-surface rounded-md p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{row.category}</p>
                    <p className="font-mono text-xs font-semibold text-[#ffd79a]">
                      {currency.format(row.amount)}
                    </p>
                  </div>
                  <p className="mt-1 text-[10px] text-[#888]">{row.note}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div
        className={
          isFull ? "grid gap-4 xl:grid-cols-[0.95fr_1.05fr]" : "grid gap-4"
        }
      >
        {isFull ? (
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Cashflow monitoring</CardTitle>
            <CardDescription>Arus kas masuk dan keluar bulan berjalan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <FinanceStat label="Cash in" value={currency.format(overview?.cashflow.cashIn ?? 0)} />
              <FinanceStat label="Cash out" value={currency.format(overview?.cashflow.cashOut ?? 0)} />
              <FinanceStat
                label="Net flow"
                value={currency.format(overview?.cashflow.netFlow ?? 0)}
                danger={(overview?.cashflow.netFlow ?? 0) < 0}
              />
              <FinanceStat
                label="Burn rate/hari"
                value={currency.format(overview?.cashflow.burnRateDaily ?? 0)}
              />
            </div>
            <div className="space-y-2">
              {(overview?.cashflow.weeks ?? []).map((row) => (
                <div key={row.period} className="garage-surface rounded-md p-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-mono text-[#b8b8bf]">{row.period}</span>
                    <span className="text-[#dcfce7]">IN {currency.format(row.cashIn)}</span>
                    <span className="text-[#ffc2c8]">OUT {currency.format(row.cashOut)}</span>
                    <span className="font-semibold text-white">{currency.format(row.netFlow)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        ) : null}

        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Profit & loss summary</CardTitle>
            <CardDescription>Laporan laba rugi bulan berjalan.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                ["Pendapatan bruto", overview?.profitLoss.grossRevenue ?? 0],
                ["Diskon & retur", -(overview?.profitLoss.discounts ?? 0)],
                ["Pendapatan neto", overview?.profitLoss.netRevenue ?? 0],
                [overview?.today.cogsBasis === "recipe" ? "HPP / COGS" : "Belanja bahan (gudang)", -(overview?.profitLoss.cogs ?? 0)],
                ["Gross profit", overview?.profitLoss.grossProfit ?? 0],
                ["Gaji pegawai", -(overview?.profitLoss.payroll ?? 0)],
                ["Operasional", -(overview?.profitLoss.operational ?? 0)],
                ["Marketing", -(overview?.profitLoss.marketing ?? 0)],
                ["Lain-lain", -(overview?.profitLoss.other ?? 0)],
                ["Net profit", overview?.profitLoss.netProfit ?? 0],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between gap-3 border-b border-[#23232a] py-2 text-sm"
                >
                  <span className="text-[#d6d6dc]">{label}</span>
                  <span
                    className={`font-mono font-semibold ${
                      Number(value) < 0 ? "text-[#ffc2c8]" : "text-white"
                    }`}
                  >
                    {currency.format(Number(value))}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {isFull ? (
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Hutang supplier</CardTitle>
            <CardDescription>Monitoring pembayaran bahan baku dan operasional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <FinanceStat label="Total hutang" value={currency.format(overview?.supplierPayables.total ?? 0)} />
              <FinanceStat label="Jatuh tempo" value={currency.format(overview?.supplierPayables.due ?? 0)} />
              <FinanceStat
                label="Overdue"
                value={currency.format(overview?.supplierPayables.overdue ?? 0)}
                danger={(overview?.supplierPayables.overdue ?? 0) > 0}
              />
              <FinanceStat label="Bayar/bulan" value={currency.format(overview?.supplierPayables.paidThisMonth ?? 0)} />
            </div>
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow className="font-mono text-[10px] uppercase tracking-wider text-[#8f8f99] hover:bg-transparent">
                  <TableHead className="font-normal text-[#8f8f99]">Supplier</TableHead>
                  <TableHead className="font-normal text-[#8f8f99]">Invoice</TableHead>
                  <TableHead className="font-normal text-[#8f8f99]">Jatuh tempo</TableHead>
                  <TableHead className="text-right font-normal text-[#8f8f99]">Nominal</TableHead>
                  <TableHead className="font-normal text-[#8f8f99]">Status</TableHead>
                  <TableHead className="text-right font-normal text-[#8f8f99]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(overview?.supplierPayables.rows ?? []).map((row) => (
                  <TableRow key={row.invoiceNo}>
                    <TableCell className="text-white">{row.supplier}</TableCell>
                    <TableCell className="font-mono text-xs text-[#b8b8bf]">{row.invoiceNo}</TableCell>
                    <TableCell className="font-mono text-xs text-[#b8b8bf]">{row.dueDate}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-[#ffd79a]">
                      {currency.format(row.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          row.status === "OVERDUE"
                            ? statusClass.critical
                            : row.status === "Jatuh Tempo"
                              ? statusClass.warning
                              : statusClass.info
                        }
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-[#22c55e]/45 text-[#dcfce7]"
                          disabled={row.status === "Paid"}
                          onClick={() =>
                            setPayInvoice({
                              id: row.id as string,
                              supplier: row.supplier,
                              invoiceNo: row.invoiceNo,
                              amount: row.amount,
                            })
                          }
                        >
                          Mark paid
                        </Button>
                      ) : (
                        <span className="font-mono text-[10px] text-[#666]">Seed</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Alerts & notifikasi</CardTitle>
            <CardDescription>Peringatan finance aktif untuk owner dan CFO.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(overview?.alerts ?? []).length === 0 ? (
              <GarageEmpty
                icon={ShieldCheck}
                title="Tidak ada alert finance"
                description="Semua metrik finance dalam batas aman. Anomaly detector tetap memantau."
                compact
              />
            ) : (
              overview?.alerts.map((alert) => (
                <div key={`${alert.type}-${alert.message}`} className="garage-surface rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                      {alert.type}
                    </p>
                    <Badge className={statusClass[alert.level.toLowerCase()] ?? statusClass.info}>
                      {alert.level}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-white">{alert.message}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#888]">{alert.time}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      ) : null}

      {isFull ? (
      <Card className="garage-panel garage-animate-in">
        <CardHeader>
          <CardTitle>Role access & modul finance</CardTitle>
          <CardDescription>Hak akses MVP untuk sales, expense, cashflow, settlement, P&L, supplier, dan CEO panel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="font-mono text-[10px] uppercase tracking-wider text-[#8f8f99] hover:bg-transparent">
                {["Role", "Sales", "Expense", "Cashflow", "Settlement", "P&L", "Supplier", "CEO Panel"].map((head) => (
                  <TableHead key={head} className="font-normal text-[#8f8f99]">{head}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(overview?.roleAccess ?? []).map((row) => (
                <TableRow key={row.role}>
                  <TableCell className="font-semibold text-white">{row.role}</TableCell>
                  {[row.sales, row.expense, row.cashflow, row.settlement, row.pnl, row.supplier, row.ceoPanel].map((value, index) => (
                    <TableCell key={`${row.role}-${index}`} className="text-xs text-[#d6d6dc]">
                      {value}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      ) : null}

      {/* Recent transactions + Fee liability */}
      <div
        className={isFull ? "grid gap-4 xl:grid-cols-[1.5fr_1fr]" : "grid gap-4"}
      >
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Transaksi terbaru</CardTitle>
            <CardDescription>15 order paid terakhir.</CardDescription>
          </CardHeader>
          <CardContent>
            <FinanceRecentOrders rows={overview?.recentOrders ?? []} />
          </CardContent>
        </Card>

        {isFull ? (
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Staff fee liability</CardTitle>
            <CardDescription>Hutang fee karyawan yang belum cair.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FinanceStat
              label="Accrued (belum di-payout)"
              value={currency.format(overview?.feeLiability.totalAccrued ?? 0)}
            />
            <FinanceStat
              label="Approved (siap bayar)"
              value={currency.format(overview?.feeLiability.totalApproved ?? 0)}
              danger={Boolean(
                overview?.feeLiability.totalApproved &&
                  overview.feeLiability.totalApproved > 0,
              )}
            />
            <div className="garage-surface space-y-1 rounded-md p-3 text-xs text-[#b8b8bf]">
              <p>
                <span className="text-white">{overview?.feeLiability.accruedCount ?? 0}</span>{" "}
                baris earning belum dicairkan
              </p>
              <p>
                <span className="text-white">
                  {overview?.feeLiability.approvedPayoutCount ?? 0}
                </span>{" "}
                payout sudah approved menunggu transfer
              </p>
              <p className="mt-2">
                Buka modul <span className="text-[#f5a742]">Fee Saya</span> untuk approve atau mark
                paid.
              </p>
            </div>
          </CardContent>
        </Card>
        ) : null}
      </div>
        </>
      )}

      <FinanceExpenseDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        onOverviewRefresh={() => void loadOverview()}
      />

      <FinanceMarginDialog
        open={marginDialogOpen}
        onOpenChange={setMarginDialogOpen}
      />

      <FinancePayInvoiceDialog
        invoice={payInvoice}
        onOpenChange={(open) => {
          if (!open) setPayInvoice(null);
        }}
        onDone={() => void loadOverview()}
      />

      {/* Dialog: aksi cepat finance (supplier / settlement / BOM / tutup cash) */}
      <FinanceQuickActionDialog
        action={quickAction}
        sessionId={liveSession.id}
        expectedCash={liveSession.expectedCash}
        onOpenChange={(open) => {
          if (!open) setQuickAction(null);
        }}
        onDone={() => void loadOverview()}
      />
    </section>
  );
}
