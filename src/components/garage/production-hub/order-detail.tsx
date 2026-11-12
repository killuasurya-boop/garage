"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUpToLine, Check, Layers, Loader2, Printer, ShoppingBag, Undo2, User, WifiOff } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import type { ProductionTicketView } from "@/lib/garage-api-types";
import { COMPLETION_STATUS_LABEL, type CompletionPrintView } from "@/lib/production-completion-print-rules";
import type { ProductionHistoryOrder, ProductionHistoryTicket } from "@/lib/production-hub-history";
import { elapsedSeconds, formatElapsed, hubStatusOf, primaryActionOf, readyLabel, type HubAction } from "@/lib/production-hub-v4";
import { jumboTable, queueLabel, stationName, type OrderProgress } from "@/lib/production-v7";

import { CancelRequestPanel, type CancelRequestBody } from "./cancel-request";
import { StationBadge, StatusChip } from "./hub-ui";
import { ACTION_ICON, ACTION_STYLE, QC_ARM_MS, actionLockText, customerOf } from "./order-card";

const hhmm = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : "—";

const TICKET_STATUS: Record<string, string> = {
  queue: "Menunggu",
  cooking: "Diproses",
  ready: "Siap",
  delivered: "Selesai",
  cancelled: "Dibatalkan",
  canceled: "Dibatalkan",
  rejected: "Ditolak",
};

const ITEM_STATUS: Record<string, string> = { waiting: "Menunggu", processing: "Diproses", ready: "Siap" };

const SOURCE_LABEL: Record<string, string> = {
  pos: "Kasir (POS)",
  qr_table: "QR meja",
  qr_takeaway: "QR takeaway",
  waiter: "Waiter",
  instagram: "Instagram",
  campaign: "Campaign",
};

/** Bentuk tiket riwayat dari data papan (dipakai sebelum detail server termuat). */
function fromBoard(t: ProductionTicketView): ProductionHistoryTicket {
  return {
    ticketNo: t.ticketNo,
    station: t.station,
    status: t.status,
    createdAt: t.createdAt,
    acceptedAt: t.acceptedAt,
    acceptedByName: null,
    readyAt: t.readyAt,
    readyByName: null,
    handoverAt: t.handoverAt,
    handoverByName: t.handoverByName,
    deliveredAt: null,
    deliveredByName: null,
    claimedByName: t.claimedByName,
    issueReason: t.issueReason,
    targetMinutes: t.targetMinutes,
    chitPrintedAt: t.chitPrintedAt,
    items: t.items.map((i) => ({ label: i.label, qty: i.qty, note: i.note, status: i.status })),
  };
}

