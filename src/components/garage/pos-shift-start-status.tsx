"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, KeyRound, Loader2, PlayCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { garageApi } from "@/lib/api-client";

export type TodayShiftStatus = {
  shifts: Array<{
    shiftNumber: number;
    id: string;
    code: string;
    status: string;
    cashierName: string;
    openedAt: string;
    closedAt: string | null;
    mine: boolean;
  }>;
  appliesLimit: boolean;
  nextShiftNumber: number;
  limitReached: boolean;
  openByOther: { code: string; cashierName: string; openedAt: string } | null;
  previousFloat: { amount: number; code: string; closedAt: string | null } | null;
  myOpenSession: {
    id: string;
    code: string;
    openedAt: string;
    outletName: string | null;
    sameOutlet: boolean;
  } | null;
};

const clock = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const dateClock = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Bagian atas dialog "Mulai Shift Kasir": nomor shift ditentukan sistem dari
 * shift yang sudah terpakai hari ini (bukan ditebak kasir), siapa memakai
 * Shift 1/2, dan jalan keluar bila tertahan:
 * - shift sendiri masih terbuka → "Lanjutkan shift saya";
 * - shift kasir lain masih terbuka → siapa & sejak kapan, ditutup Manajer/Owner;
 * - Shift 1 & 2 terpakai → PIN Manajer/Owner untuk shift tambahan.
 */
