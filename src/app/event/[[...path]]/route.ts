import { eventListFallback, eventSitePage, organizerPageRedirect, proxyToPlatform } from "@/lib/event-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /event/** (Owner 19 Nov 2026, satu pintu): halaman publik event yang sudah disalin ke Garage OS disajikan dari sini;
// aset statisnya dari public/event/<slug>/; Dashboard Penyelenggara → /panitia (kecuali ?lama=1); selain itu (daftar
// event, admin platform, API penyelenggara)
// diteruskan ke platform GIGS apa adanya.
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: Ctx) {
  const url = new URL(request.url);
  const segments = (await context.params).path ?? [];
  if (request.method === "GET" || request.method === "HEAD") {
    const target = organizerPageRedirect(segments, url.searchParams);
    if (target) return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
    const html = await eventSitePage(segments);
    if (html !== null) {
      return new Response(request.method === "HEAD" ? null : html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" },
      });
    }
  }
  const res = await proxyToPlatform(request, url.pathname, url.search);
  // Daftar event /event (menu "Event" beranda) saat platform mati → event aktif dari salinan Garage OS.
  if (res.status === 502 && segments.length === 0 && (request.method === "GET" || request.method === "HEAD")) {
    const target = eventListFallback();
    if (target) return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
  }
  return res;
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
