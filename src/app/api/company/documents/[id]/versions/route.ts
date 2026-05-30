import { fail, ok } from "@/lib/api-response";
import {
  acceptedCompanyDocumentSummary,
  canManageCompanyControl,
  getCompanyDocumentVersions,
  saveCompanyDocumentVersion,
} from "@/lib/company-control";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

function normalizeNotes(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 500) : "";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("company:read");
  if (session.response) {
    return session.response;
  }

  const versions = await getCompanyDocumentVersions((await params).id, session.data.profile.role);
  if (!versions) {
    return fail(404, "DOCUMENT_NOT_FOUND", "Dokumen tidak ditemukan.");
  }

  return ok(versions);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("company:manage");
  if (session.response) {
    return session.response;
  }

  if (!canManageCompanyControl(session.data.profile.role)) {
    return fail(403, "FORBIDDEN", "Role ini tidak bisa mengupload versi dokumen.");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART_FORM", "Request harus multipart/form-data.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail(400, "DOCUMENT_FILE_MISSING", "File dokumen wajib diupload.");
  }

  try {
    const version = await saveCompanyDocumentVersion({
      documentId: (await params).id,
      fileName: file.name,
      mimeType: file.type || acceptedCompanyDocumentSummary().mimeTypes[0],
      sizeBytes: file.size,
      data: Buffer.from(await file.arrayBuffer()),
      notes: normalizeNotes(formData.get("notes")),
      garage: session.data,
    });

    return ok(version, { status: 201 });
  } catch (error) {
    return fail(
      400,
      "DOCUMENT_UPLOAD_FAILED",
      error instanceof Error ? error.message : "Dokumen gagal diupload.",
    );
  }
}
