import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  createMarketingPromo,
  listMarketingPromos,
} from "@/lib/garage-marketing-service";
import { requirePermission } from "@/lib/server-auth";
import { VOUCHER_RETIRED_CODE, VOUCHER_RETIRED_MESSAGE, VOUCHERS_RETIRED } from "@/lib/voucher-policy";

export const runtime = "nodejs";

const createSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[A-Z0-9\-_]+$/i, "Kode promo: huruf, angka, dash, underscore."),
  title: z.string().min(2).max(120),
  type: z.enum(["fixed", "percent"]),
  value: z.number().int().min(1).max(1_000_000_000),
  minSpend: z.number().int().min(0).max(1_000_000_000).optional(),
  maxDiscount: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  audience: z.string().max(40).optional(),
  status: z.enum(["active", "draft", "paused", "expired"]).optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);

  return ok(
    await listMarketingPromos({
      status,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  );
}

export async function POST(request: Request) {
  const session = await requirePermission("marketing:write");
  if (session.response) return session.response;
  // Voucher dimatikan Owner 25 Nov 2026 (src/lib/voucher-policy.ts).
  if (VOUCHERS_RETIRED) return fail(410, VOUCHER_RETIRED_CODE, VOUCHER_RETIRED_MESSAGE);

  const body = await readJson(request, createSchema);
  if (body.error) return body.error;
  void session;

  const created = await createMarketingPromo(body.data);
  return ok(created, { status: 201 });
}
