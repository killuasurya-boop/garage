import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { closeCashSession } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const closeSchema = z.object({
  actualCash: z.number().int().nonnegative(),
  denominations: z.record(z.string(), z.number().int().nonnegative()).optional(),
  checklist: z.array(z.object({ label: z.string().trim().min(1), done: z.boolean() })).optional(),
  closingNote: z.string().trim().max(500).optional(),
  managerSignOff: z.boolean().optional(),
  resetTableMode: z.enum(["none", "completed", "all"]).optional(),
  resetTables: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "cash-session-close", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, closeSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  try {
    const cashSession = await closeCashSession(id, body.data, session.data);
    if (!cashSession) {
      return fail(404, "CASH_SESSION_NOT_FOUND", "Cash session was not found.");
    }
    return ok(cashSession);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to close cash session.";
    if (message.includes("sudah ditutup")) {
      return fail(409, "CASH_SESSION_ALREADY_CLOSED", message);
    }
    return fail(400, "CASH_SESSION_CLOSE_FAILED", message);
  }
}
