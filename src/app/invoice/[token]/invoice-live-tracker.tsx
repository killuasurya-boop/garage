"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChefHat,
  Clock,
  PackageCheck,
  ReceiptText,
  Timer,
  Utensils,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type LiveStatus = {
  orderStatus: string;
  kitchenStatus: string;
  activeStep: number;
  targetMinutes: number | null;
  elapsedSeconds: number | null;
  remainingSeconds: number | null;
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
};

const POLL_INTERVAL_MS = 8000;
const TERMINAL_KITCHEN_STATUSES = new Set(["delivered", "completed", "rejected"]);

const stepDefs: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
  shortHint: string;
}> = [
  { id: "received", label: "Order Masuk", icon: ReceiptText, shortHint: "Pesanan terkirim" },
  { id: "cashier", label: "Diproses Kasir", icon: Clock, shortHint: "Verifikasi pembayaran" },
  { id: "kitchen", label: "Masuk Dapur", icon: Utensils, shortHint: "Antrian dapur" },
  { id: "cooking", label: "Dimasak", icon: ChefHat, shortHint: "Sedang dibuat" },
  { id: "ready", label: "Siap Diantar", icon: PackageCheck, shortHint: "Pesanan siap" },
  { id: "delivered", label: "Selesai", icon: CheckCircle2, shortHint: "Diterima" },
];

const stationIconMap: Record<string, LucideIcon> = {
  kitchen: ChefHat,
  bar: Utensils,
  barista: Utensils,
  waiter: PackageCheck,
};

const stationLabelMap: Record<string, string> = {
  kitchen: "Dapur",
  bar: "Bar",
  barista: "Bar / Barista",
  waiter: "Waiter",
};

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { timeStyle: "short" }).format(new Date(iso));

