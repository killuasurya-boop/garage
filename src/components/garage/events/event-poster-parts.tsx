import Image from "next/image";
import { CalendarPlus, Download, MapPin, MessageCircle, Shirt, ShieldCheck, Users } from "lucide-react";
import type { CSSProperties } from "react";

import { googleCalendarUrl } from "@/lib/event-calendar";
import { agendaClock, eventZoneLabel, formatEventDate, formatEventTimeRange, type PublicEvent } from "@/lib/event-format";

// Bagian poster Grand Opening yang dipakai bersama landing /grand-opening dan
// undangan pribadi (server component; animasi murni CSS di grand-opening.css).

/** Filter tekstur grunge & sapuan kuas (dipakai lewat CSS url(#…)). */
export function PosterFilters() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <filter id="gp-grunge">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 1.4" result="m" />
        <feComposite in="SourceGraphic" in2="m" operator="in" />
      </filter>
      <filter id="gp-brush">
        <feTurbulence type="fractalNoise" baseFrequency="0.035 0.6" numOctaves="3" seed="3" result="t" />
        <feDisplacementMap in="SourceGraphic" in2="t" scale="22" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

/** Logo BLACK hanya tampil bila sponsornya BLACK dan gerbang 21+ aktif (konten produk tembakau). */
export function sponsorLogoFor(event: Pick<PublicEvent, "sponsorName" | "ageGate">) {
  return event.ageGate && event.sponsorName && /^black$/i.test(event.sponsorName.trim()) ? "/grand-opening/sponsor-black.webp" : null;
}

/** Lockup co-branding "Garage Coffee × BLACK" (logo Garage selalu; BLACK sesuai aturan sponsor). */
export function CoBrandLockup({ event, size = "md" }: { event: Pick<PublicEvent, "sponsorName" | "ageGate">; size?: "sm" | "md" | "lg" }) {
  const blackLogo = sponsorLogoFor(event);
  const garageHeight = size === "lg" ? "h-12 sm:h-16" : size === "sm" ? "h-8" : "h-10 sm:h-12";
  const blackWidth = size === "lg" ? "w-[64px] sm:w-[84px]" : size === "sm" ? "w-[40px]" : "w-[52px] sm:w-[64px]";
  return (
    <div className="gp-lockup gp-lockup-stamp" data-testid="cobrand-lockup">
      <span className="gp-lockup-garage">
        <Image src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" width={1200} height={282} className={`${garageHeight} w-auto object-contain`} priority />
      </span>
      {blackLogo ? (
        <>
          <span className="gp-lockup-x" aria-hidden>
            ×
          </span>
          <span className="gp-lockup-black">
            <Image src={blackLogo} alt={event.sponsorName ?? "BLACK"} width={720} height={957} className={`${blackWidth} h-auto`} data-testid="cobrand-black" />
          </span>
        </>
      ) : null}
    </div>
  );
}

type ShareEvent = Pick<
  PublicEvent,
  "slug" | "title" | "tagline" | "startsAt" | "endsAt" | "timezone" | "venueName" | "address" | "agenda" | "mapsUrl"
>;

/** Pesan "Ajak Teman" untuk wa.me (tanpa nomor → pengguna pilih kontak sendiri). */
export function buildInviteFriendMessage(event: ShareEvent, url: string) {
  const zone = eventZoneLabel(event.timezone);
  return [
    `Yuk datang ke *${event.title}*!`,
    `📅 ${formatEventDate(event.startsAt, event.timezone)}`,
    `🕒 ${formatEventTimeRange(event.startsAt, event.endsAt, event.timezone)}`,
    ...event.agenda.map((item) => `🎵 ${agendaClock(item.start)} ${zone} · ${item.title}`),
    `📍 ${event.venueName}, Tebing Tinggi`,
    "",
    `Info lengkap: ${url}`,
  ].join("\n");
}

