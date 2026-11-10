"use client";

import { useCallback, useEffect, useState } from "react";

// Satu sumber kebenaran untuk token verifikasi nomor (OTP WhatsApp atau kode kasir) di form daftar member.
// Masa berlaku dikelola DI SINI (bukan di komponen kode), jadi tetap jalan walau kontrol verifikasi
// di-unmount (mis. pindah tab Masuk ↔ Daftar) dan token lama tidak pernah menutupi kontrol verifikasi.

export type MemberVerification = { token: string; digits: string; expiresAt: number | null };

export function useMemberVerification(phone: string) {
  const [result, setResult] = useState<MemberVerification | null>(null);
  const [expiredFor, setExpiredFor] = useState<string | null>(null);

  useEffect(() => {
    if (!result?.expiresAt) return;
    const current = result;
    const expire = () => {
      setResult((prev) => (prev === current ? null : prev));
      setExpiredFor(current.digits);
    };
    const remaining = current.expiresAt! - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }
    const id = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(id);
  }, [result]);

  const onVerified = useCallback((next: MemberVerification) => {
    setExpiredFor(null);
    setResult(next);
  }, []);

  const digits = phone.replace(/\D/g, "");
  const token = result && result.digits === digits ? result.token : null;
  return { token, onVerified, expired: !token && expiredFor === digits && digits.length > 0 };
}

/** Parse `tokenExpiresAt` (ISO) dari server → epoch ms, atau null bila tidak ada. */
export function parseTokenExpiry(value: string | undefined) {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}
