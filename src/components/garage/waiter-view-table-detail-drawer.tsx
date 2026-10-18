import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  History,
  Loader2,
  MessageCircle,
  NotebookPen,
  ReceiptText,
  RefreshCw,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import type {
  ApiEnvelope,
  TableHistoryResponse,
  TableLiveRow,
  TableOrderBill,
  TableOrderItemsResponse,
} from "@/lib/garage-api-types";
import { formatTableDuration } from "@/lib/garage-tables";
import { buildInvoiceWhatsappMessage, normalizeWaNumber, waLink } from "@/lib/whatsapp-link";

import {
  billStatusTone,
  formatRupiah,
  hasAwaitingPaymentBill,
  hasOpenBill,
  isCleaningTable,
  isDirtyTable,
  isPaidOnly,
  relativeFromNow,
  tableTone,
  type ToastInput,
} from "./waiter-view-helpers";
import { TablePlate } from "@/components/garage/table-plate";

// Status tiket produksi per station. Item mewarisi status station-nya (status
// per item tidak ada di data). null = order belum masuk dapur/bar.
function kitchenLabel(status: string | null) {
  if (!status) return "Belum masuk produksi";
  return (
    ({ queue: "Antre", cooking: "Diproses", ready: "Siap antar", delivered: "Diantar", completed: "Selesai" } as Record<string, string>)[status] ??
    status
  );
}
function kitchenTone(status: string | null) {
  if (status === "ready") return "bg-[#f5a742]/20 text-[#ffd08a] ring-[#f5a742]/45";
  if (status === "cooking") return "bg-[#f5a742]/10 text-[#ffd08a] ring-[#f5a742]/30";
  if (status === "queue") return "bg-[#d11a2a]/15 text-[#ffb3b3] ring-[#ff2a3a]/35";
  return "bg-white/[0.05] text-garage-dim ring-white/15";
}

type LifecycleAction = "clean" | "leave" | "start_cleaning" | "reserve" | "unreserve" | "release_hold";

type PendingConfirm =
  | { kind: "lifecycle"; action: LifecycleAction; title: string; body: string; cta: string }
  | { kind: "move"; to: string; title: string; body: string; cta: string };

// Hook kecil: GET JSON dengan status loading/error + reload. `reloadKey`
// berubah (total/bill/status meja berubah dari polling) → data diambil ulang.
function useTableFetch<T>(url: string, reloadKey: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Fetch-on-change: loading + hasil di-set dari effect, dijaga cancelled-guard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
        if (!res.ok || payload.error) {
          throw new Error(payload.error?.message ?? `Gagal memuat (${res.status}).`);
        }
        if (!cancelled) {
          setData(payload.data ?? null);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, reloadKey, attempt]);

  return { data, loading, error, reload: () => setAttempt((value) => value + 1) };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-garage-dim">{children}</p>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-[#ff2a3a]/40 bg-[#d11a2a]/10 px-3 py-2 text-[12px] text-[#ffb3b3]" role="alert">
      <span className="min-w-0">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 font-semibold text-white hover:bg-white/10"
      >
        <RefreshCw size={13} aria-hidden /> Coba lagi
      </button>
    </div>
  );
}

