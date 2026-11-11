"use client";

// Pesanan Mitra (monitor kasir/Owner) + Ambil dari Mitra (waiter, papan 02). Klaim & antar memakai
// endpoint waiter yang sudah ada (/api/waiter/tickets/[no]/claim|deliver): satu klaim sah, anti dobel.

import { useCallback, useEffect, useState } from "react";
import { Bike, CheckCircle2, MessageCircle, RefreshCw, TriangleAlert, Undo2, Users } from "lucide-react";

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
  issueReason: string | null;
  items: Array<{ name: string; variant: string; qty: number }>;
  partnerId: string;
  partnerName: string;
  partnerPhone: string | null;
  handoverPoint: string | null;
  paymentLabel: string;
  needsRefund?: boolean;
  escalated?: boolean;
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

export function useNowTick(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function DeskOrders({ mode, slaWarnMinutes = 2, readyWarnMinutes = 3 }: { mode: "monitor" | "pickup"; slaWarnMinutes?: number; readyWarnMinutes?: number }) {
  const [orders, setOrders] = useState<PartnerOrder[] | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNowTick();

  const load = useCallback(async () => {
    try {
      setOrders(await api<PartnerOrder[]>("/api/pos/partner-orders"));
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
      setOrders([]);
    }
  }, []);

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

  async function refundRejected(ticketNo: string) {
    setBusy(`${ticketNo}-refund`);
    setMessage(null);
    try {
      const res = await api<{ kind: "refund" | "void"; status: string }>(`/api/pos/partner-orders/${ticketNo}/refund`, { method: "POST" });
      const what = res.kind === "void" ? "Pembatalan order" : "Refund item";
      setMessage({ tone: "ok", text: res.status === "pending" ? `${what} diajukan — menunggu persetujuan Manajer/Owner.` : `${what} selesai. Kembalikan uang ke pelanggan sesuai struk refund.` });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const list = (orders ?? []).filter((order) => (mode === "pickup" ? order.status === "ready" : true));
  const needRefund = (orders ?? []).filter((order) => order.needsRefund);
  const tableGroups = mode === "pickup" ? groupPickupByTable(orders ?? []).filter((group) => group.tableLabel && group.tickets.length > 1) : [];
  const lateReady = (orders ?? []).filter((o) => o.status === "ready" && o.readyAt && now - new Date(o.readyAt).getTime() > readyWarnMinutes * 60_000);

  return (
    <div className="grid gap-3">
      <Notice message={message} />
      {lateReady.length ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-[#ff5a66]/50 bg-[#3a1015] px-3 py-2 text-sm text-[#ffd0d4]">
          <TriangleAlert className="size-4" /> {lateReady.length} pesanan mitra sudah siap lebih dari {readyWarnMinutes} menit — segera diantar.
        </p>
      ) : null}
      {mode === "monitor" && needRefund.length ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-[#ff5a66]/50 bg-[#3a1015] px-3 py-2 text-sm text-[#ffd0d4]">
          <TriangleAlert className="size-4 shrink-0" /> {needRefund.length} pesanan ditolak mitra — uang pelanggan belum dikembalikan. Ajukan refund di kartu bertanda merah.
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[#b8b8bf]">{mode === "pickup" ? "Pesanan sudah siap di mitra, menunggu diambil waiter." : "Semua pesanan mitra yang masih berjalan."}</p>
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
          <p className="text-center text-sm text-[#b8b8bf]">{mode === "pickup" ? "Belum ada pesanan mitra yang siap diambil." : "Tidak ada pesanan mitra aktif."}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((order) => {
            const waitMin = Math.floor((now - new Date(order.createdAt).getTime()) / 60_000);
            const late = order.status === "queue" && waitMin >= slaWarnMinutes;
            const link = waLink(order);
            return (
              <li key={order.ticketNo} className={`rounded-xl border bg-[#17171c] p-4 ${late || order.needsRefund ? "border-[#ff5a66]/70" : "border-[#34343c]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-bold text-white">
                    {order.orderNo} <span className="ml-1 rounded border border-[#4a4a54] px-1.5 py-0.5 text-xs">{order.tableLabel ?? "Take away"}</span>
                  </p>
                  <Chip tone={TICKET_TONE[order.status] ?? "default"}>{TICKET_LABEL[order.status] ?? order.status}</Chip>
                </div>
                <p className="mt-1 text-xs text-[#b8b8bf]">
                  {order.partnerName} · {order.customerName ?? "Tanpa nama"} · masuk {timeWib(order.createdAt)} · {waitMin} mnt
                  {mode === "monitor" ? ` · ${order.paymentLabel}` : ""}
                </p>
                <ul className="mt-2 grid gap-0.5 text-sm text-[#f4f4f5]">
                  {order.items.map((item, index) => (
                    <li key={index}>
                      <b>{item.qty}×</b> {item.name}
                      {item.variant && item.variant !== "Regular" ? ` (${item.variant})` : ""}
                    </li>
                  ))}
                </ul>
                {order.handoverPoint ? <p className="mt-1 text-xs text-[#ffd08a]">Ambil di: {order.handoverPoint}</p> : null}
                {order.claimedByName ? <p className="mt-1 text-xs text-[#bfdbfe]">Diklaim: {order.claimedByName}</p> : null}
                {late ? (
                  <p className="mt-1 text-xs font-semibold text-[#ff8a94]">
                    {order.escalated ? `Belum diterima mitra — hubungi mitra sekarang (${waitMin} menit).` : `Belum diterima mitra lebih dari ${slaWarnMinutes} menit.`}
                  </p>
                ) : null}
                {order.needsRefund ? (
                  <p className="mt-1 text-xs font-semibold text-[#ff8a94]">
                    Ditolak mitra{order.issueReason ? `: ${order.issueReason}` : ""}. {order.paymentLabel === "Lunas" ? "Pelanggan sudah bayar — ajukan refund." : "Bill belum dibayar — keluarkan item ini sebelum pelanggan membayar."}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {order.status === "ready" && !order.claimedByName ? (
                    <Btn tone="primary" busy={busy === `${order.ticketNo}-claim`} onClick={() => void act(order.ticketNo, "claim")}>
                      <Bike className="size-4" /> Klaim & ambil
                    </Btn>
                  ) : null}
                  {order.status === "ready" && order.claimedByName ? (
                    <Btn tone="success" busy={busy === `${order.ticketNo}-deliver`} onClick={() => void act(order.ticketNo, "deliver")}>
                      <CheckCircle2 className="size-4" /> Sudah diantar
                    </Btn>
                  ) : null}
                  {order.needsRefund && mode === "monitor" && order.paymentLabel === "Lunas" ? (
                    <Btn tone="danger" busy={busy === `${order.ticketNo}-refund`} onClick={() => void refundRejected(order.ticketNo)}>
                      <Undo2 className="size-4" /> Ajukan refund
                    </Btn>
                  ) : null}
                  {link && mode === "monitor" ? (
                    <a href={link} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#22c55e]/50 px-3 text-sm font-semibold text-[#bbf7d0] hover:bg-[#14532d]/50">
                      <MessageCircle className="size-4" /> Hubungi mitra
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
