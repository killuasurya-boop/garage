import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { finalizePayrollDay, finalizeYesterdayIfNeeded } from "@/lib/garage-payroll-cron";

export const runtime = "nodejs";
export const maxDuration = 60;

const OWNER_ROLES = ["Owner / CEO", "Admin"] as const;

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

/** Manual trigger cron. Bisa dipanggil systemd via CRON_SECRET header juga. */
export async function POST(request: Request) {
  // Systemd secret bypass:
  const secret = request.headers.get("x-cron-secret");
  if (secret && secret === process.env.CRON_SECRET) {
    const body = await readJson(request, schema);
    if (body.error) return body.error;
    const result = body.data.date
      ? await finalizePayrollDay(body.data.date)
      : await finalizeYesterdayIfNeeded();
    return ok(result);
  }

  const session = await requireGarageSession([...OWNER_ROLES]);
  if (session.response) return session.response;

  const body = await readJson(request, schema);
  if (body.error) return body.error;

  try {
    const result = body.data.date
      ? await finalizePayrollDay(body.data.date)
      : await finalizeYesterdayIfNeeded();
    return ok(result);
  } catch (err) {
    return fail(500, "CRON_FINALIZE_FAILED", (err as Error).message);
  }
}
