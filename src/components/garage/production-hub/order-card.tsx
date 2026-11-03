"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bike,
  Check,
  ChevronRight,
  Clock,
  Hand,
  Loader2,
  Play,
  ShoppingBag,
  Utensils,
} from "lucide-react";

import type { ProductionTicketView } from "@/lib/garage-api-types";
import { splitOrderIdentity } from "@/lib/garage-production-rules";
import { DEFAULT_SLA_CONFIG, slaStateOf, type SlaConfig } from "@/lib/production-sla";
import {
  elapsedSeconds,
  fitItems,
  formatElapsed,
  hubStatusOf,
  hubTableNumber,
  primaryActionOf,
  readyLabel,
  type HubAction,
} from "@/lib/production-hub-v4";

import { SLA_TEXT, STATUS_TONE, StationBadge, StatusChip } from "./hub-ui";

export type SiblingInfo = { station: "Bar" | "Food"; status: string } | null;

/**
 * Nama pemesan untuk layar produksi: nama tamu (tanpa meja/waiter), nama waiter
 * terpisah, dan pengganti "Antrian #12" / "Tanpa nama" bila tamu tidak diisi.
 */
export function customerOf(input: { identity: string | null; table: string; queueNo?: number | null }) {
  const { customer, waiter } = splitOrderIdentity(input.identity, input.table);
  return {
    customer,
    waiter,
    fallback: input.queueNo ? `Antrian #${input.queueNo}` : "Tanpa nama",
  };
}

/** Label meja ringkas: "Meja 08" / "Takeaway". */
export function tableText(table: string) {
  const n = hubTableNumber(table);
  if (n) return `Meja ${String(n).padStart(2, "0")}`;
  const t = table.trim();
  return /^take/i.test(t) || !t ? "Takeaway" : t;
}

const ACTION_STYLE: Record<HubAction, string> = {
  start: "bg-[var(--phv4-red)] hover:bg-[var(--phv4-red-hover)] text-white",
  finish: "bg-[#15803d] hover:bg-[var(--phv4-success)] text-white",
  call: "bg-[#15803d] hover:bg-[var(--phv4-success)] text-white",
  serve: "bg-[#15803d] hover:bg-[var(--phv4-success)] text-white",
  deliver_done: "bg-[var(--phv4-elev)] hover:bg-[#343840] text-white border border-[#86efac]/50",
};

const ACTION_ICON: Record<HubAction, typeof Play> = {
  start: Play,
  finish: Check,
  call: Bike,
  serve: Hand,
  deliver_done: Check,
};

/**
 * Kartu order berukuran tetap. Satu aksi utama per status; SELESAIKAN butuh
 * ketukan kedua (konfirmasi QC) supaya server menerima `qcConfirmed`.
 */
const QC_ARM_MS = 700;

