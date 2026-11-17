import { and, asc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { events } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daftar event publik untuk website: HANYA event terbit dari master event (tabel `events`).
// Tidak ada data contoh/palsu (GIGS EO Fase 1, item 4): tanpa event terbit → daftar kosong.
export async function GET() {
  try {
    const rows = await getDb()
      .select({
        slug: events.slug,
        title: events.title,
        tagline: events.tagline,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        venueName: events.venueName,
      })
      .from(events)
      .where(and(eq(events.status, "published"), gte(events.endsAt, new Date())))
      .orderBy(asc(events.startsAt))
      .limit(12);
    return NextResponse.json(
      {
        events: rows.map((r) => ({
          slug: r.slug,
          title: r.title,
          tagline: r.tagline,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
          venueName: r.venueName,
        })),
        source: "db",
      },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch {
    // Database tidak terjangkau: daftar kosong (bukan contoh palsu).
    return NextResponse.json({ events: [], source: "unavailable" }, { status: 503 });
  }
}
