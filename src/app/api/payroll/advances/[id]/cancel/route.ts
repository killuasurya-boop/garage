import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { cancelAdvance } from "@/lib/garage-payroll-payments";
import { payrollPaymentErrorResponse } from "@/lib/garage-payroll-payments-http";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "Alasan pembatalan wajib diisi.").max(200) });

// Batalkan kasbon yang belum dipotong gajian; pengeluaran Finance ikut dibatalkan.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await params;
  try {
    return ok(await cancelAdvance(id, body.data.reason, session.data!));
  } catch (err) {
    return payrollPaymentErrorResponse(err);
  }
}
