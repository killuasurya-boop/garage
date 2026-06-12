import type { Metadata } from "next";
import { GarageWebsite } from "@/components/garage-website/garage-website";
import { getLandingHeroAsset } from "@/lib/site-assets";
import { getBusinessInfo } from "@/lib/garage-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE Coffee & Motor Tebing Tinggi | Cafe, Menu Digital & Reservasi",
  description:
    "GARAGE Coffee & Motor Tebing Tinggi. Tempat ngopi, makan, nongkrong, dan kumpul komunitas. Cek kursi kosong, pesan menu digital, pickup takeaway, dan reservasi via WhatsApp.",
  keywords: [
    "cafe Tebing Tinggi",
    "coffee shop Tebing Tinggi",
    "Garage Coffee & Motor",
    "menu GARAGE Tebing Tinggi",
    "reservasi cafe Tebing Tinggi",
    "tempat ngopi Tebing Tinggi",
    "cafe motor Tebing Tinggi",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "GARAGE Coffee & Motor Tebing Tinggi",
    description:
      "Ngopi, makan, nongkrong, dan kumpul komunitas di GARAGE. Cek tempat sebelum datang, pesan dari website, dan reservasi via WhatsApp.",
    type: "website",
    locale: "id_ID",
    siteName: "GARAGE Coffee & Motor",
  },
  twitter: {
    card: "summary_large_image",
    title: "GARAGE Coffee & Motor Tebing Tinggi",
    description:
      "Cek tempat sebelum datang, lihat menu digital, pesan takeaway, dan reservasi via WhatsApp.",
  },
};

export default async function Home() {
  const [landingHero, businessInfo] = await Promise.all([
    getLandingHeroAsset().catch(() => null),
    getBusinessInfo().catch(() => null),
  ]);

  return <GarageWebsite landingHero={landingHero} businessInfo={businessInfo} />;
}
