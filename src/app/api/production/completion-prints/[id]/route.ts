import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { completionPrintErrorResponse } from "@/lib/garage-production-http";
import {
  claimCompletionPrint,
  reportCompletionPrint,
  retryCompletionPrint,
} from "@/lib/production-completion-print";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  // Perangkat Auto Print mengklaim job (atomik: satu perangkat per job).
  z.object({ action: z.literal("claim"), device: z.string().trim().min(1).max(80) }),
  // Hasil cetak dari pemegang klaim. ok=false hanya untuk gagal PASTI.
  z.object({
    action: z.literal("result"),
    token: z.string().uuid(),
    ok: z.boolean(),
    error: z.string().trim().max(240).nullable().optional(),
    printer: z.string().trim().max(80).nullable().optional(),
  }),
  // Staf mengantrekan ulang job gagal setelah printer dibereskan.
  z.object({ action: z.literal("retry") }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("kitchen:write");
  if (session.response) {
    return session.response;
  }
  const body = await readJson(request, actionSchema);
  if (body.error) {
    return body.error;
  }
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail(404, "COMPLETION_PRINT_NOT_FOUND", "Job cetak tidak ditemukan.");
  }
  try {
    const data = body.data;
    if (data.action === "claim") return ok(await claimCompletionPrint(id, data.device, session.data));
    if (data.action === "result") {
      return ok(
        await reportCompletionPrint(
          id,
          { token: data.token, ok: data.ok, error: data.error, printer: data.printer },
          session.data,
        ),
      );
    }
    return ok(await retryCompletionPrint(id, session.data));
  } catch (error) {
    const response = completionPrintErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
