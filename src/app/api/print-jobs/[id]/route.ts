import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { updatePrintJob } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const printJobUpdateSchema = z.object({
  status: z.enum(["pending", "printed", "failed"]),
  error: z.string().trim().max(240).nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("print:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, printJobUpdateSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  const result = await updatePrintJob(id, body.data, session.data);
  if (!result) {
    return fail(404, "PRINT_JOB_NOT_FOUND", "Print job tidak ditemukan.");
  }

  return ok(result);
}
