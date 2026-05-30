import type { Metadata } from "next";
import { GarageWebsite } from "@/components/garage-website/garage-website";
import { getLandingHeroAsset } from "@/lib/site-assets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Garage Coffee & Motor",
  description:
    "Kopi premium dengan jiwa otomotif. Bengkel yang menyamar jadi coffee shop dengan budaya komunitas motor.",
};

export default async function Home() {
  const landingHero = await getLandingHeroAsset().catch(() => null);

  return <GarageWebsite landingHero={landingHero} />;
}
