import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { requestPartnerProductRevision } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ note: z.string().trim().min(5, "Tulis apa yang perlu diperbaiki.").max(300) });

// Owner/Manajer: kembalikan pengajuan produk mitra untuk diperbaiki (catatan tampil di Portal Mitra).
export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { linkId } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => requestPartnerProductRevision(linkId, body.data.note, session.data), 201);
}
