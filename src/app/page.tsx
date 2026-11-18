import type { Metadata } from "next";
import { GarageWebsite } from "@/components/garage-website/garage-website";
import { getAtmosphereAssets, getLandingHeroAsset } from "@/lib/site-assets";
import { getBusinessInfo } from "@/lib/garage-service";
import { getHomeFeaturedEvent } from "@/lib/event-service";
import { getGigsPromo } from "@/lib/gigs-promo";
import { mergeLineup, withPlatformSlots } from "@/lib/gigs-lineup";
import { publicLineupFor } from "@/lib/event-lineup-service";
import { publicSponsorsFor } from "@/lib/event-sponsor-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Garage Coffee Tebing Tinggi | Cafe & Coffee Shop, Buka 15.00–23.00",
  description:
    "Garage Coffee Tebing Tinggi — cafe & coffee shop di Jl. Mayjen Sutoyo, Tebing Tinggi. Buka setiap hari 15.00–23.00 WIB. Kopi, non-coffee, makanan & cemilan; cek meja kosong, pesan menu digital, takeaway, dan reservasi via WhatsApp.",
  keywords: [
    "Garage Coffee Tebing Tinggi",
    "Garage Coffee",
    "cafe Tebing Tinggi",
    "coffee shop Tebing Tinggi",
    "tempat ngopi Tebing Tinggi",
    "tempat nongkrong Tebing Tinggi",
    "kafe terdekat Tebing Tinggi",
    "menu Garage Coffee",
    "reservasi cafe Tebing Tinggi",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Garage Coffee Tebing Tinggi",
    description:
      "Cafe & coffee shop di Tebing Tinggi. Buka setiap hari 15.00–23.00 WIB. Cek meja kosong, pesan dari website, dan reservasi via WhatsApp.",
    type: "website",
    locale: "id_ID",
    siteName: "Garage Coffee Tebing Tinggi",
  },
  twitter: {
    card: "summary_large_image",
    title: "Garage Coffee Tebing Tinggi",
    description: "Cafe & coffee shop di Tebing Tinggi. Buka setiap hari 15.00–23.00 WIB. Menu digital, takeaway, reservasi via WhatsApp.",
  },
};

export default async function Home() {
  const [landingHero, businessInfo, featuredEvent, gigsPromo, atmosphere] = await Promise.all([
    getLandingHeroAsset().catch(() => null),
    getBusinessInfo().catch(() => null),
    getHomeFeaturedEvent().catch(() => null),
    getGigsPromo().catch(() => null),
    getAtmosphereAssets().catch(() => []),
  ]);

  // Lineup GIGS: penampil terkonfirmasi dari modul Lineup & Panitia (Garage OS) menggantikan daftar platform event,
  // ditambah slot panggung dari dashboard panitia platform (otomatis).
  // Sponsor yang dicentang "tampil di website" di modul Sponsor (nama/logo/tautan saja, tanpa nilai uang).
  const gigsRef = gigsPromo ? { slug: gigsPromo.slug, name: gigsPromo.name } : null;
  const [garageLineup, partners] = gigsRef
    ? await Promise.all([publicLineupFor(gigsRef).catch(() => []), publicSponsorsFor(gigsRef).catch(() => [])])
    : [[], []];
  // Slot panggung yang ditambah panitia di dashboard platform ikut otomatis (tanpa dobel nama yang sudah ada).
  const gigs = gigsPromo
    ? (() => {
        const { slots, ...promo } = gigsPromo.promo;
        return { ...gigsPromo, partners, promo: { ...promo, lineup: withPlatformSlots(mergeLineup(promo.lineup, garageLineup), slots) } };
      })()
    : null;

  // Hero hanya butuh tanda "ada foto hero"; teks alt lama (brand "Coffee & Motor") tidak dikirim ke klien.
  const hero = landingHero ? { ...landingHero, alt: "Garage Coffee Tebing Tinggi" } : null;
  return <GarageWebsite landingHero={hero} businessInfo={businessInfo} featuredEvent={featuredEvent} gigsPromo={gigs}
    atmosphere={atmosphere.map((a) => ({ url: a.publicUrl, width: a.width, height: a.height, alt: a.alt }))} />;
}
