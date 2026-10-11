import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { ensureDatabaseReady } from "@/db";
import { candidates } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { normalizeApplicantPhone } from "@/lib/garage-recruitment-data";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Cek status lamaran publik: WAJIB nomor WhatsApp + email yang dipakai saat
// melamar (2 faktor) — nomor saja tidak cukup untuk melihat data pelamar.
const trackStatusSchema = z.object({
  whatsapp: z.string().trim().min(8).max(20),
  email: z.string().trim().email("Format email tidak valid.").max(160),
});

const NOT_FOUND_MESSAGE =
  "Data lamaran tidak ditemukan. Pastikan nomor WhatsApp & email sama dengan yang dipakai saat melamar.";

export async function POST(request: Request) {
  // Rate limit: 10 request per menit per IP — cegah brute-force enumerasi
  const limited = rateLimit(request, "recruitment-track-status", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await readJson(request, trackStatusSchema);
    if (body.error) return body.error;

    const db = await ensureDatabaseReady();
    const phone = normalizeApplicantPhone(body.data.whatsapp);
    const rows = await db
      .select({
        id: candidates.id,
        fullName: candidates.fullName,
        whatsapp: candidates.whatsapp,
        status: candidates.status,
        appliedPosition: candidates.appliedPosition,
        createdAt: candidates.createdAt,
        interviewDate: candidates.interviewDate,
        interviewLink: candidates.interviewLink,
      })
      .from(candidates)
      .where(eq(sql`lower(${candidates.email})`, body.data.email.toLowerCase()))
      .orderBy(desc(candidates.createdAt))
      .limit(20);
    const match = rows.find((row) => normalizeApplicantPhone(row.whatsapp) === phone);
    if (!match) return fail(404, "RECRUITMENT_APPLICATION_NOT_FOUND", NOT_FOUND_MESSAGE);

    // Hanya field yang boleh diakses publik (tanpa nomor, score, catatan, dll).
    const { whatsapp: _whatsapp, ...application } = match;
    void _whatsapp;
    return ok({ application });
  } catch (err) {
    console.error("Failed to track recruitment status", err);
    return fail(500, "RECRUITMENT_TRACK_STATUS_FAILED", "Gagal mengambil status lamaran.");
  }
}
