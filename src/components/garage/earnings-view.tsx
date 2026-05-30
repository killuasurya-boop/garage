"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coffee,
  RefreshCw,
  Utensils,
  Users,
  Wallet,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { garageApi } from "@/lib/api-client";
import type { Role } from "@/lib/garage-data";
import { canUseApi } from "@/lib/role-access";
import { useDateFilterContext } from "@/components/garage/date-filter";

type EarningRow = {
  id: string;
  itemKind: "food" | "drink" | "packaging" | "service" | "cashier" | "adjustment";
  event: "ticket_ready" | "ticket_delivered" | "order_paid" | "owner_adjustment";
  role: string | null;
  qty: number;
  unitFee: number;
  amount: number;
  status: "accrued" | "reversed" | "paid";
  cycleStart: string;
  cycleEnd: string;
  earnedAt: string;
  orderId: string | null;
  orderNo: string | null;
  tableLabel: string | null;
  ticketId: string | null;
  ticketNo: string | null;
  station: string | null;
};

type SummaryPayload = {
  summary: {
    cycle: { index: number; start: string; end: string; label: string };
    totalAccrued: number;
    totalReversed: number;
    totalPaid: number;
    itemCountFood: number;
    itemCountDrink: number;
    itemCountPackaging: number;
    itemCountService: number;
    itemCountCashier: number;
    pendingPayout: {
      id: string;
      status: string;
      totalAmount: number;
      cycleStart: string;
      cycleEnd: string;
    } | null;
  };
  history: EarningRow[];
};

type WalletBalance = {
  lockMonths: number;
  availableBalance: number;
  availableCount: number;
  lockedBalance: number;
  lockedCount: number;
  todayEarned: number;
  todayCount: number;
  thisWeekEarned: number;
  totalPaid: number;
  totalReversed: number;
  lockedBreakdown: Array<{
    monthKey: string;
    monthLabel: string;
    amount: number;
    count: number;
    earliestAvailableAt: string;
  }>;
  nextUnlockAt: string | null;
};

type PayoutRow = {
  id: string;
  staffUserId: string;
  staffName: string;
  staffEmail: string;
  staffRole: string | null;
  cycleStart: string;
  cycleEnd: string;
  itemCountFood: number;
  itemCountDrink: number;
  itemCountPackaging: number;
  itemCountService: number;
  itemCountCashier: number;
  totalAmount: number;
  status: "pending" | "approved" | "paid" | "cancelled";
  note: string | null;
  paymentRef: string | null;
  approvedAt: string | null;
  paidAt: string | null;
};

type StaffBalanceRow = {
  staffUserId: string;
  name: string;
  email: string;
  role: string;
  currentCycleAccrued: number;
  currentCycleItemCount: number;
  availableBalance: number;
  lockedBalance: number;
  totalPaid: number;
  activePayoutId: string | null;
  activePayoutStatus: string | null;
  activePayoutAmount: number;
};

