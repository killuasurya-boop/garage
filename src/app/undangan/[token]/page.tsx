import type { Metadata } from "next";
import { Permanent_Marker } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, MessageCircle, Shirt, ShieldCheck, Users } from "lucide-react";
import type { CSSProperties } from "react";

import { AgeGate, AgendaLive, InviteIntro, PosterCountdown } from "@/components/garage/events/event-live-parts";
import { CoBrandLockup, PosterFilters, ShareActions, sponsorLogoFor } from "@/components/garage/events/event-poster-parts";
import { EntryQr } from "@/components/garage/events/entry-qr";
import { RsvpForm } from "@/components/garage/events/rsvp-form";
import { eventZoneLabel, formatEventDate, formatEventTimeRange } from "@/lib/event-format";
import { getPublicInvitation, invitationUrl } from "@/lib/event-invitations";
import { waLink } from "@/lib/whatsapp-link";

import "../../grand-opening/grand-opening.css";

export const dynamic = "force-dynamic";

const marker = Permanent_Marker({ weight: "400", subsets: ["latin"], variable: "--font-marker" });

// Gambar preview WhatsApp khusus undangan (1200×630, tanpa nama tamu demi privasi).
const OG_IMAGE = "/grand-opening/og-undangan.jpg";
// Lebar kolom undangan (inline: .gp-wrap di CSS tak berlapis mengalahkan utilitas Tailwind).
const NARROW: CSSProperties = { maxWidth: 760 };
// Judul Anton multi-baris: .gp-display (line-height .86) terlalu rapat saat teks turun baris di HP.
const TIGHT: CSSProperties = { lineHeight: 1 };

