import { patchGigsAppJs } from "@/lib/gigs-event-page-patch";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// app.js halaman event platform GIGS dengan koreksi kecil (`patchGigsAppJs`), lewat Caddy (Owner 18 Nov 2026).
// Isi = file asli platform (jaringan internal); koreksi yang jangkarnya tidak cocok dilewati. Cache memori 60 detik.
const DEFAULT_API = "http://garage-event-platform:4400/event/api/events";
const cache = new Map<string, { at: number; code: string }>();

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-app-js", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const api = process.env.GARAGE_EVENT_API || DEFAULT_API;
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) || !/\/api\/events\/?$/.test(api)) return new Response("Not found", { status: 404 });
  const headers = { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" };

  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < 60_000) return new Response(hit.code, { headers });
  try {
    const res = await fetch(api.replace(/\/api\/events\/?$/, `/${slug}/public/app.js`), { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return new Response("Platform tidak tersedia", { status: res.status === 404 ? 404 : 502 });
    const { code, applied, skipped } = patchGigsAppJs(await res.text());
    if (skipped.length) console.warn("[public/gigs/app-js] koreksi dilewati (file platform berubah?)", { slug, applied, skipped });
    cache.set(slug, { at: Date.now(), code });
    return new Response(code, { headers });
  } catch (error) {
    console.error("[public/gigs/app-js]", error instanceof Error ? error.message : "gagal");
    return new Response("Platform tidak tersedia", { status: 502 });
  }
}
