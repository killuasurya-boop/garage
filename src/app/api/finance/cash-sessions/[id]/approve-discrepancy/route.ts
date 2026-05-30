import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { approveCashSessionDiscrepancy } from "@/lib/garage-service";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const approveSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAnyPermission(["finance:write", "approvals:decide"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, approveSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  try {
    const cashSession = await approveCashSessionDiscrepancy(
      id,
      session.data,
      body.data.note,
    );
    if (!cashSession) {
      return fail(404, "CASH_SESSION_NOT_FOUND", "Cash session tidak ditemukan.");
    }

    return ok(cashSession);
  } catch (error) {
    return fail(
      409,
      "CASH_SESSION_APPROVAL_FAILED",
      error instanceof Error ? error.message : "Approval selisih kas gagal.",
    );
  }
}
