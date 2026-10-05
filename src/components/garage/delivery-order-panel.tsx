"use client";

import { useEffect, useState } from "react";
import { Bike, MapPin, MessageCircle, Navigation, Package, Phone, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deliveryStatusLabel } from "@/components/garage/garage-app-helpers";
import { garageApi } from "@/lib/api-client";
import type { CustomerOrder } from "@/lib/garage-api-types";
import {
  buildCustomerWhatsappMessage,
  CUSTOMER_WHATSAPP_LABEL,
  waLink,
  type CustomerWhatsappKind,
} from "@/lib/whatsapp-link";

type CourierOption = { userId: string; name: string; activeDeliveries: number };

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export function mapsSearchUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, Tebing Tinggi`)}`;
}

/** Pesan WA yang relevan untuk status order saat ini (paling relevan duluan). */
export function whatsappKindsFor(order: CustomerOrder): CustomerWhatsappKind[] {
  if (order.status === "rejected") return ["rejected"];
  if (order.status === "pending_cashier" || order.status === "awaiting_payment") return ["awaiting_payment", "rejected"];
  if (order.fulfillment === "delivery") {
    if (order.deliveryStatus === "delivered") return ["delivered"];
    if (order.deliveryStatus === "on_the_way" || order.deliveryStatus === "picked_up") return ["on_the_way", "delivered"];
    return ["paid", "in_production", "on_the_way"];
  }
  return ["paid", "in_production", "ready_pickup"];
}

function trackingUrlFor(order: CustomerOrder) {
  if (!order.invoiceWebUrl || typeof window === "undefined") return null;
  return order.invoiceWebUrl.startsWith("http") ? order.invoiceWebUrl : `${window.location.origin}${order.invoiceWebUrl}`;
}

/**
 * Panel kasir untuk order Take away / Delivery: data antar, tugaskan kurir,
 * status antar, dan tombol khusus "WA pelanggan" (link wa.me, tanpa biaya).
 */
