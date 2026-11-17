import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { eventFinanceRoute } from "@/lib/event-finance-route";
import { voidExpensePayment } from "@/lib/event-finance-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "Alasan pembatalan wajib diisi.").max(300) });

/** Batalkan pembayaran biaya event (salah catat): baris pembalik buku kas, riwayat tetap (Owner). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await params;
  return eventFinanceRoute(() => voidExpensePayment(id, body.data.reason, session.data));
}
