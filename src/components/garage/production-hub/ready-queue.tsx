"use client";

import { useState } from "react";
import { Bike, Check, Hand, Loader2, ShoppingBag, Utensils, UserCheck } from "lucide-react";

import type { ProductionTicketView } from "@/lib/garage-api-types";
import {
  elapsedSeconds,
  formatElapsed,
  hubStatusOf,
  isPickupTicket,
  readyLabel,
} from "@/lib/production-hub-v4";
import type { ProductionHistoryOrder } from "@/lib/production-hub-history";

import { StationBadge } from "./hub-ui";
import { customerOf, tableText } from "./order-card";

export type ReadyTab = "ready" | "delivering" | "done";

/**
 * Antrean Siap: dine-in = Siap Antar → Sedang Diantar → Selesai Antar;
 * pickup = Siap Diambil → Sudah Diambil (tidak pernah memakai aksi antar).
 */
export function ReadyQueue({
  tickets,
  done,
  doneLoading,
  now,
  canHandover,
  waiters,
  busyKey,
  tab,
  onTab,
  onCall,
  onServe,
  onPickup,
  onOpen,
}: {
  tickets: ProductionTicketView[];
  done: ProductionHistoryOrder[];
  doneLoading: boolean;
  now: number;
  canHandover: { Bar: boolean; Food: boolean };
  waiters: Array<{ id: string; name: string; activeDeliveries: number }>;
  busyKey: string | null;
  tab: ReadyTab;
  onTab: (tab: ReadyTab) => void;
  onCall: (ticket: ProductionTicketView) => void;
  onServe: (ticket: ProductionTicketView) => void;
  onPickup: (ticket: ProductionTicketView, waiterId: string) => void;
  onOpen: (ticket: ProductionTicketView) => void;
}) {
  const [choosing, setChoosing] = useState<string | null>(null);
  const ready = tickets.filter((t) => hubStatusOf(t) === "ready");
  const delivering = tickets.filter((t) => hubStatusOf(t) === "delivering");
  const list = tab === "ready" ? ready : delivering;
  const tabs: Array<{ id: ReadyTab; label: string; count?: number }> = [
    { id: "ready", label: "Siap", count: ready.length },
    { id: "delivering", label: "Diantar", count: delivering.length },
    { id: "done", label: "Selesai" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Antrean siap" className="grid shrink-0 grid-cols-3 gap-1 p-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`h-8 rounded-md text-[12px] font-bold transition-colors ${
              tab === t.id ? "bg-[var(--phv4-red)] text-white" : "bg-[var(--phv4-bg)] text-[var(--phv4-muted)] hover:text-white"
            }`}
          >
            {t.label}
            {t.count != null ? <span className="phv4-mono ml-1">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="garage-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
        {tab === "done" ? (
          doneLoading && !done.length ? (
            <p className="flex items-center gap-2 py-6 text-[12px] text-[var(--phv4-muted)]">
              <Loader2 className="size-3.5 animate-spin" /> Memuat…
            </p>
          ) : done.length ? (
            done.map((order) => {
              const pickup = isPickupTicket({ table: order.table, channel: order.channel });
              const last = order.tickets
                .map((t) => t.deliveredAt)
                .filter(Boolean)
                .sort()
                .at(-1);
              const by = order.tickets.find((t) => t.deliveredByName)?.deliveredByName;
              return (
                <div key={order.key} className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="phv4-mono text-[13px] font-bold">#{order.orderNo ?? "-"}</span>
                    <span className="text-[12px] text-[#d1d5db]">{tableText(order.table)}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[#86efac]">
                      <Check className="size-3" /> {pickup ? "Sudah Diambil" : "Selesai Antar"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--phv4-muted)]">
                    {last
                      ? new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(last))
                      : "-"}
                    {by ? ` · ${by}` : ""}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="py-6 text-center text-[12px] text-[var(--phv4-muted)]">Belum ada yang selesai hari ini.</p>
          )
        ) : list.length ? (
          list.map((ticket) => {
            const pickup = isPickupTicket(ticket);
            const allowed = canHandover[ticket.station];
            const since = elapsedSeconds(ticket.handoverAt ?? ticket.readyAt ?? ticket.createdAt, now);
            const overdue = tab === "delivering" && since >= 180;
            const busy = busyKey?.endsWith(`:${ticket.ticketNo}`) ?? false;
            const items = ticket.items.reduce((sum, item) => sum + item.qty, 0);
            return (
              <div
                key={ticket.ticketNo}
                className={`rounded-[8px] border bg-[var(--phv4-card)] px-2.5 py-2 ${
                  overdue ? "border-[var(--phv4-critical)]/70" : "border-[var(--phv4-border)]"
                }`}
              >
                <button type="button" onClick={() => onOpen(ticket)} className="block w-full text-left">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {pickup ? <ShoppingBag className="size-3.5 shrink-0" aria-hidden /> : <Utensils className="size-3.5 shrink-0" aria-hidden />}
                    <span className="phv4-mono text-[13px] font-bold">#{ticket.orderNo ?? ticket.ticketNo}</span>
                    <span className="shrink-0 text-[12px] text-[#e5e7eb]">{tableText(ticket.table)}</span>
                    <span className="min-w-0 truncate text-[13px] font-bold text-white">{customerOf(ticket).customer ?? ""}</span>
                    <span className={`phv4-mono ml-auto shrink-0 text-[12px] font-bold ${overdue ? "text-[var(--phv4-critical)]" : "text-[#86efac]"}`}>
                      {formatElapsed(since)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--phv4-muted)]">
                    <StationBadge station={ticket.station} compact />
                    <span className="truncate">
                      {items} item · {readyLabel(ticket)}
                      {ticket.claimedByName ? ` · ${ticket.claimedByName}` : ""}
                    </span>
                  </div>
                </button>
                <div className="mt-1.5">
                  {tab === "ready" ? (
                    <button
                      type="button"
                      disabled={!allowed || busy}
                      onClick={() => (pickup ? onServe(ticket) : onCall(ticket))}
                      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[6px] bg-[#15803d] text-[12px] font-bold uppercase text-white hover:bg-[var(--phv4-success)] disabled:opacity-55"
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : pickup ? <Hand className="size-3.5" /> : <Bike className="size-3.5" />}
                      {!allowed ? "Menunggu helper" : pickup ? "Ambil" : "Antar"}
                    </button>
                  ) : choosing === ticket.ticketNo ? (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-[var(--phv4-muted)]">Diantar oleh:</p>
                      <div className="flex flex-wrap gap-1">
                        {waiters.map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setChoosing(null);
                              onPickup(ticket, w.id);
                            }}
                            className="h-9 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2.5 text-[12px] font-semibold hover:border-[#86efac]"
                          >
                            {w.name}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setChoosing(null);
                            onServe(ticket);
                          }}
                          className="h-9 rounded-[6px] border border-[var(--phv4-border)] px-2.5 text-[12px] font-semibold text-[var(--phv4-muted)] hover:text-white"
                        >
                          Saya sendiri
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!allowed || busy}
                      onClick={() => setChoosing(ticket.ticketNo)}
                      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[6px] border border-[#86efac]/50 bg-[var(--phv4-elev)] text-[12px] font-bold uppercase text-white disabled:opacity-55"
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UserCheck className="size-3.5" />}
                      {allowed ? "Selesai Antar" : "Menunggu helper"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-6 text-center text-[12px] text-[var(--phv4-muted)]">
            {tab === "ready" ? "Tidak ada pesanan siap." : "Tidak ada yang sedang diantar."}
          </p>
        )}
      </div>
    </div>
  );
}
