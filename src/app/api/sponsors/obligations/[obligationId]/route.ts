import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { updateObligation } from "@/lib/event-sponsor-service";
import { isIsoDate } from "@/lib/event-sponsor-rules";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  dueDate: z.string().refine(isIsoDate, "Tanggal tidak valid.").nullable().optional(),
  done: z.boolean().optional(),
  doneNote: z.string().trim().max(300).nullable().optional(),
  archive: z.boolean().optional(),
});

/** Ubah, tandai selesai/belum, atau hapus kewajiban (yang sudah selesai tidak bisa dihapus). */
export async function PATCH(request: Request, context: { params: Promise<{ obligationId: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { obligationId } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return sponsorRoute(() => updateObligation(obligationId, body.data, session.data));
}
