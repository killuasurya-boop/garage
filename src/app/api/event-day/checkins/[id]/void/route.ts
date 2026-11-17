import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { eventDayRoute } from "@/lib/event-day-route";
import { voidCheckin } from "@/lib/event-day-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "Alasan pembatalan wajib diisi.").max(300) });

/** Batalkan check-in (salah scan / dobel): status batal + alasan, baris tidak dihapus. Owner/Manajer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await params;
  return eventDayRoute(() => voidCheckin(id, body.data.reason, session.data));
}
