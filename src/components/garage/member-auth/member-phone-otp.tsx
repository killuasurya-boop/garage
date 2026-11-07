"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, MessageCircle } from "lucide-react";

import { AuthenticationStatus, type AuthStatus } from "./authentication-status";
import { MemberButton } from "./member-button";
import { MemberField } from "./member-field";

// Verifikasi nomor WhatsApp member dengan kode OTP (owner Nov 2026). Hanya dirender
// bila provider nyata aktif (useMemberOtpStatus) — kontrak member #13: tanpa tombol OTP palsu.

type Json<T> = { success: true; data: T } | { success: false; message: string };

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({ success: false, message: "Respons tidak valid." }))) as Json<T>;
  if (!res.ok || !json.success) throw new Error(json.success ? "Permintaan gagal." : json.message);
  return json.data;
}

/** null = sedang dicek; false = OTP tidak aktif (pendaftaran lama tetap jalan). */
export function useMemberOtpStatus() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/member/auth/otp/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: Json<{ enabled: boolean }>) => alive && setEnabled(json.success ? json.data.enabled : false))
      .catch(() => alive && setEnabled(false));
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}

export function MemberPhoneOtp({
  phone,
  onVerified,
}: {
  phone: string;
  /** Token verifikasi untuk /api/member/auth/register + nomor (digit) yang diverifikasi. */
  onVerified: (result: { token: string; digits: string }) => void;
}) {
  const digits = phone.replace(/\D/g, "");
  // Tantangan & verifikasi terikat ke nomor: nomor diganti → otomatis tampil seperti awal.
  const [challenge, setChallenge] = useState<{ id: string; digits: string } | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [message, setMessage] = useState<{ status: AuthStatus; digits: string } | null>(null);
  const [verifiedFor, setVerifiedFor] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const verified = verifiedFor === digits && digits.length > 0;
  const challengeId = challenge?.digits === digits ? challenge.id : null;
  const status = message?.digits === digits ? message.status : null;
  const setStatus = (next: AuthStatus | null) => setMessage(next ? { status: next, digits } : null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function send() {
    if (digits.length < 9) {
      setStatus({ tone: "error", message: "Isi nomor WhatsApp dulu." });
      return;
    }
    setBusy("send");
    setStatus(null);
    try {
      const data = await post<{ challengeId: string; resendAfterSeconds: number; maskedPhone: string; devCode?: string }>(
        "/api/member/auth/otp/request",
        { phone },
      );
      setChallenge({ id: data.challengeId, digits });
      setCooldown(data.resendAfterSeconds);
      setCode("");
      setStatus({
        tone: "info",
        message: data.devCode
          ? `Mode uji (bukan produksi): kode ${data.devCode}.`
          : `Kode 6 angka dikirim ke WhatsApp ${data.maskedPhone}. Berlaku 5 menit.`,
      });
      window.setTimeout(() => codeRef.current?.focus(), 50);
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Kode gagal dikirim." });
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    if (!challengeId || !/^\d{6}$/.test(code)) {
      setStatus({ tone: "error", message: "Masukkan 6 angka kode dari WhatsApp." });
      return;
    }
    setBusy("verify");
    setStatus(null);
    try {
      const data = await post<{ verificationToken: string }>("/api/member/auth/otp/verify", { challengeId, code });
      setVerifiedFor(digits);
      onVerified({ token: data.verificationToken, digits });
      setStatus({ tone: "success", message: "Nomor WhatsApp terverifikasi." });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Kode salah." });
    } finally {
      setBusy(null);
    }
  }

  if (verified) return <AuthenticationStatus status={status ?? { tone: "success", message: "Nomor WhatsApp terverifikasi." }} />;

  return (
    <div className="grid gap-3">
      <MemberButton
        type="button"
        variant="secondary"
        showArrow={false}
        loading={busy === "send"}
        loadingLabel="Mengirim kode…"
        disabled={cooldown > 0}
        onClick={() => void send()}
      >
        <span className="inline-flex items-center gap-2">
          <MessageCircle size={17} aria-hidden="true" />
          {cooldown > 0 ? `Kirim ulang dalam ${cooldown} dtk` : challengeId ? "Kirim ulang kode" : "Kirim kode ke WhatsApp"}
        </span>
      </MemberButton>
      {challengeId ? (
        <div className="grid gap-3">
          <MemberField
            ref={codeRef}
            label="Kode verifikasi WhatsApp"
            icon={<KeyRound size={19} />}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void verify();
              }
            }}
            placeholder="6 angka"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
          />
          <MemberButton type="button" loading={busy === "verify"} loadingLabel="Memeriksa…" onClick={() => void verify()}>
            Verifikasi Nomor
          </MemberButton>
        </div>
      ) : null}
      <AuthenticationStatus status={status} />
    </div>
  );
}
