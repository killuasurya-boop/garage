import { fail } from "@/lib/api-response";
import { readFundProof } from "@/lib/event-fund-request-service";
import { LineupError } from "@/lib/event-lineup-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Bukti pengajuan dana (privat): Owner, pengaju, atau Ketua/Bendahara event itu. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter", "Panitia"]);
  if (session.response) return session.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, "NOT_FOUND", "Bukti tidak ditemukan.");
  try {
    const file = await readFundProof(id, session.data);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.type,
        "Content-Disposition": `inline; filename="${file.name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof LineupError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
