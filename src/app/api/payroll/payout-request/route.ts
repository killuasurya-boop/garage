import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { staffPayoutRequests } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  walletType: z.enum(["gaji", "fee", "keduanya"]),
  amountGaji: z.number().int().min(0).max(100_000_000),
  amountFee: z.number().int().min(0).max(100_000_000),
  reason: z.string().max(200).optional().nullable(),
});

export async function POST(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const body = await readJson(request, schema);
  if (body.error) return body.error;

  if (body.data.amountGaji === 0 && body.data.amountFee === 0) {
    return fail(400, "ZERO_AMOUNT", "Minimal 1 wallet dengan nominal > 0.");
  }

  try {
    const db = getDb();
    const [row] = await db
      .insert(staffPayoutRequests)
      .values({
        staffUserId: session.data!.user.id,
        walletType: body.data.walletType,
        amountGaji: body.data.amountGaji,
        amountFee: body.data.amountFee,
        reason: body.data.reason ?? null,
        status: "pending",
      })
      .returning();
    return ok({ request: row });
  } catch (err) {
    return fail(500, "PAYOUT_REQUEST_FAILED", (err as Error).message);
  }
}

export async function GET() {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(staffPayoutRequests)
      .where(eq(staffPayoutRequests.staffUserId, session.data!.user.id))
      .orderBy(desc(staffPayoutRequests.createdAt));
    return ok({ requests: rows });
  } catch (err) {
    return fail(500, "PAYOUT_LIST_FAILED", (err as Error).message);
  }
}
