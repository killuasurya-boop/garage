import { z } from "zod";

import { accountabilityFailure } from "@/lib/accountability-route";
import { ok, readJson } from "@/lib/api-response";
import {
  createPettyCashEntry,
  listPettyCashEntries,
  PETTY_CASH_TYPES,
  pettyCashBalanceBefore,
  summarizePettyCash,
} from "@/lib/cashier-accountability";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const entrySchema = z.object({
  type: z.enum(PETTY_CASH_TYPES),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(3).max(240),
  amount: z.number().int().min(-100_000_000).max(100_000_000),
  recipient: z.string().trim().max(120).optional(),
  receiptNo: z.string().trim().max(80).optional(),
  receiptUrl: z.string().trim().max(500).optional(),
});

/** Buku petty cash outlet: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default hari ini). */
export async function GET(request: Request) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) return session.response;
  const params = new URL(request.url).searchParams;
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const from = new Date(`${params.get("from") || today}T00:00:00+07:00`);
  const toDay = new Date(`${params.get("to") || params.get("from") || today}T00:00:00+07:00`);
  const to = new Date(toDay.getTime() + 86_400_000);
  const outletId = session.data.profile.outlet.id;
  const [entries, openingBalance] = await Promise.all([
    listPettyCashEntries({ outletId, from, to }),
    pettyCashBalanceBefore(outletId, from),
  ]);
  return ok(summarizePettyCash(entries, openingBalance));
}

export async function POST(request: Request) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) return session.response;
  const body = await readJson(request, entrySchema);
  if (body.error) return body.error;
  try {
    return ok(await createPettyCashEntry(body.data, session.data), { status: 201 });
  } catch (error) {
    return accountabilityFailure(error);
  }
}
