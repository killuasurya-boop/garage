import { eventSitePage, proxyToPlatform } from "@/lib/event-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /event/** (Owner 19 Nov 2026, satu pintu): halaman publik event yang sudah disalin ke Garage OS disajikan dari sini;
// aset statisnya dari public/event/<slug>/; selain itu (Dashboard Penyelenggara, daftar event, admin platform)
// diteruskan ke platform GIGS apa adanya.
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: Ctx) {
  const url = new URL(request.url);
  const segments = (await context.params).path ?? [];
  if (request.method === "GET" || request.method === "HEAD") {
    const html = await eventSitePage(segments);
    if (html !== null) {
      return new Response(request.method === "HEAD" ? null : html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" },
      });
    }
  }
  return proxyToPlatform(request, url.pathname, url.search);
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
