import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { updateMarketingPromoStatus } from "@/lib/garage-marketing-service";
import { requirePermission } from "@/lib/server-auth";
import { VOUCHER_RETIRED_CODE, VOUCHER_RETIRED_MESSAGE, VOUCHERS_RETIRED } from "@/lib/voucher-policy";

export const runtime = "nodejs";

const updateSchema = z.object({
  status: z.enum(["active", "draft", "paused", "expired"]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requirePermission("marketing:write");
  if (session.response) return session.response;
  void session;

  const body = await readJson(request, updateSchema);
  if (body.error) return body.error;
  // Menjeda/mengakhiri boleh; mengaktifkan lagi tidak (voucher dimatikan Owner 25 Nov 2026).
  if (VOUCHERS_RETIRED && body.data.status === "active") return fail(410, VOUCHER_RETIRED_CODE, VOUCHER_RETIRED_MESSAGE);

  const { id } = await context.params;
  const updated = await updateMarketingPromoStatus(id, body.data.status);
  if (!updated) return fail(404, "NOT_FOUND", "Promo tidak ditemukan.");
  return ok(updated);
}
