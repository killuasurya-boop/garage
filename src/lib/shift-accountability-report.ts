// =============================================================================
// Laporan Lengkap Aktivitas Kasir & Pertanggungjawaban Kas (owner, Okt 2026).
// Semua angka dari database + audit trail; definisi tiap angka ditulis di
// SHIFT_REPORT_DEFINITIONS dan dicetak di PDF. Tidak ada angka karangan: data
// yang belum tercatat ditandai di `dataGaps`.
// =============================================================================

import { and, asc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  approvals,
  auditLogs,
  cashMovements,
  cashSessions,
  menuItems,
  orderItems,
  orders,
  outlets,
  payments,
  user,
} from "@/db/schema";
import { sumDenominations } from "@/lib/cash-denominations";
import { getDrawerLedger, type CashSourceType } from "@/lib/cash-ledger";
import {
  listPettyCashEntries,
  listShiftIncidents,
  pettyCashBalance,
  pettyCashBalanceBefore,
  summarizePettyCash,
  type PettyCashEntryRow,
} from "@/lib/cashier-accountability";
import { getCashSessionTransactions } from "@/lib/garage-service";
import { channelGroupOf, CHANNEL_GROUP_LABEL, paymentStatusOf, PAYMENT_STATUS_LABEL } from "@/lib/payment-status";

// ── Definisi angka (dicetak di PDF) ─────────────────────────────────────────

export const SHIFT_REPORT_DEFINITIONS: Array<[string, string]> = [
  ["Penjualan bruto", "Σ subtotal item order LUNAS di shift (harga snapshot saat transaksi), sebelum diskon & biaya."],
  ["Penjualan bersih", "Σ total tagihan order LUNAS = bruto − diskon + biaya tambahan (service, pajak, ongkir)."],
  ["Pembayaran diterima", "Σ pembayaran berstatus captured yang masuk ke sesi kas ini (semua metode)."],
  ["Tagihan belum dibayar", "Σ sisa tagihan order Pending/sebagian yang dibuat di shift ini."],
  ["Kas diharapkan", "Kas awal + penerimaan tunai + kas masuk − kas keluar − refund/void tunai ± penyesuaian lain (dicatat sistem per kejadian)."],
  ["Selisih kas", "Kas aktual (hitungan pecahan saat tutup) − kas diharapkan. QRIS & transfer tidak masuk uang fisik."],
  ["Petty cash", "Dana kas kecil terpisah dari laci. Saldo akhir = saldo awal + penambahan disetujui − pengeluaran disetujui ± penyesuaian. Pengajuan belum diputuskan tidak mengubah saldo."],
];

// ── Util ────────────────────────────────────────────────────────────────────

export type PaymentGroup = "Tunai" | "QRIS" | "Transfer" | "Lainnya";

export function paymentGroupOf(method: string): PaymentGroup {
  const value = method.toLowerCase();
  if (/cash|tunai/.test(value)) return "Tunai";
  if (/qris/.test(value)) return "QRIS";
  if (/transfer|bank|bca|bni|bri|mandiri/.test(value)) return "Transfer";
  return "Lainnya";
}

/** Satuan jual default per kategori menu (pcs bila tidak dikenali). */
export function salesUnitForCategory(category: string | null | undefined) {
  const value = (category ?? "").toLowerCase();
  if (/coffee|kopi|non-coffee|minuman(?! botol)|tea|teh|latte/.test(value)) return "cup";
  if (/botol|mineral/.test(value)) return "botol";
  if (/rokok/.test(value)) return "bungkus";
  if (/makan|cemilan|snack|food|nasi|mie/.test(value)) return "porsi";
  return "pcs";
}

const VOID_STATUSES = new Set(["void", "voided"]);
const CANCELLED_STATUSES = new Set(["cancelled", "rejected"]);
const LIVE_PAYMENT = new Set(["captured", "paid", "settled", "success"]);

