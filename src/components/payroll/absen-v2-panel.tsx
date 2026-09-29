"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Clock, FileDown, LogOut, MapPin, RefreshCw, Wallet } from "lucide-react";

// Terminal absen HP karyawan. Login pakai KODE + PIN (identitas absen payroll),
// BUKAN akun sistem. PIN hanya disimpan di memori tab, tidak di storage.

type Employee = { code: string; name: string; position: string | null; dailyWage: number };
type Today = {
  checkinAt: string | null;
  checkoutAt: string | null;
  status: string;
  lateMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
} | null;
type GajiEntry = {
  date: string;
  kind: "harian" | "bonus" | "potongan";
  baseWage: number;
  overtimeAmount: number;
  bonusAmount: number;
  totalCredited: number;
  lateMinutes: number;
  paid: boolean;
};
type FeeEntry = { date: string; amount: number; paid: boolean };
type Dashboard = {
  shiftStart: string; // "HH:MM" jam masuk shift karyawan ini
  today: Today;
  wallet: {
    gaji: { balance: number; entries: GajiEntry[] };
    fee: { balance: number; entries: FeeEntry[] };
    advance: number;
  };
  thr?: Array<{ holidayName: string; holidayDate: string; amount: number; paidAt: string }>;
};
type Credentials = { code: string; pin: string };

const CODE_STORAGE_KEY = "garage-absen-code";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error?.message ?? "Permintaan gagal.");
  return json.data as T;
}

const rupiah = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;

const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      })
    : "—";

