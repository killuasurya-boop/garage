"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, Gift, LockKeyhole, Mail, Phone, User } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { AuthenticationStatus, type AuthStatus } from "@/components/garage/member-auth/authentication-status";
import { MemberButton } from "@/components/garage/member-auth/member-button";
import { MemberField } from "@/components/garage/member-auth/member-field";
import "@/components/garage/member-auth/member-auth.css";

type RegisterResponse =
  | { success: true; data: { member: { name: string; memberCode: string | null; tier: string } } }
  | { success: false; message: string };

/**
 * MemberRegisterSheet — daftar member langsung dari invoice. Memakai API & primitive
 * member yang sudah ada (/api/member/auth/register, MemberField, MemberButton).
 * Wajib: nama, WhatsApp, PIN, setuju ketentuan. Izin promosi TERPISAH & default mati.
 * Invoice tidak ditautkan ke akun dari sini (token ≠ bukti kepemilikan).
 */
export function MemberRegisterSheet({
  open,
  onOpenChange,
  token,
  defaultName,
  loginHref,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  defaultName?: string | null;
  loginHref: string;
  onRegistered: (member: { name: string; memberCode: string | null; tier: string }) => void;
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [referral, setReferral] = useState("");
  const [optional, setOptional] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Nama minimal 2 huruf.";
    if (phone.replace(/\D/g, "").length < 9) next.phone = "Nomor WhatsApp belum lengkap.";
    if (pin.length < 6) next.pin = "PIN minimal 6 digit.";
    if (!terms) next.terms = "Setujui syarat & kebijakan privasi untuk mendaftar.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/member/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          password: pin,
          email: email.trim(),
          birthday,
          referralCode: referral.trim(),
          marketingConsent: marketing,
          source: "invoice",
          invoiceToken: token,
        }),
      });
      const json = (await response.json().catch(() => ({ success: false, message: "Respons tidak valid." }))) as RegisterResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.success ? "Pendaftaran gagal." : json.message);
      }
      setPin("");
      onRegistered(json.data.member);
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Pendaftaran gagal." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="iv-sheet mx-auto max-h-[94svh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl border-[var(--iv-border-strong)] p-0"
      >
        <div className="gm-root gm-inline px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="pr-10">
            <p className="gm-eyebrow">Gratis · ±1 menit</p>
            <SheetTitle className="gm-heading mt-1 text-[24px] leading-tight">Daftar Member Garage Coffee</SheetTitle>
            <SheetDescription className="mt-1 text-[13.5px] text-[var(--gm-text-2)]">
              Kumpulkan poin dari belanja berikutnya dan pakai voucher member.
            </SheetDescription>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={submit} noValidate>
            <MemberField
              label="Nama lengkap *"
              icon={<User size={18} />}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              error={errors.name}
            />
            <MemberField
              label="Nomor WhatsApp aktif *"
              icon={<Phone size={18} />}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="08xxxxxxxxxx"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/[^0-9+\s-]/g, "").slice(0, 20))}
              error={errors.phone}
              hint="Dipakai untuk masuk member & pesan transaksi."
            />
            <MemberField
              label="Buat PIN *"
              icon={<LockKeyhole size={18} />}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="Minimal 6 digit"
              value={pin}
              onChange={(event) => setPin(event.target.value.slice(0, 32))}
              error={errors.pin}
            />

            <button
              type="button"
              className="flex items-center gap-1.5 justify-self-start text-[13px] font-semibold text-[var(--gm-text-2)]"
              aria-expanded={optional}
              onClick={() => setOptional((value) => !value)}
            >
              <ChevronDown className={`size-4 transition-transform ${optional ? "rotate-180" : ""}`} aria-hidden />
              Data opsional (email, tanggal lahir, kode referral)
            </button>
            {optional ? (
              <div className="grid gap-4">
                <MemberField label="Email" icon={<Mail size={18} />} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                <MemberField
                  label="Tanggal lahir"
                  icon={<CalendarDays size={18} />}
                  type="date"
                  value={birthday}
                  onChange={(event) => setBirthday(event.target.value)}
                  hint="Hanya untuk ucapan/promo ulang tahun bila tersedia."
                />
                <MemberField
                  label="Kode referral"
                  icon={<Gift size={18} />}
                  value={referral}
                  onChange={(event) => setReferral(event.target.value.toUpperCase().slice(0, 24))}
                />
              </div>
            ) : null}

            <label className="iv-check">
              <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} aria-invalid={errors.terms ? true : undefined} />
              <span>
                Saya setuju dengan{" "}
                <Link href="/legal/terms" target="_blank">
                  Syarat & Ketentuan
                </Link>{" "}
                dan{" "}
                <Link href="/legal/privacy" target="_blank">
                  Kebijakan Privasi
                </Link>{" "}
                Garage Coffee untuk pemrosesan data pendaftaran. *
              </span>
            </label>
            {errors.terms ? <p className="-mt-2 text-[13px] text-[#ffb3b5]">{errors.terms}</p> : null}
            <label className="iv-check">
              <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
              <span>(Opsional) Saya mau menerima info promo & reward lewat WhatsApp. Bisa dihentikan kapan saja.</span>
            </label>

            <AuthenticationStatus status={status} />
            <MemberButton type="submit" loading={busy} loadingLabel="Mendaftarkan…">
              Daftar Sekarang
            </MemberButton>
            <p className="text-center text-[13.5px] text-[var(--gm-text-2)]">
              Sudah punya akun?{" "}
              <Link href={loginHref} className="gm-link font-semibold">
                Masuk Member
              </Link>
            </p>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
