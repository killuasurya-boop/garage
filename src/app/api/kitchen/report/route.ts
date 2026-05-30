import { ok } from "@/lib/api-response";
import { getKitchenShiftReport } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("kitchen:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  return ok(
    await getKitchenShiftReport({
      date: url.searchParams.get("date") ?? undefined,
      garage: session.data,
    }),
  );
}
