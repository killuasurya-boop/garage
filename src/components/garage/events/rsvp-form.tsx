"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type Rsvp = { response: "attending" | "declined"; pax: number; note: string | null; respondedAt: string };

const formatSaved = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));

// Form RSVP undangan pribadi: Hadir / Tidak hadir + jumlah orang (maks per undangan).
export function RsvpForm({
  token,
  maxPax,
  initial,
  canChange,
  contactUrl,
}: {
  token: string;
  maxPax: number;
  initial: Rsvp | null;
  canChange: boolean;
  contactUrl: string | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<Rsvp | null>(initial);
  const [editing, setEditing] = useState(!initial && canChange);
  const [response, setResponse] = useState<Rsvp["response"] | null>(initial?.response ?? null);
  const [pax, setPax] = useState(initial?.response === "attending" ? initial.pax : 1);
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!response) {
      setError("Pilih Hadir atau Tidak hadir dulu.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/rsvp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response, pax: response === "attending" ? pax : 0, note: note.trim() || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "RSVP gagal disimpan. Coba lagi.");
      setSaved(json.data.rsvp);
      // Data server (QR tiket masuk di halaman undangan) ikut diperbarui tanpa muat ulang manual.
      router.refresh();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "RSVP gagal disimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (saved && !editing) {
    return (
      <div data-testid="rsvp-saved" className="rounded-xl border border-garage-success/50 bg-garage-success/10 p-5">
        <p className="flex items-center gap-2 text-lg font-black text-garage-fg">
          <CheckCircle2 aria-hidden className="size-6 text-garage-success" />
          {saved.response === "attending" ? `Terima kasih! Anda tercatat hadir (${saved.pax} orang).` : "Terima kasih, jawaban Tidak hadir sudah tercatat."}
        </p>
        <p className="mt-2 text-sm text-garage-dim">Tersimpan {formatSaved(saved.respondedAt)} WIB.</p>
        {canChange ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-4 min-h-11 rounded-md border border-garage-line-2 px-4 text-sm font-bold uppercase text-garage-fg hover:border-garage-amber"
          >
            Ubah jawaban
          </button>
        ) : (
          <p className="mt-3 text-sm text-garage-dim">Batas perubahan sudah lewat. Hubungi WhatsApp Garage bila ada perubahan.</p>
        )}
      </div>
    );
  }

  if (!canChange) {
    return (
      <div className="rounded-xl border border-garage-amber/50 bg-garage-amber/10 p-5 text-base text-garage-fg">
        Batas konfirmasi kehadiran sudah lewat.
        {contactUrl ? (
          <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="ml-1 font-bold text-garage-amber underline">
            Hubungi WhatsApp Garage
          </a>
        ) : null}
      </div>
    );
  }

  const choice = (value: Rsvp["response"], label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={response === value}
      data-testid={`rsvp-${value}`}
      onClick={() => setResponse(value)}
      className={`min-h-14 rounded-lg border-2 px-4 text-lg font-black uppercase transition ${
        response === value
          ? value === "attending"
            ? "border-garage-success bg-garage-success/15 text-garage-fg"
            : "border-garage-red-bright bg-garage-red/15 text-garage-fg"
          : "border-garage-line-2 bg-garage-bg-2 text-garage-dim hover:border-garage-amber"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="grid gap-4" data-testid="rsvp-form">
      <div role="radiogroup" aria-label="Konfirmasi kehadiran" className="grid grid-cols-2 gap-3">
        {choice("attending", "Hadir")}
        {choice("declined", "Tidak hadir")}
      </div>
      {response === "attending" ? (
        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-garage-fg">Jumlah orang yang datang (maks {maxPax})</span>
          <select
            data-testid="rsvp-pax"
            value={pax}
            onChange={(e) => setPax(Number(e.target.value))}
            className="h-12 rounded-md border border-garage-line-2 bg-garage-bg-2 px-3 text-base text-garage-fg"
          >
            {Array.from({ length: maxPax }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} orang
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="grid gap-1.5">
        <span className="text-sm font-bold text-garage-fg">Catatan (opsional)</span>
        <textarea
          value={note}
          maxLength={300}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-md border border-garage-line-2 bg-garage-bg-2 px-3 py-2 text-base text-garage-fg"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-garage-red-bright">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        data-testid="rsvp-submit"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-garage-red px-5 text-base font-black uppercase text-white hover:bg-garage-red-bright disabled:opacity-60"
      >
        {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null} Kirim konfirmasi
      </button>
    </form>
  );
}
