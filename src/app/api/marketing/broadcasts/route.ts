import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import {
  createMarketingBroadcast,
  listMarketingBroadcasts,
} from "@/lib/garage-marketing-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  campaignId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(120),
  channel: z.enum(["whatsapp", "instagram", "in_store", "multi"]).optional(),
  segmentKey: z.string().min(1).max(80),
  templateBody: z.string().min(1).max(2000),
  status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]).optional(),
  scheduledAt: z.string().nullable().optional(),
  totalRecipients: z.number().int().min(0).max(1_000_000).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaignId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);

  return ok(
    await listMarketingBroadcasts({
      campaignId,
      status,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  );
}

export async function POST(request: Request) {
  const session = await requirePermission("marketing:write");
  if (session.response) return session.response;

  const body = await readJson(request, createSchema);
  if (body.error) return body.error;

  const created = await createMarketingBroadcast({
    ...body.data,
    createdBy: session.data.user.id,
  });

  return ok(created, { status: 201 });
}
