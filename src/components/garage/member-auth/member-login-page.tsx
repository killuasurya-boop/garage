"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Gift, LockKeyhole, Mail, Phone, User } from "lucide-react";

import { AuthenticationStatus, type AuthStatus } from "./authentication-status";
import { BrandExperiencePanel } from "./brand-experience-panel";
import { CinematicBackground } from "./cinematic-background";
import { MemberButton } from "./member-button";
import { MemberField } from "./member-field";
import { MemberLoginCard } from "./member-login-card";
import { MotionReveal } from "./motion-reveal";
import "./member-auth.css";

// Spesifikasi visual: Crystal V5 (docs/crystal-v5/01-DESIGN-SYSTEM.md) di atas tata letak docs/GARAGE_MEMBER_DESIGN_SYSTEM.md.
// Google hanya tampil bila server mengonfigurasi Client ID (/api/member/auth/providers) — tidak ada tombol palsu.

const GOOGLE_ERRORS: Record<string, string> = {
  google_unavailable: "Login Google belum diaktifkan. Masuk dengan email/nomor HP dan PIN.",
  google_cancelled: "Login Google dibatalkan atau kedaluwarsa. Silakan coba lagi.",
  google_failed: "Login Google gagal diverifikasi. Coba lagi atau masuk dengan PIN.",
};

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

type GooglePending = { email: string; name: string; picture: string | null; next: string };

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

async function postJson<T>(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.success) {
    throw new Error(json.success ? "Request gagal." : json.message);
  }
  return json.data;
}

function sanitizeMemberRedirectTarget(target?: string | null) {
  return target?.startsWith("/") && !target.startsWith("//") ? target : "/member";
}

function isDigitalMenuTarget(target: string) {
  return target === "/order" || target.startsWith("/order?");
}

function identifierKind(value: string): "email" | "phone" {
  const trimmed = value.trim();
  return !trimmed.includes("@") && /^[0-9+\s-]{3,}$/.test(trimmed) ? "phone" : "email";
}

type Mode = "login" | "register" | "google-complete";
type LoginStep = "identify" | "pin";

