"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Clock,
  Eye,
  EyeOff,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { garageApi } from "@/lib/api-client";
import type { HealthData } from "@/lib/garage-api-types";
import type { Role } from "@/lib/garage-data";
import { authClient } from "@/lib/auth-client";
import { loginErrorMessage } from "@/lib/login-messages";
import { oauthContinueUrl, signedOAuthQuery } from "@/lib/oauth-login-continue";

// Modul login terpisah dari garage-app.tsx supaya /login & /pos-login cukup mengunduh
// form ini (bukan seluruh OS). Palet = website Garage: hitam pekat + blok merah tegas.

type LoginRolePreset = {
  role: Role;
  label: string;
  email: string;
  icon: LucideIcon;
};

const loginRolePresets: LoginRolePreset[] = [
  { role: "Owner", label: "Owner", email: "owner@garage.id", icon: ShieldCheck },
  { role: "Manajer", label: "Manajer", email: "manajer@garage.id", icon: Wrench },
  { role: "Kasir", label: "Kasir", email: "kasir@garage.id", icon: ReceiptText },
  { role: "Waiter", label: "Waiter", email: "waiter@garage.id", icon: Bell },
];

const visibleLoginRolePresets = loginRolePresets.filter((preset) => preset.role !== "Owner");
const posLoginRolePresets = loginRolePresets.filter((preset) =>
  ["Kasir", "Waiter"].includes(preset.role),
);

const devLoginPassword = process.env.NODE_ENV === "production" ? null : "garage12345";

const REMEMBERED_EMAIL_KEY = "garage.login.email";

// Kolom login: hitam pekat dengan garis abu jelas; fokus putih (merah khusus error).
const loginInputClass =
  "h-12 rounded-md border-[#3a3a42] bg-[#08080a] text-base text-white placeholder:text-[#6e6e76] focus-visible:border-[#f4f4f5] focus-visible:ring-[#f4f4f5]/20";

function readRememberedEmail() {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberEmail(email: string) {
  try {
    window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
  } catch {
    // Mode privat / storage diblokir: abaikan, login tetap jalan.
  }
}

type ServerState = "checking" | "online" | "offline" | "unconfigured";

function useServerState() {
  const [state, setState] = useState<ServerState>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    garageApi
      .get<HealthData>("/api/health", { cache: "no-store" })
      .then((health) => {
        if (mounted) setState(health.database.configured ? "online" : "unconfigured");
      })
      .catch(() => {
        if (mounted) setState("offline");
      });
    return () => {
      mounted = false;
    };
  }, [attempt]);

  return {
    state,
    retry: () => {
      setState("checking");
      setAttempt((value) => value + 1);
    },
  };
}

/** Bingkai bersama login & 2FA: latar hitam, strip merah atas, logo, kartu ber-header merah. */
export function LoginFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="garage-shell dark flex min-h-[100svh] flex-col border-t-4 border-[#d11a2a] [background:#08080a] text-foreground">
      <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-4 py-8 sm:py-12">
        <div className="flex justify-center">
          <Image
            src="/garage-brand/garage-coffee-logo.png"
            alt="Garage Coffee"
            width={1200}
            height={282}
            priority
            sizes="(max-width: 640px) 220px, 280px"
            className="h-auto w-[220px] object-contain sm:w-[280px]"
          />
        </div>

        <div className="garage-animate-in mt-6 overflow-hidden rounded-md border border-[#2a2a30] bg-[#0d0d10] shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
          <div className="bg-[linear-gradient(110deg,#d11a2a_0%,#a3141f_60%,#8b0f1a_100%)] px-5 py-4 sm:px-6">
            <h1 className="text-xl font-bold text-white">{title}</h1>
            <p className="mt-1 text-sm text-white/85">{subtitle}</p>
          </div>
          <div className="p-5 sm:p-6">{children}</div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[#b8b8bf]">
          {footer ?? (
            <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 hover:text-white">
              <ArrowRight className="size-3.5 rotate-180" aria-hidden />
              Halaman utama
            </Link>
          )}
          <span className="text-right">© 2026 Killua Surya · 081396186251</span>
        </div>
      </main>
    </div>
  );
}

/** Layar tunggu dengan tampilan sama seperti login (tanpa lompatan warna/tata letak). */
export function LoginLoading({ title }: { title: string }) {
  return (
    <LoginFrame title={title} subtitle="Mohon tunggu sebentar…">
      <div className="flex items-center gap-3 text-sm text-[#b8b8bf]" role="status">
        <RefreshCw className="size-4 animate-spin text-white" aria-hidden />
        Menyiapkan halaman masuk
      </div>
    </LoginFrame>
  );
}

