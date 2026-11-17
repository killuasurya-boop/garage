"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatEventDate,
  formatEventTimeRange,
  fromZonedInputValue,
  toZonedInputValue,
} from "@/lib/event-format";
import type { AdminEvent } from "@/lib/event-service";

type Draft = {
  title: string;
  tagline: string;
  bannerUrl: string;
  startsAt: string;
  endsAt: string;
  rsvpDeadline: string;
  venueName: string;
  address: string;
  mapsUrl: string;
  contactWhatsapp: string;
  highlights: string[];
  about: string;
  faq: Array<{ q: string; a: string }>;
  agenda: Array<{ start: string; end: string; title: string }>;
  promoText: string;
  sponsorName: string;
  ageGate: boolean;
  featuredOnHome: boolean;
  platformSlug: string;
  capacity: string;
  defaultMaxPax: number;
};

function toDraft(event: AdminEvent): Draft {
  return {
    title: event.title,
    tagline: event.tagline ?? "",
    bannerUrl: event.bannerUrl ?? "",
    startsAt: toZonedInputValue(event.startsAt, event.timezone),
    endsAt: toZonedInputValue(event.endsAt, event.timezone),
    rsvpDeadline: event.rsvpDeadline ? toZonedInputValue(event.rsvpDeadline, event.timezone) : "",
    venueName: event.venueName,
    address: event.address,
    mapsUrl: event.mapsUrl,
    contactWhatsapp: event.contactWhatsapp,
    highlights: event.highlights,
    about: event.about ?? "",
    faq: event.faq,
    agenda: event.agenda,
    promoText: event.promoText ?? "",
    sponsorName: event.sponsorName ?? "",
    ageGate: event.ageGate,
    featuredOnHome: event.featuredOnHome,
    platformSlug: event.platformSlug ?? "",
    capacity: event.capacity ? String(event.capacity) : "",
    defaultMaxPax: event.defaultMaxPax,
  };
}

const STATUS_LABEL: Record<AdminEvent["status"], string> = {
  draft: "Draft — belum tampil di website",
  published: "Terbit — tampil di website",
  archived: "Diarsipkan",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-bold text-garage-fg">{label}</span>
      {children}
      {hint ? <span className="text-xs text-garage-dim">{hint}</span> : null}
    </label>
  );
}

