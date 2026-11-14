/* eslint-disable @next/next/no-img-element -- aset dilayani platform event (/event/...), bukan Next. */
import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";

import { HomeCountdown } from "@/components/garage/events/event-live-parts";
import { formatEventDate, formatEventTimeRange } from "@/lib/event-format";
import type { GigsPromo } from "@/lib/gigs-promo";

// Promosi event GARAGE EVENT PLATFORM di beranda (mis. GIGS AKHIR TAHUN 2026).
// Gaya & hitung mundur memakai ulang banner Grand Opening (kelas go-banner*, HomeCountdown).
// Semua tautan pakai <a> biasa: /event/* dilayani Caddy -> platform event, bukan rute Next.
export function GigsPromoBanner({ promo }: { promo: GigsPromo }) {
  const isLive = Boolean(promo.live) || promo.status === "berlangsung";
  return (
    <section id="gigs-promo" aria-labelledby="gigs-promo-title" data-testid="home-gigs-banner" className="go-banner gigs-promo">
      <div className="go-banner__card">
        <div className="go-banner__body">
          <span className="go-banner__eyebrow">
            <span className="go-banner__dot" aria-hidden /> {isLive ? "Sedang berlangsung" : "Event Garage · Segera"}
          </span>
          <h2 id="gigs-promo-title" className="go-banner__title">
            {promo.name}
          </h2>
          {promo.tagline ? <p className="gigs-promo__tagline">{promo.tagline}</p> : null}
          {promo.live ? (
            <p className="gigs-promo__now">
              Sedang tampil: <strong>{promo.live.name}</strong>
              {promo.live.performer ? ` — ${promo.live.performer}` : ""}
            </p>
          ) : null}
          <HomeCountdown startsAt={promo.startsAt} endsAt={promo.endsAt} label={`Hitung mundur menuju ${promo.name}`} />
          <ul className="go-banner__facts">
            <li>
              <CalendarDays aria-hidden className="go-banner__icon" />
              <span>{formatEventDate(promo.startsAt)}</span>
            </li>
            <li>
              <Clock aria-hidden className="go-banner__icon" />
              <span>Mulai {formatEventTimeRange(promo.startsAt, promo.endsAt).split("–")[0]} WIB</span>
            </li>
            {promo.venue ? (
              <li>
                <MapPin aria-hidden className="go-banner__icon" />
                <span>{promo.venue}</span>
              </li>
            ) : null}
          </ul>
          <div className="go-banner__actions">
            <a href={promo.url} data-testid="home-gigs-cta" className="btn btn-primary">
              <span>Lihat Event</span> <ArrowRight aria-hidden size={16} />
            </a>
            {promo.links.daftar ? (
              <a href={promo.links.daftar} className="btn">
                <span>Daftar Sponsor / UMKM</span>
              </a>
            ) : null}
            {promo.links.transparansi ? (
              <a href={promo.links.transparansi} className="btn">
                <span>Transparansi Dana</span>
              </a>
            ) : null}
          </div>
        </div>
        <a
          href={promo.url}
          className="go-banner__art gigs-promo__art"
          aria-hidden
          tabIndex={-1}
          style={promo.poster ? { backgroundImage: `url("${promo.poster}")` } : undefined}
        >
          {promo.logo ? <img src={promo.logo} alt="" width={1200} height={1200} loading="lazy" decoding="async" className="gigs-promo__logo" /> : null}
        </a>
      </div>
    </section>
  );
}
