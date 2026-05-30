import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { logCrmCampaign } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const campaignLogSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  customerPhone: z.string().max(32).nullable().optional(),
  segmentKey: z.string().min(1).max(80),
  templateKey: z.string().min(1).max(80),
  messagePreview: z.string().max(500).optional(),
  status: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;

  const body = await readJson(request, campaignLogSchema);
  if (body.error) return body.error;

  return ok(
    await logCrmCampaign({
      ...body.data,
      sentBy: session.data.user.id,
    }),
    { status: 201 },
  );
}
