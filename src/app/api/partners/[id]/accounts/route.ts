import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { createPartnerAccount } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  phone: z.string().trim().min(9).max(20),
  displayName: z.string().trim().min(2).max(80),
  pin: z.string().regex(/^\d{6}$/, "PIN harus 6 angka."),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => createPartnerAccount(id, body.data, session.data), 201);
}
