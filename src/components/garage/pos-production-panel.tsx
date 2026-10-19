"use client";

import { Check, Printer } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { KitchenOrder } from "@/lib/garage-api-types";
import { productionIdentityName, productionStationLabel } from "@/lib/garage-production-rules";
import type { KitchenChitInput } from "@/lib/thermal-receipt";

// Panel "Pesanan Bar & Dapur" di POS (owner, Okt 2026): kasir/manajer/owner
// melihat status detail tiap tiket sampai diantar waiter, memproses tiket
// (Mulai → Siap & panggil waiter → Panggil ulang) dan mencetak tiket Bar/Dapur.

type StationFilter = "all" | "Bar" | "Food";
type ViewTab = "active" | "done";

type Step = { key: string; label: string; at: string | null | undefined; by?: string | null };

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

function clock(iso: string | null | undefined) {
  return iso ? timeFmt.format(new Date(iso)) : null;
}

export function ticketSteps(ticket: KitchenOrder): Step[] {
  return [
    { key: "queue", label: "Antri", at: ticket.createdAt },
    { key: "cooking", label: "Dibuat", at: ticket.acceptedAt, by: ticket.acceptedByName },
    { key: "ready", label: "Siap", at: ticket.readyAt, by: ticket.readyByName },
    {
      key: "called",
      label: "Dipanggil",
      at: ticket.handoverAt,
      by: ticket.handoverAt ? `→ ${ticket.claimedByName ?? "siapa saja"}` : null,
    },
    { key: "claimed", label: "Diambil", at: ticket.claimedAt, by: ticket.claimedAt ? ticket.claimedByName : null },
    { key: "delivered", label: "Diantar", at: ticket.deliveredAt, by: ticket.deliveredByName },
  ];
}

/** Indeks langkah terakhir yang sudah terjadi (0 = antri). */
export function currentStepIndex(ticket: KitchenOrder) {
  const steps = ticketSteps(ticket);
  let last = 0;
  steps.forEach((step, index) => {
    if (step.at) last = index;
  });
  if (ticket.status === "completed" || ticket.status === "delivered") return steps.length - 1;
  return last;
}

function headline(ticket: KitchenOrder) {
  if (ticket.status === "completed" || ticket.status === "delivered") return "Sudah diantar";
  if (ticket.status === "ready") {
    if (ticket.claimedAt) return `Diambil ${ticket.claimedByName ?? "waiter"} · sedang diantar`;
    if (ticket.handoverAt) return `Waiter dipanggil (${ticket.claimedByName ?? "siapa saja"}) · tunggu diambil`;
    return "Siap · belum panggil waiter";
  }
  if (ticket.status === "cooking") return `Sedang dibuat${ticket.acceptedByName ? ` · ${ticket.acceptedByName}` : ""}`;
  return "Antri · belum dimulai";
}

/** "2x Latte Cold" → { qty: 2, name: "Latte Cold" } untuk chit. */
function parseItem(label: string) {
  const match = /^(\d+)\s*x\s+(.+)$/i.exec(label.trim());
  return match ? { qty: Number(match[1]), name: match[2] } : { qty: 1, name: label.trim() };
}

export function ticketToChit(ticket: KitchenOrder, printedBy?: string | null): KitchenChitInput {
  const station = ticket.station === "Bar" ? "Bar" : "Dapur";
  return {
    printedBy: printedBy ?? null,
    printedAt: new Date().toISOString(),
    waiterName: ticket.claimedByName ?? null,
    orderNote: ticket.internalNotes,
    addonSequence: ticket.addonSequence ?? null,
    priority: ticket.priority,
    targetMinutes: ticket.targetMinutes || null,
    orderNo: ticket.orderNo ?? ticket.id,
    queueNo: ticket.queueNo ?? null,
    tableLabel: ticket.table,
    orderType: ticket.channel,
    createdAt: ticket.createdAt,
    customerName: ticket.customerName && ticket.customerName !== "Guest Customer" ? ticket.customerName : null,
    items: ticket.items.map((label) => {
      const { qty, name } = parseItem(label);
      return { name, qty, note: ticket.itemNotes?.[label] ?? null, station };
    }),
  };
}

