// =============================================================================
// V4 Batch Produksi — aturan tampilan murni: baris batch per menu + varian
// (Auto Grouping), modifier, progress, order terkait, prioritas SLA, estimasi,
// ringkasan, dan rekap "Semua Menu". Kompatibilitas batch tetap ditentukan
// server (batchKeyFor: produk + varian + catatan); baris hanya mengelompokkan
// tampilan, aksi tetap per sub-batch yang kompatibel.
// =============================================================================

import type {
  ProductionBatchSuggestionView,
  ProductionBatchView,
  ProductionTicketView,
} from "@/lib/garage-api-types";

export type BatchRowStatus = "menunggu" | "proses" | "siap";

export type BatchRow = {
  key: string;
  station: "Bar" | "Food";
  menuItemId: string | null;
  label: string;
  totalQty: number;
  doneQty: number;
  modifiers: Array<{ label: string; qty: number }>;
  orders: string[];
  ticketNos: string[];
  status: BatchRowStatus;
  priority: boolean;
  oldestAt: string;
  startedAt: string | null;
  batches: ProductionBatchView[];
  suggestions: ProductionBatchSuggestionView[];
};

const NORMAL = "Normal";

function modifierOf(note: string | null | undefined) {
  const n = note?.trim();
  return n ? n : NORMAL;
}

function addModifier(map: Map<string, number>, note: string | null | undefined, qty: number) {
  const key = modifierOf(note);
  map.set(key, (map.get(key) ?? 0) + qty);
}

/**
 * Susun baris batch. `grouped` = Auto Grouping (satu baris per menu + varian,
 * modifier sebagai chip); tanpa grouping = satu baris per sub-batch kompatibel.
 */
export function buildBatchRows(
  batches: ProductionBatchView[],
  suggestions: ProductionBatchSuggestionView[],
  options: { grouped: boolean; lateTicketNos: Set<string> },
): BatchRow[] {
  const rows = new Map<string, BatchRow & { _mods: Map<string, number>; _orders: Set<string>; _tickets: Set<string> }>();
  const keyOf = (station: string, menuItemId: string | null, variantId: string | null, label: string, own: string) =>
    options.grouped ? `${station}|${menuItemId ?? label}|${variantId ?? ""}` : own;
  const ensure = (key: string, station: "Bar" | "Food", menuItemId: string | null, label: string, at: string) => {
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        station,
        menuItemId,
        label,
        totalQty: 0,
        doneQty: 0,
        modifiers: [],
        orders: [],
        ticketNos: [],
        status: "menunggu",
        priority: false,
        oldestAt: at,
        startedAt: null,
        batches: [],
        suggestions: [],
        _mods: new Map(),
        _orders: new Set(),
        _tickets: new Set(),
      };
      rows.set(key, row);
    }
    if (at < row.oldestAt) row.oldestAt = at;
    return row;
  };

  for (const batch of batches) {
    const row = ensure(
      keyOf(batch.station, batch.menuItemId, batch.variantId, batch.itemLabel, `b:${batch.id}`),
      batch.station,
      batch.menuItemId,
      batch.itemLabel,
      batch.startedAt,
    );
    row.batches.push(batch);
    row.totalQty += batch.totalQty;
    if (!row.startedAt || batch.startedAt < row.startedAt) row.startedAt = batch.startedAt;
    for (const a of batch.allocations) {
      if (a.allocated) row.doneQty += a.qty;
      addModifier(row._mods, a.note ?? batch.note, a.qty);
      if (a.orderNo) row._orders.add(a.orderNo);
      if (a.ticketNo) row._tickets.add(a.ticketNo);
    }
  }
  for (const s of suggestions) {
    const row = ensure(keyOf(s.station, s.menuItemId, s.variantId, s.itemLabel, `s:${s.key}`), s.station, s.menuItemId, s.itemLabel, s.oldestAt);
    row.suggestions.push(s);
    row.totalQty += s.totalQty;
    for (const i of s.items) {
      addModifier(row._mods, s.note, i.qty);
      if (i.orderNo) row._orders.add(i.orderNo);
      row._tickets.add(i.ticketNo);
    }
  }

  const out: BatchRow[] = [];
  for (const row of rows.values()) {
    const { _mods, _orders, _tickets, ...rest } = row;
    const modifiers = [..._mods.entries()]
      .map(([label, qty]) => ({ label, qty }))
      .sort((a, b) => (a.label === NORMAL ? -1 : b.label === NORMAL ? 1 : b.qty - a.qty));
    const ticketNos = [..._tickets];
    out.push({
      ...rest,
      modifiers,
      orders: [..._orders],
      ticketNos,
      priority: ticketNos.some((no) => options.lateTicketNos.has(no)),
      status:
        rest.totalQty > 0 && rest.doneQty >= rest.totalQty
          ? "siap"
          : rest.batches.length
            ? "proses"
            : "menunggu",
    });
  }
  // Prioritas SLA dulu, lalu yang sedang diproses, lalu menunggu terlama.
  const rank = (r: BatchRow) => (r.priority ? 0 : r.status === "proses" ? 1 : r.status === "menunggu" ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b) || a.oldestAt.localeCompare(b.oldestAt));
}

