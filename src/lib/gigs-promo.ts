// Promosi GARAGE EVENT PLATFORM (mis. GIGS AKHIR TAHUN 2026) di beranda.
// Sumber tunggal: platform event (stack Docker terpisah "garage-event") lewat jaringan internal.
// Tidak ada tanggal/teks yang ditulis di sini. Gagal/timeout -> null -> beranda tampil normal.

export type GigsPromo = {
  slug: string;
  name: string;
  tagline: string | null;
  venue: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  readiness: number | null;
  live: { name: string; performer: string } | null;
  url: string;
  logo: string | null;
  poster: string | null;
  links: { daftar: string | null; transparansi: string | null };
};

type PlatformEvent = {
  slug?: string;
  name?: string;
  tagline?: string;
  venue?: string;
  date?: string;
  endsAt?: string;
  status?: string;
  online?: boolean;
  readiness?: number | null;
  live?: { name?: string; performer?: string } | null;
  url?: string;
  logo?: string;
  poster?: string;
  links?: { daftar?: string; transparansi?: string };
};

const DEFAULT_API = "http://garage-event-platform:4400/event/api/events";
const FALLBACK_DURATION_MS = 6 * 60 * 60 * 1000;
// Hanya jalur relatif di bawah /event yang boleh dipakai sebagai tautan/gambar.
const safePath = (value: unknown) =>
  typeof value === "string" && /^\/event\/[A-Za-z0-9._~\-/]*$/.test(value) ? value : null;

export async function getGigsPromo(now = Date.now()): Promise<GigsPromo | null> {
  const api = process.env.GARAGE_EVENT_API || DEFAULT_API;
  const res = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(1500) });
  if (!res.ok) return null;
  const json = (await res.json()) as { events?: PlatformEvent[] };
  const events = Array.isArray(json?.events) ? json.events : [];

  for (const ev of events) {
    const start = Date.parse(ev.date ?? "");
    const url = safePath(ev.url);
    if (!ev.online || !ev.slug || !ev.name || !url || !Number.isFinite(start)) continue;
    const endParsed = Date.parse(ev.endsAt ?? "");
    const end = Number.isFinite(endParsed) && endParsed > start ? endParsed : start + FALLBACK_DURATION_MS;
    if (ev.status === "selesai" || now > end) continue;
    return {
      slug: ev.slug,
      name: ev.name,
      tagline: ev.tagline ?? null,
      venue: ev.venue ?? null,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      status: ev.status ?? "segera",
      readiness: typeof ev.readiness === "number" ? Math.max(0, Math.min(100, Math.round(ev.readiness))) : null,
      live: ev.live?.name ? { name: ev.live.name, performer: ev.live.performer ?? "" } : null,
      url,
      logo: safePath(ev.logo),
      poster: safePath(ev.poster),
      links: { daftar: safePath(ev.links?.daftar), transparansi: safePath(ev.links?.transparansi) },
    };
  }
  return null;
}
