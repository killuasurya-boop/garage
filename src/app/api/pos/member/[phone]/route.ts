import { lookupMemberByPhone } from "@/lib/member-service";
import { errorJson, successJson } from "@/lib/member-types";
import { requirePosTerminal } from "@/lib/pos-api-key";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ phone: string }> },
) {
  const limited = rateLimit(request, "pos-member-lookup", { limit: 90, windowMs: 60_000 });
  if (limited) return limited;

  const terminal = await requirePosTerminal(request);
  if (terminal.response) return terminal.response;

  const { phone } = await context.params;
  const result = await lookupMemberByPhone(decodeURIComponent(phone));
  if (!result.data) {
    return errorJson(404, result.error ?? "Member tidak ditemukan.");
  }

  return successJson(result.data);
}
