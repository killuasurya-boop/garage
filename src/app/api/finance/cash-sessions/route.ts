import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { isValidDenominationKey } from "@/lib/cash-denominations";
import { OPENING_CASH_HARD_MAX, OPENING_CASH_STEP } from "@/lib/opening-cash";
import {
  CashSessionAlreadyOpenError,
  CashSessionDailyLimitError,
  CashSessionOutletAlreadyOpenError,
  CashSessionShiftMismatchError,
  createCashSession,
  OpeningCashInvalidError,
  OpeningDenominationMismatchError,
} from "@/lib/garage-service";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const cashSessionSchema = z.object({
  // Owner 6 Nov 2026: modal awal bebas sesuai uang di laci (kelipatan Rp100); batas atas dari Pengaturan dicek di server.
  openingCash: z
    .number()
    .int()
    .positive("Modal awal harus lebih dari Rp0.")
    .max(OPENING_CASH_HARD_MAX, "Modal awal terlalu besar.")
    .refine((value) => value % OPENING_CASH_STEP === 0, {
      message: "Modal awal harus kelipatan Rp100 (koin terkecil).",
    }),
  shiftNumber: z.number().int().min(1).max(9).optional(),
  managerPin: z.string().trim().regex(/^\d{4,8}$/, "PIN harus 4–8 digit angka.").optional(),
  openingDenominations: z
    .record(z.string().refine(isValidDenominationKey, "Pecahan uang tidak dikenal."), z.number().int().min(0).max(9999))
    .optional(),
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
    if (error instanceof OpeningCashInvalidError) {
      return fail(422, error.code, error.message);
    }
    if (error instanceof OpeningDenominationMismatchError) {
      return fail(422, error.code, error.message);
    }
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
    if (error instanceof Error && /^PIN salah|Terlalu banyak|terkunci/i.test(error.message)) {
      return fail(403, "MANAGER_PIN_INVALID", error.message);
    }
    throw error;
  }
}
