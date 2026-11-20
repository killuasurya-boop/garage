import { fail } from "@/lib/api-response";
import { CourierError, getCourierBoard } from "@/lib/garage-courier";
import { okWithEtag } from "@/lib/http-etag";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Daftar antaran: kurir (miliknya), kasir/manajer/owner (semua + pilihan kurir).
export async function GET(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  try {
    return okWithEtag(request, await getCourierBoard(session.data, { historyPage: Number(new URL(request.url).searchParams.get("historyPage")) || 0 }));
  } catch (error) {
    if (error instanceof CourierError) return fail(error.status, "COURIER_FORBIDDEN", error.message);
    return fail(500, "COURIER_BOARD_FAILED", "Daftar antaran gagal dimuat.");
  }
}
