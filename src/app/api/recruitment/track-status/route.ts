import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { ensureDatabaseReady } from "@/db";
import { candidates } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const trackStatusSchema = z.object({
  whatsapp: z.string().min(8).max(20),
});

export async function POST(request: Request) {
  // Rate limit: 10 request per menit per IP — cegah brute-force enumerasi
  const limited = rateLimit(request, "recruitment-track-status", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await readJson(request, trackStatusSchema);
    if (body.error) return body.error;

    const db = await ensureDatabaseReady();
    
    // Cari kandidat berdasarkan whatsapp, ambil yang terbaru (desc createdAt)
    const records = await db
      .select({
        id: candidates.id,
        fullName: candidates.fullName,
        status: candidates.status,
        appliedPosition: candidates.appliedPosition,
        createdAt: candidates.createdAt,
        interviewDate: candidates.interviewDate,
        interviewLink: candidates.interviewLink,
      })
      .from(candidates)
      .where(eq(candidates.whatsapp, body.data.whatsapp))
      .orderBy(desc(candidates.createdAt))
      .limit(1);

    if (records.length === 0) {
      return fail(
        404,
        "RECRUITMENT_APPLICATION_NOT_FOUND",
        "Data lamaran tidak ditemukan. Pastikan nomor WhatsApp sesuai dengan yang didaftarkan.",
      );
    }

    // Hanya return field yang boleh diakses publik (tanpa score, dll)
    return ok({ application: records[0] });
    
  } catch (err) {
    console.error("Failed to track recruitment status", err);
    return fail(500, "RECRUITMENT_TRACK_STATUS_FAILED", "Gagal mengambil status lamaran.");
  }
}
