import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { voidSponsorPayment } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "Alasan wajib diisi.").max(300) });

/** Batalkan uang sponsor yang salah catat: buku kas mendapat baris pembalik, riwayat tidak dihapus. */
export async function POST(request: Request, context: { params: Promise<{ paymentId: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { paymentId } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return sponsorRoute(() => voidSponsorPayment(paymentId, body.data.reason, session.data));
}
