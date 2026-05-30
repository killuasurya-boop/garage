import { ok } from "@/lib/api-response";
import { getCustomerAutoSegments } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number(rawLimit) : undefined;

  return ok(
    await getCustomerAutoSegments({
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  );
}
