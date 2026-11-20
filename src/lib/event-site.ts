// Halaman event GIGS disajikan Garage OS (satu pintu, Owner 19 Nov 2026).
//
// - Halaman publik (beranda event, /daftar, /transparansi) + asetnya = salinan resmi dari platform GIGS di
//   public/event/<slug>/ (HTML di _pages/). Data tetap diambil app.js dari API /event/<slug>/api/... yang dilayani
//   Garage OS (lineup, live, config, peserta, kesiapan, laporan akhir, riwayat perubahan, pendaftaran).
// - Semua yang belum dipindah (Dashboard Penyelenggara, daftar event /event, /event/admin, API penyelenggara)
//   diteruskan apa adanya ke platform lewat jaringan internal — perilakunya sama seperti sebelum dipindah.

import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_API = "http://garage-event-platform:4400/event/api/events";
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const PAGES: Record<string, string> = { "": "index.html", daftar: "daftar.html", transparansi: "transparansi.html" };

export function eventSiteDir(slug: string) {
  return path.join(process.cwd(), "public", "event", slug);
}

/** HTML halaman publik event bila salinannya ada di Garage OS; selain itu null (→ platform). */
export async function eventSitePage(segments: string[]): Promise<string | null> {
  if (segments.length < 1 || segments.length > 2) return null;
  const [slug, page = ""] = segments;
  if (!SLUG.test(slug) || !(page in PAGES)) return null;
  return readFile(path.join(eventSiteDir(slug), "_pages", PAGES[page]), "utf8").catch(() => null);
}

/** app.js asli dari salinan Garage OS (null bila event ini belum disalin). */
export async function eventSiteAppJs(slug: string): Promise<string | null> {
  if (!SLUG.test(slug)) return null;
  return readFile(path.join(eventSiteDir(slug), "public", "app.js"), "utf8").catch(() => null);
}

/** http://garage-event-platform:4400 (dari GARAGE_EVENT_API). */
export function platformOrigin() {
  const api = process.env.GARAGE_EVENT_API || DEFAULT_API;
  try {
    return new URL(api).origin;
  } catch {
    return new URL(DEFAULT_API).origin;
  }
}

const HOP_HEADERS = new Set(["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "content-length"]);
const DROP_RESPONSE = new Set(["connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length", "set-cookie"]);

/** Teruskan permintaan /event/... ke platform GIGS (metode, header, isi, cookie) dan kembalikan balasannya apa adanya. */
export async function proxyToPlatform(request: Request, pathname: string, search: string): Promise<Response> {
  if (!pathname.startsWith("/event")) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("x-forwarded-host", request.headers.get("host") ?? "");
  headers.set("x-forwarded-proto", "https");
  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  try {
    const upstream = await fetch(`${platformOrigin()}${pathname}${search}`, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const out = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!DROP_RESPONSE.has(key.toLowerCase())) out.set(key, value);
    });
    for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
    return new Response(method === "HEAD" ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  } catch (error) {
    console.error("[event-site] platform tidak terjangkau:", error instanceof Error ? error.message : "gagal");
    return new Response("Halaman event sedang tidak tersedia. Coba lagi sebentar.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
