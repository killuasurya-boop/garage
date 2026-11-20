"use client";

// =============================================================================
// MODUL KURIR — layar HP kurir delivery (akun Waiter, workstation "kurir").
// Alur: Ambil pesanan → Mulai antar → Sudah sampai. Selama pesanan dibawa, HP
// mengirim GPS tiap ±15 detik supaya pelanggan bisa melihat posisi kurir.
// Owner/Manajer/Kasir melihat semua antaran (pemantauan).
// =============================================================================

import {
  Bike,
  Camera,
  CheckCircle2,
  Coffee,
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
import { COURIER_STATUS_COPY, TABLE_STATUS_COLORS, type CourierStatusKey } from "@/lib/garage-table-status";
import { isCourierLocationStale, syncCourierLocations } from "@/lib/courier-location-sync";
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
  deliveryProofUrl: string | null;
  items: Array<{ name: string; variant: string | null; qty: number }>;
  production: { total: number; ready: number } | null;
};

type CourierBoard = {
  active: CourierOrder[];
  done: CourierOrder[];
  claimable: CourierOrder[];
  activeTruncated?: boolean;
  claimableTruncated?: boolean;
  history?: { page: number; hasMore: boolean };
  me: { userId: string; name: string; status: CourierStatusKey; assignable: boolean } | null;
  canDispatch: boolean;
  isCourier: boolean;
};

