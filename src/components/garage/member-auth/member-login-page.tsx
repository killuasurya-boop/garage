"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, BarChart3, Check, ChevronLeft, ChevronRight, Coins, Eye, EyeOff, Gift, LockKeyhole, Mail, Phone, TicketPercent, User } from "lucide-react";

import { memberLevelRules } from "@/lib/member-types";

import { AuthenticationStatus, type AuthStatus } from "./authentication-status";
import { MemberCardStage, tierKey } from "./cinematic3d/member-card-stage";
import { GarageBrandLogo } from "./garage-brand-logo";
import { MemberButton } from "./member-button";
import { MemberField } from "./member-field";
import "./member-auth.css";
import "./member-v6.css";

// Member V6 "Ultimate Cinematic" (Owner, 9 Nov 2026) — acuan docs/design-references/member-v6/ (login, daftar, tier,
// storyboard). Kiri: showcase dengan kartu 3D Three.js nyata (lazy), kanan: panel kaca. Logika auth tidak berubah:
// HP/email + PIN (/api/member/auth/*), Google hanya tampil bila server mengonfigurasi Client ID — tidak ada tombol palsu.

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

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string; code?: string };

async function postJson<T>(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.success) {
    throw Object.assign(new Error(json.success ? "Request gagal." : json.message), { code: json.success ? undefined : json.code });
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
    // ?optional=1: tamu yang belum login dapat { member: null } (bukan 401 di console).
    fetch("/api/member/profile?optional=1", { credentials: "include", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { member?: unknown } } | null) => {
        if (alive && body?.data?.member) router.replace(returnTarget);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [router, returnTarget]);

  useEffect(() => {
    if (mode === "login" && step === "pin") pinRef.current?.focus();
  }, [mode, step]);

  const [showPin, setShowPin] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [loginDone, setLoginDone] = useState(false);
  const [registered, setRegistered] = useState<{ name: string; tier: string } | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [showIntro, setShowIntro] = useState(false);
  // Nomor HP Google sudah milik akun lama → minta PIN akun itu lalu tautkan (tanpa akun ganda).
  const [linkPinNeeded, setLinkPinNeeded] = useState(false);
  const [linkPin, setLinkPin] = useState("");
  // Carousel "Membership Tier" (referensi 01) di halaman daftar: 0 Silver, 1 Gold (awal, tengah), 2 Platinum.
  const [tierFocus, setTierFocus] = useState(1);

  // Intro sinematik sekali per sesi tab; tidak tampil saat reduced-motion; tidak pernah memblokir form.
  useEffect(() => {
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      if (window.sessionStorage.getItem("garage:member-intro:v6") === "1") return;
      window.sessionStorage.setItem("garage:member-intro:v6", "1");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- keputusan sekali saat mount (butuh sessionStorage)
      setShowIntro(true);
      const id = window.setTimeout(() => setShowIntro(false), 1900);
      return () => window.clearTimeout(id);
    } catch {
      /* storage tidak tersedia */
    }
  }, []);

  function fail(message: string) {
    setStatus({ tone: "error", message });
    setShakeKey((key) => key + 1);
  }

  function handleIdentify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = identifier.trim();
    if (value.length < 3) {
      setIdentifierError("Email atau nomor HP wajib diisi.");
      setShakeKey((key) => key + 1);
      return;
    }
    if (identifierKind(value) === "phone" && value.replace(/\D/g, "").length < 10) {
      setIdentifierError("Nomor HP tidak valid. Gunakan minimal 10 digit.");
      setShakeKey((key) => key + 1);
      return;
    }
    if (identifierKind(value) === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setIdentifierError("Format email tidak valid. Contoh: nama@email.com");
      setShakeKey((key) => key + 1);
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
      setLoginDone(true);
      router.replace(returnTarget);
    } catch (error) {
      fail(error instanceof Error ? error.message : "Login member gagal.");
      setBusy(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptTerms) {
      fail("Setujui Kebijakan Privasi dan Syarat & Ketentuan untuk mendaftar.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const data = await postJson<{ member?: { name?: string; level?: string; tier?: string } }>("/api/member/auth/register", {
        name,
        phone,
        email,
        birthday,
        referralCode,
        password: registerPassword,
        acceptTerms: true,
      });
      // Tier diambil dari jawaban backend — tidak diasumsikan Silver.
      setRegistered({ name: data.member?.name ?? name, tier: data.member?.level ?? data.member?.tier ?? "Silver" });
      setBusy(false);
    } catch (error) {
      fail(error instanceof Error ? error.message : "Registrasi member gagal.");
      setBusy(false);
    }
  }

  async function handleGoogleComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptTerms) {
      fail("Setujui Syarat & Ketentuan membership untuk melanjutkan.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const data = await postJson<{ next?: string; linked?: boolean }>("/api/member/auth/google/complete", {
        name,
        phone,
        acceptTerms,
        marketingConsent,
        existingPin: linkPinNeeded && linkPin ? linkPin : undefined,
      });
      setStatus({ tone: "success", message: data.linked ? "Google tertaut ke akun member lama. Mengalihkan…" : "Membership aktif. Mengalihkan…" });
      router.replace(sanitizeMemberRedirectTarget(data.next ?? returnTarget));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "PHONE_NEEDS_PIN") setLinkPinNeeded(true);
      fail(error instanceof Error ? error.message : "Aktivasi member gagal.");
      setBusy(false);
    }
  }

  const googleHref = `/api/member/auth/google/start?next=${encodeURIComponent(returnTarget)}`;
  const googleBlock = googleEnabled ? (
    <>
      <a
        href={googleHref}
        className="gm6-google"
        data-testid="member-google-button"
        aria-busy={googleBusy || undefined}
        onClick={() => setGoogleBusy(true)}
      >
        {googleBusy ? <span className="gm6-google-ring" aria-hidden="true" /> : null}
        <GoogleMark />
        <span>{googleBusy ? "Menghubungkan ke Google…" : "Lanjutkan dengan Google"}</span>
      </a>
      <div className="gm-or" role="separator">
        ATAU
      </div>
    </>
  ) : null;

  function switchMode(next: Mode) {
    setMode(next);
    setStep("identify");
    setStatus(null);
    setIdentifierError("");
    setRegistered(null);
  }

  const kind = identifierKind(identifier);
  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const pinToggle = (
    <button type="button" className="gm6-pin-toggle" onClick={() => setShowPin((value) => !value)} aria-label={showPin ? "Sembunyikan PIN" : "Tampilkan PIN"} aria-pressed={showPin}>
      {showPin ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
    </button>
  );

  const showcaseCopy = isRegister
    ? { eyebrow: "Member Access", title: "Lebih dari Sekadar Ngopi", copy: "Daftar gratis, kumpulkan poin, dan nikmati keuntungan member Garage Coffee." }
    : { eyebrow: "Member Program", title: "Member Garage Coffee", copy: "Lebih dari sekadar ngopi. Nikmati berbagai keuntungan eksklusif untuk member." };

  return (
    <main className={`gm-root gm6 ${fontClassName ?? ""}`} data-testid="member-v6">
      {showIntro ? (
        <div className="gm6-intro" aria-hidden="true" data-testid="member-intro">
          <span className="gm6-intro-laser" />
          <div className="gm6-intro-logo">
            <GarageBrandLogo sizes="420px" />
          </div>
          <div className="gm6-intro-progress">
            <span className="gm6-intro-bar" />
            <span className="gm6-intro-text">Memuat pengalaman member…</span>
          </div>
        </div>
      ) : null}

      <div className="gm6-shell">
        {/* ── Kiri: showcase sinematik ── */}
        <section className="gm6-showcase" aria-label="Program member Garage Coffee">
          <Link href="/" aria-label="Garage Coffee — ke website" className="gm6-logo gm6-in mx-auto block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffbd42] lg:mx-0" style={{ animationDelay: "60ms" }}>
            <GarageBrandLogo sizes="(max-width: 1023px) 300px, 400px" />
          </Link>
          <div className="gm6-in mt-5 text-center lg:mt-9 lg:text-left" style={{ animationDelay: "140ms" }}>
            <p className="gm6-eyebrow">{showcaseCopy.eyebrow}</p>
            <p className="gm6-title mt-3 lg:mt-4">
              {showcaseCopy.title}
              {isRegister ? <span className="gm6-dot">.</span> : null}
            </p>
            <p className="gm6-copy mx-auto mt-3 lg:mx-0">{showcaseCopy.copy}</p>
          </div>
          <div className="gm6-scene">
            {/* key = kanvas baru per mode: konteks WebGL lama dilepas (forceContextLoss) & tidak bisa dipakai ulang. */}
            <MemberCardStage key={isRegister ? "tiers" : "showcase"} mode={isRegister ? "tiers" : "showcase"} focus={isRegister ? tierFocus : undefined} />
            <div className="gm6-cup hidden md:block" aria-hidden="true">
              <Image src="/garage-brand/crystal/hero-iced-latte.webp" alt="" width={800} height={538} sizes="210px" />
            </div>
          </div>
          {isRegister ? (
            <TierCarousel focus={tierFocus} onFocus={setTierFocus} />
          ) : null}
          <ul className={`gm6-benefits gm6-in mt-2 hidden ${isRegister ? "" : "lg:grid"}`} style={{ animationDelay: "520ms" }} aria-label="Keuntungan member">
            <li className="gm6-benefit">
              <span className="gm6-benefit-icon"><Coins size={20} aria-hidden="true" /></span>
              <span><strong>Poin</strong><span>Setiap Order</span></span>
            </li>
            <li className="gm6-benefit">
              <span className="gm6-benefit-icon"><TicketPercent size={20} aria-hidden="true" /></span>
              <span><strong>Voucher</strong><span>&amp; Promo Member</span></span>
            </li>
            <li className="gm6-benefit">
              <span className="gm6-benefit-icon"><BarChart3 size={20} aria-hidden="true" /></span>
              <span><strong>Riwayat</strong><span>Transaksi</span></span>
            </li>
          </ul>
        </section>

        {/* ── Kanan: panel kaca ── */}
        <section className="gm6-panel gm6-in" style={{ animationDelay: "260ms" }} aria-labelledby="member-card-title">
          {loginDone ? (
            <div className="gm6-login-success" role="status" data-testid="member-login-success">
              <div className="text-center">
                <span className="gm6-success-check"><Check size={30} aria-hidden="true" /></span>
                <p className="gm6-panel-title mt-4 text-[1.8rem]">Berhasil Masuk!</p>
                <p className="mt-2 text-[15px] text-[#c8c9cd]">Selamat datang di Garage Coffee, memuat akun member Anda…</p>
              </div>
            </div>
          ) : null}

          {registered ? (
            <div className="gm6-success" role="status" data-testid="member-register-success">
              <span className="gm6-success-check"><Check size={30} aria-hidden="true" /></span>
              <h1 id="member-card-title" className="gm6-panel-title mt-4">
                Pendaftaran Berhasil!
              </h1>
              <p className="mt-2 text-[15px] text-[#c8c9cd]">Selamat bergabung menjadi member Garage Coffee, {registered.name.split(" ")[0]}.</p>
              <div className="gm6-success-stage mt-2">
                <MemberCardStage mode="success" tier={tierKey(registered.tier)} testId="member-success-stage" />
              </div>
              <span className="gm6-tier-pill">{registered.tier} Member</span>
              <ul className="mx-auto mt-5 grid max-w-xs gap-2.5 text-left text-[15px] text-[#e8e8ea]">
                {["Poin setiap transaksi", "Akses voucher & promo member", "Tersambung ke kasir otomatis"].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[#ff2638] text-[#ff6b75]"><Check size={14} aria-hidden="true" /></span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <MemberButton type="button" onClick={() => router.replace(returnTarget)}>
                  {fromDigitalMenu ? "Kembali ke Menu Digital" : "Lanjut ke Akun Member"}
                </MemberButton>
              </div>
            </div>
          ) : (
            <div key={mode} className="gm6-swap">
              <p className="gm-eyebrow gm-card-eyebrow">{isRegister ? "Buat Akun Garage Coffee" : "Member Access"}</p>
              <h1 id="member-card-title" className="gm6-panel-title mt-4">
                {mode === "google-complete" ? (
                  <>Lengkapi Profil<span className="gm6-dot">.</span></>
                ) : isLogin ? (
                  <>
                    Selamat Datang
                    <br />
                    Kembali<span className="gm6-dot">.</span>
                  </>
                ) : (
                  <>Daftar Member<span className="gm6-dot">.</span></>
                )}
              </h1>
              <p className="mt-3 max-w-[34ch] text-[15.5px] leading-6 text-[#c8c9cd]">
                {mode === "google-complete"
                  ? "Hampir selesai! Lengkapi data berikut untuk mengaktifkan membership Garage Coffee."
                  : isLogin
                    ? "Masuk dan nikmati pengalaman member Garage Coffee."
                    : "Gratis. Langsung jadi member: poin tiap order, voucher, dan tersambung ke kasir."}
              </p>

              <div key={`${mode}-${step}-${shakeKey}`} className={`mt-7 grid gap-5 ${shakeKey ? "gm6-shake" : ""}`}>
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
                    <MemberField label="Nama Lengkap" icon={<User size={19} />} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama kamu" autoComplete="name" required />
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
                    {linkPinNeeded ? (
                      <MemberField
                        label="PIN akun lama"
                        icon={<LockKeyhole size={19} />}
                        value={linkPin}
                        onChange={(event) => setLinkPin(event.target.value)}
                        placeholder="PIN yang biasa dipakai di kasir"
                        type={showPin ? "text" : "password"}
                        autoComplete="current-password"
                        minLength={6}
                        trailing={pinToggle}
                        hint="Nomor ini sudah terdaftar. Masukkan PIN-nya untuk menautkan Google ke akun yang sama (poin & riwayat tetap)."
                        data-testid="member-link-pin"
                        required
                      />
                    ) : null}
                    <label className="gm6-check">
                      <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} required />
                      <span>
                        Saya setuju dengan{" "}
                        <Link href="/legal/terms" className="gm-link" target="_blank">
                          Syarat &amp; Ketentuan
                        </Link>{" "}
                        membership Garage Coffee. <span className="text-[var(--gm-text-2)]">(wajib)</span>
                      </span>
                    </label>
                    <label className="gm6-check">
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
                      placeholder="nama@email.com atau 0813..."
                      autoComplete="username"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      error={identifierError}
                      required
                    />
                    <MemberButton type="submit">Lanjutkan</MemberButton>
                  </form>
                ) : null}

                {isLogin && step === "pin" ? (
                  <form className="grid gap-5" onSubmit={handleLogin}>
                    <div className="flex min-w-0 items-center justify-between gap-3 rounded-[var(--gm-radius-control)] border border-[var(--gm-border)] bg-white/[0.03] px-4 py-3">
                      <span className="flex min-w-0 items-center gap-3 text-[15px] text-[var(--gm-text)]">
                        {kind === "phone" ? <Phone size={17} className="shrink-0 text-[var(--gm-metal)]" /> : <Mail size={17} className="shrink-0 text-[var(--gm-metal)]" />}
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
                      type={showPin ? "text" : "password"}
                      autoComplete="current-password"
                      minLength={6}
                      trailing={pinToggle}
                      required
                    />
                    <MemberButton type="submit" loading={busy}>
                      Masuk
                    </MemberButton>
                  </form>
                ) : null}

                {isRegister ? googleBlock : null}

                {isRegister ? (
                  <form className="grid gap-5" onSubmit={handleRegister}>
                    <MemberField label="Nama Lengkap" icon={<User size={19} />} value={name} onChange={(event) => setName(event.target.value)} placeholder="Masukkan nama lengkap" autoComplete="name" required />
                    <MemberField
                      label="Nomor HP"
                      icon={<Phone size={19} />}
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Contoh: 0813xxxxxxxx"
                      autoComplete="tel"
                      inputMode="tel"
                      required
                    />
                    <MemberField
                      label="PIN Member"
                      icon={<LockKeyhole size={19} />}
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                      placeholder="Min. 6 digit/karakter"
                      type={showPin ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={6}
                      trailing={pinToggle}
                      hint="Dipakai untuk login member berikutnya."
                      required
                    />
                    {!showOptional ? (
                      <button type="button" onClick={() => setShowOptional(true)} className="gm-ghost w-fit text-left text-[14px]">
                        + Lengkapi data (opsional): email, ulang tahun, referral
                      </button>
                    ) : (
                      <div className="grid gap-5 border-l-2 border-[var(--gm-border-strong)] pl-4">
                        <MemberField label="Email (opsional)" icon={<Mail size={19} />} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" type="email" autoComplete="email" />
                        <div className="grid gap-5 sm:grid-cols-2">
                          <MemberField label="Tanggal Lahir" icon={<Gift size={19} />} value={birthday} onChange={(event) => setBirthday(event.target.value)} type="date" />
                          <MemberField label="Kode Referral" icon={<BadgeCheck size={19} />} value={referralCode} onChange={(event) => setReferralCode(event.target.value.toUpperCase())} placeholder="Kode teman" />
                        </div>
                      </div>
                    )}
                    <label className="gm6-check">
                      <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} aria-required="true" data-testid="member-register-terms" />
                      <span>
                        Saya menyetujui{" "}
                        <Link href="/legal/privacy" className="gm-link" target="_blank">
                          Kebijakan Privasi
                        </Link>{" "}
                        dan{" "}
                        <Link href="/legal/terms" className="gm-link" target="_blank">
                          Syarat &amp; Ketentuan
                        </Link>{" "}
                        Garage Coffee.
                      </span>
                    </label>
                    <MemberButton type="submit" loading={busy}>
                      Daftar Sekarang
                    </MemberButton>
                  </form>
                ) : null}

                <AuthenticationStatus status={status} />

                {mode !== "google-complete" ? (
                  <p className="text-center text-[15px] text-[#dedad5]">
                    {isLogin ? "Belum menjadi member?" : "Sudah menjadi member?"}{" "}
                    <button type="button" onClick={() => switchMode(isLogin ? "register" : "login")} className="gm-link inline-flex items-center gap-2">
                      {isLogin ? "Daftar Sekarang" : "Masuk Sekarang"}
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
            </div>
          )}

          <div className="gm-divider mt-7" />
          <nav aria-label="Legal" className="mt-5 flex items-center justify-center gap-5">
            <Link href="/legal/privacy" className="gm-footer-link">
              Kebijakan Privasi
            </Link>
            <span aria-hidden="true" className="h-4 w-px bg-[var(--gm-border-strong)]" />
            <Link href="/legal/terms" className="gm-footer-link">
              Syarat &amp; Ketentuan
            </Link>
          </nav>
        </section>

        {/* Mobile: keuntungan di bawah form. */}
        <ul className="gm6-benefits lg:hidden" aria-label="Keuntungan member">
          <li className="gm6-benefit"><span className="gm6-benefit-icon"><Coins size={18} aria-hidden="true" /></span><span><strong>Poin</strong><span>Setiap Order</span></span></li>
          <li className="gm6-benefit"><span className="gm6-benefit-icon"><TicketPercent size={18} aria-hidden="true" /></span><span><strong>Voucher</strong><span>&amp; Promo</span></span></li>
          <li className="gm6-benefit"><span className="gm6-benefit-icon"><BarChart3 size={18} aria-hidden="true" /></span><span><strong>Riwayat</strong><span>Transaksi</span></span></li>
        </ul>
      </div>
    </main>
  );
}

const CAROUSEL_TIERS = ["Silver", "Gold", "Platinum"] as const;

/** Kontrol carousel tier (titik + panah + ←/→). Isi keuntungan dari memberLevelRules — data nyata, bukan karangan. */
function TierCarousel({ focus, onFocus }: { focus: number; onFocus: (index: number) => void }) {
  const rule = memberLevelRules.find((item) => item.level === CAROUSEL_TIERS[focus]);
  const go = (delta: number) => onFocus((focus + delta + CAROUSEL_TIERS.length) % CAROUSEL_TIERS.length);
  return (
    <div
      className="gm6-tiers"
      role="group"
      aria-label="Membership tier"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          go(-1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          go(1);
        }
      }}
      data-testid="member-tier-carousel"
    >
      <div className="flex items-center justify-center gap-4">
        <button type="button" className="gm6-tier-arrow" onClick={() => go(-1)} aria-label="Tier sebelumnya">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2.5" role="tablist" aria-label="Pilih tier">
          {CAROUSEL_TIERS.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={index === focus}
              aria-label={label}
              className="gm6-tier-dot"
              onClick={() => onFocus(index)}
            />
          ))}
        </div>
        <button type="button" className="gm6-tier-arrow" onClick={() => go(1)} aria-label="Tier berikutnya">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-3 text-center" aria-live="polite">
        <span className="gm6-tier-name">{CAROUSEL_TIERS[focus]}</span>
        <span className="block text-[13px] text-[#c8c9cd]">
          {focus === 0 ? "Tier awal saat daftar" : `Mulai ${new Intl.NumberFormat("id-ID").format(rule?.minPoints ?? 0)} poin`} · poin {rule?.multiplier ?? 1}x
        </span>
      </p>
      {rule ? (
        <ul className="mx-auto mt-2 flex max-w-xl flex-wrap justify-center gap-2">
          {rule.perks.map((perk) => (
            <li key={perk} className="gm6-perk">
              {perk}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
