"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bike, Check, ChefHat, Coffee, ConciergeBell, PackageCheck, PackageOpen, Timer, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CourierLiveCard, type CourierInfo } from "@/components/garage/order-progress";
import { invoiceFlowSteps, invoiceStationCards, type FulfillmentKind } from "@/lib/invoice-v4";

export type InvoiceLiveStatus = {
  orderStatus: string;
  kitchenStatus: string;
  activeStep: number;
  targetMinutes: number | null;
  cookingStartedAt: string | null;
  timestamps: {
    orderCreated: string;
    orderAccepted: string | null;
    cookingStarted: string | null;
    ready: string | null;
    delivered: string | null;
    rejected: string | null;
  };
  stations: Array<{
    ticketNo: string;
    station: string;
    status: string;
    targetMinutes: number;
    acceptedAt: string | null;
    readyAt: string | null;
    deliveredAt: string | null;
  }>;
  updatedAt: string;
  fulfillment?: FulfillmentKind;
  deliveryStatus?: string | null;
  rejectionReason?: string | null;
  courier?: CourierInfo | null;
};

const POLL_MS = 8000;
const STATION_ICON: Record<string, LucideIcon> = {
  bar: Coffee,
  dapur: ChefHat,
  waiter: ConciergeBell,
  pickup: PackageOpen,
  courier: Bike,
};

const time = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : null;

const mmss = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.max(0, seconds % 60)).padStart(2, "0")}`;

/** SECTION 03 — Live tracking (polling 8 dtk, berhenti saat selesai/ditolak). */
export function InvoiceLiveTrackerV4({
  token,
  initialStatus,
  onTerminal,
}: {
  token: string;
  initialStatus: InvoiceLiveStatus;
  onTerminal?: () => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [online, setOnline] = useState(true);
  const [tick, setTick] = useState(() => Date.now());
  const reduce = useReducedMotion();
  const router = useRouter();
  const lastOrderStatus = useRef(initialStatus.orderStatus);

  // Status order berubah (mis. kasir konfirmasi pembayaran) → muat ulang data server
  // agar total, status Lunas & panel QRIS ikut benar. Tanpa reload halaman penuh.
  useEffect(() => {
    if (status.orderStatus === lastOrderStatus.current) return;
    lastOrderStatus.current = status.orderStatus;
    router.refresh();
  }, [status.orderStatus, router]);

  const terminal =
    status.activeStep < 0 ||
    (status.fulfillment === "delivery"
      ? status.deliveryStatus === "delivered"
      : ["delivered", "completed", "rejected"].includes(status.kitchenStatus));

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoice/${token}/live-status`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { data?: InvoiceLiveStatus };
      if (res.ok && json.data) {
        setStatus(json.data);
        setOnline(true);
      } else setOnline(false);
    } catch {
      setOnline(false);
    }
  }, [token]);

  useEffect(() => {
    if (terminal) {
      onTerminal?.();
      return;
    }
    const id = window.setInterval(() => void refetch(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch, terminal, onTerminal]);

  useEffect(() => {
    if (status.kitchenStatus !== "cooking" || !status.cookingStartedAt) return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status.kitchenStatus, status.cookingStartedAt]);

  if (status.activeStep < 0) {
    return (
      <section className="iv-card iv-card-pad iv-reveal" aria-live="polite">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 size-6 shrink-0 text-[var(--iv-red)]" aria-hidden />
          <div>
            <h2 className="iv-card-title">Pesanan Dibatalkan</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--iv-text-2)]">
              Pesanan tidak dapat diproses{status.rejectionReason ? `: ${status.rejectionReason}` : ""}. Hubungi kasir untuk info lebih lanjut.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const steps = invoiceFlowSteps(status);
  const stations = invoiceStationCards({
    stations: status.stations,
    kitchenStatus: status.kitchenStatus,
    fulfillment: status.fulfillment,
    deliveryStatus: status.deliveryStatus,
    deliveredAt: status.timestamps.delivered,
  });

  let countdown: { remaining: number; percent: number } | null = null;
  if (status.kitchenStatus === "cooking" && status.cookingStartedAt && status.targetMinutes) {
    const elapsed = Math.max(0, Math.floor((tick - new Date(status.cookingStartedAt).getTime()) / 1000));
    const target = status.targetMinutes * 60;
    countdown = { remaining: target - elapsed, percent: Math.min(100, (elapsed / target) * 100) };
  }

  return (
    <section className="iv-card iv-card-pad iv-reveal" aria-labelledby="iv-track-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="iv-track-title" className="iv-card-title">
          <PackageCheck className="size-5" aria-hidden />
          Status Pesanan <span className="text-[13px] font-semibold text-[var(--iv-text-3)]">(Live Tracking)</span>
        </h2>
        <span className="iv-chip text-[12px]" role="status">
          {terminal ? (
            <>
              <Check className="size-3.5 text-[var(--iv-green-text)]" aria-hidden /> Selesai
            </>
          ) : online ? (
            <>
              <span className="iv-live-dot" aria-hidden /> Live · {time(status.updatedAt)}
            </>
          ) : (
            <span className="text-[var(--iv-red-text)]">Offline — mencoba lagi</span>
          )}
        </span>
      </div>

      <ol className="iv-steps mt-5" aria-label="Progres pesanan">
        {steps.map((step) => (
          <li key={step.key} className="iv-step" data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
            <span className="iv-step-dot">
              <AnimatePresence initial={false} mode="wait">
                {step.state === "done" ? (
                  <motion.span
                    key="done"
                    initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Check className="size-4" strokeWidth={3} aria-hidden />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </span>
            <span className="iv-step-label">{step.label}</span>
            <span className="iv-step-time">{time(step.at) ?? " "}</span>
            <span className="sr-only">{step.state === "done" ? "selesai" : step.state === "current" ? "sedang berlangsung" : "menunggu"}</span>
          </li>
        ))}
      </ol>

      {countdown ? (
        <div className="iv-subcard mt-4 flex items-center gap-3 p-3">
          <Timer className="size-5 shrink-0 text-[var(--iv-amber)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-[var(--iv-text-2)]">{countdown.remaining >= 0 ? "Estimasi siap dalam" : "Sedikit lewat estimasi"}</p>
            <div className="iv-progress mt-1.5">
              <span style={{ width: `${countdown.percent}%` }} />
            </div>
          </div>
          <span className="iv-money text-xl text-[var(--iv-cream)]">
            {countdown.remaining >= 0 ? mmss(countdown.remaining) : `+${mmss(Math.abs(countdown.remaining))}`}
          </span>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {stations.map((card) => {
          const Icon = STATION_ICON[card.key] ?? ChefHat;
          return (
            <div key={card.key} className="iv-station" data-tone={card.tone}>
              <Icon className="size-6 shrink-0 text-[var(--iv-text-2)]" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-[var(--iv-cream)]">{card.label}</p>
                <p className="iv-station-status flex items-center gap-1">
                  {card.tone === "done" ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
                  {card.status}
                </p>
                {card.at ? <p className="text-[12px] text-[var(--iv-text-3)]">{time(card.at)}</p> : null}
              </div>
            </div>
          );
        })}
      </div>

      {status.fulfillment === "delivery" && status.courier ? (
        <div className="mt-4">
          <CourierLiveCard courier={status.courier} deliveryStatus={status.deliveryStatus} nowMs={tick} />
        </div>
      ) : null}
    </section>
  );
}
