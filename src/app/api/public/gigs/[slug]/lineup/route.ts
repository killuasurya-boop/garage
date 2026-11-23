import { platformJsonSnapshot } from "@/lib/event-platform-snapshot";
import { NextResponse } from "next/server";

import { publicLineupFor } from "@/lib/event-lineup-service";
import { enrichSlotsForEventPage, garageLineupAsEventSlots, lineupKey } from "@/lib/gigs-lineup";
import { fetchPlatformLineup, fetchRawPlatformSlots } from "@/lib/gigs-promo";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SATU pintu lineup GIGS (Owner 18 Nov 2026): halaman event platform (`/event/<slug>`) meminta
// `/event/<slug>/api/public/lineup`; Caddy meneruskannya ke sini. Sumber = Lineup & Panitia Garage OS (sama dengan
// beranda). Lineup Garage kosong → slot dashboard platform (diperkaya nama resmi & logo) sebagai cadangan.
// Respons SENGAJA berbentuk platform `{ slots: [...] }` (dibaca app.js platform), bukan `{ data }`. Hanya data publik:
// nama, jenis, jam, logo, tagline. Semua gagal → { slots: [] } → halaman event memakai lineup bawaannya.
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-lineup", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return NextResponse.json({ slots: [] }, { status: 404, headers });

  // Logo promo platform (nama sama) melengkapi kartu yang belum punya logo di Garage OS.
  const platform = await fetchPlatformLineup({ slug, name: "" }).catch(() => null);
  const logoByKey = new Map<string, string>();
  for (const item of platform?.lineup ?? []) if (item.logo) logoByKey.set(lineupKey(item.name), item.logo);

  const garage = await publicLineupFor({ slug, name: platform?.name ?? "" }).catch((error) => {
    console.error("[public/gigs/lineup] garage", error instanceof Error ? error.message : "gagal");
    return [];
  });
  if (garage.length) return NextResponse.json({ slots: garageLineupAsEventSlots(garage, logoByKey) }, { headers });

  try {
    return NextResponse.json({ slots: enrichSlotsForEventPage(await fetchRawPlatformSlots(slug, 3000), logoByKey) }, { headers });
  } catch (error) {
    // Platform mati (dimatikan 23 Nov 2026) → salinan slot publik terakhir (sudah berisi nama resmi & logo Garage).
    const snap = platformJsonSnapshot(slug, "public/lineup") as { slots?: unknown[] } | undefined;
    if (Array.isArray(snap?.slots)) return NextResponse.json({ slots: snap.slots }, { headers });
    console.error("[public/gigs/lineup] platform", error instanceof Error ? error.message : "gagal");
    return NextResponse.json({ slots: [] }, { status: 502, headers });
  }
}
