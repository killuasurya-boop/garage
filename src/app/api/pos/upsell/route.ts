import { ok, fail } from "@/lib/api-response";
import { getUpsellSuggestions } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const menuItemId = url.searchParams.get("menuItemId");
  if (!menuItemId) {
    return fail(400, "MISSING_PARAM", "menuItemId wajib diisi.");
  }
  const rawDays = url.searchParams.get("days");
  const windowDays = rawDays ? Number(rawDays) : undefined;
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number(rawLimit) : undefined;

  return ok(
    await getUpsellSuggestions({
      menuItemId,
      windowDays: Number.isFinite(windowDays) ? windowDays : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  );
}