type AutoPayoutResult = {
  createdCount: number;
  skippedActive: number;
  skippedLocked: number;
  payouts: Array<{
    id: string;
    staffUserId: string;
    staffName: string;
    totalAmount: number;
  }>;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function fmtDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function fmtDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    accrued: {
      label: "Terkumpul",
      cls: "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd79a]",
    },
    reversed: {
      label: "Dibatalkan",
      cls: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]",
    },
    paid: {
      label: "Dicairkan",
      cls: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
    },
    pending: {
      label: "Menunggu approve",
      cls: "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd79a]",
    },
    approved: {
      label: "Approved, siap cair",
      cls: "border-[#3b82f6]/45 bg-[#3b82f6]/14 text-[#bfdbfe]",
    },
    cancelled: {
      label: "Dibatalkan",
      cls: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]",
    },
  };
  const item = map[status] ?? {
    label: status,
    cls: "border-[#34343c] bg-white/[0.04] text-[#b8b8bf]",
  };
  return (
    <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] ${item.cls}`}>
      {item.label}
    </span>
  );
}

function kindBadge(kind: string) {
  const map: Record<string, { label: string; cls: string }> = {
    food: { label: "Makanan", cls: "text-[#ffd79a]" },
    drink: { label: "Minuman", cls: "text-[#bae6fd]" },
    packaging: { label: "Packing", cls: "text-[#e5e7eb]" },
    service: { label: "Pesanan selesai", cls: "text-[#a7f3d0]" },
    cashier: { label: "Kasir approve", cls: "text-[#fde68a]" },
    adjustment: { label: "Koreksi Owner", cls: "text-[#c4b5fd]" },
  };
  const item = map[kind] ?? { label: kind, cls: "text-[#b8b8bf]" };
  return <span className={`font-mono text-[10px] uppercase ${item.cls}`}>{item.label}</span>;
}

function eventLabel(event: EarningRow["event"]) {
  if (event === "order_paid") return "Kasir approve order";
  if (event === "ticket_ready") return "KDS approve/ready";
  if (event === "ticket_delivered") return "Pesanan selesai";
  if (event === "owner_adjustment") return "Koreksi saldo Owner";
  return event;
}

const feeRules = [
  { role: "Kasir", trigger: "Approve / paid order", fee: 200 },
  { role: "Dapur Pool", trigger: "Ready makanan: Koki 200 + Asisten 200", fee: 400 },
  { role: "Barista", trigger: "Approve / ready minuman", fee: 200 },
  { role: "Waiter", trigger: "Pesanan selesai / delivered", fee: 100 },
];

function parseRupiahInput(value: string) {
  const normalized = value.replace(/[^\d-]/g, "");
  const amount = Number(normalized);
  if (!Number.isInteger(amount)) return null;
  return amount;
}

export function EarningsView({ role }: { role: Role }) {
  const { predicate: dateFilterPredicate } = useDateFilterContext();
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [staffBalances, setStaffBalances] = useState<StaffBalanceRow[]>([]);
  const [autoPayout, setAutoPayout] = useState<AutoPayoutResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [adjustAmounts, setAdjustAmounts] = useState<Record<string, string>>({});
  const canManage = canUseApi(role, "earnings:manage");
  const canOwnerAdjust = role === "Owner / CEO";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, walletData] = await Promise.all([
        garageApi.get<SummaryPayload>("/api/earnings/summary"),
        garageApi.get<WalletBalance>("/api/earnings/wallet"),
      ]);
      setData(summary);
      setWallet(walletData);
      if (canManage) {
        const list = await garageApi.get<{
          payouts: PayoutRow[];
          staffBalances: StaffBalanceRow[];
          autoPayout: AutoPayoutResult;
        }>("/api/earnings/payouts");
        setPayouts(list.payouts);
        setStaffBalances(list.staffBalances);
        setAutoPayout(list.autoPayout);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data earning.");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  async function approvePayout(id: string) {
    setActionPending(id + ":approve");
    try {
      await garageApi.post(`/api/earnings/payouts/${id}/approve`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal approve payout.");
    } finally {
      setActionPending(null);
    }
  }

  async function createPayout(staffUserId: string) {
    setActionPending(staffUserId + ":close");
    try {
      await garageApi.post("/api/earnings/payouts", { staffUserId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat payout.");
    } finally {
      setActionPending(null);
    }
  }

  async function adjustStaffBalance(staff: StaffBalanceRow, mode: "add" | "subtract") {
    const rawAmount = adjustAmounts[staff.staffUserId] ?? "";
    const amount = parseRupiahInput(rawAmount);
    if (!amount || amount <= 0 || amount > 50_000_000) {
      setError("Nominal koreksi harus 1 sampai 50.000.000. Format Rp 100.000 boleh.");
      return;
    }

    const defaultNote = mode === "add" ? "Owner tambah saldo" : "Owner kurangi saldo";

    setActionPending(staff.staffUserId + ":adjust:" + mode);
    setNotice(null);
    try {
      await garageApi.post("/api/earnings/adjust", {
        staffUserId: staff.staffUserId,
        amount: mode === "add" ? amount : -amount,
        note: defaultNote,
      });
      setAdjustAmounts((current) => ({ ...current, [staff.staffUserId]: "" }));
      await load();
      setNotice(
        `${mode === "add" ? "Tambah" : "Kurangi"} saldo ${staff.name} berhasil: ${rupiah.format(amount)}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal koreksi saldo staff.");
    } finally {
      setActionPending(null);
    }
  }

  async function payPayout(id: string) {
    const paymentRef = window.prompt("Reference transfer/cash (opsional):") ?? undefined;
    setActionPending(id + ":pay");
    try {
      await garageApi.post(`/api/earnings/payouts/${id}/pay`, {
        paymentRef: paymentRef?.trim() || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mark paid.");
    } finally {
      setActionPending(null);
    }
  }

  async function cancelPayout(id: string) {
    const note = window.prompt("Catatan cancel payout:", "Data testing / koreksi payout") ?? undefined;
    setActionPending(id + ":cancel");
    try {
      await garageApi.post(`/api/earnings/payouts/${id}/cancel`, {
        note: note?.trim() || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal cancel payout.");
    } finally {
      setActionPending(null);
    }
  }

  const totalNet = useMemo(() => {
    if (!data) return 0;
    return data.summary.totalAccrued;
  }, [data]);

  const kitchenPool = useMemo(() => {
    const kitchenRoles = new Set(["Koki", "Asisten Koki"]);
    const rows = staffBalances.filter((staff) => kitchenRoles.has(staff.role));
    const currentCycleAccrued = rows.reduce(
      (total, staff) => total + staff.currentCycleAccrued,
      0,
    );
    const availableBalance = rows.reduce((total, staff) => total + staff.availableBalance, 0);
    const lockedBalance = rows.reduce((total, staff) => total + staff.lockedBalance, 0);
    return {
      staffCount: rows.length,
      itemCount: Math.floor(currentCycleAccrued / 400),
      currentCycleAccrued,
      availableBalance,
      lockedBalance,
    };
  }, [staffBalances]);

  return (
    <section className="space-y-4 px-2 sm:px-3 lg:px-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 rounded-lg border border-[#34343c] bg-[#111116]/96 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
            Fee Karyawan
          </p>
          <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">Saldo &amp; Payout</h1>
          <p className="mt-1 text-xs text-[#b8b8bf]">
            Kasir Rp 200/item · Makanan ready Rp 400/item dibagi rata: Koki Rp 200 +
            Asisten Koki Rp 200 · Barista Rp 200/item · Waiter pesanan selesai Rp 100/item.
            Saldo hanya bisa ditarik setelah 5 bulan kerja.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          className="garage-press h-10 border-[#4a4a54] text-white"
        >
          <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertTitle>Earning</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert className="border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]">
          <CheckCircle2 className="size-4" />
          <AlertTitle>Koreksi saldo</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {/* KANTONG KARYAWAN — saldo wallet dengan lock 5 bulan */}
      {wallet && <KantongKaryawanCard wallet={wallet} />}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {feeRules.map((rule) => (
              <div
                key={rule.role}
                className="rounded-lg border border-[#34343c] bg-[#17171c] p-4"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
                  {rule.role}
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {rupiah.format(rule.fee)}
                </p>
                <p className="mt-1 text-xs text-[#b8b8bf]">{rule.trigger}</p>
              </div>
            ))}
          </div>

          {/* Cycle summary */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-[#f5a742]/45 bg-[#f5a742]/10 p-4">
              <div className="flex items-center gap-2">
                <Wallet className="size-4 text-[#f5a742]" />
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#ffd79a]">
                  Saldo cycle aktif
                </p>
              </div>
              <p className="mt-2 text-2xl font-black text-white">{rupiah.format(totalNet)}</p>
              <p className="mt-1 text-xs text-[#ffd79a]">{data.summary.cycle.label}</p>
              <p className="mt-2 text-[10px] text-[#b8b8bf]">
                Cair pada {fmtDate(data.summary.cycle.end)}
              </p>
            </div>
            <div className="rounded-lg border border-[#34343c] bg-[#17171c] p-4">
              <div className="flex items-center gap-2">
                <Utensils className="size-4 text-[#f5a742]" />
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                  Item terselesaikan
                </p>
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                {data.summary.itemCountFood > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#ffd79a]">Makanan ready (Rp 200/penerima)</span>
                    <span className="font-mono font-semibold text-white">
                      {data.summary.itemCountFood}x
                    </span>
                  </div>
                )}
                {data.summary.itemCountDrink > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#bae6fd]">Minuman approve (Rp 200)</span>
                    <span className="font-mono font-semibold text-white">
                      {data.summary.itemCountDrink}x
                    </span>
                  </div>
                )}
                {data.summary.itemCountPackaging > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#e5e7eb]">Packing (Rp 200)</span>
                    <span className="font-mono font-semibold text-white">
                      {data.summary.itemCountPackaging}x
                    </span>
                  </div>
                )}
                {data.summary.itemCountService > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#a7f3d0]">Pesanan selesai (Rp 100)</span>
                    <span className="font-mono font-semibold text-white">
                      {data.summary.itemCountService}x
                    </span>
                  </div>
                )}
                {data.summary.itemCountCashier > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#fde68a]">Kasir approve (Rp 200)</span>
                    <span className="font-mono font-semibold text-white">
                      {data.summary.itemCountCashier}x
                    </span>
                  </div>
                )}
                {data.summary.itemCountFood === 0 &&
                  data.summary.itemCountDrink === 0 &&
                  data.summary.itemCountPackaging === 0 &&
                  data.summary.itemCountService === 0 &&
                  data.summary.itemCountCashier === 0 && (
                    <p className="text-xs text-[#888]">Belum ada item terselesaikan.</p>
                  )}
              </div>
            </div>
            <div className="rounded-lg border border-[#34343c] bg-[#17171c] p-4">
              <div className="flex items-center gap-2">
                <Coffee className="size-4 text-[#22c55e]" />
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                  Total dicairkan (lifetime)
                </p>
              </div>
              <p className="mt-2 text-xl font-black text-white">
                {rupiah.format(data.summary.totalPaid)}
              </p>
              {data.summary.totalReversed > 0 && (
                <p className="mt-1 text-[10px] text-[#ffc2c8]">
                  Dibatalkan cycle ini: {rupiah.format(data.summary.totalReversed)}
                </p>
              )}
              {data.summary.pendingPayout && (
                <div className="mt-2 rounded-md border border-[#34343c] bg-white/[0.04] p-2">
                  <p className="text-[10px] text-[#b8b8bf]">Payout aktif</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">
                    {rupiah.format(data.summary.pendingPayout.totalAmount)}
                  </p>
                  <div className="mt-1">{statusBadge(data.summary.pendingPayout.status)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Payout management (finance/admin) */}
          {canManage && (
            <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                    Saldo Staff
                  </p>
                  <h2 className="mt-1 text-base font-bold text-white">
                    {staffBalances.length} karyawan
                  </h2>
                </div>
                <Users className="size-4 text-[#888]" />
              </div>
              {autoPayout && (
                <div className="mt-3 rounded-md border border-[#22c55e]/35 bg-[#22c55e]/10 p-3 text-xs text-[#d1fae5]">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="size-4 text-[#86efac]" />
                    Payout otomatis aktif
                  </div>
                  <p className="mt-1 text-[#b8f7d0]">
                    {autoPayout.createdCount} payout eligible otomatis masuk antrian.
                    {autoPayout.skippedLocked > 0
                      ? ` ${autoPayout.skippedLocked} staff masih terkunci 5 bulan.`
                      : ""}
                    {autoPayout.skippedActive > 0
                      ? ` ${autoPayout.skippedActive} staff sudah punya payout aktif.`
                      : ""}
                  </p>
                </div>
              )}
              {kitchenPool.currentCycleAccrued > 0 && (
                <div className="mt-3 grid gap-2 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 p-3 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#ffd79a]">
                      Total Budget Dapur
                    </p>
                    <p className="mt-1 text-xs text-[#d6d6dc]">
                      Makanan dihitung Rp 400/item, otomatis dibagi Koki Rp 200 +
                      Asisten Koki Rp 200.
                    </p>
                  </div>
                  <div className="rounded-md border border-[#34343c] bg-black/20 p-2 text-right">
                    <p className="font-mono text-[10px] uppercase text-[#8f8f99]">Cycle</p>
                    <p className="font-mono text-lg font-black text-[#ffd79a]">
                      {rupiah.format(kitchenPool.currentCycleAccrued)}
                    </p>
                    <p className="font-mono text-[10px] text-[#b8b8bf]">
                      {kitchenPool.itemCount} item x Rp 400
                    </p>
                  </div>
                  <div className="rounded-md border border-[#34343c] bg-black/20 p-2 text-right">
                    <p className="font-mono text-[10px] uppercase text-[#8f8f99]">
                      Split penerima
                    </p>
                    <p className="font-mono text-lg font-black text-white">
                      {kitchenPool.staffCount}/2
                    </p>
                    <p className="font-mono text-[10px] text-[#b8b8bf]">
                      Koki + Asisten Koki
                    </p>
                  </div>
                </div>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                      <th className="py-2 pr-2 text-left font-normal">Staff</th>
                      <th className="py-2 pr-2 text-right font-normal">Cycle Aktif</th>
                      <th className="py-2 pr-2 text-right font-normal">Bisa Ditarik</th>
                      <th className="py-2 pr-2 text-right font-normal">Ter-Lock</th>
                      <th className="py-2 pr-2 text-left font-normal">Payout</th>
                      <th className="py-2 text-right font-normal">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffBalances.map((staff) => {
                      const canClose = staff.availableBalance > 0 && !staff.activePayoutId;
                      const waitingForLock =
                        staff.availableBalance === 0 &&
                        staff.lockedBalance > 0 &&
                        !staff.activePayoutId;
                      return (
                        <tr key={staff.staffUserId} className="border-b border-[#23232a] align-top">
                          <td className="py-2.5 pr-2">
                            <p className="font-semibold text-white">{staff.name}</p>
                            <p className="font-mono text-[10px] text-[#888]">
                              {staff.role} - {staff.email}
                            </p>
                          </td>
                          <td className="py-2.5 pr-2 text-right">
                            <p className="font-mono font-semibold text-[#ffd79a]">
                              {rupiah.format(staff.currentCycleAccrued)}
                            </p>
                            <p className="font-mono text-[10px] text-[#888]">
                              {staff.currentCycleItemCount} item
                            </p>
                          </td>
                          <td className="py-2.5 pr-2 text-right font-mono font-semibold text-[#86efac]">
                            {rupiah.format(staff.availableBalance)}
                          </td>
                          <td className="py-2.5 pr-2 text-right font-mono text-[#ffd79a]">
                            {rupiah.format(staff.lockedBalance)}
                          </td>
                          <td className="py-2.5 pr-2">
                            {staff.activePayoutStatus ? (
                              <div>
                                {statusBadge(staff.activePayoutStatus)}
                                <p className="mt-1 font-mono text-[10px] text-[#b8b8bf]">
                                  {rupiah.format(staff.activePayoutAmount)}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-[#888]">Belum ada</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {canOwnerAdjust && (
                                <>
                                  <Input
                                    inputMode="numeric"
                                    placeholder="100.000"
                                    value={adjustAmounts[staff.staffUserId] ?? ""}
                                    onChange={(event) =>
                                      setAdjustAmounts((current) => ({
                                        ...current,
                                        [staff.staffUserId]: event.target.value,
                                      }))
                                    }
                                    className="h-8 w-28 border-[#4a4a54] bg-[#0b0b0f] text-right font-mono text-xs text-white"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 border-[#4a4a54] px-0 text-white"
                                    disabled={
                                      actionPending === staff.staffUserId + ":adjust:add"
                                    }
                                    onClick={() => void adjustStaffBalance(staff, "add")}
                                    title="Tambah saldo"
                                  >
                                    {actionPending === staff.staffUserId + ":adjust:add"
                                      ? "..."
                                      : "+"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 border-[#4a4a54] px-0 text-white"
                                    disabled={
                                      actionPending === staff.staffUserId + ":adjust:subtract"
                                    }
                                    onClick={() => void adjustStaffBalance(staff, "subtract")}
                                    title="Kurangi saldo"
                                  >
                                    {actionPending === staff.staffUserId + ":adjust:subtract"
                                      ? "..."
                                      : "-"}
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant={canClose ? "default" : "outline"}
                                className="h-8"
                                disabled={!canClose || actionPending === staff.staffUserId + ":close"}
                                onClick={() => void createPayout(staff.staffUserId)}
                              >
                                {actionPending === staff.staffUserId + ":close"
                                  ? "..."
                                  : canClose
                                    ? "Sync Payout"
                                    : waitingForLock
                                      ? "Tunggu 5 bln"
                                      : "Tidak Ada"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {canManage && (
            <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                    Payout Staff (Admin/Finance)
                  </p>
                  <h2 className="mt-1 text-base font-bold text-white">
                    {payouts.length} payout
                  </h2>
                </div>
              </div>
              {payouts.length === 0 ? (
                <p className="mt-4 text-sm text-[#888]">
                  Belum ada payout. Saat cycle ditutup, payout untuk tiap karyawan akan tampil di sini.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                        <th className="py-2 pr-2 text-left font-normal">Staff</th>
                        <th className="py-2 pr-2 text-left font-normal">Cycle</th>
                        <th className="py-2 pr-2 text-left font-normal">Items</th>
                        <th className="py-2 pr-2 text-right font-normal">Total</th>
                        <th className="py-2 pr-2 text-left font-normal">Status</th>
                        <th className="py-2 text-right font-normal">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.filter((row) => dateFilterPredicate(row.cycleEnd)).map((row) => (
                        <tr key={row.id} className="border-b border-[#23232a] align-top">
                          <td className="py-2.5 pr-2">
                            <p className="font-semibold text-white">{row.staffName}</p>
                            <p className="font-mono text-[10px] text-[#888]">
                              {row.staffRole ?? "Staff"} - {row.staffEmail}
                            </p>
                          </td>
                          <td className="py-2.5 pr-2">
                            <p className="font-semibold text-white">
                              {fmtDate(row.cycleStart)} – {fmtDate(row.cycleEnd)}
                            </p>
                            <p className="font-mono text-[10px] text-[#888]">
                              ID: {row.id.slice(0, 8)}
                            </p>
                          </td>
                          <td className="py-2.5 pr-2 text-xs text-[#d6d6dc]">
                            🍴 {row.itemCountFood} · ☕ {row.itemCountDrink} · 📦{" "}
                            {row.itemCountPackaging} · 🛎 {row.itemCountService} · 💵{" "}
                            {row.itemCountCashier}
                          </td>
                          <td className="py-2.5 pr-2 text-right font-mono font-semibold text-[#ffd79a]">
                            {rupiah.format(row.totalAmount)}
                          </td>
                          <td className="py-2.5 pr-2">{statusBadge(row.status)}</td>
                          <td className="py-2.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              {row.status === "pending" && (
                                <Button
                                  size="sm"
                                  className="h-8"
                                  disabled={actionPending === row.id + ":approve"}
                                  onClick={() => void approvePayout(row.id)}
                                >
                                  {actionPending === row.id + ":approve"
                                    ? "..."
                                    : "Approve"}
                                </Button>
                              )}
                              {row.status === "approved" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-[#22c55e]/55 text-[#dcfce7]"
                                  disabled={actionPending === row.id + ":pay"}
                                  onClick={() => void payPayout(row.id)}
                                >
                                  {actionPending === row.id + ":pay" ? "..." : "Mark Paid"}
                                </Button>
                              )}
                              {(row.status === "pending" || row.status === "approved") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-[#d11a2a]/45 text-[#ffc2c8]"
                                  disabled={actionPending === row.id + ":cancel"}
                                  onClick={() => void cancelPayout(row.id)}
                                >
                                  {actionPending === row.id + ":cancel" ? "..." : "Cancel"}
                                </Button>
                              )}
                              {row.status === "paid" && (
                                <span className="inline-flex items-center gap-1 text-xs text-[#dcfce7]">
                                  <CheckCircle2 className="size-3" />
                                  {row.paidAt ? fmtDate(row.paidAt) : "Paid"}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Earning history */}
          <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                  Riwayat Fee
                </p>
                <h2 className="mt-1 text-base font-bold text-white">
                  {data.history.length} entri
                </h2>
              </div>
              <Clock className="size-4 text-[#888]" />
            </div>

            {data.history.length === 0 ? (
              <p className="mt-4 text-sm text-[#888]">
                Belum ada fee tercatat. Selesaikan order di KDS untuk mulai dapat fee.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                      <th className="py-2 pr-2 text-left font-normal">Waktu</th>
                      <th className="py-2 pr-2 text-left font-normal">Sumber</th>
                      <th className="py-2 pr-2 text-left font-normal">Jenis</th>
                      <th className="py-2 pr-2 text-center font-normal">Qty</th>
                      <th className="py-2 pr-2 text-right font-normal">Tarif</th>
                      <th className="py-2 pr-2 text-right font-normal">Fee</th>
                      <th className="py-2 text-left font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.filter((row) => dateFilterPredicate(row.earnedAt)).map((row) => (
                      <tr key={row.id} className="border-b border-[#23232a]">
                        <td className="py-2 pr-2 font-mono text-xs text-[#d6d6dc]">
                          {fmtDateTime(row.earnedAt)}
                        </td>
                        <td className="py-2 pr-2">
                          <p className="font-semibold text-white">{eventLabel(row.event)}</p>
                          <p className="font-mono text-[10px] text-[#888]">
                            {row.orderNo ?? "Manual"} {row.tableLabel ? `- ${row.tableLabel}` : ""}
                            {row.ticketNo ? ` - ${row.ticketNo}` : ""}
                          </p>
                        </td>
                        <td className="py-2 pr-2">{kindBadge(row.itemKind)}</td>
                        <td className="py-2 pr-2 text-center font-mono text-xs text-white">
                          {row.qty}x
                        </td>
                        <td className="py-2 pr-2 text-right font-mono text-xs text-[#b8b8bf]">
                          {rupiah.format(row.unitFee)}
                        </td>
                        <td
                          className={`py-2 pr-2 text-right font-mono text-xs font-semibold ${
                            row.status === "reversed"
                              ? "text-[#ffc2c8] line-through"
                              : "text-[#ffd79a]"
                          }`}
                        >
                          {rupiah.format(row.amount)}
                        </td>
                        <td className="py-2">{statusBadge(row.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : loading ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-[#444] py-12 text-sm text-[#888]">
          <RefreshCw className="mr-2 size-4 animate-spin" /> Memuat earning...
        </div>
      ) : null}
    </section>
  );
}

// ─── KANTONG KARYAWAN CARD ──────────────────────────────────
// Saldo wallet staff dengan lock period 5 bulan.
// Available = bisa ditarik · Locked = tunggu unlock per due-month.
function KantongKaryawanCard({ wallet }: { wallet: WalletBalance }) {
  // Snapshot `now` ke state — di-refresh tiap 10 menit. Hindari Date.now()
  // langsung di render body (lint react-hooks/purity).
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const hasAvailable = wallet.availableBalance > 0;
  const hasLocked = wallet.lockedBalance > 0;
  const nextUnlock = wallet.nextUnlockAt ? new Date(wallet.nextUnlockAt) : null;
  const daysUntilNext = nextUnlock
    ? Math.max(0, Math.ceil((nextUnlock.getTime() - nowMs) / (24 * 60 * 60 * 1000)))
    : null;

  return (
    <div className="rounded-lg border border-[#f5a742]/55 bg-gradient-to-br from-[#f5a742]/10 to-transparent p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="size-5 text-[#f5a742]" />
          <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#ffd79a]">
            Kantong Karyawan
          </p>
        </div>
        <span className="rounded-md border border-[#34343c] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-[#b8b8bf]">
          Lock {wallet.lockMonths} bulan per earning
        </span>
      </div>

      {/* Saldo grid: Available vs Locked */}
      <div className="grid gap-2 sm:grid-cols-2">
        {/* Available */}
        <div
          className={`rounded-md border p-4 ${
            hasAvailable
              ? "border-[#22c55e]/55 bg-[#22c55e]/10"
              : "border-[#34343c] bg-[#17171c]"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <CheckCircle2
              className={`size-3.5 ${hasAvailable ? "text-[#86efac]" : "text-[#8f8f99]"}`}
            />
            <p className="font-mono text-[10px] uppercase tracking-wide text-[#b8b8bf]">
              Bisa Ditarik
            </p>
          </div>
          <p
            className={`garage-display mt-1 text-2xl font-bold ${
              hasAvailable ? "text-[#86efac]" : "text-[#8f8f99]"
            }`}
          >
            {rupiah.format(wallet.availableBalance)}
          </p>
          <p className="mt-0.5 text-[10px] text-[#8f8f99]">
            {wallet.availableCount} earning sudah lewat lock period
          </p>
          {hasAvailable && (
            <p className="mt-2 text-[10px] text-[#86efac]/80">
              Payout otomatis masuk antrian Finance
            </p>
          )}
        </div>

        {/* Locked */}
        <div
          className={`rounded-md border p-4 ${
            hasLocked
              ? "border-[#f5a742]/55 bg-[#f5a742]/10"
              : "border-[#34343c] bg-[#17171c]"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Clock
              className={`size-3.5 ${hasLocked ? "text-[#ffd79a]" : "text-[#8f8f99]"}`}
            />
            <p className="font-mono text-[10px] uppercase tracking-wide text-[#b8b8bf]">
              Ter-Lock
            </p>
          </div>
          <p
            className={`garage-display mt-1 text-2xl font-bold ${
              hasLocked ? "text-[#ffd79a]" : "text-[#8f8f99]"
            }`}
          >
            {rupiah.format(wallet.lockedBalance)}
          </p>
          <p className="mt-0.5 text-[10px] text-[#8f8f99]">
            {wallet.lockedCount} earning · masih dalam masa {wallet.lockMonths} bulan
          </p>
          {nextUnlock && (
            <p className="mt-2 text-[10px] text-[#ffd79a]/80">
              Unlock berikutnya: {fmtDate(nextUnlock.toISOString())}
              {daysUntilNext !== null && daysUntilNext > 0 && (
                <span className="ml-1 text-[#8f8f99]">({daysUntilNext} hari lagi)</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Today + Week stats */}
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
            Earn Hari Ini
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-white">
            {rupiah.format(wallet.todayEarned)}
          </p>
          <p className="text-[10px] text-[#8f8f99]">{wallet.todayCount} event</p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
            Earn Minggu Ini
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-white">
            {rupiah.format(wallet.thisWeekEarned)}
          </p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
            Total Sudah Cair
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-[#86efac]">
            {rupiah.format(wallet.totalPaid)}
          </p>
        </div>
      </div>

      {/* Locked breakdown by month */}
      {wallet.lockedBreakdown.length > 0 && (
        <div className="mt-3 rounded-md border border-[#34343c] bg-[#17171c] p-3">
          <p className="garage-mono mb-2 text-[10px] uppercase tracking-wide text-[#ffd79a]">
            Schedule Unlock per Bulan
          </p>
          <ul className="space-y-1.5">
            {wallet.lockedBreakdown.slice(0, 6).map((group) => {
              const groupDate = new Date(group.earliestAvailableAt);
              const daysToUnlock = Math.max(
                0,
                Math.ceil(
                  (groupDate.getTime() - nowMs) / (24 * 60 * 60 * 1000),
                ),
              );
              return (
                <li
                  key={group.monthKey}
                  className="flex items-center justify-between gap-2 rounded-md border border-[#23232a] bg-black/20 px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">
                      Unlock {group.monthLabel}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                      {group.count} earning · {fmtDate(group.earliestAvailableAt)}
                      {daysToUnlock > 0 && ` · ${daysToUnlock} hari lagi`}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-bold text-[#ffd79a]">
                    {rupiah.format(group.amount)}
                  </p>
                </li>
              );
            })}
            {wallet.lockedBreakdown.length > 6 && (
              <li className="text-center text-[10px] text-[#8f8f99]">
                +{wallet.lockedBreakdown.length - 6} bulan lagi
              </li>
            )}
          </ul>
        </div>
      )}

      <p className="mt-3 text-center text-[10px] text-[#8f8f99]">
        💡 Saldo terkumpul dari setiap event operasional · cair otomatis setelah lewat 5 bulan
      </p>
    </div>
  );
}
