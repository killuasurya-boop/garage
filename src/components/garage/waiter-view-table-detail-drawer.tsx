import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  History,
  Loader2,
  ReceiptText,
  UserPlus,
  X,
} from "lucide-react";

import type {
  ApiEnvelope,
  TableHistoryResponse,
  TableLiveRow,
} from "@/lib/garage-api-types";

import {
  billStatusTone,
  formatRupiah,
  hasAwaitingPaymentBill,
  isPaidOnly,
  relativeFromNow,
  type ToastInput,
} from "./waiter-view-helpers";

export function TableDetailDrawer({
  row,
  allTables,
  actingBillTable,
  actingCleanTable,
  actingSeatTable,
  canRequestBillRole,
  onClose,
  onClean,
  onMoved,
  onRequestBill,
  onSeatNew,
  onToast,
}: {
  row: TableLiveRow;
  allTables: TableLiveRow[];
  actingBillTable: string | null;
  actingCleanTable: string | null;
  actingSeatTable: string | null;
  canRequestBillRole: boolean;
  onClose: () => void;
  onClean: (row: TableLiveRow) => void;
  onMoved: () => void;
  onRequestBill: (row: TableLiveRow) => void;
  onSeatNew: (row: TableLiveRow) => void;
  onToast: (t: ToastInput) => void;
}) {
  const bills = useMemo(() => row.bills ?? [], [row.bills]);
  const paidTotal = bills
    .filter((b) => b.status === "paid")
    .reduce((sum, b) => sum + b.total, 0);
  const openTotal = bills
    .filter((b) => b.status !== "paid" && b.status !== "rejected")
    .reduce((sum, b) => sum + b.total, 0);

  const [history, setHistory] = useState<TableHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);

  const canMove = Boolean(row.currentOrderId) && (row.openBillCount ?? 0) > 0;
  const billAlreadyRequested = hasAwaitingPaymentBill(row);
  const canRequestBill =
    canRequestBillRole &&
    Boolean(row.currentOrderId) &&
    (row.status === "accepted" || row.status === "ready" || row.status === "mixed") &&
    !billAlreadyRequested;
  const canSeatNext = isPaidOnly(row);
  const canClean =
    row.needsCleaning ||
    row.status === "needs_cleaning" ||
    isPaidOnly(row) ||
    (!row.currentOrderId && row.status !== "empty");
  const moveCandidates = useMemo(
    () =>
      allTables.filter(
        (t) =>
          t.tableNumber !== row.tableNumber &&
          t.status === "empty" &&
          !t.currentOrderId &&
          (t.openBillCount ?? 0) === 0 &&
          (t.paidBillCount ?? 0) === 0 &&
          !t.needsCleaning,
      ),
    [allTables, row.tableNumber],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch history hari ini (lintas sesi). Pattern fetch-on-mount: setState
  // dipanggil di effect untuk loading + hasil. Aman karena dibungkus
  // cancelled-guard dan tidak loop.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryLoading(true);
    fetch(`/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/history`)
      .then((r) => r.json())
      .then((payload: ApiEnvelope<TableHistoryResponse>) => {
        if (cancelled) return;
        if (payload.error) {
          setHistory(null);
        } else {
          setHistory(payload.data ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setHistory(null);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.tableNumber]);

  const sessionBillIds = useMemo(() => new Set(bills.map((b) => b.id)), [bills]);
  const previousBills = useMemo(
    () => (history?.bills ?? []).filter((b) => !sessionBillIds.has(b.id)),
    [history, sessionBillIds],
  );

  const handleMove = useCallback(async () => {
    if (!moveTarget) return;
    setMoving(true);
    try {
      const res = await fetch(
        `/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: moveTarget }),
        },
      );
      const payload: ApiEnvelope<{ to: string }> = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) {
        throw new Error(payload.error?.message ?? "Gagal pindah meja.");
      }
      onToast({
        tone: "success",
        title: `Pindah ke Meja ${moveTarget}`,
        body: `Bill aktif sekarang di Meja ${moveTarget}.`,
        ttl: 2800,
      });
      onMoved();
    } catch (err) {
      onToast({
        tone: "error",
        title: "Gagal pindah meja",
        body: err instanceof Error ? err.message : "Coba lagi.",
      });
    } finally {
      setMoving(false);
    }
  }, [moveTarget, onMoved, onToast, row.tableNumber]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail meja ${row.tableLabel}`}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0e0e10] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)] sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden />
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-gradient-to-br from-[#1a1a1d] to-[#0e0e10] px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/55">Detail Sesi</p>
            <p className="text-lg font-bold text-white">{row.tableLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-md bg-white/[0.05] text-white/75 ring-1 ring-white/12 transition active:scale-[0.97]"
            aria-label="Tutup detail"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">

        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          <div className="rounded-lg bg-[#22c55e]/10 px-3 py-2 ring-1 ring-[#22c55e]/28">
            <p className="text-[10px] uppercase tracking-wider text-[#bbf7d0]/80">Terbayar</p>
            <p className="font-mono text-sm font-bold text-[#bbf7d0]">{formatRupiah(paidTotal)}</p>
            <p className="text-[10px] text-white/55">
              {row.paidBillCount ?? 0} bill lunas
            </p>
          </div>
          <div
            className={`rounded-lg px-3 py-2 ring-1 ${
              openTotal > 0
                ? "bg-[#e8883a]/10 ring-[#e8883a]/35"
                : "bg-white/[0.03] ring-white/12"
            }`}
          >
            <p
              className={`text-[10px] uppercase tracking-wider ${
                openTotal > 0 ? "text-[#ffd08a]" : "text-white/55"
              }`}
            >
              Open
            </p>
            <p
              className={`font-mono text-sm font-bold ${
                openTotal > 0 ? "text-[#ffd08a]" : "text-white/70"
              }`}
            >
              {formatRupiah(openTotal)}
            </p>
            <p className="text-[10px] text-white/55">
              {row.openBillCount ?? 0} bill aktif
            </p>
          </div>
        </div>

        <div className="border-t border-white/8 bg-[#15120c]/70 px-4 py-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#d0c5af]/70">
            Tindakan
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {canRequestBill ? (
              <button
                type="button"
                onClick={() => onRequestBill(row)}
                disabled={actingBillTable === row.tableNumber}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#fbbf24] px-3 text-[12px] font-black uppercase tracking-wide text-[#422006] transition active:scale-[0.97] disabled:opacity-60"
              >
                {actingBillTable === row.tableNumber ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ReceiptText size={14} />
                )}
                Minta Tagihan
              </button>
            ) : billAlreadyRequested ? (
              <div className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#fbbf24]/35 bg-[#fbbf24]/10 px-3 text-[12px] font-bold uppercase tracking-wide text-[#fde68a]">
                <ReceiptText size={14} />
                Tagihan ke Kasir
              </div>
            ) : null}

            {canClean ? (
              <button
                type="button"
                onClick={() => onClean(row)}
                disabled={actingCleanTable === row.tableNumber}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#22c55e] px-3 text-[12px] font-black uppercase tracking-wide text-[#052e16] transition active:scale-[0.97] disabled:opacity-60"
              >
                {actingCleanTable === row.tableNumber ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                Bersihkan
              </button>
            ) : null}

            {canSeatNext ? (
              <button
                type="button"
                onClick={() => onSeatNew(row)}
                disabled={actingSeatTable === row.tableNumber}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#e2e8f0] px-3 text-[12px] font-black uppercase tracking-wide text-[#0b0b0c] transition active:scale-[0.97] disabled:opacity-60"
              >
                {actingSeatTable === row.tableNumber ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <UserPlus size={14} />
                )}
                Tamu Baru
              </button>
            ) : null}
          </div>
        </div>

        {canMove ? (
          <div className="border-t border-white/8 bg-white/[0.02] px-4 py-2">
            {!moveMode ? (
              <button
                type="button"
                onClick={() => setMoveMode(true)}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-white/[0.05] text-[12px] font-semibold text-white/85 ring-1 ring-white/15 transition hover:bg-white/[0.1]"
              >
                <ArrowRightLeft size={14} /> Pindah ke meja lain
              </button>
            ) : (
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-wider text-white/55">
                  Pilih meja tujuan
                </label>
                <select
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value)}
                  className="h-9 w-full rounded-md bg-[#0b0b0c] px-2 text-[12px] text-white ring-1 ring-white/15 focus:outline-none focus:ring-[#d11a2a]/50"
                >
                  <option value="">- pilih meja -</option>
                  {moveCandidates.map((t) => (
                    <option key={t.tableNumber} value={t.tableNumber}>
                      Meja {t.tableNumber} ({t.status})
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMoveMode(false);
                      setMoveTarget("");
                    }}
                    className="h-9 rounded-md bg-white/[0.04] text-[11px] font-semibold uppercase tracking-wide text-white/70 ring-1 ring-white/12 transition hover:bg-white/[0.08]"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMove()}
                    disabled={!moveTarget || moving}
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-[#d11a2a] text-[11px] font-bold uppercase tracking-wide text-white transition active:scale-[0.97] disabled:opacity-50"
                  >
                    {moving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ArrowRightLeft size={12} />
                    )}
                    Pindahkan
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="px-4 pb-4">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-white/55">
            Bill Sesi Ini
          </p>
          {bills.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/12 bg-white/[0.02] px-3 py-6 text-center text-[12px] text-white/55">
              Belum ada bill di sesi ini.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {bills.map((bill) => {
                const tone = billStatusTone(bill.status);
                return (
                  <li
                    key={bill.id}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/8"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-white">
                        #{bill.orderNo}
                      </p>
                      <p className="text-[10px] text-white/55">
                        {relativeFromNow(bill.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${tone.cls}`}
                    >
                      {tone.label}
                    </span>
                    <span className="font-mono text-[12px] font-bold text-white">
                      {formatRupiah(bill.total)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 flex items-center gap-2">
            <History size={12} className="text-white/55" />
            <p className="text-[10px] uppercase tracking-wider text-white/55">
              Sesi sebelumnya hari ini
              {historyLoading ? " (loading...)" : ""}
            </p>
          </div>
          {!historyLoading && previousBills.length === 0 ? (
            <p className="mt-1 text-[11px] text-white/45">Tidak ada.</p>
          ) : null}
          {previousBills.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {previousBills.map((bill) => {
                const tone = billStatusTone(bill.status);
                return (
                  <li
                    key={bill.id}
                    className="flex items-center gap-2 rounded-md bg-white/[0.02] px-3 py-1.5 ring-1 ring-white/6"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-white/75">
                        #{bill.orderNo}
                        {bill.customerName ? (
                          <span className="ml-1 text-white/45">/ {bill.customerName}</span>
                        ) : null}
                      </p>
                      <p className="text-[9px] text-white/45">
                        {relativeFromNow(bill.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1 ${tone.cls}`}
                    >
                      {tone.label}
                    </span>
                    <span className="font-mono text-[11px] text-white/85">
                      {formatRupiah(bill.total)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}
