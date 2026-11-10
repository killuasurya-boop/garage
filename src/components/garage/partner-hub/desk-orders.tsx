"use client";

// Pesanan Mitra (monitor kasir/Owner) + Ambil dari Mitra (waiter, papan 02). Klaim & antar memakai
// endpoint waiter yang sudah ada (/api/waiter/tickets/[no]/claim|deliver): satu klaim sah, anti dobel.

import { useCallback, useEffect, useState } from "react";
import { Bike, CheckCircle2, MessageCircle, RefreshCw, TriangleAlert } from "lucide-react";

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

  const list = (orders ?? []).filter((order) => (mode === "pickup" ? order.status === "ready" : true));
  const lateReady = (orders ?? []).filter((o) => o.status === "ready" && o.readyAt && now - new Date(o.readyAt).getTime() > readyWarnMinutes * 60_000);

  return (
    <div className="grid gap-3">
      <Notice message={message} />
      {lateReady.length ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-[#ff5a66]/50 bg-[#3a1015] px-3 py-2 text-sm text-[#ffd0d4]">
          <TriangleAlert className="size-4" /> {lateReady.length} pesanan mitra sudah siap lebih dari {readyWarnMinutes} menit — segera diantar.
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[#b8b8bf]">{mode === "pickup" ? "Pesanan sudah siap di mitra, menunggu diambil waiter." : "Semua pesanan mitra yang masih berjalan."}</p>
        <Btn onClick={() => void load()}>
          <RefreshCw className="size-4" /> Muat ulang
        </Btn>
      </div>
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
              <li key={order.ticketNo} className={`rounded-xl border bg-[#17171c] p-4 ${late ? "border-[#ff5a66]/70" : "border-[#34343c]"}`}>
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
                {late ? <p className="mt-1 text-xs font-semibold text-[#ff8a94]">Belum diterima mitra lebih dari {slaWarnMinutes} menit.</p> : null}
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
