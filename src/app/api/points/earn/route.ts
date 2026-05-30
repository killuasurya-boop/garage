import { z } from "zod";

import { requireMemberAuth } from "@/lib/member-auth";
import { earnMemberPoints } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";

export const runtime = "nodejs";

const earnSchema = z.object({
  memberId: z.string().optional(),
  amount: z.number().int().positive("Amount wajib lebih dari 0."),
  source: z.enum(["WEBSITE", "POS"]).default("WEBSITE"),
  lastOrder: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;

  const body = await readMemberJson(request, earnSchema);
  if (body.response) return body.response;

  if (body.data.source !== "WEBSITE") {
    return errorJson(403, "Endpoint ini hanya untuk earning dari website. POS memakai /api/pos/sync-transaction.");
  }

  if (
    body.data.memberId &&
    body.data.memberId !== session.data.customer.id &&
    body.data.memberId !== session.data.account.id
  ) {
    return errorJson(403, "Member tidak boleh menambah points untuk akun lain.");
  }

  const result = await earnMemberPoints({
    customerId: session.data.customer.id,
    amount: body.data.amount,
    source: "WEBSITE",
    lastOrder: body.data.lastOrder,
  });

  if (!result.data) {
    return errorJson(404, result.error ?? "Gagal menambah points.");
  }

  return successJson(result.data);
}
