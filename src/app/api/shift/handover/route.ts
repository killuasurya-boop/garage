import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createShiftHandoverReport } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const handoverSchema = z.object({
  notes: z.string().trim().max(600).nullable().optional(),
});

export async function POST(request: Request) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
    "Kasir",
    "Supervisor Shift",
  ]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, handoverSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await createShiftHandoverReport(body.data, session.data), { status: 201 });
}
