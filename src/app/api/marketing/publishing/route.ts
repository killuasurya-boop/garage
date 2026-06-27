import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import {
  createContentPublishingItem,
  listContentPublishingQueue,
} from "@/lib/garage-content-publishing";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  campaignId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(160),
  contentText: z.string().max(10_000).optional(),
  caption: z.string().max(2_200).optional(),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  assetUrl: z.string().url().nullable().optional(),
  assetUrls: z.array(z.string().url()).max(10).optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  platforms: z
    .array(
      z.enum([
        "facebook",
        "instagram",
        "threads",
        "tiktok",
        "youtube",
        "google_business",
      ]),
    )
    .min(1)
    .max(6),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  return ok(
    await listContentPublishingQueue({
      status: url.searchParams.get("status") ?? undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  );
}

export async function POST(request: Request) {
  const session = await requirePermission("marketing:write");
  if (session.response) return session.response;
  const body = await readJson(request, createSchema);
  if (body.error) return body.error;
  return ok(
    await createContentPublishingItem({
      ...body.data,
      createdBy: session.data.user.id,
    }),
    { status: 201 },
  );
}
