import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getTestimonials, saveTestimonials } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publik: landing tampilkan testimoni. Owner isi review asli dari modul Website.
export async function GET() {
  return ok(await getTestimonials());
}

const testimonialsSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().max(80),
        role: z.string().trim().max(80),
        text: z.string().trim().min(1).max(600),
        rating: z.number().int().min(1).max(5),
      }),
    )
    .max(20),
});

export async function PUT(request: Request) {
  const session = await requirePermission("website:manage");
  if (session.response) return session.response;

  const body = await readJson(request, testimonialsSchema);
  if (body.error) return body.error;

  try {
    const saved = await saveTestimonials(body.data.items, session.data.user.id);
    return ok(saved);
  } catch (error) {
    return fail(
      400,
      "TESTIMONIALS_SAVE_FAILED",
      error instanceof Error ? error.message : "Testimoni gagal disimpan.",
    );
  }
}
