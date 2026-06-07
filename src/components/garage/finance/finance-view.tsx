"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChefHat,
  Clock,
  Coffee,
  CreditCard,
  FileText,
  Landmark,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Square,
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FinanceInvoiceList } from "@/components/garage/finance-invoice-list";
import { FinanceAnomalyPanel } from "@/components/garage/finance-anomaly-panel";
import { FinanceCfoBrief } from "@/components/garage/finance/finance-cfo-brief";
import { FinanceClosingPanel } from "@/components/garage/finance/finance-closing-panel";
import { FinanceShiftTransactions } from "@/components/garage/finance/finance-shift-transactions";
import { FinanceKpi, FinanceStat } from "@/components/garage/finance/finance-kpi";
import { GarageConnectedNav } from "@/components/garage/garage-connected-nav";
import { FinanceRecentOrders } from "@/components/garage/finance/finance-recent-orders";
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

function todayDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

type FinanceTab = "overview" | "invoices";

const FINAL_MVP_UAT_STORAGE_KEY = "garage-final-mvp-uat-v1";

const finalMvpUatItems = [
  {
    id: "cashier-shift",
    label: "Kasir shift",
    detail: "Open shift, transaksi POS, tutup shift, dan laporan shift tercetak.",
  },
  {
    id: "finance-expense",
    label: "Finance pengeluaran",
    detail: "Expense kecil recorded, expense besar approval, approve/reject, lalu export.",
  },
  {
    id: "inventory-opname",
    label: "Stok opname",
    detail: "Buat opname batch, approve, apply, dan stok/movement berubah benar.",
  },
  {
    id: "qr-order",
    label: "QR order",
    detail: "Order digital masuk, accept/final bayar/reject, dan history bisa dikontrol.",
  },
  {
    id: "member-lock",
    label: "Member lock",
    detail: "Nomor HP sama memakai nama awal yang sudah terdaftar.",
  },
] as const;

type FinalMvpUatId = (typeof finalMvpUatItems)[number]["id"];

function readFinalMvpUatState(): Record<FinalMvpUatId, boolean> {
  const fallback = Object.fromEntries(
    finalMvpUatItems.map((item) => [item.id, false]),
  ) as Record<FinalMvpUatId, boolean>;
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(FINAL_MVP_UAT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Record<FinalMvpUatId, boolean>>;
    return {
      ...fallback,
      ...Object.fromEntries(
        finalMvpUatItems.map((item) => [item.id, Boolean(parsed[item.id])]),
      ),
    } as Record<FinalMvpUatId, boolean>;
  } catch {
    return fallback;
  }
}

