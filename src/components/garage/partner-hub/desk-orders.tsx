"use client";

// Pesanan Mitra (monitor kasir/Owner) + Ambil dari Mitra (waiter, papan 02). Klaim & antar memakai
// endpoint waiter yang sudah ada (/api/waiter/tickets/[no]/claim|deliver): satu klaim sah, anti dobel.

import { useCallback, useEffect, useState } from "react";
import { Bike, Check, CheckCircle2, HandPlatter, MessageCircle, PackageCheck, Phone, Play, RefreshCw, TriangleAlert, Undo2, Users, XCircle } from "lucide-react";

import { isPartnerPickupOrder, partnerDeskPlan, partnerDeskSteps, type PartnerDeskAction, type PartnerDeskViewer } from "@/lib/partner-cashier-rules";
import { groupPickupByTable } from "@/lib/partner-hub-insights";

import { api, Btn, Card, Chip, Notice, TICKET_LABEL, TICKET_TONE, timeWib } from "./desk-shared";

export type PartnerOrder = {
  ticketNo: string;
  orderNo: string;
  tableLabel: string | null;
  customerName: string | null;
  status: string;
  createdAt: string;
  readyAt: string | null;
  claimedByName: string | null;
  claimedById?: string | null;
  deliveredAt?: string | null;
  deliveredByName?: string | null;
  fulfillment?: string | null;
  issueReason: string | null;
  items: Array<{ name: string; variant: string; qty: number }>;
  partnerId: string;
  partnerName: string;
  partnerPhone: string | null;
  partnerOperationalStatus?: string;
  handoverPoint: string | null;
  paymentLabel: string;
  needsRefund?: boolean;
  escalated?: boolean;
};

const OP_CHIP: Record<string, { label: string; tone: "green" | "amber" | "red" }> = {
  buka: { label: "Mitra buka", tone: "green" },
  jeda: { label: "Mitra jeda", tone: "amber" },
  tutup: { label: "Mitra tutup", tone: "red" },
};

function waLink(order: PartnerOrder) {
  const digits = (order.partnerPhone ?? "").replace(/\D/g, "");
  const wa = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  const text = [
    `Halo ${order.partnerName}, pesanan Garage Coffee:`,
    `Order ${order.orderNo} · ${order.tableLabel ?? "Take away"}`,
    ...order.items.map((item) => `• ${item.name} x${item.qty}`),
  ].join("\n");
  return wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : null;
}

