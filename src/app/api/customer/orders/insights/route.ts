import { ok } from "@/lib/api-response";
import { getQrControlInsights } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter"]);
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);

  return ok(
    await getQrControlInsights({
      status: url.searchParams.get("status") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
      table: url.searchParams.get("table") ?? undefined,
    }),
  );
}
