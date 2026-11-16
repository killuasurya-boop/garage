import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { previewCheckin } from "@/lib/event-checkin-service";
import { checkinRoute } from "@/lib/event-checkin-route";
import { invalidId } from "@/lib/event-api";
import { requireStaffSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z
  .object({ code: z.string().trim().max(400).optional(), invitationId: z.string().uuid().optional() })
  .refine((v) => Boolean(v.code) || Boolean(v.invitationId), { message: "Kirim QR atau pilih tamu." });

/** Hasil scan sebelum dikonfirmasi: nama, batas orang, RSVP, sudah masuk atau belum. Tidak mencatat apa pun. */
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const session = await requireStaffSession();
  if (session.response) return session.response;
  const { eventId } = await context.params;
  const bad = invalidId(eventId);
  if (bad) return bad;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return checkinRoute(() => previewCheckin(eventId, body.data, session.data));
}
