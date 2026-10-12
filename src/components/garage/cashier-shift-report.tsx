"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  CircleDollarSign,
  Download,
  FileText,
  Loader2,
  Printer,
  Receipt,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesReport } from "@/components/garage/sales-report";
import { GarageApiError, garageApi } from "@/lib/api-client";
import type { AppSettings } from "@/lib/garage-app-settings-types";
import {
  printDailyRecap,
  printShiftSlip,
  type SlipPrintResult,
  type SlipPrintSettings,
} from "@/lib/management-slip-print";

async function loadSlipSettings(): Promise<SlipPrintSettings> {
  try {
    const data = await garageApi.get<{ settings: AppSettings }>("/api/settings");
    return {
      brand: { brandName: data.settings.brandName, brandTagline: data.settings.brandTagline },
      showSignature: data.settings.receiptShowSignature,
      copies: data.settings.managementSlipCopies,
    };
  } catch {
    return {};
  }
}

const fmtRp = (n: number) =>
  `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

const todayDateKey = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer Bank",
  card: "Kartu",
  ewallet: "E-Wallet",
};

const labelForMethod = (method: string) =>
  PAYMENT_LABELS[method.toLowerCase()] ?? method.toUpperCase();

type SessionListItem = {
  id: string;
  code: string;
  status: string;
  openingCash: number;
  expectedCash: number;
  actualCash: number | null;
  discrepancy: number;
  discrepancyStatus: string;
  businessDate: string;
  shiftNumber: number;
  shiftLabel: string;
  managerSignOffAt: string | null;
  openedAt: string;
  closedAt: string | null;
  outletCode: string | null;
};

type ListResponse = {
  rows: SessionListItem[];
  total: number;
  hasMore: boolean;
};

type SessionSummary = {
  session: SessionListItem & {
    openedByName: string | null;
    closedByName: string | null;
  };
  counts: { total: number; paid: number; refunded: number };
  sales: {
    gross: number;
    subtotal: number;
    service: number;
    tax: number;
    discount: number;
  };
  byMethod: Array<{ method: string; count: number; total: number }>;
};

type StaleOpenShift = {
  id: string;
  code: string;
  cashierName: string;
  openingCash: number;
  expectedCash: number;
  openedAt: string;
};

/** Shift yang bisa ditutup Manajer/Owner dari rekap (hari ini / tertinggal). */
type ClosableShift = {
  id: string;
  code: string;
  cashierName: string;
  openingCash: number;
  expectedCash: number;
  openedAt: string;
  shiftLabel?: string;
};

type DailyShiftReport = {
  date: string;
  staleOpen?: StaleOpenShift[];
  rows: Array<
    SessionListItem & {
      cashierName: string;
      counts: { total: number; paid: number; refunded: number };
      sales: SessionSummary["sales"];
      byMethod: SessionSummary["byMethod"];
      cashTotal: number;
      nonCashTotal: number;
      qrisTotal?: number;
      qrisCounted?: number | null;
      qrisDiscrepancy?: number | null;
      floatLeft?: number | null;
      depositAmount?: number | null;
    }
  >;
  totals: {
    shifts: number;
    orders: number;
    paidOrders: number;
    gross: number;
    cash: number;
    nonCash: number;
    expectedCash: number;
    actualCash: number;
    discrepancy: number;
  };
};

type SessionTransactions = {
  session: SessionSummary["session"];
  orders: Array<{
    id: string;
    orderNo: string;
    status: string;
    total: number;
    subtotal: number;
    service: number;
    tax: number;
    discount: number;
    tableLabel: string;
    channel: string;
    customerName: string | null;
    createdAt: string;
    payments: Array<{ method: string; amount: number; status: string }>;
  }>;
};

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "open")
    return (
      <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-600/40">
        Sesi Aktif
      </Badge>
    );
  if (s === "closed")
    return (
      <Badge className="bg-zinc-700/40 text-zinc-300 border-zinc-600/40">
        Selesai
      </Badge>
    );
  return <Badge variant="outline">{status.toUpperCase()}</Badge>;
}

function discrepancyBadge(status: string, value: number) {
  if (status === "ok")
    return (
      <Badge className="bg-emerald-600/15 text-emerald-300 border-emerald-600/40">
        Pas
      </Badge>
    );
  if (status === "warning")
    return (
      <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/40">
        {value >= 0 ? "Lebih" : "Kurang"} {fmtRp(Math.abs(value))}
      </Badge>
    );
  return (
    <Badge className="bg-rose-600/15 text-rose-300 border-rose-600/40">
      Kritis {value >= 0 ? "+" : ""}
      {fmtRp(value)}
    </Badge>
  );
}

const HIDDEN_UNTIL_CLOSE = "Tampil setelah tutup";

/**
 * `blindOpenShift`: untuk Kasir, angka kas sistem (diharapkan, nominal per
 * metode bayar) disembunyikan selama shift masih open supaya hitungan laci
 * saat tutup shift tidak dicocok-cocokkan dengan angka sistem.
 */
export function CashierShiftReport({ blindOpenShift = false }: { blindOpenShift?: boolean }) {
  const [active, setActive] = useState<SessionListItem | null>(null);
  const [history, setHistory] = useState<SessionListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dailyDate, setDailyDate] = useState(todayDateKey);
  const [dailyReport, setDailyReport] = useState<DailyShiftReport | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [approvingShiftId, setApprovingShiftId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const [activeRes, historyRes] = await Promise.all([
        garageApi.get<{ session: SessionListItem | null }>(
          "/api/finance/cash-sessions/me/active",
        ),
        garageApi.get<ListResponse>("/api/finance/cash-sessions/me?limit=50"),
      ]);
      setActive(activeRes.session);
      setHistory(historyRes.rows);
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "Gagal memuat data shift.",
      );
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void loadList();
  }, [loadList]);

  const loadDailyReport = useCallback(async () => {
    setDailyLoading(true);
    setDailyError(null);
    try {
      const report = await garageApi.get<DailyShiftReport>(
        `/api/finance/cash-sessions/daily?date=${encodeURIComponent(dailyDate)}`,
      );
      setDailyReport(report);
    } catch (error) {
      setDailyReport(null);
      if (error instanceof GarageApiError && error.status === 403) {
        return;
      }
      setDailyError(
        error instanceof Error ? error.message : "Gagal memuat rekap harian.",
      );
    } finally {
      setDailyLoading(false);
    }
  }, [dailyDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch owner daily report on mount/date change
    void loadDailyReport();
  }, [loadDailyReport]);

  const approveShift = useCallback(
    async (sessionId: string) => {
      setApprovingShiftId(sessionId);
      setDailyError(null);
      try {
        await garageApi.patch(
          `/api/finance/cash-sessions/${sessionId}/approve-discrepancy`,
          { note: "Approved from daily shift report." },
        );
        await loadDailyReport();
      } catch (error) {
        setDailyError(
          error instanceof Error ? error.message : "Approval selisih kas gagal.",
        );
      } finally {
        setApprovingShiftId(null);
      }
    },
    [loadDailyReport],
  );

  const [closingRow, setClosingRow] = useState<ClosableShift | null>(null);
  const [qrisRow, setQrisRow] = useState<DailyShiftReport["rows"][number] | null>(null);

  if (selectedId) {
    return (
      <ShiftDetailView
        sessionId={selectedId}
        blindOpenShift={blindOpenShift}
        onBack={() => {
          setSelectedId(null);
          void loadList();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#d11a2a]">
            Kasir
          </p>
          <h1 className="text-2xl font-bold text-white">Riwayat & Laporan Shift</h1>
          <p className="text-sm text-zinc-400">
            Cek total penjualan per sesi, cetak laporan PDF untuk owner.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadList()}
          disabled={loadingList}
        >
          <RefreshCw className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      {listError && (
        <Card className="border-rose-600/40 bg-rose-950/20">
          <CardContent className="p-4 text-sm text-rose-200">{listError}</CardContent>
        </Card>
      )}

      <Tabs defaultValue={active ? "active" : "history"} className="min-w-0 space-y-4">
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="active">Sesi Aktif</TabsTrigger>
          <TabsTrigger value="history">Riwayat ({history.length})</TabsTrigger>
          {dailyReport || dailyLoading || dailyError ? (
            <TabsTrigger value="daily">Rekap Harian</TabsTrigger>
          ) : null}
          <TabsTrigger value="sales">Laporan Penjualan</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-3">
          <SalesReport />
        </TabsContent>

        <TabsContent value="active" className="space-y-3">
          {loadingList && !active ? (
            <Card className="border-zinc-700 bg-zinc-900/40">
              <CardContent className="flex items-center gap-2 p-6 text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat sesi aktif…
              </CardContent>
            </Card>
          ) : !active ? (
            <Card className="border-zinc-700 bg-zinc-900/40">
              <CardContent className="p-6 text-center text-sm text-zinc-400">
                Belum ada shift terbuka. Buka shift dari layar POS.
              </CardContent>
            </Card>
          ) : (
            <SessionCard
              session={active}
              blindOpenShift={blindOpenShift}
              onOpen={() => setSelectedId(active.id)}
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {loadingList ? (
            <Card className="border-zinc-700 bg-zinc-900/40">
              <CardContent className="flex items-center gap-2 p-6 text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat riwayat…
              </CardContent>
            </Card>
          ) : history.length === 0 ? (
            <Card className="border-zinc-700 bg-zinc-900/40">
              <CardContent className="p-6 text-center text-sm text-zinc-400">
                Belum ada riwayat sesi.
              </CardContent>
            </Card>
          ) : (
            history.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                blindOpenShift={blindOpenShift}
                onOpen={() => setSelectedId(s.id)}
              />
            ))
          )}
        </TabsContent>

        {(dailyReport || dailyLoading || dailyError) && (
          <TabsContent value="daily" className="space-y-3">
            <DailyShiftReportPanel
              date={dailyDate}
              onDateChange={setDailyDate}
              report={dailyReport}
              loading={dailyLoading}
              error={dailyError}
              onRefresh={() => void loadDailyReport()}
              onOpenSession={setSelectedId}
              onApproveShift={(sessionId) => void approveShift(sessionId)}
              approvingShiftId={approvingShiftId}
              onCloseShift={setClosingRow}
              onReconcileQris={setQrisRow}
            />
          </TabsContent>
        )}
      </Tabs>
      <QrisReconcileDialog
        row={qrisRow}
        onClose={() => setQrisRow(null)}
        onSaved={() => {
          setQrisRow(null);
          void loadDailyReport();
        }}
      />
      <SupervisorCloseShiftDialog
        row={closingRow}
        onClose={() => setClosingRow(null)}
        onClosed={() => {
          setClosingRow(null);
          void loadDailyReport();
          void loadList();
        }}
      />
    </div>
  );
}

function SessionCard({
  session,
  blindOpenShift,
  onOpen,
}: {
  session: SessionListItem;
  blindOpenShift: boolean;
  onOpen: () => void;
}) {
  const hideCashFigures = blindOpenShift && session.status === "open";
  return (
    <Card
      className="cursor-pointer border-zinc-700 bg-zinc-900/40 transition-colors hover:border-[#d11a2a]/60 hover:bg-zinc-900/60"
      onClick={onOpen}
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge className="border-[#d11a2a]/45 bg-[#d11a2a]/15 text-[#ffd7dc]">
              {session.shiftLabel}
            </Badge>
            <span className="font-mono text-sm font-semibold text-white">
              {session.code}
            </span>
            {statusBadge(session.status)}
            {session.managerSignOffAt ? (
              <Badge className="border-emerald-600/40 bg-emerald-600/15 text-emerald-300">
                Approved
              </Badge>
            ) : null}
            {session.actualCash != null &&
              discrepancyBadge(session.discrepancyStatus, session.discrepancy)}
          </div>
          <p className="text-xs text-zinc-400">
            <Calendar className="mr-1 inline h-3 w-3" />
            {fmtDateTime(session.openedAt)}
            {session.closedAt ? ` → ${fmtDateTime(session.closedAt)}` : " → sekarang"}
          </p>
          <p className="text-xs text-zinc-500">
            Modal {fmtRp(session.openingCash)} · Diharapkan{" "}
            {hideCashFigures ? HIDDEN_UNTIL_CLOSE : fmtRp(session.expectedCash)}
          </p>
        </div>
        <Button size="sm" variant="outline">
          <FileText className="h-4 w-4" />
          Lihat Detail
        </Button>
      </CardContent>
    </Card>
  );
}

function ShiftDetailView({
  sessionId,
  blindOpenShift,
  onBack,
}: {
  sessionId: string;
  blindOpenShift: boolean;
  onBack: () => void;
}) {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [transactions, setTransactions] = useState<SessionTransactions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([
        garageApi.get<SessionSummary>(
          `/api/finance/cash-sessions/${sessionId}/summary`,
        ),
        garageApi.get<SessionTransactions>(
          `/api/finance/cash-sessions/${sessionId}/transactions`,
        ),
      ]);
      setSummary(s);
      setTransactions(t);
    } catch (err) {
      setError(
        err instanceof GarageApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Gagal memuat detail sesi.",
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch detail when session changes
    void load();
  }, [load]);

  const pdfUrl = useMemo(
    () => `/api/finance/cash-sessions/${sessionId}/report`,
    [sessionId],
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Button>
        <Button
          size="sm"
          className="bg-[#d11a2a] hover:bg-[#b8131f]"
          disabled={
            loading || !summary || (blindOpenShift && summary.session.status === "open")
          }
          title={
            blindOpenShift && summary?.session.status === "open"
              ? "Laporan PDF tersedia setelah shift ditutup."
              : undefined
          }
          onClick={() => window.open(pdfUrl, "_blank")}
        >
          <Download className="h-4 w-4" />
          Cetak PDF
        </Button>
      </header>

      {error && (
        <Card className="border-rose-600/40 bg-rose-950/20">
          <CardContent className="p-4 text-sm text-rose-200">{error}</CardContent>
        </Card>
      )}

      {loading || !summary ? (
        <Card className="border-zinc-700 bg-zinc-900/40">
          <CardContent className="flex items-center gap-2 p-6 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat detail sesi…
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-zinc-700 bg-zinc-900/40">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="font-mono text-base">
                  {summary.session.shiftLabel} - {summary.session.code}
                </CardTitle>
                {statusBadge(summary.session.status)}
                {summary.session.managerSignOffAt ? (
                  <Badge className="border-emerald-600/40 bg-emerald-600/15 text-emerald-300">
                    Approved Owner
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                {summary.session.openedByName ?? "Kasir"} ·{" "}
                {summary.session.outletCode ?? "—"} ·{" "}
                {fmtDateTime(summary.session.openedAt)}
                {summary.session.closedAt
                  ? ` → ${fmtDateTime(summary.session.closedAt)}`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Total Order" value={String(summary.counts.total)} />
              <Stat label="Order Lunas" value={String(summary.counts.paid)} />
              <Stat
                label="Penjualan Bruto"
                value={
                  blindOpenShift && summary.session.status === "open"
                    ? HIDDEN_UNTIL_CLOSE
                    : fmtRp(summary.sales.gross)
                }
                accent
              />
              <Stat
                label="Diskon/Promo"
                value={`- ${fmtRp(summary.sales.discount)}`}
              />
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="border-zinc-700 bg-zinc-900/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleDollarSign className="h-4 w-4 text-[#d11a2a]" />
                  Kas Fisik
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row
                  label="Modal Awal"
                  value={fmtRp(summary.session.openingCash)}
                />
                <Row
                  label="Diharapkan"
                  value={
                    blindOpenShift && summary.session.status === "open"
                      ? HIDDEN_UNTIL_CLOSE
                      : fmtRp(summary.session.expectedCash)
                  }
                />
                <Row
                  label="Aktual"
                  value={
                    summary.session.actualCash != null
                      ? fmtRp(summary.session.actualCash)
                      : "Belum dihitung"
                  }
                />
                <Row
                  label="Selisih"
                  value={
                    summary.session.actualCash != null
                      ? `${summary.session.discrepancy >= 0 ? "+" : ""}${fmtRp(
                          summary.session.discrepancy,
                        )}`
                      : "—"
                  }
                  tone={
                    summary.session.actualCash != null
                      ? summary.session.discrepancy === 0
                        ? "ok"
                        : summary.session.discrepancy < 0
                          ? "bad"
                          : "warn"
                      : "muted"
                  }
                />
              </CardContent>
            </Card>

            <Card className="border-zinc-700 bg-zinc-900/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4 text-[#d11a2a]" />
                  Metode Pembayaran
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {summary.byMethod.length === 0 ? (
                  <p className="text-zinc-500">Belum ada pembayaran.</p>
                ) : (
                  summary.byMethod.map((m) => (
                    <Row
                      key={m.method}
                      label={`${labelForMethod(m.method)} (${m.count}x)`}
                      value={
                        blindOpenShift && summary.session.status === "open"
                          ? "—"
                          : fmtRp(m.total)
                      }
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-zinc-700 bg-zinc-900/40">
            <CardHeader>
              <CardTitle className="text-base">
                Daftar Transaksi ({transactions?.orders.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!transactions || transactions.orders.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">
                  Belum ada transaksi.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-2 py-2 text-left">Waktu</th>
                        <th className="px-2 py-2 text-left">Order</th>
                        <th className="px-2 py-2 text-left">Meja</th>
                        <th className="px-2 py-2 text-left">Channel</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {transactions.orders.map((o) => (
                        <tr key={o.id} className="text-zinc-200">
                          <td className="px-2 py-2 font-mono text-xs">
                            {fmtTime(o.createdAt)}
                          </td>
                          <td className="px-2 py-2 font-mono text-xs">{o.orderNo}</td>
                          <td className="px-2 py-2">{o.tableLabel}</td>
                          <td className="px-2 py-2 text-zinc-400">{o.channel}</td>
                          <td className="px-2 py-2">
                            <Badge
                              variant="outline"
                              className={
                                o.status === "paid"
                                  ? "border-emerald-600/40 text-emerald-300"
                                  : "border-zinc-600 text-zinc-400"
                              }
                            >
                              {o.status}
                            </Badge>
                          </td>
                          <td className="px-2 py-2 text-right font-semibold">
                            {fmtRp(o.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function DailyShiftReportPanel({
  date,
  onDateChange,
  report,
  loading,
  error,
  onRefresh,
  onOpenSession,
  onApproveShift,
  approvingShiftId,
  onCloseShift,
  onReconcileQris,
}: {
  date: string;
  onDateChange: (value: string) => void;
  report: DailyShiftReport | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenSession: (sessionId: string) => void;
  onApproveShift: (sessionId: string) => void;
  approvingShiftId: string | null;
  onCloseShift: (row: ClosableShift) => void;
  onReconcileQris: (row: DailyShiftReport["rows"][number]) => void;
}) {
  const [printing, setPrinting] = useState<string | null>(null);
  const [printResult, setPrintResult] = useState<SlipPrintResult | null>(null);

  async function runPrint(key: string, action: (settings: SlipPrintSettings) => Promise<SlipPrintResult>) {
    setPrinting(key);
    setPrintResult(null);
    try {
      setPrintResult(await action(await loadSlipSettings()));
    } finally {
      setPrinting(null);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="border-zinc-700 bg-zinc-900/40">
        <CardContent className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Owner/Admin
            </p>
            <h2 className="text-lg font-bold text-white">Rekap Keuangan Harian</h2>
            <p className="text-xs text-zinc-400">
              Gabungan Shift 1, Shift 2, dan shift berikutnya pada tanggal terpilih.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
              className="h-9 w-[160px] border-zinc-700 bg-zinc-950"
            />
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-[#f5a742]/55 text-[#ffd08a] hover:bg-[#f5a742]/15"
              disabled={!report || printing !== null}
              onClick={() => {
                if (report) void runPrint("daily", (settings) => printDailyRecap(report, settings));
              }}
            >
              <Printer className="h-4 w-4" />
              {printing === "daily" ? "Mencetak..." : "Cetak rekap"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {printResult ? (
        <p
          role={printResult.ok ? "status" : "alert"}
          className={`rounded-md border px-3 py-2 text-sm ${
            printResult.ok
              ? "border-[#f5a742]/40 bg-[#f5a742]/10 text-[#ffe2b0]"
              : "border-rose-600/40 bg-rose-950/30 text-rose-200"
          }`}
        >
          {printResult.message}
        </p>
      ) : null}

      {error && (
        <Card className="border-rose-600/40 bg-rose-950/20">
          <CardContent className="p-4 text-sm text-rose-200">{error}</CardContent>
        </Card>
      )}

      {loading && !report ? (
        <Card className="border-zinc-700 bg-zinc-900/40">
          <CardContent className="flex items-center gap-2 p-6 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat rekap harian...
          </CardContent>
        </Card>
      ) : report ? (
        <>
          {report.staleOpen?.length ? (
            <Card className="border-[#f5a742]/55 bg-[#f5a742]/10">
              <CardContent className="space-y-2 p-4">
                <p className="text-sm font-semibold text-white">
                  Shift dari hari sebelumnya masih terbuka
                </p>
                <p className="text-xs leading-5 text-[#d6d6dc]">
                  Kasir lupa tutup shift → kasir berikutnya tidak bisa mulai shift. Hitung uang laci
                  lalu tutup di sini.
                </p>
                {report.staleOpen.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#f5a742]/35 bg-black/25 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-white">{row.code}</p>
                      <p className="text-xs text-[#d6d6dc]">
                        {row.cashierName} · buka {fmtDateTime(row.openedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-[#f5a742]/60 text-[#ffd08a] hover:bg-[#f5a742]/15"
                      onClick={() => onCloseShift(row)}
                    >
                      Tutup shift
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Jumlah Shift" value={String(report.totals.shifts)} />
            <Stat label="Order Lunas" value={String(report.totals.paidOrders)} />
            <Stat label="Omzet Harian" value={fmtRp(report.totals.gross)} accent />
            <Stat
              label="Selisih Kas"
              value={`${report.totals.discrepancy >= 0 ? "+" : ""}${fmtRp(
                report.totals.discrepancy,
              )}`}
            />
          </div>

          <Card className="border-zinc-700 bg-zinc-900/40">
            <CardHeader>
              <CardTitle className="text-base">Shift per Tanggal</CardTitle>
              <CardDescription>
                Klik baris untuk melihat detail transaksi dan cetak PDF shift.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {report.rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">
                  Belum ada shift pada tanggal ini.
                </p>
              ) : (
                report.rows.map((row) => (
                  <div
                    key={row.id}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-left transition hover:border-[#d11a2a]/55"
                    onClick={() => onOpenSession(row.id)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="border-[#d11a2a]/45 bg-[#d11a2a]/15 text-[#ffd7dc]">
                            {row.shiftLabel}
                          </Badge>
                          {statusBadge(row.status)}
                          {row.managerSignOffAt ? (
                            <Badge className="border-emerald-600/40 bg-emerald-600/15 text-emerald-300">
                              Approved
                            </Badge>
                          ) : null}
                          {row.actualCash != null &&
                            discrepancyBadge(row.discrepancyStatus, row.discrepancy)}
                        </div>
                        <p className="mt-2 font-mono text-sm font-semibold text-white">
                          {row.code}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {row.cashierName} - {fmtDateTime(row.openedAt)}
                          {row.closedAt ? ` -> ${fmtDateTime(row.closedAt)}` : " -> sekarang"}
                        </p>
                      </div>
                      <div className="grid min-w-[260px] grid-cols-2 gap-2 text-sm">
                        <Row label="Omzet" value={fmtRp(row.sales.gross)} />
                        <Row label="Tunai" value={fmtRp(row.cashTotal)} />
                        <Row label="Non-cash" value={fmtRp(row.nonCashTotal)} />
                        <Row
                          label="Selisih"
                          value={`${row.discrepancy >= 0 ? "+" : ""}${fmtRp(row.discrepancy)}`}
                          tone={row.discrepancy === 0 ? "ok" : row.discrepancy < 0 ? "bad" : "warn"}
                        />
                        {row.depositAmount != null ? (
                          <Row label="Disetor" value={fmtRp(row.depositAmount)} />
                        ) : null}
                        {row.floatLeft != null ? (
                          <Row label="Tinggal di laci" value={fmtRp(row.floatLeft)} />
                        ) : null}
                        {row.qrisTotal ? (
                          <Row
                            label="QRIS"
                            value={
                              row.qrisCounted == null
                                ? `${fmtRp(row.qrisTotal)} · belum dicek`
                                : row.qrisDiscrepancy === 0
                                  ? `${fmtRp(row.qrisTotal)} · cocok BNI`
                                  : `selisih ${(row.qrisDiscrepancy ?? 0) > 0 ? "+" : ""}${fmtRp(row.qrisDiscrepancy ?? 0)}`
                            }
                            tone={row.qrisCounted == null ? "warn" : row.qrisDiscrepancy === 0 ? "ok" : "bad"}
                          />
                        ) : null}
                      </div>
                      {row.status === "closed" &&
                      row.actualCash != null &&
                      row.discrepancy !== 0 &&
                      !row.managerSignOffAt ? (
                        <Button
                          type="button"
                          size="sm"
                          className="bg-[#d11a2a] hover:bg-[#b8131f]"
                          disabled={approvingShiftId === row.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            onApproveShift(row.id);
                          }}
                        >
                          {approvingShiftId === row.id ? "Approve..." : "Approve Selisih"}
                        </Button>
                      ) : null}
                      {row.status === "closed" && row.qrisTotal ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-[#4a4a54] text-[#f4f4f5] hover:bg-white/10"
                          onClick={(event) => {
                            event.stopPropagation();
                            onReconcileQris(row);
                          }}
                        >
                          {row.qrisCounted == null ? "Cocokkan QRIS" : "Ubah cek QRIS"}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-[#4a4a54] text-[#f4f4f5] hover:bg-white/10"
                        disabled={printing !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          void runPrint(`shift-${row.id}`, (settings) =>
                            printShiftSlip(row.id, settings, {
                              qrisCounted: row.qrisCounted,
                              floatLeft: row.floatLeft,
                              depositAmount: row.depositAmount,
                            }),
                          );
                        }}
                      >
                        <Printer className="h-4 w-4" />
                        {printing === `shift-${row.id}` ? "Mencetak..." : "Cetak slip"}
                      </Button>
                      {row.status === "open" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-[#f5a742]/60 text-[#ffd08a] hover:bg-[#f5a742]/15"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCloseShift(row);
                          }}
                        >
                          Tutup shift
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${accent ? "text-[#d11a2a]" : "text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad" | "warn" | "muted";
}) {
  const valueColor =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : tone === "warn"
          ? "text-amber-400"
          : tone === "muted"
            ? "text-zinc-500"
            : "text-white";
  return (
    <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1 last:border-0">
      <span className="text-zinc-400">{label}</span>
      <span className={`font-semibold ${valueColor}`}>{value}</span>
    </div>
  );
}

// Manajer/Owner menutup shift kasir yang tertinggal terbuka (kasir lupa tutup,
// pulang, atau salah buka) supaya kasir berikutnya bisa mulai shift.
function SupervisorCloseShiftDialog({
  row,
  onClose,
  onClosed,
}: {
  row: ClosableShift | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [actualCash, setActualCash] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRowId, setLastRowId] = useState<string | null>(null);

  // Reset form saat baris lain dipilih (tanpa effect).
  if (row && row.id !== lastRowId) {
    setLastRowId(row.id);
    setActualCash("");
    setNote("");
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!row) return;
    const counted = Number(actualCash);
    if (actualCash.trim() === "" || !Number.isFinite(counted) || counted < 0) {
      setError("Isi uang tunai yang dihitung di laci (angka, boleh 0).");
      return;
    }
    if (note.trim().length < 5) {
      setError("Tulis alasan singkat (min. 5 huruf), mis. kasir lupa tutup shift.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await garageApi.patch(`/api/finance/cash-sessions/${row.id}/close`, {
        actualCash: Math.round(counted),
        closingNote: `Ditutup Manajer/Owner: ${note.trim()}`,
        managerSignOff: true,
        resetTableMode: "none",
      });
      onClosed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tutup shift gagal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tutup shift kasir</DialogTitle>
          <DialogDescription>
            {row
              ? `${row.shiftLabel ? `${row.shiftLabel} · ` : ""}${row.code} · ${row.cashierName}, buka ${fmtDateTime(row.openedAt)}.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {row ? (
          <form onSubmit={(event) => void submit(event)} className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Row label="Modal awal" value={fmtRp(row.openingCash)} />
              <Row label="Kas seharusnya" value={fmtRp(row.expectedCash)} />
            </div>
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold text-[#d6d6dc]">Uang tunai dihitung di laci</span>
              <Input
                inputMode="numeric"
                value={actualCash}
                onChange={(event) => setActualCash(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
                placeholder="mis. 350000"
                className="h-11 border-[#34343c] bg-white/[0.06]"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold text-[#d6d6dc]">Alasan</span>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Kasir lupa tutup shift / salah buka shift"
                maxLength={300}
                className="h-11 border-[#34343c] bg-white/[0.06]"
              />
            </label>
            <p className="text-xs leading-5 text-[#b8b8bf]">
              Selisih dihitung otomatis dan tercatat atas nama Anda di audit. Meja tidak direset.
            </p>
            {error ? (
              <p className="text-sm text-[#ffb3b3]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={onClose}>
                Batal
              </Button>
              <Button type="submit" className="h-11 flex-1 bg-[#d11a2a] hover:bg-[#b8131f]" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Tutup shift
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// Owner/Manajer mencocokkan total QRIS shift dengan mutasi / aplikasi BNI.
function QrisReconcileDialog({
  row,
  onClose,
  onSaved,
}: {
  row: DailyShiftReport["rows"][number] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRowId, setLastRowId] = useState<string | null>(null);

  if (row && row.id !== lastRowId) {
    setLastRowId(row.id);
    setCounted(row.qrisCounted != null ? String(row.qrisCounted) : "");
    setNote("");
    setError(null);
  }

  const countedValue = counted.trim() === "" ? null : Number(counted);
  const diff = row && countedValue !== null && Number.isFinite(countedValue) ? countedValue - (row.qrisTotal ?? 0) : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!row) return;
    if (countedValue === null || !Number.isFinite(countedValue) || countedValue < 0) {
      setError("Isi total QRIS sesuai mutasi / aplikasi BNI (angka, boleh 0).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await garageApi.patch(`/api/finance/cash-sessions/${row.id}/qris`, {
        qrisCounted: Math.round(countedValue),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pencocokan QRIS gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cocokkan QRIS dengan BNI</DialogTitle>
          <DialogDescription>
            {row ? `${row.shiftLabel} · ${row.code} · ${row.cashierName}` : ""}
          </DialogDescription>
        </DialogHeader>
        {row ? (
          <form onSubmit={(event) => void submit(event)} className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Row label="QRIS tercatat sistem" value={fmtRp(row.qrisTotal ?? 0)} />
              <Row
                label="Selisih"
                value={diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmtRp(diff)}`}
                tone={diff === null ? undefined : diff === 0 ? "ok" : "bad"}
              />
            </div>
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold text-[#d6d6dc]">Total QRIS masuk di mutasi / aplikasi BNI</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={counted}
                onChange={(event) => setCounted(event.target.value)}
                placeholder="mis. 450000"
                className="h-11 border-[#34343c] bg-white/[0.06]"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold text-[#d6d6dc]">Catatan (opsional)</span>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="mis. 1 transaksi QRIS gagal, pelanggan bayar tunai"
                maxLength={300}
                className="h-11 border-[#34343c] bg-white/[0.06]"
              />
            </label>
            <p className="text-xs leading-5 text-[#b8b8bf]">
              Selisih QRIS dicatat terpisah dari selisih laci tunai dan masuk audit atas nama Anda.
            </p>
            {error ? (
              <p className="text-sm text-[#ffb3b3]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={onClose}>
                Batal
              </Button>
              <Button type="submit" className="h-11 flex-1 bg-[#d11a2a] hover:bg-[#b8131f]" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Simpan
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