export function DeliveryOrderPanel({
  order,
  busy,
  autoRejectMinutes,
  onSetStatus,
  onChanged,
}: {
  order: CustomerOrder;
  busy: boolean;
  autoRejectMinutes: number;
  onSetStatus: (status: "preparing" | "on_the_way" | "delivered") => void;
  onChanged: () => void;
}) {
  const isDelivery = order.fulfillment === "delivery";
  const paid = order.status === "paid";
  const [couriers, setCouriers] = useState<CourierOption[] | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDelivery || !paid) return;
    let cancelled = false;
    // Muat ulang juga saat kurir berganti supaya jumlah antaran per kurir akurat.
    garageApi
      .get<{ couriers: CourierOption[] }>("/api/courier")
      .then((data) => {
        if (!cancelled) setCouriers(data.couriers);
      })
      .catch(() => {
        if (!cancelled) setCouriers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isDelivery, paid, order.id, order.courierUserId]);

  async function assign(courierUserId: string | null) {
    setAssigning(true);
    setError(null);
    try {
      await garageApi.post(`/api/courier/orders/${order.id}/assign`, { courierUserId });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menugaskan kurir.");
    } finally {
      setAssigning(false);
    }
  }

  const waOrder = {
    orderNo: order.orderNo,
    customerName: order.customerName,
    total: order.total,
    deliveryFee: order.deliveryFee,
    fulfillment: order.fulfillment,
    paymentMethod: order.paymentMethod,
    rejectionReason: order.rejectionReason,
    courierName: order.courierName,
    trackingUrl: trackingUrlFor(order),
    autoRejectMinutes,
  };
  const phoneOk = Boolean(waLink(order.customerPhone));
  const tone = isDelivery
    ? "border-garage-red/50 bg-garage-red/[0.07]"
    : "border-garage-amber/50 bg-garage-amber/[0.07]";

  return (
    <div className={`space-y-3 rounded-md border p-3 text-sm text-white ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`inline-flex items-center gap-2 font-black ${isDelivery ? "text-[#ffb3b3]" : "text-[#ffd79a]"}`}>
          {isDelivery ? <Bike className="size-4" aria-hidden /> : <Package className="size-4" aria-hidden />}
          {isDelivery ? "DELIVERY · wajib QRIS dulu" : "TAKE AWAY · wajib lunas dulu"}
        </p>
        {isDelivery && order.deliveryStatus ? (
          <span className="rounded-sm border border-garage-line-2 bg-garage-bg-2 px-2 py-0.5 text-xs font-bold">
            {deliveryStatusLabel[order.deliveryStatus] ?? order.deliveryStatus}
          </span>
        ) : null}
      </div>

      {isDelivery ? (
        <div className="space-y-1.5">
          <p className="flex items-start gap-2 break-words">
            <MapPin className="mt-0.5 size-4 shrink-0 text-garage-dim" aria-hidden />
            <span>{order.deliveryAddress ?? "-"}</span>
          </p>
          <p className="text-[#d0d0d6]">
            Pesanan {rupiah.format(order.total - (order.deliveryFee ?? 0))} + ongkir {rupiah.format(order.deliveryFee ?? 0)} ={" "}
            <span className="font-bold text-white">{rupiah.format(order.total)}</span>
          </p>
          {order.deliveryAddress ? (
            <a
              href={mapsSearchUrl(order.deliveryAddress)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#ffd79a] underline-offset-2 hover:underline"
            >
              <Navigation className="size-3.5" aria-hidden /> Buka alamat di Google Maps
            </a>
          ) : null}
        </div>
      ) : null}

      {isDelivery && paid ? (
        <div className="space-y-2 rounded-md border border-garage-line bg-garage-bg-2/70 p-2.5">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-garage-dim">
            <UserCheck className="size-3.5" aria-hidden /> Kurir
          </p>
          {couriers === null ? (
            <p className="text-xs text-garage-dim">Memuat daftar kurir…</p>
          ) : couriers.length === 0 ? (
            <p className="text-xs text-[#ffd79a]">
              Belum ada akun kurir aktif. Buat di Manajemen User: role Waiter, workstation &quot;Kurir delivery&quot;.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {couriers.map((courier) => {
                const selected = order.courierUserId === courier.userId;
                return (
                  <Button
                    key={courier.userId}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    aria-pressed={selected}
                    disabled={assigning || busy || order.deliveryStatus === "delivered"}
                    className="garage-press h-9 border-[#4a4a54] px-3 text-xs"
                    onClick={() => void assign(selected ? null : courier.userId)}
                  >
                    {courier.name}
                    {courier.activeDeliveries ? ` · ${courier.activeDeliveries} antaran` : " · kosong"}
                  </Button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-garage-dim">Status antar:</span>
            {(["preparing", "on_the_way", "delivered"] as const).map((step) => (
              <Button
                key={step}
                type="button"
                size="sm"
                variant={order.deliveryStatus === step ? "default" : "outline"}
                className="garage-press h-9 border-[#4a4a54] px-3 text-xs"
                disabled={busy}
                aria-pressed={order.deliveryStatus === step}
                onClick={() => onSetStatus(step)}
              >
                {deliveryStatusLabel[step]}
              </Button>
            ))}
          </div>
          {error ? <p className="text-xs font-semibold text-[#ffb3b3]">{error}</p> : null}
        </div>
      ) : isDelivery ? (
        <p className="text-xs text-[#d0d0d6]">Kurir & status antar bisa diatur setelah pembayaran QRIS dicek.</p>
      ) : null}

      <div className="space-y-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-garage-dim">
          <MessageCircle className="size-3.5" aria-hidden /> WA pelanggan {order.customerPhone ? `· ${order.customerPhone}` : ""}
        </p>
        {phoneOk ? (
          <div className="flex flex-wrap gap-2">
            {whatsappKindsFor(order).map((kind) => (
              <a
                key={kind}
                href={waLink(order.customerPhone, buildCustomerWhatsappMessage(waOrder, kind)) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="garage-press inline-flex h-9 items-center gap-1.5 rounded-md border border-[#25d366]/45 bg-[#25d366]/10 px-3 text-xs font-bold text-[#c7f9d8] hover:bg-[#25d366]/20"
              >
                <MessageCircle className="size-3.5" aria-hidden />
                {CUSTOMER_WHATSAPP_LABEL[kind]}
              </a>
            ))}
            <a
              href={`tel:${order.customerPhone}`}
              className="garage-press inline-flex h-9 items-center gap-1.5 rounded-md border border-garage-line-2 px-3 text-xs font-bold text-white hover:bg-garage-bg-3"
            >
              <Phone className="size-3.5" aria-hidden /> Telepon
            </a>
          </div>
        ) : (
          <p className="text-xs text-garage-dim">Nomor WA pelanggan tidak ada / tidak valid.</p>
        )}
      </div>
    </div>
  );
}
