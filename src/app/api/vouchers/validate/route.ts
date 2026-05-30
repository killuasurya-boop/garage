import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { validateVoucher } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const voucherValidateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  subtotal: z.number().int().nonnegative(),
  customerMode: z.enum(["guest", "member"]).optional(),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "voucher-validate", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readJson(request, voucherValidateSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await validateVoucher(body.data));
}
