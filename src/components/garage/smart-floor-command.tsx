"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChefHat,
  Clock,
  Loader2,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Table2,
} from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency, type ModuleId } from "@/lib/garage-data";
import type { KitchenOrder, TableLiveRow } from "@/lib/garage-api-types";

type SmartFloorCommandProps = {
  onNavigateModule?: (module: ModuleId) => void;
};

type CommandItem = {
  id: string;
  label: string;
  detail: string;
  tone: "danger" | "warning" | "success" | "muted";
  module: ModuleId;
  icon: "ready" | "bill" | "clean" | "late";
};

const REFRESH_MS = 8000;

function hasAwaitingPaymentBill(row: TableLiveRow) {
  return (
    row.status === "awaiting_payment" ||
    (row.bills ?? []).some((bill) => bill.status === "awaiting_payment")
  );
}

function hasOpenBill(row: TableLiveRow) {
  return (
    (row.openBillCount ?? 0) > 0 ||
    row.status === "pending" ||
    row.status === "accepted" ||
    row.status === "awaiting_payment" ||
    row.status === "ready" ||
    row.status === "mixed"
  );
}

function isNeedsClean(row: TableLiveRow) {
  return row.needsCleaning || row.status === "needs_cleaning";
}

function shortTableLabel(value: string | null | undefined) {
  return value?.replace(/^Meja\s+/i, "M") ?? "M-";
}

function commandToneClass(tone: CommandItem["tone"]) {
  if (tone === "danger") return "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]";
  if (tone === "warning") return "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]";
  if (tone === "success") return "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#bbf7d0]";
  return "border-white/10 bg-white/[0.04] text-white/70";
}

function commandIcon(kind: CommandItem["icon"]) {
  if (kind === "ready") return <ChefHat className="size-4" />;
  if (kind === "bill") return <ReceiptText className="size-4" />;
  if (kind === "clean") return <Table2 className="size-4" />;
  return <Clock className="size-4" />;
}

function buildCommandItems(tables: TableLiveRow[], tickets: KitchenOrder[]): CommandItem[] {
  const readyTickets = tickets
    .filter((ticket) => ticket.status === "ready")
    .sort((a, b) => b.elapsed - a.elapsed)
    .slice(0, 4)
    .map((ticket): CommandItem => ({
      id: `ready-${ticket.id}`,
      label: `${shortTableLabel(ticket.table)} siap antar`,
      detail: `${ticket.items.length} item - ${ticket.elapsed}m di ${ticket.station}`,
      tone: ticket.elapsed >= Math.max(ticket.targetMinutes, 12) ? "danger" : "success",
      module: "waiter",
      icon: "ready",
    }));

  const bills = tables
    .filter(hasAwaitingPaymentBill)
    .sort((a, b) => b.timerMinutes - a.timerMinutes)
    .slice(0, 4)
    .map((table): CommandItem => ({
      id: `bill-${table.tableNumber}`,
      label: `${table.tableLabel} tagihan kasir`,
      detail: `${currency.format(table.total)} - tunggu ${table.timerMinutes}m`,
      tone: table.timerMinutes >= 15 ? "danger" : "warning",
      module: "pos",
      icon: "bill",
    }));

  const clean = tables
    .filter(isNeedsClean)
    .sort((a, b) => b.timerMinutes - a.timerMinutes)
    .slice(0, 4)
    .map((table): CommandItem => ({
      id: `clean-${table.tableNumber}`,
      label: `${table.tableLabel} perlu bersih`,
      detail: table.orderNo ? `Sesi ${table.orderNo}` : "Buka lagi untuk tamu berikutnya",
      tone: "danger",
      module: "waiter",
      icon: "clean",
    }));

  const lateTables = tables
    .filter((table) => hasOpenBill(table) && !hasAwaitingPaymentBill(table) && table.timerMinutes >= 20)
    .sort((a, b) => b.timerMinutes - a.timerMinutes)
    .slice(0, 4)
    .map((table): CommandItem => ({
      id: `late-${table.tableNumber}`,
      label: `${table.tableLabel} overdue`,
      detail: `${table.status.replace(/_/g, " ")} - ${table.timerMinutes}m`,
      tone: table.timerMinutes >= 35 ? "danger" : "warning",
      module: "waiter",
      icon: "late",
    }));

  return [...readyTickets, ...bills, ...clean, ...lateTables].slice(0, 8);
}

