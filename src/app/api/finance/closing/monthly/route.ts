import { z } from "zod";

import { fail, readJson } from "@/lib/api-response";
import { closeFinanceMonth, getMonthlyClosingReview } from "@/lib/finance-closing";
import { closingResponse } from "@/lib/finance-closing-api";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const monthKey = z.string().regex(/^\d{4}-\d{2}$/, "Format bulan harus YYYY-MM.");

// Review monthly closing + laporan bulan (PRD §43).
export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!monthKey.safeParse(month).success) {
    return fail(400, "VALIDATION_ERROR", "Parameter month wajib (YYYY-MM).");
  }
  return closingResponse(() => getMonthlyClosingReview(month));
}

const closeSchema = z.object({
  month: monthKey,
  notes: z.string().trim().max(500).optional(),
  acknowledgeWarnings: z.boolean().default(false),
});

// CLOSE MONTH → LOCK MONTH. Hanya Owner.
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) {
    return session.response;
  }
  const body = await readJson(request, closeSchema);
  if (body.error) {
    return body.error;
  }
  return closingResponse(() => closeFinanceMonth(body.data, session.data));
}
