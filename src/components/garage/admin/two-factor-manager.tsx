"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

type Props = {
  user: {
    id: string;
    name: string;
    email: string;
    twoFactorEnabled: boolean;
  };
  policyRequires2fa: boolean;
  role: string;
};

type EnableStep = "idle" | "password" | "scan" | "verify" | "backup" | "done";

export function TwoFactorManager({ user, policyRequires2fa, role }: Props) {
  const [enabled, setEnabled] = useState(user.twoFactorEnabled);
  const [step, setStep] = useState<EnableStep>("idle");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  async function startEnable() {
    setError(null);
    setStep("password");
  }

  async function submitPassword() {
    if (!password) {
      setError("Password wajib diisi.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.twoFactor.enable({ password });
      if (result.error) {
        setError(result.error.message ?? "Gagal aktifkan 2FA.");
        setBusy(false);
        return;
      }
      const data = result.data as {
        totpURI?: string;
        backupCodes?: string[];
      } | null;
      if (data?.totpURI) setTotpUri(data.totpURI);
      if (data?.backupCodes) setBackupCodes(data.backupCodes);
      setStep("scan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyTotp() {
    if (!totpCode || totpCode.length < 6) {
      setError("Kode TOTP harus 6 digit.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: totpCode });
      if (result.error) {
        setError(result.error.message ?? "Kode salah, coba lagi.");
        setBusy(false);
        return;
      }
      setEnabled(true);
      setStep("backup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function disable2fa() {
    if (!disablePassword) {
      setError("Password wajib diisi untuk disable 2FA.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.twoFactor.disable({ password: disablePassword });
      if (result.error) {
        setError(result.error.message ?? "Gagal disable 2FA.");
        setBusy(false);
        return;
      }
      setEnabled(false);
      setShowDisable(false);
      setDisablePassword("");
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("idle");
    setPassword("");
    setTotpCode("");
    setTotpUri(null);
    setBackupCodes([]);
    setError(null);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  // QR code via external service (no extra dep) — generate SVG from TOTP URI
  function qrSvgUrl(uri: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(uri)}`;
  }

  return (
    <div className="px-4 py-8 lg:px-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--primary)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Garage Control · Two-Factor Authentication
            </div>
            <h1 className="mt-2 text-3xl font-semibold">2FA TOTP</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Lapisan keamanan ekstra untuk akun {user.email}. Pakai Google Authenticator,
              1Password, Authy, atau apps TOTP lain.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {enabled ? (
              <Badge className="border-emerald-700 bg-emerald-950/60 text-emerald-300">
                <ShieldCheck className="mr-1 h-3 w-3" /> 2FA Aktif
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-zinc-700 bg-zinc-950 text-zinc-400"
              >
                <ShieldOff className="mr-1 h-3 w-3" /> 2FA Belum Aktif
              </Badge>
            )}
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              {role}
            </span>
          </div>
        </header>

        {policyRequires2fa && !enabled ? (
          <Card className="border-rose-800 bg-rose-950/30">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <div className="text-sm font-semibold text-rose-200">
                  Policy wajib 2FA aktif
                </div>
                <p className="mt-0.5 text-xs text-rose-300/80">
                  Admin Garage me-require 2FA untuk role <strong>{role}</strong>. Aktifkan
                  sekarang biar akun lo gak di-flag di security audit.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {/* IDLE state */}
        {!enabled && step === "idle" ? (
          <Card className="border-[var(--border)] bg-[var(--card)]">
            <CardHeader>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Shield className="h-4 w-4 text-[var(--primary)]" /> Aktifkan 2FA
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Setelah aktif, login akan minta kode 6-digit dari aplikasi authenticator
                selain password.
              </p>
            </CardHeader>
            <CardContent>
              <ol className="mb-4 space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="font-bold text-[var(--primary)]">1.</span>
                  <span>Konfirmasi password akun lo</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-[var(--primary)]">2.</span>
                  <span>Scan QR code dengan aplikasi authenticator</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-[var(--primary)]">3.</span>
                  <span>Verifikasi kode 6-digit pertama</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-[var(--primary)]">4.</span>
                  <span>Simpan backup codes (10 codes, sekali pakai untuk recovery)</span>
                </li>
              </ol>
              <Button
                onClick={startEnable}
                className="bg-[var(--primary)] text-white hover:opacity-90"
              >
                <Shield className="mr-2 h-4 w-4" /> Mulai Setup 2FA
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Password step */}
        {step === "password" ? (
          <Card className="border-[var(--border)] bg-[var(--card)]">
            <CardHeader>
              <h2 className="text-lg font-semibold">1. Konfirmasi password</h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Untuk security, kita verifikasi lo adalah pemilik akun.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password akun anda"
                className="border-[var(--border)] bg-[var(--background)]"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !busy) submitPassword();
                }}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} disabled={busy}>
                  Batal
                </Button>
                <Button onClick={submitPassword} disabled={busy || !password}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Lanjut
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Scan QR step */}
        {step === "scan" && totpUri ? (
          <Card className="border-[var(--border)] bg-[var(--card)]">
            <CardHeader>
              <h2 className="text-lg font-semibold">2. Scan QR code</h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Buka aplikasi authenticator, scan QR, lalu masukkan kode 6-digit pertama
                yang muncul.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <div className="rounded-md border border-[var(--border)] bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrSvgUrl(totpUri)}
                    alt="2FA QR code"
                    width={240}
                    height={240}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                      Tidak bisa scan? Manual entry:
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 break-all rounded bg-[var(--popover)] px-2 py-1.5 text-[10px] font-mono">
                        {totpUri.replace(/^otpauth:\/\/totp\//, "")}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copy(totpUri)}
                        title="Copy URI"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  3. Masukkan kode 6-digit
                </label>
                <Input
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  className="mt-1 border-[var(--border)] bg-[var(--background)] font-mono text-lg tracking-widest"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !busy) verifyTotp();
                  }}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} disabled={busy}>
                  Batal
                </Button>
                <Button onClick={verifyTotp} disabled={busy || totpCode.length !== 6}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Verifikasi & Aktifkan
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Backup codes step */}
        {step === "backup" && backupCodes.length > 0 ? (
          <Card className="border-amber-800 bg-amber-950/20">
            <CardHeader>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-200">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                4. 2FA Aktif! Simpan backup codes ini
              </h2>
              <p className="text-xs text-amber-300/80">
                <strong>Sekali pakai per code.</strong> Pakai backup code kalau lo
                kehilangan akses ke authenticator. Codes ini cuma di-show sekali — print,
                screenshot, atau simpan di password manager <strong>sekarang</strong>.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-md border border-amber-700 bg-amber-950/40 p-3 font-mono text-sm sm:grid-cols-5">
                {backupCodes.map((code) => (
                  <div
                    key={code}
                    className="rounded bg-[var(--card)] px-2 py-1.5 text-center text-amber-100"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => copy(backupCodes.join("\n"))}
                >
                  <Copy className="mr-2 h-4 w-4" /> Copy semua
                </Button>
                <Button
                  onClick={() => {
                    setStep("done");
                  }}
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Sudah disimpan
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* ENABLED state */}
        {enabled && step !== "backup" ? (
          <Card className="border-[var(--border)] bg-[var(--card)]">
            <CardHeader>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <KeyRound className="h-4 w-4 text-emerald-400" />
                2FA Aktif untuk akun ini
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Setiap login akan minta kode 6-digit dari authenticator atau backup code.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {policyRequires2fa ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                  Akun ini sudah comply dengan policy 2FA wajib untuk role {role}.
                </div>
              ) : null}
              {!showDisable ? (
                <Button
                  variant="outline"
                  onClick={() => setShowDisable(true)}
                  className="border-rose-800 text-rose-300 hover:bg-rose-950"
                >
                  <ShieldAlert className="mr-2 h-4 w-4" /> Disable 2FA
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border border-rose-800 bg-rose-950/20 p-3">
                  <div className="text-xs text-rose-200">
                    Disable 2FA akan menurunkan keamanan akun. Konfirmasi password:
                  </div>
                  <Input
                    type="password"
                    value={disablePassword}
                    onChange={(event) => setDisablePassword(event.target.value)}
                    placeholder="Password akun"
                    className="border-[var(--border)] bg-[var(--background)]"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDisable(false);
                        setDisablePassword("");
                      }}
                    >
                      Batal
                    </Button>
                    <Button
                      onClick={disable2fa}
                      disabled={busy || !disablePassword}
                      className="bg-rose-600 text-white hover:bg-rose-500"
                    >
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Konfirmasi Disable
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* DONE state */}
        {step === "done" ? (
          <Card className="border-emerald-800 bg-emerald-950/20">
            <CardContent className="flex items-start gap-3 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <div className="text-sm font-semibold text-emerald-200">
                  Setup 2FA selesai
                </div>
                <p className="mt-0.5 text-xs text-emerald-300/80">
                  Mulai login berikutnya, lo akan diminta kode 6-digit setelah masukin
                  password.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
