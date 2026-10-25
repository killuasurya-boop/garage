import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { isValidDenominationKey } from "@/lib/cash-denominations";
import { createDbBackup } from "@/lib/garage-db-backup";
import {
  CashSessionAlreadyClosedError,
  CashSessionForbiddenError,
  CashSessionInputError,
  CashSessionSignOffRequiredError,
  closeCashSession,
} from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const closeSchema = z.object({
  actualCash: z.number().int().nonnegative(),
  denominations: z
    .record(
      z.string().refine(isValidDenominationKey, "Pecahan uang tidak dikenal."),
      z.number().int().nonnegative().max(100_000),
    )
    .optional(),
  checklist: z.array(z.object({ label: z.string().trim().min(1), done: z.boolean() })).optional(),
  closingNote: z.string().trim().max(500).optional(),
  managerSignOff: z.boolean().optional(),
  managerPin: z.string().trim().regex(/^\d{4,8}$/, "PIN harus 4–8 digit angka.").optional(),
  resetTableMode: z.enum(["none", "completed", "all"]).optional(),
  resetTables: z.boolean().optional(),
  qrisCounted: z.number().int().nonnegative().max(1_000_000_000).optional(),
  floatLeft: z.number().int().nonnegative().max(100_000_000).optional(),
  // Tutup darurat tanpa pecahan (P3): alasan + PIN Manajer wajib (dicek di service).
  countSkippedReason: z.string().trim().max(300).optional(),
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
    // Backup setiap tutup kasir (di latar belakang, tidak menahan respons).
    void createDbBackup("tutupkasir").catch((err) => console.error("[backup] tutup kasir gagal", err));
    return ok(cashSession);
  } catch (error) {
    if (error instanceof CashSessionInputError) {
      return fail(400, "CASH_SESSION_INVALID_INPUT", error.message);
    }
    if (error instanceof CashSessionForbiddenError) {
      return fail(403, "CASH_SESSION_FORBIDDEN", error.message);
    }
    if (error instanceof CashSessionAlreadyClosedError) {
      return fail(409, "CASH_SESSION_ALREADY_CLOSED", error.message);
    }
    if (error instanceof CashSessionSignOffRequiredError) {
      return fail(422, "MANAGER_SIGNOFF_REQUIRED", error.message);
    }
    const message = error instanceof Error ? error.message : "Unable to close cash session.";
    return fail(400, "CASH_SESSION_CLOSE_FAILED", message);
  }
}
