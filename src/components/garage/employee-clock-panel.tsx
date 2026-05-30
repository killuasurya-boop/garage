"use client";

import { useState, useEffect } from "react";
import { Clock, CheckCircle2, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function EmployeeClockPanel() {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleClockInOut = async (action: "in" | "out") => {
    if (pin.length < 4) {
      setStatus("error");
      setMessage("PIN harus terdiri dari minimal 4 digit.");
      return;
    }

    setStatus("loading");

    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("Peramban tidak mendukung GPS. Absensi tidak dapat dilanjutkan.");
      setTimeout(() => setStatus("idle"), 5000);
      return;
    }

    let latitude: number;
    let longitude: number;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        });
      });
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch {
      setStatus("error");
      setMessage("Izin lokasi ditolak atau GPS tidak tersedia. Aktifkan GPS untuk absen.");
      setTimeout(() => setStatus("idle"), 5000);
      return;
    }

    try {
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinCode: pin, action, latitude, longitude }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal mencatat absensi");
      }

      setStatus("success");
      setMessage(`Halo ${data.staffName || "Staff"}, berhasil Clock ${action === "in" ? "In" : "Out"} pada ${time.toLocaleTimeString()}`);
      setPin("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Gagal mencatat absensi");
    } finally {
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

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
      <CardContent className="space-y-6 pt-4">
        <div className="text-center">
          <div className="text-3xl font-mono text-[#f5a742] tracking-wider font-bold mb-1">
            {time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-sm text-zinc-500">
            {time.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <UserCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
            <Input
              type="password"
              placeholder="Masukkan PIN Karyawan"
              className="pl-10 text-center text-lg tracking-[0.5em] h-12 border-zinc-700 bg-zinc-950 text-white"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
              maxLength={6}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              className="h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              disabled={status === "loading" || pin.length < 4}
              onClick={() => handleClockInOut("in")}
            >
              CLOCK IN
            </Button>
            <Button
              className="h-12 bg-rose-600 hover:bg-rose-500 text-white font-semibold"
              disabled={status === "loading" || pin.length < 4}
              onClick={() => handleClockInOut("out")}
            >
              CLOCK OUT
            </Button>
          </div>
        </div>

        {status === "success" && (
          <div className="rounded-md bg-emerald-950/40 border border-emerald-800 p-3 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-sm text-emerald-200">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-md bg-rose-950/40 border border-rose-800 p-3">
            <p className="text-sm text-rose-200 text-center">{message}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
