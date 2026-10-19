import type { Metadata } from "next";
import { Permanent_Marker } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, MapPin, MessageCircle, Mic2, Music } from "lucide-react";

import { AgeGate, EventShareButton, PosterCountdown } from "@/components/garage/events/event-live-parts";
import { agendaClock, eventPhase, eventZoneLabel, formatEventDate, formatEventTimeRange } from "@/lib/event-format";
import { GRAND_OPENING_SLUG, getPublishedEvent } from "@/lib/event-service";
import { getBusinessInfo } from "@/lib/garage-service";
import { waLink } from "@/lib/whatsapp-link";

import "./grand-opening.css";

export const dynamic = "force-dynamic";

const marker = Permanent_Marker({ weight: "400", subsets: ["latin"], variable: "--font-marker" });

const SITE_URL = process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.startsWith("https://")
  ? process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL.replace(/\/+$/, "")
  : "https://garagecoffee.id";
const PAGE_PATH = `/${GRAND_OPENING_SLUG}`;
// Gambar preview link (WA/IG/FB) khusus Grand Opening, 1200×630.
const OG_IMAGE = "/grand-opening/og-grand-opening.jpg";

export async function generateMetadata(): Promise<Metadata> {
  const event = await getPublishedEvent(GRAND_OPENING_SLUG).catch(() => null);
  if (!event) return { title: "Grand Opening Garage Coffee", robots: { index: false, follow: false } };
  const when = `${formatEventDate(event.startsAt, event.timezone)}, ${formatEventTimeRange(event.startsAt, event.endsAt, event.timezone)}`;
  const description = `${event.title} — ${when} di ${event.venueName}, Tebing Tinggi.${
    event.highlights.length ? ` ${event.highlights.join(" & ")}.` : ""
  }`;
  return {
    title: `${event.title} | ${when}`,
    description,
    alternates: { canonical: PAGE_PATH },
    openGraph: {
      title: event.title,
      description,
      url: PAGE_PATH,
      type: "website",
      locale: "id_ID",
      siteName: "GARAGE Coffee",
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: `${event.title} — ${when}` }],
    },
    twitter: { card: "summary_large_image", title: event.title, description, images: [OG_IMAGE] },
  };
}

function Arrow() {
  return <ArrowRight aria-hidden className="size-4" />;
}