export function ShiftStartStatus({
  onShiftNumber,
  onSuggestOpeningCash,
  managerPin,
  onManagerPinChange,
  onResume,
  refreshKey = 0,
}: {
  onShiftNumber: (value: number) => void;
  /** Modal yang ditinggal shift sebelumnya (kelipatan Rp 50.000) → isi otomatis modal awal. */
  onSuggestOpeningCash?: (amount: number) => void;
  managerPin: string;
  onManagerPinChange: (value: string) => void;
  onResume: () => Promise<void> | void;
  refreshKey?: number;
}) {
  const [status, setStatus] = useState<TodayShiftStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  // Callback dari induk biasanya inline → simpan di ref agar fetch tidak berulang.
  const callbacksRef = useRef({ onShiftNumber, onSuggestOpeningCash });
  useEffect(() => {
    callbacksRef.current = { onShiftNumber, onSuggestOpeningCash };
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await garageApi.get<TodayShiftStatus>("/api/finance/cash-sessions/today", {
        cache: "no-store",
      });
      setStatus(data);
      const { onShiftNumber: setShift, onSuggestOpeningCash: suggest } = callbacksRef.current;
      setShift(data.nextShiftNumber);
      const float = data.previousFloat?.amount ?? 0;
      if (suggest && float >= 50_000 && float <= 500_000 && float % 50_000 === 0) {
        suggest(float);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Status shift gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch status shift saat dialog dibuka/diminta ulang
    void load();
  }, [load, refreshKey]);

  async function resume() {
    setResuming(true);
    try {
      await onResume();
    } finally {
      setResuming(false);
    }
  }

  const next = status?.nextShiftNumber ?? 1;
  const slots = status?.appliesLimit ? [1, 2] : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="garage-mono text-[10px] text-[#b8b8bf]">Shift kasir hari ini</p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs text-[#d6d6dc] hover:bg-white/10"
          aria-label="Muat ulang status shift"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Muat ulang
        </button>
      </div>

      {loading && !status ? (
        <p className="flex items-center gap-2 text-sm text-[#b8b8bf]" role="status">
          <Loader2 className="size-4 animate-spin" /> Memuat status shift…
        </p>
      ) : null}
      {loadError ? (
        <p className="text-sm text-[#ffb3b3]" role="alert">
          {loadError}
        </p>
      ) : null}

      {status ? (
        <>
          {status.appliesLimit ? (
            <div className="grid grid-cols-2 gap-2">
              {slots.map((slot) => {
                const used = status.shifts.find((row) => row.shiftNumber === slot);
                const isNext = !used && slot === next;
                return (
                  <div
                    key={slot}
                    className={`rounded-md border px-3 py-2.5 ${
                      isNext
                        ? "border-[#f5a742] bg-[#f5a742] text-[#111116]"
                        : used?.status === "open"
                          ? "border-[#f5a742]/60 bg-[#f5a742]/12 text-[#f4f4f5]"
                          : "border-[#4a4a54] bg-white/[0.055] text-[#f4f4f5]"
                    }`}
                  >
                    <span className="block text-sm font-black">
                      Shift {slot} · {slot === 1 ? "Pembuka" : "Lanjutan"}
                    </span>
                    <span className={`mt-1 block text-xs ${isNext ? "font-semibold" : "text-[#d6d6dc]"}`}>
                      {used
                        ? `${used.mine ? "Anda" : used.cashierName} · ${clock(used.openedAt)}–${
                            used.closedAt ? clock(used.closedAt) : "sekarang"
                          }`
                        : isNext
                          ? "Akan Anda buka sekarang"
                          : "Belum dipakai"}
                    </span>
                    {used ? (
                      <span
                        className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          used.status === "open"
                            ? "bg-[#f5a742]/25 text-[#ffd08a]"
                            : "bg-white/10 text-[#d4d4d8]"
                        }`}
                      >
                        {used.status === "open" ? "Masih buka" : "Ditutup"}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-md border border-[#4a4a54] bg-white/[0.055] px-3 py-2.5 text-sm text-[#f4f4f5]">
              Manajer/Owner tidak dibatasi Shift 1/2.
              {status.shifts.length
                ? ` Hari ini sudah ${status.shifts.length} shift kasir dibuka.`
                : ""}
            </p>
          )}

          {status.appliesLimit && status.shifts.length > 2 ? (
            <ul className="space-y-1 text-xs text-[#d6d6dc]">
              {status.shifts.slice(2).map((row) => (
                <li key={row.id}>
                  Shift tambahan {row.shiftNumber}: {row.mine ? "Anda" : row.cashierName} ·{" "}
                  {clock(row.openedAt)}–{row.closedAt ? clock(row.closedAt) : "sekarang"}
                </li>
              ))}
            </ul>
          ) : null}

          {status.previousFloat && !status.myOpenSession ? (
            <p className="rounded-md border border-[#4a4a54] bg-white/[0.055] px-3 py-2 text-xs leading-5 text-[#d6d6dc]">
              Shift sebelumnya ({status.previousFloat.code}) meninggalkan{" "}
              <strong className="text-white">
                {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
                  status.previousFloat.amount,
                )}
              </strong>{" "}
              di laci. Hitung ulang sebelum mulai; isi modal awal sesuai uang yang benar-benar ada.
            </p>
          ) : null}

          {status.myOpenSession ? (
            <div className="rounded-md border border-[#f5a742]/55 bg-[#f5a742]/12 p-3 text-sm text-[#f4f4f5]" role="status">
              <p className="font-semibold text-white">Shift Anda masih terbuka</p>
              <p className="mt-1 text-[#d6d6dc]">
                {status.myOpenSession.code} sejak {dateClock(status.myOpenSession.openedAt)}
                {status.myOpenSession.sameOutlet
                  ? ". Lanjutkan shift ini — tidak perlu buka shift baru."
                  : ` di ${status.myOpenSession.outletName ?? "outlet lain"}. Tutup shift itu dulu atau minta Manajer/Owner menutupnya.`}
              </p>
              {status.myOpenSession.sameOutlet ? (
                <Button
                  type="button"
                  className="garage-press mt-2 h-10 w-full gap-2"
                  disabled={resuming}
                  onClick={() => void resume()}
                >
                  {resuming ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
                  Lanjutkan shift saya
                </Button>
              ) : null}
            </div>
          ) : status.openByOther ? (
            <div className="flex gap-2 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#f4f4f5]" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#ff8a95]" />
              <div>
                <p className="font-semibold text-white">
                  Laci masih dipegang {status.openByOther.cashierName}
                </p>
                <p className="mt-1 text-[#d6d6dc]">
                  Shift {status.openByOther.code} buka sejak {clock(status.openByOther.openedAt)}.{" "}
                  {status.openByOther.cashierName} harus tutup shift dulu, atau Manajer/Owner menutupnya
                  di halaman Riwayat Shift (/shift) → Rekap Harian → <strong>Tutup shift</strong>.
                </p>
              </div>
            </div>
          ) : status.limitReached ? (
            <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#f4f4f5]">
              <p className="font-semibold text-white">Shift 1 & Shift 2 hari ini sudah terpakai</p>
              <p className="mt-1 text-[#d6d6dc]">
                Salah buka/tutup shift? Minta Manajer/Owner yang hadir memasukkan PIN untuk membuka
                shift tambahan (Shift {next}). Tercatat di audit atas nama penyetuju.
              </p>
              <label htmlFor="shift-manager-pin" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#ffd08a]">
                <KeyRound className="size-3.5" /> PIN Manajer/Owner
              </label>
              <Input
                id="shift-manager-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                value={managerPin}
                onChange={(event) => onManagerPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="4–8 digit"
                className="mt-1 h-11 border-[#4a4a54] bg-black/30 font-mono tracking-[0.3em]"
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