const dayLabel = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00+07:00`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });

const STATUS_LABEL: Record<string, string> = {
  pending: "Sudah masuk",
  valid: "Valid",
  invalid: "Tidak valid",
  absent: "Tidak hadir",
};

function gajiLabel(e: GajiEntry): string {
  if (e.kind === "bonus") return "Bonus kehadiran";
  if (e.kind === "potongan") return "Potongan tetap bulanan (BPJS)";
  const parts: string[] = [];
  if (e.totalCredited === 0) {
    parts.push(e.lateMinutes > 0 ? `Hangus · telat ${e.lateMinutes} mnt` : "Tidak valid");
  } else if (e.lateMinutes > 0) {
    parts.push(`Telat ${e.lateMinutes} mnt`);
  } else {
    parts.push("Tepat waktu");
  }
  if (e.overtimeAmount > 0) parts.push(`lembur ${rupiah(e.overtimeAmount)}`);
  return parts.join(" · ");
}

const DEVICE_STORAGE_KEY = "garage-absen-device";

/**
 * Label perangkat untuk absen: "dev:<id acak per HP> <user-agent>". ID disimpan
 * di HP ini sehingga manajer bisa melihat bila satu HP dipakai beberapa orang.
 */
function deviceLabel(): string {
  let id = "";
  try {
    id = window.localStorage.getItem(DEVICE_STORAGE_KEY) ?? "";
    if (!/^[\w-]{6,24}$/.test(id)) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
        .replace(/-/g, "")
        .slice(0, 12);
      window.localStorage.setItem(DEVICE_STORAGE_KEY, id);
    }
  } catch {
    /* mode privat: tanpa id */
  }
  return `${id ? `dev:${id} ` : ""}${navigator.userAgent}`.slice(0, 64);
}

/** Bulan ini + 2 bulan sebelumnya (WIB), untuk pilihan slip gaji. */
function slipMonths(): Array<{ key: string; label: string }> {
  const current = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).slice(0, 7);
  const [y, m] = current.split("-").map(Number);
  return [0, 1, 2].map((back) => {
    const d = new Date(Date.UTC(y, m - 1 - back, 15));
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
    return { key, label: back === 0 ? `${label} (berjalan)` : label };
  });
}

const card = "rounded-2xl border border-[var(--garage-line)] bg-[var(--garage-bg-2)] p-4";
const sectionLabel = "text-sm font-semibold uppercase tracking-wider text-[var(--garage-dim)]";
const input =
  "w-full min-h-12 rounded-xl border border-[var(--garage-line-2)] bg-[var(--garage-bg-0)] px-4 text-lg text-[var(--garage-fg)] placeholder:text-[var(--garage-mute)]";

export function AbsenV2Panel() {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState<"login" | "refresh" | "punch" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [months] = useState(slipMonths);
  const [slipMonth, setSlipMonth] = useState(() => months[1]?.key ?? months[0].key);
  const [slipBusy, setSlipBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Kode karyawan diingat di HP supaya cukup ketik PIN (PIN tidak pernah disimpan).
    const saved = window.localStorage.getItem(CODE_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setCode(saved);
  }, []);

  const stopCamera = useCallback(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null | undefined;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const requestGps = useCallback(() => {
    setGpsError(null);
    if (!("geolocation" in navigator)) {
      setGpsError("Peramban tidak mendukung GPS.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Izinkan lokasi untuk browser ini, lalu tekan Coba lagi."
            : err.code === err.TIMEOUT
              ? "GPS terlalu lama. Pastikan GPS HP menyala, lalu coba lagi."
              : "Lokasi tidak tersedia. Nyalakan GPS HP, lalu coba lagi.",
        ),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const logout = useCallback(() => {
    stopCamera();
    setCreds(null);
    setEmployee(null);
    setDashboard(null);
    setSnapshot(null);
    setGps(null);
    setNotice(null);
    setError(null);
    setPin("");
  }, [stopCamera]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    const nextCreds = { code: code.trim().toUpperCase(), pin };
    if (nextCreds.code.length < 2) return setError("Kode karyawan wajib diisi.");
    if (!/^\d{4,8}$/.test(nextCreds.pin)) return setError("PIN berupa 4–8 angka.");
    setBusy("login");
    setError(null);
    try {
      const data = await postJson<Dashboard & { employee: Employee }>("/api/absen/me", nextCreds);
      window.localStorage.setItem(CODE_STORAGE_KEY, nextCreds.code);
      setCreds(nextCreds);
      setEmployee(data.employee);
      setDashboard(data);
      setPin("");
      requestGps();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    if (!creds) return;
    setBusy("refresh");
    setError(null);
    try {
      const data = await postJson<Dashboard & { employee: Employee }>("/api/absen/me", creds);
      setEmployee(data.employee);
      setDashboard(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const openCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      setCameraOpen(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setError(`Kamera gagal: ${(err as Error).message}`);
    }
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSnapshot(canvas.toDataURL("image/jpeg", 0.7));
    stopCamera();
  };

  const punch = async (kind: "checkin" | "checkout") => {
    if (!creds) return;
    if (!snapshot) return setError("Ambil selfie dulu.");
    if (!gps) return setError(gpsError ?? "Lokasi GPS belum siap.");
    setBusy("punch");
    setError(null);
    setNotice(null);
    try {
      const data = await postJson<
        Dashboard & { kind: string; wage: { totalCredited: number; baseWage: number } | null }
      >("/api/absen/punch", {
        ...creds,
        kind,
        lat: gps.lat,
        lng: gps.lng,
        selfieBase64: snapshot,
        device: deviceLabel(),
      });
      setDashboard(data);
      setSnapshot(null);
      if (kind === "checkin") {
        const late = data.today?.lateMinutes ?? 0;
        setNotice(
          late > 0 ? `Absen masuk tercatat. Telat ${late} menit.` : "Absen masuk tercatat. Tepat waktu.",
        );
      } else if (data.wage && data.wage.totalCredited > 0) {
        setNotice(`Absen keluar tercatat. Gaji hari ini ${rupiah(data.wage.totalCredited)} masuk Wallet Gaji.`);
      } else {
        setNotice("Absen keluar tercatat. Gaji hari ini tidak masuk (telat melewati batas).");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const downloadSlip = async () => {
    if (!creds) return;
    setSlipBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/absen/slip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...creds, month: slipMonth }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        if (res.status === 401) logout();
        throw new Error(json?.error?.message ?? "Slip gagal diunduh.");
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `Slip-Gaji-${creds.code}-${slipMonth}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSlipBusy(false);
    }
  };

  if (!creds || !employee || !dashboard) {
    return (
      <form onSubmit={login} className={`${card} space-y-4`} noValidate>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-[var(--garage-fg)]">Masuk Absen</h2>
          <p className="text-base text-[var(--garage-dim)]">
            Pakai kode karyawan dan PIN dari owner. Ini bukan akun sistem kasir.
          </p>
        </div>
        <label className="block space-y-2">
          <span className={sectionLabel}>Kode karyawan</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
            autoCapitalize="characters"
            autoComplete="username"
            spellCheck={false}
            maxLength={16}
            placeholder="mis. BAR1"
            className={`${input} uppercase tracking-widest`}
          />
        </label>
        <label className="block space-y-2">
          <span className={sectionLabel}>PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            className={`${input} text-center text-2xl tracking-[0.4em]`}
          />
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] px-4 py-3 text-base text-white"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy === "login"}
          className="min-h-14 w-full cursor-pointer rounded-2xl bg-[var(--garage-red)] text-lg font-bold uppercase tracking-widest text-white transition-colors hover:bg-[var(--garage-red-bright)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "login" ? "Memproses…" : "Masuk"}
        </button>
      </form>
    );
  }

  const today = dashboard.today;
  const hasCheckin = Boolean(today?.checkinAt);
  const hasCheckout = Boolean(today?.checkoutAt);
  const done = hasCheckin && hasCheckout;
  const nextKind: "checkin" | "checkout" = hasCheckin ? "checkout" : "checkin";

  return (
    <div className="space-y-4">
      <section className={`${card} flex items-start justify-between gap-3`}>
        <div className="min-w-0 space-y-1">
          <div className="break-words text-xl font-semibold text-[var(--garage-fg)]">
            {employee.name}
          </div>
          <div className="text-base text-[var(--garage-dim)]">
            {employee.position ?? "Karyawan"} · {employee.code}
          </div>
          <div className="text-base tabular-nums text-[var(--garage-dim)]">
            Gaji harian {rupiah(employee.dailyWage)}
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-[var(--garage-line-2)] px-3 text-base text-[var(--garage-fg)] transition-colors hover:border-[var(--garage-amber)]"
        >
          <LogOut className="size-4" aria-hidden />
          Keluar
        </button>
      </section>

      <section className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`${sectionLabel} flex items-center gap-2`}>
            <Clock className="size-4" aria-hidden />
            Shift ini
          </h2>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy !== null}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-base text-[var(--garage-dim)] transition-colors hover:text-[var(--garage-fg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className="size-4" aria-hidden />
            {busy === "refresh" ? "Memuat…" : "Muat ulang"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-sm text-[var(--garage-dim)]">Masuk</div>
            <div className="text-xl font-semibold tabular-nums text-[var(--garage-fg)]">
              {clock(today?.checkinAt ?? null)}
            </div>
          </div>
          <div>
            <div className="text-sm text-[var(--garage-dim)]">Keluar</div>
            <div className="text-xl font-semibold tabular-nums text-[var(--garage-fg)]">
              {clock(today?.checkoutAt ?? null)}
            </div>
          </div>
        </div>
        <div className="text-base text-[var(--garage-dim)]">
          Jam masuk {dashboard.shiftStart} ·{" "}
          {today
            ? `${STATUS_LABEL[today.status] ?? today.status}${today.lateMinutes > 0 ? ` · telat ${today.lateMinutes} mnt` : ""}`
            : "Belum absen"}
        </div>
      </section>

      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className={card}>
            <div className={`${sectionLabel} flex items-center gap-2`}>
              <Wallet className="size-4" aria-hidden />
              Gaji
            </div>
            <div className="mt-2 break-words text-xl font-bold tabular-nums text-[var(--garage-fg)]">
              {rupiah(dashboard.wallet.gaji.balance)}
            </div>
            <div className="text-sm text-[var(--garage-dim)]">belum dibayar</div>
          </div>
          <div className={card}>
            <div className={`${sectionLabel} flex items-center gap-2`}>
              <Wallet className="size-4" aria-hidden />
              Fee
            </div>
            <div className="mt-2 break-words text-xl font-bold tabular-nums text-[var(--garage-amber)]">
              {rupiah(dashboard.wallet.fee.balance)}
            </div>
            <div className="text-sm text-[var(--garage-dim)]">belum dibayar</div>
          </div>
        </div>
        {dashboard.wallet.advance > 0 && (
          <div className={`${card} space-y-1`}>
            <div className="flex items-center justify-between gap-3 text-base">
              <span className="text-[var(--garage-dim)]">Kasbon (dipotong saat gajian)</span>
              <span className="shrink-0 font-semibold tabular-nums text-[var(--garage-red-bright)]">
                - {rupiah(dashboard.wallet.advance)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-base">
              <span className="text-[var(--garage-fg)]">Perkiraan diterima saat gajian</span>
              <span className="shrink-0 font-bold tabular-nums text-[var(--garage-fg)]">
                {rupiah(
                  Math.max(0, dashboard.wallet.gaji.balance + dashboard.wallet.fee.balance - dashboard.wallet.advance),
                )}
              </span>
            </div>
          </div>
        )}
        {dashboard.thr && dashboard.thr.length > 0 && (
          <div className={`${card} space-y-1`}>
            <div className={sectionLabel}>THR diterima</div>
            {dashboard.thr.map((t) => (
              <div key={`${t.holidayDate}-${t.paidAt}`} className="flex items-center justify-between gap-3 text-base">
                <span className="min-w-0 break-words text-[var(--garage-fg)]">
                  {t.holidayName}
                  <span className="text-sm text-[var(--garage-dim)]">
                    {" · dibayar "}
                    {new Date(t.paidAt).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Jakarta",
                    })}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[var(--garage-fg)]">{rupiah(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {!done && (
        <section className={`${card} space-y-3`}>
          <h2 className={sectionLabel}>{nextKind === "checkin" ? "Absen masuk" : "Absen keluar"}</h2>

          <div className="flex items-center justify-between gap-2 text-base">
            <span
              className={`flex min-w-0 items-center gap-2 ${gps ? "text-[var(--garage-fg)]" : "text-[var(--garage-dim)]"}`}
            >
              <MapPin className="size-4 shrink-0" aria-hidden />
              {gps ? "Lokasi siap" : (gpsError ?? "Mencari lokasi…")}
            </span>
            {!gps && (
              <button
                type="button"
                onClick={requestGps}
                className="min-h-11 shrink-0 cursor-pointer rounded-xl border border-[var(--garage-line-2)] px-3 text-base text-[var(--garage-fg)] transition-colors hover:border-[var(--garage-amber)]"
              >
                Coba lagi
              </button>
            )}
          </div>

          {snapshot ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={snapshot}
                alt="Selfie absen"
                className="w-full rounded-xl border border-[var(--garage-line)]"
              />
              <button
                type="button"
                onClick={() => setSnapshot(null)}
                className="min-h-11 w-full cursor-pointer rounded-xl border border-[var(--garage-line-2)] text-base text-[var(--garage-fg)] transition-colors hover:border-[var(--garage-amber)]"
              >
                Foto ulang
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <video
                ref={videoRef}
                className={`w-full rounded-xl border border-[var(--garage-line)] bg-black ${cameraOpen ? "" : "hidden"}`}
                muted
                playsInline
              />
              {cameraOpen ? (
                <button
                  type="button"
                  onClick={captureSelfie}
                  className="min-h-12 w-full cursor-pointer rounded-xl bg-[var(--garage-amber)] text-base font-semibold text-black"
                >
                  Ambil foto
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void openCamera()}
                  className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--garage-line-2)] text-base text-[var(--garage-dim)] transition-colors hover:border-[var(--garage-amber)] hover:text-[var(--garage-fg)]"
                >
                  <Camera className="size-5" aria-hidden />
                  Buka kamera depan (selfie)
                </button>
              )}
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />

          <button
            type="button"
            onClick={() => void punch(nextKind)}
            disabled={busy !== null}
            className="min-h-16 w-full cursor-pointer rounded-2xl bg-[var(--garage-red)] text-lg font-bold uppercase tracking-widest text-white transition-colors hover:bg-[var(--garage-red-bright)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "punch" ? "Memproses…" : nextKind === "checkin" ? "Absen masuk" : "Absen keluar"}
          </button>
        </section>
      )}

      {done && (
        <p className={`${card} text-base text-[var(--garage-fg)]`}>
          Absen shift ini selesai. Sampai jumpa di shift berikutnya.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] px-4 py-3 text-base text-white"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-[var(--garage-amber)] bg-[var(--garage-bg-3)] px-4 py-3 text-base text-[var(--garage-fg)]"
        >
          {notice}
        </p>
      )}

      <section className={`${card} space-y-3`}>
        <h2 className={`${sectionLabel} flex items-center gap-2`}>
          <FileDown className="size-4" aria-hidden />
          Slip gaji
        </h2>
        <select
          value={slipMonth}
          onChange={(e) => setSlipMonth(e.target.value)}
          aria-label="Bulan slip gaji"
          className="min-h-12 w-full cursor-pointer rounded-xl border border-[var(--garage-line-2)] bg-[var(--garage-bg-0)] px-3 text-base text-[var(--garage-fg)] [color-scheme:dark]"
        >
          {months.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void downloadSlip()}
          disabled={slipBusy || busy !== null}
          className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--garage-amber)] text-base font-semibold text-[var(--garage-fg)] transition-colors hover:bg-[var(--garage-bg-3)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileDown className="size-5" aria-hidden />
          {slipBusy ? "Menyiapkan slip…" : "Unduh slip PDF"}
        </button>
        <p className="text-sm text-[var(--garage-dim)]">
          Slip bulan berjalan bertanda <strong>sementara</strong> dan bisa berubah sampai akhir bulan.
        </p>
      </section>

      <section className={`${card} space-y-2`}>
        <h2 className={sectionLabel}>Riwayat gaji</h2>
        {dashboard.wallet.gaji.entries.length === 0 ? (
          <p className="text-base text-[var(--garage-dim)]">Belum ada gaji masuk.</p>
        ) : (
          <ul className="divide-y divide-[var(--garage-line)]">
            {dashboard.wallet.gaji.entries.map((e) => (
              <li key={`${e.date}-${e.kind}`} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-base text-[var(--garage-fg)]">{dayLabel(e.date)}</div>
                  <div className="text-sm text-[var(--garage-dim)]">{gajiLabel(e)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`text-base font-semibold tabular-nums ${e.totalCredited > 0 ? "text-[var(--garage-fg)]" : "text-[var(--garage-red-bright)]"}`}
                  >
                    {rupiah(e.totalCredited)}
                  </div>
                  {e.paid && <div className="text-sm text-[var(--garage-dim)]">Dibayar</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} space-y-2`}>
        <h2 className={sectionLabel}>Riwayat fee produk</h2>
        {dashboard.wallet.fee.entries.length === 0 ? (
          <p className="text-base text-[var(--garage-dim)]">Belum ada fee masuk.</p>
        ) : (
          <ul className="divide-y divide-[var(--garage-line)]">
            {dashboard.wallet.fee.entries.map((e) => (
              <li key={e.date} className="flex items-center justify-between gap-3 py-2">
                <span className="text-base text-[var(--garage-fg)]">{dayLabel(e.date)}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-semibold tabular-nums text-[var(--garage-amber)]">
                    {rupiah(e.amount)}
                  </span>
                  {e.paid && <span className="block text-sm text-[var(--garage-dim)]">Dibayar</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
