import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL ?? "https://app.garagecoffee.id";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // Hanya halaman yang menghadap pelanggan. Modul operasional (control, pos,
  // dashboard, dst.) sengaja TIDAK diindeks.
  const routes: Array<{ path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1.0, freq: "daily" },
    { path: "/order", priority: 0.9, freq: "daily" },
    { path: "/franchise", priority: 0.7, freq: "weekly" },
    { path: "/member-login", priority: 0.5, freq: "monthly" },
  ];
  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
}
