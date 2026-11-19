import { NextResponse } from "next/server";

import { garageParticipants, masterEventForSlug } from "@/lib/event-public-extras";
import { mergeParticipants } from "@/lib/event-public-extras-rules";
import { fetchPlatformJson } from "@/lib/event-public-finance";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /event/<slug>/api/public/participants lewat Caddy (Owner 19 Nov 2026): sponsor tampil website (Sponsor Event) + kreator
// dari Pendaftar yang disetujui, digabung data platform lama (nama sama tidak dobel). Tanpa kontak/nominal per sponsor.
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-participants", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  const upstream = await fetchPlatformJson(slug, "public/participants");
  const platform = upstream?.status === 200 && upstream.body && typeof upstream.body === "object" ? (upstream.body as Record<string, unknown>) : null;
  const event = await masterEventForSlug(slug).catch(() => null);
  if (!event) return NextResponse.json(platform ?? { sponsors: [], creators: [] }, { status: platform ? 200 : 502, headers });
  const garage = await garageParticipants(event.id);
  return NextResponse.json(mergeParticipants(platform, garage), { headers });
}
