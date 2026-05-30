import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createPrintJob, getPrintJobData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const printJobSchema = z.object({
  jobType: z.string().trim().min(2).max(40),
  target: z.string().trim().min(2).max(40),
  orderId: z.string().uuid().optional(),
  ticketNo: z.string().trim().max(40).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(request: Request) {
  const session = await requirePermission("print:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  return ok(await getPrintJobData({ status: url.searchParams.get("status") ?? undefined }));
}

export async function POST(request: Request) {
  const session = await requirePermission("print:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, printJobSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await createPrintJob(body.data, session.data), { status: 201 });
}
