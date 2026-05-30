import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  CashSessionAlreadyOpenError,
  CashSessionDailyLimitError,
  CashSessionOutletAlreadyOpenError,
  CashSessionShiftMismatchError,
  createCashSession,
} from "@/lib/garage-service";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const cashSessionSchema = z.object({
  openingCash: z
    .number()
    .int()
    .min(50000, "Opening cash minimal Rp 50.000.")
    .max(500000, "Opening cash maksimal Rp 500.000.")
    .refine((value) => value % 50000 === 0, {
      message: "Opening cash harus kelipatan Rp 50.000.",
    }),
  expectedCash: z.number().int().nonnegative().optional(),
  shiftNumber: z.union([z.literal(1), z.literal(2)]).optional(),
});

export async function POST(request: Request) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, cashSessionSchema);
  if (body.error) {
    return body.error;
  }

  try {
    return ok(await createCashSession(body.data, session.data), { status: 201 });
  } catch (error) {
    if (error instanceof CashSessionAlreadyOpenError) {
      return fail(409, "CASH_SESSION_ALREADY_OPEN", error.message);
    }
    if (error instanceof CashSessionOutletAlreadyOpenError) {
      return fail(409, "OUTLET_CASH_SESSION_ALREADY_OPEN", error.message);
    }
    if (error instanceof CashSessionDailyLimitError) {
      return fail(409, "CASH_SESSION_DAILY_LIMIT", error.message);
    }
    if (error instanceof CashSessionShiftMismatchError) {
      return fail(409, "CASH_SESSION_SHIFT_MISMATCH", error.message);
    }
    throw error;
  }
}
