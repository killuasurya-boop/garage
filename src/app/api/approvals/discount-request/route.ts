import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requestManualDiscountApproval } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const discountRequestSchema = z.object({
  type: z.enum(["amount", "percent"]),
  rawValue: z.number().positive(),
  baseAfterVoucher: z.number().int().nonnegative(),
  reason: z.string().trim().min(3).max(200),
});

export async function POST(request: Request) {
  const session = await requirePermission("orders:manage");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, discountRequestSchema);
  if (body.error) {
    return body.error;
  }

  try {
    const result = await requestManualDiscountApproval(body.data, session.data);
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(
      400,
      "DISCOUNT_APPROVAL_REQUEST_FAILED",
      error instanceof Error
        ? error.message
        : "Gagal mengajukan approval diskon manual.",
    );
  }
}
