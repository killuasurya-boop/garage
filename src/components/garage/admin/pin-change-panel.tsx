"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { validateApprovalPin } from "@/lib/pin-rules";

/**
 * Owner/Manajer mengganti PIN persetujuan miliknya sendiri. PIN ini dipakai
 * untuk memutus void/refund/diskon langsung di tablet kasir.
 */
export function PinChangePanel({
  name,
  role,
  pinConfigured,
}: {
  name: string;
  role: string;
  pinConfigured: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasPin, setHasPin] = useState(pinConfigured);

  async function submit() {
    setError(null);
    const pinError = validateApprovalPin(newPin);
    if (pinError) {
      setError(pinError);
      return;
    }
    if (newPin !== confirmPin) {
      setError("Konfirmasi PIN tidak sama.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message ?? "Gagal menyimpan PIN.");
        return;
      }
      setSaved(true);
      setHasPin(true);
      setCurrentPassword("");
      setNewPin("");
      setConfirmPin("");
    } catch {
      setError("Gagal terhubung ke server. Cek koneksi lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else window.location.assign("/os");
  }

  return (
    <main className="min-h-screen bg-[#08080b] px-4 py-10 text-[#f4f4f5]">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center">
        <Card className="w-full border-[#34343c] bg-[#111116]">
          <CardHeader>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-[#f5a742]">
              <KeyRound className="h-4 w-4" />
              PIN Persetujuan
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-white">Atur PIN {role}</h1>
            <p className="text-sm text-[#b8b8bf]">
              {name} · PIN dipakai untuk menyetujui atau menolak batal order, refund, diskon, dan
              selisih kas langsung di tablet kasir.
            </p>
            <p
              className={`mt-2 inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${
                hasPin
                  ? "border-[#22c55e]/45 bg-[#22c55e]/10 text-[#86efac]"
                  : "border-[#f5a742]/45 bg-[#f5a742]/10 text-[#ffd79a]"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {hasPin ? "PIN sudah aktif — isi di bawah untuk mengganti" : "PIN belum diatur"}
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            {saved ? (
              <div className="flex items-start gap-2 rounded-md border border-[#22c55e]/45 bg-[#22c55e]/10 px-3 py-2 text-sm text-[#bbf7d0]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                PIN baru tersimpan dan langsung berlaku. Jangan beri tahu PIN ke kasir.
              </div>
            ) : null}
            <SecretField
              label="Password akun (konfirmasi)"
              value={currentPassword}
              show={show}
              onChange={(value) => {
                setSaved(false);
                setCurrentPassword(value);
              }}
            />
            <SecretField
              label="PIN baru (4-8 angka)"
              value={newPin}
              show={show}
              numeric
              onChange={(value) => {
                setSaved(false);
                setNewPin(value);
              }}
            />
            <SecretField
              label="Ulangi PIN baru"
              value={confirmPin}
              show={show}
              numeric
              onChange={setConfirmPin}
            />
            <p className="text-xs text-[#b8b8bf]">
              Hindari angka sama semua (1111) atau berurutan (1234). PIN harus berbeda dari PIN staf lain.
            </p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShow((value) => !value)}
              className="justify-start px-0 text-[#b8b8bf] hover:bg-transparent hover:text-white"
            >
              {show ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {show ? "Sembunyikan isian" : "Tampilkan isian"}
            </Button>
            {error ? (
              <div className="rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#ffc2c8]">
                {error}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                className="garage-press h-11 flex-1 gap-1.5 border-[#4a4a54]"
              >
                <ArrowLeft className="h-4 w-4" />
                Kembali
              </Button>
              <Button
                onClick={() => void submit()}
                disabled={
                  submitting || currentPassword.length === 0 || newPin.length < 4 || confirmPin.length < 4
                }
                className="garage-press h-11 flex-1 bg-[#d11a2a] font-bold text-white hover:bg-[#e72c3c]"
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Simpan PIN
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function SecretField({
  label,
  value,
  show,
  numeric,
  onChange,
}: {
  label: string;
  value: string;
  show: boolean;
  numeric?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs uppercase tracking-wider text-[#b8b8bf]">{label}</span>
      <Input
        type={show ? "text" : "password"}
        inputMode={numeric ? "numeric" : undefined}
        autoComplete={numeric ? "off" : "current-password"}
        maxLength={numeric ? 8 : undefined}
        value={value}
        onChange={(event) =>
          onChange(numeric ? event.target.value.replace(/\D/g, "").slice(0, 8) : event.target.value)
        }
        className="h-11 border-[#4a4a54] bg-white/[0.06] text-white"
      />
    </label>
  );
}
