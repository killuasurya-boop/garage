import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { giveAdvance } from "@/lib/garage-payroll-payments";
import { payrollPaymentErrorResponse } from "@/lib/garage-payroll-payments-http";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().trim().min(2).max(16),
  amount: z.number().int().min(1_000, "Kasbon minimal Rp 1.000.").max(50_000_000),
  method: z.enum(["Cash", "Transfer"]),
  note: z.string().trim().max(200).optional().nullable(),
});

// Catat kasbon karyawan (dipotong otomatis di gajian berikutnya).
export async function POST(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  try {
    return ok(await giveAdvance(body.data, session.data!), { status: 201 });
  } catch (err) {
    return payrollPaymentErrorResponse(err);
  }
}
