import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  CashMovementPinRequiredError,
  CashSessionRequiredForCashOutError,
  getActiveCashSessionForCashier,
  listCashMovementsForSession,
  recordCashMovement,
} from "@/lib/garage-service";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const movementSchema = z.object({
  type: z.enum(["out", "in"]),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(180),
  amount: z.number().int().positive().max(100_000_000),
  managerPin: z.string().trim().regex(/^\d{4,8}$/, "PIN harus 4–8 digit angka.").optional(),
  countAsPurchase: z.boolean().optional(),
  counterparty: z.string().trim().max(120).optional(),
  referenceNo: z.string().trim().max(80).optional(),
  orderNo: z.string().trim().max(60).optional(),
});

/** Kas keluar/masuk laci shift kasir yang sedang buka. */
export async function POST(request: Request) {
  const session = await requireCashierSession();
  if (session.response) return session.response;

  const body = await readJson(request, movementSchema);
  if (body.error) return body.error;

  try {
    return ok(await recordCashMovement(body.data, session.data), { status: 201 });
  } catch (error) {
    if (error instanceof CashMovementPinRequiredError) {
      return fail(422, error.code, error.message);
    }
    if (error instanceof CashSessionRequiredForCashOutError) {
      return fail(409, "CASH_SESSION_REQUIRED", error.message);
    }
    if (error instanceof Error && /^PIN salah|Terlalu banyak|terkunci/i.test(error.message)) {
      return fail(403, "MANAGER_PIN_INVALID", error.message);
    }
    if (error instanceof Error && /Belanja bahan|Nominal/.test(error.message)) {
      return fail(400, "INVALID_CASH_MOVEMENT", error.message);
    }
    throw error;
  }
}

/** Daftar kas keluar/masuk shift kasir yang sedang buka (milik sendiri). */
export async function GET() {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const active = await getActiveCashSessionForCashier(session.data.user.id);
  if (!active) return ok({ movements: [] });
  return ok({ movements: await listCashMovementsForSession(active.id) });
}
