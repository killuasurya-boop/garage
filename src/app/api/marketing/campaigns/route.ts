import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import {
  createMarketingCampaign,
  listMarketingCampaigns,
} from "@/lib/garage-marketing-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  objective: z.enum(["winback", "acquisition", "retention", "awareness", "loyalty"]).optional(),
  channel: z.enum(["whatsapp", "instagram", "in_store", "multi"]).optional(),
  segmentKey: z.string().min(1).max(80),
  audienceSize: z.number().int().min(0).max(1_000_000).optional(),
  budget: z.number().int().min(0).max(1_000_000_000).optional(),
  targetOrders: z.number().int().min(0).max(1_000_000).optional(),
  targetRevenue: z.number().int().min(0).max(10_000_000_000).optional(),
  status: z.enum(["draft", "scheduled", "active", "paused", "completed", "archived"]).optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  ownerName: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  voucherId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const channel = url.searchParams.get("channel") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);

  return ok(
    await listMarketingCampaigns({
      status,
      channel,
      search,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  );
}

export async function POST(request: Request) {
  const session = await requirePermission("marketing:write");
  if (session.response) return session.response;

  const body = await readJson(request, createSchema);
  if (body.error) return body.error;

  const created = await createMarketingCampaign({
    ...body.data,
    createdBy: session.data.user.id,
  });

  return ok(created, { status: 201 });
}
