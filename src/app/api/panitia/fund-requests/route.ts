import { fail } from "@/lib/api-response";
import { fundRequestInputSchema } from "@/lib/event-fund-request-rules";
import { submitFundRequest } from "@/lib/event-fund-request-service";
import { lineupRoute } from "@/lib/event-lineup-route";
import { rateLimit } from "@/lib/rate-limit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Ajukan dana masuk/keluar + bukti (multipart): Ketua/Bendahara panitia event itu. Disahkan Owner → Transparansi. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter", "Panitia"]);
  if (session.response) return session.response;
  const limited = rateLimit(request, "panitia-fund-request", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART", "Kirim sebagai formulir dengan berkas bukti.");
  }
  const field = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const parsed = fundRequestInputSchema.safeParse({
    eventId: field("eventId"),
    kind: field("kind"),
    date: field("date"),
    amount: field("amount"),
    party: field("party") ?? "",
    budgetCode: field("budgetCode") ?? "",
    payKind: field("payKind") ?? "",
    description: field("description") ?? "",
  });
  if (!parsed.success) return fail(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Isian belum benar.");
  const file = form.get("proof");
  const proof = file instanceof File && file.size > 0 ? { type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) } : null;
  return lineupRoute(() => submitFundRequest(parsed.data, proof, session.data), 201);
}