function StatusStepper({ ticket }: { ticket: KitchenOrder }) {
  const steps = ticketSteps(ticket);
  const current = currentStepIndex(ticket);
  return (
    <ol className="mt-2.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6" data-testid="pos-kitchen-stepper" aria-label="Status tiket">
      {steps.map((step, index) => {
        const done = index <= current;
        const isCurrent = index === current;
        return (
          <li
            key={step.key}
            aria-current={isCurrent ? "step" : undefined}
            className={`min-w-0 rounded-md border px-2 py-1.5 ${
              isCurrent
                ? "border-[#f5a742] bg-[#f5a742]/15"
                : done
                  ? "border-[#22c55e]/45 bg-[#22c55e]/[0.08]"
                  : "border-[#34343c] bg-black/20"
            }`}
          >
            <p className={`flex items-center gap-1 text-xs font-bold leading-tight ${done ? "text-white" : "text-[#9a9aa4]"}`}>
              {done && !isCurrent ? <Check aria-hidden className="size-3 shrink-0 text-[#4ade80]" /> : null}
              <span className="truncate">{step.label}</span>
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-[#d4d4d8]">{done ? (clock(step.at) ?? "✓") : "—"}</p>
            {done && step.by ? (
              <p className="break-words text-[11px] font-semibold leading-tight text-[#ffd08a]" title={step.by}>
                {step.by}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function PosProductionPanel({
  activeTickets,
  doneTickets,
  now,
  busyId,
  qcTicketId,
  printingId,
  printedIds,
  onSetQcTicket,
  onAction,
  onPrint,
}: {
  activeTickets: KitchenOrder[];
  doneTickets: KitchenOrder[];
  now: number;
  busyId: string | null;
  qcTicketId: string | null;
  printingId: string | null;
  printedIds: ReadonlySet<string>;
  onSetQcTicket: (id: string | null) => void;
  onAction: (ticketId: string, body: Record<string, unknown>) => void;
  onPrint: (tickets: KitchenOrder[], key: string) => void;
}) {
  const [station, setStation] = useState<StationFilter>("all");
  const [tab, setTab] = useState<ViewTab>("active");

  const byStation = (rows: KitchenOrder[]) =>
    station === "all" ? rows : rows.filter((ticket) => (station === "Bar" ? ticket.station === "Bar" : ticket.station !== "Bar"));
  const active = byStation(activeTickets);
  const done = byStation(doneTickets);
  const rows = tab === "active" ? active : done;
  const unprinted = useMemo(
    () => activeTickets.filter((ticket) => ticket.status === "queue" && !printedIds.has(ticket.id)),
    [activeTickets, printedIds],
  );
  const stationCount = (value: StationFilter) =>
    value === "all" ? activeTickets.length : activeTickets.filter((t) => (value === "Bar" ? t.station === "Bar" : t.station !== "Bar")).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Station" className="flex rounded-md border border-[#34343c] bg-black/30 p-0.5">
          {(
            [
              ["all", "Semua"],
              ["Bar", "Bar"],
              ["Food", "Dapur"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={station === value}
              data-testid={`pos-kitchen-filter-${value}`}
              onClick={() => setStation(value)}
              className={`garage-press min-h-10 rounded px-3 text-sm font-bold ${station === value ? "bg-[#e5484d] text-white" : "text-[#d4d4d8] hover:bg-white/[0.06]"}`}
            >
              {label} <span className="font-mono text-xs opacity-90">{stationCount(value)}</span>
            </button>
          ))}
        </div>
        <div role="tablist" aria-label="Tampilan" className="flex rounded-md border border-[#34343c] bg-black/30 p-0.5">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "active"}
            onClick={() => setTab("active")}
            className={`garage-press min-h-10 rounded px-3 text-sm font-bold ${tab === "active" ? "bg-white/[0.14] text-white" : "text-[#d4d4d8] hover:bg-white/[0.06]"}`}
          >
            Aktif ({active.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "done"}
            data-testid="pos-kitchen-tab-done"
            onClick={() => setTab("done")}
            className={`garage-press min-h-10 rounded px-3 text-sm font-bold ${tab === "done" ? "bg-white/[0.14] text-white" : "text-[#d4d4d8] hover:bg-white/[0.06]"}`}
          >
            Diantar 1 jam ({done.length})
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          data-testid="pos-kitchen-print-new"
          disabled={!unprinted.length || printingId === "new"}
          className="garage-press ml-auto h-10 border-[#f5a742]/60 bg-[#f5a742]/10 px-3 text-sm font-bold text-[#ffd08a] hover:bg-[#f5a742]/20"
          onClick={() => onPrint(unprinted, "new")}
        >
          <Printer aria-hidden className="size-4" />
          {printingId === "new" ? "Mencetak..." : `Cetak semua tiket baru (${unprinted.length})`}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#c4c4cc]">
          {tab === "active"
            ? "Tidak ada pesanan aktif di Bar/Dapur. Tiket muncul saat order dikonfirmasi kasir."
            : "Belum ada tiket yang diantar dalam 1 jam terakhir."}
        </p>
      ) : (
        rows.map((ticket) => {
          const waitedMinutes = Math.max(0, Math.floor((now - new Date(ticket.createdAt).getTime()) / 60000));
          const isDone = ticket.status === "completed" || ticket.status === "delivered";
          const late = !isDone && ticket.status !== "ready" && waitedMinutes > ticket.targetMinutes;
          const busy = busyId === ticket.id;
          return (
            <article
              key={ticket.id}
              data-testid="pos-kitchen-ticket"
              className={`rounded-md border p-3 ${
                late
                  ? "border-[#d11a2a]/60 bg-[#d11a2a]/10"
                  : ticket.status === "ready"
                    ? "border-[#22c55e]/45 bg-[#22c55e]/[0.06]"
                    : "border-[#3a3a44] bg-white/[0.05]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-black uppercase leading-tight text-white">
                    {productionIdentityName(ticket.customerName, ticket.queueNo)}
                    {productionIdentityName(ticket.customerName, ticket.queueNo).toLowerCase() !== ticket.table.toLowerCase() ? (
                      <span className="ml-2 font-mono text-[#ffd08a]">{ticket.table}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-xs text-[#c4c4cc]">
                    <span>#{ticket.orderNo ?? ticket.id}</span>
                    <span className={ticket.station === "Bar" ? "font-bold text-[#7dd3fc]" : "font-bold text-[#fdba74]"}>
                      {productionStationLabel(ticket.station)}
                    </span>
                    {!isDone ? (
                      <span className={late ? "font-bold text-[#ff6b78]" : ""}>
                        {late ? `Lewat SLA · ${waitedMinutes} mnt` : `${waitedMinutes} mnt`}
                      </span>
                    ) : null}
                    {printedIds.has(ticket.id) ? <span className="text-[#86efac]">Tiket tercetak</span> : null}
                  </p>
                </div>
                <p
                  data-testid="pos-kitchen-headline"
                  className="max-w-full rounded-sm border border-[#4a4a54] bg-black/35 px-2 py-1 text-sm font-black text-white"
                >
                  {headline(ticket)}
                </p>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {ticket.items.map((item, i) => (
                  <p key={`${ticket.id}-${i}`} className="text-sm font-semibold leading-snug text-[#f4f4f5]">
                    {item}
                    {ticket.itemNotes?.[item] ? (
                      <span className="ml-1 text-xs font-bold text-[#ffd08a]">({ticket.itemNotes[item]})</span>
                    ) : null}
                  </p>
                ))}
              </div>
              <StatusStepper ticket={ticket} />
              <div className="mt-2.5 flex flex-wrap items-center gap-2" data-testid="pos-kitchen-actions">
                {ticket.status === "queue" ? (
                  <Button
                    type="button"
                    data-testid="pos-kitchen-start"
                    disabled={busy}
                    className="garage-press h-11 min-w-[140px] bg-[#e5484d] px-4 text-sm font-black uppercase text-white hover:bg-[#ff5c61]"
                    onClick={() => onAction(ticket.id, { action: "start" })}
                  >
                    {busy ? "Memproses..." : "Mulai buat"}
                  </Button>
                ) : null}
                {ticket.status === "cooking" && qcTicketId !== ticket.id ? (
                  <Button
                    type="button"
                    data-testid="pos-kitchen-ready"
                    disabled={busy}
                    className="garage-press h-11 min-w-[180px] bg-[#16a34a] px-4 text-sm font-black uppercase text-white hover:bg-[#22c55e]"
                    onClick={() => onSetQcTicket(ticket.id)}
                  >
                    Siap &amp; panggil waiter
                  </Button>
                ) : null}
                {ticket.status === "cooking" && qcTicketId === ticket.id ? (
                  <>
                    <span className="text-sm font-semibold text-[#ffd08a]">Item, jumlah, varian &amp; catatan sudah dicek?</span>
                    <Button
                      type="button"
                      data-testid="pos-kitchen-ready-confirm"
                      disabled={busy}
                      className="garage-press h-11 bg-[#16a34a] px-4 text-sm font-black uppercase text-white hover:bg-[#22c55e]"
                      onClick={() => onAction(ticket.id, { action: "ready_call", qcConfirmed: true })}
                    >
                      {busy ? "Memproses..." : "Ya, siap"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-11 border-[#4a4a54] bg-white/[0.05] px-3 text-sm"
                      onClick={() => onSetQcTicket(null)}
                    >
                      Batal
                    </Button>
                  </>
                ) : null}
                {ticket.status === "ready" && !ticket.claimedAt ? (
                  <Button
                    type="button"
                    data-testid="pos-kitchen-call"
                    disabled={busy}
                    className="garage-press h-11 min-w-[160px] bg-[#f5a742] px-4 text-sm font-black uppercase text-black hover:bg-[#ffb85c]"
                    onClick={() => onAction(ticket.id, { action: "handover", waiterUserId: null })}
                  >
                    {busy ? "Memproses..." : ticket.handoverAt ? "Panggil ulang waiter" : "Panggil waiter"}
                  </Button>
                ) : null}
                {(ticket.status === "ready" && !ticket.claimedAt) || ticket.status === "cooking" ? (
                  <Button
                    type="button"
                    data-testid="pos-kitchen-serve-direct"
                    disabled={busy}
                    title="Tidak perlu waiter: pesanan diserahkan langsung ke pelanggan (ambil di kasir / take away)."
                    className="garage-press h-11 min-w-[170px] border border-[#22c55e]/60 bg-[#22c55e]/15 px-4 text-sm font-black uppercase text-[#dcfce7] hover:bg-[#22c55e]/25"
                    onClick={() => onAction(ticket.id, { action: "serve_direct" })}
                  >
                    {busy ? "Memproses..." : "Serahkan langsung"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  data-testid="pos-kitchen-print"
                  disabled={printingId === ticket.id}
                  className="garage-press h-11 border-[#4a4a54] bg-white/[0.05] px-3 text-sm font-bold"
                  onClick={() => onPrint([ticket], ticket.id)}
                >
                  <Printer aria-hidden className="size-4" />
                  {printingId === ticket.id ? "Mencetak..." : "Cetak tiket"}
                </Button>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