function Timeline({ ticket }: { ticket: ProductionHistoryTicket }) {
  const steps: Array<[string, string | null, string | null]> = [
    ["Masuk", ticket.createdAt, null],
    ["Mulai", ticket.acceptedAt, ticket.acceptedByName],
    ["Siap", ticket.readyAt, ticket.readyByName],
    ["Dipanggil", ticket.handoverAt, ticket.handoverByName],
    ["Selesai", ticket.deliveredAt, ticket.deliveredByName],
  ];
  return (
    <ol className="grid grid-cols-5 gap-1">
      {steps.map(([label, at, by]) => (
        <li
          key={label}
          className={`min-w-0 rounded-[6px] border px-1.5 py-1 ${at ? "border-[var(--phv4-border)] bg-[var(--phv4-bg)]" : "border-dashed border-[#2a2d33] opacity-55"}`}
        >
          <p className="text-[12px] text-[var(--phv4-muted)]">{label}</p>
          <p className="phv4-mono text-[13px] font-bold">{hhmm(at)}</p>
          {by ? <p className="truncate text-[12px] text-[#d1d5db]" title={by}>{by}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * Popup detail order (ketuk kartu): pemesan, meja, kasir & waiter, semua item per
 * station (Bar/Dapur) dengan varian & catatan, jejak waktu per tahap + siapa,
 * dan riwayat cetak (chit station & tiket SELESAI). Data papan tampil langsung;
 * nama petugas & kasir dilengkapi dari /api/production/history?orderId=…
 */
export function OrderDetail({
  ticket,
  siblings,
  jobs,
  canOperate,
  now,
  position,
  progress,
  gone,
  onOpenBatch,
  reopenBusy,
  onReopen,
  cancel,
}: {
  ticket: ProductionTicketView;
  siblings: ProductionTicketView[];
  jobs: CompletionPrintView[];
  canOperate: { Bar: boolean; Food: boolean };
  now: number;
  /** Urutan FIFO di stasiunnya (hanya tiket yang masih menunggu). */
  position: number | null;
  progress: OrderProgress;
  /** Tiket sudah tidak ada di papan aktif: tampilkan catatan terakhir, aksi mati. */
  gone: boolean;
  onOpenBatch: () => void;
  reopenBusy: boolean;
  onReopen: (ticketNo: string, reason: string) => Promise<boolean>;
  /** Ajukan batal (wajib disetujui Owner/Manajer). */
  cancel?: { canRequest: boolean; isManager: boolean; busy: boolean; onSubmit: (body: CancelRequestBody) => Promise<boolean> };
}) {
  const [detail, setDetail] = useState<ProductionHistoryOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [reopenFor, setReopenFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!ticket.orderId) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat detail order saat popup dibuka
    setLoading(true);
    garageApi
      .get<{ orders: ProductionHistoryOrder[] }>(`/api/production/history?orderId=${encodeURIComponent(ticket.orderId)}`, {
        cache: "no-store",
      })
      .then((data) => alive && setDetail(data.orders[0] ?? null))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ticket.orderId, ticket.status]);

  const who = customerOf(ticket);
  const jumbo = jumboTable(ticket.table);
  const queue = queueLabel(ticket.queueNo);
  const boardTickets = siblings.length ? siblings : [ticket];
  const stations: ProductionHistoryTicket[] = detail?.tickets.length
    ? [...detail.tickets].sort((a, b) => (a.station === b.station ? 0 : a.station === "Bar" ? -1 : 1))
    : boardTickets.map(fromBoard);
  const prints = detail?.prints.length ? detail.prints : jobs;
  const totalQty = ticket.items.reduce((sum, item) => sum + item.qty, 0);
  const waitedFor = formatElapsed(elapsedSeconds(ticket.createdAt, now, ticket.acceptedAt ?? (ticket.status === "queue" ? null : ticket.readyAt)));
  const producedFor = ticket.acceptedAt ? formatElapsed(elapsedSeconds(ticket.acceptedAt, now, ticket.readyAt)) : null;
  const readyFor = ticket.status === "ready" && ticket.readyAt ? formatElapsed(elapsedSeconds(ticket.readyAt, now)) : null;
  const facts: Array<[string, string]> = [
    ["Stasiun", stationName(ticket.station)],
    ["Jumlah", `${totalQty} porsi · ${ticket.items.length} jenis`],
    ["Masuk", `${hhmm(ticket.createdAt)} WIB`],
    [ticket.acceptedAt || ticket.status !== "queue" ? "Lama menunggu" : "Sudah menunggu", waitedFor],
    ...(producedFor ? ([[ticket.readyAt ? "Lama produksi" : "Sedang diproses", producedFor]] as Array<[string, string]>) : []),
    ...(readyFor ? ([["Siap sejak", readyFor]] as Array<[string, string]>) : []),
    ["Kasir", detail?.cashierName ?? (loading ? "…" : "—")],
    ["Waiter", who.waiter ?? "—"],
    ["Sumber", SOURCE_LABEL[detail?.orderSource ?? ""] ?? detail?.orderSource ?? ticket.channel],
  ];

  return (
    <div className="space-y-3">
      {gone ? (
        <p role="alert" className="flex items-start gap-2 rounded-[8px] border border-[var(--phv4-wait)] bg-[var(--phv4-wait)]/12 p-3 text-[14px] font-semibold text-[#fde68a]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Pesanan ini sudah tidak aktif di papan (selesai, dibatalkan, atau dipindahkan). Yang tampil adalah catatan terakhir — aksi dimatikan. Cek tab Riwayat untuk
            status akhirnya.
          </span>
        </p>
      ) : null}

      {/* Identitas pesanan */}
      <section className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
        <div className="flex items-stretch gap-3">
          <div className="flex min-w-[104px] shrink-0 flex-col items-center justify-center rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-3 py-2">
            {jumbo.kind === "table" ? (
              <>
                <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--phv4-muted)]">Meja</span>
                <span className="phv4-mono text-[56px] font-black leading-none text-white">{jumbo.value}</span>
              </>
            ) : (
              <>
                <ShoppingBag className="size-6 text-[var(--phv4-wait)]" aria-hidden />
                <span className="mt-1 text-[16px] font-black leading-tight tracking-wide text-white">{jumbo.value}</span>
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="phv4-mono flex flex-wrap items-center gap-x-2 text-[14px] font-bold text-white">
              <span>{queue ? `ANTREAN ${queue}` : `#${ticket.orderNo ?? ticket.ticketNo}`}</span>
              {position ? <span className="rounded bg-white/10 px-1.5 text-[13px]">URUTAN {String(position).padStart(2, "0")}</span> : null}
            </p>
            {queue ? <p className="phv4-mono truncate text-[12px] text-[var(--phv4-muted)]">Order #{ticket.orderNo ?? ticket.ticketNo}</p> : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusChip status={hubStatusOf(ticket)} label={readyLabel(ticket)} />
              <StationBadge station={ticket.station} />
              {ticket.addonSequence > 0 ? (
                <span className="rounded border border-[var(--phv4-border)] px-1.5 text-[12px] font-bold text-[var(--phv4-wait)]">TAMBAHAN {ticket.addonSequence}</span>
              ) : null}
            </div>
            <p className={`mt-1.5 break-words text-[16px] font-bold leading-5 ${who.customer ? "text-white" : "text-[var(--phv4-muted)]"}`}>
              {who.customer ?? "NAMA PELANGGAN TIDAK DICATAT"}
            </p>
          </div>
        </div>

        {ticket.fifoOverride ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-[6px] border border-[var(--phv4-batch)]/60 bg-[var(--phv4-batch)]/12 px-2 py-1.5 text-[13px] font-semibold text-[#e9d5ff]">
            <ArrowUpToLine className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              Didahulukan dari FIFO{ticket.fifoOverride.byName ? ` oleh ${ticket.fifoOverride.byName}` : ""} pukul {hhmm(ticket.fifoOverride.at)} — alasan:{" "}
              {ticket.fifoOverride.reason}
            </span>
          </p>
        ) : null}

        <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[12px] text-[var(--phv4-muted)]">{label}</dt>
              <dd className="break-words font-semibold" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {detail?.customerNote ? (
          <p className="mt-2 rounded-[6px] bg-[var(--phv4-wait)]/12 px-2 py-1 text-[13px] font-semibold text-[#fde68a]">
            Catatan pelanggan: {detail.customerNote}
          </p>
        ) : null}
      </section>

      {/* Progres terverifikasi: dihitung dari status porsi yang tersimpan, bukan perkiraan. */}
      <section aria-label="Progres pesanan" className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-bold">Progres pesanan</h3>
          <p className="phv4-mono text-[14px] font-bold">
            {progress.readyQty}/{progress.totalQty} porsi siap
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.totalQty}
          aria-valuenow={progress.readyQty}
          aria-label="Porsi siap"
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--phv4-bg)]"
        >
          <div className="h-full origin-left rounded-full bg-[var(--phv4-success)] transition-transform duration-200" style={{ transform: `scaleX(${progress.totalQty ? progress.readyQty / progress.totalQty : 0})` }} />
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {progress.stations.map((st, index) => (
            <li key={`${st.station}-${index}`} className="flex items-center gap-1.5">
              {st.status === "ready" ? <Check className="size-4 text-[var(--phv4-success)]" aria-hidden /> : null}
              <span className="font-semibold">{stationName(st.station)}</span>
              <span className="text-[var(--phv4-muted)]">
                {st.status === "ready" ? "siap" : `${st.readyQty}/${st.totalQty} siap · ${st.status === "queue" ? "menunggu" : "diproses"}`}
              </span>
            </li>
          ))}
        </ul>
        {progress.stations.length > 1 && progress.readyQty < progress.totalQty ? (
          <p className="mt-1.5 text-[12px] text-[var(--phv4-muted)]">Pesanan baru boleh dianggap siap bila Bar dan Dapur sama-sama siap.</p>
        ) : null}
        {ticket.pendingBatchNos.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[6px] border border-[var(--phv4-batch)]/60 bg-[var(--phv4-batch)]/12 px-2 py-1.5">
            <Layers className="size-4 shrink-0 text-[var(--phv4-batch)]" aria-hidden />
            <span className="min-w-0 flex-1 break-words text-[13px] font-semibold text-[#e9d5ff]">Ada porsi di batch {ticket.pendingBatchNos.join(", ")} — tiket ini selesai setelah batch selesai.</span>
            <button type="button" onClick={onOpenBatch} className="h-10 shrink-0 rounded-md border border-[var(--phv4-batch)] px-3 text-[13px] font-bold text-[#e9d5ff]">
              Buka Batch
            </button>
          </div>
        ) : null}
      </section>

      {/* Per station */}
      {stations.map((st) => {
        const board = boardTickets.find((b) => b.ticketNo === st.ticketNo);
        const allowReopen = !gone && board && board.status === "ready" && canOperate[board.station] && !board.claimedByName;
        const own = st.ticketNo === ticket.ticketNo;
        return (
          <section key={st.ticketNo} className={`rounded-[8px] border bg-[var(--phv4-card)] p-3 ${own ? "border-white/70" : "border-[var(--phv4-border)]"}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StationBadge station={st.station} />
              <span className="text-[14px] font-bold">{board ? readyLabel(board) : TICKET_STATUS[st.status] ?? st.status}</span>
              {own && stations.length > 1 ? <span className="rounded bg-white/10 px-1.5 text-[12px] font-bold">TIKET INI</span> : null}
              <span className="phv4-mono ml-auto text-[12px] text-[var(--phv4-muted)]">
                {st.ticketNo} · target {st.targetMinutes} mnt
              </span>
            </div>
            <ul className="space-y-1">
              {st.items.map((item, i) => {
                const cancelled = item.status === "cancelled";
                const live = board?.items.find((b) => b.label === item.label && b.qty === item.qty && b.note === item.note);
                const itemStatus = st.status === "ready" || st.status === "delivered" ? "ready" : live?.status ?? item.status;
                return (
                  <li
                    key={`${st.ticketNo}-${i}`}
                    className={`rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2.5 py-1.5 ${cancelled ? "opacity-60" : ""}`}
                  >
                    <p className={`text-[15px] font-semibold ${cancelled ? "line-through" : ""}`}>
                      <span className="phv4-mono font-bold text-[var(--phv4-wait)]">{item.qty}×</span> {item.label}
                      {cancelled ? <span className="ml-2 text-[12px] font-bold text-[#fca5a5] no-underline">DIBATALKAN</span> : null}
                    </p>
                    {!cancelled ? (
                      <p className="flex flex-wrap items-center gap-x-2 text-[12px] font-semibold text-[var(--phv4-muted)]">
                        <span className={itemStatus === "ready" ? "text-[var(--phv4-success)]" : ""}>
                          {itemStatus === "ready" ? "✓ " : ""}
                          {ITEM_STATUS[itemStatus] ?? itemStatus}
                        </span>
                        {live?.batchNo ? <span className="rounded bg-[var(--phv4-batch)]/20 px-1.5 text-[#e9d5ff]">Batch {live.batchNo}</span> : null}
                      </p>
                    ) : null}
                    {item.note ? <p className="break-words text-[13px] font-bold text-[#fde68a]">CATATAN: {item.note}</p> : null}
                  </li>
                );
              })}
            </ul>
            {st.issueReason ? <p className="mt-2 text-[12px] font-semibold text-[#fca5a5]">{st.issueReason}</p> : null}
            <div className="mt-2">
              <Timeline ticket={st} />
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[var(--phv4-muted)]">
              <Printer className="size-3.5" aria-hidden /> Chit station: {st.chitPrintedAt ? `tercetak ${hhmm(st.chitPrintedAt)}` : "belum dicetak"}
              {st.claimedByName ? (
                <span className="ml-2 inline-flex items-center gap-1">
                  <User className="size-3.5" aria-hidden /> diantar {st.claimedByName}
                </span>
              ) : null}
            </p>
            {allowReopen ? (
              reopenFor === st.ticketNo ? (
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Alasan (wajib, diaudit)"
                    aria-label="Alasan kembalikan ke proses"
                    className="h-10 min-w-0 flex-1 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[13px] outline-none focus:border-[var(--phv4-red)]"
                  />
                  <button
                    type="button"
                    disabled={reason.trim().length < 3 || reopenBusy}
                    onClick={async () => {
                      if (await onReopen(st.ticketNo, reason.trim())) {
                        setReopenFor(null);
                        setReason("");
                      }
                    }}
                    className="h-10 shrink-0 rounded-[6px] bg-[var(--phv4-red)] px-3 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    Kembalikan
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setReopenFor(st.ticketNo);
                    setReason("");
                  }}
                  className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-[6px] border border-[var(--phv4-border)] px-3 text-[13px] font-semibold hover:bg-white/5"
                >
                  <Undo2 className="size-4" /> Koreksi: kembalikan ke proses
                </button>
              )
            ) : null}
          </section>
        );
      })}

      {ticket.orderId && cancel && !gone ? (
        <CancelRequestPanel
          orderId={ticket.orderId}
          pending={ticket.pendingCancel ?? null}
          canRequest={cancel.canRequest}
          isManager={cancel.isManager}
          busy={cancel.busy}
          onSubmit={cancel.onSubmit}
        />
      ) : null}

      {/* Riwayat cetak tiket SELESAI */}
      <section className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold">
          <Printer className="size-4 text-[var(--phv4-muted)]" /> Tiket SELESAI
          {loading ? <Loader2 className="size-3.5 animate-spin text-[var(--phv4-muted)]" /> : null}
        </h3>
        {prints.length ? (
          <ul className="space-y-1 text-[13px]">
            {prints.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-2">
                <span className="font-semibold">{p.reprint ? `Cetak ulang ${p.payload.reprint?.sequence ?? ""}` : "Otomatis"}</span>
                <span>{COMPLETION_STATUS_LABEL[p.status]}</span>
                <span className="text-[var(--phv4-muted)]">
                  {p.attempts}x{p.printedAt ? ` · ${hhmm(p.printedAt)}` : ""}
                  {p.claimedBy ? ` · ${p.claimedBy}` : ""}
                </span>
                {p.payload.reprint?.reason ? <span className="text-[var(--phv4-muted)]">· {p.payload.reprint.reason}</span> : null}
                {p.error ? <span className="w-full text-[12px] text-[#fca5a5]">{p.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[var(--phv4-muted)]">Belum ada — tercetak saat semua item Bar & Dapur selesai.</p>
        )}
      </section>
    </div>
  );
}

/**
 * Footer panel detail (selalu terlihat): satu aksi utama yang sama dengan kartu, plus
 * "Dahulukan" untuk Owner/Manajer. Membuka panel TIDAK mengubah status — hanya tombol ini.
 */
export function OrderDetailFooter({
  ticket,
  canOperate,
  canHandover,
  gone,
  offline,
  busy,
  onAction,
  override,
}: {
  ticket: ProductionTicketView;
  canOperate: boolean;
  canHandover: boolean;
  gone: boolean;
  offline: boolean;
  busy: boolean;
  onAction: (ticket: ProductionTicketView, action: HubAction) => void;
  override: { can: boolean; onSet: (prioritize: boolean, reason: string) => Promise<boolean> };
}) {
  const [confirming, setConfirming] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const armedAt = useRef(0);
  const primary = primaryActionOf(ticket);
  const lockText = actionLockText(ticket, { canOperate, canHandover });
  const production = ticket.status === "queue" || ticket.status === "cooking";
  const prioritized = Boolean(ticket.fifoOverride);

  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 5000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  if (gone) {
    return <p className="text-center text-[13px] font-semibold text-[var(--phv4-muted)]">Aksi dimatikan — pesanan tidak lagi aktif di papan.</p>;
  }

  function press() {
    if (!primary || busy || lockText || offline) return;
    if (primary.action === "finish" && !confirming) {
      armedAt.current = Date.now();
      setConfirming(true);
      return;
    }
    if (primary.action === "finish" && Date.now() - armedAt.current < QC_ARM_MS) return;
    setConfirming(false);
    onAction(ticket, primary.action);
  }
  const ActionIcon = primary ? ACTION_ICON[primary.action] : Check;

  return (
    <div className="space-y-2">
      {offline ? (
        <p role="status" className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--phv4-sync)]">
          <WifiOff className="size-4 shrink-0" aria-hidden /> Offline — aksi belum bisa disimpan sampai tersambung lagi.
        </p>
      ) : null}
      {overrideOpen ? (
        <div className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] p-2">
          <label htmlFor="phv7-override-reason" className="text-[12px] font-semibold text-[var(--phv4-muted)]">
            {prioritized ? "Alasan mengembalikan ke urutan FIFO" : "Alasan mendahulukan pesanan ini"} (wajib, tercatat di audit)
          </label>
          <div className="mt-1 flex gap-1.5">
            <input
              id="phv7-override-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={200}
              autoComplete="off"
              placeholder="Contoh: pelanggan menunggu ulang…"
              className="h-11 min-w-0 flex-1 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] px-2 text-[14px] outline-none focus:border-white"
            />
            <button
              type="button"
              disabled={reason.trim().length < 3 || busy || offline}
              onClick={async () => {
                if (await override.onSet(!prioritized, reason.trim())) {
                  setOverrideOpen(false);
                  setReason("");
                }
              }}
              className="h-11 shrink-0 rounded-[6px] bg-[var(--phv4-red)] px-3 text-[13px] font-bold text-white disabled:opacity-50"
            >
              Simpan
            </button>
            <button type="button" onClick={() => setOverrideOpen(false)} className="h-11 shrink-0 rounded-[6px] border border-[var(--phv4-border)] px-3 text-[13px] font-semibold">
              Batal
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex gap-2">
        {override.can && production && !overrideOpen ? (
          <button
            type="button"
            onClick={() => {
              setReason("");
              setOverrideOpen(true);
            }}
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-[8px] border border-[var(--phv4-border)] px-3 text-[13px] font-bold hover:bg-white/5"
          >
            <ArrowUpToLine className="size-4" aria-hidden /> {prioritized ? "Kembalikan ke FIFO" : "Dahulukan"}
          </button>
        ) : null}
        {primary ? (
          <button
            type="button"
            onClick={press}
            disabled={busy || Boolean(lockText) || offline}
            className={`flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[8px] px-3 text-[15px] font-bold uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-55 ${
              confirming ? "bg-[var(--phv4-success)] text-[#052e16]" : ACTION_STYLE[primary.action]
            }`}
          >
            {busy ? <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden /> : <ActionIcon className="size-5 shrink-0" aria-hidden />}
            <span className="truncate">{lockText ?? (confirming ? "QC OK · Selesaikan" : primary.label)}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
