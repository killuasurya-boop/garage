"use client";

// Pendaftaran calon karyawan (I3, PRD V4.0 §06.5). Akun dibuat lewat Better Auth
// email/password; lamaran = staff_access_request PENDING_OWNER_APPROVAL. Tidak ada
// pilihan peran/outlet di sini — itu ditentukan Owner saat menyetujui.
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { garageApi } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

type MyRequest = {
  hasStaffProfile: boolean;
  request: {
    status: "pending_owner_approval" | "needs_info" | "approved" | "rejected";
    legalName: string;
    phone: string;
    requestedPosition: string;
    note: string | null;
    infoRequest: string | null;
    decisionReason: string | null;
    updatedAt: string;
  } | null;
};

const field = "w-full rounded-lg border border-[var(--garage-bg-3)] bg-[var(--garage-bg-0)] px-3 py-2.5 text-sm text-[var(--garage-fg)]";
const label = "block space-y-1 text-xs font-semibold uppercase tracking-wide text-[var(--garage-mute)]";
const primary = "garage-press w-full min-h-11 rounded-lg bg-[var(--garage-red)] px-4 text-sm font-semibold text-white disabled:opacity-50";

const STATUS_COPY: Record<NonNullable<MyRequest["request"]>["status"], { title: string; body: string }> = {
  pending_owner_approval: {
    title: "Menunggu persetujuan Owner",
    body: "Lamaran sudah diterima. Akses POS, shift, keuangan, stok, dan payroll terbuka setelah Owner menyetujui dan menentukan peran serta outlet Anda.",
  },
  needs_info: { title: "Owner meminta info tambahan", body: "Lengkapi data di bawah, lalu kirim ulang." },
  approved: { title: "Akses disetujui", body: "Akun Anda sudah aktif sebagai staf. Silakan masuk ke Garage OS." },
  rejected: { title: "Lamaran ditolak", body: "Hubungi Owner bila ingin mengajukan banding." },
};

function AccountForm({ onReady }: { onReady: () => void }) {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Gagal. Periksa data Anda.");
      return;
    }
    onReady();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Pilih">
        {(
          [
            ["signup", "Daftar akun baru"],
            ["signin", "Sudah punya akun"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`garage-press min-h-10 rounded-lg border px-2 text-sm font-semibold ${mode === value ? "border-[var(--garage-red)] text-[var(--garage-fg)]" : "border-[var(--garage-bg-3)] text-[var(--garage-mute)]"}`}
          >
            {text}
          </button>
        ))}
      </div>
      {mode === "signup" ? (
        <label htmlFor="reg-name" className={label}>
          Nama
          <input id="reg-name" required minLength={3} autoComplete="name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      ) : null}
      <label htmlFor="reg-email" className={label}>
        Email
        <input id="reg-email" type="email" required autoComplete="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label htmlFor="reg-password" className={label}>
        Password
        <input
          id="reg-password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className={field}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Memproses…" : mode === "signup" ? "Buat akun & lanjut" : "Masuk & lanjut"}
      </button>
    </form>
  );
}

function ApplicationForm({ initial, onSubmitted }: { initial: MyRequest["request"]; onSubmitted: () => void }) {
  const [legalName, setLegalName] = useState(initial?.legalName ?? "");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState(initial?.requestedPosition ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await garageApi.post("/api/staff-access/request", { legalName, phone, requestedPosition: position, note: note || undefined });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim lamaran.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="app-name" className={label}>
        Nama lengkap (sesuai KTP)
        <input id="app-name" required minLength={3} className={field} value={legalName} onChange={(e) => setLegalName(e.target.value)} />
      </label>
      <label htmlFor="app-phone" className={label}>
        Nomor WhatsApp
        <input id="app-phone" required inputMode="tel" placeholder={initial ? `Terdaftar: ${initial.phone}` : "0812xxxxxxx"} className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label htmlFor="app-position" className={label}>
        Posisi yang dilamar
        <input id="app-position" required minLength={2} placeholder="Kasir, Barista, Kitchen, Waiter…" className={field} value={position} onChange={(e) => setPosition(e.target.value)} />
      </label>
      <label htmlFor="app-note" className={label}>
        Catatan (opsional)
        <textarea id="app-note" rows={3} maxLength={500} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Mengirim…" : "Kirim lamaran ke Owner"}
      </button>
    </form>
  );
}

export function StaffRegister() {
  const [state, setState] = useState<"loading" | "account" | "ready">("loading");
  const [mine, setMine] = useState<MyRequest | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMine(await garageApi.get<MyRequest>("/api/staff-access/request", { cache: "no-store" }));
      setState("ready");
    } catch {
      setState("account");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    garageApi
      .get<MyRequest>("/api/staff-access/request", { cache: "no-store" })
      .then((data) => {
        if (cancelled) return;
        setMine(data);
        setState("ready");
      })
      .catch(() => !cancelled && setState("account"));
    return () => {
      cancelled = true;
    };
  }, []);

  const request = mine?.request ?? null;
  const copy = request ? STATUS_COPY[request.status] : null;
  const canEdit = !mine?.hasStaffProfile && (!request || request.status === "needs_info" || request.status === "pending_owner_approval");

  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="relative mx-auto h-16 w-56">
          <Image src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" fill priority sizes="224px" className="object-contain" />
        </div>
        <section className="space-y-4 rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-5">
          <div>
            <h1 className="text-xl font-bold text-[var(--garage-fg)]">Daftar Karyawan</h1>
            <p className="mt-1 text-sm text-[var(--garage-mute)]">Lamaran ditinjau Owner. Peran & outlet ditentukan Owner saat menyetujui.</p>
          </div>

          {state === "loading" ? <p className="text-sm text-[var(--garage-mute)]">Memuat…</p> : null}
          {state === "account" ? <AccountForm onReady={() => void refresh()} /> : null}

          {state === "ready" && mine?.hasStaffProfile ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--garage-fg)]">Akun ini sudah terdaftar sebagai staf.</p>
              <Link href="/os" className={`${primary} inline-flex items-center justify-center`}>Buka Garage OS</Link>
            </div>
          ) : null}

          {state === "ready" && !mine?.hasStaffProfile ? (
            <div className="space-y-4">
              {copy ? (
                <div role="status" className="rounded-xl border border-[var(--garage-amber)]/50 bg-[var(--garage-amber)]/10 p-3">
                  <p className="font-semibold text-[var(--garage-fg)]">{copy.title}</p>
                  <p className="mt-1 text-sm text-[var(--garage-fg)]/90">{copy.body}</p>
                  {request?.infoRequest && request.status === "needs_info" ? <p className="mt-2 text-sm text-[var(--garage-fg)]">Pesan Owner: {request.infoRequest}</p> : null}
                  {request?.decisionReason ? <p className="mt-2 text-sm text-[var(--garage-fg)]">Alasan: {request.decisionReason}</p> : null}
                </div>
              ) : null}
              {canEdit ? <ApplicationForm initial={request} onSubmitted={() => void refresh()} /> : null}
              <p className="text-xs text-[var(--garage-mute)]">
                Verifikasi email & WhatsApp otomatis menyusul. Owner dapat menghubungi Anda untuk memastikan identitas.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
