"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TodayRow {
  id: string;
  checkinAt: string | null;
  checkoutAt: string | null;
  status: string;
  lateMinutes: number;
  workedMinutes: number;
}

type PhaseState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; hasCheckin: boolean; hasCheckout: boolean }
  | { phase: "capturing" }
  | { phase: "submitting" }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string };

export function AbsenV2Panel() {
  const [today, setToday] = useState<TodayRow | null>(null);
  const [state, setState] = useState<PhaseState>({ phase: "loading" });
  const [pin, setPin] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const refreshToday = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance-v2/today");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal ambil status");
      const row = json.data?.attendance as TodayRow | null;
      setToday(row);
      setState({
        phase: "ready",
        hasCheckin: Boolean(row?.checkinAt),
        hasCheckout: Boolean(row?.checkoutAt),
      });
    } catch (err) {
      setState({ phase: "error", message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshToday();
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => setGpsError(err.message),
        { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
      );
    } else {
      setGpsError("Peramban tidak mendukung GPS.");
    }
  }, [refreshToday]);

  const openCamera = useCallback(async () => {
    setState({ phase: "capturing" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setState({ phase: "error", message: `Kamera gagal: ${(err as Error).message}` });
    }
  }, []);

  const captureSelfie = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    setSnapshot(dataUrl);
    const stream = video.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    setState({
      phase: "ready",
      hasCheckin: Boolean(today?.checkinAt),
      hasCheckout: Boolean(today?.checkoutAt),
    });
  }, [today]);

  const submit = useCallback(
    async (kind: "checkin" | "checkout") => {
      if (pin.length < 4) return setState({ phase: "error", message: "PIN wajib." });
      if (!snapshot) return setState({ phase: "error", message: "Selfie wajib." });
      if (!gps) return setState({ phase: "error", message: gpsError ?? "GPS belum siap." });
      setState({ phase: "submitting" });
      try {
        const res = await fetch(`/api/attendance-v2/${kind}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pin,
            lat: gps.lat,
            lng: gps.lng,
            selfieBase64: snapshot,
            device: navigator.userAgent.slice(0, 60),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? "Gagal absen");
        setPin("");
        setSnapshot(null);
        setState({
          phase: "success",
          message: kind === "checkin" ? "Check-in berhasil ✅" : "Check-out berhasil ✅",
        });
        setTimeout(() => void refreshToday(), 1500);
      } catch (err) {
        setState({ phase: "error", message: (err as Error).message });
      }
    },
    [pin, snapshot, gps, gpsError, refreshToday],
  );

  const hasCheckin = Boolean(today?.checkinAt);
  const hasCheckout = Boolean(today?.checkoutAt);
  const nextAction: "checkin" | "checkout" = hasCheckin && !hasCheckout ? "checkout" : "checkin";
  const btnLabel = hasCheckin && !hasCheckout ? "ABSEN KELUAR" : "ABSEN MASUK";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4 space-y-2">
        <div className="text-xs uppercase text-[var(--garage-mute)] tracking-wider">
          Status Hari Ini
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[var(--garage-mute)]">Masuk</div>
            <div className="font-semibold text-[var(--garage-fg)]">
              {today?.checkinAt ? new Date(today.checkinAt).toLocaleTimeString("id-ID") : "—"}
            </div>
          </div>
          <div>
            <div className="text-[var(--garage-mute)]">Keluar</div>
            <div className="font-semibold text-[var(--garage-fg)]">
              {today?.checkoutAt ? new Date(today.checkoutAt).toLocaleTimeString("id-ID") : "—"}
            </div>
          </div>
        </div>
        <div className="text-xs text-[var(--garage-mute)]">
          {gps ? `GPS OK (${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})` : gpsError ?? "Menunggu GPS…"}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4 space-y-3">
        <div className="text-xs uppercase text-[var(--garage-mute)] tracking-wider">Selfie</div>
        {snapshot ? (
          <img
            src={snapshot}
            alt="selfie"
            className="w-full rounded-xl border border-[var(--garage-bg-3)]"
          />
        ) : state.phase === "capturing" ? (
          <div className="space-y-2">
            <video
              ref={videoRef}
              className="w-full rounded-xl border border-[var(--garage-bg-3)] bg-black"
              muted
              playsInline
            />
            <button
              onClick={captureSelfie}
              className="w-full py-3 rounded-xl bg-[var(--garage-amber)] text-black font-semibold"
            >
              Ambil Foto
            </button>
          </div>
        ) : (
          <button
            onClick={openCamera}
            className="w-full py-4 rounded-xl border-2 border-dashed border-[var(--garage-bg-3)] text-[var(--garage-mute)] text-sm"
          >
            Buka Kamera Depan
          </button>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4 space-y-3">
        <div className="text-xs uppercase text-[var(--garage-mute)] tracking-wider">PIN Anda</div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="w-full text-center text-2xl tracking-widest py-3 rounded-xl bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)]"
          placeholder="••••••"
        />
      </div>

      <button
        onClick={() => void submit(nextAction)}
        disabled={state.phase === "submitting" || hasCheckin && hasCheckout}
        className="w-full py-5 rounded-2xl text-lg font-bold uppercase tracking-widest bg-[var(--garage-red)] text-white disabled:opacity-40"
      >
        {hasCheckin && hasCheckout ? "SELESAI HARI INI ✅" : btnLabel}
      </button>

      {state.phase === "error" && (
        <div className="rounded-xl bg-[var(--garage-red-deep)] border border-[var(--garage-red-bright)] px-4 py-3 text-white text-sm">
          {state.message}
        </div>
      )}
      {state.phase === "success" && (
        <div className="rounded-xl bg-emerald-950 border border-emerald-600 px-4 py-3 text-emerald-100 text-sm">
          {state.message}
        </div>
      )}
    </div>
  );
}
