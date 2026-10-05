"use client";

// =============================================================================
// MODUL KURIR — layar HP kurir delivery (akun Waiter, workstation "kurir").
// Alur: Ambil pesanan → Mulai antar → Sudah sampai. Selama pesanan dibawa, HP
// mengirim GPS tiap ±15 detik supaya pelanggan bisa melihat posisi kurir.
// Owner/Manajer/Kasir melihat semua antaran (pemantauan).
// =============================================================================

import {
  Bike,
  CheckCircle2,
  Clock3,
  LocateFixed,
  LocateOff,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mapsSearchUrl } from "@/components/garage/delivery-order-panel";
import { deliveryStatusLabel } from "@/components/garage/garage-app-helpers";
import { Button } from "@/components/ui/button";
import { garageApi } from "@/lib/api-client";
import type { GarageMe } from "@/lib/garage-api-types";
import { useProductionStream } from "@/lib/use-production-stream";
import { buildCustomerWhatsappMessage, waLink } from "@/lib/whatsapp-link";

type CourierOrder = {
  id: string;
  orderNo: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryFee: number;
  deliveryStatus: string | null;
  total: number;
  courierUserId: string | null;
  courierName: string | null;
  courierLocationAt: string | null;
  customerLat: number | null;
  customerLng: number | null;
  invoiceTrackingToken: string | null;
  createdAt: string;
  deliveredAt: string | null;
  items: Array<{ name: string; variant: string | null; qty: number }>;
  production: { total: number; ready: number } | null;
};

type CourierBoard = {
  active: CourierOrder[];
  done: CourierOrder[];
  canDispatch: boolean;
  isCourier: boolean;
};

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const GPS_INTERVAL_MS = 15_000;

