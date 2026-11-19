import { NextResponse } from "next/server";

import { fetchPlatformJson, publicFinanceForSlug } from "@/lib/event-public-finance";
import { toPlatformFinance } from "@/lib/event-public-finance-rules";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /event/<slug>/api/public/config lewat Caddy (Owner 18 Nov 2026): konfigurasi platform apa adanya, kecuali `finance`
// (target, pos RAB, catatan) diganti angka transparansi Garage OS bila Owner mengaktifkannya.
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-config", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  const upstream = await fetchPlatformJson(slug, "public/config");
  if (!upstream) return NextResponse.json({ open: false }, { status: 502, headers });
  if (upstream.status !== 200 || !upstream.body || typeof upstream.body !== "object") return NextResponse.json(upstream.body ?? {}, { status: upstream.status, headers });
  const config = upstream.body as Record<string, unknown>;
  const finance = await publicFinanceForSlug(slug).catch(() => null);
  if (!finance) return NextResponse.json(config, { headers });
  const showVendorNames = (config.finance as Record<string, unknown> | undefined)?.showVendorNames ?? false;
  return NextResponse.json({ ...config, finance: toPlatformFinance(finance, showVendorNames) }, { headers });
}