export function FinalMvpUatPanel() {
  const [checked, setChecked] = useState<Record<FinalMvpUatId, boolean>>(
    readFinalMvpUatState,
  );
  const completed = finalMvpUatItems.filter((item) => checked[item.id]).length;
  const percent = Math.round((completed / finalMvpUatItems.length) * 100);

  function toggleItem(id: FinalMvpUatId) {
    setChecked((current) => {
      const next = { ...current, [id]: !current[id] };
      window.localStorage.setItem(FINAL_MVP_UAT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function resetChecklist() {
    const next = Object.fromEntries(
      finalMvpUatItems.map((item) => [item.id, false]),
    ) as Record<FinalMvpUatId, boolean>;
    window.localStorage.setItem(FINAL_MVP_UAT_STORAGE_KEY, JSON.stringify(next));
    setChecked(next);
  }

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>UAT Final MVP 1-5</CardTitle>
            <CardDescription>
              Checklist validasi manual. Fee karyawan nomor 6 berjalan otomatis oleh sistem.
            </CardDescription>
          </div>
          <div className="rounded-md border border-[#34343c] bg-[#17171d] px-3 py-2 text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
              Progress
            </p>
            <p className="text-xl font-black text-white">
              {completed}/{finalMvpUatItems.length}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={percent} className="h-2 bg-[#25252d]" />
        <div className="grid gap-2 lg:grid-cols-5">
          {finalMvpUatItems.map((item, index) => {
            const done = checked[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                className={`garage-press min-h-[118px] rounded-md border p-3 text-left transition-colors ${
                  done
                    ? "border-[#22c55e]/55 bg-[#22c55e]/12"
                    : "border-[#34343c] bg-[#111116] hover:border-[#f5a742]/45"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-[#f5a742]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`inline-flex size-6 items-center justify-center rounded-md border ${
                      done
                        ? "border-[#22c55e]/60 bg-[#22c55e] text-black"
                        : "border-[#4a4a54] text-[#888]"
                    }`}
                  >
                    {done ? <Check className="size-3.5" /> : <Square className="size-3" />}
                  </span>
                </div>
                <p className="mt-3 text-sm font-bold text-white">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">{item.detail}</p>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-[#3b82f6]/35 bg-[#3b82f6]/10 p-3 text-xs text-[#dbeafe] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <LockKeyhole className="mt-0.5 size-4 text-[#93c5fd]" />
            <p>
              Fee Saya otomatis: Kasir/Koki/Barista/Waiter tercatat dari event POS/KDS,
              terkunci 5 bulan, lalu payout otomatis masuk antrian Finance saat eligible.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-[#4a4a54] text-white"
            onClick={resetChecklist}
          >
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
  const [activeTab, setActiveTab] = useState<FinanceTab>("overview");
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [financeAction, setFinanceAction] = useState<string | null>(null);
  // ── Daftar Pengeluaran + form modern ──
  // ── Recipe margin report ──
  type MarginRow = {
    menuItemId: string;
    menuName: string;
    category: string;
    variantId: string;
    variantLabel: string;
    price: number;
    recipeCost: number;
    margin: number;
    marginPct: number;
    ingredients: number;
  };
  const [marginDialogOpen, setMarginDialogOpen] = useState(false);
  const [marginRows, setMarginRows] = useState<MarginRow[]>([]);
  const [marginLoading, setMarginLoading] = useState(false);
  const loadMarginReport = useCallback(async () => {
    setMarginLoading(true);
    try {
      const data = await garageApi.get<{ rows: MarginRow[] }>(
        "/api/finance/recipes/margin",
      );
      setMarginRows(data.rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat margin report.",
      );
    } finally {
      setMarginLoading(false);
    }
  }, []);

  type ExpenseRow = {
    id: string;
    category: string;
    description: string;
    amount: number;
    paymentMethod: string;
    status: string;
    expenseDate: string;
    receiptUrl: string | null;
    notes: string | null;
    approvedAt: string | null;
    createdAt: string;
  };
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseList, setExpenseList] = useState<ExpenseRow[]>([]);
  const [expenseListLoading, setExpenseListLoading] = useState(false);
  const [expenseFilterCategory, setExpenseFilterCategory] = useState("all");
  const [expenseFilterStatus, setExpenseFilterStatus] = useState("all");
  const [expenseDecisionId, setExpenseDecisionId] = useState<string | null>(null);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [expenseFormCategory, setExpenseFormCategory] = useState("Operasional");
  const [expenseFormDescription, setExpenseFormDescription] = useState("");
  const [expenseFormAmount, setExpenseFormAmount] = useState("");
  const [expenseFormPaymentMethod, setExpenseFormPaymentMethod] = useState("Cash");
  const [expenseFormNote, setExpenseFormNote] = useState("");
  const [expenseFormSaving, setExpenseFormSaving] = useState(false);
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);

  const loadExpenseList = useCallback(async () => {
    setExpenseListLoading(true);
    try {
      const params = new URLSearchParams();
      if (expenseFilterCategory && expenseFilterCategory !== "all") {
        params.set("category", expenseFilterCategory);
      }
      if (expenseFilterStatus && expenseFilterStatus !== "all") {
        params.set("status", expenseFilterStatus);
      }
      params.set("limit", "100");
      const data = await garageApi.get<{ expenses: ExpenseRow[] }>(
        `/api/finance/expenses?${params.toString()}`,
      );
      setExpenseList(data.expenses);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat daftar pengeluaran.",
      );
    } finally {
      setExpenseListLoading(false);
    }
  }, [expenseFilterCategory, expenseFilterStatus]);

  async function decideExpense(id: string, decision: "approve" | "reject") {
    setExpenseDecisionId(id);
    setError(null);
    try {
      await garageApi.patch(`/api/finance/expenses/${id}/${decision}`, {});
      await Promise.all([loadOverview(), loadExpenseList()]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Keputusan pengeluaran gagal.",
      );
    } finally {
      setExpenseDecisionId(null);
    }
  }

  function openExpenseDialog() {
    setExpenseDialogOpen(true);
    void loadExpenseList();
  }

  function openExpenseForm() {
    setExpenseFormCategory("Operasional");
    setExpenseFormDescription("");
    setExpenseFormAmount("");
    setExpenseFormPaymentMethod("Cash");
    setExpenseFormNote("");
    setExpenseFormError(null);
    setExpenseFormOpen(true);
  }

  async function submitExpenseForm() {
    const amount = Number(expenseFormAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setExpenseFormError("Nominal tidak valid.");
      return;
    }
    const description = expenseFormDescription.trim();
    if (description.length < 2) {
      setExpenseFormError("Deskripsi wajib diisi.");
      return;
    }
    setExpenseFormSaving(true);
    setExpenseFormError(null);
    try {
      await garageApi.post("/api/finance/expenses", {
        category: expenseFormCategory.trim() || "Operasional",
        description,
        amount: Math.round(amount),
        paymentMethod: expenseFormPaymentMethod || "Cash",
        notes: expenseFormNote.trim() || undefined,
      });
      setExpenseFormOpen(false);
      await Promise.all([loadOverview(), loadExpenseList()]);
    } catch (err) {
      setExpenseFormError(
        err instanceof Error ? err.message : "Gagal menyimpan pengeluaran.",
      );
    } finally {
      setExpenseFormSaving(false);
    }
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

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

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
      link.download = `garage-finance-${todayIso}.xlsx`;
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

  async function recordQuickSupplierInvoice() {
    const supplierName = window.prompt("Nama supplier:");
    if (!supplierName?.trim()) return;
    const invoiceNo =
      window.prompt("Nomor invoice:", "INV-MANUAL") || "INV-MANUAL";
    const amountText = window.prompt("Nominal invoice (angka rupiah):");
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Nominal invoice tidak valid.");
      return;
    }
    const dueDateText = window.prompt("Tanggal jatuh tempo (YYYY-MM-DD):", todayDateKey());
    const dueDate = `${dueDateText || todayDateKey()}T10:00:00+07:00`;
    const code = `SUP-${supplierName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 24)}`;

    setFinanceAction("supplier-invoice");
    setError(null);
    try {
      const supplier = await garageApi.post<{ id: string }>("/api/finance/suppliers", {
        code,
        name: supplierName.trim(),
        category: "COGS",
      });
      await garageApi.post("/api/finance/supplier-invoices", {
        supplierId: supplier.id,
        invoiceNo,
        category: "COGS",
        description: `Invoice ${supplierName.trim()}`,
        amount: Math.round(amount),
        dueDate,
      });
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invoice supplier gagal dicatat.");
    } finally {
      setFinanceAction(null);
    }
  }

  async function recordQuickSettlement() {
    const method = window.prompt("Metode settlement (QRIS/E-Wallet/Card/Bank Transfer):", "QRIS");
    if (!method?.trim()) return;
    const provider = window.prompt("Provider/bank:", "BCA");
    if (!provider?.trim()) return;
    const expectedText = window.prompt("Nominal POS expected:");
    const expectedAmount = Number(expectedText);
    if (!Number.isFinite(expectedAmount) || expectedAmount < 0) {
      setError("Nominal settlement tidak valid.");
      return;
    }
    const settledText = window.prompt("Nominal settled dari bank/provider:", String(Math.round(expectedAmount)));
    const settledAmount = Number(settledText);
    if (!Number.isFinite(settledAmount) || settledAmount < 0) {
      setError("Nominal settled tidak valid.");
      return;
    }
    const status = settledAmount === expectedAmount ? "settled" : "mismatch";
    setFinanceAction("settlement");
    setError(null);
    try {
      await garageApi.post("/api/finance/settlements", {
        settlementNo: window.prompt("Settlement ID:", "SET-MANUAL") || "SET-MANUAL",
        method: method.trim(),
        provider: provider.trim(),
        expectedAmount: Math.round(expectedAmount),
        settledAmount: Math.round(settledAmount),
        status,
        settlementDate: `${todayDateKey()}T16:00:00+07:00`,
      });
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settlement gagal dicatat.");
    } finally {
      setFinanceAction(null);
    }
  }

  async function closeFinanceCashSession() {
    if (!liveSession.id) {
      setError("Cash session belum tersedia.");
      return;
    }
    const actualText = window.prompt("Actual cash total:", String(liveSession.expectedCash));
    const actualCash = Number(actualText);
    if (!Number.isFinite(actualCash) || actualCash < 0) {
      setError("Actual cash tidak valid.");
      return;
    }
    const note = window.prompt("Catatan closing:", "Closing finance dashboard") ?? "";
    const managerSignOff = window.confirm("Manager sign-off sekarang?");
    setFinanceAction("close-cash");
    setError(null);
    try {
      await garageApi.patch(`/api/finance/cash-sessions/${liveSession.id}/close`, {
        actualCash: Math.round(actualCash),
        denominations: { "1": Math.round(actualCash) },
        closingNote: note.trim() || undefined,
        managerSignOff,
      });
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Closing cash gagal.");
    } finally {
      setFinanceAction(null);
    }
  }

  async function recordQuickRecipe() {
    const menuItemId = window.prompt("Menu item ID:", "coffee-americano");
    if (!menuItemId?.trim()) return;
    const inventorySku = window.prompt("Inventory SKU:", "INV-073");
    if (!inventorySku?.trim()) return;
    const qtyText = window.prompt("Qty bahan per menu:", "0.018");
    const qty = Number(qtyText);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Qty recipe tidak valid.");
      return;
    }
    const unit = window.prompt("Unit recipe:", "kg") || "kg";
    const wastePct = Number(window.prompt("Waste %:", "3") || "0");
    setFinanceAction("recipe");
    setError(null);
    try {
      await garageApi.post("/api/finance/recipes", {
        menuItemId: menuItemId.trim(),
        variantId: "all",
        inventorySku: inventorySku.trim(),
        qty,
        unit: unit.trim(),
        wastePct: Number.isFinite(wastePct) ? wastePct : 0,
      });
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recipe/BOM gagal dicatat.");
    } finally {
      setFinanceAction(null);
    }
  }

  async function paySupplierInvoice(id: string) {
    const paymentRef = window.prompt("Reference pembayaran:", "PAY-MANUAL") ?? "";
    setFinanceAction(`pay:${id}`);
    setError(null);
    try {
      await garageApi.post(`/api/finance/supplier-invoices/${id}/pay`, {
        paymentRef: paymentRef.trim() || undefined,
      });
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invoice supplier gagal dibayar.");
    } finally {
      setFinanceAction(null);
    }
  }

  const liveSession = overview?.cashSession ?? cashSession;
  const liveBreakdown = overview?.paymentBreakdown ?? paymentBreakdown;
  const feeLiabilityTotal =
    (overview?.feeLiability.totalAccrued ?? 0) +
    (overview?.feeLiability.totalApproved ?? 0);
  const expensePendingRows = expenseList.filter(
    (row) => row.status === "pending_approval",
  );
  const expenseVisibleTotal = expenseList.reduce((sum, row) => sum + row.amount, 0);
  const expensePendingTotal = expensePendingRows.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  const expenseCashTotal = expenseList
    .filter((row) => row.paymentMethod.toLowerCase() === "cash")
    .reduce((sum, row) => sum + row.amount, 0);

  return (
    <section className="garage-finance-module min-w-0 space-y-4">
      <FinanceAnomalyPanel />
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
            Revenue hari ini, cash session, payment breakdown, fee liability, dan recent paid orders.
          </p>
        </div>
        {activeTab === "overview" && (
          <div className="w-full min-w-0 sm:w-auto">
            <div className="garage-scroll-x flex w-full gap-2 pb-0.5 sm:flex-wrap sm:justify-end">
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
                onClick={openExpenseDialog}
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
              <div className="hidden shrink-0 gap-2 md:flex">
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#22c55e]/45 bg-[#22c55e]/10 text-[#bbf7d0] hover:bg-[#22c55e]/18"
                  onClick={() => {
                    setMarginDialogOpen(true);
                    void loadMarginReport();
                  }}
                >
                  <BarChart3 className="mr-2 size-3.5" />
                  Margin Menu
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#4a4a54] text-white"
                  onClick={() => void recordQuickSupplierInvoice()}
                  disabled={Boolean(financeAction)}
                >
                  <Landmark className="mr-2 size-3.5" />
                  Invoice supplier
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#4a4a54] text-white"
                  onClick={() => void recordQuickSettlement()}
                  disabled={Boolean(financeAction)}
                >
                  <CreditCard className="mr-2 size-3.5" />
                  Settlement
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#4a4a54] text-white"
                  onClick={() => void recordQuickRecipe()}
                  disabled={Boolean(financeAction)}
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
                  <DropdownMenuItem
                    onClick={() => {
                      setMarginDialogOpen(true);
                      void loadMarginReport();
                    }}
                  >
                    <BarChart3 className="mr-2 size-3.5" />
                    Margin Menu
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void recordQuickSupplierInvoice()}
                    disabled={Boolean(financeAction)}
                  >
                    <Landmark className="mr-2 size-3.5" />
                    Invoice supplier
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void recordQuickSettlement()}
                    disabled={Boolean(financeAction)}
                  >
                    <CreditCard className="mr-2 size-3.5" />
                    Settlement
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void recordQuickRecipe()}
                    disabled={Boolean(financeAction)}
                  >
                    <Coffee className="mr-2 size-3.5" />
                    BOM / Recipe
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>

      {/* Tab strip */}
      <div className="grid grid-cols-2 items-stretch gap-1 rounded-lg border border-[#34343c] bg-[#111116] p-1">
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
      </div>

      {activeTab === "invoices" && <FinanceInvoiceList />}

      {activeTab === "overview" && (
        <>
      {error && (
        <Alert className="garage-panel border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertTitle>Finance</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <FinalMvpUatPanel />
      <FinanceClosingPanel onRefreshOverview={() => void loadOverview()} />
      <FinanceCfoBrief />

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceKpi
          label="Daily sales"
          value={currency.format(overview?.today.revenue ?? 0)}
          sub={`${overview?.today.orderCount ?? 0} order paid`}
          tone="good"
        />
        <FinanceKpi
          label="Daily expense"
          value={currency.format(overview?.today.expense ?? 0)}
          sub="COGS, operasional, payroll accrual"
          tone="amber"
        />
        <FinanceKpi
          label="Gross profit"
          value={currency.format(overview?.today.grossProfit ?? 0)}
          sub={`Food cost ${overview?.today.foodCostRatio ?? 0}% · BOM ${
            overview?.today.recipeLines ?? 0
          } line`}
          tone="info"
        />
        <FinanceKpi
          label="Net profit"
          value={currency.format(overview?.today.netProfit ?? 0)}
          sub={`AOV ${currency.format(overview?.today.averageOrderValue ?? 0)}`}
          tone={(overview?.today.netProfit ?? 0) < 0 ? "warn" : "good"}
        />
        <FinanceKpi
          label="Cash collected"
          value={currency.format(overview?.today.cashCollected ?? 0)}
          sub={`Non-cash ${currency.format(overview?.today.nonCashCollected ?? 0)}`}
          tone="info"
        />
        <FinanceKpi
          label="Discrepancy"
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
      </div>

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
                value={liveSession.discrepancyStatus ?? "ok"}
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
                  disabled={liveSession.status !== "open" || financeAction === "close-cash"}
                  onClick={() => void closeFinanceCashSession()}
                >
                  {financeAction === "close-cash" ? "..." : "Tutup cash"}
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
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                      <th className="py-2 pr-2 text-left font-normal">Metode</th>
                      <th className="py-2 pr-2 text-left font-normal">Provider</th>
                      <th className="py-2 pr-2 text-right font-normal">Nominal</th>
                      <th className="py-2 pr-2 text-right font-normal">Share</th>
                      <th className="py-2 text-left font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.paymentSettlement.map((row) => (
                      <tr key={`${row.method}-${row.provider}`} className="border-b border-[#23232a]">
                        <td className="py-2 pr-2 font-semibold text-white">{row.method}</td>
                        <td className="py-2 pr-2 text-xs text-[#d6d6dc]">{row.provider}</td>
                        <td className="py-2 pr-2 text-right font-mono text-xs text-[#ffd79a]">
                          {currency.format(row.amount)}
                        </td>
                        <td className="py-2 pr-2 text-right font-mono text-xs text-[#b8b8bf]">
                          {row.share}%
                        </td>
                        <td className="py-2">
                          <Badge className={statusClass[row.status.toLowerCase()] ?? statusClass.info}>
                            {row.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

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

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
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
                ["HPP / COGS", -(overview?.profitLoss.cogs ?? 0)],
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                    <th className="py-2 pr-2 text-left font-normal">Supplier</th>
                    <th className="py-2 pr-2 text-left font-normal">Invoice</th>
                    <th className="py-2 pr-2 text-left font-normal">Jatuh tempo</th>
                    <th className="py-2 pr-2 text-right font-normal">Nominal</th>
                    <th className="py-2 text-left font-normal">Status</th>
                    <th className="py-2 text-right font-normal">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.supplierPayables.rows ?? []).map((row) => (
                    <tr key={row.invoiceNo} className="border-b border-[#23232a]">
                      <td className="py-2 pr-2 text-white">{row.supplier}</td>
                      <td className="py-2 pr-2 font-mono text-xs text-[#b8b8bf]">{row.invoiceNo}</td>
                      <td className="py-2 pr-2 font-mono text-xs text-[#b8b8bf]">{row.dueDate}</td>
                      <td className="py-2 pr-2 text-right font-mono text-xs text-[#ffd79a]">
                        {currency.format(row.amount)}
                      </td>
                      <td className="py-2">
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
                      </td>
                      <td className="py-2 text-right">
                        {row.id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-[#22c55e]/45 text-[#dcfce7]"
                            disabled={financeAction === `pay:${row.id}` || row.status === "Paid"}
                            onClick={() => void paySupplierInvoice(row.id as string)}
                          >
                            {financeAction === `pay:${row.id}` ? "..." : "Mark paid"}
                          </Button>
                        ) : (
                          <span className="font-mono text-[10px] text-[#666]">Seed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      <Card className="garage-panel garage-animate-in">
        <CardHeader>
          <CardTitle>Role access & modul finance</CardTitle>
          <CardDescription>Hak akses MVP untuk sales, expense, cashflow, settlement, P&L, supplier, dan CEO panel.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                  {["Role", "Sales", "Expense", "Cashflow", "Settlement", "P&L", "Supplier", "CEO Panel"].map((head) => (
                    <th key={head} className="py-2 pr-2 text-left font-normal">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(overview?.roleAccess ?? []).map((row) => (
                  <tr key={row.role} className="border-b border-[#23232a]">
                    <td className="py-2 pr-2 font-semibold text-white">{row.role}</td>
                    {[row.sales, row.expense, row.cashflow, row.settlement, row.pnl, row.supplier, row.ceoPanel].map((value, index) => (
                      <td key={`${row.role}-${index}`} className="py-2 pr-2 text-xs text-[#d6d6dc]">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent transactions + Fee liability */}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Transaksi terbaru</CardTitle>
            <CardDescription>15 order paid terakhir.</CardDescription>
          </CardHeader>
          <CardContent>
            <FinanceRecentOrders rows={overview?.recentOrders ?? []} />
          </CardContent>
        </Card>

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
      </div>
        </>
      )}

      {/* Dialog: Pengeluaran (list + create form) */}
      <Dialog
        open={expenseDialogOpen}
        onOpenChange={(open) => {
          setExpenseDialogOpen(open);
        }}
      >
        <DialogContent className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pengeluaran</DialogTitle>
            <DialogDescription>
              Catat & pantau pengeluaran operasional outlet. Pengeluaran ≥ Rp
              1.000.000 otomatis butuh approval manager.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={expenseFilterCategory}
              onValueChange={(v) => {
                setExpenseFilterCategory(v);
              }}
            >
              <SelectTrigger className="h-10 w-44 border-[#34343c] bg-white/[0.06]">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kategori</SelectItem>
                <SelectItem value="COGS">COGS</SelectItem>
                <SelectItem value="Operasional">Operasional</SelectItem>
                <SelectItem value="Payroll">Payroll</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Kasbon">Kasbon</SelectItem>
                <SelectItem value="Beli Air">Beli Air</SelectItem>
                <SelectItem value="Beli Tisu">Beli Tisu</SelectItem>
                <SelectItem value="Transport">Transport</SelectItem>
                <SelectItem value="Konsumsi Staff">Konsumsi Staff</SelectItem>
                <SelectItem value="Lain-lain">Lain-lain</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={expenseFilterStatus}
              onValueChange={(v) => {
                setExpenseFilterStatus(v);
              }}
            >
              <SelectTrigger className="h-10 w-44 border-[#34343c] bg-white/[0.06]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="recorded">Recorded</SelectItem>
                <SelectItem value="pending_approval">Pending approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54] bg-white/[0.055] px-3 text-xs"
              onClick={() => void loadExpenseList()}
              disabled={expenseListLoading}
            >
              <RefreshCw
                className={`mr-2 size-3.5 ${expenseListLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              type="button"
              className="garage-press ml-auto h-10"
              onClick={openExpenseForm}
            >
              <Plus className="mr-2 size-4" />
              Tambah
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-[#34343c] bg-black/15 p-3">
              <p className="garage-mono text-[10px] text-[#8f8f99]">Total tampil</p>
              <p className="mt-1 text-lg font-black text-white">
                {currency.format(expenseVisibleTotal)}
              </p>
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                {expenseList.length} entry sesuai filter
              </p>
            </div>
            <div className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3">
              <p className="garage-mono text-[10px] text-[#ffd08a]">Pending approval</p>
              <p className="mt-1 text-lg font-black text-[#ffd08a]">
                {currency.format(expensePendingTotal)}
              </p>
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                {expensePendingRows.length} butuh keputusan
              </p>
            </div>
            <div className="rounded-md border border-[#d4d4d8]/25 bg-white/[0.04] p-3">
              <p className="garage-mono text-[10px] text-[#8f8f99]">Cash impact</p>
              <p className="mt-1 text-lg font-black text-white">
                {currency.format(expenseCashTotal)}
              </p>
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                Mengurangi expected cash saat valid
              </p>
            </div>
          </div>

          <div className="garage-scroll min-h-[200px] flex-1 overflow-auto rounded-md border border-[#34343c] bg-black/10">
            {expenseListLoading && expenseList.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#8f8f99]">
                Memuat daftar pengeluaran...
              </p>
            ) : expenseList.length === 0 ? (
              <GarageEmpty
                icon={Wallet}
                title="Belum ada pengeluaran"
                description="Catat pengeluaran kategori ini untuk muncul di sini."
                compact
              />
            ) : (
              <Table className="min-w-[680px]">
                <TableHeader className="sticky top-0 z-10 bg-[#1b1b21]">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseList.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-[11px] text-[#b8b8bf]">
                        {new Date(row.expenseDate).toLocaleString("id-ID", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell className="text-zinc-200">
                        {row.category}
                      </TableCell>
                      <TableCell className="max-w-[280px] whitespace-normal text-sm leading-5 text-white">
                        {row.description}
                        {row.notes ? (
                          <span className="mt-0.5 block text-[10px] text-[#8f8f99]">
                            {row.notes}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-white">
                        {currency.format(row.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            row.status === "pending_approval"
                              ? "border-[#f5a742]/55 bg-[#f5a742]/14 px-2 text-[10px] text-[#ffd08a]"
                              : row.status === "rejected"
                                ? "border-[#d11a2a]/45 bg-[#d11a2a]/12 px-2 text-[10px] text-[#ffc2c8]"
                              : "border-[#22c55e]/45 bg-[#22c55e]/14 px-2 text-[10px] text-[#dcfce7]"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status === "pending_approval" ? (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              className="garage-press h-8 px-2 text-[11px]"
                              disabled={expenseDecisionId === row.id}
                              onClick={() => void decideExpense(row.id, "approve")}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="garage-press h-8 border-[#d11a2a]/45 bg-[#d11a2a]/10 px-2 text-[11px] text-[#ffc2c8]"
                              disabled={expenseDecisionId === row.id}
                              onClick={() => void decideExpense(row.id, "reject")}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#8f8f99]">
                            {row.approvedAt ? "signed" : "-"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-[#b8b8bf]">
              Total tampil:{" "}
              <span className="garage-mono text-[#ffd08a]">
                {currency.format(
                  expenseList.reduce((sum, row) => sum + row.amount, 0),
                )}
              </span>{" "}
              ({expenseList.length} entry)
            </p>
            <Button
              type="button"
              className="garage-press h-10"
              onClick={() => setExpenseDialogOpen(false)}
            >
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Margin Menu (recipe cost vs sale price) */}
      <Dialog open={marginDialogOpen} onOpenChange={setMarginDialogOpen}>
        <DialogContent className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Margin Menu</DialogTitle>
            <DialogDescription>
              Recipe cost vs sale price per varian. Diurutkan dari margin
              terkecil (rugi/tipis di atas) supaya cepat spot item yang perlu
              kenaikan harga atau pengganti bahan.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[#b8b8bf]">
              {marginRows.length} varian · margin avg{" "}
              <span className="garage-mono text-[#ffd08a]">
                {marginRows.length
                  ? Math.round(
                      marginRows.reduce((sum, r) => sum + r.marginPct, 0) /
                        marginRows.length,
                    )
                  : 0}
                %
              </span>
            </p>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-9 border-[#4a4a54] bg-white/[0.055] px-3 text-xs"
              onClick={() => void loadMarginReport()}
              disabled={marginLoading}
            >
              <RefreshCw
                className={`mr-2 size-3.5 ${marginLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          <div className="garage-scroll min-h-0 flex-1 overflow-auto rounded-md border border-[#34343c] bg-black/10">
            {marginLoading && marginRows.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#8f8f99]">
                Menghitung margin...
              </p>
            ) : marginRows.length === 0 ? (
              <GarageEmpty
                icon={ChefHat}
                title="Belum ada recipe"
                description="Tambah recipe (BOM) di menu engineering supaya margin per item bisa dihitung."
                compact
              />
            ) : (
              <Table className="min-w-[680px]">
                <TableHeader className="sticky top-0 z-10 bg-[#1b1b21]">
                  <TableRow>
                    <TableHead>Menu / Varian</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marginRows.map((row) => {
                    const isNegative = row.margin < 0;
                    const isTight = row.marginPct >= 0 && row.marginPct < 30;
                    const colorClass = isNegative
                      ? "text-[#ffc2c8]"
                      : isTight
                        ? "text-[#ffd08a]"
                        : "text-[#86efac]";
                    return (
                      <TableRow key={`${row.menuItemId}-${row.variantId}`}>
                        <TableCell className="min-w-[220px]">
                          <p className="text-sm font-medium text-white">
                            {row.menuName}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {row.variantLabel} · {row.category} ·{" "}
                            {row.ingredients} bahan
                          </p>
                        </TableCell>
                        <TableCell className="text-right text-zinc-200">
                          {currency.format(row.price)}
                        </TableCell>
                        <TableCell className="text-right text-zinc-300">
                          {currency.format(row.recipeCost)}
                        </TableCell>
                        <TableCell
                          className={`garage-mono text-right font-semibold ${colorClass}`}
                        >
                          {currency.format(row.margin)}
                        </TableCell>
                        <TableCell
                          className={`garage-mono text-right text-sm font-extrabold ${colorClass}`}
                        >
                          {row.marginPct}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              className="garage-press h-10"
              onClick={() => setMarginDialogOpen(false)}
            >
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Form Tambah Pengeluaran */}
      <Dialog
        open={expenseFormOpen}
        onOpenChange={(open) => {
          setExpenseFormOpen(open);
          if (!open) setExpenseFormError(null);
        }}
      >
        <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Pengeluaran</DialogTitle>
            <DialogDescription>
              Pengeluaran ≥ Rp 1.000.000 otomatis masuk antrian approval.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitExpenseForm();
            }}
          >
            <div>
              <p className="garage-mono mb-1.5 text-[10px] text-[#b8b8bf]">
                Kategori
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    "COGS",
                    "Operasional",
                    "Payroll",
                    "Marketing",
                    "Kasbon",
                    "Lain-lain",
                  ] as const
                ).map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    variant="outline"
                    className={`garage-press h-9 px-2 text-[11px] ${
                      expenseFormCategory === cat
                        ? "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd08a]"
                        : "border-[#4a4a54] bg-white/[0.055]"
                    }`}
                    onClick={() => setExpenseFormCategory(cat)}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                Deskripsi (wajib)
              </p>
              <Input
                value={expenseFormDescription}
                onChange={(event) =>
                  setExpenseFormDescription(event.target.value.slice(0, 180))
                }
                placeholder="mis. Beli galon Aqua, bayar listrik, gaji barista"
                className="h-11 border-[#34343c] bg-white/[0.06]"
                maxLength={180}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                  Nominal (Rp)
                </p>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={expenseFormAmount}
                  onChange={(event) => setExpenseFormAmount(event.target.value)}
                  placeholder="50000"
                  className="h-11 border-[#34343c] bg-white/[0.06]"
                />
              </div>
              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                  Metode bayar
                </p>
                <Select
                  value={expenseFormPaymentMethod}
                  onValueChange={setExpenseFormPaymentMethod}
                >
                  <SelectTrigger className="h-11 border-[#34343c] bg-white/[0.06]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="QRIS">QRIS</SelectItem>
                    <SelectItem value="Transfer">Transfer Bank</SelectItem>
                    <SelectItem value="E-Wallet">E-Wallet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                Catatan (opsional)
              </p>
              <Input
                value={expenseFormNote}
                onChange={(event) =>
                  setExpenseFormNote(event.target.value.slice(0, 200))
                }
                placeholder="Detail tambahan untuk audit"
                className="h-11 border-[#34343c] bg-white/[0.06]"
                maxLength={200}
              />
            </div>
            {Number(expenseFormAmount) >= 1_000_000 ? (
              <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Butuh approval</AlertTitle>
                <AlertDescription>
                  Nominal ≥ Rp 1.000.000 akan masuk antrian approval manager.
                </AlertDescription>
              </Alert>
            ) : null}
            {expenseFormError ? (
              <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Pengeluaran</AlertTitle>
                <AlertDescription>{expenseFormError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
                onClick={() => setExpenseFormOpen(false)}
                disabled={expenseFormSaving}
              >
                Batal
              </Button>
              <Button
                type="submit"
                className="garage-press h-10"
                disabled={expenseFormSaving}
              >
                {expenseFormSaving ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 size-4" />
                    Simpan
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
