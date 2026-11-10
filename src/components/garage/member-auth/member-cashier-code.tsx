"use client";

import { useRef, useState } from "react";
import { KeyRound, Store } from "lucide-react";

import { AuthenticationStatus, type AuthStatus } from "./authentication-status";
import { MemberButton } from "./member-button";
import { MemberField } from "./member-field";
import { parseTokenExpiry, type MemberVerification } from "./use-member-verification";

// Kode klaim dari kasir (owner Nov 2026): pelanggan lama (punya poin/riwayat di kasir) membuktikan nomornya
// dengan kode 6 angka yang dibuat kasir di POS. Selalu tersedia — bukti dari kasir, bukan provider luar,
// jadi tidak melanggar kontrak member #13. Hasilnya token yang sama dengan OTP WhatsApp.

type Json<T> = { success: true; data: T } | { success: false; message: string };

export function MemberCashierCode({
  phone,
  alreadyVerified = false,
  onVerified,
}: {
  phone: string;
  /** Induk sudah memegang token verifikasi yang masih berlaku untuk nomor ini → kontrol disembunyikan. */
  alreadyVerified?: boolean;
  onVerified: (result: MemberVerification) => void;
}) {
  const digits = phone.replace(/\D/g, "");
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ status: AuthStatus; digits: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const status = message?.digits === digits ? message.status : null;

  if (alreadyVerified) return null;

  async function submit() {
    if (digits.length < 9) {
      setMessage({ status: { tone: "error", message: "Isi nomor HP yang sama dengan yang terdaftar di kasir." }, digits });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setMessage({ status: { tone: "error", message: "Masukkan 6 angka kode dari kasir." }, digits });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/member/auth/claim/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const json = (await res.json().catch(() => ({ success: false, message: "Respons tidak valid." }))) as Json<{
        verificationToken: string;
        tokenExpiresAt?: string;
      }>;
      if (!res.ok || !json.success) throw new Error(json.success ? "Kode tidak valid." : json.message);
      setCode("");
      setMessage(null);
      onVerified({ token: json.data.verificationToken, digits, expiresAt: parseTokenExpiry(json.data.tokenExpiresAt) });
    } catch (error) {
      setMessage({ status: { tone: "error", message: error instanceof Error ? error.message : "Kode tidak valid." }, digits });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 justify-self-start text-sm font-semibold text-[var(--gm-text-2)] underline-offset-4 hover:text-white hover:underline focus-visible:text-white focus-visible:underline focus-visible:outline-none"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => codeRef.current?.focus(), 50);
        }}
        aria-expanded={false}
      >
        <Store size={16} aria-hidden="true" />
        Punya kode dari kasir?
      </button>
    );
  }

  return (
    <div className="grid gap-3">
      <MemberField
        ref={codeRef}
        label="Kode klaim dari kasir"
        icon={<KeyRound size={19} />}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder="6 angka"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        hint="Sudah pernah belanja di Garage? Minta kode di kasir supaya poin & riwayatmu tersambung."
      />
      <MemberButton type="button" variant="secondary" showArrow={false} loading={busy} loadingLabel="Memeriksa…" onClick={() => void submit()}>
        Pakai kode kasir
      </MemberButton>
      <AuthenticationStatus status={status} />
    </div>
  );
}