function routeUrl(order: CourierOrder) {
  if (order.customerLat != null && order.customerLng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${order.customerLat},${order.customerLng}&travelmode=driving`;
  }
  return order.deliveryAddress ? mapsSearchUrl(order.deliveryAddress) : null;
}

function trackingUrl(order: CourierOrder) {
  if (!order.invoiceTrackingToken || typeof window === "undefined") return null;
  return `${window.location.origin}/invoice/${order.invoiceTrackingToken}`;
}

const carrying = (status: string | null) => status === "picked_up" || status === "on_the_way";

export function CourierView({ me }: { me: GarageMe }) {
  const [board, setBoard] = useState<CourierBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [gps, setGps] = useState<{ state: "idle" | "on" | "denied" | "unsupported"; sentAt: number | null }>({
    state: "idle",
    sentAt: null,
  });

  const load = useCallback(async () => {
    try {
      setBoard(await garageApi.get<CourierBoard>("/api/courier"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Daftar antaran gagal dimuat.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat awal data antaran
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(id);
  }, [load]);
  const { connected } = useProductionStream(load);

  // GPS: hanya untuk kurir, hanya pesanan miliknya yang sedang dibawa.
  const carriedIds = useMemo(
    () =>
      (board?.active ?? [])
        .filter((order) => order.courierUserId === me.user.id && carrying(order.deliveryStatus))
        .map((order) => order.id),
    [board, me.user.id],
  );
  const carriedKey = carriedIds.join(",");
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!carriedKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- GPS mati bila tidak ada antaran
      setGps((prev) => (prev.state === "on" ? { state: "idle", sentAt: null } : prev));
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGps({ state: "unsupported", sentAt: null });
      return;
    }
    const ids = carriedKey.split(",");
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentRef.current < GPS_INTERVAL_MS) return;
        lastSentRef.current = now;
        const body = { lat: position.coords.latitude, lng: position.coords.longitude };
        void Promise.all(ids.map((id) => garageApi.post(`/api/courier/orders/${id}/location`, body).catch(() => null))).then(
          () => setGps({ state: "on", sentAt: now }),
        );
      },
      (geoError) => {
        setGps({ state: geoError.code === geoError.PERMISSION_DENIED ? "denied" : "idle", sentAt: null });
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [carriedKey]);

  async function act(order: CourierOrder, action: "pickup" | "depart" | "arrive") {
    setBusyId(order.id);
    setError(null);
    try {
      await garageApi.post(`/api/courier/orders/${order.id}/action`, { action });
      if (action !== "arrive") lastSentRef.current = 0; // kirim GPS pertama secepatnya
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status antar gagal diubah.");
    } finally {
      setBusyId(null);
    }
  }

  const mine = board?.isCourier ?? false;
  const active = board?.active ?? [];
  const done = board?.done ?? [];

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-garage-line bg-garage-bg-1 p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-garage-red">
            <Bike className="size-4" aria-hidden /> Kurir delivery
          </p>
          <h1 className="mt-1 text-xl font-black text-white">{mine ? "Antaran saya" : "Semua antaran delivery"}</h1>
          <p className="text-sm text-garage-dim">
            {active.length} aktif · {done.length} selesai hari ini
            {connected ? " · realtime" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mine ? <GpsBadge state={gps.state} sentAt={gps.sentAt} carrying={carriedIds.length > 0} /> : null}
          <Button type="button" variant="outline" size="sm" className="garage-press h-10 border-garage-line-2" onClick={() => void load()}>
            <RefreshCw className="size-4" aria-hidden /> Muat ulang
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-md border border-garage-red/50 bg-garage-red/10 p-3 text-sm font-semibold text-[#ffc9c9]">{error}</p>
      ) : null}

      {board === null ? (
        <p className="rounded-md border border-garage-line bg-garage-bg-1 p-6 text-center text-sm text-garage-dim">Memuat antaran…</p>
      ) : active.length === 0 ? (
        <div className="rounded-lg border border-garage-line bg-garage-bg-1 p-8 text-center">
          <Package className="mx-auto size-8 text-garage-mute" aria-hidden />
          <p className="mt-2 text-base font-bold text-white">Belum ada antaran</p>
          <p className="text-sm text-garage-dim">
            {mine ? "Kasir akan menugaskan pesanan delivery ke akun Anda." : "Tugaskan kurir dari detail order delivery di POS."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {active.map((order) => (
            <CourierCard
              key={order.id}
              order={order}
              busy={busyId === order.id}
              canAct={order.courierUserId === me.user.id || me.role === "Owner" || me.role === "Manajer"}
              onAct={(action) => void act(order, action)}
            />
          ))}
        </div>
      )}

      {done.length ? (
        <div className="rounded-lg border border-garage-line bg-garage-bg-1 p-4">
          <p className="mb-2 text-sm font-bold text-garage-dim">Selesai diantar</p>
          <ul className="divide-y divide-garage-line text-sm">
            {done.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-bold text-white">
                  {order.orderNo} · {order.customerName ?? "-"}
                </span>
                <span className="inline-flex items-center gap-1.5 text-garage-dim">
                  <CheckCircle2 className="size-4 text-garage-silver" aria-hidden />
                  {order.deliveredAt ? timeFmt.format(new Date(order.deliveredAt)) : "-"}
                  {!mine && order.courierName ? ` · ${order.courierName}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function GpsBadge({ state, sentAt, carrying: isCarrying }: { state: string; sentAt: number | null; carrying: boolean }) {
  if (!isCarrying) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-garage-line px-2.5 py-1.5 text-xs font-bold text-garage-dim">
        <LocateOff className="size-3.5" aria-hidden /> GPS mati (tidak ada antaran jalan)
      </span>
    );
  }
  if (state === "denied" || state === "unsupported") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-garage-red/60 bg-garage-red/12 px-2.5 py-1.5 text-xs font-bold text-[#ffc9c9]">
        <LocateOff className="size-3.5" aria-hidden />
        {state === "denied" ? "Izinkan akses lokasi di browser" : "HP tidak mendukung GPS"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-garage-amber/55 bg-garage-amber/12 px-2.5 py-1.5 text-xs font-bold text-[#ffd79a]">
      <LocateFixed className="size-3.5" aria-hidden />
      {sentAt ? `GPS terkirim ${timeFmt.format(new Date(sentAt))}` : "Mencari lokasi…"}
    </span>
  );
}

function CourierCard({
  order,
  busy,
  canAct,
  onAct,
}: {
  order: CourierOrder;
  busy: boolean;
  canAct: boolean;
  onAct: (action: "pickup" | "depart" | "arrive") => void;
}) {
  const status = order.deliveryStatus ?? "preparing";
  const route = routeUrl(order);
  const productionReady = !order.production || order.production.total === 0 || order.production.ready >= order.production.total;
  const waBase = {
    orderNo: order.orderNo,
    customerName: order.customerName,
    total: order.total,
    deliveryFee: order.deliveryFee,
    fulfillment: "delivery",
    courierName: order.courierName,
    trackingUrl: trackingUrl(order),
  };
  const wa = waLink(order.customerPhone, buildCustomerWhatsappMessage(waBase, "on_the_way"));

  const primary =
    status === "preparing"
      ? { action: "pickup" as const, label: "Ambil pesanan", hint: productionReady ? "Pesanan siap diambil di kasir" : "Pesanan masih dibuat Bar/Dapur" }
      : status === "picked_up"
        ? { action: "depart" as const, label: "Mulai antar", hint: "GPS mulai dibagikan ke pelanggan" }
        : { action: "arrive" as const, label: "Sudah sampai", hint: "GPS berhenti dibagikan" };

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-garage-red/40 bg-garage-bg-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-garage-dim">{order.orderNo}</p>
          <p className="text-lg font-black text-white">{order.customerName ?? "Pelanggan"}</p>
        </div>
        <span className="rounded-sm border border-garage-red/50 bg-garage-red/12 px-2 py-1 text-xs font-black uppercase tracking-wide text-[#ffc9c9]">
          {deliveryStatusLabel[status] ?? status}
        </span>
      </div>

      <p className="flex items-start gap-2 break-words text-sm text-white">
        <MapPin className="mt-0.5 size-4 shrink-0 text-garage-red" aria-hidden />
        <span>{order.deliveryAddress ?? "-"}</span>
      </p>

      <ul className="space-y-0.5 text-sm text-[#d0d0d6]">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span className="font-bold text-white">{item.qty}×</span> {item.name}
            {item.variant && item.variant !== "Regular" ? ` (${item.variant})` : ""}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-sm border border-garage-line-2 bg-garage-bg-2 px-2 py-1 font-bold text-white">
          LUNAS QRIS · {rupiah.format(order.total)}
        </span>
        <span className="rounded-sm border border-garage-line-2 bg-garage-bg-2 px-2 py-1 font-bold text-garage-dim">
          Ongkir {rupiah.format(order.deliveryFee)}
        </span>
        {order.production && order.production.total ? (
          <span
            className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-bold ${
              productionReady ? "border-garage-silver/50 text-white" : "border-garage-amber/55 text-[#ffd79a]"
            }`}
          >
            <Clock3 className="size-3.5" aria-hidden /> Produksi {order.production.ready}/{order.production.total} siap
          </span>
        ) : null}
        {!canAct && order.courierName ? (
          <span className="rounded-sm border border-garage-line-2 px-2 py-1 font-bold text-white">Kurir {order.courierName}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {route ? (
          <a
            href={route}
            target="_blank"
            rel="noreferrer"
            className="garage-press inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-garage-line-2 text-sm font-bold text-white hover:bg-garage-bg-3"
          >
            <Navigation className="size-4" aria-hidden /> Rute
          </a>
        ) : (
          <span />
        )}
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="garage-press inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-garage-line-2 text-sm font-bold text-white hover:bg-garage-bg-3"
          >
            <MessageCircle className="size-4" aria-hidden /> WA
          </a>
        ) : (
          <span />
        )}
        {order.customerPhone ? (
          <a
            href={`tel:${order.customerPhone}`}
            className="garage-press inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-garage-line-2 text-sm font-bold text-white hover:bg-garage-bg-3"
          >
            <Phone className="size-4" aria-hidden /> Telepon
          </a>
        ) : (
          <span />
        )}
      </div>

      {canAct ? (
        <div>
          <Button
            type="button"
            className="garage-press h-12 w-full text-base font-black"
            disabled={busy}
            onClick={() => onAct(primary.action)}
          >
            {busy ? "Menyimpan…" : primary.label}
          </Button>
          <p className="mt-1 text-center text-xs text-garage-dim">{primary.hint}</p>
        </div>
      ) : null}
    </article>
  );
}