export const OrderCard = memo(function OrderCard({
  ticket,
  now,
  maxLines,
  busy,
  canOperate,
  canHandover,
  sibling,
  slaCfg,
  busyExtraMinutes = 0,
  fixedHeight,
  onAction,
  onOpen,
  onInteract,
}: {
  ticket: ProductionTicketView;
  now: number;
  maxLines: number;
  busy: boolean;
  canOperate: boolean;
  canHandover: boolean;
  sibling: SiblingInfo;
  /** SLA v2: konfigurasi outlet & tambahan mode ramai station ini. */
  slaCfg?: SlaConfig;
  busyExtraMinutes?: number;
  fixedHeight: boolean;
  onAction: (ticket: ProductionTicketView, action: HubAction) => void;
  onOpen: (ticket: ProductionTicketView) => void;
  onInteract: (ticketNo: string, active: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const status = hubStatusOf(ticket);
  const pickupOrder = hubTableNumber(ticket.table) === null;
  const slaState = slaStateOf(ticket, now, slaCfg ?? DEFAULT_SLA_CONFIG, { busyExtraMinutes, pickup: pickupOrder });
  const sla = slaState.level;
  const primary = primaryActionOf(ticket);
  const tone = STATUS_TONE[status];
  const seconds = elapsedSeconds(ticket.createdAt, now, ticket.readyAt);
  const table = tableText(ticket.table);
  const pickup = pickupOrder;
  const who = customerOf(ticket);
  // Baris peringatan SLA memakai satu baris dari ruang item.
  const { visible, hidden } = fitItems(ticket.items, Math.max(1, maxLines - (slaState.message ? 1 : 0) - (ticket.pendingCancel ? 1 : 0)));
  const waitingBatch = status === "processing" && ticket.pendingBatchNos.length > 0;
  const critical = sla === "critical";
  const issue =
    ticket.issueReason && (ticket.status !== "ready" || ticket.issueReason.startsWith("Sebagian batal"))
      ? ticket.issueReason.startsWith("Sebagian batal")
        ? ticket.issueReason
        : `Dikembalikan: ${ticket.issueReason}`
      : null;

  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 5000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  // Kartu yang sedang disentuh/difokus/dikonfirmasi dikunci posisinya (lihat stabilizeOrder).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = hovered || focused || confirming;
  useEffect(() => {
    onInteract(ticket.ticketNo, active);
  }, [active, onInteract, ticket.ticketNo]);
  useEffect(() => () => onInteract(ticket.ticketNo, false), [onInteract, ticket.ticketNo]);

  const production = primary?.action === "start" || primary?.action === "finish";
  const allowed = production ? canOperate : canHandover;
  const pendingCancel = ticket.pendingCancel ?? null;
  const lockText = pendingCancel
    ? "Menunggu batal"
    : !allowed
    ? production
      ? `Hanya ${ticket.station === "Bar" ? "BAR" : "DAPUR"}`
      : "Menunggu helper"
    : waitingBatch
      ? `Batch ${ticket.pendingBatchNos.join(", ")}`
      : null;
  const ActionIcon = primary ? ACTION_ICON[primary.action] : Check;
  const label = confirming ? "QC OK · Selesaikan" : primary?.label;

  // Audit P1: dobel-ketuk cepat dulu langsung = "QC OK". Ketukan konfirmasi baru diterima
  // setelah jeda QC_ARM_MS supaya staf benar-benar melihat isi pesanan dulu.
  const armedAt = useRef(0);
  function press() {
    if (!primary || busy || lockText) return;
    if (primary.action === "finish" && !confirming) {
      armedAt.current = Date.now();
      setConfirming(true);
      return;
    }
    if (primary.action === "finish" && Date.now() - armedAt.current < QC_ARM_MS) return;
    setConfirming(false);
    onAction(ticket, primary.action);
  }

  return (
    <article
      data-ticket={ticket.ticketNo}
      aria-label={`Order ${ticket.orderNo ?? ticket.ticketNo} ${table} ${readyLabel(ticket)}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      className={`phv4-card @container flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-l-[3px] bg-[var(--phv4-card)] ${tone.bar} ${
        critical ? "phv4-critical border-[var(--phv4-critical)]" : "border-[var(--phv4-border)]"
      } ${fixedHeight ? "h-full" : ""}`}
    >
      <button
        type="button"
        onClick={() => onOpen(ticket)}
        className="flex min-w-0 flex-col gap-1 px-2.5 pt-2 text-left outline-none focus-visible:bg-white/5"
        aria-label={`Detail order ${ticket.orderNo ?? ticket.ticketNo}`}
      >
        {/* Baris 1: nomor order + timer (timer tidak pernah terpotong). */}
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="phv4-mono min-w-0 flex-1 truncate text-[16px] font-bold leading-5 text-white">
            #{ticket.orderNo ?? ticket.ticketNo}
          </span>
          <span className={`phv4-mono inline-flex shrink-0 items-center gap-1 text-[14px] font-bold ${SLA_TEXT[sla]}`}>
            <Clock className="size-3.5" aria-hidden />
            {formatElapsed(seconds)}
          </span>
        </div>
        {/* Baris 2: status + station + add-on, meja/takeaway mengisi sisa ruang. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <StatusChip status={status} label={readyLabel(ticket)} />
          <StationBadge station={ticket.station} responsive />
          {ticket.addonSequence > 1 ? (
            <span className="h-5 shrink-0 rounded-[5px] border border-[var(--phv4-wait)]/60 px-1 text-[11px] font-bold leading-[18px] text-[var(--phv4-wait)]">
              +{ticket.addonSequence}
            </span>
          ) : null}
          <span className="ml-auto inline-flex min-w-0 items-center gap-1 text-[12px] font-semibold text-[#e5e7eb]">
            {pickup ? <ShoppingBag className="size-3.5 shrink-0" aria-hidden /> : <Utensils className="size-3.5 shrink-0" aria-hidden />}
            <span className="truncate">{table}</span>
          </span>
        </div>
        {/* Baris 3: NAMA PEMESAN menonjol (bukan teks mentah "Meja · Tamu · Waiter"). */}
        <p className="flex min-w-0 items-baseline gap-1.5 leading-5">
          <span
            className={`min-w-0 truncate text-[15px] font-bold ${who.customer ? "text-white" : "text-[var(--phv4-muted)]"}`}
            title={who.customer ?? undefined}
          >
            {who.customer ?? who.fallback}
          </span>
          {who.waiter ? (
            <span className="min-w-0 shrink truncate text-[12px] text-[var(--phv4-muted)]">· {who.waiter}</span>
          ) : null}
          {sibling ? (
            <span className="ml-auto shrink-0 text-[12px] text-[#d1d5db]">
              {sibling.station === "Bar" ? "Bar" : "Dapur"}{" "}
              {sibling.status === "ready" || sibling.status === "delivered" ? "✓" : "…"}
            </span>
          ) : null}
        </p>
      </button>

      <ul className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden px-2.5">
        {visible.map((item) => (
          <li key={item.id} className="min-w-0">
            <p className="flex min-w-0 items-baseline gap-1.5 text-[14px] leading-[20px] text-white">
              <span className="phv4-mono shrink-0 font-bold text-[var(--phv4-wait)]">{item.qty}×</span>
              <span className={`min-w-0 truncate font-semibold ${item.status === "ready" ? "text-[#86efac]" : ""}`}>
                {item.label}
              </span>
              {item.batchNo ? (
                <span className="phv4-mono ml-auto shrink-0 text-[10px] text-[var(--phv4-muted)]">{item.batchNo}</span>
              ) : null}
            </p>
            {item.note ? (
              <p className="ml-6 truncate text-[12px] font-semibold leading-[18px] text-[#fde68a]">• {item.note}</p>
            ) : null}
          </li>
        ))}
        {hidden > 0 ? (
          <li>
            <button
              type="button"
              onClick={() => onOpen(ticket)}
              className="text-[12px] font-semibold leading-[18px] text-[#93c5fd] hover:underline"
            >
              +{hidden} item lainnya
            </button>
          </li>
        ) : null}
      </ul>

      {pendingCancel ? (
        <p
          role="alert"
          title={pendingCancel.summary}
          className="mx-2.5 mt-1 flex min-w-0 items-center gap-1 truncate rounded-[5px] bg-[var(--phv4-critical)]/20 px-1.5 py-0.5 text-[12px] font-bold text-[#fecaca]"
        >
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            Menunggu persetujuan batal {pendingCancel.kind === "order" ? "order" : "item"} — jangan dibuat dulu
          </span>
        </p>
      ) : null}
      {slaState.message ? (
        <p
          role={sla === "critical" ? "alert" : undefined}
          className={`mx-2.5 mt-1 flex min-w-0 items-center gap-1 truncate rounded-[5px] px-1.5 py-0.5 text-[12px] font-bold ${
            sla === "critical"
              ? "bg-[var(--phv4-critical)]/18 text-[#fecaca]"
              : "bg-[var(--phv4-wait)]/15 text-[var(--phv4-wait)]"
          }`}
        >
          <Clock className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {slaState.message}
            {busyExtraMinutes ? ` · ramai +${busyExtraMinutes}` : ""}
          </span>
        </p>
      ) : null}
      {issue ? (
        <p className="mx-2.5 mt-1 flex min-w-0 items-center gap-1 truncate rounded-[5px] bg-[var(--phv4-critical)]/15 px-1.5 py-0.5 text-[11px] font-semibold text-[#fecaca]">
          <AlertTriangle className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{issue}</span>
        </p>
      ) : null}

      <div className="flex shrink-0 items-center gap-1.5 p-2">
        {primary ? (
          <button
            type="button"
            onClick={press}
            disabled={busy || Boolean(lockText)}
            className={`flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[6px] px-2 text-[13px] font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
              confirming ? "bg-[var(--phv4-success)] text-[#052e16]" : ACTION_STYLE[primary.action]
            }`}
          >
            {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <ActionIcon className="size-4 shrink-0" aria-hidden />}
            <span className="truncate">{lockText ?? label}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onOpen(ticket)}
          aria-label="Detail & aksi lain"
          className="grid size-10 shrink-0 place-items-center rounded-[6px] border border-[var(--phv4-border)] text-[var(--phv4-muted)] hover:bg-white/5 hover:text-white"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </article>
  );
});
