import { ok } from "@/lib/api-response";
import { getCompanyOrgRoles } from "@/lib/company-control";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("company:read");
  if (session.response) {
    return session.response;
  }

  return ok(await getCompanyOrgRoles());
}
