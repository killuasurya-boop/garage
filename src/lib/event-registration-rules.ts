// Pendaftaran GIGS di Garage OS (Owner 18 Nov 2026, satu pintu). Aturan murni: validasi isian form halaman event
// platform (daftar.js), kode edit, dan bentuk "entry" yang dibaca form itu. Tanpa DB.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { CREW_ROLES, type CrewRole } from "@/lib/event-lineup-rules";
import { parseInstagramHandle, parseLineupKind, type LineupKind } from "@/lib/gigs-lineup";

export type RegistrationType = "creator" | "sponsor" | "crew";
export type RegistrationStatus = "diajukan" | "revisi" | "disetujui" | "ditolak";

export const SPONSOR_CATEGORIES = ["kuliner", "fashion", "jasa-kreatif", "teknologi", "komunitas", "lainnya"] as const;
export const CREATOR_CATEGORIES = ["band", "komika", "akustik", "kreator", "komunitas", "lainnya"] as const;
export const CREW_ATTENDANCE = ["persiapan", "hari-h-penuh", "hari-h-sore"] as const;

export const REGISTRATION_TYPE_LABEL: Record<RegistrationType, string> = { creator: "Kreator", sponsor: "Sponsor", crew: "Kru" };
export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  diajukan: "Menunggu tinjauan",
  revisi: "Perlu revisi",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
};

/** "08…", "+62…", "62…" → "62…" (bentuk yang dikirim balik ke form platform). Salah → Error berbahasa Indonesia. */
export function normalizeRegistrationWhatsapp(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  const local = digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
  if (!/^08\d{7,13}$/.test(local)) throw new Error("Nomor WhatsApp tidak valid. Contoh: 081234567890.");
  return `62${local.slice(1)}`;
}

