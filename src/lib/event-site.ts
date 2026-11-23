// Halaman event GIGS disajikan Garage OS (satu pintu, Owner 19 Nov 2026).
//
// - Halaman publik (beranda event, /daftar, /transparansi) + asetnya = salinan resmi dari platform GIGS di
//   public/event/<slug>/ (HTML di _pages/). Data tetap diambil app.js dari API /event/<slug>/api/... yang dilayani
//   Garage OS (lineup, live, config, peserta, kesiapan, laporan akhir, riwayat perubahan, pendaftaran).
// - Dashboard Penyelenggara (/event/<slug>/penyelenggara) → Ruang Panitia (`organizerPageRedirect`, kecuali ?lama=1).
// - Semua yang belum dipindah (daftar event /event, /event/admin, API penyelenggara)
//   diteruskan apa adanya ke platform lewat jaringan internal — perilakunya sama seperti sebelum dipindah.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { platformEventsSnapshot } from "@/lib/event-platform-snapshot";

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

/**
 * Dashboard Penyelenggara lama → Ruang Panitia Garage OS (Owner 23 Nov 2026, satu pintu tahap akhir).
 * `/event/<slug>/penyelenggara` dialihkan ke `/panitia`. `?lama=1` masih membuka dashboard lama (hanya untuk login
 * impor data lama, sampai platform dimatikan). API penyelenggara tidak dialihkan (dipakai impor).
 */
export function organizerPageRedirect(segments: string[], search: URLSearchParams): string | null {
  if (segments.length !== 2 || !SLUG.test(segments[0]) || segments[1] !== "penyelenggara") return null;
  if (search.get("lama") === "1") return null;
  return "/panitia";
}

/** Halaman event tujuan `/event` saat platform mati: event online pertama di salinan yang halamannya ada di Garage OS. */
export function eventListFallback(): string | null {
  const snap = platformEventsSnapshot() as { events?: Array<{ slug?: unknown; online?: unknown }> } | null;
  const ev = (snap?.events ?? []).find((e) => e.online && typeof e.slug === "string" && SLUG.test(e.slug));
  return ev ? `/event/${ev.slug}` : null;
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

// Cookie milik Garage OS (sesi staf Better Auth, member, mitra, outlet aktif). Cookie lain = milik platform.
const GARAGE_COOKIE_PREFIXES = ["garage_active_outlet", "garage_member_", "garage_partner_"];

/** Buang cookie milik Garage OS dari header Cookie (hanya cookie platform yang diteruskan). */
export function platformCookies(header: string | null): string {
  if (!header) return "";
  return header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const name = part.split("=")[0]?.trim().toLowerCase() ?? "";
      return name && !name.includes("better-auth") && !GARAGE_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix));
    })
    .join("; ");
}

/** Teruskan permintaan /event/... ke platform GIGS (metode, header, isi, cookie) dan kembalikan balasannya apa adanya. */
export async function proxyToPlatform(request: Request, pathname: string, search: string): Promise<Response> {
  if (!pathname.startsWith("/event")) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  // Cookie sesi Garage OS (Better Auth, member, dll.) tidak pernah dikirim ke platform; cookie platform tetap.
  const cookie = platformCookies(request.headers.get("cookie"));
  if (cookie) headers.set("cookie", cookie);
  else headers.delete("cookie");
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
