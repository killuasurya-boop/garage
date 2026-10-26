"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react";

import { LoginFrame } from "@/components/garage/login/garage-login";
import { Button } from "@/components/ui/button";
import { oauthContinueUrl, signedOAuthQuery } from "@/lib/oauth-login-continue";

type ConsentState =
  | { kind: "invalid" }
  | {
      kind: "request";
      clientName: string;
      clientUri: string | null;
      scopes: string[];
      userName: string;
      userEmail: string;
      access: { allowed: true } | { allowed: false; code: string; message: string };
    };

const SCOPE_LABELS: Record<string, string> = {
  "garage:owner": "Kendali penuh Garage OS atas nama Owner — baca & ubah semua modul, termasuk keuangan",
  openid: "Mengenali akun Anda",
  profile: "Nama akun",
  email: "Alamat email akun",
  offline_access: "Tetap terhubung tanpa login ulang (bisa dicabut kapan saja)",
};

export function McpChatgptConsent({ state }: { state: ConsentState }) {
  const [busy, setBusy] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setBusy(accept ? "accept" : "deny");
    setError(null);
    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ accept, oauth_query: signedOAuthQuery(window.location.search) }),
      });
      const data = await response.json().catch(() => null);
      const url = oauthContinueUrl(data);
      if (!response.ok || !url) {
        setError("Permintaan sudah kedaluwarsa atau tidak valid. Mulai ulang koneksi dari ChatGPT.");
        setBusy(null);
        return;
      }
      window.location.assign(url);
    } catch {
      setError("Server tidak bisa dihubungi. Coba lagi.");
      setBusy(null);
    }
  }

  if (state.kind === "invalid") {
    return (
      <LoginFrame title="Tautan tidak valid" subtitle="Permintaan koneksi sudah kedaluwarsa atau diubah.">
        <p className="text-sm text-[#d4d4d8]">Mulai ulang koneksi dari ChatGPT, lalu login lagi.</p>
      </LoginFrame>
    );
  }

  return (
    <LoginFrame title="Hubungkan aplikasi AI" subtitle={`${state.clientName} meminta akses ke Garage OS.`}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-[#2a2a30] bg-[#08080a] p-3">
          <Bot className="mt-0.5 size-5 shrink-0 text-[#f5b13d]" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-white break-words">{state.clientName}</p>
            {state.clientUri ? <p className="break-all text-[#b8b8bf]">{state.clientUri}</p> : null}
            <p className="mt-1 text-[#b8b8bf]">
              Masuk sebagai <span className="font-semibold text-white">{state.userName}</span> ({state.userEmail})
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-white">Akses yang diminta</p>
          <ul className="space-y-1.5 text-sm text-[#d4d4d8]">
            {state.scopes.map((scope) => (
              <li key={scope} className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#f4f4f5]" aria-hidden />
                <span>{SCOPE_LABELS[scope] ?? scope}</span>
              </li>
            ))}
          </ul>
        </div>

        {state.access.allowed ? (
          <p className="rounded-md border border-[#f5b13d]/40 bg-[#f5b13d]/10 px-3 py-2 text-sm text-[#f4f4f5]">
            Aksi yang menyentuh uang (mis. catat pengeluaran, putuskan pengajuan) baru dijalankan setelah Anda
            mengonfirmasi ringkasannya di chat. Semua tercatat di Audit (sumber ChatGPT); koneksi bisa dijeda kapan saja
            di Pengaturan → Keamanan.
          </p>
        ) : (
          <div role="alert" className="flex gap-2 rounded-md border border-[#ff2a3a]/50 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#f4f4f5]">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p>{state.access.message}</p>
              {state.access.code === "TWO_FACTOR_REQUIRED" ? (
                <Link href="/control/2fa" className="mt-1 inline-block font-semibold underline underline-offset-4">
                  Buka pengaturan 2FA
                </Link>
              ) : null}
            </div>
          </div>
        )}

        {error ? (
          <p role="alert" className="rounded-md border border-[#ff2a3a]/50 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#f4f4f5]">
            {error}
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            onClick={() => decide(false)}
            disabled={busy !== null}
            className="garage-press h-12 rounded-md border-[#3a3a42] bg-transparent text-base font-semibold text-white hover:bg-white/[0.06]"
          >
            {busy === "deny" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <X className="mr-2 size-4" />}
            Tolak
          </Button>
          {state.access.allowed ? (
            <Button
              onClick={() => decide(true)}
              disabled={busy !== null}
              className="garage-press h-12 rounded-md bg-[#d11a2a] text-base font-bold text-white hover:bg-[#ff2a3a] active:bg-[#a3141f]"
            >
              {busy === "accept" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
              Izinkan
            </Button>
          ) : null}
        </div>
      </div>
    </LoginFrame>
  );
}
