"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChefHat,
  ChevronRight,
  CircleCheck,
  Clock,
  Coffee,
  FileText,
  Flag,
  History,
  Hourglass,
  Layers,
  LayoutList,
  Loader2,
  Package,
  PlayCircle,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";

import { garageApi } from "@/lib/api-client";
import type { MenuItem, ProductionBatchView, ProductionTicketView } from "@/lib/garage-api-types";
import type { ProductionBatchHistoryRow } from "@/lib/garage-production";
import {
  batchSummary,
  buildBatchRows,
  estimateMinutes,
  nextAllocation,
  ordersReadyAfterBatches,
  tallyMenus,
  type BatchRow,
} from "@/lib/production-batch-view";
import { elapsedSeconds, formatElapsed, hubStatusOf } from "@/lib/production-hub-v4";

import { HubSheet } from "./hub-ui";
import { customerOf, tableText } from "./order-card";
import { AutoPrintSwitch } from "./printer-panel";

type Station = "Bar" | "Food";
type Tab = "aktif" | "menu" | "riwayat";

const UNIT: Record<Station, string> = { Bar: "Cup", Food: "Porsi" };
const TICKET_STATUS_ID: Record<string, string> = {
  queue: "menunggu",
  cooking: "diproses",
  ready: "siap",
  delivered: "selesai",
  cancelled: "batal",
};

type WmsSummary = { outletAlerts: Array<{ area: string; items: Array<{ name: string }> }> };

export type BatchActions = {
  startRow: (row: BatchRow) => Promise<boolean>;
  completePartial: (batch: ProductionBatchView, allocationIds: string[]) => Promise<boolean>;
  completeFull: (batch: ProductionBatchView) => Promise<boolean>;
  cancel: (batch: ProductionBatchView, reason: string) => Promise<boolean>;
  recall: (ticketNo: string) => Promise<boolean>;
};

function MenuThumb({ menu, station, size = 44 }: { menu: MenuItem | undefined; station: Station; size?: number }) {
  const Icon = station === "Bar" ? Coffee : ChefHat;
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-elev)]"
      style={{ width: size, height: size }}
    >
      {menu?.imageUrl ? (
        <Image src={menu.imageUrl} alt={menu.name} fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <Icon className="size-5 text-[var(--phv4-muted)]" aria-hidden />
      )}
    </span>
  );
}

const STATUS_CHIP: Record<BatchRow["status"], { label: string; cls: string; Icon: typeof PlayCircle }> = {
  proses: { label: "Proses", cls: "bg-[var(--phv4-process)]/20 text-[#93c5fd] border-[var(--phv4-process)]/50", Icon: PlayCircle },
  menunggu: { label: "Menunggu", cls: "bg-[var(--phv4-wait)]/15 text-[var(--phv4-wait)] border-[var(--phv4-wait)]/50", Icon: Hourglass },
  siap: { label: "Siap", cls: "bg-[var(--phv4-success)]/15 text-[#86efac] border-[var(--phv4-success)]/50", Icon: CircleCheck },
};

const BAR_TONE: Record<BatchRow["status"], string> = {
  proses: "border-l-[var(--phv4-process)]",
  menunggu: "border-l-[var(--phv4-wait)]",
  siap: "border-l-[var(--phv4-success)]",
};