export function MemberLoginPage({
  initialReturnTarget,
  fontClassName,
}: {
  initialReturnTarget?: string;
  fontClassName?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<LoginStep>("identify");
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  const [identifierError, setIdentifierError] = useState("");
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googlePending, setGooglePending] = useState<GooglePending | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const returnTarget = sanitizeMemberRedirectTarget(initialReturnTarget);
  const fromDigitalMenu = isDigitalMenuTarget(returnTarget);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get("ref") ?? params.get("referral");
    const nameParam = params.get("name");
    const phoneParam = params.get("phone");
    const wantsRegister =
      params.get("mode") === "register" || Boolean(refParam) || Boolean(nameParam) || Boolean(phoneParam);
    if (refParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL hydration on mount
      setReferralCode(refParam.trim().toUpperCase());
      setShowOptional(true);
    }
    // Prefill dari checkout (guest -> daftar member) supaya tinggal isi PIN.
    if (nameParam) setName(nameParam.slice(0, 80));
    if (phoneParam) setPhone(phoneParam.replace(/[^0-9+]/g, "").slice(0, 20));
    if (wantsRegister) setMode("register");
    const errorKey = params.get("error");
    if (errorKey) {
      const custom = params.get("message");
      setStatus({ tone: "error", message: (errorKey === "google_rejected" && custom ? custom.slice(0, 200) : GOOGLE_ERRORS[errorKey]) ?? "Login gagal. Coba lagi." });
    }
    if (params.get("mode") === "google-complete") {
      setMode("google-complete");
      fetch("/api/member/auth/google/pending", { credentials: "include" })
        .then(async (response) => {
          const json = (await response.json().catch(() => null)) as ApiResponse<GooglePending> | null;
          if (response.ok && json?.success) {
            setGooglePending(json.data);
            setName(json.data.name);
          } else {
            setMode("login");
            setStatus({ tone: "error", message: json && !json.success ? json.message : "Sesi Google sudah habis. Ulangi." });
          }
        })
        .catch(() => undefined);
    }
    fetch("/api/member/auth/providers", { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as ApiResponse<{ google: boolean }> | null;
        if (json?.success) setGoogleEnabled(json.data.google);
      })
      .catch(() => undefined);
  }, []);

  // Sudah login → langsung ke tujuan.
  useEffect(() => {
    let alive = true;
    fetch("/api/member/profile", { credentials: "include" })
      .then((response) => {
        if (alive && response.ok) router.replace(returnTarget);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [router, returnTarget]);

  useEffect(() => {
    if (mode === "login" && step === "pin") pinRef.current?.focus();
  }, [mode, step]);

  function finish(message: string) {
    setStatus({ tone: "success", message });
    router.replace(returnTarget);
  }

  function handleIdentify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (identifier.trim().length < 3) {
      setIdentifierError("Email atau nomor HP wajib diisi.");
      return;
    }
    setIdentifierError("");
    setStatus(null);
    setStep("pin");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await postJson("/api/member/auth/login", { identifier: identifier.trim(), password: loginPassword });
      finish("Berhasil masuk. Mengalihkan…");
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Login member gagal." });
      setBusy(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await postJson("/api/member/auth/register", {
        name,
        phone,
        email,
        birthday,
        referralCode,
        password: registerPassword,
      });
      finish("Akun member aktif. Mengalihkan…");
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Registrasi member gagal." });
      setBusy(false);
    }
  }

  async function handleGoogleComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptTerms) {
      setStatus({ tone: "error", message: "Setujui Syarat & Ketentuan membership untuk melanjutkan." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const data = await postJson<{ next?: string }>("/api/member/auth/google/complete", { name, phone, acceptTerms, marketingConsent });
      setStatus({ tone: "success", message: "Membership aktif. Mengalihkan…" });
      router.replace(sanitizeMemberRedirectTarget(data.next ?? returnTarget));
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Aktivasi member gagal." });
      setBusy(false);
    }
  }

  const googleHref = `/api/member/auth/google/start?next=${encodeURIComponent(returnTarget)}`;
  const googleBlock = googleEnabled ? (
    <>
      <a href={googleHref} className="gm-btn gm-btn-google" data-testid="member-google-button">
        <GoogleMark />
        <span>Lanjutkan dengan Google</span>
      </a>
      <div className="gm-divider" role="separator">ATAU</div>
    </>
  ) : null;

  function switchMode(next: Mode) {
    setMode(next);
    setStep("identify");
    setStatus(null);
    setIdentifierError("");
  }

  const kind = identifierKind(identifier);
  const isLogin = mode === "login";

  return (
    <main className={`gm-root ${fontClassName ?? ""}`}>
      <CinematicBackground />

      <div className="relative mx-auto flex min-h-svh w-full max-w-[1440px] flex-col gm-page px-6 pb-10 pt-10 md:px-10 md:pb-8 md:pt-10 lg:px-10 lg:pt-10 xl:px-16 xl:pt-12">
        {/* Desktop: breadcrumb kiri + tagline kanan */}
        <header className="hidden items-start justify-between lg:flex">
          <div className="flex items-center gap-4">
            <Link href="/" className="gm-eyebrow !text-[var(--gm-text)] hover:!text-white">
              Garage Coffee
            </Link>
            <span className="gm-eyebrow !tracking-normal !text-[var(--gm-accent-hover)]">/</span>
            <span className="gm-eyebrow">Member Experience</span>
            <span aria-hidden="true" className="ml-2 hidden h-px w-44 bg-[var(--gm-border-strong)] xl:block" />
          </div>
          <p className="gm-eyebrow leading-[1.9] !text-[#c9c5c0]">
            Good coffee
            <br />
            builds
            <br />
            better days.
            <span aria-hidden="true" className="mt-3 block h-[2px] w-7 bg-[var(--gm-accent)]" />
          </p>
        </header>

        <div className="grid flex-1 content-start items-center gap-10 md:gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(400px,470px)] xl:grid-cols-[minmax(0,1fr)_minmax(440px,550px)] lg:content-center lg:gap-10 lg:pb-20 lg:pt-2 xl:gap-16">
          <BrandExperiencePanel />

          <MotionReveal delay={160} className="mx-auto w-full max-w-[580px] lg:max-w-none">
            <MemberLoginCard
              title={
                mode === "google-complete" ? (
                  <>
                    Lengkapi Profil<span className="text-[var(--gm-accent)] md:text-inherit">.</span>
                  </>
                ) : isLogin ? (
                  <>
                    Selamat Datang
                    <br />
                    Kembali<span className="text-[var(--gm-accent)] md:text-inherit">.</span>
                  </>
                ) : (
                  <>
                    Daftar Member<span className="text-[var(--gm-accent)] md:text-inherit">.</span>
                  </>
                )
              }
              description={
                mode === "google-complete"
                  ? "Hampir selesai! Lengkapi data berikut untuk mengaktifkan membership Garage Coffee."
                  : isLogin
                  ? "Masuk untuk mengakses akun member Garage Coffee."
                  : "Gratis. Langsung jadi member Silver: poin tiap order, voucher, dan tersambung ke kasir."
              }
            >
              <div key={`${mode}-${step}`} className="gm-step grid gap-5">
                {mode === "google-complete" ? (
                  <form className="grid gap-5" onSubmit={handleGoogleComplete} data-testid="member-google-complete">
                    {googlePending ? (
                      <div className="flex min-w-0 items-center gap-3 rounded-[var(--gm-radius-control)] border border-[var(--gm-border)] bg-white/[0.03] px-4 py-3">
                        {googlePending.picture ? (
                          // eslint-disable-next-line @next/next/no-img-element -- foto profil Google (host eksternal)
                          <img src={googlePending.picture} alt="" width={44} height={44} referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10"><User size={20} /></span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold text-[var(--gm-text)]">{googlePending.email}</span>
                          <span className="flex items-center gap-1 text-[13px] text-[#7ee2a8]">
                            <BadgeCheck size={14} aria-hidden="true" /> Terverifikasi oleh Google
                          </span>
                        </span>
                      </div>
                    ) : null}
                    <MemberField
                      label="Nama Lengkap"
                      icon={<User size={19} />}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Nama kamu"
                      autoComplete="name"
                      required
                    />
                    <MemberField
                      label="Nomor WhatsApp"
                      icon={<Phone size={19} />}
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="0813..."
                      autoComplete="tel"
                      inputMode="tel"
                      hint="Dipakai kasir untuk menemukan kartu member & poinmu."
                      required
                    />
                    <label className="gm-check">
                      <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} required />
                      <span>
                        Saya setuju dengan{" "}
                        <Link href="/legal/terms" className="gm-link" target="_blank">
                          Syarat & Ketentuan
                        </Link>{" "}
                        membership Garage Coffee. <span className="text-[var(--gm-text-2)]">(wajib)</span>
                      </span>
                    </label>
                    <label className="gm-check">
                      <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} />
                      <span>
                        Kirimi saya info promo lewat WhatsApp. <span className="text-[var(--gm-text-2)]">(opsional, bisa dimatikan kapan saja)</span>
                      </span>
                    </label>
                    <MemberButton type="submit" loading={busy}>
                      Aktifkan Membership
                    </MemberButton>
                  </form>
                ) : null}

                {isLogin && step === "identify" ? googleBlock : null}

                {isLogin && step === "identify" ? (
                  <form className="grid gap-5" onSubmit={handleIdentify} noValidate>
                    <MemberField
                      label="Email atau Nomor HP"
                      icon={kind === "phone" ? <Phone size={19} /> : <Mail size={19} />}
                      value={identifier}
                      onChange={(event) => {
                        setIdentifier(event.target.value);
                        if (identifierError) setIdentifierError("");
                      }}
                      placeholder="nama@email.com"
                      autoComplete="username"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      error={identifierError}
                      required
                    />
                    <MemberButton type="submit">
                      {kind === "phone" ? "Lanjutkan dengan Nomor HP" : "Lanjutkan dengan Email"}
                    </MemberButton>
                  </form>
                ) : null}

                {isLogin && step === "pin" ? (
                  <form className="grid gap-5" onSubmit={handleLogin}>
                    <div className="flex min-w-0 items-center justify-between gap-3 rounded-[var(--gm-radius-control)] border border-[var(--gm-border)] bg-white/[0.03] px-4 py-3">
                      <span className="flex min-w-0 items-center gap-3 text-[15px] text-[var(--gm-text)]">
                        {kind === "phone" ? (
                          <Phone size={17} className="shrink-0 text-[var(--gm-metal)]" />
                        ) : (
                          <Mail size={17} className="shrink-0 text-[var(--gm-metal)]" />
                        )}
                        <span className="truncate">{identifier.trim()}</span>
                      </span>
                      <button
                        type="button"
                        className="gm-ghost shrink-0"
                        onClick={() => {
                          setStep("identify");
                          setLoginPassword("");
                          setStatus(null);
                        }}
                      >
                        Ganti
                      </button>
                    </div>
                    <MemberField
                      ref={pinRef}
                      label="PIN / Password"
                      icon={<LockKeyhole size={19} />}
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      placeholder="Minimal 6 karakter"
                      type="password"
                      autoComplete="current-password"
                      minLength={6}
                      required
                    />
                    <MemberButton type="submit" loading={busy}>
                      Masuk
                    </MemberButton>
                  </form>
                ) : null}

                {mode === "register" ? googleBlock : null}

                {mode === "register" ? (
                  <form className="grid gap-5" onSubmit={handleRegister}>
                    <MemberField
                      label="Nama Lengkap"
                      icon={<User size={19} />}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Nama kamu"
                      autoComplete="name"
                      required
                    />
                    <MemberField
                      label="Nomor HP"
                      icon={<Phone size={19} />}
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="0813..."
                      autoComplete="tel"
                      inputMode="tel"
                      required
                    />
                    <MemberField
                      label="Buat PIN"
                      icon={<LockKeyhole size={19} />}
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                      placeholder="Min. 6 digit/karakter"
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      hint="Dipakai untuk login member berikutnya."
                      required
                    />
                    {!showOptional ? (
                      <button
                        type="button"
                        onClick={() => setShowOptional(true)}
                        className="gm-ghost w-fit text-left text-[14px]"
                      >
                        + Lengkapi data (opsional): email, ulang tahun, referral
                      </button>
                    ) : (
                      <div className="grid gap-5 border-l-2 border-[var(--gm-border-strong)] pl-4">
                        <MemberField
                          label="Email (opsional)"
                          icon={<Mail size={19} />}
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="nama@email.com"
                          type="email"
                          autoComplete="email"
                        />
                        <div className="grid gap-5 sm:grid-cols-2">
                          <MemberField
                            label="Tanggal Lahir"
                            icon={<Gift size={19} />}
                            value={birthday}
                            onChange={(event) => setBirthday(event.target.value)}
                            type="date"
                          />
                          <MemberField
                            label="Kode Referral"
                            icon={<BadgeCheck size={19} />}
                            value={referralCode}
                            onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                            placeholder="Kode teman"
                          />
                        </div>
                      </div>
                    )}
                    <MemberButton type="submit" loading={busy}>
                      Daftar Sekarang
                    </MemberButton>
                  </form>
                ) : null}

                <AuthenticationStatus status={status} />

                {mode !== "google-complete" ? (
                <p className="text-center text-[15px] text-[#dedad5]">
                  {isLogin ? "Belum menjadi member?" : "Sudah menjadi member?"}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode(isLogin ? "register" : "login")}
                    className="gm-link inline-flex items-center gap-2"
                  >
                    {isLogin ? "Daftar Sekarang" : "Masuk"}
                    <ArrowRight size={16} aria-hidden="true" className="no-underline" />
                  </button>
                </p>
                ) : null}

                {fromDigitalMenu ? (
                  <Link href={returnTarget} className="gm-btn gm-btn-secondary !min-h-12 text-[14px]">
                    <ArrowLeft size={16} aria-hidden="true" />
                    <span>Kembali ke Menu Digital</span>
                  </Link>
                ) : null}
              </div>
            </MemberLoginCard>
          </MotionReveal>
        </div>

        {/* Desktop: strip bawah */}
        <footer aria-hidden="true" className="hidden items-center gap-8 pt-4 lg:flex">
          <span className="h-[2px] w-7 bg-[var(--gm-accent)]" />
          {["Coffee", "People", "Stories", "To a brighter day"].map((word) => (
            <span key={word} className="gm-eyebrow !text-[#c9c5c0]">
              {word}
            </span>
          ))}
        </footer>
      </div>
    </main>
  );
}
