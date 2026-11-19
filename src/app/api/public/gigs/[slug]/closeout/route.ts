import { NextResponse } from "next/server";

import { garageCloseout, masterEventForSlug } from "@/lib/event-public-extras";
import { fetchPlatformJson } from "@/lib/event-public-finance";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /event/<slug>/api/public/closeout lewat Caddy (Owner 19 Nov 2026): laporan akhir yang diterbitkan Owner di Garage
// (Transparansi). Belum diterbitkan di Garage → laporan platform (bila ada).
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-closeout", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  const event = await masterEventForSlug(slug).catch(() => null);
  const closeout = event ? await garageCloseout(event) : null;
  if (closeout) return NextResponse.json({ closeout }, { headers });
  const upstream = await fetchPlatformJson(slug, "public/closeout");
  return NextResponse.json(upstream?.status === 200 ? upstream.body : { closeout: null }, { headers });
}
