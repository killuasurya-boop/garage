"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Gift,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";

import {
  PremiumMembershipCard,
  type PremiumMembershipCardData,
} from "@/components/garage/premium-membership-card";

// Kartu contoh untuk hero halaman login (data dummy, bukan member asli).
const showcaseCard: PremiumMembershipCardData = {
  name: "Member Garage",
  memberId: "GRG-2026-0001",
  phone: "0812-3456-7890",
  tier: "Gold",
  membershipSince: "2026",
  validThru: "12/28",
};

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; message: string };

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

const levelBadges = [
  {
    level: "Silver",
    range: "Daftar member",
    multiplier: "1x",
    tone: "border-white/15 bg-white/[0.055]",
  },
  {
    level: "Gold",
    range: "Rp2 juta/tahun",
    multiplier: "1.2x",
    tone: "border-[#f5a742]/35 bg-[#f5a742]/10",
  },
  {
    level: "Platinum",
    range: "Rp5 juta/tahun",
    multiplier: "1.5x",
    tone: "border-[#70b8ee]/45 bg-[#70b8ee]/12",
  },
  {
    level: "Ultra",
    range: "Owner approval",
    multiplier: "2x",
    tone: "border-[#9060f0]/45 bg-[#9060f0]/12",
  },
];

function sanitizeMemberRedirectTarget(target?: string | null) {
  return target?.startsWith("/") && !target.startsWith("//") ? target : "/member";
}

function isDigitalMenuTarget(target: string) {
  return target === "/order" || target.startsWith("/order?");
}