/** Estimasi menit sampai batch siap (rata-rata produksi station hari ini). */
export function estimateMinutes(row: Pick<BatchRow, "startedAt" | "status">, avgMinutes: number | null, now: number) {
  if (row.status === "siap") return 0;
  const avg = avgMinutes && avgMinutes > 0 ? avgMinutes : 8;
  if (!row.startedAt) return avg;
  const elapsed = (now - new Date(row.startedAt).getTime()) / 60000;
  return Math.max(1, Math.round(avg - elapsed));
}

/** Porsi berikutnya untuk "Selesaikan 1": order terlama yang belum selesai. */
export function nextAllocation(row: Pick<BatchRow, "batches">) {
  for (const batch of row.batches) {
    const next = batch.allocations.find((a) => !a.allocated);
    if (next) return { batch, allocation: next };
  }
  return null;
}

export function batchSummary(rows: BatchRow[], avgMinutes: number | null, now: number) {
  const active = rows.filter((r) => r.status !== "siap");
  return {
    totalBatch: rows.length,
    activeBatch: active.length,
    processing: rows.filter((r) => r.status === "proses").length,
    waiting: rows.filter((r) => r.status === "menunggu").length,
    done: rows.filter((r) => r.status === "siap").length,
    itemsInProgress: active.reduce((sum, r) => sum + (r.totalQty - r.doneQty), 0),
    totalQty: rows.reduce((sum, r) => sum + r.totalQty, 0),
    priority: rows.filter((r) => r.priority).length,
    etaMinutes: active.length ? Math.max(...active.map((r) => estimateMinutes(r, avgMinutes, now))) : 0,
  };
}

export type MenuTally = {
  label: string;
  waiting: number;
  processing: number;
  ready: number;
  orders: string[];
  modifiers: Array<{ label: string; qty: number }>;
};

/** Rekap "Semua Menu": semua porsi aktif per menu (termasuk yang tidak bisa di-batch). */
export function tallyMenus(tickets: ProductionTicketView[]): MenuTally[] {
  const map = new Map<string, MenuTally & { _mods: Map<string, number>; _orders: Set<string> }>();
  for (const t of tickets) {
    if (!["queue", "cooking", "ready"].includes(t.status)) continue;
    for (const item of t.items) {
      const row =
        map.get(item.label) ??
        { label: item.label, waiting: 0, processing: 0, ready: 0, orders: [], modifiers: [], _mods: new Map(), _orders: new Set() };
      if (item.status === "ready") row.ready += item.qty;
      else if (item.status === "processing") row.processing += item.qty;
      else row.waiting += item.qty;
      addModifier(row._mods, item.note, item.qty);
      row._orders.add(t.orderNo ?? t.ticketNo);
      map.set(item.label, row);
    }
  }
  return [...map.values()]
    .map(({ _mods, _orders, ...rest }) => ({
      ...rest,
      orders: [..._orders],
      modifiers: [..._mods.entries()].map(([label, qty]) => ({ label, qty })),
    }))
    .sort((a, b) => b.waiting + b.processing - (a.waiting + a.processing) || a.label.localeCompare(b.label));
}

/**
 * "Pesanan Akan Ready": order yang SEMUA porsi tersisanya ada di batch aktif
 * station ini — begitu batch selesai, order itu siap.
 */
export function ordersReadyAfterBatches(tickets: ProductionTicketView[], rows: BatchRow[]) {
  const inBatch = new Set(rows.flatMap((r) => r.batches.flatMap((b) => b.allocations.filter((a) => !a.allocated).map((a) => a.ticketNo))));
  return tickets
    .filter((t) => (t.status === "queue" || t.status === "cooking") && inBatch.has(t.ticketNo))
    .filter((t) => t.items.every((i) => i.status === "ready" || Boolean(i.batchId)))
    .map((t) => t.orderNo ?? t.ticketNo);
}