const text = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter.`);
const optional = (max: number) => text(max).optional().default("");

const base = {
  name: text(120).min(2, "Nama wajib diisi."),
  pic: text(120).min(2, "Nama penanggung jawab wajib diisi."),
  whatsapp: z.string().trim().min(8, "Nomor WhatsApp wajib diisi.").max(24),
  instagram: optional(60),
  description: optional(600),
  consent: z.literal(true, { message: "Centang persetujuan data sebelum mengirim." }),
  // Logo base64 (PNG/JPG/WebP ≤2 MB di form; base64 ≈ 4/3 ukuran asli).
  logo: z.string().max(2_900_000, "Logo maksimal 2 MB.").optional(),
};

export const registrationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sponsor"),
    ...base,
    category: z.enum(SPONSOR_CATEGORIES, { message: "Pilih kategori sponsor." }),
    address: optional(200),
    amount: z.number({ message: "Isi nilai dukungan." }).int("Nilai dukungan harus rupiah bulat.").min(1, "Isi nilai dukungan.").max(1_000_000_000),
  }),
  z.object({
    type: z.literal("creator"),
    ...base,
    category: z.enum(CREATOR_CATEGORIES, { message: "Pilih kategori kreator." }),
    members: z.number().int().min(1, "Jumlah personel minimal 1.").max(100).optional(),
    portfolio: optional(500).refine((v) => v === "" || /^https?:\/\/[^\s"'<>]+$/.test(v), "Tautan portofolio harus diawali https://"),
    tech: optional(300),
    diet: optional(200),
  }),
  z.object({
    type: z.literal("crew"),
    ...base,
    role: text(80).min(2, "Isi bidang yang ingin dibantu."),
    members: z.number().int().min(1).max(100).optional(),
    attendance: z.enum(CREW_ATTENDANCE, { message: "Pilih waktu hadir." }),
    diet: optional(200),
  }),
]);
export type RegistrationInput = z.infer<typeof registrationSchema>;

export const setlistSchema = z
  .array(
    z.object({
      title: text(120).min(1, "Judul lagu wajib diisi."),
      writer: optional(120),
      kind: z.enum(["original", "cover"]).default("cover"),
    }),
  )
  .max(40, "Maksimal 40 lagu.");

/** Isian form yang sudah dirapikan (WA → 62…, Instagram → akun tanpa @). Salah → Error. */
export function cleanRegistration(input: RegistrationInput) {
  let instagram: string | null;
  try {
    instagram = parseInstagramHandle(input.instagram);
  } catch {
    throw new Error("Akun Instagram tidak valid. Contoh: @garagecoffee.");
  }
  return { ...input, whatsapp: normalizeRegistrationWhatsapp(input.whatsapp), instagram };
}

// ─── Kode edit: 12 karakter hex besar (format yang dikenali form platform), disimpan hanya sebagai HMAC ──────────

export function newRegistrationCode() {
  return randomBytes(6).toString("hex").toUpperCase();
}

export function registrationCodeHash(secret: string, id: string, code: string) {
  return createHmac("sha256", secret).update(`gigs-registration:${id}:${code.trim().toUpperCase()}`).digest("hex");
}

export function registrationCodeMatches(secret: string, id: string, code: string, hash: string) {
  if (!/^[0-9A-F]{12}$/i.test(code.trim())) return false;
  const a = Buffer.from(registrationCodeHash(secret, id, code), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── Pemetaan saat Owner menyetujui ─────────────────────────────────────────

/** Kategori kreator di form → jenis penampil Lineup (komunitas/lainnya → kreator). */
export function creatorKind(category: string | null | undefined): LineupKind {
  return parseLineupKind(category) ?? "kreator";
}

const CREW_KEYWORDS: Array<[RegExp, CrewRole]> = [
  [/keamanan|security|satpam/i, "keamanan"],
  [/dokumentasi|foto|video|kamera/i, "dokumentasi"],
  [/konsumsi|makan/i, "konsumsi"],
  [/sound|audio|operator/i, "sound"],
  [/stage|panggung/i, "stage"],
  [/tiket|ticket|pintu|registrasi/i, "tiket"],
  [/humas|media|publikasi|sosmed/i, "humas"],
  [/\blo\b|liaison|pendamping/i, "lo"],
  [/lineup|talent/i, "lineup"],
];

/** Bidang kru (teks bebas) → peran panitia; tidak dikenal → "lainnya" (teks asli masuk tugas). */
export function crewRoleFor(text: string | null | undefined): CrewRole {
  const found = CREW_KEYWORDS.find(([pattern]) => pattern.test(text ?? ""));
  return found && (CREW_ROLES as readonly string[]).includes(found[1]) ? found[1] : "lainnya";
}

// ─── Bentuk "entry" untuk form platform (lookup/update/register) ───────────

export type RegistrationRowLike = {
  type: string;
  status: string;
  name: string;
  pic: string;
  whatsapp: string;
  instagram: string | null;
  description: string | null;
  consent: boolean;
  category: string | null;
  address: string | null;
  amount: number | null;
  members: number | null;
  role: string | null;
  attendance: string | null;
  portfolio: string | null;
  tech: string | null;
  diet: string | null;
  reviewNote: string | null;
  setlist: Array<{ title: string; writer: string; kind: "original" | "cover" }>;
};

export function registrationEntry(
  row: RegistrationRowLike,
  extra: { published: boolean; slot: { name: string; startTime: string; durationMin: number } | null },
) {
  return {
    type: row.type,
    status: row.status,
    published: extra.published,
    name: row.name,
    pic: row.pic,
    whatsapp: row.whatsapp,
    instagram: row.instagram ?? "",
    description: row.description ?? "",
    consent: row.consent,
    category: row.category ?? "",
    address: row.address ?? "",
    amount: row.amount ?? 0,
    members: row.members ?? 0,
    role: row.role ?? "",
    attendance: row.attendance ?? "",
    portfolio: row.portfolio ?? "",
    tech: row.tech ?? "",
    diet: row.diet ?? "",
    reviewNote: row.reviewNote ?? "",
    slot: extra.slot,
    setlist: row.setlist ?? [],
    benefits: [],
    report: null,
  };
}

/** Pesan Zod pertama (untuk { error } yang ditampilkan form platform). */
export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Isian belum lengkap.";
}
