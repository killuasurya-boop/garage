import { ok } from "@/lib/api-response";
import {
  getStaffEarningSummary,
  listStaffEarnings,
} from "@/lib/garage-earnings";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("earnings:read");
  if (session.response) {
    return session.response;
  }

  const userId = session.data.user.id;
  const [summary, history] = await Promise.all([
    getStaffEarningSummary(userId),
    listStaffEarnings(userId, 50),
  ]);

  return ok({ summary, history });
}
