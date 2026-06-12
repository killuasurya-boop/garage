import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getBusinessInfo, saveBusinessInfo } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publik: landing memakai info bisnis (SEO/kontak). Tanpa data sensitif.
export async function GET() {
  return ok(await getBusinessInfo());
}

const businessInfoSchema = z.object({
  tagline: z.string().trim().max(160).optional(),
  whatsapp: z.string().trim().regex(/^\d{8,16}$/, "Nomor WhatsApp harus 8-16 digit angka (format 62…).").optional(),
  instagram: z.string().trim().max(60).optional(),
  email: z.string().trim().email().max(160).or(z.literal("")).optional(),
  address: z.string().trim().max(300).optional(),
  hoursOpen: z.string().trim().regex(/^\d{2}:\d{2}$/, "Format jam HH:MM.").optional(),
  hoursClose: z.string().trim().regex(/^\d{2}:\d{2}$/, "Format jam HH:MM.").optional(),
  mapsUrl: z.string().trim().url().max(500).or(z.literal("")).optional(),
  aboutText: z.string().trim().max(2000).optional(),
});

export async function PUT(request: Request) {
  const session = await requirePermission("website:manage");
  if (session.response) return session.response;

  const body = await readJson(request, businessInfoSchema);
  if (body.error) return body.error;

  try {
    const saved = await saveBusinessInfo(body.data, session.data.user.id);
    return ok(saved);
  } catch (error) {
    return fail(
      400,
      "BUSINESS_INFO_SAVE_FAILED",
      error instanceof Error ? error.message : "Info bisnis gagal disimpan.",
    );
  }
}
