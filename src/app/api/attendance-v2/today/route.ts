import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getTodayAttendance } from "@/lib/garage-attendance-v2";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  try {
    const row = await getTodayAttendance(session.data!.user.id);
    return ok({ attendance: row });
  } catch (err) {
    return fail(500, "TODAY_FAILED", (err as Error).message);
  }
}