export default async function GrandOpeningPage() {
  const [event, business] = await Promise.all([getPublishedEvent(GRAND_OPENING_SLUG), getBusinessInfo().catch(() => null)]);
  if (!event) notFound();

  const date = formatEventDate(event.startsAt, event.timezone);
  const time = formatEventTimeRange(event.startsAt, event.endsAt, event.timezone);
  const zone = eventZoneLabel(event.timezone);
  const [weekday, dayMonthYear] = date.split(", ");
  const [day, month, year] = (dayMonthYear ?? "").split(" ");
  const whatsappUrl = waLink(event.contactWhatsapp, `Halo Garage Coffee, saya mau tanya tentang ${event.title} (${date}).`);
  const about = event.about || business?.tagline || null;
  const pageUrl = `${SITE_URL}${PAGE_PATH}`;
  const ended = eventPhase(event) === "ended";
  // Logo resmi mitra (dikirim owner, Okt 2026); sponsor lain tampil sebagai teks.
  const sponsorLogo = event.sponsorName && /^black$/i.test(event.sponsorName.trim()) ? "/grand-opening/sponsor-black.webp" : null;
  // Promo hanya ditawarkan sebelum/selama acara.
  const promoText = ended ? null : event.promoText;
  const performers = event.agenda.map((item) => item.title);
  const marqueeItems = [...event.agenda.map((item) => `${item.title} ${agendaClock(item.start)}`), event.title, promoText, date].filter(
    (item): item is string => Boolean(item),
  );

  // Structured data Event: fakta terkonfirmasi saja (tanpa harga/kapasitas).
  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: pageUrl,
    image: [`${SITE_URL}${OG_IMAGE}`],
    location: {
      "@type": "Place",
      name: event.venueName,
      address: { "@type": "PostalAddress", streetAddress: event.address, addressCountry: "ID" },
    },
    organizer: { "@type": "Organization", name: "Garage Coffee", url: SITE_URL },
    ...(performers.length ? { performer: performers.map((name) => ({ "@type": "PerformingGroup", name })) } : {}),
  };

  return (
    <main className={`gp ${marker.variable}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />
      {event.ageGate ? <AgeGate /> : null}

      {/* Filter tekstur grunge & sapuan kuas (dipakai lewat CSS url(#…)) */}
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

      {/* NAV */}
      <header className="absolute inset-x-0 top-0 z-20 py-5">
        <div className="gp-wrap flex items-center justify-between gap-6">
          <Link href="/" aria-label="Garage Coffee — beranda" className="inline-flex items-center">
            <Image src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" width={170} height={40} className="h-9 w-auto object-contain" priority />
          </Link>
          <nav aria-label="Navigasi acara" className="gp-nav text-xs font-bold uppercase tracking-[0.24em]">
            <a href="#rundown" className="py-2.5 text-[#d8d1c3] hover:text-white">Rundown</a>
            {promoText ? <a href="#promo" className="py-2.5 text-[#d8d1c3] hover:text-white">Promo</a> : null}
            <a href="#lokasi" className="py-2.5 text-[#d8d1c3] hover:text-white">Lokasi</a>
          </nav>
          {whatsappUrl ? (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-red min-h-11 px-6 text-xs">
              WhatsApp
            </a>
          ) : null}
        </div>
      </header>

      {/* HERO */}
      <section className="relative isolate pt-[120px]">
        <Image
          src="/grand-opening/garage-venue.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-40 object-cover object-[center_30%] opacity-45"
        />
        <div className="absolute inset-0 -z-30 bg-[radial-gradient(60%_50%_at_50%_40%,transparent,rgba(10,10,11,0.75)_75%),linear-gradient(180deg,rgba(10,10,11,0.85)_0%,rgba(10,10,11,0.2)_35%,rgba(10,10,11,0.55)_70%,#0a0a0b_100%)]" />
        <div className="gp-sweep -z-20" />
        <span className="gp-laser l1 -z-10" style={{ left: "-5%", top: "22%", width: "60%" }} />
        <span className="gp-laser l2 -z-10" style={{ left: "48%", top: "14%", width: "58%" }} />
        <span className="gp-laser l3 -z-10" style={{ left: "4%", top: "78%", width: "40%" }} />
        <span className="gp-brush gp-hide-m -z-10" style={{ left: "-4%", top: 96, width: "34%", height: 46, rotate: "-14deg" }} />

        <div className="gp-wrap relative text-center">
          <p className="u1 gp-label mb-3.5">Garage Coffee · Tebing Tinggi</p>
          <h1 data-testid="event-title" className="gp-display gp-title text-[190px]" aria-label={event.title}>
            <span className="s1 gp-cream block">Grand</span>
            <span className="s2 gp-red -mt-1.5 block">Opening</span>
          </h1>
        </div>

        <div className="gp-wrap relative -mt-8">
          <div className="gp-artists relative mx-auto max-w-[900px]">
            <Image
              src="/grand-opening/diskoyoks.webp"
              alt="Personel Diskoyoks"
              width={905}
              height={615}
              priority
              sizes="(max-width: 960px) 100vw, 900px"
              className="block h-auto w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.65)]"
            />
          </div>
          {promoText ? (
            <div className="gp-badge" data-testid="event-promo-badge">
              <PromoBadge text={promoText} />
            </div>
          ) : null}
        </div>

        {event.agenda.length ? (
          <div className="gp-wrap gp-overlay-script relative z-[2] -mt-[140px] text-center">
            <div className="u2 inline-flex flex-col items-center">
              {event.agenda.slice(0, -1).map((item) => (
                <span key={`${item.start}-${item.title}`} className="gp-script gp-script-md -rotate-[5deg] text-[44px] text-[#ff3540] [text-shadow:0_4px_18px_rgba(0,0,0,0.7)]">
                  {item.title}
                </span>
              ))}
              <span className="gp-script gp-script-xl -rotate-[4deg] text-[116px] text-[#efe6d6] [text-shadow:0_10px_30px_rgba(0,0,0,0.8)]">
                {event.agenda[event.agenda.length - 1].title}
              </span>
            </div>
          </div>
        ) : null}

        <div className="gp-wrap u3 relative z-[3] mt-9 flex flex-col items-center gap-7 pb-10">
          <div data-testid="event-when" className="gp-info border-y border-[rgba(239,230,214,0.18)] bg-[rgba(10,10,11,0.75)] px-8 py-4">
            <div className="flex items-center gap-3.5">
              <div className="text-left">
                <div className="text-xs font-bold tracking-[0.24em] text-[#c4bfb4] uppercase">{weekday}</div>
                <div className="gp-display text-[54px] leading-none">{day}</div>
              </div>
              <div className="gp-display text-left text-[22px] leading-[1.05]">
                {month}
                <br />
                {year}
              </div>
            </div>
            <span className="gp-sep h-[54px] bg-[rgba(239,230,214,0.25)]" aria-hidden />
            <div className="flex items-center gap-3">
              <Clock aria-hidden className="size-6 text-[#7cff3a]" />
              <span className="text-xl font-bold tracking-wide">{time}</span>
            </div>
            <span className="gp-sep h-[54px] bg-[rgba(239,230,214,0.25)]" aria-hidden />
            <div className="flex items-center gap-3 text-left">
              <MapPin aria-hidden className="size-6 text-[#7cff3a]" />
              <div>
                <div className="text-lg font-bold tracking-[0.08em] uppercase">{event.venueName}</div>
                <div className="text-xs tracking-[0.32em] text-[#c4bfb4]">TEBING TINGGI</div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3.5">
            <a href="#rundown" className="gp-btn gp-btn-red">
              Lihat Rundown <Arrow />
            </a>
            <a href={event.mapsUrl} target="_blank" rel="noopener noreferrer" data-testid="event-maps" className="gp-btn gp-btn-line">
              <MapPin aria-hidden className="size-4" /> Lihat Lokasi
            </a>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div aria-hidden className="relative z-[4] -mx-5 mt-8 -rotate-[1.5deg] overflow-hidden bg-[#e0262f] py-3.5 shadow-[0_10px_40px_rgba(224,38,47,0.35)]">
        <div className="gp-marquee gp-display text-[26px] tracking-[0.08em] whitespace-nowrap text-white">
          {[0, 1].map((copy) => (
            <span key={copy} className="pr-10">
              {marqueeItems.map((item) => `${item} ✦ `).join("")}
            </span>
          ))}
        </div>
      </div>

      {/* COUNTDOWN */}
      <section className="gp-sec py-[110px]">
        <div className="gp-wrap gp-reveal flex flex-col items-center text-center">
          <PosterCountdown startsAt={event.startsAt} endsAt={event.endsAt} />
        </div>
      </section>

      {/* SPONSOR */}
      {event.sponsorName ? (
        <section aria-label="Sponsor" className="border-y border-[rgba(239,230,214,0.08)] bg-[#070708] py-10">
          <div className="gp-wrap flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-center">
            <span className="gp-label">Supported by</span>
            {sponsorLogo ? (
              <Image
                src={sponsorLogo}
                alt={event.sponsorName}
                width={720}
                height={957}
                className="h-auto w-[150px] sm:w-[180px]"
                data-testid="event-sponsor-logo"
              />
            ) : (
              <span className="gp-display text-[48px] tracking-[0.04em] text-white">{event.sponsorName}</span>
            )}
          </div>
        </section>
      ) : null}

      {/* RUNDOWN */}
      <section id="rundown" className="gp-sec relative overflow-hidden border-t border-[rgba(239,230,214,0.08)] bg-[radial-gradient(60%_60%_at_70%_50%,rgba(224,38,47,0.16),transparent_70%),#0d0d0f] py-[120px]">
        <span className="gp-laser l2" style={{ left: "40%", top: "14%", width: "60%" }} />
        <div className="gp-wrap gp-split">
          <div className="gp-reveal flex flex-col gap-5">
            <p className="gp-label text-[#7cff3a]">{ended ? "Rundown yang sudah berlangsung" : "Rundown"} · {weekday}, {day} {month}</p>
            <h2 className="gp-display gp-h2 text-[72px]">
              <span className="gp-cream">Special</span> <span className="gp-red">Performance</span>
            </h2>
            {event.agenda.length ? (
              <ol className="mt-2 flex flex-col gap-3" data-testid="event-agenda">
                {event.agenda.map((item, index) => (
                  <li key={`${item.start}-${item.title}`} className="flex items-center gap-5 border border-[rgba(239,230,214,0.14)] bg-[rgba(18,18,20,0.85)] px-5 py-4">
                    <span className="flex size-12 shrink-0 items-center justify-center bg-[#e0262f] text-white">
                      {index === event.agenda.length - 1 ? <Mic2 aria-hidden className="size-6" /> : <Music aria-hidden className="size-6" />}
                    </span>
                    <div className="min-w-0">
                      <div className="gp-display text-[34px] leading-none">{item.title}</div>
                      <div className="mt-1.5 text-base font-bold tracking-[0.12em] text-[#c8ff9f]">
                        {agendaClock(item.start)} – {agendaClock(item.end)} {zone}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            {about ? <p className="max-w-[470px] text-[17px] leading-relaxed text-[#d8d1c3]">{about}</p> : null}
          </div>
          <div className="gp-reveal relative">
            <span className="gp-brush" style={{ left: "-6%", bottom: "18%", width: "112%", height: 90, rotate: "-6deg" }} />
            <Image
              src="/grand-opening/diskoyoks.webp"
              alt="Personel Diskoyoks"
              width={905}
              height={615}
              sizes="(max-width: 960px) 100vw, 600px"
              className="relative block h-auto w-full drop-shadow-[0_24px_40px_rgba(0,0,0,0.7)]"
            />
          </div>
        </div>
      </section>

      {/* PROMO */}
      {promoText ? (
        <section id="promo" className="gp-sec py-[110px]">
          <div className="gp-wrap">
            <div className="gp-reveal gp-promo-card relative flex flex-wrap items-center justify-between gap-10 overflow-hidden border border-[rgba(224,38,47,0.45)] bg-[linear-gradient(120deg,#1a0b0d,#121214_60%)] px-14 py-16">
              <span className="gp-laser l1" style={{ left: "50%", top: "30%", width: "60%" }} />
              <div className="relative flex max-w-[600px] flex-col gap-4">
                <p className="gp-label text-[#ff6b72]">Promo Grand Opening</p>
                <h2 className="gp-display gp-h2 text-[68px] text-[#efe6d6]">{promoText}</h2>
                <p className="text-[17px] leading-relaxed text-[#d8d1c3]">Berlaku selama Grand Opening, {date}. Tanyakan menu bundling ke kasir atau pesan lewat menu digital.</p>
              </div>
              <Link href="/order" className="gp-btn gp-btn-red relative">
                Lihat Menu <Arrow />
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* LOKASI */}
      <section id="lokasi" className="gp-sec pb-[120px]">
        <div className="gp-wrap gp-split">
          <figure className="gp-reveal relative m-0 border border-[rgba(239,230,214,0.12)]">
            <Image src="/grand-opening/garage-venue.webp" alt="Gedung Garage Coffee di malam hari" width={941} height={300} sizes="(max-width: 960px) 100vw, 600px" className="block h-auto w-full" />
            <figcaption className="absolute bottom-0 left-0 bg-[#e0262f] px-4 py-2.5 text-xs font-bold tracking-[0.24em] text-white uppercase">
              {event.venueName} · Tebing Tinggi
            </figcaption>
          </figure>
          <div className="gp-reveal flex flex-col gap-5">
            <p className="gp-label text-[#7cff3a]">Tempat baru · Cerita baru</p>
            <h2 className="gp-display gp-h2 text-[64px]">
              <span className="gp-cream">Datang ke</span>
              <br />
              <span className="gp-red">{event.venueName}</span>
            </h2>
            <address className="border-l-2 border-[#e0262f] pl-4 text-base leading-relaxed text-[#efe6d6] not-italic">{event.address}</address>
            <div className="flex flex-wrap gap-3">
              <a href={event.mapsUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-cream">
                <MapPin aria-hidden className="size-4" /> Buka Google Maps
              </a>
              {whatsappUrl ? (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" data-testid="event-whatsapp" className="gp-btn gp-btn-line">
                  <MessageCircle aria-hidden className="size-4" /> WhatsApp Garage
                </a>
              ) : null}
              <EventShareButton url={pageUrl} title={event.title} text={`${event.title} — ${date}, ${time}`} />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[rgba(239,230,214,0.08)] bg-[#070708] pt-16 pb-8">
        <div className="gp-wrap flex flex-col gap-11">
          <div className="gp-foot">
            <div className="flex flex-col gap-4">
              <span className="inline-flex w-fit">
                <Image src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" width={200} height={47} className="h-10 w-auto object-contain" />
              </span>
              <p className="max-w-[340px] text-sm leading-relaxed text-[#a9a49a]">Tempat baru untuk menikmati kopi, bertemu teman, dan merayakan cerita bersama.</p>
            </div>
            <nav aria-label="Navigasi bawah" className="flex flex-col gap-3 text-xs font-bold tracking-[0.24em] uppercase">
              <Link href="/" className="w-fit text-[#d8d1c3] hover:text-white">Beranda</Link>
              <a href="#rundown" className="w-fit text-[#d8d1c3] hover:text-white">Rundown</a>
              <a href="#lokasi" className="w-fit text-[#d8d1c3] hover:text-white">Lokasi</a>
            </nav>
            {event.sponsorName ? (
              <div className="flex flex-col gap-3" data-testid="event-sponsor">
                <span className="gp-label">Supported by</span>
                {sponsorLogo ? (
                  <Image src={sponsorLogo} alt={event.sponsorName} width={720} height={957} className="h-auto w-[132px]" />
                ) : (
                  <span className="gp-display text-[44px] tracking-[0.04em] text-white">{event.sponsorName}</span>
                )}
              </div>
            ) : null}
          </div>
          <div className="h-px bg-[rgba(239,230,214,0.1)]" />
          <div className="flex flex-wrap justify-between gap-3 text-xs text-[#a9a49a]">
            <span>© 2026 Garage Coffee</span>
            <span className="tracking-[0.3em]">GOOD COFFEE · GOOD PEOPLE</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

/** "Diskon 20% Menu Bundling" → baris atas/angka besar/bawah bila ada angka persen; selain itu teks utuh. */
function PromoBadge({ text }: { text: string }) {
  const match = text.match(/^(.*?)(\d{1,3}\s?%)(.*)$/);
  if (!match) return <div className="gp-display text-[30px] leading-tight">{text}</div>;
  return (
    <>
      {match[1].trim() ? <div className="gp-display gp-badge-top text-[30px] leading-none">{match[1].trim()}</div> : null}
      <div className="gp-display gp-badge-big text-[76px] leading-[0.95]">{match[2].replace(/\s/g, "")}</div>
      {match[3].trim() ? <div className="gp-badge-sub text-xs font-bold tracking-[0.22em] uppercase">{match[3].trim()}</div> : null}
    </>
  );
}