export function MemberLoginScreen({
  initialReturnTarget,
}: {
  initialReturnTarget?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  // Data tambahan (email/tgl lahir/referral) disembunyikan agar daftar cepat.
  const [showOptional, setShowOptional] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const returnTarget = sanitizeMemberRedirectTarget(initialReturnTarget);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get("ref") ?? params.get("referral");
    const nameParam = params.get("name");
    const phoneParam = params.get("phone");
    const wantsRegister =
      params.get("mode") === "register" ||
      Boolean(refParam) ||
      Boolean(nameParam) ||
      Boolean(phoneParam);
    if (refParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL hydration on mount
      setReferralCode(refParam.trim().toUpperCase());
    }
    // Prefill dari checkout (guest -> daftar member) supaya tinggal isi PIN.
    if (nameParam) {
      setName(nameParam.slice(0, 80));
    }
    if (phoneParam) {
      setPhone(phoneParam.replace(/[^0-9+]/g, "").slice(0, 20));
    }
    if (wantsRegister) {
      setMode("register");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/member/profile", { credentials: "include" })
      .then(async (response) => {
        if (alive && response.ok) router.replace(returnTarget);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [router, returnTarget]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await postJson("/api/member/auth/login", {
        identifier,
        password: loginPassword,
      });
      router.replace(returnTarget);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login member gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await postJson("/api/member/auth/register", {
        name,
        phone,
        email,
        birthday,
        referralCode,
        password: registerPassword,
      });
      router.replace(returnTarget);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registrasi member gagal.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setMessage("");
  }

  const fromDigitalMenu = isDigitalMenuTarget(returnTarget);
  const headerBackHref = fromDigitalMenu ? returnTarget : "/";

  return (
    <main className="garage-shell garage-login-shell min-h-screen overflow-x-hidden text-white">
      <div className="garage-login-ambient" aria-hidden="true">
        <span className="garage-login-neon-rail garage-login-neon-rail-top" />
        <span className="garage-login-neon-rail garage-login-neon-rail-bottom" />
        <span className="garage-login-scanline" />
        <span className="garage-login-ember ember-1" />
        <span className="garage-login-ember ember-2" />
        <span className="garage-login-ember ember-3" />
        <span className="garage-login-ember ember-4" />
        <span className="garage-login-ember ember-5" />
        <span className="garage-login-ember ember-6" />
        <span className="garage-login-ember ember-7" />
        <span className="garage-login-ember ember-8" />
      </div>
      <div className="bg-grain" />
      <div className="bg-vignette" />

      <section className="garage-login-grid relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="block w-[min(176px,48vw)] shrink-0 sm:w-[230px]" aria-label="Kembali ke website Garage">
            <Image
              src="/garage-brand/logo-website.png"
              alt="Garage Coffee & Motor"
              width={1024}
              height={325}
              priority
              sizes="(max-width: 768px) 50vw, 230px"
              className="h-auto w-full object-contain drop-shadow-[0_14px_34px_rgba(0,0,0,0.5)]"
            />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={headerBackHref}
              className="btn inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
              style={{ padding: "11px 13px", fontSize: 10 }}
            >
              {fromDigitalMenu ? <ArrowLeft size={13} /> : null}
              <span className="truncate">{fromDigitalMenu ? "Menu Digital" : "Website"}</span>
            </Link>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-5 py-6 md:gap-7 lg:grid-cols-[0.92fr_0.82fr] lg:py-8 xl:gap-10">
          <section className="garage-login-hero garage-animate-in order-2 min-h-0 rounded-md border border-[#34343c] bg-black/24 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-7 lg:order-1 lg:min-h-[560px] lg:p-8">
            <div className="flex h-full flex-col gap-6">
              <div>
                <div className="garage-login-chip inline-flex items-center gap-2 rounded-full border border-[#d11a2a]/45 bg-[#d11a2a]/14 px-3 py-1 text-xs font-semibold text-[#ffb0b8]">
                  <Sparkles size={14} />
                  Membership Master Pro
                </div>

                <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
                  Kartu Member <span className="text-[#d11a2a]">GARAGE</span>
                </h1>

                <p className="mt-2.5 max-w-md text-sm leading-6 text-[#cdcdd4]">
                  Kumpulkan poin tiap order, naik tier Silver hingga Ultra, redeem
                  voucher, dan dapat kartu digital — semua tersambung ke kasir.
                </p>
              </div>

              {/* Kartu membership sebagai hero */}
              <div className="flex justify-center">
                <div className="w-full max-w-[360px] drop-shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
                  <PremiumMembershipCard
                    data={showcaseCard}
                    interactive
                    ariaLabel="Contoh kartu member Garage"
                  />
                </div>
              </div>

              {/* Tier strip â€” nama tidak terpotong */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {levelBadges.map((item) => (
                  <div
                    key={item.level}
                    className={`rounded-md border p-2.5 text-center ${item.tone}`}
                  >
                    <p className="text-sm font-black text-white">{item.level}</p>
                    <p className="text-[11px] font-bold text-[#f5a742]">
                      {item.multiplier} poin
                    </p>
                  </div>
                ))}
              </div>

              {/* Benefit ringkas */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm text-[#d6d6dc]">
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck size={16} className="text-[#f5a742]" /> Poin otomatis
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Gift size={16} className="text-[#f5a742]" /> Redeem voucher
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-[#f5a742]" /> Khusus customer
                </span>
              </div>
            </div>
          </section>

          <section className="garage-login-card garage-panel order-1 mx-auto w-full max-w-[500px] p-5 sm:p-7 lg:order-2">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 border border-[#f5a742]/35 bg-[#f5a742]/10 px-3 py-1 text-xs font-semibold uppercase text-[#ffd79a]">
                <LockKeyhole size={13} />
                Customer Access
              </div>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
                {mode === "login" ? "Masuk Member" : "Daftar Member"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#cdcdd4]">
                {mode === "login"
                  ? "Portal khusus customer untuk points, voucher, dan level member."
                  : "Aktivasi akun member untuk menyimpan point dan level dari CRM POS."}
              </p>
            </div>

            {mode === "login" ? (
              <form className="grid gap-4" onSubmit={handleLogin}>
                <label className="grid gap-2">
                  <span className="garage-mono">Nomor HP atau Email</span>
                  <span className="flex items-center gap-3 border border-[#34343c] bg-white/[0.055] px-4 py-3 transition-colors focus-within:border-[#f5a742]">
                    <Phone size={17} className="shrink-0 text-[#f5a742]" />
                    <input
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-[#777782]"
                      placeholder="0813... atau nama@email.com"
                      autoComplete="username"
                      required
                    />
                  </span>
                </label>
                <label className="grid gap-2">
                  <span className="garage-mono">Password / PIN</span>
                  <span className="flex items-center gap-3 border border-[#34343c] bg-white/[0.055] px-4 py-3 transition-colors focus-within:border-[#f5a742]">
                    <LockKeyhole size={17} className="shrink-0 text-[#f5a742]" />
                    <input
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-[#777782]"
                      placeholder="Minimal 6 karakter"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </span>
                </label>
                <button className="btn btn-primary garage-login-submit mt-2 justify-center whitespace-nowrap" disabled={busy}>
                  <span className="truncate">{busy ? "Memproses" : "Masuk Member"}</span>
                  <ArrowRight size={15} />
                </button>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <span className="min-w-0 truncate text-sm text-[#9696a1]">Belum punya akun member?</span>
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className="garage-press shrink-0 whitespace-nowrap text-sm font-semibold text-[#f5a742] hover:text-white"
                  >
                    Daftar Member Baru
                  </button>
                </div>
              </form>
            ) : (
              <form className="grid gap-4" onSubmit={handleRegister}>
                <div className="rounded-md border border-[#22c55e]/35 bg-[#22c55e]/10 p-3 text-sm leading-6 text-[#dcfce7]">
                  <span className="font-black text-white">Gratis &amp; cepat.</span> Begitu
                  daftar, kamu langsung jadi member{" "}
                  <span className="font-bold text-white">Silver</span> — dapat welcome
                  voucher, poin tiap order, dan tersambung otomatis ke kasir &amp; CRM.
                </div>

                <label className="grid gap-2">
                  <span className="garage-mono text-[#d6d6dc]">Nama Lengkap</span>
                  <span className="flex items-center gap-3 border border-[#34343c] bg-white/[0.055] px-4 py-3 transition-colors focus-within:border-[#f5a742]">
                    <User size={17} className="shrink-0 text-[#f5a742]" />
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-[#777782]"
                      placeholder="Nama kamu"
                      autoComplete="name"
                      required
                    />
                  </span>
                </label>

                <label className="grid gap-2">
                  <span className="garage-mono text-[#d6d6dc]">Nomor HP</span>
                  <span className="flex items-center gap-3 border border-[#34343c] bg-white/[0.055] px-4 py-3 transition-colors focus-within:border-[#f5a742]">
                    <Phone size={17} className="shrink-0 text-[#f5a742]" />
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-[#777782]"
                      placeholder="0813..."
                      autoComplete="tel"
                      inputMode="tel"
                      required
                    />
                  </span>
                </label>

                <label className="grid gap-1.5">
                  <span className="garage-mono text-[#d6d6dc]">Buat PIN</span>
                  <span className="flex items-center gap-3 border border-[#34343c] bg-white/[0.055] px-4 py-3 transition-colors focus-within:border-[#f5a742]">
                    <LockKeyhole size={17} className="shrink-0 text-[#f5a742]" />
                    <input
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-[#777782]"
                      placeholder="Min. 6 digit/karakter"
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </span>
                  <span className="text-xs text-[#9696a1]">Dipakai untuk login member berikutnya.</span>
                </label>

                {!showOptional ? (
                  <button
                    type="button"
                    onClick={() => setShowOptional(true)}
                    className="garage-press inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[#ffd79a]"
                  >
                    + Lengkapi data (opsional): email, ulang tahun, referral
                  </button>
                ) : (
                  <div className="grid gap-4 rounded-md border border-[#34343c] bg-white/[0.02] p-3">
                    <label className="grid gap-2">
                      <span className="garage-mono text-[#d6d6dc]">Email (opsional)</span>
                      <span className="flex items-center gap-3 border border-[#34343c] bg-white/[0.055] px-4 py-3 transition-colors focus-within:border-[#f5a742]">
                        <Mail size={17} className="shrink-0 text-[#f5a742]" />
                        <input
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-[#777782]"
                          placeholder="nama@email.com"
                          autoComplete="email"
                        />
                      </span>
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="garage-mono text-[#d6d6dc]">Tanggal Lahir</span>
                        <span className="flex items-center gap-3 border border-[#34343c] bg-white/[0.055] px-4 py-3 transition-colors focus-within:border-[#f5a742]">
                          <Gift size={17} className="shrink-0 text-[#f5a742]" />
                          <input
                            value={birthday}
                            onChange={(event) => setBirthday(event.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-[#777782]"
                            type="date"
                          />
                        </span>
                      </label>
                      <label className="grid gap-2">
                        <span className="garage-mono text-[#d6d6dc]">Kode Referral</span>
                        <span className="flex items-center gap-3 border border-[#34343c] bg-white/[0.055] px-4 py-3 transition-colors focus-within:border-[#f5a742]">
                          <BadgeCheck size={17} className="shrink-0 text-[#f5a742]" />
                          <input
                            value={referralCode}
                            onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                            className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-[#777782]"
                            placeholder="Punya kode teman?"
                          />
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                <button className="btn btn-primary garage-login-submit mt-1 justify-center whitespace-nowrap" disabled={busy}>
                  <span className="truncate">{busy ? "Memproses" : "Daftar Gratis"}</span>
                  <ArrowRight size={15} />
                </button>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <span className="min-w-0 truncate text-sm text-[#9696a1]">Sudah punya akun?</span>
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="garage-press shrink-0 whitespace-nowrap text-sm font-semibold text-[#f5a742] hover:text-white"
                  >
                    Masuk Member
                  </button>
                </div>
              </form>
            )}

            {fromDigitalMenu ? (
              <Link
                href={returnTarget}
                className="garage-press mt-4 flex h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 px-3 text-sm font-semibold text-[#ffd79a] transition hover:border-[#f5a742]/60 hover:text-white"
              >
                <ArrowLeft size={16} />
                <span className="truncate whitespace-nowrap">Kembali ke Menu Digital</span>
              </Link>
            ) : null}

            {message ? (
              <div className="mt-5 border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-4 py-3 text-sm text-[#ffd7da]">
                {message}
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
