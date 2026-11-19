import { NextResponse } from "next/server";

import { fetchPlatformJson, publicFinanceForSlug } from "@/lib/event-public-finance";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Change = { id: number; area: string; summary: string; reason: string; at: string };

// /event/<slug>/api/public/changes lewat Caddy (Owner 19 Nov 2026): riwayat perubahan target & pos RAB.
// Transparansi Garage aktif → riwayat platform (lama) + riwayat Garage OS (nomor lanjut). Selain itu → platform apa adanya.
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-changes", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  const upstream = await fetchPlatformJson(slug, "public/changes");
  const platformChanges: Change[] =
    upstream?.status === 200 && Array.isArray((upstream.body as { changes?: unknown })?.changes) ? ((upstream.body as { changes: Change[] }).changes ?? []) : [];
  const finance = await publicFinanceForSlug(slug).catch(() => null);
  if (!finance) return NextResponse.json(upstream?.body ?? { changes: [] }, { status: upstream ? 200 : 502, headers });
  const offset = platformChanges.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0);
  const garage = finance.changes.map((c, i) => ({ id: offset + i + 1, area: c.area, summary: c.summary, reason: c.reason, at: c.at }));
  return NextResponse.json({ changes: [...platformChanges, ...garage] }, { headers });
}