function Progress({ done, total, status }: { done: number; total: number; status: BatchRow["status"] }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#2f333b]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`h-full rounded-full transition-[width] duration-200 ${status === "siap" ? "bg-[var(--phv4-success)]" : "bg-[var(--phv4-process)]"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "order" }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-[5px] border px-1.5 text-[11px] font-semibold ${
        tone === "order" ? "phv4-mono border-[var(--phv4-border)] bg-[var(--phv4-bg)] text-[#e5e7eb]" : "border-[var(--phv4-border)] text-[#d1d5db]"
      }`}
    >
      {children}
    </span>
  );
}

export function BatchView({
  station,
  onStation,
  batches,
  suggestions,
  tickets,
  menuItems,
  lateTicketNos,
  avgMinutes,
  now,
  layout,
  canOperate,
  busyKey,
  actions,
  readyTickets,
  autoPrint,
  onAutoPrint,
  onOpenTicket,
}: {
  station: Station;
  onStation: (station: Station) => void;
  batches: ProductionBatchView[];
  suggestions: Parameters<typeof buildBatchRows>[1];
  tickets: ProductionTicketView[];
  menuItems: MenuItem[];
  lateTicketNos: Set<string>;
  avgMinutes: { Bar: number | null; Food: number | null };
  now: number;
  layout: "desktop" | "tablet" | "mobile";
  canOperate: { Bar: boolean; Food: boolean };
  busyKey: string | null;
  actions: BatchActions;
  readyTickets: ProductionTicketView[];
  autoPrint: boolean;
  onAutoPrint: (next: boolean) => void;
  onOpenTicket: (ticketNo: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("aktif");
  const [grouped, setGrouped] = useState(true);
  const [query, setQuery] = useState("");
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [history, setHistory] = useState<ProductionBatchHistoryRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [wms, setWms] = useState<WmsSummary | null>(null);
  const menuById = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems]);
  const allowed = canOperate[station];

  const stationTickets = useMemo(() => tickets.filter((t) => t.station === station), [tickets, station]);
  const allRows = useMemo(
    () =>
      buildBatchRows(
        batches.filter((b) => b.station === station),
        suggestions.filter((s) => s.station === station),
        { grouped, lateTicketNos },
      ),
    [batches, suggestions, station, grouped, lateTicketNos],
  );
  const counts = useMemo(
    () => ({
      Bar: buildBatchRows(batches.filter((b) => b.station === "Bar"), suggestions.filter((s) => s.station === "Bar"), { grouped, lateTicketNos }).length,
      Food: buildBatchRows(batches.filter((b) => b.station === "Food"), suggestions.filter((s) => s.station === "Food"), { grouped, lateTicketNos }).length,
    }),
    [batches, suggestions, grouped, lateTicketNos],
  );
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () => (q ? allRows.filter((r) => [r.label, ...r.orders, ...r.modifiers.map((m) => m.label)].join(" ").toLowerCase().includes(q)) : allRows),
    [allRows, q],
  );
  const summary = batchSummary(allRows, avgMinutes[station], now);
  const menus = useMemo(() => {
    const list = tallyMenus(stationTickets);
    return q ? list.filter((m) => m.label.toLowerCase().includes(q)) : list;
  }, [stationTickets, q]);
  const willBeReady = useMemo(() => [...new Set(ordersReadyAfterBatches(stationTickets, allRows))], [stationTickets, allRows]);
  const readyMine = readyTickets.filter((t) => t.station === station && hubStatusOf(t) === "ready");
  const runningBatches = allRows.flatMap((r) => r.batches);
  // Hitungan untuk staf = baris menu yang sedang dibuat (bukan sub-batch per catatan).
  const runningRows = allRows.filter((r) => r.batches.length).length;
  const doneToday = (history ?? []).filter((b) => b.station === station && b.status === "completed").length;
  const lowStock = (wms?.outletAlerts ?? []).filter((a) => a.area === (station === "Bar" ? "bar" : "dapur")).flatMap((a) => a.items);
  const detail = detailKey ? allRows.find((r) => r.key === detailKey) ?? null : null;

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await garageApi.get<{ batches: ProductionBatchHistoryRow[] }>("/api/production/batches", { cache: "no-store" });
      setHistory(data.batches);
    } catch {
      /* biarkan data lama */
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  const historySignal = Math.floor(now / 20_000);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat riwayat batch (tiap ±20 dtk)
    void loadHistory();
  }, [loadHistory, historySignal]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void garageApi
        .get<WmsSummary>("/api/wms/summary")
        .then((d) => alive && setWms(d))
        .catch(() => undefined);
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (!confirmKey) return;
    const id = window.setTimeout(() => setConfirmKey(null), 5000);
    return () => window.clearTimeout(id);
  }, [confirmKey]);

  async function completeRow(row: BatchRow) {
    if (confirmKey !== row.key) {
      setConfirmKey(row.key);
      return;
    }
    setConfirmKey(null);
    for (const batch of row.batches) await actions.completeFull(batch);
  }
  async function completeOne(row: BatchRow) {
    const next = nextAllocation(row);
    if (next) await actions.completePartial(next.batch, [next.allocation.id]);
  }
  async function completeAllActive() {
    setBulkConfirm(false);
    for (const batch of runningBatches) await actions.completeFull(batch);
  }

  // ------------------------------------------------------------- pieces
  const tabs = (
    <div role="tablist" aria-label="Tampilan batch" className="flex h-full shrink-0 items-stretch">
      {(
        [
          ["aktif", `Aktif (${allRows.length})`, Layers],
          ["menu", "Semua Menu", LayoutList],
          ["riwayat", "Riwayat Batch", History],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          className={`relative inline-flex items-center gap-1.5 px-3 text-[13px] font-semibold transition-colors ${
            tab === id ? "text-white" : "text-[var(--phv4-muted)] hover:text-white"
          }`}
        >
          <Icon className={`size-4 ${tab === id ? "text-[var(--phv4-red)]" : ""}`} />
          <span className="whitespace-nowrap">{label}</span>
          {tab === id ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-[var(--phv4-red)]" /> : null}
        </button>
      ))}
    </div>
  );

  const stationButtons = (["Bar", "Food"] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={station === s}
          onClick={() => onStation(s)}
          className={`min-w-[84px] rounded-[5px] px-2 text-[13px] font-bold transition-colors ${
            station === s ? "bg-[var(--phv4-red)] text-white" : "text-[var(--phv4-muted)] hover:text-white"
          }`}
        >
          {s === "Bar" ? "Bar" : "Dapur"} ({counts[s]})
        </button>
      ));
  const stationTabs = (
    <div role="radiogroup" aria-label="Station" className="grid h-9 shrink-0 grid-cols-2 gap-1 rounded-md border border-[var(--phv4-border)] bg-[var(--phv4-bg)] p-0.5">
      {stationButtons}
    </div>
  );

  const search = (
    <label className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 md:max-w-[260px]">
      <Search className="size-4 shrink-0 text-[var(--phv4-muted)]" aria-hidden />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari menu / order…"
        aria-label="Cari menu atau order"
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none"
      />
    </label>
  );

  const autoGroup = (
    <label className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2.5 text-[12px] font-semibold">
      <Layers className="size-4 text-[var(--phv4-red)]" aria-hidden />
      <span className="whitespace-nowrap">Auto Grouping</span>
      <AutoPrintSwitch on={grouped} onChange={setGrouped} label="Auto grouping menu + varian" />
    </label>
  );

  const kpis = (
    <div className="flex shrink-0 items-center gap-1.5">
      {(
        [
          ["Batch Aktif", summary.activeBatch, "text-white", Layers],
          ["Proses", summary.processing, "text-[#60a5fa]", PlayCircle],
          ["Selesai", doneToday, "text-[var(--phv4-success)]", Check],
          ["Menunggu", summary.waiting, "text-[var(--phv4-wait)]", Hourglass],
          ["Prioritas", summary.priority, summary.priority ? "text-[var(--phv4-critical)]" : "text-[var(--phv4-muted)]", AlertTriangle],
        ] as const
      ).map(([label, value, tone, Icon]) => (
        <div
          key={label}
          className={`flex h-9 items-center gap-1.5 rounded-md border px-2 ${
            label === "Prioritas" && value ? "border-[var(--phv4-critical)]/60 bg-[var(--phv4-critical)]/10" : "border-[var(--phv4-border)] bg-[var(--phv4-bg)]"
          }`}
        >
          <Icon className={`size-3.5 ${tone}`} aria-hidden />
          <span className="text-[11px] font-semibold text-[var(--phv4-muted)]">{label}</span>
          <span className={`phv4-mono text-[15px] font-bold ${tone}`}>{value}</span>
        </div>
      ))}
    </div>
  );

  function rowActions(row: BatchRow, compact = false) {
    const busyRow = Boolean(busyKey && row.batches.some((b) => busyKey.endsWith(b.id)));
    const confirming = confirmKey === row.key;
    const hasNext = Boolean(nextAllocation(row));
    return (
      <div className={`flex shrink-0 items-center gap-1.5 ${compact ? "w-full" : ""}`}>
        <button
          type="button"
          onClick={() => setDetailKey(row.key)}
          aria-label={`Detail ${row.label}`}
          className="inline-flex h-10 items-center gap-1 rounded-[6px] border border-[var(--phv4-border)] px-2.5 text-[12px] font-semibold hover:bg-white/5"
        >
          <FileText className="size-4" />
          <span className="hidden xl:inline">Detail</span>
        </button>
        {row.batches.length ? (
          <button
            type="button"
            disabled={!allowed || !hasNext || busyRow}
            onClick={() => void completeOne(row)}
            className="inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-[6px] border border-[var(--phv4-border)] px-2.5 text-[12px] font-semibold hover:bg-white/5 disabled:opacity-45"
            title="Selesaikan satu porsi (order terlama)"
          >
            <Check className="size-4" /> 1
          </button>
        ) : null}
        {row.suggestions.length && !row.batches.length ? (
          <button
            type="button"
            disabled={!allowed || busyRow}
            onClick={() => void actions.startRow(row)}
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-[6px] bg-[var(--phv4-red)] px-3 text-[13px] font-bold text-white hover:bg-[var(--phv4-red-hover)] disabled:opacity-50 ${compact ? "flex-1" : "min-w-[150px]"}`}
          >
            {busyRow ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />} Proses
          </button>
        ) : (
          <button
            type="button"
            disabled={!allowed || busyRow || !row.batches.length}
            onClick={() => void completeRow(row)}
            className={`inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 text-[13px] font-bold text-white disabled:opacity-50 ${
              confirming ? "bg-[var(--phv4-success)] text-[#052e16]" : "bg-[#15803d] hover:bg-[var(--phv4-success)]"
            } ${compact ? "flex-1" : "min-w-[150px]"}`}
          >
            {busyRow ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {confirming ? `Konfirmasi ${row.totalQty - row.doneQty} porsi` : "Selesaikan Batch"}
          </button>
        )}
      </div>
    );
  }

  function statusCell(row: BatchRow) {
    const chip = STATUS_CHIP[row.status];
    const pct = row.totalQty ? Math.round((row.doneQty / row.totalQty) * 100) : 0;
    return (
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-6 items-center gap-1 rounded-[5px] border px-1.5 text-[11px] font-bold ${chip.cls}`}>
            <chip.Icon className="size-3.5" aria-hidden />
            {chip.label}
          </span>
          <span className="phv4-mono ml-auto text-[13px] font-bold">
            {row.doneQty}/{row.totalQty}
            <span className="ml-1 text-[11px] font-semibold text-[var(--phv4-muted)]">{pct}%</span>
          </span>
        </div>
        <Progress done={row.doneQty} total={row.totalQty} status={row.status} />
      </div>
    );
  }

  function orderChips(row: BatchRow, max = 3) {
    const shown = row.orders.slice(0, max);
    return (
      <div className="flex min-w-0 flex-wrap gap-1">
        {shown.map((o) => (
          <Chip key={o} tone="order">
            #{o.replace(/^POS-/, "").slice(-6)}
          </Chip>
        ))}
        {row.orders.length > max ? <Chip tone="order">+{row.orders.length - max}</Chip> : null}
      </div>
    );
  }

  function menuCell(row: BatchRow, thumb = 48) {
    const menu = row.menuItemId ? menuById.get(row.menuItemId) : undefined;
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <MenuThumb menu={menu} station={row.station} size={thumb} />
        <div className="min-w-0">
          {row.priority ? (
            <span className="mb-0.5 inline-flex h-5 items-center gap-1 rounded-[4px] bg-[var(--phv4-critical)]/20 px-1.5 text-[10px] font-bold tracking-wide text-[#fecaca]">
              <Flag className="size-3" aria-hidden /> PRIORITAS
            </span>
          ) : null}
          <p className="truncate text-[15px] font-bold leading-5">{row.label}</p>
          <div className="mt-1 flex min-w-0 flex-wrap gap-1">
            {row.modifiers.slice(0, 3).map((m) => (
              <Chip key={m.label}>
                {m.label} {m.qty}
              </Chip>
            ))}
            {row.modifiers.length > 3 ? <Chip>+{row.modifiers.length - 3}</Chip> : null}
          </div>
        </div>
      </div>
    );
  }

  function etaCell(row: BatchRow) {
    if (row.status === "siap") {
      return (
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#86efac]">
          <CircleCheck className="size-4" /> Selesai
        </span>
      );
    }
    return (
      <span className="phv4-mono inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-[#e5e7eb]">
        <Clock className="size-4 text-[var(--phv4-muted)]" /> ± {estimateMinutes(row, avgMinutes[station], now)} mnt
      </span>
    );
  }

  const emptyRows = (
    <div className="grid place-items-center py-14 text-center">
      <Layers className="size-7 text-[var(--phv4-muted)]" />
      <p className="mt-2 text-[14px] font-semibold">Belum ada batch {station === "Bar" ? "Bar" : "Dapur"}</p>
      <p className="mt-0.5 max-w-sm text-[12px] text-[var(--phv4-muted)]">
        Batch muncul otomatis bila ≥2 order memesan menu, varian & modifier yang sama.
      </p>
    </div>
  );

  // Tabel desktop/tablet.
  const gridCols =
    layout === "desktop"
      ? "grid-cols-[minmax(230px,1.5fr)_76px_minmax(170px,1fr)_minmax(150px,0.9fr)_86px_auto]"
      : "grid-cols-[minmax(200px,1.4fr)_64px_minmax(150px,1fr)_minmax(110px,0.8fr)_auto]";
  const activeTable = rows.length ? (
    <div role="table" aria-label="Batch aktif" className="min-w-0">
      <div role="row" className={`sticky top-0 z-[1] grid ${gridCols} items-center gap-3 border-b border-[var(--phv4-border)] bg-[var(--phv4-bg2)] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[var(--phv4-muted)]`}>
        <span role="columnheader">Menu &amp; Varian</span>
        <span role="columnheader" className="text-center">Jumlah</span>
        <span role="columnheader">Progress</span>
        <span role="columnheader">Order Terkait</span>
        {layout === "desktop" ? <span role="columnheader">Estimasi</span> : null}
        <span role="columnheader" className="text-right">Aksi</span>
      </div>
      <div className="space-y-1.5 p-1.5">
        {rows.map((row) => (
          <div
            key={row.key}
            role="row"
            className={`grid ${gridCols} items-center gap-3 rounded-[8px] border border-l-[3px] border-[var(--phv4-border)] bg-[var(--phv4-card)] px-3 py-2 ${BAR_TONE[row.status]} ${
              row.priority ? "border-l-[var(--phv4-critical)]" : ""
            }`}
          >
            <div role="cell" className="min-w-0">{menuCell(row)}</div>
            <div role="cell" className="text-center">
              <p className="phv4-mono text-[20px] font-bold leading-6">{row.totalQty}</p>
              <p className="text-[11px] text-[var(--phv4-muted)]">{UNIT[row.station]}</p>
            </div>
            <div role="cell" className="min-w-0">{statusCell(row)}</div>
            <div role="cell" className="min-w-0">
              {orderChips(row, layout === "desktop" ? 3 : 2)}
              {layout !== "desktop" ? <div className="mt-1">{etaCell(row)}</div> : null}
            </div>
            {layout === "desktop" ? <div role="cell">{etaCell(row)}</div> : null}
            <div role="cell" className="justify-self-end">{rowActions(row)}</div>
          </div>
        ))}
      </div>
    </div>
  ) : (
    emptyRows
  );

  // Kartu HP.
  const activeCards = rows.length ? (
    <ul className="space-y-1.5">
      {rows.map((row) => {
        const menu = row.menuItemId ? menuById.get(row.menuItemId) : undefined;
        const pct = row.totalQty ? Math.round((row.doneQty / row.totalQty) * 100) : 0;
        return (
          <li key={row.key} className={`rounded-[8px] border border-l-[3px] border-[var(--phv4-border)] bg-[var(--phv4-card)] ${BAR_TONE[row.status]}`}>
            <button type="button" onClick={() => setDetailKey(row.key)} className="flex w-full items-center gap-2.5 p-2.5 text-left">
              <MenuThumb menu={menu} station={row.station} size={52} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold">{row.label}</span>
                  {row.priority ? <Flag className="size-3.5 shrink-0 text-[var(--phv4-critical)]" aria-label="Prioritas" /> : null}
                  <span className="phv4-mono ml-auto shrink-0 rounded-[5px] bg-[var(--phv4-red)] px-1.5 text-[12px] font-bold text-white">
                    {row.totalQty} {UNIT[row.station]}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-[var(--phv4-muted)]">
                  {row.modifiers.map((m) => `${m.label} ${m.qty}`).join(" · ")}
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="phv4-mono shrink-0 text-[12px] font-bold">
                    {row.doneQty}/{row.totalQty} ({pct}%)
                  </span>
                  <Progress done={row.doneQty} total={row.totalQty} status={row.status} />
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-[var(--phv4-muted)]" />
            </button>
          </li>
        );
      })}
    </ul>
  ) : (
    emptyRows
  );

  const menuTable = menus.length ? (
    <div className="space-y-1.5 p-1.5">
      {menus.map((m) => {
        const menu = menuItems.find((x) => m.label.startsWith(x.name));
        return (
          <div key={m.label} className="flex items-center gap-3 rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] px-3 py-2">
            <MenuThumb menu={menu} station={station} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold">{m.label}</p>
              <p className="truncate text-[11px] text-[var(--phv4-muted)]">
                {m.modifiers.map((x) => `${x.label} ${x.qty}`).join(" · ")} · {m.orders.length} order
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5 text-center">
              {(
                [
                  ["Tunggu", m.waiting, "text-[var(--phv4-wait)]"],
                  ["Proses", m.processing, "text-[#60a5fa]"],
                  ["Siap", m.ready, "text-[var(--phv4-success)]"],
                ] as const
              ).map(([label, value, tone]) => (
                <span key={label} className="w-14 rounded-[6px] border border-[var(--phv4-border)] py-0.5">
                  <span className={`phv4-mono block text-[15px] font-bold ${tone}`}>{value}</span>
                  <span className="block text-[10px] text-[var(--phv4-muted)]">{label}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <p className="py-10 text-center text-[13px] text-[var(--phv4-muted)]">Tidak ada porsi aktif di station ini.</p>
  );

  const historyList =
    history === null && historyLoading ? (
      <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-[var(--phv4-muted)]">
        <Loader2 className="size-4 animate-spin" /> Memuat riwayat batch…
      </p>
    ) : (
      <HistoryBatches
        rows={(history ?? []).filter((b) => b.station === station && (!q || [b.itemLabel, b.batchNo, ...b.allocations.map((a) => a.orderNo ?? "")].join(" ").toLowerCase().includes(q)))}
        menuById={menuById}
        canWrite={allowed}
        busyKey={busyKey}
        onRecall={actions.recall}
        onOpenTicket={onOpenTicket}
      />
    );

  const footer = (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--phv4-border)] bg-[var(--phv4-bg2)] px-3 py-2">
      <span className="flex items-center gap-2">
        <ShoppingCart className="size-4 text-[var(--phv4-muted)]" aria-hidden />
        <span className="text-[12px] text-[var(--phv4-muted)]">Total Produksi</span>
        <span className="phv4-mono text-[16px] font-bold">
          {summary.totalQty} {UNIT[station]}
        </span>
        <span className="phv4-mono text-[13px] font-semibold text-[var(--phv4-muted)]">· {allRows.length} Batch</span>
      </span>
      {lowStock.length ? (
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-[var(--phv4-wait)]" title={lowStock.map((i) => i.name).join(", ")}>
          <Package className="size-4 shrink-0" aria-hidden />
          <span className="truncate">
            Peringatan Stok: {lowStock.length} bahan menipis ({lowStock.slice(0, 2).map((i) => i.name).join(", ")}
            {lowStock.length > 2 ? ", …" : ""})
          </span>
        </span>
      ) : null}
      {runningBatches.length && allowed ? (
        bulkConfirm ? (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-[#fde68a]">Semua porsi {runningRows} batch sudah jadi?</span>
            <button type="button" onClick={() => setBulkConfirm(false)} className="h-10 rounded-[6px] border border-[var(--phv4-border)] px-3 text-[12px] font-semibold">
              Batal
            </button>
            <button type="button" onClick={() => void completeAllActive()} className="inline-flex h-10 items-center gap-1.5 rounded-[6px] bg-[var(--phv4-success)] px-3 text-[13px] font-bold text-[#052e16]">
              <CheckCheck className="size-4" /> Ya, selesaikan
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={Boolean(busyKey)}
            onClick={() => setBulkConfirm(true)}
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-[6px] bg-[#15803d] px-4 text-[13px] font-bold text-white hover:bg-[var(--phv4-success)] disabled:opacity-50 ${layout === "mobile" ? "w-full" : "ml-auto"}`}
          >
            <CheckCheck className="size-4" /> Selesaikan Batch Aktif ({runningRows})
          </button>
        )
      ) : null}
    </div>
  );

  const aside =
    layout === "desktop" ? (
      <aside aria-label="Ringkasan batch" className="garage-scroll hidden w-[300px] shrink-0 space-y-2 overflow-y-auto border-l border-[var(--phv4-border)] bg-[var(--phv4-bg2)] p-2 xl:block 2xl:w-[330px]">
        <section className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
          <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
            <Layers className="size-4 text-[var(--phv4-red)]" /> Ringkasan Batch
          </h3>
          <dl className="space-y-1.5 text-[13px]">
            {(
              [
                ["Total batch aktif", summary.activeBatch, ""],
                ["Total item proses", summary.itemsInProgress, ""],
                ["Batch prioritas", summary.priority, summary.priority ? "text-[var(--phv4-critical)]" : ""],
                ["Estimasi siap", summary.activeBatch ? `± ${summary.etaMinutes} menit` : "—", "text-[var(--phv4-wait)]"],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="flex items-center justify-between border-b border-[var(--phv4-border)]/60 pb-1.5 last:border-0 last:pb-0">
                <dt className="text-[#d1d5db]">{label}</dt>
                <dd className={`phv4-mono font-bold ${tone}`}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
          <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
            <CircleCheck className="size-4 text-[var(--phv4-success)]" /> Ready Queue <span className="text-[12px] font-normal text-[var(--phv4-muted)]">(Siap Diambil)</span>
          </h3>
          {readyMine.length ? (
            <ul className="space-y-1">
              {readyMine.slice(0, 6).map((t) => (
                <li key={t.ticketNo}>
                  <button type="button" onClick={() => onOpenTicket(t.ticketNo)} className="flex w-full items-center gap-2 rounded-[6px] border border-[var(--phv4-border)] px-2 py-1.5 text-left hover:bg-white/5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">
                        #{(t.orderNo ?? t.ticketNo).replace(/^POS-/, "").slice(-6)} · {tableText(t.table)}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--phv4-muted)]">
                        {t.items.map((i) => `${i.qty}× ${i.label}`).join(", ")}
                      </span>
                    </span>
                    <CircleCheck className="size-5 shrink-0 text-[var(--phv4-success)]" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-[var(--phv4-muted)]">Belum ada yang siap.</p>
          )}
        </section>
        <section className="flex items-center gap-3 rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
          <Printer className="size-5 shrink-0 text-[var(--phv4-muted)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">Auto Print</p>
            <p className="text-[11px] text-[var(--phv4-muted)]">Tiket SELESAI 1× per order saat semua item siap</p>
          </div>
          <AutoPrintSwitch on={autoPrint} onChange={onAutoPrint} />
        </section>
        <section className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
          <h3 className="flex items-center gap-2 text-[14px] font-bold">
            <ShoppingCart className="size-4 text-[var(--phv4-muted)]" /> Pesanan Akan Ready
          </h3>
          <p className="mb-2 text-[11px] text-[var(--phv4-muted)]">Siap begitu batch station ini selesai</p>
          {willBeReady.length ? (
            <div className="flex flex-wrap gap-1">
              {willBeReady.map((o) => (
                <Chip key={o} tone="order">
                  #{o.replace(/^POS-/, "").slice(-6)}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--phv4-muted)]">—</p>
          )}
        </section>
      </aside>
    ) : null;

  const body =
    tab === "aktif" ? (layout === "mobile" ? activeCards : activeTable) : tab === "menu" ? menuTable : historyList;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {layout === "mobile" ? (
        <div className="shrink-0 space-y-2 border-b border-[var(--phv4-border)] p-2">
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-[var(--phv4-red)]" />
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold leading-5">Batch Produksi</h2>
              <p className="text-[11px] text-[var(--phv4-muted)]">Kelompokkan & proses produk sejenis.</p>
            </div>
          </div>
          <div role="radiogroup" aria-label="Station" className="grid h-10 grid-cols-2 gap-1">
            {stationButtons}
          </div>
          <div className="flex gap-1.5">
            {search}
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as Tab)}
              aria-label="Tampilan batch"
              className="h-9 shrink-0 rounded-md border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[12px] font-semibold [&>option]:bg-[#15171b]"
            >
              <option value="aktif">Aktif ({allRows.length})</option>
              <option value="menu">Semua Menu</option>
              <option value="riwayat">Riwayat</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="flex h-12 shrink-0 items-stretch gap-2 border-b border-[var(--phv4-border)] bg-[var(--phv4-bg)] pr-2">
          <div className="flex min-w-0 flex-1 items-stretch gap-2 overflow-x-auto [scrollbar-width:none]">
            {tabs}
            <div className="flex items-center gap-2">
              {stationTabs}
              {search}
              {autoGroup}
            </div>
          </div>
          {layout === "desktop" ? <div className="hidden items-center 2xl:flex">{kpis}</div> : null}
        </div>
      )}
      {layout !== "mobile" && layout !== "desktop" ? (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--phv4-border)] px-2 py-1.5 [scrollbar-width:none]">{kpis}</div>
      ) : null}
      {layout === "desktop" ? (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--phv4-border)] px-2 py-1.5 2xl:hidden [scrollbar-width:none]">{kpis}</div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <div className="garage-scroll min-h-0 min-w-0 flex-1 overflow-y-auto p-1 md:p-0">{body}</div>
        {aside}
      </div>
      {tab === "aktif" ? footer : null}

      <HubSheet
        open={Boolean(detail)}
        onClose={() => setDetailKey(null)}
        title={detail ? `${detail.label} · ${detail.totalQty} ${UNIT[detail.station]}` : "Detail batch"}
        icon={Layers}
        width="md:w-[520px]"
      >
        {detail ? (
          <BatchDetail
            row={detail}
            menu={detail.menuItemId ? menuById.get(detail.menuItemId) : undefined}
            allowed={allowed}
            busyKey={busyKey}
            now={now}
            eta={estimateMinutes(detail, avgMinutes[station], now)}
            actions={actions}
            onOpenTicket={onOpenTicket}
          />
        ) : null}
      </HubSheet>
    </div>
  );
}

/** Pasangan tiket ↔ nomor order yang benar (dari porsi batch & saran batch). */
function linkedOrders(row: BatchRow) {
  const map = new Map<string, string | null>();
  for (const b of row.batches) for (const a of b.allocations) if (a.ticketNo) map.set(a.ticketNo, a.orderNo);
  for (const s of row.suggestions) for (const i of s.items) map.set(i.ticketNo, i.orderNo);
  return [...map.entries()].map(([ticketNo, orderNo]) => ({ ticketNo, orderNo }));
}

function BatchDetail({
  row,
  menu,
  allowed,
  busyKey,
  now,
  eta,
  actions,
  onOpenTicket,
}: {
  row: BatchRow;
  menu: MenuItem | undefined;
  allowed: boolean;
  busyKey: string | null;
  now: number;
  eta: number;
  actions: BatchActions;
  onOpenTicket: (ticketNo: string) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const chip = STATUS_CHIP[row.status];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <MenuThumb menu={menu} station={row.station} size={64} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-6 items-center gap-1 rounded-[5px] border px-1.5 text-[11px] font-bold ${chip.cls}`}>
              <chip.Icon className="size-3.5" /> {chip.label}
            </span>
            {row.priority ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-[5px] bg-[var(--phv4-critical)]/20 px-1.5 text-[11px] font-bold text-[#fecaca]">
                <Flag className="size-3" /> PRIORITAS
              </span>
            ) : null}
            <span className="phv4-mono ml-auto text-[12px] text-[var(--phv4-muted)]">± {eta} mnt</span>
          </div>
          <Progress done={row.doneQty} total={row.totalQty} status={row.status} />
          <p className="text-[12px] text-[var(--phv4-muted)]">
            {row.doneQty}/{row.totalQty} selesai · {row.modifiers.map((m) => `${m.label} ${m.qty}`).join(" · ")}
          </p>
        </div>
      </div>

      {row.batches.map((batch) => {
        const open = batch.allocations.filter((a) => !a.allocated);
        const selected = open.filter((a) => picked.has(a.id));
        const busy = Boolean(busyKey?.endsWith(batch.id));
        return (
          <section key={batch.id} className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-2.5">
            <div className="mb-1.5 flex items-center gap-2 text-[12px]">
              <span className="phv4-mono font-bold">{batch.batchNo}</span>
              {batch.note ? <span className="truncate font-semibold text-[#fde68a]">• {batch.note}</span> : null}
              <span className="phv4-mono ml-auto text-[var(--phv4-muted)]">
                {formatElapsed(elapsedSeconds(batch.startedAt, now))} · {batch.startedByName ?? ""}
              </span>
            </div>
            <p className="mb-1 text-[11px] text-[var(--phv4-muted)]">Tap porsi yang sudah jadi & dicocokkan ke Nama + Meja + Order.</p>
            <ul className="space-y-1">
              {batch.allocations.map((a) => {
                const on = a.allocated || picked.has(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={a.allocated || !allowed}
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((cur) => {
                          const next = new Set(cur);
                          if (next.has(a.id)) next.delete(a.id);
                          else next.add(a.id);
                          return next;
                        })
                      }
                      className={`flex min-h-11 w-full items-center gap-2 rounded-[6px] border px-2 text-left ${
                        a.allocated
                          ? "border-[var(--phv4-success)]/40 bg-[var(--phv4-success)]/10 opacity-80"
                          : on
                            ? "border-[var(--phv4-success)] bg-[var(--phv4-success)]/10"
                            : "border-[var(--phv4-border)] hover:bg-white/5"
                      }`}
                    >
                      <span className={`grid size-5 shrink-0 place-items-center rounded border ${on ? "border-[var(--phv4-success)] bg-[var(--phv4-success)] text-[#052e16]" : "border-[#6b7280]"}`}>
                        {on ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">
                          {customerOf({ identity: a.customerName ?? a.identity, table: a.table }).customer ?? "Tanpa nama"}
                        </span>
                        <span className="phv4-mono block truncate text-[11px] text-[var(--phv4-muted)]">
                          {tableText(a.table)} · #{a.orderNo ?? a.ticketNo ?? "-"}
                          {a.note ? ` · ${a.note}` : ""}
                          {a.allocated ? " · selesai" : ""}
                        </span>
                      </span>
                      <span className="phv4-mono shrink-0 text-[14px] font-bold text-[var(--phv4-wait)]">{a.qty}×</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {allowed && open.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={!selected.length || busy}
                  onClick={async () => {
                    if (await actions.completePartial(batch, selected.map((a) => a.id))) setPicked(new Set());
                  }}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[var(--phv4-success)]/60 px-3 text-[12px] font-bold disabled:opacity-45"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Selesaikan terpilih ({selected.reduce((s, a) => s + a.qty, 0)})
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void actions.completeFull(batch)}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-[#15803d] px-3 text-[12px] font-bold text-white hover:bg-[var(--phv4-success)] disabled:opacity-50"
                >
                  <CheckCheck className="size-4" /> Semua jadi ({open.reduce((s, a) => s + a.qty, 0)})
                </button>
              </div>
            ) : null}
            {allowed ? (
              cancelFor === batch.id ? (
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Alasan batal batch (diaudit)"
                    aria-label="Alasan batal batch"
                    className="h-10 min-w-0 flex-1 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[12px] outline-none focus:border-[var(--phv4-red)]"
                  />
                  <button
                    type="button"
                    disabled={reason.trim().length < 3 || busy}
                    onClick={async () => {
                      if (await actions.cancel(batch, reason.trim())) setCancelFor(null);
                    }}
                    className="inline-flex h-10 shrink-0 items-center gap-1 rounded-[6px] border border-[var(--phv4-critical)]/60 px-3 text-[12px] font-semibold text-[#fecaca] disabled:opacity-50"
                  >
                    <X className="size-4" /> Batalkan
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setCancelFor(batch.id)} className="mt-2 text-[12px] font-semibold text-[var(--phv4-muted)] underline-offset-2 hover:text-white hover:underline">
                  Batalkan batch… (porsi yang sudah jadi tetap siap)
                </button>
              )
            ) : null}
          </section>
        );
      })}

      {row.suggestions.length ? (
        <section className="rounded-[8px] border border-dashed border-[var(--phv4-wait)]/60 p-2.5">
          <p className="mb-1.5 text-[12px] font-bold text-[var(--phv4-wait)]">Belum dimulai</p>
          {row.suggestions.map((s) => (
            <p key={s.key} className="text-[12px] text-[#d1d5db]">
              {s.totalQty}× {s.note ? `• ${s.note}` : "Normal"} — {s.items.map((i) => `#${i.orderNo ?? i.ticketNo}`).join(", ")}
            </p>
          ))}
          {allowed ? (
            <button
              type="button"
              disabled={Boolean(busyKey)}
              onClick={() => void actions.startRow({ ...row, batches: [] })}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[6px] bg-[var(--phv4-red)] text-[13px] font-bold text-white hover:bg-[var(--phv4-red-hover)] disabled:opacity-50"
            >
              <PlayCircle className="size-4" /> Proses {row.suggestions.reduce((s, x) => s + x.totalQty, 0)} porsi
            </button>
          ) : null}
        </section>
      ) : null}

      <section>
        <p className="mb-1 text-[11px] font-bold uppercase text-[var(--phv4-muted)]">Order terkait</p>
        <div className="flex flex-wrap gap-1">
          {linkedOrders(row).map(({ ticketNo, orderNo }) => (
            <button key={ticketNo} type="button" onClick={() => onOpenTicket(ticketNo)} className="phv4-mono h-8 rounded-[5px] border border-[var(--phv4-border)] px-2 text-[11px] font-semibold hover:bg-white/5">
              #{orderNo ?? ticketNo}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function HistoryBatches({
  rows,
  menuById,
  canWrite,
  busyKey,
  onRecall,
  onOpenTicket,
}: {
  rows: ProductionBatchHistoryRow[];
  menuById: Map<string, MenuItem>;
  canWrite: boolean;
  busyKey: string | null;
  onRecall: (ticketNo: string) => Promise<boolean>;
  onOpenTicket: (ticketNo: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const hhmm = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : "—";
  if (!rows.length) return <p className="py-10 text-center text-[13px] text-[var(--phv4-muted)]">Belum ada batch hari ini.</p>;
  return (
    <ul className="space-y-1.5 p-1.5">
      {rows.map((b) => {
        const expanded = open === b.id;
        const tone =
          b.status === "completed" ? "text-[#86efac]" : b.status === "cancelled" ? "text-[#fca5a5]" : "text-[#93c5fd]";
        return (
          <li key={b.id} className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)]">
            <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : b.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left">
              <MenuThumb menu={b.menuItemId ? menuById.get(b.menuItemId) : undefined} station={b.station} size={36} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-bold">{b.itemLabel}</span>
                  {b.note ? <span className="truncate text-[12px] text-[#fde68a]">• {b.note}</span> : null}
                </span>
                <span className="phv4-mono block truncate text-[11px] text-[var(--phv4-muted)]">
                  {b.batchNo} · {hhmm(b.startedAt)}–{hhmm(b.completedAt)} · {b.completedByName ?? b.startedByName ?? ""}
                </span>
              </span>
              <span className="phv4-mono shrink-0 text-[13px] font-bold">
                {b.doneQty}/{b.totalQty}
              </span>
              <span className={`w-20 shrink-0 text-right text-[12px] font-bold ${tone}`}>
                {b.status === "completed" ? "Selesai" : b.status === "cancelled" ? "Dibatalkan" : "Berjalan"}
              </span>
              <ChevronRight className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
            {expanded ? (
              <ul className="space-y-1 border-t border-[var(--phv4-border)] px-3 py-2">
                {b.allocations.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-[12px]">
                    <span className="phv4-mono font-semibold">#{a.orderNo ?? a.ticketNo ?? "-"}</span>
                    <span className="text-[#d1d5db]">{tableText(a.table)}</span>
                    <span className="text-[var(--phv4-muted)]">
                      {a.qty}× · {a.allocatedAt ? `jadi ${hhmm(a.allocatedAt)}` : "belum jadi"} · order {TICKET_STATUS_ID[a.ticketStatus ?? ""] ?? "-"}
                    </span>
                    <span className="ml-auto flex gap-1">
                      {a.ticketNo && a.ticketStatus && ["queue", "cooking", "ready"].includes(a.ticketStatus) ? (
                        <button type="button" onClick={() => onOpenTicket(a.ticketNo as string)} className="h-8 rounded-[5px] border border-[var(--phv4-border)] px-2 font-semibold hover:bg-white/5">
                          Buka
                        </button>
                      ) : null}
                      {canWrite && a.ticketNo && a.ticketStatus === "ready" ? (
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => void onRecall(a.ticketNo as string)}
                          className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-[var(--phv4-border)] px-2 font-semibold hover:bg-white/5 disabled:opacity-50"
                          title="Recall: panggil ulang waiter untuk order yang sudah siap"
                        >
                          <RotateCcw className="size-3.5" /> Recall
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
                {!b.allocations.length ? <li className="text-[12px] text-[var(--phv4-muted)]">Tidak ada porsi (batch dibatalkan sebelum jadi).</li> : null}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