const minutesBetween = (start: string, end: string | null) =>
  Math.max(0, Math.round(((end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()) / 60_000));

// ── Bentuk data mentah (hasil DB) ───────────────────────────────────────────

export type RawOrder = {
  id: string;
  orderNo: string;
  status: string;
  subtotal: number;
  service: number;
  tax: number;
  discount: number;
  deliveryFee: number;
  total: number;
  tableLabel: string;
  channel: string;
  orderSource: string | null;
  fulfillment: string | null;
  customerName: string | null;
  customerNote: string | null;
  createdAt: string;
  cashierName: string | null;
};

export type RawItem = {
  orderId: string;
  itemName: string;
  variantLabel: string;
  category: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  note: string | null;
};

export type RawPayment = {
  id: string;
  orderId: string | null;
  method: string;
  amount: number;
  status: string;
  cashSessionId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export type RawMovement = {
  id: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  counterparty: string | null;
  referenceNo: string | null;
  orderNo: string | null;
  movementAt: string;
  createdByName: string | null;
  approvedByName: string | null;
  status: string;
  /** Setoran ke rekening: tujuan & kapan penerima mengonfirmasi (null = dalam perjalanan). */
  depositAccount: string | null;
  depositConfirmedAt: string | null;
};

export type RawApproval = {
  id: string;
  type: string;
  requester: string;
  amount: string;
  reason: string;
  status: string;
  decidedByName: string | null;
  decidedAt: string | null;
  reasonDecided: string | null;
  createdAt: string;
  payload: Record<string, unknown> | null;
};

export type RawAudit = {
  action: string;
  actor: string;
  object: string;
  status: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export type RawSession = {
  id: string;
  code: string;
  outletCode: string | null;
  outletName: string | null;
  status: string;
  businessDate: string;
  shiftNumber: number;
  cashierId: string | null;
  cashierName: string | null;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  openingDenominations: Record<string, number>;
  openingVerifiedByName: string | null;
  openingVerifiedAt: string | null;
  denominations: Record<string, number>;
  expectedCash: number;
  actualCash: number | null;
  discrepancy: number;
  discrepancyStatus: string;
  closingNote: string | null;
  checklist: Array<{ label: string; done: boolean }>;
  closedByName: string | null;
  managerSignOffByName: string | null;
  managerSignOffAt: string | null;
  reviewStatus: string;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  /** Alasan tutup darurat tanpa hitungan pecahan (null = dihitung per pecahan). */
  countSkippedReason: string | null;
  /** Hitung ulang pemeriksa (hitungan pertama kasir = actualCash, tidak ditimpa). */
  recountCash: number | null;
  recountDenominations: Record<string, number> | null;
  recountAt: string | null;
  discrepancyAcknowledged: boolean;
  reviewSelfVerified: boolean;
  floatLeft: number | null;
  depositAmount: number | null;
  qrisRecorded: number | null;
  qrisCounted: number | null;
  qrisDiscrepancy: number | null;
  /** true = kas laci dari buku kas (cash_ledger_entries); false = format lama. */
  ledgerMode: boolean;
};

export type HandoverPeer = {
  code: string;
  cashierName: string | null;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  floatLeft: number | null;
};

export type ShiftRaw = {
  session: RawSession;
  orders: RawOrder[];
  items: RawItem[];
  payments: RawPayment[];
  movements: RawMovement[];
  approvals: RawApproval[];
  audits: RawAudit[];
  pettyEntries: PettyCashEntryRow[];
  incidents: Awaited<ReturnType<typeof listShiftIncidents>>;
  previous: HandoverPeer | null;
  next: HandoverPeer | null;
  /** Buku kas laci shift (null = shift format lama). */
  ledger: Awaited<ReturnType<typeof getDrawerLedger>> | null;
};

// ── Agregasi murni ──────────────────────────────────────────────────────────

export function buildShiftAccountability(raw: ShiftRaw) {
  const { session } = raw;
  const sessionPayments = raw.payments.filter((payment) => payment.cashSessionId === session.id);
  const paymentsByOrder = new Map<string, RawPayment[]>();
  for (const payment of raw.payments) {
    if (!payment.orderId) continue;
    paymentsByOrder.set(payment.orderId, [...(paymentsByOrder.get(payment.orderId) ?? []), payment]);
  }
  const itemsByOrder = new Map<string, RawItem[]>();
  for (const item of raw.items) itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);

  // ── Transaksi ──
  const transactions = raw.orders
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((order, index) => {
      const orderPayments = paymentsByOrder.get(order.id) ?? [];
      const paidAmount = orderPayments
        .filter((payment) => LIVE_PAYMENT.has(payment.status))
        .reduce((sum, payment) => sum + payment.amount, 0);
      const payStatus = paymentStatusOf(order);
      const voided = VOID_STATUSES.has(order.status);
      const partial = payStatus === "pending" && paidAmount > 0 && paidAmount < order.total;
      const balanceDue = payStatus === "pending" && !voided ? Math.max(0, order.total - paidAmount) : 0;
      return {
        no: index + 1,
        ...order,
        channelLabel: CHANNEL_GROUP_LABEL[channelGroupOf(order)],
        items: itemsByOrder.get(order.id) ?? [],
        payments: orderPayments,
        paidAmount,
        balanceDue,
        paymentStatus: voided ? "Void" : partial ? "Sebagian" : PAYMENT_STATUS_LABEL[payStatus],
        extraCharges: order.service + order.tax + order.deliveryFee,
        methods: Array.from(new Set(orderPayments.filter((p) => LIVE_PAYMENT.has(p.status)).map((p) => p.method))).join(" + ") || "-",
        partial,
        voided,
        payStatus,
      };
    });

  const paidTx = transactions.filter((tx) => tx.payStatus === "paid");
  const sum = (list: number[]) => list.reduce((acc, value) => acc + value, 0);
  const itemsSold = sum(paidTx.flatMap((tx) => tx.items.map((item) => item.qty)));
  const netSales = sum(paidTx.map((tx) => tx.total));
  const paymentsReceived = sum(sessionPayments.filter((p) => LIVE_PAYMENT.has(p.status)).map((p) => p.amount));

  // Refund (penuh/sebagian) dari audit "Refund item" + order berstatus refunded.
  const refundLogs = raw.audits.filter((log) => /^Refund item/i.test(log.action));
  const refundTotal = sum(refundLogs.map((log) => Number(log.metadata?.refundAmount ?? 0)));

  const sales = {
    ordersCreated: transactions.length,
    ordersCompleted: transactions.filter((tx) => tx.status === "paid" || tx.status === "completed").length,
    paidCount: paidTx.length,
    partialCount: transactions.filter((tx) => tx.partial).length,
    pendingCount: transactions.filter((tx) => tx.payStatus === "pending" && !tx.partial && !tx.voided).length,
    cancelledCount: transactions.filter((tx) => CANCELLED_STATUSES.has(tx.status)).length,
    voidCount: transactions.filter((tx) => tx.voided).length,
    refundCount: refundLogs.length + transactions.filter((tx) => tx.status === "refunded" && !refundLogs.some((log) => log.metadata?.orderNo === tx.orderNo)).length,
    refundTotal,
    itemsSold,
    grossSales: sum(paidTx.map((tx) => tx.subtotal)),
    discountTotal: sum(paidTx.map((tx) => tx.discount)),
    extraCharges: sum(paidTx.map((tx) => tx.extraCharges)),
    netSales,
    unpaidTotal: sum(transactions.map((tx) => tx.balanceDue)),
    paymentsReceived,
    averageTicket: paidTx.length ? Math.round(netSales / paidTx.length) : 0,
  };

  // ── Metode pembayaran (pembayaran yang masuk sesi ini) ──
  const methodMap = new Map<string, { group: PaymentGroup; count: number; total: number }>();
  for (const payment of sessionPayments) {
    if (!LIVE_PAYMENT.has(payment.status)) continue;
    const current = methodMap.get(payment.method) ?? { group: paymentGroupOf(payment.method), count: 0, total: 0 };
    current.count += 1;
    current.total += payment.amount;
    methodMap.set(payment.method, current);
  }
  const methods = Array.from(methodMap, ([method, value]) => ({ method, ...value })).sort((a, b) => b.total - a.total);
  const groupTotal = (group: PaymentGroup) => sum(methods.filter((m) => m.group === group).map((m) => m.total));

  // ── Kas fisik ──
  // Penerimaan tunai = nominal awal pembayaran tunai yang masuk sesi (sebelum
  // dikurangi refund); refund/void tunai dihitung terpisah agar tidak ganda.
  const cashPayments = sessionPayments.filter((p) => paymentGroupOf(p.method) === "Tunai" && p.status !== "pending" && p.status !== "failed");
  const originalOf = (p: RawPayment) => Number(p.metadata?.originalAmount ?? p.amount) || 0;
  const recordedMovements = raw.movements.filter((m) => m.status === "recorded");
  const ledgerNet = (types: CashSourceType[]) =>
    (raw.ledger?.summary ?? []).filter((row) => types.includes(row.sourceType)).reduce((acc, row) => acc + row.net, 0);
  const ledgerOut = (types: CashSourceType[]) =>
    (raw.ledger?.summary ?? []).filter((row) => types.includes(row.sourceType)).reduce((acc, row) => acc + row.outflow, 0);
  const ledgerIn = (types: CashSourceType[]) =>
    (raw.ledger?.summary ?? []).filter((row) => types.includes(row.sourceType)).reduce((acc, row) => acc + row.inflow, 0);
  const reversalIn = ledgerIn(["drawer_reversal"]);
  const reversalOut = ledgerOut(["drawer_reversal"]);
  // Shift buku kas: semua komponen dari buku kas laci (sumber tunggal) — snapshot shift
  // tidak berubah oleh refund/void di shift lain. Format lama: rumus dari pembayaran.
  const ledgerCash = raw.ledger
    ? {
        openingBase: ledgerNet(["opening", "legacy_opening"]),
        cashSales: ledgerIn(["sale", "final_pay"]) - ledgerOut(["sale", "final_pay"]),
        cashIn: ledgerIn(["drawer_in"]) - reversalOut,
        cashOut: ledgerOut(["drawer_out"]) - reversalIn,
        cashRefundsVoids: ledgerOut(["refund", "void", "payment_revert"]) - ledgerIn(["refund", "void", "payment_revert"]),
        financeCashOut: -ledgerNet(["expense", "expense_cancel"]),
        methodCorrections: ledgerNet(["method_fix"]),
        balance: raw.ledger.balance,
      }
    : null;
  const cashSales = ledgerCash ? ledgerCash.cashSales : sum(cashPayments.map(originalOf));
  const cashStillHeld = sum(cashPayments.filter((p) => LIVE_PAYMENT.has(p.status)).map((p) => p.amount));
  const cashRefundsVoids = ledgerCash ? ledgerCash.cashRefundsVoids : Math.max(0, cashSales - cashStillHeld);
  // Hanya kas laci yang uangnya sudah bergerak; pengajuan/ditolak/dibatalkan tidak dihitung.
  const cashIn = ledgerCash ? ledgerCash.cashIn : sum(recordedMovements.filter((m) => m.type === "cash_in").map((m) => m.amount));
  const cashOut = ledgerCash ? ledgerCash.cashOut : sum(recordedMovements.filter((m) => m.type === "cash_out").map((m) => m.amount));
  const financeCashOut = ledgerCash?.financeCashOut ?? 0;
  const methodCorrections = ledgerCash?.methodCorrections ?? 0;
  const openingBase = ledgerCash ? ledgerCash.openingBase : session.openingCash;
  const formulaExpected = openingBase + cashSales + cashIn - cashOut - cashRefundsVoids - financeCashOut + methodCorrections;
  // Shift buku kas: kas seharusnya = saldo buku kas (open) / nilai saat tutup (closed).
  const expected = ledgerCash ? (session.status === "open" ? ledgerCash.balance : session.expectedCash) : session.expectedCash;
  const cash = {
    ledgerMode: Boolean(ledgerCash),
    openingCash: session.openingCash,
    openingCounted: sumCounts(session.openingDenominations),
    /** Saldo awal buku kas bila shift sudah berjalan saat buku kas aktif (selain modal). */
    legacyOpening: ledgerCash ? ledgerNet(["legacy_opening"]) : 0,
    cashSales,
    cashIn,
    cashOut,
    cashRefundsVoids,
    /** Biaya Finance yang dibayar dari laci shift ini (net pembatalan). */
    financeCashOut,
    /** Koreksi metode bayar (Cash ⇄ non-tunai) — + masuk laci, − keluar. */
    methodCorrections,
    // Format lama: selisih catatan sistem vs rumus (pengeluaran Finance tunai,
    // koreksi metode, pembatalan pelunasan). Shift buku kas: selalu 0.
    otherAdjustments: expected - formulaExpected,
    expected,
    actual: session.actualCash,
    variance: session.actualCash === null ? null : session.actualCash - expected,
    qris: groupTotal("QRIS"),
    transfer: groupTotal("Transfer"),
    otherNonCash: groupTotal("Lainnya"),
    nonCashTotal: groupTotal("QRIS") + groupTotal("Transfer") + groupTotal("Lainnya"),
    floatLeft: session.floatLeft,
    deposit: session.depositAmount,
    ledgerLines: raw.ledger?.lines ?? [],
  };

  // ── Produk terjual ──
  const productMap = new Map<string, { name: string; variant: string; category: string; unit: string; sold: number; cancelled: number; price: number; total: number }>();
  for (const tx of transactions) {
    const counted = tx.payStatus === "paid";
    const cancelled = tx.voided || tx.payStatus === "cancelled" || tx.payStatus === "refund";
    if (!counted && !cancelled) continue;
    for (const item of tx.items) {
      const key = `${item.itemName}\u0000${item.variantLabel}`;
      const row = productMap.get(key) ?? {
        name: item.itemName,
        variant: item.variantLabel,
        category: item.category ?? "-",
        unit: salesUnitForCategory(item.category),
        sold: 0,
        cancelled: 0,
        price: item.unitPrice,
        total: 0,
      };
      if (counted) {
        row.sold += item.qty;
        row.total += item.lineTotal;
      } else {
        row.cancelled += item.qty;
      }
      productMap.set(key, row);
    }
  }
  // Item yang di-refund sebagian (order tetap lunas) dari metadata audit refund.
  for (const log of refundLogs) {
    const items = Array.isArray(log.metadata?.items) ? (log.metadata?.items as Array<Record<string, unknown>>) : [];
    for (const item of items) {
      const name = String(item.itemName ?? item.name ?? "");
      const variant = String(item.variantLabel ?? item.variant ?? "");
      const row = productMap.get(`${name}\u0000${variant}`);
      if (row) row.cancelled += Number(item.qty ?? 0);
    }
  }
  const products = Array.from(productMap.values())
    .map((row) => ({ ...row, net: Math.max(0, row.sold - row.cancelled) }))
    .sort((a, b) => a.category.localeCompare(b.category) || b.sold - a.sold || a.name.localeCompare(b.name));

  // ── Void & pembatalan ──
  const statusLabel: Record<string, string> = { pending: "Diajukan", approved: "Disetujui", rejected: "Ditolak", cancelled: "Dibatalkan" };
  const voids = raw.approvals
    .filter((row) => row.id.startsWith("APP-VOID") || /void|batal/i.test(row.type))
    .map((row) => ({
      id: row.id,
      orderNo: String(row.payload?.orderNo ?? "-"),
      createdAt: row.createdAt,
      requester: row.requester,
      decidedByName: row.decidedByName,
      decidedAt: row.decidedAt,
      scope: Array.isArray(row.payload?.items) && (row.payload?.items as unknown[]).length ? "Void item" : "Void seluruh order",
      items: Array.isArray(row.payload?.items)
        ? (row.payload?.items as Array<Record<string, unknown>>)
            .map((item) => `${item.qty ?? 1}x ${item.itemName ?? ""}${item.variantLabel ? ` (${item.variantLabel})` : ""}`)
            .join(", ")
        : "-",
      amount: row.amount,
      reason: [row.payload?.reasonCode, row.reason].filter(Boolean).join(" · ") || "-",
      status: statusLabel[row.status] ?? row.status,
      decisionNote: row.reasonDecided,
      impact:
        row.status === "approved"
          ? "Order void · stok bahan dikembalikan · pembayaran dibatalkan"
          : row.status === "rejected"
            ? "Tidak ada perubahan (ditolak)"
            : "Menunggu keputusan — belum dihitung sebagai void",
    }));
  // Void langsung Owner/Manajer (tanpa approval) tetap muncul dari audit log.
  for (const log of raw.audits.filter((entry) => /^(Order dibatalkan|Hapus invoice)/i.test(entry.action))) {
    const orderNo = String(log.metadata?.orderNo ?? log.object ?? "-");
    if (voids.some((row) => row.orderNo === orderNo && row.status === "Disetujui")) continue;
    voids.push({
      id: "langsung",
      orderNo,
      createdAt: log.createdAt,
      requester: log.actor,
      decidedByName: log.actor,
      decidedAt: log.createdAt,
      scope: /Hapus invoice/i.test(log.action) ? "Hapus invoice (belum lunas)" : "Void seluruh order",
      items: "-",
      amount: String(log.metadata?.amount ?? "-"),
      reason: String(log.metadata?.reason ?? "-"),
      status: "Disetujui",
      decisionNote: null,
      impact: `Order void · stok bahan dikembalikan${Number(log.metadata?.cashOut ?? 0) ? ` · kas laci −${log.metadata?.cashOut}` : ""}`,
    });
  }

  // ── Refund, diskon, koreksi pembayaran ──
  const adjustments: Array<{ kind: string; orderNo: string; amount: number | null; detail: string; reason: string; by: string; approvedBy: string; at: string; status: string; impact: string }> = [];
  for (const row of raw.approvals.filter((a) => a.id.startsWith("APP-RFD") || a.id.startsWith("APP-DISC"))) {
    const refund = row.id.startsWith("APP-RFD");
    adjustments.push({
      kind: refund ? "Pengajuan refund" : "Pengajuan diskon manual",
      orderNo: String(row.payload?.orderNo ?? "-"),
      amount: Number(row.payload?.refundAmount ?? row.payload?.discountAmount ?? (Number(row.amount.replace(/\D/g, "")) || 0)) || null,
      detail: row.type,
      reason: row.reason || "-",
      by: row.requester,
      approvedBy: row.decidedByName ?? "-",
      at: row.createdAt,
      status: statusLabel[row.status] ?? row.status,
      impact: refund ? "Disetujui → penjualan & kas/metode asal berkurang" : "Disetujui → tagihan berkurang",
    });
  }
  for (const log of refundLogs) {
    const cashOut = Number(log.metadata?.cashOut ?? 0);
    adjustments.push({
      kind: Number(log.metadata?.nextTotal ?? 0) > 0 ? "Refund sebagian" : "Refund penuh",
      orderNo: String(log.metadata?.orderNo ?? log.object),
      amount: Number(log.metadata?.refundAmount ?? 0),
      detail: `Total ${log.metadata?.previousTotal ?? "-"} → ${log.metadata?.nextTotal ?? "-"}`,
      reason: String(log.metadata?.reason ?? "-"),
      by: log.actor,
      approvedBy: String(log.metadata?.approvedBy ?? "-"),
      at: log.createdAt,
      status: "Selesai",
      impact: cashOut > 0 ? `Penjualan turun · kas laci −${cashOut}` : "Penjualan turun · dikembalikan ke metode asal",
    });
  }
  for (const log of raw.audits.filter((entry) => entry.action === "Koreksi metode bayar")) {
    adjustments.push({
      kind: "Koreksi metode bayar",
      orderNo: String(log.metadata?.orderNo ?? "-"),
      amount: Number(log.metadata?.amount ?? 0),
      detail: `${log.metadata?.from ?? "?"} → ${log.metadata?.to ?? "?"}`,
      reason: String(log.metadata?.reason ?? "-"),
      by: log.actor,
      approvedBy: String(log.metadata?.approvedBy ?? "-"),
      at: log.createdAt,
      status: "Selesai",
      impact: Number(log.metadata?.cashDelta ?? 0) ? `Kas diharapkan ${Number(log.metadata?.cashDelta) > 0 ? "+" : ""}${log.metadata?.cashDelta}` : "Total tetap, metode berubah",
    });
  }
  for (const log of raw.audits.filter((entry) => /^(Batalkan pelunasan|Konfirmasi lunas)/i.test(entry.action))) {
    adjustments.push({
      kind: /batal/i.test(log.action) ? "Pembatalan pelunasan" : "Konfirmasi pelunasan",
      orderNo: String(log.metadata?.orderNo ?? "-"),
      amount: Number(log.metadata?.amount ?? log.metadata?.total ?? 0) || null,
      detail: log.action,
      reason: String(log.metadata?.reason ?? "-"),
      by: log.actor,
      approvedBy: log.actor,
      at: log.createdAt,
      status: "Selesai",
      impact: /batal/i.test(log.action) ? "Lunas → Pending · bukan refund" : "Pending → Lunas",
    });
  }
  for (const tx of transactions.filter((t) => t.discount > 0)) {
    const meta = tx.payments.find((p) => p.metadata)?.metadata ?? {};
    const manual = Number(meta.manualDiscount ?? 0);
    adjustments.push({
      kind: manual > 0 ? "Diskon manual" : "Diskon promo/voucher/poin",
      orderNo: tx.orderNo,
      amount: tx.discount,
      detail: [meta.voucherCode ? `Voucher ${meta.voucherCode}` : null, Number(meta.pointsDiscount ?? 0) ? `Poin ${meta.pointsDiscount}` : null, manual ? `Manual ${manual}` : null].filter(Boolean).join(" · ") || "Promo",
      reason: String(meta.manualDiscountReason ?? "-"),
      by: tx.cashierName ?? "-",
      approvedBy: "-",
      at: tx.createdAt,
      status: tx.paymentStatus,
      impact: "Mengurangi tagihan (bukan kas keluar)",
    });
  }
  for (const tx of transactions.filter((t) => t.payments.filter((p) => LIVE_PAYMENT.has(p.status)).length > 1)) {
    adjustments.push({
      kind: tx.partial ? "Pembayaran sebagian" : "Pembayaran terpisah (multi-metode)",
      orderNo: tx.orderNo,
      amount: tx.paidAmount,
      detail: tx.payments.filter((p) => LIVE_PAYMENT.has(p.status)).map((p) => `${p.method} ${p.amount}`).join(" + "),
      reason: "-",
      by: tx.cashierName ?? "-",
      approvedBy: "-",
      at: tx.createdAt,
      status: tx.paymentStatus,
      impact: tx.paidAmount > tx.total ? "PERIKSA: dibayar melebihi tagihan" : "-",
    });
  }
  adjustments.sort((a, b) => a.at.localeCompare(b.at));

  // ── Petty cash shift ──
  const petty = raw.pettyEntries;

  // ── Status & serah terima ──
  const reviewLabel: Record<string, string> = { pending: "Menunggu pemeriksaan Manajer", verified: "Diverifikasi Manajer", needs_followup: "Perlu tindak lanjut" };
  const shiftStatus =
    session.status === "open"
      ? "Berlangsung"
      : session.reviewStatus === "verified"
        ? `Diverifikasi${session.discrepancyAcknowledged ? " · selisih diakui" : ""}${session.reviewSelfVerified ? " · tanpa pemeriksa kedua" : ""}`
        : session.reviewStatus === "needs_followup"
          ? "Ditutup · perlu tindak lanjut"
          : "Ditutup · menunggu verifikasi";

  const dataGaps: string[] = [];
  if (!Object.keys(session.openingDenominations ?? {}).length) dataGaps.push("Hitungan pecahan modal awal tidak dicatat saat buka shift.");
  if (session.status === "closed" && !Object.keys(session.denominations ?? {}).length)
    dataGaps.push(
      session.countSkippedReason
        ? `Tutup darurat tanpa hitungan pecahan (disetujui Manajer): ${session.countSkippedReason}`
        : "Hitungan pecahan saat tutup tidak tersedia (kas aktual diketik manual).",
    );
  if (session.status === "open") dataGaps.push("Shift masih berlangsung — kas aktual & selisih belum ada.");
  if (!cash.ledgerMode) dataGaps.push("Shift format lama (sebelum buku kas) — kas diharapkan dari catatan sistem, bukan buku kas per transaksi.");
  if (cash.otherAdjustments !== 0) dataGaps.push("Kas diharapkan memuat penyesuaian di luar buku kas (pengeluaran Finance tunai / koreksi metode / pembatalan pelunasan) — lihat baris Penyesuaian lain.");

  return {
    session: {
      ...session,
      durationMinutes: minutesBetween(session.openedAt, session.closedAt),
      shiftStatus,
      reviewLabel: reviewLabel[session.reviewStatus] ?? session.reviewStatus,
    },
    sales,
    cash,
    methods,
    transactions,
    products,
    movements: raw.movements,
    petty,
    voids,
    adjustments,
    incidents: raw.incidents,
    handover: { previous: raw.previous, next: raw.next },
    dataGaps,
  };
}

function sumCounts(counts: Record<string, number> | null | undefined) {
  return Object.keys(counts ?? {}).length ? sumDenominations(counts ?? {}) : null;
}

export type ShiftAccountability = ReturnType<typeof buildShiftAccountability>;

// ── Pemuat DB ───────────────────────────────────────────────────────────────

const approverName = (column: unknown) => sql<string | null>`(select name from "user" where id = ${column})`;

export async function loadShiftRaw(sessionId: string): Promise<ShiftRaw | null> {
  const base = await getCashSessionTransactions(sessionId, "", { allowAll: true });
  if (!base) return null;
  const db = getDb();
  const [row] = await db
    .select({
      session: cashSessions,
      outletName: outlets.name,
      cashierName: user.name,
      closedByName: approverName(cashSessions.closedBy),
      signOffName: approverName(cashSessions.managerSignOffBy),
      reviewedByName: approverName(cashSessions.reviewedBy),
      openingVerifiedByName: approverName(cashSessions.openingVerifiedBy),
    })
    .from(cashSessions)
    .leftJoin(outlets, eq(outlets.id, cashSessions.outletId))
    .leftJoin(user, eq(user.id, cashSessions.openedBy))
    .where(eq(cashSessions.id, sessionId))
    .limit(1);
  if (!row) return null;
  const s = row.session;
  const orderIds = base.orders.map((order) => order.id);
  const orderNos = base.orders.map((order) => order.orderNo);

  const [orderRows, itemRows, paymentRows, movementRows, approvalRows, auditRows, pettyEntries, incidents, peers] = await Promise.all([
    orderIds.length
      ? db
          .select({
            id: orders.id,
            orderNo: orders.orderNo,
            status: orders.status,
            subtotal: orders.subtotal,
            service: orders.service,
            tax: orders.tax,
            discount: orders.discount,
            deliveryFee: orders.deliveryFee,
            total: orders.total,
            tableLabel: orders.tableLabel,
            channel: orders.channel,
            orderSource: orders.orderSource,
            fulfillment: orders.fulfillment,
            customerName: orders.customerName,
            customerNote: orders.customerNote,
            createdAt: orders.createdAt,
            cashierName: user.name,
          })
          .from(orders)
          .leftJoin(user, eq(user.id, orders.createdBy))
          .where(inArray(orders.id, orderIds))
      : Promise.resolve([]),
    orderIds.length
      ? db
          .select({
            orderId: orderItems.orderId,
            itemName: orderItems.itemName,
            variantLabel: orderItems.variantLabel,
            category: menuItems.category,
            qty: orderItems.qty,
            unitPrice: orderItems.unitPrice,
            lineTotal: orderItems.lineTotal,
            note: orderItems.note,
          })
          .from(orderItems)
          .leftJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
          .where(inArray(orderItems.orderId, orderIds))
      : Promise.resolve([]),
    db
      .select()
      .from(payments)
      .where(orderIds.length ? or(inArray(payments.orderId, orderIds), eq(payments.cashSessionId, sessionId)) : eq(payments.cashSessionId, sessionId))
      .orderBy(asc(payments.createdAt)),
    db
      .select({
        id: cashMovements.id,
        type: cashMovements.type,
        category: cashMovements.category,
        description: cashMovements.description,
        amount: cashMovements.amount,
        counterparty: cashMovements.counterparty,
        referenceNo: cashMovements.referenceNo,
        orderNo: cashMovements.orderNo,
        movementAt: cashMovements.movementAt,
        status: cashMovements.status,
        depositAccount: cashMovements.depositAccount,
        depositConfirmedAt: cashMovements.depositConfirmedAt,
        createdByName: user.name,
        approvedByName: approverName(cashMovements.approvedBy),
      })
      .from(cashMovements)
      .leftJoin(user, eq(user.id, cashMovements.createdBy))
      .where(eq(cashMovements.cashSessionId, sessionId))
      .orderBy(asc(cashMovements.movementAt)),
    db
      .select()
      .from(approvals)
      .where(
        or(
          orderIds.length ? inArray(sql<string>`${approvals.payload}->>'orderId'`, orderIds) : sql`false`,
          eq(sql<string>`${approvals.payload}->>'cashSessionId'`, sessionId),
        ),
      )
      .orderBy(asc(approvals.createdAt)),
    db
      .select()
      .from(auditLogs)
      .where(
        or(
          orderNos.length ? inArray(sql<string>`${auditLogs.metadata}->>'orderNo'`, orderNos) : sql`false`,
          eq(sql<string>`${auditLogs.metadata}->>'cashSessionId'`, sessionId),
        ),
      )
      .orderBy(asc(auditLogs.createdAt)),
    listPettyCashEntries({ outletId: null, cashSessionId: sessionId }),
    listShiftIncidents({ cashSessionIds: [sessionId] }),
    s.outletId
      ? db
          .select({
            code: cashSessions.code,
            cashierName: user.name,
            openedAt: cashSessions.openedAt,
            closedAt: cashSessions.closedAt,
            openingCash: cashSessions.openingCash,
            floatLeft: cashSessions.floatLeft,
          })
          .from(cashSessions)
          .leftJoin(user, eq(user.id, cashSessions.openedBy))
          .where(
            and(
              eq(cashSessions.outletId, s.outletId),
              or(lt(cashSessions.openedAt, s.openedAt), gt(cashSessions.openedAt, s.openedAt)),
            ),
          )
          .orderBy(asc(cashSessions.openedAt))
      : Promise.resolve([]),
  ]);

  const peerOf = (peer: (typeof peers)[number] | undefined): HandoverPeer | null =>
    peer
      ? {
          code: peer.code,
          cashierName: peer.cashierName ?? null,
          openedAt: peer.openedAt.toISOString(),
          closedAt: peer.closedAt?.toISOString() ?? null,
          openingCash: peer.openingCash,
          floatLeft: peer.floatLeft,
        }
      : null;
  const previous = [...peers].reverse().find((peer) => peer.openedAt < s.openedAt);
  const next = peers.find((peer) => peer.openedAt > s.openedAt);

  return {
    session: {
      id: s.id,
      code: s.code,
      outletCode: base.session.outletCode ?? null,
      outletName: row.outletName ?? null,
      status: s.status,
      businessDate: base.session.businessDate,
      shiftNumber: base.session.shiftNumber,
      cashierId: s.openedBy,
      cashierName: row.cashierName ?? null,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
      openingCash: s.openingCash,
      openingDenominations: s.openingDenominations ?? {},
      openingVerifiedByName: row.openingVerifiedByName ?? null,
      openingVerifiedAt: s.openingVerifiedAt?.toISOString() ?? null,
      denominations: s.denominations ?? {},
      expectedCash: s.expectedCash,
      ledgerMode: s.ledgerMode,
      actualCash: s.actualCash,
      discrepancy: s.discrepancy,
      discrepancyStatus: s.discrepancyStatus,
      closingNote: s.closingNote,
      checklist: s.checklist ?? [],
      closedByName: row.closedByName ?? null,
      managerSignOffByName: row.signOffName ?? null,
      managerSignOffAt: s.managerSignOffAt?.toISOString() ?? null,
      reviewStatus: s.reviewStatus,
      reviewNote: s.reviewNote,
      reviewedByName: row.reviewedByName ?? null,
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
      countSkippedReason: s.countSkippedReason,
      recountCash: s.recountCash,
      recountDenominations: s.recountDenominations ?? null,
      recountAt: s.recountAt?.toISOString() ?? null,
      discrepancyAcknowledged: s.discrepancyAcknowledged,
      reviewSelfVerified: s.reviewSelfVerified,
      floatLeft: s.floatLeft,
      depositAmount: s.depositAmount,
      qrisRecorded: s.qrisRecorded,
      qrisCounted: s.qrisCounted,
      qrisDiscrepancy: s.qrisDiscrepancy,
    },
    orders: orderRows.map((order) => ({
      ...order,
      deliveryFee: order.deliveryFee ?? 0,
      cashierName: order.cashierName ?? null,
      createdAt: order.createdAt.toISOString(),
    })),
    items: itemRows.map((item) => ({ ...item, orderId: item.orderId ?? "", category: item.category ?? null })),
    payments: paymentRows.map((payment) => ({
      id: payment.id,
      orderId: payment.orderId,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      cashSessionId: payment.cashSessionId,
      createdAt: payment.createdAt.toISOString(),
      metadata: (payment.metadata as Record<string, unknown> | null) ?? null,
    })),
    movements: movementRows.map((movement) => ({
      ...movement,
      movementAt: movement.movementAt.toISOString(),
      depositConfirmedAt: movement.depositConfirmedAt?.toISOString() ?? null,
      createdByName: movement.createdByName ?? null,
      approvedByName: movement.approvedByName ?? null,
    })),
    approvals: approvalRows.map((approval) => ({
      id: approval.id,
      type: approval.type,
      requester: approval.requester,
      amount: approval.amount,
      reason: approval.reason,
      status: approval.status,
      decidedByName: approval.decidedByName,
      decidedAt: approval.decidedAt?.toISOString() ?? null,
      reasonDecided: approval.reasonDecided,
      createdAt: approval.createdAt.toISOString(),
      payload: (approval.payload as Record<string, unknown> | null) ?? null,
    })),
    audits: auditRows.map((log) => ({
      action: log.action,
      actor: log.actor,
      object: log.object,
      status: log.status,
      createdAt: log.createdAt.toISOString(),
      metadata: log.metadata ?? null,
    })),
    pettyEntries,
    incidents,
    previous: peerOf(previous),
    next: peerOf(next),
    ledger: s.ledgerMode ? await getDrawerLedger(s.id) : null,
  };
}

export async function getShiftAccountability(sessionId: string) {
  const raw = await loadShiftRaw(sessionId);
  return raw ? buildShiftAccountability(raw) : null;
}

/** Shift kas satu tanggal operasional (tanggal buka shift, WIB) di satu outlet. */
export async function listSessionsForBusinessDate(params: { outletId: string; date: string; cashierId?: string | null }) {
  const start = new Date(`${params.date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const rows = await getDb()
    .select({
      id: cashSessions.id,
      code: cashSessions.code,
      status: cashSessions.status,
      openedBy: cashSessions.openedBy,
      openedAt: cashSessions.openedAt,
      cashierName: user.name,
    })
    .from(cashSessions)
    .leftJoin(user, eq(user.id, cashSessions.openedBy))
    .where(and(eq(cashSessions.outletId, params.outletId), sql`${cashSessions.openedAt} >= ${start}`, lt(cashSessions.openedAt, end)))
    .orderBy(asc(cashSessions.openedAt));
  // Nomor shift = urutan buka di outlet pada tanggal itu (sama seperti label shift).
  return rows
    .map((row, index) => ({ ...row, shiftNumber: index + 1, openedAt: row.openedAt.toISOString() }))
    .filter((row) => !params.cashierId || row.openedBy === params.cashierId);
}

/** Ringkasan petty cash outlet untuk satu tanggal operasional. */
export async function getPettyCashDay(outletId: string, date: string) {
  const from = new Date(`${date}T00:00:00+07:00`);
  const to = new Date(from.getTime() + 86_400_000);
  const [entries, openingBalance, closingBalance] = await Promise.all([
    listPettyCashEntries({ outletId, from, to }),
    pettyCashBalanceBefore(outletId, from),
    pettyCashBalance(outletId, to),
  ]);
  return summarizePettyCash(entries, openingBalance, closingBalance);
}
