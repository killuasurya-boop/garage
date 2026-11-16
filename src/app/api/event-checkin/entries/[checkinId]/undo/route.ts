import { readJson } from "@/lib/api-response";
import { undoCheckin, undoSchema } from "@/lib/event-checkin-service";
import { checkinRoute } from "@/lib/event-checkin-route";
import { invalidId } from "@/lib/event-api";
import { requireStaffSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Batalkan check-in yang salah (Owner/Manajer, alasan wajib). Riwayat tetap tersimpan. */
export async function POST(request: Request, context: { params: Promise<{ checkinId: string }> }) {
  const session = await requireStaffSession();
  if (session.response) return session.response;
  const { checkinId } = await context.params;
  const bad = invalidId(checkinId);
  if (bad) return bad;
  const body = await readJson(request, undoSchema);
  if (body.error) return body.error;
  return checkinRoute(() => undoCheckin(checkinId, body.data.reason, session.data));
}
