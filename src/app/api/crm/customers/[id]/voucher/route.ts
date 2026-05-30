import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { issuePersonalVoucherForCrm } from "@/lib/garage-service";
import { MAX_PERCENT_VOUCHER, MIN_PERCENT_VOUCHER } from "@/lib/member-types";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const voucherSchema = z.object({
  type: z.enum(["percent", "fixed"]),
  value: z.number().int().positive(),
  validDays: z.number().int().positive().max(365).optional(),
  reason: z.string().max(200).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;

  const { id } = await context.params;
  const body = await readJson(request, voucherSchema);
  if (body.error) return body.error;

  if (body.data.type === "percent" &&
      (body.data.value < MIN_PERCENT_VOUCHER || body.data.value > MAX_PERCENT_VOUCHER)) {
    return fail(400, "INVALID_PERCENT_VALUE",
      `Voucher percent harus ${MIN_PERCENT_VOUCHER}-${MAX_PERCENT_VOUCHER}%.`);
  }
  if (body.data.type === "fixed" && body.data.value < 1000) {
    return fail(400, "INVALID_FIXED_VALUE", "Voucher fixed minimal Rp1.000.");
  }

  const result = await issuePersonalVoucherForCrm({
    customerId: id,
    type: body.data.type,
    value: body.data.value,
    validDays: body.data.validDays,
    reason: body.data.reason,
  });

  if (!result) {
    return fail(404, "CUSTOMER_NOT_FOUND", "Customer tidak ditemukan.");
  }

  return ok(result, { status: 201 });
}