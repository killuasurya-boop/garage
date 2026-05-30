import { z } from "zod";

import { syncPosTransaction } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { requirePosTerminal } from "@/lib/pos-api-key";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const syncSchema = z.object({
  terminalCode: z.string().trim().min(2, "terminalCode wajib diisi."),
  memberPhone: z.string().trim().min(8, "memberPhone wajib valid."),
  totalAmount: z.number().int().positive("totalAmount wajib lebih dari 0."),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "pos-sync-transaction", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readMemberJson(request, syncSchema);
  if (body.response) return body.response;

  const terminal = await requirePosTerminal(request, body.data.terminalCode);
  if (terminal.response) return terminal.response;

  const result = await syncPosTransaction({
    memberPhone: body.data.memberPhone,
    totalAmount: body.data.totalAmount,
  });

  if (!result.data) {
    return errorJson(404, result.error ?? "Member tidak ditemukan.");
  }

  return successJson(result.data);
}
