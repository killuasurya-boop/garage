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

// Spesifikasi visual: docs/GARAGE_MEMBER_DESIGN_SYSTEM.md (jangan ubah tanpa izin owner).

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

type Mode = "login" | "register";
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
                isLogin ? (
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
                isLogin
                  ? "Masuk untuk mengakses akun member Garage Coffee."
                  : "Gratis. Langsung jadi member Silver: poin tiap order, voucher, dan tersambung ke kasir."
              }
            >
              <div key={`${mode}-${step}`} className="gm-step grid gap-5">
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

                {!isLogin ? (
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
