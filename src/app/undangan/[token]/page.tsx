import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Clock, MapPin } from "lucide-react";

import { RsvpForm } from "@/components/garage/events/rsvp-form";
import { agendaClock, eventZoneLabel, formatEventDate, formatEventTimeRange } from "@/lib/event-format";
import { getPublicInvitation } from "@/lib/event-invitations";
import { waLink } from "@/lib/whatsapp-link";

export const dynamic = "force-dynamic";

// Undangan pribadi: tidak diindeks, token tidak dikirim ke situs lain lewat Referer.
export const metadata: Metadata = {
  title: "Undangan Pribadi — Garage Coffee",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1014_0%,#0a0a0c_55%)] text-garage-fg">
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
        <span className="inline-flex w-fit">
          <Image src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" width={170} height={40} className="h-9 w-auto object-contain" priority />
        </span>
        {children}
      </div>
    </main>
  );
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getPublicInvitation(token).catch(() => null);

  if (!invitation) {
    return (
      <Shell>
        <section data-testid="invitation-invalid" className="rounded-xl border border-garage-line bg-garage-bg-1 p-6">
          <h1 className="text-2xl font-black uppercase">Tautan tidak valid</h1>
          <p className="mt-3 text-base text-garage-dim">
            Tautan undangan ini tidak valid atau sudah tidak berlaku. Bila Anda menerima undangan dari Garage Coffee, hubungi pengirimnya untuk tautan terbaru.
          </p>
          <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-md border border-garage-line-2 px-4 text-sm font-bold uppercase hover:border-garage-amber">
            Ke garagecoffee.id
          </Link>
        </section>
      </Shell>
    );
  }

  const { event } = invitation;
  const date = formatEventDate(event.startsAt, event.timezone);
  const time = formatEventTimeRange(event.startsAt, event.endsAt, event.timezone);
  const contactUrl = waLink(event.contactWhatsapp, `Halo Garage Coffee, saya ${invitation.guestName} ingin mengubah konfirmasi ${event.title}.`);

  return (
    <Shell>
      <section className="rounded-2xl border border-garage-red/50 bg-garage-bg-1/95 p-6 shadow-[0_24px_60px_-30px_rgba(209,26,42,0.8)]">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-garage-amber">Undangan pribadi</p>
        <h1 data-testid="invitation-guest" className="mt-3 text-3xl font-black leading-tight">
          Halo, {invitation.guestName}
        </h1>
        <p className="mt-3 text-base text-garage-dim">Dengan senang hati kami mengundang Anda ke</p>
        <p className="mt-1 text-2xl font-black uppercase text-garage-fg">{event.title}</p>
        <dl className="mt-5 grid gap-3 text-base">
          <div className="flex gap-3">
            <CalendarDays aria-hidden className="mt-0.5 size-5 shrink-0 text-garage-red-bright" />
            <div>
              <dt className="sr-only">Tanggal</dt>
              <dd className="font-semibold">{date}</dd>
            </div>
          </div>
          <div className="flex gap-3">
            <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-garage-red-bright" />
            <div>
              <dt className="sr-only">Waktu</dt>
              <dd className="font-semibold">{time}</dd>
            </div>
          </div>
          <div className="flex gap-3">
            <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-garage-red-bright" />
            <div>
              <dt className="sr-only">Lokasi</dt>
              <dd>
                <span className="font-semibold">{event.venueName}</span>
                <span className="mt-1 block text-sm text-garage-dim">{event.address}</span>
                <a href={event.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-bold text-garage-amber underline">
                  Buka Google Maps
                </a>
              </dd>
            </div>
          </div>
        </dl>
        {event.agenda.length ? (
          <div className="mt-5 border-t border-garage-line pt-4">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-garage-amber">Rundown</p>
            <ol data-testid="invitation-agenda" className="mt-3 grid gap-2">
              {event.agenda.map((item) => (
                <li key={`${item.start}-${item.title}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="min-w-[132px] font-bold tabular-nums text-garage-fg">
                    {agendaClock(item.start)}–{agendaClock(item.end)} {eventZoneLabel(event.timezone)}
                  </span>
                  <span className="font-semibold text-garage-fg">{item.title}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : event.highlights.length ? (
          <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-garage-dim">{event.highlights.join(" · ")}</p>
        ) : null}
      </section>

      <section aria-labelledby="rsvp-title" className="rounded-2xl border border-garage-line bg-garage-bg-1 p-6">
        <h2 id="rsvp-title" className="text-xl font-black uppercase">Konfirmasi kehadiran</h2>
        <div className="mt-4">
          <RsvpForm token={token} maxPax={invitation.maxPax} initial={invitation.rsvp} canChange={invitation.canChange} contactUrl={contactUrl} />
        </div>
      </section>

      <p className="text-center text-sm text-garage-mute">Undangan ini khusus untuk Anda. Mohon tidak membagikan tautannya.</p>
    </Shell>
  );
}
