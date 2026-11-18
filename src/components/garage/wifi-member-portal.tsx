"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, LogIn, UserPlus, Wifi, WifiOff } from "lucide-react";

type Config = { enabled: boolean; ssid: string; sessionHours: number; guestEnabled?: boolean; guestSessionHours?: number };

// Masuk cepat (Owner 18 Nov 2026): nama + WA diingat di HP ini saja, supaya kunjungan berikutnya cukup satu ketuk.
const GUEST_KEY = "garage:wifi-guest:v1";
function readGuest(): { name: string; phone: string } {
  try {
    const raw = JSON.parse(window.localStorage.getItem(GUEST_KEY) ?? "null");
    if (raw && typeof raw.name === "string" && typeof raw.phone === "string") return { name: raw.name, phone: raw.phone };
  } catch {
    /* abaikan */
  }
  return { name: "", phone: "" };
}
type Member = { name: string } | null;
type Grant = { loginUrl: string; username: string; password: string; sessionHours: number; ssid: string };

// Portal WiFi member: hotspot MikroTik → halaman ini → daftar/login member →
// login otomatis ke router dengan kredensial hotspot hari ini.
export function WifiMemberPortal({
  mac,
  ip,
  loginUrl,
  dst,
  welcome = false,
}: {
  mac: string | null;
  ip: string | null;
  loginUrl: string | null;
  dst: string | null;
  /** Halaman setelah tamu online (router mengarahkan ke /wifi?welcome=guest): ajakan jadi member. */
  welcome?: boolean;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [member, setMember] = useState<Member | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grant, setGrant] = useState<Grant | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [loginDst, setLoginDst] = useState<string>(dst ?? "");


  useEffect(() => {
    void (async () => {
      try {
        const [cfgRes, memberRes] = await Promise.all([
          fetch("/api/wifi/config", { cache: "no-store" }),
          fetch("/api/member/profile?optional=1", { cache: "no-store", credentials: "include" }),
        ]);
        const cfg = await cfgRes.json().catch(() => null);
        // Isi dari HP ini (kunjungan sebelumnya) — setelah data datang, aman untuk render server.
        const saved = readGuest();
        if (saved.name) setGuestName(saved.name);
        if (saved.phone) setGuestPhone(saved.phone);
        const mem = await memberRes.json().catch(() => null);
        setConfig(cfg?.data ?? { enabled: false, ssid: "GARAGE", sessionHours: 3 });
        const profile = mem?.data?.member ?? mem?.data ?? null;
        setMember(profile && typeof profile.name === "string" ? { name: profile.name } : null);
      } catch {
        setConfig({ enabled: false, ssid: "GARAGE", sessionHours: 3 });
        setMember(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (grant) formRef.current?.submit();
  }, [grant]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wifi/access", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mac, ip, loginUrl: loginUrl ?? "" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? json?.message ?? "WiFi gagal diaktifkan. Coba lagi.");
      setGrant(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "WiFi gagal diaktifkan. Coba lagi.");
      setBusy(false);
    }
  }, [ip, loginUrl, mac]);

  const connectGuest = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wifi/guest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: guestName, phone: guestPhone, mac, ip, loginUrl: loginUrl ?? "" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "WiFi gagal diaktifkan. Coba lagi.");
      try {
        window.localStorage.setItem(GUEST_KEY, JSON.stringify({ name: guestName.trim(), phone: guestPhone.trim() }));
      } catch {
        /* abaikan */
      }
      // Setelah online, router membuka halaman sambutan: ajakan jadi member (OTP WA bisa jalan karena sudah online).
      const back = new URL("/wifi", window.location.origin);
      back.searchParams.set("welcome", "guest");
      if (dst) back.searchParams.set("dst", dst);
      setLoginDst(back.toString());
      setGrant(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "WiFi gagal diaktifkan. Coba lagi.");
      setBusy(false);
    }
  }, [dst, guestName, guestPhone, ip, loginUrl, mac]);

  const here =
    typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/wifi";
  const loginHref = `/member-login?next=${encodeURIComponent(here)}`;
  const registerHref = `/member-login?mode=register&next=${encodeURIComponent(welcome ? "/member" : here)}`;
  const guestOn = Boolean(config?.guestEnabled);
  const safeDst = dst && /^https?:\/\//i.test(dst) ? dst : null;
  const loading = config === null || member === undefined;

  return (
    <main className="min-h-[100svh] bg-garage-bg-0 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <div className="mx-auto mb-6 w-56">
          <Image
            src="/garage-brand/garage-coffee-logo.png"
            alt="Garage Coffee"
            width={1200}
            height={282}
            priority
            sizes="224px"
            className="h-auto w-full object-contain"
          />
        </div>
        <section className="rounded-xl border border-garage-line bg-garage-bg-2 p-5 shadow-lg" data-testid="wifi-portal">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-garage-red/15 text-garage-red ring-1 ring-garage-red/40">
              <Wifi className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold">{welcome ? "Kamu sudah online" : guestOn ? "WiFi Gratis Garage" : "WiFi Gratis untuk Member"}</h1>
              <p className="truncate text-sm text-garage-dim">{config?.ssid ?? "GARAGE Free WiFi"}</p>
            </div>
          </div>

          {welcome ? (
            <div className="mt-5 space-y-3" data-testid="wifi-welcome">
              <p className="flex items-start gap-2 text-base">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#f5a742]" aria-hidden />
                <span>
                  Internet aktif <b>{config?.guestSessionHours ?? 1} jam</b>. Selamat menikmati!
                </span>
              </p>
              <p className="text-sm leading-6 text-garage-dim">
                Jadi member Garage gratis: WiFi <b>{config?.sessionHours ?? 3} jam</b> per sesi, kumpulkan poin, dan dapat promo.
                Verifikasi lewat WhatsApp sekarang bisa karena kamu sudah online.
              </p>
              <a
                href={registerHref}
                className="garage-press flex h-12 w-full items-center justify-center gap-2 rounded-md bg-garage-red text-base font-bold text-white"
              >
                <UserPlus className="size-5" /> Jadi member sekarang
              </a>
              {safeDst ? (
                <a href={safeDst} className="garage-press flex h-11 w-full items-center justify-center rounded-md border border-garage-line-2 text-sm font-bold text-white">
                  Nanti saja, lanjut browsing
                </a>
              ) : null}
            </div>
          ) : loading ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-garage-dim" role="status">
              <Loader2 className="size-4 animate-spin" /> Memuat…
            </p>
          ) : !config?.enabled ? (
            <p className="mt-5 flex items-start gap-2 rounded-md border border-garage-line-2 bg-garage-bg-1 p-3 text-sm text-garage-dim">
              <WifiOff className="mt-0.5 size-4 shrink-0" /> WiFi member sedang tidak aktif. Silakan tanya kasir.
            </p>
          ) : member ? (
            <div className="mt-5 space-y-3">
              <p className="text-base">
                Halo <b>{member.name}</b>! WiFi aktif <b>{config.sessionHours} jam</b> per sesi.
              </p>
              <button
                type="button"
                onClick={() => void connect()}
                disabled={busy}
                data-testid="wifi-connect"
                className="garage-press flex h-12 w-full items-center justify-center gap-2 rounded-md bg-garage-red text-base font-bold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
                {busy ? "Menyambungkan…" : "Sambungkan WiFi"}
              </button>
            </div>
          ) : guestOn ? (
            <form
              className="mt-5 space-y-3"
              data-testid="wifi-guest-form"
              onSubmit={(e) => {
                e.preventDefault();
                void connectGuest();
              }}
            >
              <p className="text-sm leading-6 text-garage-dim">
                Isi nama & nomor WhatsApp, internet langsung aktif <b>{config.guestSessionHours ?? 1} jam</b>. Tanpa daftar, tanpa
                password.
              </p>
              <label className="block text-sm font-semibold">
                Nama
                <input
                  className="mt-1 h-12 w-full rounded-md border border-garage-line-2 bg-garage-bg-1 px-3 text-base text-white"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={60}
                />
              </label>
              <label className="block text-sm font-semibold">
                Nomor WhatsApp
                <input
                  className="mt-1 h-12 w-full rounded-md border border-garage-line-2 bg-garage-bg-1 px-3 text-base text-white"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0812xxxxxxx"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                data-testid="wifi-guest-connect"
                className="garage-press flex h-12 w-full items-center justify-center gap-2 rounded-md bg-garage-red text-base font-bold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Wifi className="size-5" />}
                {busy ? "Menyambungkan…" : "Sambungkan WiFi"}
              </button>
              <a
                href={loginHref}
                className="garage-press flex h-11 w-full items-center justify-center gap-2 rounded-md border border-garage-line-2 text-sm font-bold text-white"
              >
                <LogIn className="size-4" /> Sudah member? Masuk ({config.sessionHours} jam)
              </a>
            </form>
          ) : (
            <div className="mt-5 space-y-3">
              <p className="text-sm leading-6 text-garage-dim">
                Daftar member Garage gratis (cukup nama + nomor WhatsApp aktif) untuk menikmati WiFi, kumpulkan poin, dan
                dapat promo.
              </p>
              <a
                href={registerHref}
                className="garage-press flex h-12 w-full items-center justify-center gap-2 rounded-md bg-garage-red text-base font-bold text-white"
              >
                <UserPlus className="size-5" /> Daftar member & pakai WiFi
              </a>
              <a
                href={loginHref}
                className="garage-press flex h-11 w-full items-center justify-center gap-2 rounded-md border border-garage-line-2 text-sm font-bold text-white"
              >
                <LogIn className="size-4" /> Sudah member? Masuk
              </a>
            </div>
          )}

          {error ? (
            <p role="alert" className="mt-3 rounded-md border border-garage-red/45 bg-garage-red/12 px-3 py-2 text-sm text-[#ffc2c8]">
              {error}
            </p>
          ) : null}
        </section>
        <p className="mt-4 text-center text-xs text-garage-dim">Dengan memakai WiFi, kamu setuju menggunakannya dengan wajar.</p>
      </div>
      {grant ? (
        <form ref={formRef} method="post" action={grant.loginUrl} className="hidden">
          <input type="hidden" name="username" value={grant.username} />
          <input type="hidden" name="password" value={grant.password} />
          <input type="hidden" name="dst" value={loginDst} />
          <input type="hidden" name="popup" value="true" />
        </form>
      ) : null}
    </main>
  );
}
