"use client";

import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ArrowUpToLine,
  Bike,
  Check,
  ChevronRight,
  Clock,
  Hand,
  Loader2,
  Play,
  ShoppingBag,
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
import { jumboTable, queueLabel } from "@/lib/production-v7";

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
// Audit P2: jam 1 dtk dulu menggambar ulang SEMUA kartu. Kini hanya teks timer yang
// berdetak (satu ticker bersama untuk semua kartu); kartu lain memakai `now` kasar dari
// induk dan dibandingkan per nilai (sibling = objek baru tiap render induk).
let tickNow = Date.now();
const tickListeners = new Set<() => void>();
let tickTimer: number | null = null;
function subscribeTick(listener: () => void) {
  tickListeners.add(listener);
  if (tickTimer === null && typeof window !== "undefined") {
    tickTimer = window.setInterval(() => {
      tickNow = Date.now();
      tickListeners.forEach((fn) => fn());
    }, 1000);
  }
  return () => {
    tickListeners.delete(listener);
    if (!tickListeners.size && tickTimer !== null) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

function LiveElapsed({ createdAt, readyAt }: { createdAt: string; readyAt: string | null }) {
  const now = useSyncExternalStore(subscribeTick, () => tickNow, () => tickNow);
  return <>{formatElapsed(elapsedSeconds(createdAt, now, readyAt))}</>;
}

type OrderCardProps = {
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
  /** V7: posisi FIFO di antrean MENUNGGU station ini (1 = dikerjakan lebih dulu); null = bukan antrean menunggu. */
  position: number | null;
  /** Awalan posisi: "URUTAN" bila papan satu stasiun, "BAR"/"DAPUR" bila gabungan (urutan dihitung per stasiun). */
  positionLabel?: string;
  /** V7: kartu yang panel detailnya sedang terbuka. */
  selected: boolean;
  /** V7: baru masuk / baru pindah kolom → sorotan singkat sekali. */
  fresh?: boolean;
  onAction: (ticket: ProductionTicketView, action: HubAction) => void;
  onOpen: (ticket: ProductionTicketView) => void;
};

function sameCardProps(a: OrderCardProps, b: OrderCardProps) {
  for (const key of Object.keys(a) as Array<keyof OrderCardProps>) {
    if (key === "sibling") {
      if (a.sibling?.station !== b.sibling?.station || a.sibling?.status !== b.sibling?.status) return false;
    } else if (a[key] !== b[key]) return false;
  }
  return true;
}

const hhmmWib = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/**
 * Kartu pesanan V7. Seluruh kartu = tombol "buka detail" (tidak mengubah status apa pun); aksi produksi hanya lewat
 * tombol aksi yang eksplisit di bawah. Nomor meja jumbo, nomor antrean stabil, posisi FIFO, status berlabel + warna.
 * SELESAIKAN butuh ketukan kedua (konfirmasi QC) supaya server menerima `qcConfirmed`.
 */
/**
 * Alasan tombol aksi utama terkunci (null = boleh ditekan). Satu aturan untuk kartu dan
 * panel detail supaya keduanya tidak pernah berbeda.
 */
export function actionLockText(ticket: ProductionTicketView, can: { canOperate: boolean; canHandover: boolean }): string | null {
  const primary = primaryActionOf(ticket);
  const production = primary?.action === "start" || primary?.action === "finish";
  const allowed = production ? can.canOperate : can.canHandover;
  if (ticket.pendingCancel) return "Menunggu batal";
  if (!allowed) return production ? `Hanya ${ticket.station === "Bar" ? "BAR" : "DAPUR"}` : "Menunggu helper";
  if (hubStatusOf(ticket) === "processing" && ticket.pendingBatchNos.length > 0) return `Batch ${ticket.pendingBatchNos.join(", ")}`;
  return null;
}

export const QC_ARM_MS = 700;
export { ACTION_ICON, ACTION_STYLE };

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
  position,
  positionLabel = "URUTAN",
  selected,
  fresh = false,
  onAction,
  onOpen,
}: OrderCardProps) {
  const [confirming, setConfirming] = useState(false);
  const status = hubStatusOf(ticket);
  const pickupOrder = hubTableNumber(ticket.table) === null;
  const slaState = slaStateOf(ticket, now, slaCfg ?? DEFAULT_SLA_CONFIG, { busyExtraMinutes, pickup: pickupOrder });
  const sla = slaState.level;
  const primary = primaryActionOf(ticket);
  const tone = STATUS_TONE[status];
  const jumbo = jumboTable(ticket.table);
  const queue = queueLabel(ticket.queueNo);
  const who = customerOf(ticket);
  const totalQty = ticket.items.reduce((sum, item) => sum + item.qty, 0);
  const hasNotes = ticket.items.some((item) => item.note);
  const { visible, hidden } = fitItems(ticket.items, Math.max(1, maxLines));
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

  const pendingCancel = ticket.pendingCancel ?? null;
  const lockText = actionLockText(ticket, { canOperate, canHandover });
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

  const tableSpoken = jumbo.kind === "table" ? `Meja ${jumbo.value}` : jumbo.value;
  return (
    <article
      data-ticket={ticket.ticketNo}
      data-selected={selected ? "true" : undefined}
      data-status={status}
      aria-label={`Order ${ticket.orderNo ?? ticket.ticketNo} ${tableSpoken} ${readyLabel(ticket)}`}
      className={`phv4-card @container flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-l-[4px] bg-[var(--phv4-card)] ${tone.bar} ${
        critical ? "phv4-critical border-[var(--phv4-critical)]" : "border-[var(--phv4-border)]"
      } ${fresh ? "phv7-new" : ""}`}
    >
      {/* Seluruh kartu membuka detail. Tombol aksi di bawah berada DI ATAS lapisan ini, jadi ketukan pada aksi tidak
          pernah membuka detail dan ketukan pada kartu tidak pernah menjalankan aksi produksi. */}
      <button
        type="button"
        onClick={() => onOpen(ticket)}
        aria-label={`Lihat detail ${tableSpoken}, order ${ticket.orderNo ?? ticket.ticketNo}, ${readyLabel(ticket)}`}
        aria-pressed={selected}
        className="phv7-cover absolute inset-0 z-0 cursor-pointer rounded-[10px]"
      />

      <div className="pointer-events-none relative z-[1] flex min-w-0 flex-1 flex-col gap-1 px-3 pt-2.5">
        {/* Baris 1: nomor antrean + posisi FIFO + timer (timer tidak pernah terpotong). */}
        <div className="flex min-w-0 items-center gap-1.5">
          {queue ? (
            // Nomor antrean tidak pernah terpotong; kata "ANTREAN" hanya tampil bila kartu cukup lebar.
            <span className="phv4-mono shrink-0 text-[15px] font-bold leading-5 text-white" title={`Order ${ticket.orderNo ?? ticket.ticketNo}`}>
              <span className="hidden @[300px]:inline">ANTREAN </span>
              <span className="sr-only @[300px]:hidden">Antrean </span>
              {queue}
            </span>
          ) : (
            <span className="phv4-mono min-w-0 truncate text-[15px] font-bold leading-5 text-white">#{ticket.orderNo ?? ticket.ticketNo}</span>
          )}
          {position ? (
            <span className={`phv4-mono shrink-0 rounded-[5px] px-1.5 text-[12px] font-bold leading-5 ${position === 1 ? "bg-white text-[#090d12]" : "border border-[var(--phv4-border)] text-[var(--phv4-muted)]"}`}>
              {positionLabel} {String(position).padStart(2, "0")}
            </span>
          ) : null}
          <span className={`phv4-mono ml-auto inline-flex shrink-0 items-center gap-1 text-[15px] font-bold ${SLA_TEXT[sla]}`}>
            <Clock className="size-3.5" aria-hidden />
            <LiveElapsed createdAt={ticket.createdAt} readyAt={ticket.readyAt} />
          </span>
        </div>

        {/* Baris 2: NOMOR MEJA JUMBO + status. */}
        <div className="flex min-w-0 items-end gap-2">
          <p className="min-w-0 text-white">
            {jumbo.kind === "table" ? <span className="block text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--phv4-muted)]">Meja</span> : null}
            <span className="phv7-jumbo phv4-mono block truncate" data-kind={jumbo.kind}>
              {jumbo.kind === "pickup" ? (
                <span className="inline-flex items-center gap-2">
                  <ShoppingBag className="size-[0.8em] shrink-0" aria-hidden />
                  {jumbo.value}
                </span>
              ) : (
                jumbo.value
              )}
            </span>
          </p>
          <div className="mb-1 ml-auto flex shrink-0 flex-col items-end gap-1">
            <StatusChip status={status} label={readyLabel(ticket)} />
            <span className="flex items-center gap-1">
              {ticket.addonSequence > 1 ? (
                <span className="h-5 rounded-[5px] border border-[var(--phv4-wait)]/60 px-1 text-[12px] font-bold leading-[18px] text-[var(--phv4-wait)]" title="Pesanan tambahan di meja ini">
                  +{ticket.addonSequence}
                </span>
              ) : null}
              <StationBadge station={ticket.station} responsive />
            </span>
          </div>
        </div>

        {/* Baris 3: pemesan (hanya bila tercatat) + waktu masuk + jumlah item. */}
        <p className="flex min-w-0 items-baseline gap-1.5 text-[13px] leading-5">
          <span className={`min-w-0 font-bold ${who.customer ? "truncate text-white" : "shrink-0 text-[12px] text-[var(--phv4-muted)]"}`} title={who.customer ?? undefined}>
            {who.customer ?? "Nama tidak dicatat"}
          </span>
          {who.waiter ? <span className="min-w-0 shrink truncate text-[12px] text-[var(--phv4-muted)]">· {who.waiter}</span> : null}
          <span className="phv4-mono ml-auto shrink-0 text-[12px] text-[var(--phv4-muted)]">
            {hhmmWib(ticket.createdAt)} WIB · {totalQty} item
          </span>
        </p>

        {ticket.fifoOverride ? (
          <p className="flex min-w-0 items-center gap-1 truncate rounded-[5px] border border-white/40 px-1.5 py-0.5 text-[12px] font-bold text-white" title={ticket.fifoOverride.reason}>
            <ArrowUpToLine className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Didahulukan: {ticket.fifoOverride.reason}</span>
          </p>
        ) : null}
        {sibling ? (
          <p className="text-[12px] font-semibold text-[var(--phv4-muted)]">
            {sibling.station === "Bar" ? "Bar" : "Dapur"}:{" "}
            <span className={sibling.status === "ready" || sibling.status === "delivered" ? "text-[var(--phv4-success)]" : "text-[var(--phv4-wait)]"}>
              {sibling.status === "ready" || sibling.status === "delivered" ? "sudah siap" : "belum siap"}
            </span>
          </p>
        ) : null}

        <ul className="mt-0.5 flex min-h-0 flex-col gap-0.5">
          {visible.map((item) => (
            <li key={item.id} className="min-w-0">
              <p className="flex min-w-0 items-baseline gap-1.5 text-[15px] leading-[21px] text-white">
                <span className="phv4-mono shrink-0 font-bold text-[var(--phv4-wait)]">{item.qty}×</span>
                <span className={`min-w-0 break-words font-semibold ${item.status === "ready" ? "text-[var(--phv4-success)]" : ""}`}>
                  {item.label}
                  {item.status === "ready" ? <span className="ml-1 text-[12px] font-bold">✓ siap</span> : null}
                </span>
                {item.batchNo ? <span className="phv4-mono ml-auto shrink-0 rounded-[4px] border border-[var(--phv4-batch)]/60 px-1 text-[12px] font-bold text-[var(--phv4-batch)]">{item.batchNo}</span> : null}
              </p>
              {item.note ? <p className="ml-6 break-words text-[13px] font-bold leading-[18px] text-[#fde68a]">CATATAN: {item.note}</p> : null}
            </li>
          ))}
          {hidden > 0 ? <li className="text-[13px] font-bold leading-[20px] text-[#93c5fd]">+{hidden} item lainnya — ketuk untuk lihat semua</li> : null}
        </ul>
        {hasNotes && hidden > 0 ? (
          <p className="flex items-center gap-1 text-[12px] font-bold text-[#fde68a]">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> Ada catatan pesanan
          </p>
        ) : null}

        {pendingCancel ? (
          <p role="alert" title={pendingCancel.summary} className="flex min-w-0 items-center gap-1 rounded-[5px] bg-[var(--phv4-critical)]/20 px-1.5 py-0.5 text-[12px] font-bold text-[#fecaca]">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">Menunggu persetujuan batal {pendingCancel.kind === "order" ? "order" : "item"} — jangan dibuat dulu</span>
          </p>
        ) : null}
        {slaState.message ? (
          <p
            role={sla === "critical" ? "alert" : undefined}
            className={`flex min-w-0 items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[12px] font-bold ${
              sla === "critical" ? "bg-[var(--phv4-critical)]/20 text-[#fecaca]" : "bg-[var(--phv4-wait)]/15 text-[var(--phv4-wait)]"
            }`}
          >
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {sla === "critical" ? "TELAT · " : ""}
              {slaState.message}
              {busyExtraMinutes ? ` · ramai +${busyExtraMinutes}` : ""}
            </span>
          </p>
        ) : null}
        {issue ? (
          <p className="flex min-w-0 items-center gap-1 rounded-[5px] bg-[var(--phv4-critical)]/15 px-1.5 py-0.5 text-[12px] font-semibold text-[#fecaca]">
            <AlertTriangle className="size-3 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{issue}</span>
          </p>
        ) : null}
      </div>

      <div className="pointer-events-none relative z-[1] flex shrink-0 items-center gap-1.5 p-2.5">
        <span className="inline-flex h-11 shrink-0 items-center gap-1 rounded-[8px] border border-[var(--phv4-border)] px-2.5 text-[12px] font-bold uppercase tracking-wide text-[var(--phv4-muted)]">
          Detail <ChevronRight className="size-4" aria-hidden />
        </span>
        {primary ? (
          <button
            type="button"
            onClick={press}
            disabled={busy || Boolean(lockText)}
            className={`pointer-events-auto flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 text-[14px] font-bold uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-55 ${
              confirming ? "bg-[var(--phv4-success)] text-[#052e16]" : ACTION_STYLE[primary.action]
            }`}
          >
            {busy ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : <ActionIcon className="size-4 shrink-0" aria-hidden />}
            <span className="truncate">{lockText ?? label}</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}, sameCardProps);
