import { requireMemberAuth } from "@/lib/member-auth";
import { getMemberHistory } from "@/lib/member-service";
import { successJson } from "@/lib/member-types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;

  return successJson(await getMemberHistory(session.data.customer.id));
}
