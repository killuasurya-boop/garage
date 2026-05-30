"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

type Mode = "totp" | "backup";

export function TwoFactorChallenge({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    if (mode === "totp" && code.length !== 6) {
      setError("Kode TOTP harus 6 digit.");
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
          ? await authClient.twoFactor.verifyTotp({ code })
          : await authClient.twoFactor.verifyBackupCode({ code });

      if (result.error) {
        setError(result.error.message ?? "Kode salah, coba lagi.");
        setBusy(false);
        return;
      }
      // Sukses — session udah dibuat di server, redirect.
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setBusy(false);
    }
  }

  function switchMode(target: Mode) {
    setMode(target);
    setCode("");
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.12),_transparent_60%)] bg-zinc-950 px-4 text-zinc-100">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-red-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Garage OS · 2FA Challenge
          </div>
          <h1 className="text-2xl font-semibold">Verifikasi identitas</h1>
          <p className="text-sm text-zinc-400">
            {mode === "totp"
              ? "Buka aplikasi authenticator (Google Authenticator, 1Password, Authy) dan masukkan kode 6-digit yang lagi muncul."
              : "Masukkan salah satu backup code 10-digit yang lo simpan saat setup. Tiap code cuma bisa dipakai sekali."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-1">
            <button
              type="button"
              onClick={() => switchMode("totp")}
              className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm transition ${
                mode === "totp"
                  ? "bg-red-600 text-white"
                  : "text-zinc-400 hover:bg-zinc-900"
              }`}
            >
              <Smartphone className="h-4 w-4" /> Authenticator
            </button>
            <button
              type="button"
              onClick={() => switchMode("backup")}
              className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm transition ${
                mode === "backup"
                  ? "bg-red-600 text-white"
                  : "text-zinc-400 hover:bg-zinc-900"
              }`}
            >
              <KeyRound className="h-4 w-4" /> Backup code
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {mode === "totp" ? "Kode 6-digit" : "Backup code"}
            </label>
            <Input
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
              maxLength={mode === "totp" ? 6 : 24}
              className="mt-1 border-zinc-700 bg-zinc-950 text-center font-mono text-lg tracking-widest"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !busy) verify();
              }}
            />
          </div>

          {error ? (
            <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <Button
            onClick={verify}
            disabled={busy || !code}
            className="w-full bg-red-600 text-white hover:bg-red-500"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Verifikasi & Login
          </Button>

          <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-xs text-zinc-500">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 hover:text-zinc-300"
            >
              <ArrowLeft className="h-3 w-3" /> Kembali ke login
            </Link>
            {mode === "totp" ? (
              <button
                type="button"
                onClick={() => switchMode("backup")}
                className="hover:text-zinc-300"
              >
                Kehilangan authenticator?
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchMode("totp")}
                className="hover:text-zinc-300"
              >
                Pakai authenticator
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
