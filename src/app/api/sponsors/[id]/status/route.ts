import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { setSponsorStatus } from "@/lib/event-sponsor-service";
import { SPONSOR_STATUSES } from "@/lib/event-sponsor-rules";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ status: z.enum(SPONSOR_STATUSES), reason: z.string().trim().max(300).nullable().optional() });

/** Selesai / batal (batal wajib alasan; uang yang sudah masuk tetap tercatat). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return sponsorRoute(() => setSponsorStatus(id, body.data.status, body.data.reason ?? null, session.data));
}
