import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { ProfileFileError, saveProfileFile } from "@/lib/profile-file-storage";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unggah foto member dari CRM (multipart field "file"; JPG/PNG/WEBP, maks 5 MB).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "member-photo", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_CUSTOMER_ID", "ID member tidak valid.");

  const db = getDb();
  const [customer] = await db
    .select({ id: customers.id, name: customers.name, cardTier: customers.cardTier })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!customer) return fail(404, "CUSTOMER_NOT_FOUND", "Member tidak ditemukan.");
  if (customer.cardTier === "Ultra" && session.data.profile.role !== "Owner") {
    return fail(403, "ULTRA_MEMBER_OWNER_ONLY", "Member tier Ultra hanya bisa diedit oleh Owner.");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART", "Kirim foto sebagai multipart/form-data (field file).");
  }
  try {
    const fileName = await saveProfileFile("member", id, formData.get("file"), { allowPdf: false });
    const photoUrl = `/api/crm/customers/${id}/photo/${fileName}`;
    await db.update(customers).set({ photoUrl, updatedAt: new Date() }).where(eq(customers.id, id));
    await createAuditLog({
      actor: `${session.data.user.name} / ${session.data.profile.role}`,
      action: "CRM: foto member diunggah",
      object: customer.name,
      device: session.data.profile.deviceLabel ?? "OS",
      metadata: { customerId: id },
    }).catch(() => undefined);
    return ok({ photoUrl }, { status: 201 });
  } catch (error) {
    if (error instanceof ProfileFileError) return fail(error.status, error.code, error.message);
    console.error("Member photo upload failed", error);
    return fail(500, "MEMBER_PHOTO_FAILED", "Foto gagal disimpan. Coba lagi.");
  }
}
