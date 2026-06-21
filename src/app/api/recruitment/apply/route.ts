import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createCandidate } from "@/lib/garage-recruitment-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const recruitmentWhatsappGroupUrl = "https://chat.whatsapp.com/HQ6hItzXVgULWHVwlw7mDd";

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
  availableStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  willingShift: z.boolean().optional(),
  willingRelocate: z.boolean().optional(),
  education: z.string().trim().max(120).optional().or(z.literal("")),
  lastExperience: z.string().trim().max(2000).optional().or(z.literal("")),
  experienceDuration: z.string().trim().max(80).optional().or(z.literal("")),
  previousCompany: z.string().trim().max(160).optional().or(z.literal("")),
  resignReason: z.string().trim().max(2000).optional().or(z.literal("")),
  mainSkill: z.string().trim().max(2000).optional().or(z.literal("")),
  strength: z.string().trim().max(2000).optional().or(z.literal("")),
  weakness: z.string().trim().max(2000).optional().or(z.literal("")),
  motivation: z.string().trim().max(2000).optional().or(z.literal("")),
  customerExperience: z.string().trim().max(2000).optional().or(z.literal("")),
  expectedSalary: z.number().int().min(0).max(100_000_000).optional().nullable(),
  interviewAvailability: z.string().trim().max(160).optional().or(z.literal("")),
  cvUrl: z.string().trim().max(500).optional().or(z.literal("")),
  photoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  portfolioUrl: z.string().trim().max(500).optional().or(z.literal("")),
  socialMediaUrl: z.string().trim().max(500).optional().or(z.literal("")),
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
    return fail(
      400,
      "RECRUITMENT_APPLY_FAILED",
      error instanceof Error ? error.message : "Lamaran gagal dikirim.",
    );
  }
}