function telLink(order: PartnerOrder) {
  const digits = (order.partnerPhone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? `tel:${digits}` : null;
}

const ACTION_ICON: Record<PartnerDeskAction["kind"], typeof Check> = {
  accept: Check,
  start: Play,
  ready: PackageCheck,
  reject: XCircle,
  handover: HandPlatter,
  claim: Bike,
  deliver: CheckCircle2,
  refund: Undo2,
  cancel_item: Undo2,
};

const DONE_STATUSES = new Set(["delivered", "served", "rejected", "cancelled"]);

/** Stepper kecil Masuk → Diproses → Siap → Diserahkan/Diantar (status tetap juga ditulis sebagai teks). */
function OrderSteps({ order }: { order: PartnerOrder }) {
  if (order.status === "rejected" || order.status === "cancelled") return null;
  const steps = partnerDeskSteps(order);
  return (
    <ol className="mt-2 grid grid-cols-4 gap-1" aria-label="Tahap pesanan">
      {steps.map((step) => (
        <li key={step.key} className="min-w-0">
          <span
            aria-hidden
            className={`block h-1.5 rounded-full ${step.state === "done" ? "bg-[#22c55e]" : step.state === "current" ? "bg-[#ffb020]" : "bg-[#3a3a42]"}`}
          />
          <span className={`mt-1 block truncate text-[11px] font-semibold ${step.state === "todo" ? "text-[#9a9aa3]" : "text-[#e4e4e8]"}`}>
            {step.label}
            <span className="sr-only">{step.state === "done" ? " (selesai)" : step.state === "current" ? " (sekarang)" : ""}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function useNowTick(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function DeskOrders({
  mode,
  slaWarnMinutes = 2,
  readyWarnMinutes = 3,
  viewer = { userId: "", canHandleMoney: false, isManager: false },
}: {
  mode: "monitor" | "pickup";
  slaWarnMinutes?: number;
  readyWarnMinutes?: number;
  /** Penampil (untuk memilih tombol): pemegang uang menyerahkan take away & menyelesaikan bill item ditolak. */
  viewer?: PartnerDeskViewer;
}) {
  const [orders, setOrders] = useState<PartnerOrder[] | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "done">("active");
  const now = useNowTick();

  const load = useCallback(async () => {
    try {
      setOrders(await api<PartnerOrder[]>(view === "done" ? "/api/pos/partner-orders?scope=today" : "/api/pos/partner-orders"));
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
      setOrders([]);
    }
  }, [view]);

  useEffect(() => {
    // Ambil data saat tampil (pola repo: fetch-on-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = window.setInterval(() => void load(), 8_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function act(ticketNo: string, action: "claim" | "deliver") {
    setBusy(`${ticketNo}-${action}`);
    setMessage(null);
    try {
      await api(`/api/waiter/tickets/${ticketNo}/${action}`, { method: "POST" });
      setMessage({ tone: "ok", text: action === "claim" ? "Diklaim — ambil di titik serah-terima mitra." : "Ditandai sudah diantar ke pelanggan." });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  // Kasir menyerahkan pesanan mitra yang sudah siap (take away / ambil di kasir) dalam satu ketukan.
  async function handover(order: PartnerOrder) {
    setBusy(`${order.ticketNo}-handover`);
    setMessage(null);
    try {
      await api(`/api/pos/partner-orders/${order.ticketNo}/handover`, { method: "POST" });
      setMessage({ tone: "ok", text: `${order.orderNo} (${order.partnerName}) sudah diserahkan ke pelanggan.` });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  // Klaim / antar semua pesanan satu meja: tetap satu permintaan per tiket ke endpoint yang sama (server menjaga
  // klaim tunggal & hanya pengklaim yang boleh menandai diantar). Gagal sebagian dilaporkan, sisanya tetap jalan.
  async function actGroup(key: string, ticketNos: string[], action: "claim" | "deliver") {
    setBusy(`${key}-${action}`);
    setMessage(null);
    const failed: string[] = [];
    for (const ticketNo of ticketNos) {
      try {
        await api(`/api/waiter/tickets/${ticketNo}/${action}`, { method: "POST" });
      } catch (error) {
        failed.push(`${ticketNo}: ${(error as Error).message}`);
      }
    }
    const done = ticketNos.length - failed.length;
    const verb = action === "claim" ? "diklaim" : "ditandai diantar";
    setMessage(
      failed.length
        ? { tone: "error", text: `${done} dari ${ticketNos.length} pesanan ${verb}. Gagal — ${failed.join(" · ")}` }
        : { tone: "ok", text: action === "claim" ? `${done} pesanan diklaim — ambil semuanya di titik serah-terima mitra.` : `${done} pesanan ditandai sudah diantar.` },
    );
    await load();
    setBusy(null);
  }

  // Staf memproses tiket ATAS NAMA mitra (HP mitra mati / mitra sibuk). Aturan transisi sama dengan portal mitra;
  // server mencatat staf yang menekan. Tolak wajib alasan.
  const [rejecting, setRejecting] = useState<{ ticketNo: string; reason: string } | null>(null);
  async function actForPartner(order: PartnerOrder, action: "accept" | "start" | "ready" | "reject", reason?: string) {
    setBusy(`${order.ticketNo}-${action}`);
    setMessage(null);
    try {
      await api(`/api/partners/tickets/${order.ticketNo}/action`, { method: "POST", body: JSON.stringify(action === "reject" ? { action, reason } : { action }) });
      const pickup = isPartnerPickupOrder(order);
      const done: Record<typeof action, string> = {
        accept: "diterima",
        start: "mulai diproses",
        ready: pickup ? "siap — serahkan ke pelanggan" : "siap diambil — waiter bisa klaim",
        reject: "ditolak — selesaikan bill pelanggan di kartu merah",
      };
      setMessage({ tone: "ok", text: `${order.orderNo} (${order.partnerName}) ${done[action]}. Tercatat atas nama Anda.` });
      setRejecting(null);
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function refundRejected(ticketNo: string) {
    setBusy(`${ticketNo}-refund`);
    setMessage(null);
    try {
      const res = await api<{ kind: "refund" | "void" | "cancel_item"; status: string }>(`/api/pos/partner-orders/${ticketNo}/refund`, { method: "POST" });
      const what = res.kind === "void" ? "Pembatalan order" : res.kind === "cancel_item" ? "Batal item" : "Refund item";
      const done =
        res.kind === "cancel_item" ? "Item sudah dikeluarkan dari bill — pelanggan tidak ditagih item ini." : `${what} selesai. Kembalikan uang ke pelanggan sesuai struk refund.`;
      setMessage({ tone: "ok", text: res.status === "pending" ? `${what} diajukan — menunggu persetujuan Manajer/Owner.` : done });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function runAction(order: PartnerOrder, action: PartnerDeskAction) {
    switch (action.kind) {
      case "accept":
      case "start":
      case "ready":
        return void actForPartner(order, action.kind);
      case "reject":
        return setRejecting({ ticketNo: order.ticketNo, reason: "" });
      case "handover":
        return void handover(order);
      case "claim":
      case "deliver":
        return void act(order.ticketNo, action.kind);
      case "refund":
      case "cancel_item":
        return void refundRejected(order.ticketNo);
    }
  }

  const all = orders ?? [];
  const list =
    mode === "pickup"
      ? all.filter((order) => order.status === "ready")
      : view === "done"
        ? all.filter((order) => DONE_STATUSES.has(order.status)).sort((a, b) => new Date(b.deliveredAt ?? b.createdAt).getTime() - new Date(a.deliveredAt ?? a.createdAt).getTime())
        : all.filter((order) => !DONE_STATUSES.has(order.status) || order.needsRefund);
  const needRefund = view === "active" ? all.filter((order) => order.needsRefund) : [];
  const tableGroups = mode === "pickup" ? groupPickupByTable(all.filter((order) => !isPartnerPickupOrder(order))).filter((group) => group.tableLabel && group.tickets.length > 1) : [];
  const lateReady = view === "active" ? all.filter((o) => o.status === "ready" && o.readyAt && now - new Date(o.readyAt).getTime() > readyWarnMinutes * 60_000) : [];
  const readyPickup = mode === "monitor" && view === "active" ? all.filter((o) => o.status === "ready" && isPartnerPickupOrder(o) && !o.claimedByName) : [];

  return (
    <div className="grid gap-3">
      <Notice message={message} />
      {readyPickup.length && viewer.canHandleMoney ? (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-[#22c55e]/50 bg-[#0f2a1a] px-3 py-2 text-sm font-semibold text-[#bbf7d0]">
          <HandPlatter className="size-4 shrink-0" aria-hidden /> {readyPickup.length} pesanan mitra take away siap — ambil di mitra, panggil pelanggan, lalu tekan &quot;Serahkan ke pelanggan&quot;.
        </p>
      ) : null}
      {lateReady.length ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-[#ff5a66]/50 bg-[#3a1015] px-3 py-2 text-sm text-[#ffd0d4]">
          <TriangleAlert className="size-4 shrink-0" aria-hidden /> {lateReady.length} pesanan mitra sudah siap lebih dari {readyWarnMinutes} menit — segera diserahkan/diantar.
        </p>
      ) : null}
      {mode === "monitor" && needRefund.length ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-[#ff5a66]/50 bg-[#3a1015] px-3 py-2 text-sm text-[#ffd0d4]">
          <TriangleAlert className="size-4 shrink-0" aria-hidden /> {needRefund.length} pesanan ditolak mitra dan itemnya masih ada di bill. Di kartu bertanda merah: bill lunas → ajukan refund, bill belum dibayar → keluarkan dari bill.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === "monitor" ? (
          <div className="inline-flex rounded-lg border border-[#3a3a42] p-0.5" role="group" aria-label="Tampilan pesanan mitra">
            {(
              [
                ["active", "Berjalan"],
                ["done", "Selesai hari ini"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => {
                  setOrders(null);
                  setView(id);
                }}
                className={`min-h-10 rounded-md px-3 text-sm font-bold ${view === id ? "bg-[#d11a2a] text-white" : "text-[#e4e4e8] hover:bg-white/10"}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#b8b8bf]">Pesanan sudah siap di mitra, menunggu diambil waiter.</p>
        )}
        <Btn onClick={() => void load()}>
          <RefreshCw className="size-4" /> Muat ulang
        </Btn>
      </div>
      {tableGroups.length ? (
        <Card>
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <Users className="size-4 text-[#ff5a66]" aria-hidden /> Ambil sekaligus per meja
          </h3>
          <ul className="mt-2 grid gap-2">
            {tableGroups.map((group) => (
              <li key={group.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#3a3a42] bg-black/20 p-3">
                <p className="min-w-0 text-sm text-[#f4f4f5]">
                  <b>{group.tableLabel}</b> · {group.tickets.length} pesanan
                  {group.partners.length ? <span className="text-[#b8b8bf]"> ({group.partners.join(", ")})</span> : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.claimable.length ? (
                    <Btn tone="primary" busy={busy === `${group.key}-claim`} disabled={busy !== null} onClick={() => void actGroup(group.key, group.claimable, "claim")}>
                      <Bike className="size-4" /> Klaim semua ({group.claimable.length})
                    </Btn>
                  ) : null}
                  {group.deliverable.length ? (
                    <Btn tone="success" busy={busy === `${group.key}-deliver`} disabled={busy !== null} onClick={() => void actGroup(group.key, group.deliverable, "deliver")}>
                      <CheckCircle2 className="size-4" /> Antar semua ({group.deliverable.length})
                    </Btn>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {orders === null ? (
        <Card>
          <p className="text-sm text-[#b8b8bf]">Memuat pesanan mitra…</p>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-[#b8b8bf]">
            {mode === "pickup" ? "Belum ada pesanan mitra yang siap diambil." : view === "done" ? "Belum ada pesanan mitra yang selesai hari ini." : "Tidak ada pesanan mitra yang berjalan."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" data-testid="partner-order-list">
          {list.map((order) => {
            const done = DONE_STATUSES.has(order.status) && !order.needsRefund;
            const waitMin = Math.floor((now - new Date(order.createdAt).getTime()) / 60_000);
            const late = order.status === "queue" && waitMin >= slaWarnMinutes;
            const plan = done ? { primary: null, secondary: [], hint: null } : partnerDeskPlan(order, viewer);
            const pickup = isPartnerPickupOrder(order);
            const link = waLink(order);
            const tel = telLink(order);
            const secondary = mode === "pickup" ? [] : plan.secondary;
            return (
              <li
                key={order.ticketNo}
                data-testid="partner-order-card"
                className={`rounded-xl border bg-[#17171c] p-4 ${late || order.needsRefund ? "border-[#ff5a66]/70" : order.status === "ready" && !done ? "border-[#22c55e]/60" : "border-[#34343c]"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-bold text-white">
                    {order.orderNo}{" "}
                    <span className="ml-1 rounded border border-[#4a4a54] px-1.5 py-0.5 text-xs">{pickup ? (order.fulfillment === "delivery" ? "Delivery" : "Take away") : order.tableLabel}</span>
                  </p>
                  <Chip tone={TICKET_TONE[order.status] ?? "default"}>{order.status === "delivered" && pickup ? "Diserahkan" : TICKET_LABEL[order.status] ?? order.status}</Chip>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#e4e4e8]">
                  <span className="min-w-0 break-words font-semibold">{order.partnerName}</span>
                  {!done && OP_CHIP[order.partnerOperationalStatus ?? ""] ? <Chip tone={OP_CHIP[order.partnerOperationalStatus!].tone}>{OP_CHIP[order.partnerOperationalStatus!].label}</Chip> : null}
                  {mode === "monitor" ? <Chip tone={order.paymentLabel === "Lunas" ? "green" : "amber"}>{order.paymentLabel === "Lunas" ? "Lunas" : "Belum dibayar"}</Chip> : null}
                </p>
                <p className="mt-1 text-xs text-[#b8b8bf]">
                  {order.customerName ?? "Tanpa nama"} · masuk {timeWib(order.createdAt)}
                  {done ? (
                    order.deliveredAt ? (
                      <>
                        {" "}
                        · {pickup ? "diserahkan" : "diantar"} {timeWib(order.deliveredAt)}
                        {order.deliveredByName ? ` oleh ${order.deliveredByName}` : ""}
                      </>
                    ) : null
                  ) : (
                    <>
                      {" "}
                      · <span className="tabular-nums">{waitMin} mnt</span>
                    </>
                  )}
                </p>
                {!done ? <OrderSteps order={order} /> : null}
                {plan.hint && !order.needsRefund ? <p className="mt-2 text-xs font-semibold text-[#ffd08a]">{plan.hint}</p> : null}
                <ul className="mt-2 grid gap-0.5 text-sm text-[#f4f4f5]">
                  {order.items.map((item, index) => (
                    <li key={index}>
                      <b>{item.qty}×</b> {item.name}
                      {item.variant && item.variant !== "Regular" ? ` (${item.variant})` : ""}
                    </li>
                  ))}
                </ul>
                {order.handoverPoint && !done ? <p className="mt-1 text-xs text-[#ffd08a]">Ambil di: {order.handoverPoint}</p> : null}
                {order.claimedByName && !done ? <p className="mt-1 text-xs text-[#bfdbfe]">Dibawa: {order.claimedByName}</p> : null}
                {late ? (
                  <p className="mt-1 text-xs font-semibold text-[#ff8a94]">
                    {order.escalated ? `Belum diterima mitra — hubungi mitra sekarang (${waitMin} menit).` : `Belum diterima mitra lebih dari ${slaWarnMinutes} menit.`}
                  </p>
                ) : null}
                {order.status === "rejected" ? (
                  <p className="mt-1 text-xs font-semibold text-[#ff8a94]">
                    Ditolak mitra{order.issueReason ? `: ${order.issueReason}` : ""}.
                    {order.needsRefund ? ` ${order.paymentLabel === "Lunas" ? "Pelanggan sudah bayar — ajukan refund." : "Bill belum dibayar — keluarkan item ini dari bill supaya pelanggan tidak ditagih."}` : " Bill sudah diselesaikan."}
                  </p>
                ) : null}
                {plan.primary || secondary.length || (mode === "monitor" && !done && (link || tel)) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plan.primary ? (
                      <Btn tone={plan.primary.tone === "default" ? "ghost" : plan.primary.tone} busy={busy === `${order.ticketNo}-${plan.primary.kind === "cancel_item" ? "refund" : plan.primary.kind}`} disabled={busy !== null} onClick={() => runAction(order, plan.primary!)}>
                        {(() => {
                          const Icon = ACTION_ICON[plan.primary.kind];
                          return <Icon className="size-4" />;
                        })()}{" "}
                        {plan.primary.label}
                      </Btn>
                    ) : null}
                    {secondary
                      .filter((action) => action.kind !== "reject" || rejecting?.ticketNo !== order.ticketNo)
                      .map((action) => {
                        const Icon = ACTION_ICON[action.kind];
                        return (
                          <Btn key={action.kind} tone={action.tone === "default" ? "ghost" : action.tone} busy={busy === `${order.ticketNo}-${action.kind}`} disabled={busy !== null} onClick={() => runAction(order, action)}>
                            <Icon className="size-4" /> {action.label}
                          </Btn>
                        );
                      })}
                    {link && mode === "monitor" && !done ? (
                      <a href={link} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#22c55e]/50 px-3 text-sm font-semibold text-[#bbf7d0] hover:bg-[#14532d]/50">
                        <MessageCircle className="size-4" /> WA mitra
                      </a>
                    ) : null}
                    {tel && mode === "monitor" && !done ? (
                      <a href={tel} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10">
                        <Phone className="size-4" /> Telepon
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {secondary.some((action) => action.onBehalf) ? <p className="mt-2 text-[11px] text-[#9a9aa3]">Tombol &quot;a.n. mitra&quot; dipakai bila mitra tidak merespons; tercatat atas nama Anda.</p> : null}
                {rejecting?.ticketNo === order.ticketNo && (order.status === "queue" || order.status === "accepted") ? (
                  <form
                    className="mt-2 grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (rejecting.reason.trim()) void actForPartner(order, "reject", rejecting.reason.trim());
                    }}
                  >
                    <label className="text-xs text-[#e4e4e8]" htmlFor={`reject-${order.ticketNo}`}>
                      Alasan penolakan (wajib, tampil ke kasir &amp; mitra)
                    </label>
                    <input
                      id={`reject-${order.ticketNo}`}
                      value={rejecting.reason}
                      onChange={(event) => setRejecting({ ticketNo: order.ticketNo, reason: event.target.value })}
                      maxLength={300}
                      required
                      autoFocus
                      placeholder="mis. Stok dimsum habis"
                      className="min-h-10 rounded-lg border border-[#4a4a54] bg-black/40 px-3 text-sm text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Btn tone="danger" type="submit" busy={busy === `${order.ticketNo}-reject`} disabled={busy !== null || !rejecting.reason.trim()}>
                        <XCircle className="size-4" /> Tolak pesanan
                      </Btn>
                      <Btn onClick={() => setRejecting(null)} disabled={busy !== null}>
                        Batal
                      </Btn>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
