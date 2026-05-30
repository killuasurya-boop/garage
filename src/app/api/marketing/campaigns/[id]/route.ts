import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  archiveMarketingCampaign,
  getMarketingCampaign,
  updateMarketingCampaign,
} from "@/lib/garage-marketing-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  objective: z.enum(["winback", "acquisition", "retention", "awareness", "loyalty"]).optional(),
  channel: z.enum(["whatsapp", "instagram", "in_store", "multi"]).optional(),
  segmentKey: z.string().min(1).max(80).optional(),
  audienceSize: z.number().int().min(0).max(1_000_000).optional(),
  budget: z.number().int().min(0).max(1_000_000_000).optional(),
  spend: z.number().int().min(0).max(1_000_000_000).optional(),
  targetOrders: z.number().int().min(0).max(1_000_000).optional(),
  targetRevenue: z.number().int().min(0).max(10_000_000_000).optional(),
  actualOrders: z.number().int().min(0).max(1_000_000).optional(),
  actualRevenue: z.number().int().min(0).max(10_000_000_000).optional(),
  status: z.enum(["draft", "scheduled", "active", "paused", "completed", "archived"]).optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  ownerName: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  voucherId: z.string().uuid().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;

  const { id } = await context.params;
  const campaign = await getMarketingCampaign(id);
  if (!campaign) return fail(404, "NOT_FOUND", "Campaign tidak ditemukan.");
  return ok(campaign);
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requirePermission("marketing:write");
  if (session.response) return session.response;

  const body = await readJson(request, updateSchema);
  if (body.error) return body.error;

  const { id } = await context.params;
  const updated = await updateMarketingCampaign(id, body.data);
  if (!updated) return fail(404, "NOT_FOUND", "Campaign tidak ditemukan.");
  return ok(updated);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requirePermission("marketing:write");
  if (session.response) return session.response;

  const { id } = await context.params;
  const archived = await archiveMarketingCampaign(id);
  if (!archived) return fail(404, "NOT_FOUND", "Campaign tidak ditemukan.");
  return ok(archived);
}
