"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  CircleDollarSign,
  Download,
  FileText,
  Loader2,
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GarageApiError, garageApi } from "@/lib/api-client";

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

type DailyShiftReport = {
  date: string;
  rows: Array<
    SessionListItem & {
      cashierName: string;
      counts: { total: number; paid: number; refunded: number };
      sales: SessionSummary["sales"];
      byMethod: SessionSummary["byMethod"];
      cashTotal: number;
      nonCashTotal: number;
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

export function CashierShiftReport() {
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

  if (selectedId) {
    return (
      <ShiftDetailView
        sessionId={selectedId}
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

      <Tabs defaultValue={active ? "active" : "history"} className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Sesi Aktif</TabsTrigger>
          <TabsTrigger value="history">Riwayat ({history.length})</TabsTrigger>
          {dailyReport || dailyLoading || dailyError ? (
            <TabsTrigger value="daily">Rekap Harian</TabsTrigger>
          ) : null}
        </TabsList>

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
              <SessionCard key={s.id} session={s} onOpen={() => setSelectedId(s.id)} />
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
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function SessionCard({
  session,
  onOpen,
}: {
  session: SessionListItem;
  onOpen: () => void;
}) {
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
            {fmtRp(session.expectedCash)}
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
  onBack,
}: {
  sessionId: string;
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
          disabled={loading || !summary}
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
                value={fmtRp(summary.sales.gross)}
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
                  value={fmtRp(summary.session.expectedCash)}
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
                      value={fmtRp(m.total)}
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
}) {
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
          </div>
        </CardContent>
      </Card>

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
