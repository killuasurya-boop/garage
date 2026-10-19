"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Copy,
  Download,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  UserPlus,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatEventDate, formatEventTimeRange } from "@/lib/event-format";
import type { GuestRow } from "@/lib/event-invitations";
import type { AdminEvent } from "@/lib/event-service";
import { buildInvitationWhatsappMessage, waLink } from "@/lib/whatsapp-link";

type Summary = {
  guests: number;
  invitations: number;
  shared: number;
  notShared: number;
  attending: number;
  attendingPax: number;
  declined: number;
  pending: number;
};

type ShareState = { guest: GuestRow; url: string; message: string; waUrl: string | null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Permintaan gagal.");
  return json.data as T;
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

function StatCard({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "ok" ? "text-garage-success" : tone === "warn" ? "text-garage-amber" : tone === "bad" ? "text-garage-red-bright" : "text-garage-fg";
  return (
    <div className="rounded-lg border border-garage-line bg-garage-bg-2 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-garage-dim">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${color}`}>{value}</p>
      {sub ? <p className="text-xs text-garage-dim">{sub}</p> : null}
    </div>
  );
}

function InvitationBadge({ guest }: { guest: GuestRow }) {
  if (!guest.invitation) return <span className="text-sm text-garage-dim">Belum dibuat</span>;
  if (guest.invitation.status === "shared") {
    return (
      <span className="text-sm font-semibold text-garage-fg">
        Dibagikan (manual)
        {guest.invitation.sharedAt ? <span className="block text-xs font-normal text-garage-dim">{fmtTime(guest.invitation.sharedAt)}</span> : null}
      </span>
    );
  }
  return <span className="text-sm font-semibold text-garage-amber">Siap dibagikan</span>;
}

function RsvpBadge({ guest }: { guest: GuestRow }) {
  if (!guest.invitation) return <span className="text-sm text-garage-dim">—</span>;
  if (!guest.rsvp) return <span className="text-sm font-semibold text-garage-amber">Belum menjawab</span>;
  return guest.rsvp.response === "attending" ? (
    <span className="text-sm font-bold text-garage-success">
      Hadir · {guest.rsvp.pax} org
      <span className="block text-xs font-normal text-garage-dim">{fmtTime(guest.rsvp.respondedAt)}</span>
    </span>
  ) : (
    <span className="text-sm font-bold text-garage-red-bright">
      Tidak hadir
      <span className="block text-xs font-normal text-garage-dim">{fmtTime(guest.rsvp.respondedAt)}</span>
    </span>
  );
}

// Tab "Tamu & Undangan" + rekap: tambah tamu, buat undangan, bagikan manual via WA, cabut.
export function EventGuestsPanel({ event, canExport }: { event: AdminEvent; canExport: boolean }) {
  const [guests, setGuests] = useState<GuestRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active");
  const [rsvpFilter, setRsvpFilter] = useState<"all" | "attending" | "declined" | "pending" | "no-invite" | "not-shared">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", maxPax: event.defaultMaxPax, notes: "" });
  const [share, setShare] = useState<ShareState | null>(null);
  const base = `/api/events/${event.id}`;

  const [version, setVersion] = useState(0);
  const reload = () => setVersion((current) => current + 1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [list, sum] = await Promise.all([
          api<{ guests: GuestRow[] }>(`${base}/guests?status=${statusFilter}`),
          api<{ summary: Summary }>(`${base}/summary`),
        ]);
        if (cancelled) return;
        setGuests(list.guests);
        setSummary(sum.summary);
      } catch (err) {
        if (!cancelled) setMessage({ tone: "error", text: err instanceof Error ? err.message : "Data tamu gagal dimuat." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, statusFilter, version]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "").replace(/^0/, "");
    return (guests ?? []).filter((guest) => {
      if (q && !guest.fullName.toLowerCase().includes(q) && !(digits.length >= 3 && (guest.phone ?? "").includes(digits))) return false;
      switch (rsvpFilter) {
        case "attending":
          return guest.rsvp?.response === "attending";
        case "declined":
          return guest.rsvp?.response === "declined";
        case "pending":
          return Boolean(guest.invitation) && !guest.rsvp;
        case "no-invite":
          return !guest.invitation;
        case "not-shared":
          return guest.invitation?.status === "ready";
        default:
          return true;
      }
    });
  }, [guests, query, rsvpFilter]);

  async function run(key: string, action: () => Promise<string | void>) {
    setBusy(key);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ tone: "ok", text });
      reload();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Aksi gagal." });
    } finally {
      setBusy(null);
    }
  }

  function addGuest(e: React.FormEvent) {
    e.preventDefault();
    void run("add", async () => {
      await api(`${base}/guests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone.trim() || null,
          maxPax: form.maxPax,
          notes: form.notes.trim() || null,
        }),
      });
      setForm({ fullName: "", phone: "", maxPax: event.defaultMaxPax, notes: "" });
      return "Tamu ditambahkan.";
    });
  }

  function createInvites(guestIds: string[] | null) {
    void run("invite", async () => {
      const result = await api<{ created: number }>(`${base}/invitations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guestIds }),
      });
      return result.created ? `${result.created} undangan dibuat.` : "Semua tamu aktif sudah punya undangan.";
    });
  }

  async function openShare(guest: GuestRow) {
    if (!guest.invitation) return;
    // Buka jendela dulu (sinkron dengan klik) supaya tidak diblokir popup blocker.
    const win = guest.phone ? window.open("about:blank", "_blank") : null;
    setBusy(`share-${guest.id}`);
    setMessage(null);
    try {
      const info = await api<{ url: string; guestName: string; guestPhone: string | null }>(
        `${base}/invitations/${guest.invitation.id}/link`,
      );
      const text = buildInvitationWhatsappMessage({
        guestName: info.guestName,
        eventTitle: event.title,
        dateLabel: formatEventDate(event.startsAt, event.timezone),
        timeLabel: formatEventTimeRange(event.startsAt, event.endsAt, event.timezone),
        venue: `${event.venueName}, ${event.address}`,
        url: info.url,
      });
      const waUrl = waLink(info.guestPhone, text);
      if (win && waUrl) {
        win.opener = null;
        win.location.href = waUrl;
      } else {
        win?.close();
      }
      setShare({ guest, url: info.url, message: text, waUrl });
    } catch (err) {
      win?.close();
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Link undangan gagal diambil." });
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ tone: "ok", text: `${label} disalin.` });
    } catch {
      setMessage({ tone: "error", text: "Gagal menyalin. Salin manual dari kotak pesan." });
    }
  }

  function markShared() {
    if (!share?.guest.invitation) return;
    const invitationId = share.guest.invitation.id;
    setShare(null);
    void run("mark", async () => {
      await api(`${base}/invitations/${invitationId}/share`, { method: "POST" });
      return `Undangan ${share.guest.fullName} ditandai dibagikan.`;
    });
  }

  function invitationAction(guest: GuestRow, action: "revoke" | "reissue") {
    if (!guest.invitation) return;
    const text =
      action === "revoke"
        ? `Cabut undangan ${guest.fullName}? Link lama langsung tidak bisa dipakai.`
        : `Buat link baru untuk ${guest.fullName}? Link lama dicabut; jawaban RSVP tetap tersimpan.`;
    if (!window.confirm(text)) return;
    const invitationId = guest.invitation.id;
    void run(`${action}-${guest.id}`, async () => {
      await api(`${base}/invitations/${invitationId}/${action}`, { method: "POST" });
      return action === "revoke" ? "Undangan dicabut." : "Link baru dibuat. Bagikan ulang ke tamu.";
    });
  }

  function setGuestStatus(guest: GuestRow, status: "active" | "archived") {
    if (status === "archived" && !window.confirm(`Arsipkan ${guest.fullName}? Undangannya ikut dicabut.`)) return;
    void run(`status-${guest.id}`, async () => {
      await api(`${base}/guests/${guest.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      return status === "archived" ? "Tamu diarsipkan." : "Tamu diaktifkan lagi.";
    });
  }

  const noInvite = (guests ?? []).filter((guest) => guest.status === "active" && !guest.invitation).length;

  return (
    <div className="grid gap-5" data-testid="event-guests">
      {event.status === "draft" ? (
        <p role="note" data-testid="event-draft-note" className="rounded-md border border-garage-amber/50 bg-garage-amber/10 px-4 py-3 text-sm text-garage-fg">
          Event masih <b>Draft</b>: link undangan pribadi sudah bisa dibuka tamu, tetapi halaman publik /grand-opening dan banner homepage baru tampil
          setelah event diterbitkan.
        </p>
      ) : event.status === "archived" ? (
        <p role="note" className="rounded-md border border-garage-red/50 bg-garage-red/10 px-4 py-3 text-sm text-garage-fg">
          Event diarsipkan: semua link undangan sudah tidak berlaku.
        </p>
      ) : null}
      {summary ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid="event-summary">
          <StatCard label="Tamu aktif" value={summary.guests} />
          <StatCard label="Undangan" value={summary.invitations} />
          <StatCard label="Dibagikan" value={summary.shared} sub={`${summary.notShared} belum`} />
          <StatCard label="Hadir" value={summary.attending} tone="ok" sub="undangan" />
          <StatCard label="Total orang hadir" value={summary.attendingPax} tone="ok" />
          <StatCard label="Tidak hadir" value={summary.declined} tone="bad" />
          <StatCard label="Belum menjawab" value={summary.pending} tone="warn" />
        </div>
      ) : null}

      <form onSubmit={addGuest} className="grid gap-3 rounded-lg border border-garage-line bg-garage-bg-2 p-4 md:grid-cols-[2fr_1.5fr_0.8fr_2fr_auto] md:items-end">
        <label className="grid gap-1">
          <span className="text-sm font-bold">Nama tamu</span>
          <Input required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-bold">WhatsApp</span>
          <Input inputMode="tel" placeholder="0812…" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-bold">Maks orang</span>
          <Input
            type="number"
            min={1}
            max={10}
            value={form.maxPax}
            onChange={(e) => setForm({ ...form, maxPax: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-bold">Catatan</span>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <Button type="submit" disabled={busy !== null} data-testid="guest-add">
          {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Tambah
        </Button>
      </form>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-garage-dim" />
            <Input aria-label="Cari tamu" placeholder="Cari nama / nomor" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select
            aria-label="Filter RSVP"
            value={rsvpFilter}
            onChange={(e) => setRsvpFilter(e.target.value as typeof rsvpFilter)}
            className="h-10 rounded-md border border-garage-line bg-garage-bg-2 px-3 text-sm text-garage-fg"
          >
            <option value="all">Semua</option>
            <option value="attending">Hadir</option>
            <option value="declined">Tidak hadir</option>
            <option value="pending">Belum menjawab</option>
            <option value="not-shared">Belum dibagikan</option>
            <option value="no-invite">Belum ada undangan</option>
          </select>
          <select
            aria-label="Status tamu"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-10 rounded-md border border-garage-line bg-garage-bg-2 px-3 text-sm text-garage-fg"
          >
            <option value="active">Tamu aktif</option>
            <option value="archived">Arsip</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={reload} disabled={busy !== null}>
            <RefreshCw className="size-4" /> Muat ulang
          </Button>
          <Button onClick={() => createInvites(null)} disabled={busy !== null || noInvite === 0} data-testid="invite-all">
            {busy === "invite" ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} Buat undangan ({noInvite})
          </Button>
          {canExport ? (
            <Button asChild variant="outline">
              <a href={`${base}/export`} data-testid="guest-export">
                <Download className="size-4" /> Ekspor CSV
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p role="status" className={`text-sm font-semibold ${message.tone === "ok" ? "text-garage-success" : "text-garage-red-bright"}`}>
          {message.text}
        </p>
      ) : null}

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-garage-line">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-garage-bg-3 text-xs uppercase tracking-wide text-garage-dim">
            <tr>
              <th className="px-3 py-2">Tamu</th>
              <th className="px-3 py-2">Undangan</th>
              <th className="px-3 py-2">RSVP</th>
              <th className="px-3 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {guests === null ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-garage-dim">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-garage-dim">
                  {guests.length === 0 ? "Belum ada tamu. Tambah manual atau impor CSV." : "Tidak ada tamu yang cocok dengan filter."}
                </td>
              </tr>
            ) : (
              visible.map((guest) => (
                <tr key={guest.id} data-testid="guest-row" className="border-t border-garage-line align-top">
                  <td className="px-3 py-2">
                    <span className="block text-base font-bold text-garage-fg">{guest.fullName}</span>
                    <span className="block text-garage-dim">{guest.phone ? `+${guest.phone}` : "Tanpa WhatsApp"} · maks {guest.maxPax} org</span>
                    {guest.notes ? <span className="block text-xs text-garage-dim">{guest.notes}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <InvitationBadge guest={guest} />
                  </td>
                  <td className="px-3 py-2">
                    <RsvpBadge guest={guest} />
                    {guest.rsvp?.note ? <span className="block text-xs text-garage-dim">“{guest.rsvp.note}”</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {guest.status === "archived" ? (
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setGuestStatus(guest, "active")}>
                          <RotateCcw className="size-4" /> Aktifkan
                        </Button>
                      ) : guest.invitation ? (
                        <>
                          <Button size="sm" disabled={busy !== null} onClick={() => void openShare(guest)} data-testid="guest-share">
                            {busy === `share-${guest.id}` ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Bagikan manual
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => invitationAction(guest, "reissue")} title="Buat link baru">
                            <RefreshCw className="size-4" /> Link baru
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => invitationAction(guest, "revoke")}>
                            <XCircle className="size-4" /> Cabut
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" disabled={busy !== null} onClick={() => createInvites([guest.id])}>
                          <Link2 className="size-4" /> Buat undangan
                        </Button>
                      )}
                      {guest.status === "active" ? (
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setGuestStatus(guest, "archived")} aria-label={`Arsipkan ${guest.fullName}`}>
                          <Archive className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={share !== null} onOpenChange={(open) => !open && setShare(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bagikan undangan — {share?.guest.fullName}</DialogTitle>
            <DialogDescription>
              {share?.waUrl
                ? "WhatsApp sudah dibuka di tab baru dengan pesan siap kirim. Kirim pesannya, lalu tandai dibagikan."
                : "Tamu belum punya nomor WhatsApp valid. Salin pesan/link dan kirim lewat kanal lain."}
            </DialogDescription>
          </DialogHeader>
          {share ? (
            <div className="grid gap-3">
              <pre data-testid="share-message" className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-garage-line bg-garage-bg-2 p-3 text-sm text-garage-fg">
                {share.message}
              </pre>
              <div className="flex flex-wrap gap-2">
                {share.waUrl ? (
                  <Button asChild variant="outline">
                    <a href={share.waUrl} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="size-4" /> Buka WhatsApp lagi
                    </a>
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => void copy(share.message, "Pesan")}>
                  <Copy className="size-4" /> Salin pesan
                </Button>
                <Button variant="outline" onClick={() => void copy(share.url, "Link undangan")}>
                  <Link2 className="size-4" /> Salin link
                </Button>
              </div>
              <p className="text-xs text-garage-dim">Status “Dibagikan” hanya catatan petugas — bukan bukti pesan terkirim/terbaca.</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShare(null)}>
              Belum dikirim
            </Button>
            <Button onClick={markShared} data-testid="share-confirm">
              Sudah dikirim — tandai dibagikan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
