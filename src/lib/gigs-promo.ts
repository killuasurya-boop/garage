// Promosi GARAGE EVENT PLATFORM (mis. GIGS AKHIR TAHUN 2026) di beranda.
// Sumber tunggal: platform event (stack Docker terpisah "garage-event") lewat jaringan internal.
// Tidak ada tanggal/teks/lineup yang ditulis di sini. Gagal/timeout -> null -> beranda tampil normal.
import { parseLineupKind, type LineupItem } from "@/lib/gigs-lineup";

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
  promo: {
    headline: string | null;
    pitch: string | null;
    programs: string[];
    lineup: LineupItem[];
    instagram: string | null;
  };
  sponsorMin: number | null;
  fundTarget: number | null;
  fundPercent: number | null;
  counts: { sponsors: number; creators: number } | null;
  links: {
    daftar: string | null;
    daftarSponsor: string | null;
    daftarKreator: string | null;
    transparansi: string | null;
  };
};

type PlatformEvent = {
  slug?: string;
  name?: string;
  tagline?: string;
  venue?: string;
  date?: string;
  endsAt?: string | null;
  status?: string;
  online?: boolean;
  readiness?: number | null;
  live?: { name?: string; performer?: string } | null;
  url?: string;
  logo?: string;
  poster?: string;
  promo?: {
    headline?: string;
    pitch?: string;
    programs?: unknown[];
    lineup?: Array<{ name?: string; logo?: string; type?: string; kind?: string; category?: string }>;
    instagram?: string;
  };
  sponsorMin?: number | null;
  fundTarget?: number | null;
  fundPercent?: number | null;
  counts?: { sponsors?: number; creators?: number } | null;
  links?: { daftar?: string; daftarSponsor?: string; daftarKreator?: string; transparansi?: string };
};

const DEFAULT_API = "http://garage-event-platform:4400/event/api/events";
const FALLBACK_DURATION_MS = 6 * 60 * 60 * 1000;
// Hanya jalur relatif di bawah /event yang boleh dipakai sebagai tautan/gambar (opsional ?tipe=...).
const safePath = (value: unknown) =>
  typeof value === "string" && /^\/event\/[A-Za-z0-9._~\-/]*(\?tipe=[a-z]+)?$/.test(value) ? value : null;
const text = (value: unknown, max = 400) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

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
    const promo = ev.promo ?? {};
    const pct = num(ev.fundPercent);
    return {
      slug: ev.slug,
      name: ev.name,
      tagline: text(ev.tagline),
      venue: text(ev.venue, 120),
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      status: ev.status ?? "segera",
      readiness: num(ev.readiness) === null ? null : Math.max(0, Math.min(100, Math.round(ev.readiness as number))),
      live: ev.live?.name ? { name: ev.live.name, performer: ev.live.performer ?? "" } : null,
      url,
      logo: safePath(ev.logo),
      poster: safePath(ev.poster),
      promo: {
        headline: text(promo.headline, 160),
        pitch: text(promo.pitch, 600),
        programs: (Array.isArray(promo.programs) ? promo.programs : [])
          .map((p) => text(p, 40))
          .filter((p): p is string => Boolean(p))
          .slice(0, 8),
        lineup: (Array.isArray(promo.lineup) ? promo.lineup : [])
          .map((x) => ({
            name: text(x?.name, 40) ?? "",
            logo: safePath(x?.logo),
            kind: parseLineupKind(x?.type ?? x?.kind ?? x?.category),
          }))
          .filter((x) => x.name)
          .slice(0, 16),
        instagram:
          typeof promo.instagram === "string" && /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._/]+$/.test(promo.instagram)
            ? promo.instagram
            : null,
      },
      sponsorMin: num(ev.sponsorMin),
      fundTarget: num(ev.fundTarget),
      fundPercent: pct === null ? null : Math.max(0, Math.min(100, pct)),
      counts: ev.counts ? { sponsors: num(ev.counts.sponsors) ?? 0, creators: num(ev.counts.creators) ?? 0 } : null,
      links: {
        daftar: safePath(ev.links?.daftar),
        daftarSponsor: safePath(ev.links?.daftarSponsor) ?? safePath(ev.links?.daftar),
        daftarKreator: safePath(ev.links?.daftarKreator) ?? safePath(ev.links?.daftar),
        transparansi: safePath(ev.links?.transparansi),
      },
    };
  }
  return null;
}
