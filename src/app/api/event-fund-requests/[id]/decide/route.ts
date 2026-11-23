import { fail, readJson } from "@/lib/api-response";
import { fundDecisionSchema } from "@/lib/event-fund-request-rules";
import { decideFundRequest } from "@/lib/event-fund-request-service";
import { lineupRoute } from "@/lib/event-lineup-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Sahkan (→ baris Transparansi, bukan buku kas) atau tolak (alasan wajib) pengajuan dana panitia. Owner saja. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, "NOT_FOUND", "Pengajuan tidak ditemukan.");
  const body = await readJson(request, fundDecisionSchema);
  if (body.error) return body.error;
  return lineupRoute(() => decideFundRequest(id, body.data, session.data));
}
