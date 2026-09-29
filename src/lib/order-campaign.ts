// Sumber order dari link /order (bio Instagram/TikTok, iklan, QR, website).
// `campaign` eksplisit selalu menang; bila kosong, dibentuk dari `src` atau
// `utm_source` (+ `utm_campaign`) supaya link seperti `/order?src=ig` atau
// `?utm_source=tiktok&utm_campaign=promo_senin` tetap terlacak di laporan.
// Aman dipakai di server & client (tanpa dependensi).

const MAX_EXPLICIT = 80;
const MAX_DERIVED = 40;

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function resolveOrderCampaign(
  get: (key: string) => string | null | undefined,
): string | undefined {
  const explicit = get("campaign")?.trim();
  if (explicit) return explicit.slice(0, MAX_EXPLICIT);

  const source = normalizeToken(get("src") ?? get("utm_source") ?? "");
  if (!source) return undefined;
  const utmCampaign = normalizeToken(get("utm_campaign") ?? "");
  const derived = utmCampaign ? `${source}_${utmCampaign}` : source;
  return derived.slice(0, MAX_DERIVED) || undefined;
}
