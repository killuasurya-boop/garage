"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoginFrame } from "@/components/garage/login/garage-login";
import { authClient } from "@/lib/auth-client";
import { oauthContinueUrl } from "@/lib/oauth-login-continue";
import { twoFactorChallengeError } from "@/lib/two-factor-challenge-error";

type Mode = "totp" | "backup";

export function TwoFactorChallenge({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  // "Ingat perangkat ini" (Owner 28 Okt 2026): perangkat ini tidak diminta 2FA lagi saat
  // login selama 30 hari (cookie terpercaya Better Auth, trustDeviceMaxAge di auth.ts).
  const [trustDevice, setTrustDevice] = useState(false);
  const loginUrl = `/login?next=${encodeURIComponent(next)}`;

  async function verify() {
    if (busy || restartRequired) return;
    if (mode === "totp" && code.length !== 6) {
      setError("Kode harus 6 digit.");
      return;
    }
    if (mode === "backup" && code.length < 6) {
      setError("Masukkan backup code yang valid.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "totp"
          ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
          : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });

      if (result.error) {
        const recovery = twoFactorChallengeError(result.error, mode);
        setError(recovery.message);
        setRestartRequired(recovery.restartRequired);
        setBusy(false);
        return;
      }
      // Alur OAuth MCP ChatGPT: server membalas URL lanjutan (consent) dan
      // redirectPlugin bawaan authClient sudah mengarahkan ke sana — jangan
      // navigasi kedua (membatalkan yang pertama).
      if (oauthContinueUrl(result.data)) return;
      // Sukses — session udah dibuat di server, redirect.
      window.location.href = next;
    } catch {
      setError("Server tidak bisa dihubungi. Coba lagi.");
      setBusy(false);
    }
  }

  function switchMode(target: Mode) {
    setMode(target);
    setCode("");
    setError(null);
  }

  const tabClass = (active: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm px-3 text-sm font-semibold transition ${
      active ? "bg-[#d11a2a] text-white" : "text-[#b8b8bf] hover:bg-white/[0.05] hover:text-white"
    }`;

  return (
    <LoginFrame
      title="Verifikasi 2FA"
      subtitle={
        mode === "totp"
          ? "Buka aplikasi authenticator (Google Authenticator, Authy, 1Password), lalu masukkan kode 6 digit."
          : "Masukkan salah satu backup code yang Anda simpan saat setup. Tiap kode hanya bisa dipakai sekali."
      }
      footer={
        <Link href={loginUrl} className="inline-flex min-h-11 items-center gap-1.5 hover:text-white">
          <ArrowLeft className="size-3.5" aria-hidden /> Kembali ke login
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded-md border border-[#2a2a30] bg-[#08080a] p-1">
          <button type="button" onClick={() => switchMode("totp")} className={tabClass(mode === "totp")}>
            <Smartphone className="size-4" aria-hidden /> Authenticator
          </button>
          <button type="button" onClick={() => switchMode("backup")} className={tabClass(mode === "backup")}>
            <KeyRound className="size-4" aria-hidden /> Backup code
          </button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="garage-2fa-code" className="block text-sm font-semibold text-white">
            {mode === "totp" ? "Kode 6 digit" : "Backup code"}
          </label>
          <Input
            id="garage-2fa-code"
            autoFocus
            value={code}
            onChange={(event) => {
              const val =
                mode === "totp"
                  ? event.target.value.replace(/\D/g, "").slice(0, 6)
                  : event.target.value.trim();
              setCode(val);
            }}
            placeholder={mode === "totp" ? "123456" : "xxxx-xxxx-xx"}
            inputMode={mode === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code"
            enterKeyHint="go"
            maxLength={mode === "totp" ? 6 : 24}
            className="h-12 rounded-md border-[#3a3a42] bg-[#08080a] text-center font-mono text-lg tracking-widest text-white placeholder:text-[#6e6e76] focus-visible:border-[#f4f4f5] focus-visible:ring-[#f4f4f5]/20"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !busy) verify();
            }}
          />
        </div>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-[#2a2a30] bg-[#08080a] px-3 py-2.5 text-sm text-[#e4e4e7]">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[#d11a2a]"
            data-testid="two-factor-trust-device"
          />
          <span>
            <span className="block font-semibold text-white">Ingat perangkat ini 30 hari</span>
            <span className="block text-xs text-[#b8b8bf]">Tidak diminta kode 2FA lagi di perangkat ini. Jangan centang di komputer/tablet bersama (kasir).</span>
          </span>
        </label>

        {error ? (
          <p role="alert" className="rounded-md border border-[#ff2a3a]/50 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#f4f4f5]">
            {error}
          </p>
        ) : null}

        {restartRequired && <Link href={loginUrl} className="flex min-h-12 items-center justify-center rounded-md bg-[#d11a2a] px-4 font-semibold text-white">Login ulang &amp; buat sesi baru</Link>}

        <Button
          onClick={verify}
          disabled={busy || restartRequired || !code}
          className="garage-press h-12 w-full rounded-md bg-[#d11a2a] text-base font-bold text-white hover:bg-[#ff2a3a] active:bg-[#a3141f]"
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
          Verifikasi &amp; masuk
        </Button>

        <button
          type="button"
          onClick={() => switchMode(mode === "totp" ? "backup" : "totp")}
          className="block w-full text-center text-xs font-semibold text-[#b8b8bf] underline-offset-4 hover:text-white hover:underline"
        >
          {mode === "totp" ? "Kehilangan authenticator? Pakai backup code" : "Pakai aplikasi authenticator"}
        </button>
      </div>
    </LoginFrame>
  );
}
