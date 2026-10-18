import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Music } from "lucide-react";

import { formatEventDate, formatEventTimeRange, type PublicEvent } from "@/lib/event-format";

// Ringkasan event di homepage (FR-HOME-001). Data dari tabel `events` yang sama
// dengan landing /grand-opening — tidak ada tanggal/alamat yang ditulis di sini.
export function GrandOpeningBanner({ event }: { event: PublicEvent }) {
  const href = `/${event.slug}`;
  return (
    <section
      aria-labelledby="home-event-title"
      data-testid="home-event-banner"
      className="go-banner relative z-[2] w-full max-w-6xl"
    >
      <div className="go-banner__card overflow-hidden rounded-xl border border-garage-red/50 bg-[linear-gradient(120deg,#1d0d10_0%,#16161b_55%,#1b1712_100%)] shadow-[0_18px_40px_-24px_rgba(209,26,42,0.7)]">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-garage-amber">Segera hadir</p>
        <h2 id="home-event-title" className="go-banner__title text-2xl font-black uppercase leading-tight text-garage-fg sm:text-3xl">
          {event.title}
        </h2>
        <ul className="go-banner__facts grid gap-2 text-sm text-garage-dim sm:grid-cols-3 sm:text-base">
          <li className="flex items-start gap-2">
            <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-garage-red-bright" />
            <span>
              {formatEventDate(event.startsAt, event.timezone)}
              <br />
              {formatEventTimeRange(event.startsAt, event.endsAt, event.timezone)}
            </span>
          </li>
          {event.highlights.length ? (
            <li className="flex items-start gap-2">
              <Music aria-hidden className="mt-0.5 size-4 shrink-0 text-garage-red-bright" />
              <span>{event.highlights.join(" · ")}</span>
            </li>
          ) : null}
          <li className="flex items-start gap-2">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-garage-red-bright" />
            <span>{event.venueName}, Tebing Tinggi</span>
          </li>
        </ul>
        <div className="go-banner__actions flex flex-col gap-2 sm:flex-row">
          <Link
            href={href}
            data-testid="home-event-cta"
            className="inline-flex min-h-11 items-center justify-center gap-2 go-banner__btn rounded-md bg-garage-red text-sm font-bold uppercase tracking-wide text-white transition hover:bg-garage-red-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garage-amber"
          >
            Lihat Detail Acara <ArrowRight aria-hidden className="size-4" />
          </Link>
          <a
            href={event.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 go-banner__btn rounded-md border border-garage-line-2 text-sm font-bold uppercase tracking-wide text-garage-fg transition hover:border-garage-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garage-amber"
          >
            <MapPin aria-hidden className="size-4" /> Lihat Lokasi
          </a>
        </div>
      </div>
    </section>
  );
}
