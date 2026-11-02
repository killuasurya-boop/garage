"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer, ShoppingBag, Undo2, User, Utensils } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import type { ProductionTicketView } from "@/lib/garage-api-types";
import { COMPLETION_STATUS_LABEL, type CompletionPrintView } from "@/lib/production-completion-print-rules";
import type { ProductionHistoryOrder, ProductionHistoryTicket } from "@/lib/production-hub-history";
import { hubTableNumber, readyLabel } from "@/lib/production-hub-v4";

import { StationBadge } from "./hub-ui";
import { customerOf, tableText } from "./order-card";

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
          <p className="text-[11px] text-[var(--phv4-muted)]">{label}</p>
          <p className="phv4-mono text-[13px] font-bold">{hhmm(at)}</p>
          {by ? <p className="truncate text-[11px] text-[#d1d5db]" title={by}>{by}</p> : null}
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
  reopenBusy,
  onReopen,
}: {
  ticket: ProductionTicketView;
  siblings: ProductionTicketView[];
  jobs: CompletionPrintView[];
  canOperate: { Bar: boolean; Food: boolean };
  reopenBusy: boolean;
  onReopen: (ticketNo: string, reason: string) => Promise<boolean>;
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
  const pickup = hubTableNumber(ticket.table) === null;
  const boardTickets = siblings.length ? siblings : [ticket];
  const stations: ProductionHistoryTicket[] = detail?.tickets.length
    ? [...detail.tickets].sort((a, b) => (a.station === b.station ? 0 : a.station === "Bar" ? -1 : 1))
    : boardTickets.map(fromBoard);
  const prints = detail?.prints.length ? detail.prints : jobs;

  return (
    <div className="space-y-3">
      {/* Pemesan & order */}
      <section className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className={`truncate text-[20px] font-bold leading-6 ${who.customer ? "text-white" : "text-[var(--phv4-muted)]"}`}>
              {who.customer ?? who.fallback}
            </p>
            <p className="phv4-mono mt-0.5 truncate text-[13px] text-[#d1d5db]">
              #{ticket.orderNo ?? ticket.ticketNo}
              {ticket.queueNo ? ` · Antrian #${ticket.queueNo}` : ""}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 py-1 text-[15px] font-bold">
            {pickup ? <ShoppingBag className="size-4" aria-hidden /> : <Utensils className="size-4" aria-hidden />}
            {tableText(ticket.table)}
          </span>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] sm:grid-cols-4">
          {(
            [
              ["Kasir", detail?.cashierName ?? (loading ? "…" : "—")],
              ["Waiter", who.waiter ?? "—"],
              ["Sumber", SOURCE_LABEL[detail?.orderSource ?? ""] ?? detail?.orderSource ?? ticket.channel],
              ["Diterima", hhmm(detail?.acceptedAt ?? ticket.createdAt)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] text-[var(--phv4-muted)]">{label}</dt>
              <dd className="truncate font-semibold" title={String(value)}>
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

      {/* Per station */}
      {stations.map((st) => {
        const board = boardTickets.find((b) => b.ticketNo === st.ticketNo);
        const allowReopen = board && board.status === "ready" && canOperate[board.station] && !board.claimedByName;
        return (
          <section key={st.ticketNo} className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <StationBadge station={st.station} />
              <span className="text-[14px] font-bold">{board ? readyLabel(board) : TICKET_STATUS[st.status] ?? st.status}</span>
              <span className="phv4-mono ml-auto text-[11px] text-[var(--phv4-muted)]">
                {st.ticketNo} · target {st.targetMinutes} mnt
              </span>
            </div>
            <ul className="space-y-1">
              {st.items.map((item, i) => {
                const cancelled = item.status === "cancelled";
                return (
                  <li
                    key={`${st.ticketNo}-${i}`}
                    className={`rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2.5 py-1.5 ${cancelled ? "opacity-60" : ""}`}
                  >
                    <p className={`text-[15px] font-semibold ${cancelled ? "line-through" : ""}`}>
                      <span className="phv4-mono font-bold text-[var(--phv4-wait)]">{item.qty}×</span> {item.label}
                      {cancelled ? <span className="ml-2 text-[11px] font-bold text-[#fca5a5] no-underline">DIBATALKAN</span> : null}
                    </p>
                    {item.note ? <p className="text-[13px] font-semibold text-[#fde68a]">• {item.note}</p> : null}
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