// Tab "Event": satu sumber konten untuk homepage, landing, dan undangan.
export function EventSettingsPanel({
  event,
  onChanged,
}: {
  event: AdminEvent;
  onChanged: (event: AdminEvent) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(event));
  const [busy, setBusy] = useState<"save" | "status" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const tz = event.timezone;

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    const startsAt = fromZonedInputValue(draft.startsAt, tz);
    const endsAt = fromZonedInputValue(draft.endsAt, tz);
    const rsvpDeadline = draft.rsvpDeadline ? fromZonedInputValue(draft.rsvpDeadline, tz) : null;
    if (!startsAt || !endsAt) {
      setMessage({ tone: "error", text: "Isi tanggal & jam mulai/selesai dengan benar." });
      return;
    }
    setBusy("save");
    setMessage(null);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          tagline: draft.tagline || null,
          bannerUrl: draft.bannerUrl.trim() || null,
          startsAt,
          endsAt,
          rsvpDeadline,
          venueName: draft.venueName,
          address: draft.address,
          mapsUrl: draft.mapsUrl,
          contactWhatsapp: draft.contactWhatsapp,
          highlights: draft.highlights.map((item) => item.trim()).filter(Boolean),
          about: draft.about || null,
          faq: draft.faq.filter((item) => item.q.trim() && item.a.trim()),
          gallery: event.gallery,
          agenda: draft.agenda.filter((item) => item.title.trim()),
          promoText: draft.promoText.trim() || null,
          sponsorName: draft.sponsorName.trim() || null,
          ageGate: draft.ageGate,
          featuredOnHome: draft.featuredOnHome,
          platformSlug: draft.platformSlug.trim() || null,
          capacity: draft.capacity ? Number(draft.capacity) : null,
          defaultMaxPax: draft.defaultMaxPax,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Gagal menyimpan event.");
      onChanged(json.data.event);
      setDraft(toDraft(json.data.event));
      setMessage({ tone: "ok", text: "Event tersimpan. Homepage & landing memakai data ini." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Gagal menyimpan event." });
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: AdminEvent["status"]) {
    const confirmText =
      status === "published"
        ? "Terbitkan event? Konten publik dan menu khusus dapat diakses sesuai jadwal yang disimpan."
        : status === "draft"
          ? "Tarik event ke draft? Banner & landing akan disembunyikan dari publik."
          : "Arsipkan event? Konten tidak bisa diubah lagi.";
    if (!window.confirm(confirmText)) return;
    setBusy("status");
    setMessage(null);
    try {
      const res = await fetch(`/api/events/${event.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Gagal mengubah status.");
      onChanged(json.data.event);
      setMessage({ tone: "ok", text: `Status: ${STATUS_LABEL[json.data.event.status as AdminEvent["status"]]}.` });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Gagal mengubah status." });
    } finally {
      setBusy(null);
    }
  }

  const readOnly = event.status === "archived";
  const inputClass = "bg-garage-bg-2 text-base";

  return (
    <div className="grid gap-5" data-testid="event-settings">
      <div className="flex flex-col gap-3 rounded-lg border border-garage-line bg-garage-bg-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-garage-mute">Status publikasi</p>
          <p
            data-testid="event-status"
            className={`mt-1 text-base font-bold ${event.status === "published" ? "text-garage-success" : "text-garage-amber"}`}
          >
            {STATUS_LABEL[event.status]}
          </p>
          <p className="mt-1 text-sm text-garage-dim">
            {formatEventDate(event.startsAt, tz)} · {formatEventTimeRange(event.startsAt, event.endsAt, tz)} · versi konten {event.contentVersion}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {event.status === "published" ? (
            <>
              <Button asChild variant="outline">
                <a href={event.slug === "grand-opening" ? "/grand-opening" : `/events/${event.slug}/menu`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" /> Lihat halaman
                </a>
              </Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => setStatus("draft")}>
                Tarik ke draft
              </Button>
            </>
          ) : null}
          {event.status === "draft" ? (
            <Button data-testid="event-publish" disabled={busy !== null} onClick={() => setStatus("published")}>
              {busy === "status" ? <Loader2 className="size-4 animate-spin" /> : null} Terbitkan
            </Button>
          ) : null}
          {event.status !== "archived" ? <Button variant="outline" disabled={busy !== null} onClick={() => setStatus("archived")}>Arsipkan Event</Button> : null}
        </div>
      </div>

      <fieldset disabled={readOnly || busy !== null} className="grid gap-4 md:grid-cols-2">
        <Field label="Judul acara">
          <Input className={inputClass} value={draft.title} onChange={(e) => patch("title", e.target.value)} />
        </Field>
        <Field label="Tagline (opsional)" hint="Kosongkan bila belum ada copy final dari owner.">
          <Input className={inputClass} value={draft.tagline} onChange={(e) => patch("tagline", e.target.value)} />
        </Field>
        <div className="md:col-span-2"><Field label="URL banner menu event (opsional)" hint="Gunakan path /garage-uploads/… atau URL https. Kosongkan untuk menyembunyikan banner."><Input className={inputClass} value={draft.bannerUrl} onChange={(e) => patch("bannerUrl", e.target.value)} /></Field></div>
        <Field label="Mulai (WIB)">
          <Input type="datetime-local" className={inputClass} value={draft.startsAt} onChange={(e) => patch("startsAt", e.target.value)} />
        </Field>
        <Field label="Selesai (WIB)">
          <Input type="datetime-local" className={inputClass} value={draft.endsAt} onChange={(e) => patch("endsAt", e.target.value)} />
        </Field>
        <Field label="Batas ubah RSVP (WIB)" hint="Setelah waktu ini tamu tidak bisa mengubah jawaban lewat link undangan.">
          <Input type="datetime-local" className={inputClass} value={draft.rsvpDeadline} onChange={(e) => patch("rsvpDeadline", e.target.value)} />
        </Field>
        <Field label="Maks orang per undangan (default)">
          <Input
            type="number"
            min={1}
            max={10}
            className={inputClass}
            value={draft.defaultMaxPax}
            onChange={(e) => patch("defaultMaxPax", Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
          />
        </Field>
        <Field label="Nama tempat">
          <Input className={inputClass} value={draft.venueName} onChange={(e) => patch("venueName", e.target.value)} />
        </Field>
        <Field label="WhatsApp resmi" hint="Format 62… (dipakai tombol WhatsApp di landing).">
          <Input className={inputClass} inputMode="tel" value={draft.contactWhatsapp} onChange={(e) => patch("contactWhatsapp", e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Alamat lengkap">
            <Textarea className={inputClass} rows={2} value={draft.address} onChange={(e) => patch("address", e.target.value)} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Link Google Maps">
            <Input className={inputClass} value={draft.mapsUrl} onChange={(e) => patch("mapsUrl", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-2 md:col-span-2">
          <span className="text-sm font-bold text-garage-fg">Highlight hiburan (hanya yang sudah terkonfirmasi)</span>
          {draft.highlights.map((item, index) => (
            <div key={index} className="flex gap-2">
              <Input
                className={inputClass}
                value={item}
                aria-label={`Highlight ${index + 1}`}
                onChange={(e) => patch("highlights", draft.highlights.map((h, i) => (i === index ? e.target.value : h)))}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Hapus highlight ${index + 1}`}
                onClick={() => patch("highlights", draft.highlights.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {draft.highlights.length < 8 ? (
            <Button type="button" variant="outline" className="w-fit" onClick={() => patch("highlights", [...draft.highlights, ""])}>
              <Plus className="size-4" /> Tambah highlight
            </Button>
          ) : null}
        </div>

        <div className="md:col-span-2">
          <Field label="Tentang Garage (opsional)" hint="Kosong = memakai teks About dari modul Website.">
            <Textarea className={inputClass} rows={4} value={draft.about} onChange={(e) => patch("about", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-2 md:col-span-2">
          <span className="text-sm font-bold text-garage-fg">FAQ (tampil hanya bila diisi; jawaban harus terverifikasi)</span>
          {draft.faq.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-md border border-garage-line p-3">
              <Input
                className={inputClass}
                placeholder="Pertanyaan"
                value={item.q}
                aria-label={`Pertanyaan FAQ ${index + 1}`}
                onChange={(e) => patch("faq", draft.faq.map((f, i) => (i === index ? { ...f, q: e.target.value } : f)))}
              />
              <Textarea
                className={inputClass}
                rows={2}
                placeholder="Jawaban"
                value={item.a}
                aria-label={`Jawaban FAQ ${index + 1}`}
                onChange={(e) => patch("faq", draft.faq.map((f, i) => (i === index ? { ...f, a: e.target.value } : f)))}
              />
              <Button type="button" variant="outline" className="w-fit" onClick={() => patch("faq", draft.faq.filter((_, i) => i !== index))}>
                <Trash2 className="size-4" /> Hapus
              </Button>
            </div>
          ))}
          {draft.faq.length < 12 ? (
            <Button type="button" variant="outline" className="w-fit" onClick={() => patch("faq", [...draft.faq, { q: "", a: "" }])}>
              <Plus className="size-4" /> Tambah FAQ
            </Button>
          ) : null}
        </div>

        <div className="grid gap-2 md:col-span-2" data-testid="event-agenda-editor">
          <span className="text-sm font-bold text-garage-fg">Rundown acara (jam WIB, tampil di landing Grand Opening)</span>
          {draft.agenda.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-md border border-garage-line p-3 sm:grid-cols-[120px_120px_minmax(0,1fr)_auto] sm:items-center">
              <Input
                type="time"
                className={inputClass}
                value={item.start}
                aria-label={`Jam mulai sesi ${index + 1}`}
                onChange={(e) => patch("agenda", draft.agenda.map((a, i) => (i === index ? { ...a, start: e.target.value } : a)))}
              />
              <Input
                type="time"
                className={inputClass}
                value={item.end}
                aria-label={`Jam selesai sesi ${index + 1}`}
                onChange={(e) => patch("agenda", draft.agenda.map((a, i) => (i === index ? { ...a, end: e.target.value } : a)))}
              />
              <Input
                className={inputClass}
                placeholder="Nama sesi, mis. Live Music"
                value={item.title}
                aria-label={`Nama sesi ${index + 1}`}
                onChange={(e) => patch("agenda", draft.agenda.map((a, i) => (i === index ? { ...a, title: e.target.value } : a)))}
              />
              <Button type="button" variant="outline" className="w-fit" onClick={() => patch("agenda", draft.agenda.filter((_, i) => i !== index))}>
                <Trash2 className="size-4" /> Hapus
              </Button>
            </div>
          ))}
          {draft.agenda.length < 12 ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => patch("agenda", [...draft.agenda, { start: "15:00", end: "18:00", title: "" }])}
            >
              <Plus className="size-4" /> Tambah sesi
            </Button>
          ) : null}
        </div>

        <Field label="Teks promo (opsional)" hint="Mis. Diskon 20% Menu Bundling. Kosong = section promo disembunyikan.">
          <Input className={inputClass} value={draft.promoText} onChange={(e) => patch("promoText", e.target.value)} />
        </Field>
        <Field label="Sponsor (opsional)" hint="Tampil sebagai teks 'Supported by …' tanpa logo produk.">
          <Input className={inputClass} value={draft.sponsorName} onChange={(e) => patch("sponsorName", e.target.value)} />
        </Field>
        <Field label="Slug di platform GIGS (opsional)" hint="Mis. gigs-akhir-tahun (bagian URL /event/…). Menghubungkan lineup & sponsor event ini ke beranda GIGS.">
          <Input className={inputClass} value={draft.platformSlug} onChange={(e) => patch("platformSlug", e.target.value.toLowerCase())} />
        </Field>
        <Field label="Kapasitas lokasi (opsional)" hint="Jumlah orang maksimal di lokasi. Check-in hari-H ditolak bila penuh. Kosong = tanpa batas.">
          <Input className={inputClass} inputMode="numeric" value={draft.capacity} onChange={(e) => patch("capacity", e.target.value.replace(/\D/g, ""))} />
        </Field>

        <label className="flex items-center gap-3 md:col-span-2">
          <input
            type="checkbox"
            className="size-5 accent-[#d11a2a]"
            checked={draft.ageGate}
            onChange={(e) => patch("ageGate", e.target.checked)}
          />
          <span className="text-base text-garage-fg">Gerbang usia 21+ di landing (wajib bila sponsor produk tembakau)</span>
        </label>

        <label className="flex items-center gap-3 md:col-span-2">
          <input
            type="checkbox"
            className="size-5 accent-[#d11a2a]"
            checked={draft.featuredOnHome}
            onChange={(e) => patch("featuredOnHome", e.target.checked)}
          />
          <span className="text-base text-garage-fg">Tampilkan banner di homepage (saat event terbit)</span>
        </label>
      </fieldset>

      {message ? (
        <p role="status" className={`text-sm font-semibold ${message.tone === "ok" ? "text-garage-success" : "text-garage-red-bright"}`}>
          {message.text}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="sticky bottom-0 flex justify-start border-t border-garage-line bg-garage-bg-1/95 py-3">
          <Button data-testid="event-save" disabled={busy !== null} onClick={save}>
            {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Simpan perubahan
          </Button>
        </div>
      ) : null}
    </div>
  );
}