function ServerStatus({ state, onRetry }: { state: ServerState; onRetry: () => void }) {
  if (state === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#b8b8bf]">
        <span className="size-2 rounded-full bg-[#6e6e76]" aria-hidden /> Memeriksa server…
      </span>
    );
  }
  if (state === "online") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#b8b8bf]">
        <span className="size-2 rounded-full bg-[#f4f4f5]" aria-hidden /> Server terhubung
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#ffb3b3]" role="status">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-[#ff2a3a]" aria-hidden />
        {state === "offline" ? "Koneksi ke server terputus" : "Server belum siap (database belum diatur)"}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-sm border border-[#3a3a42] px-2 py-1 font-semibold text-white hover:border-white/60"
      >
        Coba lagi
      </button>
    </span>
  );
}

type GarageLoginProps = {
  returnTo?: string;
  variant?: "os" | "pos";
  initialEmail?: string;
  includeOwnerPreset?: boolean;
};

export function GarageLogin({
  returnTo = "/os",
  variant = "pos",
  initialEmail,
  includeOwnerPreset = false,
}: GarageLoginProps) {
  const session = authClient.useSession();
  const userId = session.data?.user?.id;

  useEffect(() => {
    if (userId) window.location.assign(returnTo);
  }, [userId, returnTo]);

  if (session.isPending) {
    return <LoginLoading title={variant === "pos" ? "Masuk ke POS Garage" : "Masuk ke Garage OS"} />;
  }
  if (userId) {
    return <LoginLoading title="Membuka area kerja" />;
  }

  return (
    <LoginScreen
      variant={variant}
      initialEmail={initialEmail}
      includeOwnerPreset={includeOwnerPreset}
      onSignedIn={async () => {
        await session.refetch();
        window.location.assign(returnTo);
      }}
    />
  );
}

