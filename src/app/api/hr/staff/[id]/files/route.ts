import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { ProfileFileError, saveProfileFile } from "@/lib/profile-file-storage";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";
import {
  STAFF_DOC_KINDS,
  StaffProfileError,
  assertStaffAccessById,
  attachStaffDocument,
  removeStaffDocument,
} from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kindSchema = z.enum(STAFF_DOC_KINDS);

function staffError(error: unknown, fallback: string) {
  if (error instanceof StaffProfileError || error instanceof ProfileFileError) {
    return fail(error.status, error.code, error.message);
  }
  console.error(fallback, error);
  return fail(500, "STAFF_FILE_FAILED", fallback);
}

// Unggah dokumen karyawan (multipart: file, kind, label?). Foto = gambar saja.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "staff-files", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_STAFF_ID", "ID karyawan tidak valid.");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART", "Kirim file sebagai multipart/form-data (field file).");
  }
  const kind = kindSchema.safeParse(formData.get("kind"));
  if (!kind.success) return fail(400, "INVALID_KIND", "Jenis dokumen tidak valid.");
  const labelRaw = formData.get("label");
  const label = typeof labelRaw === "string" ? labelRaw.trim().slice(0, 60) : null;

  try {
    // Cek hak akses dulu — jangan sampai file yatim tersimpan.
    await assertStaffAccessById(id, session.data);
    if (kind.data === "ktp" && session.data.profile.role !== "Owner") {
      return fail(403, "OWNER_ONLY_FIELD", "File KTP hanya bisa diunggah Owner.");
    }
    const fileName = await saveProfileFile("staff", id, formData.get("file"), { allowPdf: kind.data !== "photo" });
    const url = `/api/hr/staff/${id}/files/${fileName}`;
    return ok(await attachStaffDocument(id, kind.data, url, label, session.data), { status: 201 });
  } catch (error) {
    return staffError(error, "Dokumen gagal disimpan. Coba lagi.");
  }
}

const removeSchema = z.object({ kind: kindSchema, url: z.string().max(300).nullable().optional() });

// Lepas dokumen dari profil (file tetap tersimpan sebagai arsip).
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_STAFF_ID", "ID karyawan tidak valid.");
  const body = await readJson(request, removeSchema);
  if (body.error) return body.error;
  try {
    return ok(await removeStaffDocument(id, body.data.kind, body.data.url ?? null, session.data));
  } catch (error) {
    return staffError(error, "Dokumen gagal dihapus.");
  }
}
