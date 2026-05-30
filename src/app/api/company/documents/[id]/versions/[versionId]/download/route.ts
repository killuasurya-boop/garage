import { readFile } from "node:fs/promises";
import path from "node:path";

import { fail } from "@/lib/api-response";
import { getCompanyDocumentVersionForDownload } from "@/lib/company-control";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const session = await requirePermission("company:read");
  if (session.response) {
    return session.response;
  }

  const resolvedParams = await params;
  const file = await getCompanyDocumentVersionForDownload(
    resolvedParams.id,
    resolvedParams.versionId,
    session.data.profile.role,
  );

  if (!file) {
    return fail(404, "DOCUMENT_VERSION_NOT_FOUND", "File dokumen tidak ditemukan.");
  }

  let data: Buffer;
  try {
    data = await readFile(file.path);
  } catch {
    return fail(404, "DOCUMENT_FILE_MISSING", "File arsip belum tersedia di storage.");
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `attachment; filename="${path.basename(file.fileName).replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
