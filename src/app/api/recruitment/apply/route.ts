import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { checkDuplicateCandidate, createCandidate } from "@/lib/garage-recruitment-service";
import {
  HTTPS_URL,
  RECRUITMENT_FILE_URL,
  RECRUITMENT_WHATSAPP_GROUP_URL,
} from "@/lib/garage-recruitment-data";
import { listOpenPositions } from "@/lib/garage-recruitment-positions-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const recruitmentWhatsappGroupUrl = RECRUITMENT_WHATSAPP_GROUP_URL;

// Dokumen wajib berasal dari upload resmi; tautan sosmed/portfolio wajib https.
const fileUrl = (message: string) =>
  z.string().trim().max(500).regex(RECRUITMENT_FILE_URL, message);
const optionalFileUrl = (message: string) => fileUrl(message).optional().or(z.literal(""));
// Sosmed boleh @username / domain tanpa skema / http(s); skema lain (javascript:,
// data:, dll) ditolak supaya tidak bisa jadi tautan berbahaya di layar admin.
const optionalSocial = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !/^[a-z][a-z0-9+.-]*:/i.test(v) || /^https?:\/\//i.test(v), "Tautan harus http(s):// atau @username.")
  .optional()
  .or(z.literal(""));

function isDatabaseReadinessError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /PGlite|ensureDatabaseReady|database|DB_|Aborted/i.test(error.message);
}

const applySchema = z.object({
  fullName: z.string().trim().min(2, "Nama lengkap wajib diisi.").max(120),
  whatsapp: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{8,20}$/, "Nomor WhatsApp tidak valid.")
    .max(20),
  email: z.string().trim().email("Format email tidak valid.").max(160),
  domicile: z.string().trim().min(2, "Domisili wajib diisi.").max(160),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  gender: z.enum(["Laki-laki", "Perempuan"]).optional().or(z.literal("")),
  appliedPosition: z.string().trim().min(2, "Posisi wajib dipilih.").max(80),
  preferredLocation: z.string().trim().max(160).optional().or(z.literal("")),
  workType: z.enum(["Full-time", "Part-time", "Freelance"]).optional().or(z.literal("")),
  availableStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  willingShift: z.boolean().optional(),
  willingRelocate: z.boolean().optional(),
  education: z.string().trim().min(2, "Pendidikan terakhir wajib diisi.").max(120),
  lastExperience: z.string().trim().min(2, "Pengalaman kerja wajib diisi.").max(2000),
  experienceDuration: z.string().trim().max(80).optional().or(z.literal("")),
  previousCompany: z.string().trim().max(160).optional().or(z.literal("")),
  resignReason: z.string().trim().max(2000).optional().or(z.literal("")),
  mainSkill: z.string().trim().min(2, "Skill wajib diisi.").max(2000),
  skillLevel: z.enum(["Pemula", "Menengah", "Mahir", "Berpengalaman"], {
    message: "Level skill wajib dipilih.",
  }),
  strength: z.string().trim().max(2000).optional().or(z.literal("")),
  weakness: z.string().trim().max(2000).optional().or(z.literal("")),
  motivation: z.string().trim().max(2000).optional().or(z.literal("")),
  customerExperience: z.string().trim().max(2000).optional().or(z.literal("")),
  expectedSalary: z.number().int().min(0).max(100_000_000).optional().nullable(),
  interviewAvailability: z.string().trim().max(160).optional().or(z.literal("")),
  cvUrl: fileUrl("CV wajib diupload lewat form."),
  photoUrl: fileUrl("Pas foto wajib diupload lewat form."),
  ktpUrl: optionalFileUrl("File KTP tidak valid — upload ulang."),
  certificateUrl: optionalFileUrl("File sertifikat tidak valid — upload ulang."),
  // Portfolio boleh file upload ATAU tautan https.
  portfolioUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => !v || RECRUITMENT_FILE_URL.test(v) || HTTPS_URL.test(v) || /^http:\/\/[^\s"'<>]{3,480}$/i.test(v),
      "Portfolio harus file upload atau tautan http(s)://",
    )
    .optional(),
  instagramUrl: optionalSocial,
  tiktokUrl: optionalSocial,
  linkedinUrl: optionalSocial,
  socialMediaUrl: z
    .string()
    .trim()
    .max(1500)
    .refine(
      (v) => v.split("|").every((part) => !/^[a-z][a-z0-9+.-]*:/i.test(part.trim()) || /^https?:\/\//i.test(part.trim())),
      "Tautan sosial media tidak valid.",
    )
    .optional()
    .or(z.literal("")),
  // Sumber pelamar — dari mana tahu lowongan
  referralSource: z.enum([
    "Instagram",
    "TikTok",
    "Facebook",
    "Teman / Kenalan",
    "Poster di Outlet",
    "Website GARAGE",
    "Job Portal",
    "Lainnya",
  ]).optional().or(z.literal("")),
  consent: z.literal(true, { message: "Persetujuan data wajib dicentang." }),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "recruitment-apply", { limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readJson(request, applySchema);
  if (body.error) return body.error;

  try {
    const { consent: _consent, ...data } = body.data;
    void _consent;

    // Posisi harus salah satu lowongan yang sedang dibuka.
    const openPositions = await listOpenPositions();
    if (!openPositions.length) {
      return fail(400, "RECRUITMENT_CLOSED", "Saat ini belum ada lowongan yang dibuka. Pantau info lowongan GARAGE berikutnya.");
    }
    if (!openPositions.some((position) => position.title.toLowerCase() === data.appliedPosition.toLowerCase())) {
      return fail(400, "RECRUITMENT_POSITION_CLOSED", "Posisi ini sedang tidak dibuka. Pilih posisi lain.");
    }

    // Cek duplikat: WA/email + posisi sama dalam 30 hari terakhir
    const duplicate = await checkDuplicateCandidate(
      data.whatsapp,
      data.email,
      data.appliedPosition,
    );
    if (duplicate) {
      // Pesan netral: tanpa tanggal/status, supaya form ini tidak bisa dipakai mengintip lamaran orang lain
      // (status hanya lewat Cek Status dengan WA + email).
      return fail(
        409,
        "DUPLICATE_APPLICATION",
        `Lamaran untuk posisi ${data.appliedPosition} dengan nomor WhatsApp atau email ini sudah kami terima. Cek progresnya lewat menu Cek Status Lamaran (nomor WhatsApp + email).`,
      );
    }

    const created = await createCandidate(data);
    return ok(
      {
        id: created.id,
        whatsappGroupUrl: recruitmentWhatsappGroupUrl,
        message:
          "Terima kasih! Lamaran kamu sudah kami terima. Wajib gabung grup WhatsApp recruitment GARAGE untuk informasi proses seleksi, jadwal, dan pengumuman berikutnya.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to submit recruitment application", error);
    if (isDatabaseReadinessError(error)) {
      return fail(
        503,
        "RECRUITMENT_DATABASE_NOT_READY",
        "Sistem recruitment sedang menyiapkan database. Coba kirim ulang beberapa saat lagi.",
      );
    }

    return fail(
      500,
      "RECRUITMENT_APPLY_FAILED",
      "Lamaran belum bisa dikirim. Coba lagi atau hubungi admin GARAGE.",
    );
  }
}
