import { memberRuleForLevel, normalizeMemberLevel, type MemberLevel } from "@/lib/member-types";

// Satu sumber data kartu member: komponen layar (PremiumMembershipCard),
// gambar PNG/JPG (membership-card-image.ts) dan PDF (membership-card-pdf.ts).
// Tidak ada data karangan: kode asli, tanggal asli, benefit dari aturan poin.

export const CARD_BRAND_LINE = "COFFEE · TEBING TINGGI";
export const CARD_WEBSITE = "garagecoffee.id";

export const CARD_TIER_LABEL: Record<MemberLevel, string> = {
  Silver: "SILVER",
  Gold: "GOLD",
  Platinum: "PLATINUM",
  Ultra: "ULTRA",
};

export function cardTier(tier: string | null | undefined): MemberLevel {
  return normalizeMemberLevel(tier ?? "Silver");
}

/** Kode member apa adanya (uppercase, spasi dirapikan) — tanpa padding nol palsu. */
export function formatMemberCode(code: string | null | undefined) {
  const value = (code ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  return value || "—";
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null;
  // Hanya tanggal ISO: teks bebas seperti "12/28" diparse JS jadi tahun 2001.
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}/.test(value.trim())) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"];

/** "OKT 2027" (zona Asia/Jakarta) atau null bila tidak ada/invalid. */
export function formatCardDate(value: string | Date | null | undefined) {
  const date = toDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = Number(parts.find((p) => p.type === "month")?.value);
  if (!year || !month) return null;
  return `${MONTHS[month - 1]} ${year}`;
}

/** Masa berlaku kartu. Tanggal "member sejak" TIDAK dipakai sebagai masa berlaku. */
export function cardValidity(input: { validThru?: string | Date | null; expiresAt?: string | Date | null }) {
  const raw = input.validThru ?? input.expiresAt ?? null;
  const formatted = formatCardDate(raw);
  if (formatted) return { label: "BERLAKU S/D", value: formatted };
  // validThru bisa berupa teks bebas lama (mis. "12/28").
  if (typeof raw === "string" && raw.trim()) return { label: "BERLAKU S/D", value: raw.trim().toUpperCase() };
  return { label: "BERLAKU", value: "TANPA BATAS" };
}

export function cardMemberSince(value: string | Date | null | undefined) {
  return formatCardDate(value);
}

function formatMultiplier(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace(/\.0$/, "")}x`;
}

/** Benefit tier dari memberLevelRules (sumber yang sama dengan perhitungan poin). */
export function cardPerks(tier: string) {
  const rule = memberRuleForLevel(tier);
  const multiplier = `Poin ${formatMultiplier(rule.multiplier)}`;
  // Baris poin diganti multiplier dari aturan; syarat kelayakan ("Eligible …") bukan benefit.
  const rest = rule.perks.filter((perk) => !/^(point|earn|eligible)\b/i.test(perk.trim()));
  return { multiplier: rule.multiplier, perks: [multiplier, ...rest] };
}

/** Payload QR yang dibaca scanner kasir — format tetap { v:1, id, tier, n }. */
export function memberQrPayload(input: { memberCode: string; tier: string; name: string }) {
  return JSON.stringify({ v: 1, id: input.memberCode, tier: cardTier(input.tier), n: input.name });
}

export function memberInitials(name: string | null | undefined) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "GM";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** Teks opsional (alamat/kontak): kosong → null, tidak ada placeholder palsu. */
export function optionalCardText(value: string | null | undefined, max = 80) {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
