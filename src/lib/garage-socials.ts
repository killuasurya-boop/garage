// Akun media sosial resmi Garage Coffee (sumber sama dengan website: garage-website.tsx SOCIAL_LINKS).
// Dipakai menu digital (sidebar/laci) — satu tempat, jangan ketik ulang link di komponen.
export type GarageSocialId = "instagram" | "tiktok" | "youtube" | "facebook";
export type GarageSocial = { id: GarageSocialId; label: string; handle: string; href: string };

export const GARAGE_SOCIALS: readonly GarageSocial[] = [
  { id: "instagram", label: "Instagram", handle: "@garage_tbt.id", href: "https://www.instagram.com/garage_tbt.id/" },
  { id: "tiktok", label: "TikTok", handle: "@garage_tbt.id", href: "https://www.tiktok.com/@garage_tbt.id" },
  { id: "youtube", label: "YouTube", handle: "@GarageId", href: "https://www.youtube.com/@GarageId" },
  { id: "facebook", label: "Facebook", handle: "garagetbt.id", href: "https://www.facebook.com/garagetbt.id/" },
];
