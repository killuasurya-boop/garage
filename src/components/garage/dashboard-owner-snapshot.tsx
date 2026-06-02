"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChefHat,
  Clock,
  DollarSign,
  Package,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { GarageConnectedNav } from "@/components/garage/garage-connected-nav";
import { AttendanceTodayWidget } from "@/components/garage/attendance-today-widget";
import type { ModuleId, Role } from "@/lib/garage-data";

// ─── Aggregate snapshot — reuse semua endpoint existing, no new API ───

type FinanceOverview = {
  today: {
    revenue: number;
    expense: number;
    grossProfit: number;
    netProfit: number;
    averageOrderValue: number;
    orderCount: number;
    cashCollected: number;
    nonCashCollected: number;
  };
  financeGuard?: {
    healthScore: number;
    level: string;
    brief: string;
  };
  paymentSettlement?: Array<{ status: string }>;
  recentOrders: Array<{
    id: string;
    orderNo: string;
    channel: string;
    total: number;
    tableLabel: string;
    paymentMethod: string;
    createdAt: string;
  }>;
};

type ApprovalStats = {
  pending: number;
  pendingHighRisk: number;
  decidedToday: number;
  avgDecideMinutes: number;
};

type AuditStats = {
  eventsToday: number;
  criticalToday: number;
  warningsToday: number;
};

type InventoryItem = {
  id?: string;
  sku?: string;
  name: string;
  onHand: number;
  min: number;
  status: string;
  unit?: string;
};

type OrderRow = {
  id: string;
  orderNo: string;
  total: number;
  status: string;
  channel: string;
  createdAt?: string;
};

