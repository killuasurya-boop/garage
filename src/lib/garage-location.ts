// Data lokasi resmi GARAGE dari listing Google Maps (sumber kebenaran tunggal).
// Aman diimpor dari komponen client (tanpa dependensi server).
// Listing: https://maps.app.goo.gl/gg6dNkzvCKa8tBxQ7

const LAT = 3.3245647;
const LNG = 99.1673998;
const NAME = "GARAGE Coffee Tebing Tinggi";
// ID profil bisnis Google. Link berbasis koordinat hanya membuka pin tanpa profil,
// jadi semua link memakai Place ID / CID agar pelanggan mendarat di profil bisnis.
const PLACE_ID = "ChIJyTZkuJdhMTARXRNhb207Zwg";
const CID = "605518016110728029";

export const GARAGE_LOCATION = {
  name: NAME,
  lat: LAT,
  lng: LNG,
  placeId: PLACE_ID,
  cid: CID,
  address: "Jl. Mayjen Sutoyo, Rambung, Kec. Tebing Tinggi Kota, Kota Tebing Tinggi, Sumatera Utara 20631",
  plusCode: "85F8+RX Rambung, Kota Tebing Tinggi",
  phone: "6285121552341",
  phoneDisplay: "0851-2155-2341",
  /** Profil bisnis Google (foto, ulasan, jam, tombol rute). */
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(NAME)}&query_place_id=${PLACE_ID}`,
  shortUrl: "https://maps.app.goo.gl/gg6dNkzvCKa8tBxQ7",
  /** Navigasi dengan tujuan = profil bisnis (bukan pin koordinat). */
  directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(NAME)}&destination_place_id=${PLACE_ID}`,
  /** Form ulasan bintang langsung (pelanggan perlu login Google). */
  reviewUrl: `https://search.google.com/local/writereview?placeid=${PLACE_ID}`,
  /** Embed peta dengan kartu bisnis (nama, rating, tombol rute). Gratis, tanpa API key. */
  embedUrl: `https://maps.google.com/maps?cid=${CID}&output=embed`,
  // Rating Google Maps per 2026-09-28 = nilai AWAL saja. Website memakai rating dari Pengaturan Website
  // (businessInfo.googleRating/googleReviewCount, Owner 24 Nov 2026); ubah di sana, bukan di sini.
  rating: 5.0,
  reviewCount: 14,
} as const;

/** "Buka 24 Jam" bila 00:00–23:59/24:00 atau jam buka == jam tutup; selain itu "HH:MM — HH:MM". */
export function isOpen24h(open: string, close: string): boolean {
  return open === close || (open === "00:00" && (close === "23:59" || close === "24:00"));
}

/** "6285121552341" → "0851-2155-2341" (format lokal, dikelompokkan 4 digit). */
export function formatIdPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
}

export function formatBusinessHours(open: string, close: string): string {
  return isOpen24h(open, close) ? "Buka 24 Jam" : `${open.replace(":", ".")}–${close.replace(":", ".")} WIB`;
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Status buka/tutup saat ini menurut jam WIB (Asia/Jakarta) — untuk pill navbar
 * & CTA website. Mendukung jam lewat tengah malam (mis. 16:00–02:00).
 */
export function openStatus(
  open: string,
  close: string,
  now: Date = new Date(),
): { isOpen: boolean; label: string } {
  if (isOpen24h(open, close)) return { isOpen: true, label: "BUKA 24 JAM" };
  const start = toMinutes(open);
  const end = toMinutes(close);
  if (start == null || end == null) return { isOpen: true, label: `${open}–${close}` };
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const current =
    Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 +
    Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const isOpen = start < end ? current >= start && current < end : current >= start || current < end;
  return isOpen
    ? { isOpen: true, label: `BUKA · TUTUP ${close}` }
    : { isOpen: false, label: `TUTUP · BUKA ${open}` };
}
