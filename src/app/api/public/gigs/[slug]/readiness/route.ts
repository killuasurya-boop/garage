import { NextResponse } from "next/server";

import { garageReadiness, masterEventForSlug } from "@/lib/event-public-extras";
import { fetchPlatformJson } from "@/lib/event-public-finance";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /event/<slug>/api/public/readiness lewat Caddy (Owner 19 Nov 2026): kesiapan dari data nyata Garage (checklist Hari-H,
// transparansi aktif, lineup, panitia, kewajiban sponsor). Keputusan GO/NO GO tetap dari platform. Tanpa master → platform.
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-readiness", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  const upstream = await fetchPlatformJson(slug, "public/readiness");
  const platform = upstream?.status === 200 && upstream.body && typeof upstream.body === "object" ? (upstream.body as Record<string, unknown>) : null;
  const event = await masterEventForSlug(slug).catch(() => null);
  if (!event) return NextResponse.json(platform ?? {}, { status: platform ? 200 : 502, headers });
  return NextResponse.json(await garageReadiness(event, platform?.decision ?? null), { headers });
}
