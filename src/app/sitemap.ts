import type { MetadataRoute } from "next";

import { GRAND_OPENING_SLUG, getPublishedEvent } from "@/lib/event-service";

// Dibaca per request (status event bisa berubah) — build tidak butuh DB.
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL ?? "https://garagecoffee.id";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  // Hanya halaman yang menghadap pelanggan. Modul operasional (control, pos,
  // dashboard, dst.) sengaja TIDAK diindeks.
  const routes: Array<{ path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1.0, freq: "daily" },
    { path: "/order", priority: 0.9, freq: "daily" },
    { path: "/franchise", priority: 0.7, freq: "weekly" },
    { path: "/member-login", priority: 0.5, freq: "monthly" },
  ];
  // Landing event hanya dicantumkan saat Terbit (Draft = 404).
  const grandOpening = await getPublishedEvent(GRAND_OPENING_SLUG).catch(() => null);
  if (grandOpening) routes.splice(2, 0, { path: `/${GRAND_OPENING_SLUG}`, priority: 0.9, freq: "daily" });
  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
}
