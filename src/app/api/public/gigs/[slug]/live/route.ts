import { NextResponse } from "next/server";

import { publicStageForPlatform } from "@/lib/event-day-service";
import { fetchPlatformLineup } from "@/lib/gigs-promo";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SATU pintu (Owner 18 Nov 2026): banner "Sedang tampil / Berikutnya" halaman event platform (`/event/<slug>`) dari mode
// panggung Garage OS (`/event-day`), lewat Caddy. Bentuk = milik platform `{ current, since, next }`. Tanpa data Garage
// (tidak ada master/penampil) → data platform apa adanya. Hanya nama, jenis, jam.
const DEFAULT_API = "http://garage-event-platform:4400/event/api/events";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-live", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return NextResponse.json({ current: null, since: null, next: null }, { status: 404, headers });

  const platform = await fetchPlatformLineup({ slug, name: "" }).catch(() => null);
  const garage = await publicStageForPlatform({ slug, name: platform?.name ?? "" }).catch((error) => {
    console.error("[public/gigs/live] garage", error instanceof Error ? error.message : "gagal");
    return null;
  });
  if (garage) return NextResponse.json(garage, { headers });

  const api = process.env.GARAGE_EVENT_API || DEFAULT_API;
  try {
    if (!/\/api\/events\/?$/.test(api)) throw new Error("alamat platform");
    const res = await fetch(api.replace(/\/api\/events\/?$/, `/${slug}/api/public/live`), { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`platform ${res.status}`);
    return NextResponse.json(await res.json(), { headers });
  } catch (error) {
    console.error("[public/gigs/live] platform", error instanceof Error ? error.message : "gagal");
    return NextResponse.json({ current: null, since: null, next: null }, { headers });
  }
}
