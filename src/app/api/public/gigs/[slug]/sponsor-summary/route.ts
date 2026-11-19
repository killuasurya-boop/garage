import { NextResponse } from "next/server";

import { fetchPlatformJson, publicFinanceForSlug } from "@/lib/event-public-finance";
import { toPlatformSummary } from "@/lib/event-public-finance-rules";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /event/<slug>/api/sponsor/summary lewat Caddy (Owner 18 Nov 2026): angka transparansi Garage OS bila Owner
// mengaktifkannya; selain itu data platform apa adanya. Hanya data publik (tanpa bukti/rekening/kontak).
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-sponsor-summary", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  const finance = await publicFinanceForSlug(slug).catch(() => null);
  if (finance) return NextResponse.json(toPlatformSummary(finance), { headers });
  const upstream = await fetchPlatformJson(slug, "sponsor/summary");
  if (!upstream) return NextResponse.json(null, { status: 502, headers });
  return NextResponse.json(upstream.body, { status: upstream.status, headers });
}
