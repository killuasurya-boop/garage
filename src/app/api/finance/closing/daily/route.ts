import { z } from "zod";

import { fail, readJson } from "@/lib/api-response";
import { closeFinanceDay, getDailyClosingReview } from "@/lib/finance-closing";
import { closingResponse } from "@/lib/finance-closing-api";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.");

// Review checklist + snapshot hari itu (PRD §42).
export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!dateKey.safeParse(date).success) {
    return fail(400, "VALIDATION_ERROR", "Parameter date wajib (YYYY-MM-DD).");
  }
  return closingResponse(() => getDailyClosingReview(date));
}

const closeSchema = z.object({
  date: dateKey,
  notes: z.string().trim().max(500).optional(),
  acknowledgeWarnings: z.boolean().default(false),
});

// CLOSE DAY → LOCK (PRD §16). Owner & Manajer.
export async function POST(request: Request) {
  const session = await requirePermission("finance:write");
  if (session.response) {
    return session.response;
  }
  const body = await readJson(request, closeSchema);
  if (body.error) {
    return body.error;
  }
  return closingResponse(() => closeFinanceDay(body.data, session.data));
}
