import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createVoucher, getVoucherData } from "@/lib/garage-service";
import { MAX_PERCENT_VOUCHER, MIN_PERCENT_VOUCHER } from "@/lib/member-types";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const baseVoucherSchema = z.object({
  code: z.string().trim().min(2).max(40),
  title: z.string().trim().min(2).max(120),
  minSpend: z.number().int().nonnegative().optional(),
  maxDiscount: z.number().int().positive().nullable().optional(),
  audience: z.enum(["all", "guest", "member"]).default("all"),
  status: z.enum(["active", "paused", "expired"]).default("active"),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
});

const voucherSchema = z.discriminatedUnion("type", [
  baseVoucherSchema.extend({
    type: z.literal("percent"),
    value: z.number().int().min(MIN_PERCENT_VOUCHER).max(MAX_PERCENT_VOUCHER),
  }),
  baseVoucherSchema.extend({
    type: z.literal("fixed"),
    value: z.number().int().positive(),
  }),
]);

export async function GET() {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
    "Kasir",
    "Supervisor Shift",
  ]);
  if (session.response) {
    return session.response;
  }

  return ok(await getVoucherData());
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, voucherSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await createVoucher(body.data, session.data), { status: 201 });
}
