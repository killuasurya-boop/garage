import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createProfitMaxApproval } from "@/lib/profitmax-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  actionType: z.enum(["price_change", "promo_guard", "bundle_review", "overhead_review", "recipe_hpp"]),
  title: z.string().min(3).max(120),
  amount: z.string().min(1).max(120),
  reason: z.string().min(5).max(1200),
  risk: z.enum(["low", "medium", "high"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const session = await requirePermission("approvals:read");
  if (session.response) return session.response;

  const { data, error } = await readJson(request, actionSchema);
  if (error) return error;
  if (!data) return fail(400, "INVALID_PAYLOAD", "Payload action ProfitMax tidak valid");

  const approval = await createProfitMaxApproval(data, session.data);
  return ok(
    {
      approval,
      message: "Action ProfitMax masuk Approval Center.",
    },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
