import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, MapPin, MessageCircle, Music } from "lucide-react";

import { EventCountdown, EventShareButton } from "@/components/garage/events/event-live-parts";
import { formatEventDate, formatEventTimeRange } from "@/lib/event-format";
import { GRAND_OPENING_SLUG, getPublishedEvent } from "@/lib/event-service";
import { getBusinessInfo } from "@/lib/garage-service";
import { getLandingHeroAsset } from "@/lib/site-assets";
import { waLink } from "@/lib/whatsapp-link";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.startsWith("https://")
  ? process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL.replace(/\/+$/, "")
  : "https://garagecoffee.id";
const PAGE_PATH = `/${GRAND_OPENING_SLUG}`;

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
      siteName: "GARAGE Coffee & Motor",
      images: [{ url: "/opengraph-image.jpg", alt: event.title }],
    },
    twitter: { card: "summary_large_image", title: event.title, description, images: ["/twitter-image.jpg"] },
  };
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-garage-line bg-garage-bg-2 p-4">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-garage-red-bright" />
      <div className="min-w-0">
        <dt className="text-xs font-bold uppercase tracking-[0.16em] text-garage-mute">{label}</dt>
        <dd className="mt-1 text-base font-semibold text-garage-fg">{children}</dd>
      </div>
    </div>
  );
}

const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-garage-red px-5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-garage-red-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garage-amber";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-garage-line-2 px-5 text-sm font-bold uppercase tracking-wide text-garage-fg transition hover:border-garage-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garage-amber";

export default async function GrandOpeningPage() {
  const [event, business, hero] = await Promise.all([
    getPublishedEvent(GRAND_OPENING_SLUG),
    getBusinessInfo().catch(() => null),
    getLandingHeroAsset().catch(() => null),
  ]);
  if (!event) notFound();

  const date = formatEventDate(event.startsAt, event.timezone);
  const time = formatEventTimeRange(event.startsAt, event.endsAt, event.timezone);
  const whatsappUrl = waLink(event.contactWhatsapp, `Halo Garage Coffee, saya mau tanya tentang ${event.title} (${date}).`);
  const about = event.about || business?.aboutText || business?.tagline || null;
  const pageUrl = `${SITE_URL}${PAGE_PATH}`;

  // Structured data Event: hanya fakta terkonfirmasi (tanpa harga/kapasitas/performer).
  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: pageUrl,
    location: {
      "@type": "Place",
      name: event.venueName,
      address: { "@type": "PostalAddress", streetAddress: event.address, addressCountry: "ID" },
    },
    organizer: { "@type": "Organization", name: "Garage Coffee", url: SITE_URL },
  };

  return (
    <main className="min-h-screen bg-garage-bg-0 text-garage-fg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-garage-line">
        {hero?.publicUrl ? (
          <Image
            src={hero.publicUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="-z-10 object-cover opacity-35"
          />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(10,10,12,0.55)_0%,rgba(10,10,12,0.92)_70%,#0a0a0c_100%)]" />
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-12 pt-8 sm:px-6 sm:pt-12">
          <Link href="/" className="inline-flex w-fit rounded-md bg-[#e9e9ec] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-garage-amber">
            <Image
              src="/garage-brand/logo-website.png"
              alt="Garage Coffee & Motor"
              width={180}
              height={57}
              className="h-10 w-auto object-contain"
              priority
            />
          </Link>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-garage-amber">Garage Coffee · Tebing Tinggi</p>
            <h1 data-testid="event-title" className="mt-3 text-4xl font-black uppercase leading-[1.05] sm:text-6xl">
              {event.title}
            </h1>
            {event.tagline ? <p className="mt-3 max-w-2xl text-lg text-garage-dim">{event.tagline}</p> : null}
          </div>
          <p data-testid="event-when" className="text-lg font-semibold text-garage-fg sm:text-xl">
            {date} · {time}
          </p>
          <EventCountdown startsAt={event.startsAt} endsAt={event.endsAt} />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a href={event.mapsUrl} target="_blank" rel="noopener noreferrer" data-testid="event-maps" className={primaryButton}>
              <MapPin aria-hidden className="size-4" /> Lihat Lokasi
            </a>
            {whatsappUrl ? (
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" data-testid="event-whatsapp" className={secondaryButton}>
                <MessageCircle aria-hidden className="size-4" /> Hubungi WhatsApp
              </a>
            ) : null}
            <EventShareButton url={pageUrl} title={event.title} text={`${event.title} — ${date}, ${time}`} />
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6">
        {/* Detail */}
        <section aria-labelledby="detail-title">
          <h2 id="detail-title" className="text-2xl font-black uppercase">Detail Acara</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoRow icon={CalendarDays} label="Tanggal">{date}</InfoRow>
            <InfoRow icon={Clock} label="Waktu">{time}</InfoRow>
            <InfoRow icon={MapPin} label="Lokasi">
              <span className="block">{event.venueName}</span>
              <span className="mt-1 block text-sm font-normal text-garage-dim">{event.address}</span>
            </InfoRow>
            {event.highlights.length ? (
              <InfoRow icon={Music} label="Hiburan">{event.highlights.join(" · ")}</InfoRow>
            ) : null}
          </dl>
        </section>

        {event.highlights.length ? (
          <section aria-labelledby="highlight-title">
            <h2 id="highlight-title" className="text-2xl font-black uppercase">Highlight</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {event.highlights.map((item) => (
                <li key={item} className="rounded-lg border border-garage-red/40 bg-[linear-gradient(120deg,#1d0d10,#16161b)] p-5 text-xl font-bold uppercase">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {about ? (
          <section aria-labelledby="about-title">
            <h2 id="about-title" className="text-2xl font-black uppercase">Tentang Garage Coffee</h2>
            <div className="mt-4 space-y-3 text-base leading-relaxed text-garage-dim">
              {about.split(/\n\s*\n/).map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
            </div>
          </section>
        ) : null}

        {event.gallery.length ? (
          <section aria-labelledby="gallery-title">
            <h2 id="gallery-title" className="text-2xl font-black uppercase">Galeri</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {event.gallery.map((image) => (
                <div key={image.src} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-garage-line">
                  <Image src={image.src} alt={image.alt} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {event.faq.length ? (
          <section aria-labelledby="faq-title">
            <h2 id="faq-title" className="text-2xl font-black uppercase">FAQ</h2>
            <div className="mt-4 space-y-2">
              {event.faq.map((item) => (
                <details key={item.q} className="rounded-lg border border-garage-line bg-garage-bg-2 p-4">
                  <summary className="cursor-pointer text-base font-bold">{item.q}</summary>
                  <p className="mt-2 text-base text-garage-dim">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {/* Lokasi & kontak */}
        <section aria-labelledby="location-title" className="rounded-xl border border-garage-line bg-garage-bg-1 p-5 sm:p-7">
          <h2 id="location-title" className="text-2xl font-black uppercase">Lokasi & Kontak</h2>
          <p className="mt-3 text-base text-garage-dim">{event.address}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <a href={event.mapsUrl} target="_blank" rel="noopener noreferrer" className={primaryButton}>
              <MapPin aria-hidden className="size-4" /> Buka Google Maps
            </a>
            {whatsappUrl ? (
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                <MessageCircle aria-hidden className="size-4" /> WhatsApp Garage
              </a>
            ) : null}
          </div>
        </section>

        <footer className="border-t border-garage-line pt-6 text-sm text-garage-mute">
          <Link href="/" className="underline-offset-4 hover:underline">← Kembali ke garagecoffee.id</Link>
        </footer>
      </div>
    </main>
  );
}