/** Tombol Ajak Teman (WA) + Simpan ke Kalender (Google + .ics). */
export function ShareActions({
  event,
  pageUrl,
  icsHref,
  inviteFriend = true,
  testIdPrefix = "event",
  align = "center",
}: {
  event: ShareEvent;
  pageUrl: string;
  icsHref: string;
  inviteFriend?: boolean;
  testIdPrefix?: string;
  align?: "center" | "start";
}) {
  return (
    <div className="gp-actions" data-align={align}>
      {inviteFriend ? (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(buildInviteFriendMessage(event, pageUrl))}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`${testIdPrefix}-invite-friend`}
          className="gp-btn gp-btn-red"
        >
          <Users aria-hidden className="size-4" /> Ajak Teman
        </a>
      ) : null}
      <a
        href={googleCalendarUrl(event, pageUrl)}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`${testIdPrefix}-gcal`}
        className="gp-btn gp-btn-line"
      >
        <CalendarPlus aria-hidden className="size-4" /> Google Calendar
      </a>
      <a href={icsHref} download data-testid={`${testIdPrefix}-ics`} className="gp-btn gp-btn-line">
        <Download aria-hidden className="size-4" /> Simpan .ics
      </a>
    </div>
  );
}

function faqAnswer(event: Pick<PublicEvent, "faq">, pattern: RegExp) {
  return event.faq.find((item) => pattern.test(item.q))?.a ?? null;
}

/** Kartu Info Penting: akses umum, dress code, 21+, lokasi, kontak. */
export function InfoCards({ event, whatsappUrl }: { event: PublicEvent; whatsappUrl: string | null }) {
  const cards = [
    {
      key: "akses",
      icon: Users,
      title: "Terbuka untuk umum",
      body: faqAnswer(event, /umum/i) ?? "Semua orang boleh datang — tidak perlu undangan.",
    },
    { key: "dress", icon: Shirt, title: "Dress code", body: faqAnswer(event, /dress/i) ?? "Smart casual." },
    ...(event.ageGate
      ? [{ key: "usia", icon: ShieldCheck, title: "Khusus 21+", body: "Acara untuk pengunjung berusia 21 tahun ke atas. Siapkan kartu identitas." }]
      : []),
  ];
  return (
    <div className="gp-cards" data-testid="event-info-cards">
      {cards.map((card) => (
        <article key={card.key} className="gp-card gp-reveal" data-testid={`event-info-${card.key}`}>
          <span className="gp-card-icon" aria-hidden>
            <card.icon className="size-5" />
          </span>
          <h3 className="gp-card-title">{card.title}</h3>
          <p>{card.body}</p>
        </article>
      ))}
      <article className="gp-card gp-reveal" data-testid="event-info-lokasi">
        <span className="gp-card-icon" aria-hidden>
          <MapPin className="size-5" />
        </span>
        <h3 className="gp-card-title">Lokasi</h3>
        <p>
          {event.venueName} — {event.address}
        </p>
        <a href={event.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-bold tracking-[0.16em] text-[#c8ff9f] uppercase hover:text-white">
          <MapPin aria-hidden className="size-4" /> Buka Maps
        </a>
      </article>
      {whatsappUrl ? (
        <article className="gp-card gp-reveal" data-testid="event-info-kontak">
          <span className="gp-card-icon" aria-hidden>
            <MessageCircle className="size-5" />
          </span>
          <h3 className="gp-card-title">Kontak</h3>
          <p>Ada pertanyaan soal acara, parkir, atau reservasi rombongan? Chat tim Garage.</p>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-bold tracking-[0.16em] text-[#c8ff9f] uppercase hover:text-white">
            <MessageCircle aria-hidden className="size-4" /> WhatsApp Garage
          </a>
        </article>
      ) : null}
    </div>
  );
}

/** Daftar tanya-jawab (dari Konten Event) — native <details>, aman tanpa JS. */
export function FaqList({ faq }: { faq: PublicEvent["faq"] }) {
  if (!faq.length) return null;
  return (
    <div className="gp-faq" data-testid="event-faq">
      {faq.map((item) => (
        <details key={item.q}>
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Partikel debu halus di hero (8 elemen CSS). */
export function Dust() {
  return (
    <span className="gp-dust -z-10" aria-hidden>
      {Array.from({ length: 8 }, (_, index) => (
        <i key={index} style={{ "--i": index } as CSSProperties} />
      ))}
    </span>
  );
}