export function LoginScreen({
  onSignedIn,
  variant = "os",
  initialEmail,
  includeOwnerPreset = false,
}: {
  onSignedIn: () => void | Promise<void>;
  variant?: "os" | "pos";
  initialEmail?: string;
  includeOwnerPreset?: boolean;
}) {
  const isPosLogin = variant === "pos";
  // Helper preset/demo hanya untuk non-production. Di VPS/production layar login
  // bersih: cukup email + password, tanpa membocorkan akun internal.
  const showDemoHelpers = process.env.NODE_ENV !== "production";
  const rolePresets = isPosLogin
    ? posLoginRolePresets
    : includeOwnerPreset
      ? loginRolePresets
      : visibleLoginRolePresets;
  // Halaman login dirender di klien saja (ssr:false) → aman membaca storage/URL saat init.
  // Urutan: email dari URL/props → email terakhir di perangkat ini → preset demo (dev).
  const [email, setEmail] = useState(
    () =>
      initialEmail ||
      readRememberedEmail() ||
      (showDemoHelpers ? rolePresets[0]?.email ?? "" : ""),
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idleNotice] = useState(
    () => new URLSearchParams(window.location.search).get("reason") === "idle_timeout",
  );
  const server = useServerState();
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const selectedPreset =
    rolePresets.find((preset) => preset.email === email) ?? rolePresets[0] ?? loginRolePresets[2];

  // Kursor langsung ke kolom yang perlu diisi: password bila email sudah terisi.
  const emailPrefilled = useRef(Boolean(email));
  useEffect(() => {
    (emailPrefilled.current ? passwordRef : emailRef).current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setError("Masukkan password akun Garage.");
      passwordRef.current?.focus();
      return;
    }

    setPending(true);
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      async function post(path: string, body: Record<string, string>) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => null)) as
          | {
              twoFactorRedirect?: boolean;
              redirect?: boolean;
              url?: string;
              code?: string;
              message?: string;
              error?: { code?: string; message?: string };
            }
          | null;
        return {
          ok: response.ok,
          status: response.status,
          data,
          code: data?.code ?? data?.error?.code ?? null,
          message: data?.message ?? data?.error?.message ?? null,
        };
      }

      // Alur OAuth MCP ChatGPT: query bertanda tangan dari plugin ikut ke sign-in.
      const oauthQuery = signedOAuthQuery(window.location.search);
      let result = await post("/api/auth/sign-in/email", {
        email: normalizedEmail,
        password,
        ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
      });
      if (!result.ok && devLoginPassword && password === devLoginPassword) {
        result = await post("/api/dev/demo-login", { email: normalizedEmail });
      }

      if (!result.ok) {
        const message = loginErrorMessage(result.status, result.code, result.message);
        setError(devLoginPassword ? `${message} (Demo lokal: password ${devLoginPassword}.)` : message);
        return;
      }

      rememberEmail(normalizedEmail);

      // Better Auth twoFactor plugin: kalau user punya 2FA aktif, response
      // balikin twoFactorRedirect=true (session belum dibuat). Redirect ke
      // page TOTP challenge untuk complete login.
      if (result.data?.twoFactorRedirect) {
        window.location.href = `/login/2fa${window.location.search}`;
        return;
      }

      const continueUrl = oauthContinueUrl(result.data);
      if (continueUrl) {
        window.location.assign(continueUrl);
        return;
      }

      await onSignedIn();
    } catch {
      setError(loginErrorMessage(0));
    } finally {
      setPending(false);
    }
  }

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState?.("CapsLock") ?? false);
  }

  return (
    <LoginFrame
      title={isPosLogin ? "Masuk ke POS Garage" : "Masuk ke Garage OS"}
      subtitle={
        isPosLogin
          ? "Khusus tablet kasir. Setelah masuk, POS langsung terbuka."
          : "Gunakan akun karyawan yang didaftarkan owner."
      }
      footer={
        <span className="flex flex-wrap items-center gap-x-4">
          <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 hover:text-white">
            <ArrowRight className="size-3.5 rotate-180" aria-hidden />
            Halaman utama
          </Link>
          <Link
            href={isPosLogin ? "/login" : "/pos-login"}
            className="inline-flex min-h-11 items-center underline-offset-4 hover:text-white hover:underline"
          >
            {isPosLogin ? "Login Garage OS" : "Login tablet POS"}
          </Link>
        </span>
      }
    >
      <div className="mb-4">
        <ServerStatus state={server.state} onRetry={server.retry} />
      </div>

      {idleNotice ? (
        <p
          role="status"
          className="mb-4 flex items-start gap-2 rounded-md border border-[#3a3a42] bg-white/[0.04] px-3 py-2 text-sm text-[#f4f4f5]"
        >
          <Clock className="mt-0.5 size-4 shrink-0 text-white" aria-hidden />
          Sesi berakhir karena tidak ada aktivitas. Silakan masuk lagi.
        </p>
      ) : null}

      {showDemoHelpers ? (
        <details className="mb-5 rounded-md border border-dashed border-[#3a3a42] bg-white/[0.03] p-2.5">
          <summary className="cursor-pointer text-xs font-semibold text-[#b8b8bf]">
            Akun demo (hanya mode pengembangan) · {selectedPreset.label}
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {rolePresets.map((preset) => {
              const RoleIcon = preset.icon;
              const active = email === preset.email;
              return (
                <button
                  key={preset.email}
                  type="button"
                  onClick={() => {
                    setEmail(preset.email);
                    setError(null);
                  }}
                  className={`garage-press flex min-h-10 items-center gap-2 rounded-md border px-2.5 text-left text-xs font-semibold transition ${
                    active
                      ? "border-[#d11a2a]/70 bg-[#d11a2a]/15 text-white"
                      : "border-[#2a2a30] bg-[#131316] text-[#b8b8bf] hover:text-white"
                  }`}
                  aria-pressed={active}
                >
                  <RoleIcon className="size-4 shrink-0 text-white" />
                  <span className="truncate">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </details>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="garage-login-email" className="block text-sm font-semibold text-white">
            Email
          </label>
          <Input
            ref={emailRef}
            id="garage-login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@garage.id"
            className={loginInputClass}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            enterKeyHint="next"
            required
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="garage-login-password" className="block text-sm font-semibold text-white">
              Password
            </label>
            {devLoginPassword ? (
              <button
                type="button"
                onClick={() => {
                  setPassword(devLoginPassword);
                  setError(null);
                }}
                className="rounded-sm border border-[#3a3a42] px-2 py-1 text-[11px] font-semibold text-[#b8b8bf] transition hover:text-white"
              >
                Isi demo
              </button>
            ) : null}
          </div>
          <div className="relative">
            <Input
              ref={passwordRef}
              id="garage-login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
              onBlur={() => setCapsLock(false)}
              placeholder="Masukkan password"
              className={`${loginInputClass} pr-12`}
              autoComplete="current-password"
              enterKeyHint="go"
              aria-describedby={capsLock ? "garage-login-capslock" : undefined}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              className="absolute right-0.5 top-0.5 inline-flex size-11 items-center justify-center rounded-md text-[#b8b8bf] transition hover:bg-white/[0.06] hover:text-white"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {capsLock ? (
            <p id="garage-login-capslock" className="flex items-center gap-1.5 text-xs font-semibold text-[#ffd08a]">
              <AlertTriangle className="size-3.5" aria-hidden /> Caps Lock aktif
            </p>
          ) : null}
        </div>

        {error ? (
          <Alert role="alert" className="rounded-md border-[#ff2a3a]/50 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertTitle>Login gagal</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button
          disabled={pending}
          className="garage-press h-12 w-full rounded-md bg-[#d11a2a] text-base font-bold text-white hover:bg-[#ff2a3a] active:bg-[#a3141f]"
        >
          {pending ? (
            <RefreshCw className="mr-2 size-4 animate-spin" />
          ) : (
            <LockKeyhole className="mr-2 size-4" />
          )}
          <span className="truncate whitespace-nowrap">{pending ? "Memverifikasi…" : "Masuk"}</span>
        </Button>

        <p className="text-center text-xs leading-5 text-[#b8b8bf]">
          Lupa password? Minta Owner atau Manajer mereset akun Anda.
        </p>
      </form>
    </LoginFrame>
  );
}