// Kirim invoice ke WA pelanggan (link wa.me, gratis). Nomor baru disimpan ke
// order supaya kasir & CRM ikut melihatnya.
function BillWhatsappShare({
  bill,
  tableLabel,
  onToast,
}: {
  bill: TableOrderBill;
  tableLabel: string;
  onToast: (t: ToastInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(bill.customerPhone ?? "");
  const [saving, setSaving] = useState(false);
  const valid = normalizeWaNumber(phone) !== "";

  async function send() {
    const link = waLink(
      phone,
      buildInvoiceWhatsappMessage({
        orderNo: bill.orderNo,
        tableLabel,
        total: bill.total,
        items: bill.items,
        invoiceUrl: bill.invoiceUrl ?? null,
      }),
    );
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    if (normalizeWaNumber(phone) !== normalizeWaNumber(bill.customerPhone)) {
      setSaving(true);
      try {
        const res = await fetch(`/api/orders/${bill.id}/customer-phone`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        if (!res.ok) throw new Error();
      } catch {
        onToast({ tone: "error", title: "Nomor WA belum tersimpan", body: "WhatsApp sudah terbuka, tapi nomor gagal disimpan ke order." });
      } finally {
        setSaving(false);
      }
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="waiter-bill-wa"
        className="garage-press mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-[#25d366]/12 px-3 text-[12px] font-bold text-[#8ff0b2] ring-1 ring-[#25d366]/40 hover:bg-[#25d366]/20"
      >
        <MessageCircle size={14} aria-hidden /> Kirim invoice WA
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-black/20 p-2 ring-1 ring-white/10">
      <input
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        inputMode="tel"
        placeholder="No. WA pelanggan (08xx)"
        aria-label="Nomor WhatsApp pelanggan"
        className="h-9 min-w-0 flex-1 rounded-md bg-white/[0.06] px-3 text-[13px] text-white ring-1 ring-white/12 placeholder:text-garage-dim focus:outline-none focus:ring-[#25d366]/60"
      />
      <button
        type="button"
        onClick={() => void send()}
        disabled={!valid || saving}
        className="garage-press inline-flex h-9 items-center gap-1.5 rounded-md bg-[#25d366] px-3 text-[12px] font-bold text-black disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} aria-hidden />} Buka WhatsApp
      </button>
      {!valid && phone.trim() ? <p className="w-full text-[11px] text-[#ffb3b3]">Nomor WA tidak valid (contoh 0812xxxxxxx).</p> : null}
    </div>
  );
}

export function TableDetailDrawer({
  row,
  allTables,
  actingBillTable,
  actingCleanTable,
  actingSeatTable,
  canRequestBillRole,
  onClose,
  onClean,
  onLifecycle,
  onMoved,
  onOrder,
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
  onLifecycle: (row: TableLiveRow, action: Exclude<LifecycleAction, "clean">) => void;
  onMoved: () => void;
  onOrder: (tableNumber: string) => void;
  onRequestBill: (row: TableLiveRow) => void;
  onSeatNew: (row: TableLiveRow) => void;
  onToast: (t: ToastInput) => void;
}) {
  const bills = useMemo(() => row.bills ?? [], [row.bills]);
  const paidTotal = bills.filter((b) => b.status === "paid").reduce((sum, b) => sum + b.total, 0);
  const openTotal = bills
    .filter((b) => b.status !== "paid" && b.status !== "rejected")
    .reduce((sum, b) => sum + b.total, 0);
  const tone = tableTone(row);

  // Data detail diambil ulang setiap kali ringkasan meja berubah (polling 6 dtk).
  const reloadKey = `${row.total}|${row.openBillCount ?? 0}|${row.paidBillCount ?? 0}|${row.lastStatusAt ?? ""}|${row.status}`;
  const items = useTableFetch<TableOrderItemsResponse>(
    `/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/items`,
    reloadKey,
  );
  const history = useTableFetch<TableHistoryResponse>(
    `/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/history`,
    reloadKey,
  );
  const itemBills: TableOrderBill[] = items.data?.bills ?? [];

  const [moveMode, setMoveMode] = useState(false);
  const [moving, setMoving] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const canMove = (row.openBillCount ?? 0) > 0 || bills.length > 0;
  const billAlreadyRequested = hasAwaitingPaymentBill(row);
  const canRequestBill =
    canRequestBillRole &&
    Boolean(row.currentOrderId) &&
    (row.status === "accepted" || row.status === "ready" || row.status === "mixed") &&
    !billAlreadyRequested;
  const canSeatNext = isPaidOnly(row);

  // Satu aksi siklus meja sesuai keadaan: Lunas → Perlu bersih → Dibersihkan →
  // Kosong, dan Kosong ↔ Dipesan. Aksi yang menutup sesi minta konfirmasi.
  const lifecycleAction: {
    action: LifecycleAction;
    label: string;
    cls: string;
    confirm?: { title: string; body: string; cta: string };
  } | null = isCleaningTable(row)
    ? { action: "clean", label: "Sudah bersih", cls: "bg-[#f4f4f5] text-[#0a0a0c] hover:bg-white" }
    : isDirtyTable(row)
      ? { action: "start_cleaning", label: "Mulai bersihkan", cls: "bg-[#f5a742] text-[#1a1000] hover:bg-[#ffb85c]" }
      : isPaidOnly(row)
        ? {
            action: "leave",
            label: "Tamu pergi",
            cls: "bg-[#d11a2a] text-white hover:bg-[#ff2a3a]",
            confirm: {
              title: `Tamu ${row.tableLabel} sudah pergi?`,
              body: "Meja ditandai perlu dibersihkan. Bill lunas tetap tersimpan di riwayat.",
              cta: "Ya, tamu pergi",
            },
          }
        : row.status === "held"
          ? {
              action: "release_hold",
              label: "Lepas kunci",
              cls: "bg-[#facc15] text-[#1a1400] hover:bg-[#fde047]",
              confirm: {
                title: `Lepas kunci ${row.tableLabel}?`,
                body: "Pelanggan sedang memilih meja ini di menu digital. Lepas bila pelanggan sudah pergi tanpa memesan.",
                cta: "Ya, lepas kunci",
              },
            }
        : row.status === "reserved"
          ? {
              action: "unreserve",
              label: "Batal reservasi",
              cls: "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/15",
              confirm: {
                title: `Batalkan reservasi ${row.tableLabel}?`,
                body: "Meja kembali kosong dan bisa dipakai tamu lain.",
                cta: "Ya, batalkan",
              },
            }
          : row.status === "empty" && !row.currentOrderId
            ? { action: "reserve", label: "Tandai dipesan", cls: "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/15" }
            : !row.currentOrderId && !hasOpenBill(row)
              ? {
                  action: "clean",
                  label: "Kosongkan meja",
                  cls: "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/15",
                  confirm: {
                    title: `Kosongkan ${row.tableLabel}?`,
                    body: "Sesi meja ditutup dan meja siap dipakai tamu baru.",
                    cta: "Ya, kosongkan",
                  },
                }
              : null;

  const moveCandidates = useMemo(
    () =>
      allTables.filter(
        (t) =>
          t.tableNumber !== row.tableNumber &&
          t.status === "empty" &&
          !t.currentOrderId &&
          (t.openBillCount ?? 0) === 0 &&
          (t.paidBillCount ?? 0) === 0 &&
          !t.needsCleaning &&
          t.active !== false,
      ),
    [allTables, row.tableNumber],
  );

  const confirmRef = useRef<PendingConfirm | null>(null);
  useEffect(() => {
    confirmRef.current = confirm;
  }, [confirm]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape menutup konfirmasi dulu, baru laci.
      if (confirmRef.current) setConfirm(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sessionBillIds = useMemo(() => new Set(bills.map((b) => b.id)), [bills]);
  const previousBills = useMemo(
    () => (history.data?.bills ?? []).filter((b) => !sessionBillIds.has(b.id)),
    [history.data, sessionBillIds],
  );

  const runLifecycle = useCallback(
    (action: LifecycleAction) => {
      if (action === "clean") onClean(row);
      else onLifecycle(row, action);
    },
    [onClean, onLifecycle, row],
  );

  const handleMove = useCallback(
    async (target: string) => {
      setMoving(true);
      try {
        const res = await fetch(`/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: target }),
        });
        const payload: ApiEnvelope<{ to: string }> = await res.json().catch(() => ({}));
        if (!res.ok || payload.error) {
          throw new Error(payload.error?.message ?? "Gagal pindah meja.");
        }
        onToast({
          tone: "success",
          title: `Pindah ke Meja ${target}`,
          body: `Semua bill & pesanan dapur/bar sekarang tercatat di Meja ${target}.`,
          ttl: 3200,
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
        setConfirm(null);
      }
    },
    [onMoved, onToast, row.tableNumber],
  );

  const actionButton =
    "garage-press inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-3 text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60";

  const drawer = (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail ${row.tableLabel}`}
    >
      <div
        className="relative flex max-h-[92svh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-garage-line bg-garage-bg-1 shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.85)] sm:max-h-[86svh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />
        <header className="flex items-start justify-between gap-3 border-b border-garage-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <TablePlate number={row.tableNumber} size="lg" />
            <div className="min-w-0">
            <h2 className="sr-only">{row.tableLabel}</h2>
            <span className={`inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[12px] font-bold ring-1 ring-white/10 ${tone.labelColor}`}>
              <span className={`size-2 rounded-full ${tone.dot}`} aria-hidden />
              {tone.label}
            </span>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-garage-dim">
              {row.area ? <span>{row.area}</span> : null}
              {row.capacity ? (
                <span className="inline-flex items-center gap-1">
                  <Users size={12} aria-hidden /> {row.capacity} kursi
                </span>
              ) : null}
              {row.currentOrderId && row.timerMinutes > 0 ? (
                <span>Duduk {formatTableDuration(row.timerMinutes)}</span>
              ) : null}
            </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-md bg-white/[0.05] text-white ring-1 ring-white/12 transition hover:bg-white/10"
            aria-label="Tutup detail meja"
          >
            <X size={18} />
          </button>
        </header>

        <div className="garage-scroll flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
          {row.staleFromPreviousDay ? (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-[#ff2a3a]/50 bg-[#d11a2a]/12 px-3 py-2.5 text-[13px] text-[#ffd6da]" role="alert">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Ada bill belum lunas dari <strong className="text-white">hari sebelumnya</strong>. Minta kasir
                cek: bayar atau batalkan, supaya meja bisa dipakai lagi.
              </span>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 px-4 py-3">
            <div className="rounded-lg bg-white/[0.05] px-3 py-2 ring-1 ring-[#d4d4d8]/30">
              <p className="text-[11px] font-semibold text-garage-dim">Lunas</p>
              <p className="font-mono text-base font-bold text-white">{formatRupiah(paidTotal)}</p>
              <p className="text-[11px] text-garage-dim">{row.paidBillCount ?? 0} bill</p>
            </div>
            <div
              className={`rounded-lg px-3 py-2 ring-1 ${
                openTotal > 0 ? "bg-[#f5a742]/10 ring-[#f5a742]/40" : "bg-white/[0.03] ring-white/12"
              }`}
            >
              <p className={`text-[11px] font-semibold ${openTotal > 0 ? "text-[#ffd08a]" : "text-garage-dim"}`}>
                Belum bayar
              </p>
              <p className={`font-mono text-base font-bold ${openTotal > 0 ? "text-[#ffd08a]" : "text-white"}`}>
                {formatRupiah(openTotal)}
              </p>
              <p className="text-[11px] text-garage-dim">{row.openBillCount ?? 0} bill</p>
            </div>
          </div>

          <div className="border-t border-garage-line px-4 py-3">
            <SectionTitle>Tindakan</SectionTitle>
            {confirm ? (
              <div className="rounded-lg border border-[#f5a742]/45 bg-[#f5a742]/10 p-3" role="alertdialog" aria-label={confirm.title}>
                <p className="text-[14px] font-bold text-white">{confirm.title}</p>
                <p className="mt-1 text-[12px] leading-5 text-garage-dim">{confirm.body}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    disabled={moving}
                    className={`${actionButton} bg-white/[0.06] text-white ring-1 ring-white/15 hover:bg-white/10`}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={moving}
                    onClick={() => {
                      if (confirm.kind === "move") {
                        void handleMove(confirm.to);
                      } else {
                        runLifecycle(confirm.action);
                        setConfirm(null);
                      }
                    }}
                    className={`${actionButton} bg-[#d11a2a] text-white hover:bg-[#ff2a3a]`}
                  >
                    {moving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    {confirm.cta}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onOrder(row.tableNumber)}
                  disabled={row.active === false}
                  className={`${actionButton} bg-[#d11a2a] text-white hover:bg-[#ff2a3a] sm:col-span-2`}
                >
                  <NotebookPen size={16} />
                  {row.currentOrderId ? "Tambah pesanan" : "Pesankan"}
                </button>

                {canRequestBill ? (
                  <button
                    type="button"
                    onClick={() => onRequestBill(row)}
                    disabled={actingBillTable === row.tableNumber}
                    className={`${actionButton} bg-[#f5a742] text-[#1a1000] hover:bg-[#ffb85c]`}
                  >
                    {actingBillTable === row.tableNumber ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <ReceiptText size={15} />
                    )}
                    Minta tagihan
                  </button>
                ) : billAlreadyRequested ? (
                  <div className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 px-3 text-[13px] font-semibold text-[#ffd08a]">
                    <ReceiptText size={15} />
                    Tagihan di kasir
                  </div>
                ) : null}

                {lifecycleAction ? (
                  <button
                    type="button"
                    onClick={() =>
                      lifecycleAction.confirm
                        ? setConfirm({ kind: "lifecycle", action: lifecycleAction.action, ...lifecycleAction.confirm })
                        : runLifecycle(lifecycleAction.action)
                    }
                    disabled={actingCleanTable === row.tableNumber}
                    className={`${actionButton} ${lifecycleAction.cls}`}
                  >
                    {actingCleanTable === row.tableNumber ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    {lifecycleAction.label}
                  </button>
                ) : null}

                {canSeatNext ? (
                  <button
                    type="button"
                    onClick={() => onSeatNew(row)}
                    disabled={actingSeatTable === row.tableNumber}
                    className={`${actionButton} bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/15`}
                  >
                    {actingSeatTable === row.tableNumber ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <UserPlus size={15} />
                    )}
                    Teman gabung
                  </button>
                ) : null}

                {canMove && !moveMode ? (
                  <button
                    type="button"
                    onClick={() => setMoveMode(true)}
                    className={`${actionButton} bg-white/[0.06] text-white ring-1 ring-white/15 hover:bg-white/10`}
                  >
                    <ArrowRightLeft size={15} /> Pindah meja
                  </button>
                ) : null}
              </div>
            )}

            {canMove && moveMode && !confirm ? (
              <div className="mt-3 rounded-lg border border-garage-line bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-white">Pindah ke meja kosong</p>
                  <button
                    type="button"
                    onClick={() => setMoveMode(false)}
                    className="min-h-11 rounded-md px-2 text-[12px] font-semibold text-garage-dim hover:text-white"
                  >
                    Batal
                  </button>
                </div>
                {moveCandidates.length === 0 ? (
                  <p className="text-[12px] text-garage-dim">Tidak ada meja kosong yang siap dipakai.</p>
                ) : (
                  <div className="grid grid-cols-5 gap-1.5">
                    {moveCandidates.map((t) => (
                      <button
                        key={t.tableNumber}
                        type="button"
                        onClick={() =>
                          setConfirm({
                            kind: "move",
                            to: t.tableNumber,
                            title: `Pindah ${row.tableLabel} → ${t.tableLabel}?`,
                            body: "Semua bill, pesanan dapur/bar, dan panggilan tamu ikut pindah ke meja baru.",
                            cta: "Ya, pindahkan",
                          })
                        }
                        className="min-h-11 rounded-md bg-garage-bg-2 font-mono text-[15px] font-bold text-white ring-1 ring-garage-line-2 transition hover:ring-white/50"
                        aria-label={`Pindah ke ${t.tableLabel}`}
                      >
                        {t.tableNumber}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="border-t border-garage-line px-4 py-3">
            <SectionTitle>Bill sesi ini</SectionTitle>
            {bills.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/12 px-3 py-5 text-center text-[13px] text-garage-dim">
                Belum ada bill di sesi ini.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {bills.map((bill) => {
                  const billTone = billStatusTone(bill.status);
                  return (
                    <li key={bill.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/8">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-white">#{bill.orderNo}</p>
                        <p className="text-[11px] text-garage-dim">{relativeFromNow(bill.createdAt)}</p>
                      </div>
                      <span className={`shrink-0 rounded-sm px-2 py-0.5 text-[11px] font-semibold ring-1 ${billTone.cls}`}>
                        {billTone.label}
                      </span>
                      <span className="shrink-0 font-mono text-[13px] font-bold text-white">{formatRupiah(bill.total)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-garage-line px-4 py-3">
            <SectionTitle>Rincian pesanan</SectionTitle>
            {items.loading && !items.data ? (
              <p className="flex items-center gap-2 text-[13px] text-garage-dim" role="status">
                <Loader2 size={14} className="animate-spin" /> Memuat pesanan…
              </p>
            ) : items.error ? (
              <InlineError message={items.error} onRetry={items.reload} />
            ) : itemBills.length === 0 ? (
              <p className="text-[13px] text-garage-dim">Belum ada item di sesi ini.</p>
            ) : (
              <ul className="space-y-2">
                {itemBills.map((bill) => (
                  <li key={bill.id} className="rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/8">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-white">#{bill.orderNo}</span>
                      <span className={`shrink-0 rounded-sm px-2 py-0.5 text-[11px] font-semibold ring-1 ${billStatusTone(bill.status).cls}`}>
                        {billStatusTone(bill.status).label}
                      </span>
                    </div>
                    {bill.customerNote ? (
                      <p className="mb-1 rounded bg-[#f5a742]/10 px-2 py-1 text-[12px] italic text-[#ffd08a] ring-1 ring-[#f5a742]/25">
                        Catatan: {bill.customerNote}
                      </p>
                    ) : null}
                    <div className="mb-1 flex flex-wrap gap-1">
                      {(["Dapur", "Bar"] as const).map((station) => {
                        const qty = bill.items
                          .filter((item) => item.station === station)
                          .reduce((sum, item) => sum + item.qty, 0);
                        if (!qty) return null;
                        const status = bill.stations.find((entry) => entry.station === station)?.status ?? null;
                        return (
                          <span key={station} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${kitchenTone(status)}`}>
                            {station} {qty} · {kitchenLabel(status)}
                          </span>
                        );
                      })}
                    </div>
                    <ul className="space-y-1">
                      {bill.items.map((item) => (
                        <li key={item.id} className="text-[13px]">
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 text-white/90">
                              <span className="font-mono font-semibold text-white">{item.qty}×</span> {item.itemName}
                              {item.variantLabel ? <span className="text-garage-dim"> · {item.variantLabel}</span> : null}
                            </span>
                            <span className="shrink-0 font-mono text-garage-dim">{formatRupiah(item.lineTotal)}</span>
                          </div>
                          {item.note ? <p className="pl-5 text-[12px] italic text-garage-dim">{item.note}</p> : null}
                        </li>
                      ))}
                    </ul>
                    {bill.status !== "rejected" ? (
                      <BillWhatsappShare bill={bill} tableLabel={items.data?.tableLabel ?? row.tableLabel} onToast={onToast} />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-garage-line px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <History size={13} className="text-garage-dim" aria-hidden />
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-garage-dim">Sesi sebelumnya hari ini</p>
            </div>
            {history.loading && !history.data ? (
              <p className="flex items-center gap-2 text-[13px] text-garage-dim" role="status">
                <Loader2 size={14} className="animate-spin" /> Memuat riwayat…
              </p>
            ) : history.error ? (
              <InlineError message={history.error} onRetry={history.reload} />
            ) : previousBills.length === 0 ? (
              <p className="text-[13px] text-garage-dim">Belum ada sesi lain hari ini.</p>
            ) : (
              <ul className="space-y-1">
                {previousBills.map((bill) => {
                  const billTone = billStatusTone(bill.status);
                  return (
                    <li key={bill.id} className="flex items-center gap-2 rounded-md bg-white/[0.02] px-3 py-1.5 ring-1 ring-white/6">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] text-white/85">
                          #{bill.orderNo}
                          {bill.customerName ? <span className="ml-1 text-garage-dim">· {bill.customerName}</span> : null}
                        </p>
                        <p className="text-[11px] text-garage-dim">{relativeFromNow(bill.createdAt)}</p>
                      </div>
                      <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${billTone.cls}`}>
                        {billTone.label}
                      </span>
                      <span className="shrink-0 font-mono text-[12px] text-white/85">{formatRupiah(bill.total)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Portal ke <body>: konten OS berada di stacking context `.garage-shell > *`
  // (z-index 1), sehingga laci di dalamnya tertutup tombol chat (z-40).
  return typeof document === "undefined" ? drawer : createPortal(drawer, document.body);
}
