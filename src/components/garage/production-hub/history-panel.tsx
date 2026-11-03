"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import type { ProductionHistoryOrder, ProductionHistoryTicket } from "@/lib/production-hub-history";
import { COMPLETION_STATUS_LABEL } from "@/lib/production-completion-print-rules";

import { StationBadge } from "./hub-ui";
import { customerOf, tableText } from "./order-card";

type StatusFilter = "all" | "active" | "ready" | "delivered" | "cancelled";

const TICKET_STATUS: Record<string, string> = {
  queue: "Menunggu",
  cooking: "Proses",
  ready: "Siap",
  delivered: "Selesai",
  cancelled: "Batal",
  canceled: "Batal",
  rejected: "Ditolak",
};

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

const hhmm = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : null;

export function TicketTimeline({ ticket }: { ticket: ProductionHistoryTicket }) {
  const steps: Array<[string, string | null, string | null]> = [
    ["Masuk", ticket.createdAt, null],
    ["Mulai", ticket.acceptedAt, ticket.acceptedByName],
    ["Siap", ticket.readyAt, ticket.readyByName],
    ["Dipanggil", ticket.handoverAt, ticket.handoverByName],
    ["Selesai", ticket.deliveredAt, ticket.deliveredByName],
  ];
  return (
    <ol className="grid grid-cols-5 gap-1 text-[12px]">
      {steps.map(([label, at, by]) => (
        <li key={label} className={`rounded-[5px] border px-1 py-1 ${at ? "border-[var(--phv4-border)]" : "border-dashed border-[#2a2d33] opacity-60"}`}>
          <p className="text-[var(--phv4-muted)]">{label}</p>
          <p className="phv4-mono font-bold">{hhmm(at) ?? "—"}</p>
          {by ? <p className="truncate text-[var(--phv4-muted)]">{by}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/** Riwayat tanpa pindah halaman: cari order/meja/nama, filter tanggal & status. */
export function HistoryPanel({
  canWrite,
  refreshKey,
  onReprint,
  onReopen,
}: {
  canWrite: boolean;
  refreshKey: number;
  onReprint: (orderId: string, reason: string) => Promise<boolean>;
  onReopen: (ticketNo: string, reason: string) => Promise<boolean>;
}) {
  const [q, setQ] = useState("");
  const [date, setDate] = useState(todayJakarta);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [orders, setOrders] = useState<ProductionHistoryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<{ kind: "reprint" | "reopen"; target: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date, status });
      if (q.trim()) params.set("q", q.trim());
      const data = await garageApi.get<{ orders: ProductionHistoryOrder[] }>(`/api/production/history?${params}`, {
        cache: "no-store",
      });
      setOrders(data.orders);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat riwayat.");
    } finally {
      setLoading(false);
    }
  }, [date, status, q]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
  }, [load, refreshKey]);

  async function submit() {
    if (!mode || reason.trim().length < 3) return;
    const ok =
      mode.kind === "reprint" ? await onReprint(mode.target, reason.trim()) : await onReopen(mode.target, reason.trim());
    if (ok) {
      setMode(null);
      setReason("");
      void load();
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <label className="flex h-9 items-center gap-1.5 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2">
          <Search className="size-3.5 text-[var(--phv4-muted)]" aria-hidden />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="No. order / meja / nama"
            aria-label="Cari riwayat"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
        <input
          type="date"
          value={date}
          max={todayJakarta()}
          onChange={(event) => setDate(event.target.value || todayJakarta())}
          aria-label="Tanggal"
          className="h-9 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[13px] [color-scheme:dark]"
        />
      </div>
      <div className="garage-scroll-x flex gap-1 overflow-x-auto">
        {(
          [
            ["all", "Semua"],
            ["active", "Diproses"],
            ["ready", "Siap"],
            ["delivered", "Selesai"],
            ["cancelled", "Batal"],
          ] as Array<[StatusFilter, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={`h-8 shrink-0 rounded-[6px] px-2.5 text-[12px] font-semibold ${
              status === value ? "bg-[var(--phv4-elev)] text-white" : "text-[var(--phv4-muted)] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? <p className="text-[12px] text-[#fca5a5]">{error}</p> : null}
      {loading && !orders.length ? (
        <p className="flex items-center gap-2 py-6 text-[12px] text-[var(--phv4-muted)]">
          <Loader2 className="size-3.5 animate-spin" /> Memuat riwayat…
        </p>
      ) : null}
      {!loading && !orders.length && !error ? (
        <p className="py-6 text-center text-[12px] text-[var(--phv4-muted)]">Tidak ada order untuk filter ini.</p>
      ) : null}
      <ul className="space-y-1.5">
        {orders.map((order) => {
          const expanded = open === order.key;
          const statuses = [...new Set(order.tickets.map((t) => TICKET_STATUS[t.status] ?? t.status))];
          return (
            <li key={order.key} className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)]">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : order.key)}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="phv4-mono text-[13px] font-bold">#{order.orderNo ?? order.tickets[0]?.ticketNo}</span>
                    <span className="truncate text-[12px] text-[#e5e7eb]">{tableText(order.table)}</span>
                  </span>
                  <span className="block truncate text-[12px] text-[var(--phv4-muted)]">
                    {hhmm(order.createdAt)} · {customerOf({ identity: order.customerName, table: order.table }).customer ?? "Tanpa nama"} · {statuses.join(" / ")}
                    {order.prints.length
                      ? ` · Cetak: ${COMPLETION_STATUS_LABEL[order.prints[order.prints.length - 1].status]}`
                      : ""}
                  </span>
                </span>
                <ChevronDown className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded ? (
                <div className="space-y-2 border-t border-[var(--phv4-border)] px-2.5 py-2">
                  {order.tickets.map((ticket) => (
                    <div key={ticket.ticketNo} className="space-y-1">
                      <div className="flex items-center gap-1.5 text-[12px]">
                        <StationBadge station={ticket.station} />
                        <span className="phv4-mono text-[var(--phv4-muted)]">{ticket.ticketNo}</span>
                        <span className="ml-auto font-semibold">{TICKET_STATUS[ticket.status] ?? ticket.status}</span>
                      </div>
                      <ul className="text-[12px]">
                        {ticket.items.map((item, index) => (
                          <li key={`${ticket.ticketNo}-${index}`}>
                            <span className="phv4-mono font-bold text-[var(--phv4-wait)]">{item.qty}×</span> {item.label}
                            {item.note ? <span className="text-[#fde68a]"> • {item.note}</span> : null}
                          </li>
                        ))}
                      </ul>
                      <TicketTimeline ticket={ticket} />
                      {ticket.issueReason ? (
                        <p className="text-[12px] text-[#fca5a5]">Catatan koreksi: {ticket.issueReason}</p>
                      ) : null}
                      {canWrite && ticket.status === "ready" && !ticket.claimedByName ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMode({ kind: "reopen", target: ticket.ticketNo });
                            setReason("");
                          }}
                          className="h-8 rounded-[6px] border border-[var(--phv4-border)] px-2.5 text-[12px] font-semibold"
                        >
                          Koreksi: kembalikan ke proses…
                        </button>
                      ) : null}
                      {mode?.kind === "reopen" && mode.target === ticket.ticketNo ? (
                        <ReasonRow value={reason} onChange={setReason} onSubmit={submit} label="Kembalikan" />
                      ) : null}
                    </div>
                  ))}
                  <div className="space-y-1 border-t border-[var(--phv4-border)] pt-2">
                    <p className="text-[12px] font-bold uppercase text-[var(--phv4-muted)]">Riwayat cetak SELESAI</p>
                    {order.prints.length ? (
                      order.prints.map((p) => (
                        <p key={p.id} className="text-[12px]">
                          {p.reprint ? `Ulang ${p.payload.reprint?.sequence ?? ""}` : "Otomatis"} ·{" "}
                          <b>{COMPLETION_STATUS_LABEL[p.status]}</b> · {p.attempts}x
                          {p.printedAt ? ` · ${hhmm(p.printedAt)}` : ""}
                          {p.payload.reprint?.reason ? ` · ${p.payload.reprint.reason}` : ""}
                        </p>
                      ))
                    ) : (
                      <p className="text-[12px] text-[var(--phv4-muted)]">Belum ada (order belum selesai semua station).</p>
                    )}
                    {canWrite && order.orderId && order.prints.some((p) => p.status === "printed" || p.status === "failed") ? (
                      mode?.kind === "reprint" && mode.target === order.orderId ? (
                        <ReasonRow value={reason} onChange={setReason} onSubmit={submit} label="Cetak ulang" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setMode({ kind: "reprint", target: order.orderId as string });
                            setReason("");
                          }}
                          className="h-8 rounded-[6px] border border-[var(--phv4-border)] px-2.5 text-[12px] font-semibold"
                        >
                          Cetak ulang tiket selesai…
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReasonRow({
  value,
  onChange,
  onSubmit,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  label: string;
}) {
  return (
    <div className="flex gap-1.5">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Alasan (wajib, tercatat di audit)"
        aria-label="Alasan"
        className="h-8 min-w-0 flex-1 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[12px] outline-none focus:border-[var(--phv4-red)]"
      />
      <button
        type="button"
        disabled={value.trim().length < 3}
        onClick={onSubmit}
        className="h-8 shrink-0 rounded-[6px] bg-[var(--phv4-red)] px-2.5 text-[12px] font-bold text-white disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );
}
