import { NextResponse } from "next/server";

import { publicLineupFor } from "@/lib/event-lineup-service";
import { enrichSlotsForEventPage, lineupKey } from "@/lib/gigs-lineup";
import { fetchPlatformLineup, fetchRawPlatformSlots } from "@/lib/gigs-promo";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Halaman event platform GIGS (`/event/<slug>`) meminta `/event/<slug>/api/public/lineup`; Caddy meneruskannya ke sini
// (Owner 18 Nov 2026). Slot yang ditambah panitia langsung tampil di halaman event dengan nama resmi & logo Garage OS.
// Respons SENGAJA memakai bentuk platform `{ slots: [...] }` (dibaca app.js platform), bukan `{ data }`.
// Hanya data publik: nama/jenis/jam/logo slot. Platform gagal → { slots: [] } → halaman event memakai lineup bawaannya.
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-lineup", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return NextResponse.json({ slots: [] }, { status: 404, headers });
  let raw: unknown[];
  try {
    raw = await fetchRawPlatformSlots(slug, 3000);
  } catch (error) {
    console.error("[public/gigs/lineup] platform", error instanceof Error ? error.message : "gagal");
    return NextResponse.json({ slots: [] }, { status: 502, headers });
  }
  // Logo: unggahan Owner di Garage OS dulu, lalu logo promo platform (nama sama). Gagal → tanpa logo tambahan.
  const logoByKey = new Map<string, string>();
  try {
    const platform = await fetchPlatformLineup({ slug, name: "" });
    const garage = platform ? await publicLineupFor({ slug, name: platform.name }) : [];
    for (const item of [...(platform?.lineup ?? []), ...garage]) {
      if (item.logo) logoByKey.set(lineupKey(item.name), item.logo);
    }
  } catch (error) {
    console.error("[public/gigs/lineup] logo", error instanceof Error ? error.message : "gagal");
  }
  return NextResponse.json({ slots: enrichSlotsForEventPage(raw, logoByKey) }, { headers });
}
