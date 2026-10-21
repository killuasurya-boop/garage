import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { todayWibKey } from "@/lib/date-range";
import { eventActor, invalidId } from "@/lib/event-api";
import { EventSalesError, eventSalesCsv, getEventSalesReport } from "@/lib/event-sales-report";
import { createAuditLog } from "@/lib/garage-service";
import { canUseApiAs } from "@/lib/role-access";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const querySchema = z.object({
  from: z.string().default(() => todayWibKey()),
  to: z.string().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  if (!canUseApiAs(session.data.profile, "finance:read")) {
    return fail(403, "FORBIDDEN", "Anda tidak memiliki akses laporan keuangan event.");
  }
  const { id } = await context.params;
  const badId = invalidId(id);
  if (badId) return badId;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail(400, "INVALID_QUERY", "Filter laporan tidak valid.");
  const { from, format } = parsed.data;
  const to = parsed.data.to ?? from;
  if (format === "csv" && !canUseApiAs(session.data.profile, "events:export")) {
    return fail(403, "FORBIDDEN", "Hanya Owner yang dapat mengekspor laporan event.");
  }
  try {
    const report = await getEventSalesReport({ eventId: id, outletId: session.data.profile.outlet.id, from, to });
    if (format === "csv") {
      await createAuditLog({
        actor: eventActor(session.data).name,
        action: "Event: ekspor laporan penjualan",
        object: report.event.title,
        device: session.data.profile.deviceLabel ?? "OS",
        metadata: { eventId: id, outletId: session.data.profile.outlet.id, from, to, bills: report.summary.bills },
      });
      return new Response(eventSalesCsv(report), { headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="GarageOS_Event_${id}_${from}_${to}.csv"`,
        "cache-control": "private, no-store",
      } });
    }
    return ok({ report }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof EventSalesError) return fail(error.status, error.code, error.message);
    console.error("[event-sales] Failed to load report", error instanceof Error ? error.name : "UnknownError");
    return fail(500, "EVENT_SALES_FAILED", "Laporan penjualan event gagal dimuat.");
  }
}
