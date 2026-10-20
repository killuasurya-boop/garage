import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { cashMovementBodySchema, cashMovementErrorResponse } from "@/lib/cash-movement-http";
import { getActiveCashSessionForCashier, listCashMovements, recordCashMovement } from "@/lib/garage-service";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const movementSchema = cashMovementBodySchema
  .extend({
    managerPin: z.string().trim().regex(/^\d{4,8}$/, "PIN harus 4–8 digit angka.").optional(),
    submitForApproval: z.boolean().optional(),
  })
  .refine((body) => body.categoryKey || body.category, { message: "Kategori wajib dipilih." });

/** Kas keluar/masuk laci shift kasir yang sedang buka. */
export async function POST(request: Request) {
  const session = await requireCashierSession();
  if (session.response) return session.response;

  const body = await readJson(request, movementSchema);
  if (body.error) return body.error;

  try {
    return ok(await recordCashMovement(body.data, session.data), { status: 201 });
  } catch (error) {
    const response = cashMovementErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** Daftar kas keluar/masuk shift kasir yang sedang buka (milik sendiri). */
export async function GET() {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const active = await getActiveCashSessionForCashier(session.data.user.id);
  if (!active) return ok({ movements: [] });
  const list = await listCashMovements({ sessionId: active.id, limit: 300 }, session.data);
  return ok({ movements: list.items });
}
