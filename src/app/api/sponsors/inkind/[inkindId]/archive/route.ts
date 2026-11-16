import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { archiveInkind } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "Alasan wajib diisi.").max(300) });

/** Hapus catatan sponsor barang (disembunyikan, tercatat di audit). */
export async function POST(request: Request, context: { params: Promise<{ inkindId: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { inkindId } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return sponsorRoute(() => archiveInkind(inkindId, body.data.reason, session.data));
}
