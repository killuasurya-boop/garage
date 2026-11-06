import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { listCxCampaignCandidates, logCxCampaignOpened } from "@/lib/customer-experience-service";
import type { CxCampaignKind } from "@/lib/cx-whatsapp";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kindSchema = z.enum(["welcome", "loyalty_progress", "voucher_reminder", "repeat_visit", "birthday"]);

// Kampanye WhatsApp manual (wa.me, tanpa API berbayar). Promosi hanya untuk
// member yang memberi izin + batas frekuensi. Klik dicatat "opened", bukan "sent".
export async function GET(request: Request) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;
  const parsed = kindSchema.safeParse(new URL(request.url).searchParams.get("kind") ?? "welcome");
  if (!parsed.success) return fail(400, "INVALID_KIND", "Jenis kampanye tidak dikenal.");
  return ok(await listCxCampaignCandidates(parsed.data as CxCampaignKind));
}

const logSchema = z.object({
  kind: kindSchema,
  customerId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;
  const body = await readJson(request, logSchema);
  if (body.error) return body.error;
  try {
    return ok(
      await logCxCampaignOpened({
        kind: body.data.kind,
        customerId: body.data.customerId,
        message: body.data.message,
        userId: session.data.user.id,
      }),
    );
  } catch (error) {
    return fail(409, "CAMPAIGN_BLOCKED", error instanceof Error ? error.message : "Kampanye diblokir.");
  }
}