// Undangan pribadi: tidak diindeks, token tidak dikirim ke situs lain lewat Referer.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const invitation = await getPublicInvitation(token).catch(() => null);
  const base: Metadata = {
    title: "Undangan Pribadi — Garage Coffee",
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
  if (!invitation) return base;
  const { event } = invitation;
  const title = sponsorLogoFor(event) ? `Undangan ${event.title} × BLACK` : `Undangan ${event.title}`;
  const description = `Anda diundang ke ${event.title} — ${formatEventDate(event.startsAt, event.timezone)}, ${formatEventTimeRange(
    event.startsAt,
    event.endsAt,
    event.timezone,
  )} di ${event.venueName}, Tebing Tinggi. Konfirmasi kehadiran lewat tautan ini.`;
  return {
    ...base,
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "id_ID",
      siteName: "Garage Coffee",
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE] },
  };
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getPublicInvitation(token).catch(() => null);

  if (!invitation) {
    return (
      <main className={`gp ${marker.variable} flex items-center justify-center px-5 py-16`}>
        <section data-testid="invitation-invalid" className="gp-invite-card w-full max-w-xl p-8">
          <Image src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" width={170} height={40} className="h-9 w-auto object-contain" priority />
          <h1 className="gp-display mt-6 text-[44px] leading-none">Tautan tidak valid</h1>
          <p className="mt-4 text-base leading-relaxed text-[#d8d1c3]">
            Tautan undangan ini tidak valid atau sudah tidak berlaku. Bila Anda menerima undangan dari Garage Coffee, hubungi pengirimnya untuk tautan terbaru.
          </p>
          <Link href="/" className="gp-btn gp-btn-line mt-6">
            Ke garagecoffee.id
          </Link>
        </section>
      </main>
    );
  }

  const { event } = invitation;
  const date = formatEventDate(event.startsAt, event.timezone);
  const time = formatEventTimeRange(event.startsAt, event.endsAt, event.timezone);
  const zone = eventZoneLabel(event.timezone);
  const contactUrl = waLink(event.contactWhatsapp, `Halo Garage Coffee, saya ${invitation.guestName} ingin mengubah konfirmasi ${event.title}.`);
  const pageUrl = invitationUrl(token);
  const dressCode = event.faq.find((item) => /dress/i.test(item.q))?.a ?? "Smart casual.";
  const notes = [
    { key: "dress", icon: Shirt, title: "Dress code", body: dressCode },
    {
      key: "pax",
      icon: Users,
      title: `Untuk ${invitation.maxPax} orang`,
      body: "Acara terbuka untuk umum — konfirmasi di atas supaya tempat Anda kami siapkan.",
    },
    ...(event.ageGate ? [{ key: "usia", icon: ShieldCheck, title: "Khusus 21+", body: "Bawa kartu identitas." }] : []),
  ];

  return (
    <main className={`gp ${marker.variable}`}>
      <PosterFilters />
      <InviteIntro guestName={invitation.guestName}>
        <CoBrandLockup event={event} size="lg" />
      </InviteIntro>
      {event.ageGate ? <AgeGate /> : null}

      <section className="relative isolate overflow-hidden pt-10 pb-16 sm:pt-14">
        <Image src="/grand-opening/garage-venue.webp" alt="" fill priority sizes="100vw" className="-z-40 object-cover object-[center_30%] opacity-30" />
        <div className="absolute inset-0 -z-30 bg-[radial-gradient(60%_50%_at_50%_30%,rgba(224,38,47,0.18),rgba(10,10,11,0.85)_70%),linear-gradient(180deg,rgba(10,10,11,0.6),#0a0a0b_92%)]" />
        <div className="gp-sweep -z-20" />
        <span className="gp-laser l1 -z-10" style={{ left: "-5%", top: "18%", width: "60%" }} />
        <span className="gp-laser l2 -z-10" style={{ left: "45%", top: "10%", width: "60%" }} />

        <div className="gp-wrap flex flex-col items-center gap-8 text-center" style={NARROW}>
          <CoBrandLockup event={event} />
          <div className="flex flex-col items-center gap-3">
            <p className="u1 gp-label text-[#7cff3a]">Undangan pribadi untuk</p>
            <h1 data-testid="invitation-guest" className="gp-display gp-guest-name text-[56px] text-[#efe6d6] sm:text-[88px]" style={TIGHT} aria-label={`Halo, ${invitation.guestName}`}>
              {invitation.guestName.split(/\s+/).map((word, wordIndex, words) => {
                const offset = words.slice(0, wordIndex).join("").length + wordIndex;
                return (
                  <span key={wordIndex} aria-hidden>
                    <span className="inline-block whitespace-nowrap">
                      {Array.from(word).map((ch, index) => (
                        <span key={index} className="gp-ch" style={{ "--i": offset + index } as CSSProperties}>
                          {ch}
                        </span>
                      ))}
                    </span>
                    {wordIndex < words.length - 1 ? " " : null}
                  </span>
                );
              })}
            </h1>
            <p className="u2 max-w-[520px] text-[17px] leading-relaxed text-[#d8d1c3]">Dengan senang hati kami mengundang Anda merayakan</p>
            <p className="u2 gp-display gp-h2 text-[56px] sm:text-[72px]">
              <span className="gp-cream">Grand</span> <span className="gp-red">Opening</span>
            </p>
          </div>

          <dl className="u3 grid w-full gap-3 border-y border-[rgba(239,230,214,0.18)] bg-[rgba(10,10,11,0.75)] px-5 py-5 text-left sm:grid-cols-3 sm:gap-6">
            <div className="flex items-start gap-3">
              <CalendarDays aria-hidden className="mt-0.5 size-5 shrink-0 text-[#7cff3a]" />
              <div>
                <dt className="gp-label">Tanggal</dt>
                <dd className="mt-1 font-bold">{date}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-[#7cff3a]" />
              <div>
                <dt className="gp-label">Waktu</dt>
                <dd className="mt-1 font-bold">{time}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-[#7cff3a]" />
              <div className="min-w-0">
                <dt className="gp-label">Lokasi</dt>
                <dd className="mt-1 font-bold">{event.venueName}, Tebing Tinggi</dd>
              </div>
            </div>
          </dl>

          <div className="u3 w-full">
            <PosterCountdown startsAt={event.startsAt} endsAt={event.endsAt} />
          </div>
        </div>
      </section>

      <div className="gp-wrap flex flex-col gap-8 pb-20" style={NARROW}>
        <section aria-labelledby="rsvp-title" className="gp-invite-card gp-reveal p-6 sm:p-8">
          <p className="gp-label text-[#7cff3a]">RSVP</p>
          <h2 id="rsvp-title" className="gp-display mt-2 text-[34px] sm:text-[40px]" style={TIGHT}>
            Konfirmasi kehadiran
          </h2>
          <div className="mt-5">
            <RsvpForm token={token} maxPax={invitation.maxPax} initial={invitation.rsvp} canChange={invitation.canChange} contactUrl={contactUrl} />
          </div>
        </section>

        {invitation.rsvp?.response === "attending" ? (
          <section aria-labelledby="entry-title" className="gp-invite-card gp-reveal flex flex-col items-center gap-4 p-6 text-center sm:p-8">
            <h2 id="entry-title" className="gp-display text-[30px] sm:text-[36px]" style={TIGHT}>
              Tiket masuk
            </h2>
            <EntryQr url={pageUrl} guestName={invitation.guestName} maxPax={invitation.maxPax} />
          </section>
        ) : null}

        <section aria-labelledby="save-title" className="gp-reveal flex flex-col items-center gap-4 text-center">
          <h2 id="save-title" className="gp-label">
            Simpan ke kalender — pengingat H-1 otomatis
          </h2>
          <ShareActions event={event} pageUrl={pageUrl} icsHref={`/undangan/${token}/kalender`} inviteFriend={false} testIdPrefix="invitation" />
        </section>

        {event.agenda.length ? (
          <section aria-labelledby="rundown-title" className="gp-reveal flex flex-col gap-4">
            <h2 id="rundown-title" className="gp-display text-[40px] leading-none">
              <span className="gp-cream">Rundown</span>
            </h2>
            <div data-testid="invitation-agenda">
              <AgendaLive agenda={event.agenda} startsAt={event.startsAt} endsAt={event.endsAt} timezone={event.timezone} zone={zone} />
            </div>
          </section>
        ) : null}

        <section aria-labelledby="notes-title" className="gp-reveal flex flex-col gap-4">
          <h2 id="notes-title" className="gp-display text-[40px] leading-none">
            <span className="gp-cream">Info</span> <span className="gp-red">Penting</span>
          </h2>
          <div className="gp-cards" data-testid="invitation-info">
            {notes.map((note) => (
              <article key={note.key} className="gp-card">
                <span className="gp-card-icon" aria-hidden>
                  <note.icon className="size-5" />
                </span>
                <h3 className="gp-card-title">{note.title}</h3>
                <p>{note.body}</p>
              </article>
            ))}
          </div>
          <address className="border-l-2 border-[#e0262f] pl-4 text-base leading-relaxed text-[#efe6d6] not-italic">{event.address}</address>
          <div className="flex flex-wrap gap-3">
            <a href={event.mapsUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-cream">
              <MapPin aria-hidden className="size-4" /> Buka Google Maps
            </a>
            {contactUrl ? (
              <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-line">
                <MessageCircle aria-hidden className="size-4" /> WhatsApp Garage
              </a>
            ) : null}
          </div>
        </section>

        <p className="text-center text-sm text-[#a9a49a]">Undangan ini khusus untuk Anda. Mohon tidak membagikan tautannya.</p>
      </div>
    </main>
  );
}