const formatMmSs = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.max(0, totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export function InvoiceLiveTracker({
  token,
  initialStatus,
}: {
  token: string;
  initialStatus: LiveStatus;
}) {
  const [status, setStatus] = useState<LiveStatus>(initialStatus);
  const [online, setOnline] = useState(true);
  // `tick` adalah snapshot Date.now() yang di-update setiap detik via interval.
  // Disimpan sbg state (bukan dipanggil di body) supaya purity-safe.
  const [tick, setTick] = useState<number>(() => Date.now());

  const isTerminal = TERMINAL_KITCHEN_STATUSES.has(status.kitchenStatus);

  // Polling untuk fetch ulang status dari server tiap 8 detik
  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoice/${token}/live-status`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { data?: LiveStatus };
      if (res.ok && json.data) {
        setStatus(json.data);
        setOnline(true);
      } else {
        setOnline(false);
      }
    } catch {
      setOnline(false);
    }
  }, [token]);

  useEffect(() => {
    if (isTerminal) return; // hentikan polling kalau sudah selesai/ditolak
    const interval = window.setInterval(() => {
      void refetch();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refetch, isTerminal]);

  // Local 1-second tick supaya countdown jalan mulus antar polling.
  // Tick disimpan sbg `Date.now()` snapshot — purity-safe untuk computed
  // values di bawah (tidak panggil Date.now() di body component).
  useEffect(() => {
    if (status.kitchenStatus !== "cooking" || !status.cookingStartedAt) return;
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [status.kitchenStatus, status.cookingStartedAt]);

  // Compute live countdown — pure expr menggunakan `tick` sebagai now-snapshot.
  // Re-render terjadi setiap detik karena setTick(Date.now()).
  let liveCountdown: {
    elapsedSeconds: number;
    remainingSeconds: number;
    progressPercent: number;
  } | null = null;
  if (status.kitchenStatus === "cooking" && status.cookingStartedAt && status.targetMinutes) {
    const startMs = new Date(status.cookingStartedAt).getTime();
    const nowMs = tick || startMs;
    const elapsedSeconds = Math.floor((nowMs - startMs) / 1000);
    const targetSeconds = status.targetMinutes * 60;
    const remainingSeconds = targetSeconds - elapsedSeconds;
    liveCountdown = {
      elapsedSeconds: Math.max(0, elapsedSeconds),
      remainingSeconds,
      progressPercent: Math.min(100, Math.max(0, (elapsedSeconds / targetSeconds) * 100)),
    };
  }

  // Rejected state — separate UI, no timeline
  if (status.activeStep < 0) {
    return (
      <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/16 text-[#ffc2c8]">
            <ReceiptText className="size-5" />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#ffc2c8]">
              Order Ditolak
            </p>
            <p className="mt-1 text-sm leading-6 text-[#ffe1e5]">
              Pesanan ditolak. Silakan hubungi outlet jika butuh bantuan.
            </p>
            {status.timestamps.rejected && (
              <p className="mt-1 text-xs text-[#ffc2c8]/80">
                {new Date(status.timestamps.rejected).toLocaleString("id-ID")}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const currentStep = stepDefs[status.activeStep] ?? stepDefs[1];
  const CurrentIcon = currentStep.icon;

  return (
    <div className="rounded-md border border-[#34343c] bg-[#17171c] p-4">
      {/* ── HEADER: current step + live indicator ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-12 shrink-0 items-center justify-center rounded-md border ${
              isTerminal
                ? "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#86efac]"
                : "border-[#f5a742]/55 bg-[#f5a742]/16 text-[#ffd79a]"
            }`}
          >
            <CurrentIcon className={`size-6 ${isTerminal ? "" : "animate-pulse"}`} />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
              Tracking Live
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-white sm:text-xl">
              {currentStep.label}
            </h2>
            <p className="mt-0.5 text-xs text-[#8f8f99]">
              {currentStep.shortHint} · Step {status.activeStep + 1} dari {stepDefs.length}
            </p>
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex flex-col items-end gap-1">
          {isTerminal ? (
            <span className="rounded-md border border-[#22c55e]/45 bg-[#22c55e]/12 px-2 py-1 font-mono text-[10px] text-[#86efac]">
              SELESAI
            </span>
          ) : online ? (
            <span className="flex items-center gap-1 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 px-2 py-1 font-mono text-[10px] text-[#ffd79a]">
              <Wifi className="size-3" />
              LIVE
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/10 px-2 py-1 font-mono text-[10px] text-[#ffc2c8]">
              <WifiOff className="size-3" />
              OFFLINE
            </span>
          )}
          <span className="font-mono text-[10px] text-[#8f8f99]">
            {status.activeStep + 1} / {stepDefs.length}
          </span>
        </div>
      </div>

      {/* ── COUNTDOWN TIMER (only saat cooking) ── */}
      {liveCountdown && (
        <div className="mt-4 rounded-md border border-[#f5a742]/40 bg-gradient-to-br from-[#f5a742]/14 to-[#f5a742]/4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Timer className="size-4 animate-pulse text-[#ffd79a]" />
              <p className="font-mono text-[11px] uppercase tracking-wide text-[#ffd79a]">
                {liveCountdown.remainingSeconds >= 0
                  ? "Estimasi siap dalam"
                  : "Lewat dari estimasi"}
              </p>
            </div>
            <p className="font-mono text-[10px] text-[#8f8f99]">
              Target {status.targetMinutes}m
            </p>
          </div>
          <p
            className={`mt-2 font-mono text-4xl font-bold tabular-nums leading-none ${
              liveCountdown.remainingSeconds >= 0 ? "text-white" : "text-[#ffc2c8]"
            }`}
          >
            {liveCountdown.remainingSeconds >= 0
              ? formatMmSs(liveCountdown.remainingSeconds)
              : `+${formatMmSs(Math.abs(liveCountdown.remainingSeconds))}`}
          </p>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#34343c]">
            <div
              className={`h-full transition-all duration-1000 ${
                liveCountdown.progressPercent >= 100 ? "bg-[#d11a2a]" : "bg-[#f5a742]"
              }`}
              style={{ width: `${Math.min(100, liveCountdown.progressPercent)}%` }}
            />
          </div>
          <p className="mt-1.5 font-mono text-[10px] text-[#b8b8bf]">
            Sudah berjalan {formatMmSs(liveCountdown.elapsedSeconds)} dari {status.targetMinutes}:00
          </p>
        </div>
      )}

      {/* ── STEP TIMELINE — compact dots dengan timestamp ── */}
      <div className="mt-4 space-y-2">
        {stepDefs.map((step, idx) => {
          const state =
            idx < status.activeStep
              ? "done"
              : idx === status.activeStep
                ? "active"
                : "pending";
          const Icon = step.icon;
          const timestamp = timestampForStep(step.id, status);
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-md border p-2.5 transition-all ${
                state === "done"
                  ? "border-[#22c55e]/40 bg-[#22c55e]/8"
                  : state === "active"
                    ? "border-[#f5a742]/55 bg-[#f5a742]/12"
                    : "border-[#34343c] bg-transparent opacity-60"
              }`}
            >
              <div
                className={`flex size-8 shrink-0 items-center justify-center rounded-md border ${
                  state === "done"
                    ? "border-[#22c55e]/50 bg-[#22c55e]/16 text-[#86efac]"
                    : state === "active"
                      ? "border-[#f5a742]/60 bg-[#f5a742]/18 text-[#ffd79a]"
                      : "border-[#4a4a54] bg-[#111116] text-[#8f8f99]"
                }`}
              >
                <Icon className={`size-4 ${state === "active" ? "animate-pulse" : ""}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-sm font-semibold ${
                      state === "pending" ? "text-[#8f8f99]" : "text-white"
                    }`}
                  >
                    {step.label}
                  </p>
                  {timestamp && (
                    <p className="font-mono text-[10px] text-[#8f8f99]">
                      {formatTime(timestamp)}
                    </p>
                  )}
                </div>
                <p
                  className={`text-[11px] leading-relaxed ${
                    state === "pending" ? "text-[#6b6b73]" : "text-[#b8b8bf]"
                  }`}
                >
                  {step.shortHint}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── STATIONS — per-stasiun breakdown ── */}
      {status.stations.length > 0 && (
        <div className="mt-4 rounded-md border border-[#34343c] bg-[#111116] p-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
            Status per stasiun
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {status.stations.map((s) => {
              const StationIcon = stationIconMap[s.station.toLowerCase()] ?? Utensils;
              const stationStatus = s.status;
              const stationLabel = stationLabelMap[s.station.toLowerCase()] ?? s.station;
              const tone =
                stationStatus === "delivered" || stationStatus === "completed"
                  ? "border-[#22c55e]/40 bg-[#22c55e]/8 text-[#86efac]"
                  : stationStatus === "ready"
                    ? "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]"
                    : stationStatus === "cooking"
                      ? "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd79a]"
                      : "border-[#34343c] bg-white/[0.03] text-[#b8b8bf]";
              return (
                <div key={s.ticketNo} className={`flex items-center gap-2 rounded-md border p-2 ${tone}`}>
                  <StationIcon className="size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{stationLabel}</p>
                    <p className="font-mono text-[10px] opacity-80">
                      {stationStatusLabel(stationStatus)} · {s.targetMinutes}m
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Updated timestamp */}
      <p className="mt-3 text-center font-mono text-[10px] text-[#8f8f99]">
        Update terakhir {formatTime(status.updatedAt)}
        {!isTerminal && online && " · Refresh otomatis tiap 8 detik"}
      </p>
    </div>
  );
}

function timestampForStep(stepId: string, status: LiveStatus): string | null {
  switch (stepId) {
    case "received":
      return status.timestamps.orderCreated;
    case "cashier":
      return status.timestamps.orderAccepted;
    case "kitchen":
      return status.timestamps.orderAccepted;
    case "cooking":
      return status.timestamps.cookingStarted;
    case "ready":
      return status.timestamps.ready;
    case "delivered":
      return status.timestamps.delivered;
    default:
      return null;
  }
}

function stationStatusLabel(status: string): string {
  const map: Record<string, string> = {
    queue: "Menunggu antrian",
    cooking: "Sedang dibuat",
    ready: "Siap diantar",
    delivered: "Sudah diterima",
    completed: "Selesai",
  };
  return map[status] ?? status;
}