type SnapshotData = {
  finance: FinanceOverview | null;
  financeGuard: { healthScore: number; level: string; brief: string } | null;
  pendingSettlements: number;
  approvals: ApprovalStats | null;
  audit: AuditStats | null;
  inventory: InventoryItem[];
  orders: OrderRow[];
  pendingCustomerOrders: number;
  loading: boolean;
  error: string | null;
};

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const compactCurrency = (value: number) => {
  if (value >= 1_000_000) return `Rp${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `Rp${Math.round(value / 1_000)}K`;
  return currency.format(value);
};

const time = new Intl.DateTimeFormat("id-ID", { timeStyle: "short" });

export function DashboardOwnerSnapshot({
  role,
  onNavigateModule,
}: {
  role?: Role;
  onNavigateModule?: (module: ModuleId) => void;
} = {}) {
  const [data, setData] = useState<SnapshotData>({
    finance: null,
    financeGuard: null,
    pendingSettlements: 0,
    approvals: null,
    audit: null,
    inventory: [],
    orders: [],
    pendingCustomerOrders: 0,
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    try {
      const [financeRes, guardRes, approvalsRes, auditRes, inventoryRes, ordersRes] =
        await Promise.allSettled([
          fetch("/api/finance/overview"),
          fetch("/api/finance/guard"),
          fetch("/api/approvals/stats"),
          fetch("/api/audit/stats"),
          fetch("/api/inventory"),
          fetch("/api/orders"),
        ]);

      const parse = async <T,>(
        result: PromiseSettledResult<Response>,
      ): Promise<T | null> => {
        if (result.status !== "fulfilled" || !result.value.ok) return null;
        try {
          const json = (await result.value.json()) as { data?: T };
          return json.data ?? null;
        } catch {
          return null;
        }
      };

      const finance = await parse<FinanceOverview>(financeRes);
      const guardPayload = await parse<{
        guard: { healthScore: number; level: string; brief: string };
        paymentSettlement: Array<{ status: string }>;
      }>(guardRes);
      const financeGuard = guardPayload?.guard ?? finance?.financeGuard ?? null;
      const pendingSettlements =
        guardPayload?.paymentSettlement?.filter(
          (row) => row.status !== "Settled" && row.status !== "Verified",
        ).length ??
        finance?.paymentSettlement?.filter(
          (row) => row.status !== "Settled" && row.status !== "Verified",
        ).length ??
        0;
      const approvals = await parse<ApprovalStats>(approvalsRes);
      const audit = await parse<AuditStats>(auditRes);
      const inventoryData =
        (await parse<InventoryItem[] | { rows: InventoryItem[] }>(inventoryRes)) ?? [];
      const inventory = Array.isArray(inventoryData)
        ? inventoryData
        : inventoryData.rows ?? [];
      const orders = (await parse<OrderRow[]>(ordersRes)) ?? [];

      const pendingCustomerOrders = orders.filter(
        (o) =>
          o.status === "pending_cashier" ||
          o.status === "awaiting_payment",
      ).length;

      setData({
        finance,
        financeGuard,
        pendingSettlements,
        approvals,
        audit,
        inventory,
        orders,
        pendingCustomerOrders,
        loading: false,
        error: null,
      });
    } catch (err) {
      setData((d) => ({
        ...d,
        loading: false,
        error: err instanceof Error ? err.message : "Gagal memuat snapshot",
      }));
    }
  }, []);

  useEffect(() => {
    void load();
    // Auto-refresh tiap 30 detik supaya snapshot tetap fresh
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  // Critical alerts dihitung di client dari hasil agregat
  const alerts = useMemo(() => {
    const list: Array<{ tone: "danger" | "warning"; text: string; href?: string }> = [];

    if (data.audit && data.audit.criticalToday > 0) {
      list.push({
        tone: "danger",
        text: `${data.audit.criticalToday} event CRITICAL di audit log hari ini`,
        href: "#",
      });
    }
    if (data.approvals && data.approvals.pendingHighRisk > 0) {
      list.push({
        tone: "danger",
        text: `${data.approvals.pendingHighRisk} approval HIGH RISK menunggu keputusan`,
      });
    }
    if (data.audit && data.audit.warningsToday > 0) {
      list.push({
        tone: "warning",
        text: `${data.audit.warningsToday} warning di audit hari ini`,
      });
    }
    if (data.pendingCustomerOrders > 0) {
      list.push({
        tone: "warning",
        text: `${data.pendingCustomerOrders} customer order menunggu kasir`,
      });
    }
    if (data.pendingSettlements > 0) {
      list.push({
        tone: "warning",
        text: `${data.pendingSettlements} settlement non-cash belum final`,
      });
    }
    if (data.financeGuard?.level === "critical") {
      list.push({
        tone: "danger",
        text: `Finance guard kritis (score ${data.financeGuard.healthScore})`,
      });
    }

    const lowStock = data.inventory.filter(
      (i) => i.status === "low" || (i.onHand !== undefined && i.min !== undefined && i.onHand < i.min),
    );
    if (lowStock.length > 0) {
      list.push({
        tone: "warning",
        text: `${lowStock.length} item inventory stok rendah`,
      });
    }

    return list;
  }, [data]);

  // Top selling items today — derive dari recent orders (rough estimate)
  // Note: untuk akurat butuh aggregation di backend; ini quick view
  const topPaymentMethod = useMemo(() => {
    if (!data.finance) return null;
    const cash = data.finance.today.cashCollected;
    const nonCash = data.finance.today.nonCashCollected;
    if (cash + nonCash === 0) return null;
    return {
      cashPct: Math.round((cash / (cash + nonCash)) * 100),
      nonCashPct: Math.round((nonCash / (cash + nonCash)) * 100),
    };
  }, [data.finance]);

  if (data.loading && !data.finance) {
    return (
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-6 text-center text-sm text-[#8f8f99]">
        <RefreshCw className="mx-auto mb-2 size-5 animate-spin text-[#f5a742]" />
        Memuat live snapshot…
      </div>
    );
  }

  return (
    <section className="min-w-0 space-y-3">
      {role && onNavigateModule ? (
        <GarageConnectedNav
          role={role}
          preset="dashboard"
          activeModule="dashboard"
          onNavigate={onNavigateModule}
        />
      ) : null}
      <div className="rounded-lg border border-[#f5a742]/35 bg-gradient-to-br from-[#f5a742]/8 to-transparent p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
              Owner Snapshot · Live
            </p>
            <h2 className="mt-1 text-lg font-black text-white sm:text-xl">
              Kondisi Operasional GARAGE Saat Ini
            </h2>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Auto-refresh tiap 30 detik · klik kartu untuk drill-down ke modul terkait.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="garage-press h-9 border-[#4a4a54] text-white"
            onClick={() => void load()}
            disabled={data.loading}
          >
            <RefreshCw className={`size-3.5 ${data.loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Critical alerts strip */}
        {alerts.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {alerts.map((alert, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${
                  alert.tone === "danger"
                    ? "border-[#d11a2a]/45 bg-[#d11a2a]/10 text-[#ffc2c8]"
                    : "border-[#f5a742]/45 bg-[#f5a742]/10 text-[#ffd79a]"
                }`}
              >
                {alert.tone === "danger" ? (
                  <ShieldAlert className="size-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="size-3.5 shrink-0" />
                )}
                <p className="flex-1 text-xs">{alert.text}</p>
              </div>
            ))}
          </div>
        )}

        {alerts.length === 0 && !data.loading && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-1.5 text-[#86efac]">
            <ShieldCheck className="size-3.5" />
            <p className="text-xs">Semua sistem aman — tidak ada alert kritis.</p>
          </div>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SnapshotCard
          label="Revenue Hari Ini"
          value={compactCurrency(data.finance?.today.revenue ?? 0)}
          sub={`${data.finance?.today.orderCount ?? 0} order paid`}
          icon={<DollarSign className="size-4" />}
          tone={(data.finance?.today.revenue ?? 0) > 0 ? "good" : "muted"}
        />
        <SnapshotCard
          label="Finance Guard"
          value={String(data.financeGuard?.healthScore ?? data.finance?.financeGuard?.healthScore ?? "—")}
          sub={data.financeGuard?.level ?? data.finance?.financeGuard?.level ?? "—"}
          icon={<ShieldCheck className="size-4" />}
          tone={
            (data.financeGuard?.level ?? data.finance?.financeGuard?.level) === "critical"
              ? "danger"
              : (data.financeGuard?.level ?? data.finance?.financeGuard?.level) === "watch"
                ? "amber"
                : "good"
          }
        />
        <SnapshotCard
          label="Net Profit"
          value={compactCurrency(data.finance?.today.netProfit ?? 0)}
          sub={`AOV ${compactCurrency(data.finance?.today.averageOrderValue ?? 0)}`}
          icon={
            (data.finance?.today.netProfit ?? 0) >= 0 ? (
              <TrendingUp className="size-4" />
            ) : (
              <TrendingDown className="size-4" />
            )
          }
          tone={(data.finance?.today.netProfit ?? 0) >= 0 ? "good" : "danger"}
        />
        <SnapshotCard
          label="Pending Approval"
          value={String(data.approvals?.pending ?? 0)}
          sub={
            data.approvals?.pendingHighRisk
              ? `${data.approvals.pendingHighRisk} high risk`
              : data.approvals?.avgDecideMinutes
                ? `avg ${data.approvals.avgDecideMinutes}m`
                : "no high risk"
          }
          icon={<ShieldCheck className="size-4" />}
          tone={
            (data.approvals?.pendingHighRisk ?? 0) > 0
              ? "danger"
              : (data.approvals?.pending ?? 0) > 0
                ? "amber"
                : "muted"
          }
        />
        <SnapshotCard
          label="Audit Events"
          value={String(data.audit?.eventsToday ?? 0)}
          sub={`${data.audit?.criticalToday ?? 0} crit · ${data.audit?.warningsToday ?? 0} warn`}
          icon={<Activity className="size-4" />}
          tone={
            (data.audit?.criticalToday ?? 0) > 0
              ? "danger"
              : (data.audit?.warningsToday ?? 0) > 0
                ? "amber"
                : "muted"
          }
        />
      </div>

      {/* Attendance hari ini — tombol cepat ke terminal kiosk */}
      <AttendanceTodayWidget
        onOpenAdminLog={
          onNavigateModule ? () => onNavigateModule("team-management") : undefined
        }
      />

      {/* Payment breakdown + Stock alerts */}
      <div className="grid gap-2 sm:grid-cols-2">
        {topPaymentMethod && (
          <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
            <div className="flex items-center justify-between">
              <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                Payment Method Mix · Today
              </p>
              <Link
                href="/os"
                className="text-[10px] text-[#f5a742] underline hover:text-[#ffba5a]"
              >
                Detail Finance →
              </Link>
            </div>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full border border-[#34343c] bg-[#17171c]">
              <div
                className="h-full bg-[#22c55e]/70 transition-all"
                style={{ width: `${topPaymentMethod.cashPct}%` }}
                title={`Cash ${topPaymentMethod.cashPct}%`}
              />
              <div
                className="h-full bg-[#3b82f6]/70 transition-all"
                style={{ width: `${topPaymentMethod.nonCashPct}%` }}
                title={`Non-Cash ${topPaymentMethod.nonCashPct}%`}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px]">
              <span className="flex items-center gap-1 text-[#86efac]">
                <span className="size-2 rounded-full bg-[#22c55e]" />
                Cash{" "}
                <span className="font-mono font-bold">
                  {compactCurrency(data.finance?.today.cashCollected ?? 0)}
                </span>{" "}
                ({topPaymentMethod.cashPct}%)
              </span>
              <span className="flex items-center gap-1 text-[#93c5fd]">
                <span className="size-2 rounded-full bg-[#3b82f6]" />
                Non-Cash{" "}
                <span className="font-mono font-bold">
                  {compactCurrency(data.finance?.today.nonCashCollected ?? 0)}
                </span>{" "}
                ({topPaymentMethod.nonCashPct}%)
              </span>
            </div>
          </div>
        )}

        {data.inventory.length > 0 && (
          <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
            <div className="flex items-center justify-between">
              <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                <Package className="mr-1 inline-block size-3" />
                Stock Watch
              </p>
              <span className="text-[10px] text-[#8f8f99]">
                {data.inventory.filter((i) => i.status === "low").length} low ·{" "}
                {data.inventory.filter((i) => i.status === "watch").length} watch
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {data.inventory
                .filter((i) => i.status === "low" || i.status === "watch")
                .slice(0, 3)
                .map((item) => (
                  <li
                    key={item.sku ?? item.id ?? item.name}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="truncate text-[#d6d6dc]">{item.name}</span>
                    <span
                      className={`font-mono ${
                        item.status === "low" ? "text-[#ffc2c8]" : "text-[#ffd79a]"
                      }`}
                    >
                      {item.onHand} {item.unit ?? ""}
                    </span>
                  </li>
                ))}
              {data.inventory.filter((i) => i.status === "low" || i.status === "watch")
                .length === 0 && (
                <li className="text-[11px] text-[#86efac]">
                  Semua stok aman ✓
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Recent activity strip */}
      {data.finance?.recentOrders && data.finance.recentOrders.length > 0 && (
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <div className="flex items-center justify-between">
            <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
              <Clock className="mr-1 inline-block size-3" />
              Order Terbaru
            </p>
            <span className="text-[10px] text-[#8f8f99]">
              {data.finance.recentOrders.length} record
            </span>
          </div>
          <div className="garage-scroll mt-2 max-h-44 space-y-1 overflow-y-auto">
            {data.finance.recentOrders.slice(0, 6).map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-md border border-[#23232a] bg-[#17171c] px-3 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] text-white">{o.orderNo}</p>
                  <p className="font-mono text-[10px] text-[#8f8f99]">
                    {o.tableLabel} · {o.channel} · {o.paymentMethod}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-bold text-[#ffd79a]">
                    {compactCurrency(o.total)}
                  </p>
                  <p className="font-mono text-[10px] text-[#8f8f99]">
                    {time.format(new Date(o.createdAt))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick-access buttons */}
      <div className="grid gap-2 sm:grid-cols-4">
        <QuickLink
          icon={<DollarSign className="size-4" />}
          label="Finance"
          sub={data.finance ? compactCurrency(data.finance.today.revenue) : "—"}
          onClick={() => onNavigateModule?.("finance")}
        />
        <QuickLink
          icon={<ShieldCheck className="size-4" />}
          label="Approvals"
          sub={`${data.approvals?.pending ?? 0} pending`}
          onClick={() => onNavigateModule?.("approvals")}
        />
        <QuickLink
          icon={<ChefHat className="size-4" />}
          label="Kitchen"
          sub={`${data.pendingCustomerOrders} antrian`}
          onClick={() => onNavigateModule?.("kitchen")}
        />
        <QuickLink
          icon={<Activity className="size-4" />}
          label="Audit Log"
          sub={`${data.audit?.eventsToday ?? 0} hari ini`}
          onClick={() => onNavigateModule?.("audit")}
        />
      </div>
    </section>
  );
}

function SnapshotCard({
  label,
  value,
  sub,
  icon,
  tone = "muted",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "good" | "amber" | "danger" | "muted";
}) {
  const toneCls = {
    good: "border-[#22c55e]/45 bg-[#22c55e]/8",
    amber: "border-[#f5a742]/45 bg-[#f5a742]/10",
    danger: "border-[#d11a2a]/45 bg-[#d11a2a]/10",
    muted: "border-[#34343c] bg-[#17171c]",
  }[tone];
  const valueCls = {
    good: "text-[#86efac]",
    amber: "text-[#ffd79a]",
    danger: "text-[#ffc2c8]",
    muted: "text-white",
  }[tone];
  return (
    <div className={`rounded-md border p-3 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-[#b8b8bf]">
        {icon}
        <p className="garage-mono text-[10px] uppercase tracking-wide">{label}</p>
      </div>
      <p className={`mt-1 garage-display text-xl font-bold ${valueCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[#8f8f99]">{sub}</p>}
    </div>
  );
}

function QuickLink({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <div 
      onClick={onClick}
      className={`group flex items-center gap-2 rounded-md border border-[#34343c] bg-[#17171c] p-3 transition-colors ${onClick ? "cursor-pointer hover:border-[#f5a742]/45 hover:bg-[#f5a742]/8" : ""}`}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#34343c] bg-[#111116] text-[#f5a742]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-white">{label}</p>
        <p className="font-mono text-[10px] text-[#8f8f99]">{sub}</p>
      </div>
      <ArrowRight className="size-3.5 text-[#8f8f99] transition-transform group-hover:translate-x-0.5 group-hover:text-[#f5a742]" />
    </div>
  );
}
