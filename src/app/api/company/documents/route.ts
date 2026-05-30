import { fail, ok, readJson } from "@/lib/api-response";
import {
  createCompanyDocument,
  createCompanyDocumentSchema,
  getCompanyDocuments,
} from "@/lib/company-control";
import { canManageCompanyControl } from "@/lib/company-control";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("company:read");
  if (session.response) {
    return session.response;
  }

  return ok(await getCompanyDocuments(session.data.profile.role));
}

export async function POST(request: Request) {
  const session = await requirePermission("company:manage");
  if (session.response) {
    return session.response;
  }

  if (!canManageCompanyControl(session.data.profile.role)) {
    return fail(403, "FORBIDDEN", "Role ini tidak bisa mengelola arsip perusahaan.");
  }

  const body = await readJson(request, createCompanyDocumentSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await createCompanyDocument(body.data, session.data), { status: 201 });
}
