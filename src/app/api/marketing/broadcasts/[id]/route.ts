import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getAppSettings, logCrmCampaign } from "@/lib/garage-service";
import {
  markMarketingBroadcastSent,
  updateMarketingBroadcast,
} from "@/lib/garage-marketing-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  channel: z.enum(["whatsapp", "instagram", "in_store", "multi"]).optional(),
  segmentKey: z.string().min(1).max(80).optional(),
  templateBody: z.string().min(1).max(2000).optional(),
  status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]).optional(),
  scheduledAt: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  totalRecipients: z.number().int().min(0).max(1_000_000).optional(),
  sentCount: z.number().int().min(0).max(1_000_000).optional(),
  openedCount: z.number().int().min(0).max(1_000_000).optional(),
  clickedCount: z.number().int().min(0).max(1_000_000).optional(),
  notes: z.string().max(500).nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  markSent: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requirePermission("marketing:write");
  if (session.response) return session.response;

  const body = await readJson(request, updateSchema);
  if (body.error) return body.error;

  const { id } = await context.params;

  if (body.data.markSent) {
    const sentCount = body.data.sentCount ?? body.data.totalRecipients ?? 0;
    const updated = await markMarketingBroadcastSent(id, sentCount);
    if (!updated) return fail(404, "NOT_FOUND", "Broadcast tidak ditemukan.");

    // Auto-log ke crm_campaign_logs bila setting aktif. Catat sebagai 1 symbolic row
    // berisi snapshot template + segment + sentCount. Cukup untuk menaikkan
    // counter campaignOpened30d di CRM dashboard tanpa membanjiri tabel.
    try {
      const appSettings = await getAppSettings(session.data.profile.outlet.id);
      if (appSettings.marketingAutoLogEnabled) {
        await logCrmCampaign({
          customerId: null,
          customerPhone: null,
          segmentKey: updated.segmentKey,
          templateKey: `broadcast:${updated.name}`,
          messagePreview: updated.templateBody.slice(0, 500),
          status: `sent:${sentCount}`,
          sentBy: session.data.user.id,
        });
      }
    } catch {
      // Auto-log gagal tidak boleh menghalangi mark-sent.
    }

    return ok(updated);
  }

  const { markSent: _markSent, ...rest } = body.data;
  void _markSent;
  const updated = await updateMarketingBroadcast(id, rest);
  if (!updated) return fail(404, "NOT_FOUND", "Broadcast tidak ditemukan.");
  return ok(updated);
}