export function CourierStatusChip({ status }: { status: CourierStatusKey }) {
  const copy = COURIER_STATUS_COPY[status];
  const colors = TABLE_STATUS_COLORS[copy.color];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-bold"
      style={{ borderColor: colors.border, background: colors.bg, color: colors.text }}
    >
      <span className="size-2 rounded-full" style={{ background: colors.dot }} aria-hidden />
      {copy.label}
    </span>
  );
}

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
  const [historyPage, setHistoryPage] = useState(0);
  const requestSequence = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [gps, setGps] = useState<{ state: "idle" | "on" | "denied" | "unsupported" | "error" | "partial"; sentAt: number | null }>({
    state: "idle",
    sentAt: null,
  });

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const data = await garageApi.get<CourierBoard>(`/api/courier?historyPage=${historyPage}`);
      if (sequence !== requestSequence.current) return;
      setBoard(data);
      setError(null);
    } catch (err) {
      if (sequence !== requestSequence.current) return;
      setError(err instanceof Error ? err.message : "Daftar antaran gagal dimuat.");
    }
  }, [historyPage]);

  const { connected } = useProductionStream(load);
  // Poll cadangan: 20 dtk (60 dtk bila realtime tersambung); jeda saat tab tersembunyi
  // kecuali sedang membawa pesanan (GPS & status tetap perlu segar).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat awal data antaran
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, connected ? 60_000 : 20_000);
    return () => window.clearInterval(id);
  }, [load, connected]);

  // GPS: hanya untuk kurir, hanya pesanan miliknya yang sedang dibawa.
  const carriedIds = useMemo(
    () =>
      (board?.active ?? [])
        .filter((order) => order.courierUserId === me.user.id && carrying(order.deliveryStatus))
        .map((order) => order.id),
    [board, me.user.id],
  );
  const carriedKey = carriedIds.join(",");
  const nextSendRef = useRef(0);
  const sendingRef = useRef(false);

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
    let mounted = true;
    let failures = 0;
    nextSendRef.current = 0;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (sendingRef.current || now < nextSendRef.current) return;
        sendingRef.current = true;
        const body = { lat: position.coords.latitude, lng: position.coords.longitude };
        void syncCourierLocations(ids, (id) =>
          garageApi.post<{ ok: boolean; at: string }>(`/api/courier/orders/${id}/location`, body),
        ).then((result) => {
          if (!mounted) return;
          failures = result.failed ? failures + 1 : 0;
          nextSendRef.current = Date.now() + Math.min(120_000, GPS_INTERVAL_MS * 2 ** Math.min(failures, 3));
          setGps({ state: result.failed ? (result.acceptedAt ? "partial" : "error") : "on", sentAt: result.acceptedAt });
        }).finally(() => { sendingRef.current = false; });
      },
      (geoError) => {
        setGps({ state: geoError.code === geoError.PERMISSION_DENIED ? "denied" : "idle", sentAt: null });
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => { mounted = false; navigator.geolocation.clearWatch(watchId); };
  }, [carriedKey]);

  async function setAvailability(available: boolean) {
    setBusyId("availability");
    setError(null);
    try {
      await garageApi.post("/api/courier/availability", { available });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status kurir gagal diubah.");
    } finally {
      setBusyId(null);
    }
  }

  async function claim(order: CourierOrder) {
    setBusyId(order.id);
    setError(null);
    try {
      await garageApi.post(`/api/courier/orders/${order.id}/claim`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pesanan gagal diambil.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function uploadProof(order: CourierOrder, file: File) {
    setBusyId(order.id);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/courier/orders/${order.id}/proof`, { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? "Foto bukti gagal dikirim.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Foto bukti gagal dikirim.");
    } finally {
      setBusyId(null);
    }
  }

  async function act(order: CourierOrder, action: "pickup" | "depart" | "arrive") {
    setBusyId(order.id);
    setError(null);
    try {
      await garageApi.post(`/api/courier/orders/${order.id}/action`, { action });
      if (action !== "arrive") nextSendRef.current = 0; // kirim GPS pertama secepatnya
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
  const claimable = board?.claimable ?? [];
  const myStatus = board?.me?.status ?? "offline";

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-garage-line bg-garage-bg-1 p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-garage-red">
            <Bike className="size-4" aria-hidden /> Kurir delivery
          </p>
          <h1 className="mt-1 text-xl font-black text-white">{mine ? "Antaran saya" : "Semua antaran delivery"}</h1>
          <p className="text-sm text-garage-dim">
            {active.length} aktif · {done.length} selesai pada halaman ini
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

      {board?.activeTruncated || board?.claimableTruncated ? (
        <p role="status" className="rounded-md border border-garage-amber/55 bg-garage-amber/12 p-3 text-sm text-[#ffd79a]">
          {board.activeTruncated ? "Daftar dibatasi ke 600 antaran aktif tertua. Ada antaran aktif lain yang belum ditampilkan. " : ""}
          {board.claimableTruncated ? "Menampilkan 20 pesanan tertua yang bisa diambil. Pesanan berikutnya tampil setelah antrean berkurang." : ""}
        </p>
      ) : null}

      {mine && board ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-garage-line bg-garage-bg-1 p-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-garage-dim">Status saya</p>
            <div className="mt-1">
              <CourierStatusChip status={myStatus} />
            </div>
          </div>
          {myStatus === "offline" ? (
            <Button
              type="button"
              className="garage-press h-11 bg-[#16a34a] px-4 font-black text-white hover:bg-[#15803d]"
              disabled={busyId === "availability"}
              onClick={() => void setAvailability(true)}
            >
              <Bike className="size-4" aria-hidden /> Siap antar
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="garage-press h-11 border-garage-line-2 px-4 font-bold"
              disabled={busyId === "availability" || carriedIds.length > 0}
              onClick={() => void setAvailability(false)}
              title={carriedIds.length ? "Selesaikan antaran dulu" : undefined}
            >
              <Coffee className="size-4" aria-hidden /> Istirahat
            </Button>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-garage-red/50 bg-garage-red/10 p-3 text-sm font-semibold text-[#ffc9c9]">{error}</p>
      ) : null}

      {mine && claimable.length ? (
        <div className="rounded-lg border border-[#22c55e]/45 bg-[#22c55e]/[0.06] p-4">
          <p className="text-sm font-black text-white">Siap antar · ambil sendiri ({claimable.length})</p>
          <p className="text-xs text-garage-dim">
            {myStatus === "available"
              ? "Pesanan delivery lunas yang belum ada kurirnya."
              : myStatus === "offline"
                ? "Nyalakan \"Siap antar\" untuk mengambil pesanan."
                : "Selesaikan antaran yang sedang dibawa dulu."}
          </p>
          <ul className="mt-3 space-y-2">
            {claimable.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-garage-line bg-garage-bg-2 p-3">
                <div className="min-w-0">
                  <p className="font-bold text-white">
                    {order.orderNo} · {order.customerName ?? "Pelanggan"}
                  </p>
                  <p className="line-clamp-2 text-sm text-garage-dim">{order.deliveryAddress ?? "-"}</p>
                </div>
                <Button
                  type="button"
                  className="garage-press h-11 font-black"
                  disabled={myStatus !== "available" || busyId === order.id}
                  onClick={() => void claim(order)}
                >
                  {busyId === order.id ? "Mengambil…" : "Ambil"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {board === null ? (
        <p className="rounded-md border border-garage-line bg-garage-bg-1 p-6 text-center text-sm text-garage-dim">Memuat antaran…</p>
      ) : active.length === 0 ? (
        <div className="rounded-lg border border-garage-line bg-garage-bg-1 p-8 text-center">
          <Package className="mx-auto size-8 text-garage-mute" aria-hidden />
          <p className="mt-2 text-base font-bold text-white">Belum ada antaran</p>
          <p className="text-sm text-garage-dim">
            {mine
              ? "Nyalakan \"Siap antar\" — kasir menugaskan pesanan, atau ambil sendiri dari daftar Siap antar."
              : "Tugaskan kurir dari detail order delivery di POS."}
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
              onProof={(file) => void uploadProof(order, file)}
            />
          ))}
        </div>
      )}

      {done.length || historyPage > 0 ? (
        <div className="rounded-lg border border-garage-line bg-garage-bg-1 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-garage-dim">Selesai diantar · 18 jam terakhir · halaman {(board?.history?.page ?? 0) + 1}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11" disabled={historyPage === 0} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}>Sebelumnya</Button>
              <Button type="button" variant="outline" className="h-11" disabled={!board?.history?.hasMore} onClick={() => setHistoryPage((page) => page + 1)}>Berikutnya</Button>
            </div>
          </div>
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isCarrying) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [isCarrying]);
  if (!isCarrying) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-garage-line px-2.5 py-1.5 text-xs font-bold text-garage-dim">
        <LocateOff className="size-3.5" aria-hidden /> GPS mati (tidak ada antaran jalan)
      </span>
    );
  }
  if (state === "error" || state === "partial" || (state === "on" && isCourierLocationStale(sentAt, nowMs))) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 rounded-md border border-garage-red/60 bg-garage-red/12 px-2.5 py-1.5 text-xs font-bold text-[#ffc9c9]">
        <LocateOff className="size-3.5" aria-hidden />
        {state === "partial" ? "Sebagian lokasi belum diterima server" : state === "on" ? "GPS belum diperbarui lebih dari 90 detik" : "Lokasi belum diterima server — mencoba lagi"}
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
  onProof,
}: {
  order: CourierOrder;
  busy: boolean;
  canAct: boolean;
  onAct: (action: "pickup" | "depart" | "arrive") => void;
  onProof: (file: File) => void;
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
        : {
            action: "arrive" as const,
            label: "Sudah sampai",
            hint: order.deliveryProofUrl ? "GPS berhenti dibagikan" : "Ambil foto bukti terkirim dulu",
          };
  const needsProof = primary.action === "arrive" && !order.deliveryProofUrl;
  // Server menolak ambil pesanan sebelum semua tiket Bar/Dapur SIAP.
  const waitingProduction = primary.action === "pickup" && !productionReady;

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

      {canAct && carrying(order.deliveryStatus) ? (
        <label
          className={`garage-press flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-bold ${
            order.deliveryProofUrl
              ? "border-[#22c55e]/55 bg-[#22c55e]/10 text-[#bbf7d0]"
              : "border-garage-amber/60 bg-garage-amber/10 text-[#ffd79a]"
          }`}
        >
          <Camera className="size-4" aria-hidden />
          {order.deliveryProofUrl ? "Foto bukti tersimpan · ganti foto" : "Ambil foto bukti terkirim"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onProof(file);
            }}
          />
        </label>
      ) : null}

      {canAct ? (
        <div>
          <Button
            type="button"
            className="garage-press h-12 w-full text-base font-black"
            disabled={busy || needsProof || waitingProduction}
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
