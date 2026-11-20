"use client";

// =============================================================================
// Komponen pelacak pesanan untuk pelanggan (menu digital & halaman invoice):
// - FulfillmentBadge: pembeda tipe pesanan (Makan di tempat / Take away / Delivery)
// - TrackerSteps: langkah status per tipe (Dimasak/Diracik → Dipacking → Diantar)
// - CourierLiveCard: posisi kurir di peta OpenStreetMap (tanpa API key)
// Status selalu teks + ikon, tidak hanya warna.
// =============================================================================

import {
  Bike,
  CheckCircle2,
  ChefHat,
  Coffee,
  ExternalLink,
  MapPin,
  Package,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
  Store,
  Utensils,
  UtensilsCrossed,
} from "lucide-react";
import { isCourierLocationStale } from "@/lib/courier-location-sync";
import type { LucideIcon } from "lucide-react";

export type TrackerStepView = { key: string; label: string; hint: string; state: "done" | "current" | "todo" };
export type CourierInfo = {
  name: string;
  lat: number | null;
  lng: number | null;
  locationAt: string | null;
  distanceKm: number | null;
};

type FulfillmentKind = "dine-in" | "takeaway" | "delivery";

const FULFILLMENT_STYLE: Record<FulfillmentKind, { label: string; hint: string; icon: LucideIcon; tone: string; text: string }> = {
  "dine-in": {
    label: "Makan di tempat",
    hint: "Diantar ke meja Anda",
    icon: UtensilsCrossed,
    tone: "border-[#c9ccd3]/45 bg-[#c9ccd3]/[0.08]",
    text: "text-[#e7e9ee]",
  },
  takeaway: {
    label: "Take away",
    hint: "Ambil sendiri di kasir Garage",
    icon: ShoppingBag,
    tone: "border-[#f5a742]/55 bg-[#f5a742]/[0.1]",
    text: "text-[#ffd79a]",
  },
  delivery: {
    label: "Delivery",
    hint: "Diantar kurir Garage ke alamat Anda",
    icon: Bike,
    tone: "border-[#d11a2a]/55 bg-[#d11a2a]/[0.1]",
    text: "text-[#ffc2c8]",
  },
};

export function normalizeKind(value: string | null | undefined): FulfillmentKind {
  return value === "takeaway" || value === "delivery" ? value : "dine-in";
}

/** Banner pembeda tipe pesanan — ikon + warna + teks. */
export function FulfillmentBadge({
  fulfillment,
  tableLabel,
  compact = false,
}: {
  fulfillment: string | null | undefined;
  tableLabel?: string | null;
  compact?: boolean;
}) {
  const kind = normalizeKind(fulfillment);
  const style = FULFILLMENT_STYLE[kind];
  const Icon = style.icon;
  const detail = kind === "dine-in" && tableLabel ? tableLabel : style.hint;
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-black uppercase tracking-wide ${style.tone} ${style.text}`}>
        <Icon className="size-3.5" aria-hidden />
        {style.label}
        {kind === "dine-in" && tableLabel ? ` · ${tableLabel}` : ""}
      </span>
    );
  }
  return (
    <div className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${style.tone}`}>
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-md border border-current/30 ${style.text}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-black uppercase tracking-wide ${style.text}`}>{style.label}</p>
        <p className="text-xs text-[#d0d0d6]">{detail}</p>
      </div>
    </div>
  );
}

const STEP_ICON: Record<string, LucideIcon> = {
  received: ReceiptText,
  production: ChefHat,
  ready: PackageCheck,
  packing: Package,
  pickup: Store,
  on_the_way: Bike,
  arrived: CheckCircle2,
  served: Utensils,
};

function productionIcon(label: string) {
  return label === "Diracik" ? Coffee : ChefHat;
}

/** Langkah status vertikal: selesai (silver), sedang (amber), berikutnya (redup). */
export function TrackerSteps({ steps }: { steps: TrackerStepView[] }) {
  if (!steps.length) return null;
  const current = steps.find((step) => step.state === "current");
  return (
    <div className="space-y-2">
      {current ? (
        <p className="text-xs font-bold uppercase tracking-wide text-[#ffd79a]">
          Sekarang: {current.label}
        </p>
      ) : steps.every((step) => step.state === "done") ? (
        <p className="text-xs font-bold uppercase tracking-wide text-[#e7e9ee]">Pesanan selesai</p>
      ) : (
        <p className="text-xs font-bold uppercase tracking-wide text-garage-dim">Menunggu pembayaran dicek kasir</p>
      )}
      <ol className="space-y-1.5">
        {steps.map((step) => {
          const Icon = step.key === "production" ? productionIcon(step.label) : (STEP_ICON[step.key] ?? CheckCircle2);
          const tone =
            step.state === "done"
              ? "border-[#c9ccd3]/40 bg-[#c9ccd3]/[0.07] text-[#e7e9ee]"
              : step.state === "current"
                ? "border-[#f5a742]/60 bg-[#f5a742]/[0.12] text-[#ffd79a]"
                : "border-[#34343c] bg-transparent text-[#8f8f99]";
          return (
            <li key={step.key} className={`flex items-center gap-3 rounded-md border px-2.5 py-2 ${tone}`}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-current/35">
                {step.state === "done" ? <CheckCircle2 className="size-4" aria-hidden /> : <Icon className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${step.state === "todo" ? "text-[#8f8f99]" : "text-white"}`}>{step.label}</p>
                <p className="text-xs leading-snug opacity-90">{step.hint}</p>
              </div>
              <span className="shrink-0 text-[11px] font-bold uppercase">
                {step.state === "done" ? "Selesai" : step.state === "current" ? "Proses" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function minutesAgo(iso: string, nowMs: number) {
  const diff = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60_000));
  return diff <= 0 ? "baru saja" : `${diff} menit lalu`;
}

