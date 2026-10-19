import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";

import { HomeCountdown } from "@/components/garage/events/event-live-parts";
import { agendaClock, eventZoneLabel, formatEventDate, formatEventTimeRange, type PublicEvent } from "@/lib/event-format";

// Ringkasan event di homepage (FR-HOME-001). Data dari tabel `events` yang sama
// dengan landing /grand-opening — tidak ada tanggal/alamat yang ditulis di sini.
export function GrandOpeningBanner({ event }: { event: PublicEvent }) {
  const href = `/${event.slug}`;
  const zone = eventZoneLabel(event.timezone);
  return (
    <section id="grand-opening" aria-labelledby="home-event-title" data-testid="home-event-banner" className="go-banner">
      <div className="go-banner__card">
        <div className="go-banner__body">
          <span className="go-banner__eyebrow">
            <span className="go-banner__dot" aria-hidden /> Segera hadir
          </span>
          <h2 id="home-event-title" className="go-banner__title">
            {event.title}
          </h2>
          <HomeCountdown startsAt={event.startsAt} endsAt={event.endsAt} />
          <ul className="go-banner__facts">
            <li>
              <CalendarDays aria-hidden className="go-banner__icon" />
              <span>{formatEventDate(event.startsAt, event.timezone)}</span>
            </li>
            <li>
              <Clock aria-hidden className="go-banner__icon" />
              <span>{formatEventTimeRange(event.startsAt, event.endsAt, event.timezone)}</span>
            </li>
            <li>
              <MapPin aria-hidden className="go-banner__icon" />
              <span>{event.venueName}, Tebing Tinggi</span>
            </li>
          </ul>
          {event.agenda.length ? (
            <ol className="go-banner__agenda" data-testid="home-event-agenda">
              {event.agenda.map((item) => (
                <li key={`${item.start}-${item.title}`}>
                  <span className="go-banner__time">
                    {agendaClock(item.start)}–{agendaClock(item.end)} {zone}
                  </span>
                  <span className="go-banner__session">{item.title}</span>
                </li>
              ))}
            </ol>
          ) : event.highlights.length ? (
            <p className="go-banner__highlights">{event.highlights.join(" · ")}</p>
          ) : null}
          {event.promoText ? <p className="go-banner__promo">{event.promoText}</p> : null}
          <div className="go-banner__actions">
            <Link href={href} data-testid="home-event-cta" className="btn btn-primary">
              <span>Lihat Detail Acara</span> <ArrowRight aria-hidden size={16} />
            </Link>
            <a href={event.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn">
              <MapPin aria-hidden size={16} /> <span>Lihat Lokasi</span>
            </a>
          </div>
        </div>
        <div className="go-banner__art" aria-hidden>
          <Image
            src="/grand-opening/diskoyoks.webp"
            alt=""
            width={905}
            height={615}
            sizes="(max-width: 900px) 90vw, 480px"
            className="go-banner__img"
          />
        </div>
      </div>
    </section>
  );
}
