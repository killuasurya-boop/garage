"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, LogIn, UserPlus, Wifi, WifiOff } from "lucide-react";

type Config = { enabled: boolean; ssid: string; sessionHours: number };
type Member = { name: string } | null;
type Grant = { loginUrl: string; username: string; password: string; sessionHours: number; ssid: string };

// Portal WiFi member: hotspot MikroTik → halaman ini → daftar/login member →
// login otomatis ke router dengan kredensial hotspot hari ini.
export function WifiMemberPortal({
  mac,
  ip,
  loginUrl,
  dst,
}: {
  mac: string | null;
  ip: string | null;
  loginUrl: string | null;
  dst: string | null;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [member, setMember] = useState<Member | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grant, setGrant] = useState<Grant | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [cfgRes, memberRes] = await Promise.all([
          fetch("/api/wifi/config", { cache: "no-store" }),
          fetch("/api/member/profile?optional=1", { cache: "no-store", credentials: "include" }),
        ]);
        const cfg = await cfgRes.json().catch(() => null);
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

  const here =
    typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/wifi";
  const loginHref = `/member-login?next=${encodeURIComponent(here)}`;
  const registerHref = `/member-login?mode=register&next=${encodeURIComponent(here)}`;
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
              <h1 className="text-lg font-bold">WiFi Gratis untuk Member</h1>
              <p className="truncate text-sm text-garage-dim">{config?.ssid ?? "GARAGE Free WiFi"}</p>
            </div>
          </div>

          {loading ? (
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
          <input type="hidden" name="dst" value={dst ?? ""} />
          <input type="hidden" name="popup" value="true" />
        </form>
      ) : null}
    </main>
  );
}
