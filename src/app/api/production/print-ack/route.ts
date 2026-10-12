import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { markProductionChitsPrinted } from "@/lib/garage-production";
import { normalizeWorkstation } from "@/lib/garage-production-rules";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const ackSchema = z.object({
  ticketNos: z.array(z.string().trim().min(1).max(40)).min(1).max(100),
});

// Perangkat stasiun (Bar/Dapur) memberi tahu chit sudah dikirim ke printernya,
// supaya tiket tidak dicetak ulang otomatis.
export async function POST(request: Request) {
  const session = await requirePermission("kitchen:write");
  if (session.response) {
    return session.response;
  }
  const body = await readJson(request, ackSchema);
  if (body.error) {
    return body.error;
  }
  const ws = normalizeWorkstation(session.data.profile.workstation);
  const onlyStation =
    ws === "bar" || ws === "helper_bar" ? "Bar" : ws === "dapur" || ws === "helper_dapur" ? "Food" : null;
  return ok({ marked: await markProductionChitsPrinted(body.data.ticketNos, onlyStation) });
}