/** Kartu kurir: nama, jarak, update terakhir, peta OSM, tombol buka di Google Maps. */
export function CourierLiveCard({
  courier,
  deliveryStatus,
  nowMs,
}: {
  courier: CourierInfo;
  deliveryStatus: string | null | undefined;
  nowMs: number;
}) {
  const moving = deliveryStatus === "on_the_way" || deliveryStatus === "picked_up";
  const hasPoint = courier.lat != null && courier.lng != null;
  const stale = isCourierLocationStale(courier.locationAt, nowMs);
  const d = 0.006;
  const mapSrc = hasPoint
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${(courier.lng as number) - d},${(courier.lat as number) - d},${
        (courier.lng as number) + d
      },${(courier.lat as number) + d}&layer=mapnik&marker=${courier.lat},${courier.lng}`
    : null;
  return (
    <div className="space-y-2 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/[0.06] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-black text-white">
          <Bike className="size-4 text-[#ffc2c8]" aria-hidden /> Kurir: {courier.name}
        </p>
        {deliveryStatus === "delivered" ? (
          <span className="text-xs font-bold text-[#e7e9ee]">Sudah sampai</span>
        ) : moving ? (
          <span className="text-xs font-bold text-[#ffd79a]">Dalam perjalanan</span>
        ) : (
          <span className="text-xs font-bold text-[#d0d0d6]">Menunggu pesanan siap</span>
        )}
      </div>
      {moving && hasPoint && stale ? (
        <p role="status" className="text-sm text-[#ffd79a]">Posisi terakhir — GPS belum diperbarui lebih dari 90 detik. Posisi kurir saat ini belum dapat dipastikan.</p>
      ) : null}
      {moving && hasPoint ? (
        <>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#d0d0d6]">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {courier.distanceKm != null ? `${stale ? "Jarak dari posisi terakhir: " : ""}± ${courier.distanceKm.toLocaleString("id-ID")} km dari lokasi Anda` : "Posisi kurir"}
            </span>
            {courier.locationAt ? <span>Update {minutesAgo(courier.locationAt, nowMs)}</span> : null}
          </p>
          {mapSrc ? (
            <iframe
              title={stale ? "Posisi terakhir kurir" : "Posisi kurir"}
              src={mapSrc}
              loading="lazy"
              className="h-48 w-full rounded-md border border-[#34343c] bg-[#111116]"
            />
          ) : null}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${courier.lat},${courier.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#ffd79a] underline-offset-2 hover:underline"
          >
            <ExternalLink className="size-3.5" aria-hidden /> Buka di Google Maps
          </a>
        </>
      ) : moving ? (
        <p className="text-xs text-[#d0d0d6]">Menunggu sinyal GPS kurir…</p>
      ) : null}
    </div>
  );
}
