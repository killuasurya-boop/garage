"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function PasswordChangePanel({ required }: { required: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak sama.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(json?.error?.message ?? "Gagal mengganti password.");
      return;
    }
    window.location.replace("/os");
  }

  return (
    <main className="min-h-screen bg-[#08080b] px-4 py-10 text-zinc-100">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center">
        <Card className="w-full border-zinc-800 bg-zinc-950/90">
          <CardHeader>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-red-400">
              <KeyRound className="h-4 w-4" />
              Garage Account
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-white">Ganti Password</h1>
            <p className="text-sm text-zinc-400">
              {required
                ? "Admin mewajibkan password baru sebelum lanjut ke operasional."
                : "Perbarui password akun Garage Anda."}
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <PasswordField
              label="Password lama"
              value={currentPassword}
              show={show}
              onChange={setCurrentPassword}
            />
            <PasswordField
              label="Password baru"
              value={newPassword}
              show={show}
              onChange={setNewPassword}
            />
            <PasswordField
              label="Konfirmasi password baru"
              value={confirmPassword}
              show={show}
              onChange={setConfirmPassword}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShow((value) => !value)}
              className="justify-start px-0 text-zinc-400 hover:bg-transparent hover:text-zinc-100"
            >
              {show ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {show ? "Sembunyikan password" : "Tampilkan password"}
            </Button>
            {error ? (
              <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            ) : null}
            <Button
              onClick={submit}
              disabled={
                submitting ||
                currentPassword.length === 0 ||
                newPassword.length < 8 ||
                confirmPassword.length < 8
              }
              className="h-11 bg-red-600 text-white hover:bg-red-500"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Simpan Password
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function PasswordField({
  label,
  value,
  show,
  onChange,
}: {
  label: string;
  value: string;
  show: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs uppercase tracking-wider text-zinc-400">{label}</span>
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-zinc-700 bg-zinc-900 text-zinc-100"
      />
    </label>
  );
}
