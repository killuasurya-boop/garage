"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, CheckCircle2, UserCircle2, LogIn, LogOut, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type CheckResult = {
  staffName: string;
  role: string;
  currentState: "in" | "out";
  lastPunchAt: string | null;
  lastAction: "in" | "out" | null;
  schedule: { shiftType: string; startTime: string | null; endTime: string | null } | null;
};

function formatTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function EmployeeClockPanel() {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [time, setTime] = useState(new Date());
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const checkAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getPosition = useCallback(async (): Promise<{ latitude: number; longitude: number }> => {
    if (!navigator.geolocation) {
      throw new Error("Peramban tidak mendukung GPS. Absensi tidak dapat dilanjutkan.");
    }
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 8000,
      });
    }).catch(() => {
      throw new Error("Izin lokasi ditolak atau GPS tidak tersedia. Aktifkan GPS untuk absen.");
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  }, []);

  const handleCheck = useCallback(async () => {
    if (pin.length < 4) {
      setStatus("error");
      setMessage("PIN harus terdiri dari minimal 4 digit.");
      setTimeout(() => setStatus("idle"), 4000);
      return;
    }
    checkAbort.current?.abort();
    const ctrl = new AbortController();
    checkAbort.current = ctrl;
    setChecking(true);
    setStatus("idle");
    setMessage("");
    try {
      const res = await fetch("/api/hr/attendance/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinCode: pin }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal cek status");
      setCheck(data as CheckResult);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Gagal cek status");
      setTimeout(() => setStatus("idle"), 4000);
    } finally {
      setChecking(false);
    }
  }, [pin]);

  const handleClockInOut = async (action: "in" | "out") => {
    if (pin.length < 4) {
      setStatus("error");
      setMessage("PIN harus terdiri dari minimal 4 digit.");
      return;
    }

    setStatus("loading");

    let coords: { latitude: number; longitude: number };
    try {
      coords = await getPosition();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "GPS tidak tersedia.");
      setTimeout(() => setStatus("idle"), 5000);
      return;
    }

    try {
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinCode: pin, action, ...coords }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal mencatat absensi");
      }

      const lateNote =
        data.status === "late"
          ? " (Telat)"
          : data.status === "early_leave"
            ? " (Pulang Cepat)"
            : "";
      setStatus("success");
      setMessage(
        `Halo ${data.staffName || "Staff"}, berhasil Clock ${
          action === "in" ? "In" : "Out"
        } pukul ${time.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}${lateNote}.`,
      );
      setPin("");
      setCheck(null);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Gagal mencatat absensi");
    } finally {
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  const isIn = check?.currentState === "in";
  // Smart-disable: kalau sudah IN, tombol IN nonaktif; sebaliknya untuk OUT.
  const disableIn = status === "loading" || pin.length < 4 || (check ? isIn : false);
  const disableOut = status === "loading" || pin.length < 4 || (check ? !isIn : false);

  return (
    <Card className="border-zinc-800 bg-[#111116] w-full max-w-md mx-auto">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-xl font-bold text-white flex items-center justify-center gap-2">
          <Clock className="h-5 w-5 text-[#f5a742]" />
          Terminal Absensi Staf
        </CardTitle>
        <CardDescription className="text-[#8f8f99]">
          Masukkan PIN Anda untuk Clock In / Clock Out
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        <div className="text-center">
          <div className="text-3xl font-mono text-[#f5a742] tracking-wider font-bold mb-1">
            {time.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="text-sm text-zinc-500">
            {time.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <UserCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
              <Input
                type="password"
                inputMode="numeric"
                placeholder="Masukkan PIN Karyawan"
                className="pl-10 text-center text-lg tracking-[0.5em] h-12 border-zinc-700 bg-zinc-950 text-white"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/[^0-9]/g, ""));
                  setCheck(null); // status basi saat PIN diubah
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCheck();
                }}
                maxLength={8}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-12 shrink-0 border-zinc-700 bg-zinc-900 p-0 text-zinc-300 hover:bg-zinc-800"
              disabled={checking || pin.length < 4}
              onClick={() => void handleCheck()}
              title="Cek status absensi saya"
              aria-label="Cek status"
            >
              {checking ? (
                <Search className="h-5 w-5 animate-pulse" />
              ) : (
                <Search className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Status terkini staff (hasil cek) */}
          {check && (
            <div className="rounded-md border border-zinc-700 bg-zinc-900/60 p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{check.staffName}</p>
                  <p className="truncate text-xs text-zinc-400">{check.role}</p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                    isIn
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                      : "bg-zinc-700/40 text-zinc-300 ring-1 ring-zinc-600"
                  }`}
                >
                  {isIn ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
                  {isIn ? "Sedang Bekerja" : "Belum / Sudah Pulang"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                <span>
                  Punch terakhir:{" "}
                  <span className="font-mono text-zinc-200">
                    {check.lastAction ? `${check.lastAction === "in" ? "IN" : "OUT"} ${formatTime(check.lastPunchAt)}` : "belum ada"}
                  </span>
                </span>
                {check.schedule ? (
                  <span>
                    Shift:{" "}
                    <span className="font-mono text-zinc-200">
                      {check.schedule.startTime ?? "—"}–{check.schedule.endTime ?? "—"}
                    </span>
                  </span>
                ) : (
                  <span className="text-amber-400/80">Tidak ada jadwal shift hari ini</span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              className="h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-40"
              disabled={disableIn}
              onClick={() => handleClockInOut("in")}
            >
              <LogIn className="mr-1 h-4 w-4" /> CLOCK IN
            </Button>
            <Button
              className="h-12 bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-40"
              disabled={disableOut}
              onClick={() => handleClockInOut("out")}
            >
              <LogOut className="mr-1 h-4 w-4" /> CLOCK OUT
            </Button>
          </div>
          {check && (
            <p className="text-center text-[11px] text-zinc-500">
              {isIn
                ? "Anda sedang bekerja — hanya Clock Out yang aktif."
                : "Anda belum Clock In — hanya Clock In yang aktif."}
            </p>
          )}
        </div>

        {status === "success" && (
          <div className="rounded-md bg-emerald-950/40 border border-emerald-800 p-3 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-sm text-emerald-200">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-md bg-rose-950/40 border border-rose-800 p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 mt-0.5 shrink-0" />
            <p className="text-sm text-rose-200">{message}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
