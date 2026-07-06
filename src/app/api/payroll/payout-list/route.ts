import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { staffPayoutRequests, user } from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const OWNER_ROLES = ["Owner / CEO", "Admin", "Finance / CFO"] as const;

export async function GET(request: Request) {
  const session = await requireGarageSession([...OWNER_ROLES]);
  if (session.response) return session.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "pending";

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: staffPayoutRequests.id,
        staffUserId: staffPayoutRequests.staffUserId,
        staffName: user.name,
        walletType: staffPayoutRequests.walletType,
        amountGaji: staffPayoutRequests.amountGaji,
        amountFee: staffPayoutRequests.amountFee,
        reason: staffPayoutRequests.reason,
        status: staffPayoutRequests.status,
        createdAt: staffPayoutRequests.createdAt,
      })
      .from(staffPayoutRequests)
      .innerJoin(user, eq(user.id, staffPayoutRequests.staffUserId))
      .where(eq(staffPayoutRequests.status, status))
      .orderBy(desc(staffPayoutRequests.createdAt));
    return ok({ status, requests: rows });
  } catch (err) {
    return fail(500, "PAYOUT_LIST_FAILED", (err as Error).message);
  }
}