export function SmartFloorCommand({ onNavigateModule }: SmartFloorCommandProps) {
  const [tables, setTables] = useState<TableLiveRow[]>([]);
  const [tickets, setTickets] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    setError(null);
    try {
      const [tableRows, ticketRows] = await Promise.all([
        garageApi.get<TableLiveRow[]>("/api/tables/live", { cache: "no-store" }),
        garageApi.get<KitchenOrder[]>("/api/waiter/tickets", { cache: "no-store" }),
      ]);
      setTables(tableRows);
      setTickets(ticketRows);
      setLastSyncedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat Smart Floor Command.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const id = window.setInterval(() => {
      void refresh(true);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const stats = useMemo(() => {
    const activeTables = tables.filter(
      (table) =>
        table.status !== "empty" ||
        table.needsCleaning ||
        Boolean(table.currentOrderId) ||
        (table.openBillCount ?? 0) > 0 ||
        (table.paidBillCount ?? 0) > 0,
    );
    const readyTickets = tickets.filter((ticket) => ticket.status === "ready");
    const lateTickets = tickets.filter(
      (ticket) => ticket.status !== "delivered" && ticket.elapsed >= Math.max(ticket.targetMinutes, 15),
    );
    const awaitingBills = tables.filter(hasAwaitingPaymentBill);
    const cleanTables = tables.filter(isNeedsClean);
    const openTables = tables.filter(hasOpenBill);
    const penalty =
      lateTickets.length * 12 +
      awaitingBills.filter((table) => table.timerMinutes >= 15).length * 10 +
      cleanTables.length * 8 +
      openTables.filter((table) => table.timerMinutes >= 30).length * 6;

    return {
      activeTables: activeTables.length,
      readyTickets: readyTickets.length,
      awaitingBills: awaitingBills.length,
      cleanTables: cleanTables.length,
      lateTickets: lateTickets.length,
      floorScore: Math.max(0, Math.min(100, 100 - penalty)),
    };
  }, [tables, tickets]);

  const commands = useMemo(() => buildCommandItems(tables, tickets), [tables, tickets]);
  const floorTone =
    stats.floorScore >= 85
      ? "text-[#bbf7d0]"
      : stats.floorScore >= 65
        ? "text-[#ffd08a]"
        : "text-[#ffc2c8]";

  return (
    <section className="garage-animate-in overflow-hidden rounded-lg border border-[#2a2a30] bg-[#101013] ring-1 ring-white/[0.04]">
      <div className="flex flex-col gap-3 border-b border-white/8 bg-[#15151a] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#f5a742]/35 bg-[#f5a742]/12 px-2.5 text-xs font-black uppercase tracking-wide text-[#ffd08a]">
              <Sparkles className="size-3.5" />
              Smart Floor Command
            </span>
            <span className="text-xs text-white/45">
              {lastSyncedAt ? `Sync ${lastSyncedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "Belum sync"}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#d0c5af]/75">
            Prioritas realtime untuk meja, waiter, kitchen, dan tagihan kasir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={syncing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs font-bold uppercase tracking-wide text-white/75 transition hover:bg-white/[0.09] disabled:opacity-60"
        >
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Sync
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 border-b border-[#d11a2a]/20 bg-[#d11a2a]/10 px-4 py-3 text-sm text-[#ffc2c8]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid gap-3 p-4 lg:grid-cols-[1.05fr_1.4fr]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
          <FloorMetric label="Floor score" value={`${stats.floorScore}`} sub="health" accent={floorTone} />
          <FloorMetric label="Meja aktif" value={`${stats.activeTables}`} sub="sesi berjalan" />
          <FloorMetric label="Siap antar" value={`${stats.readyTickets}`} sub="ticket ready" accent="text-[#bbf7d0]" />
          <FloorMetric label="Tagihan" value={`${stats.awaitingBills}`} sub="handoff kasir" accent="text-[#ffd08a]" />
          <FloorMetric label="Perlu bersih" value={`${stats.cleanTables}`} sub="turnover meja" accent="text-[#ffc2c8]" />
          <FloorMetric label="Overdue" value={`${stats.lateTickets}`} sub="lewati target" accent="text-[#ffc2c8]" />
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
              Command queue
            </p>
            {commands.length > 0 ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-white/50">
                {commands.length} prioritas
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-white/12 bg-white/[0.02] text-sm text-white/55">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Membaca floor...
            </div>
          ) : commands.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center rounded-lg border border-[#22c55e]/25 bg-[#22c55e]/8 px-4 text-center text-sm text-[#bbf7d0]">
              <CheckCircle2 className="mr-2 size-4" />
              Floor aman. Tidak ada prioritas mendesak.
            </div>
          ) : (
            <div className="grid gap-2">
              {commands.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigateModule?.(item.module)}
                  className={`group flex min-h-14 items-center gap-3 rounded-md border px-3 py-2 text-left transition hover:bg-white/[0.07] ${commandToneClass(item.tone)}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/25 ring-1 ring-white/10">
                    {commandIcon(item.icon)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-white">{item.label}</span>
                    <span className="block truncate text-xs text-white/55">{item.detail}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-white/45 transition group-hover:translate-x-0.5 group-hover:text-white/75" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FloorMetric({
  label,
  value,
  sub,
  accent = "text-white",
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="rounded-md border border-white/8 bg-white/[0.035] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-white/45">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-black leading-none ${accent}`}>{value}</p>
      <p className="mt-1 truncate text-[11px] text-white/45">{sub}</p>
    </div>
  );
}
