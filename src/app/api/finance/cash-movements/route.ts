import { ok } from "@/lib/api-response";
import { listCashMovements } from "@/lib/garage-service";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/**
 * Riwayat Kas Keluar / Masuk Laci. Kasir hanya melihat catatannya sendiri;
 * Owner/Manajer melihat seluruh outlet (filter kasir). Saldo laci disembunyikan
 * dari Kasir selama shift masih buka (blind count).
 */
export async function GET(request: Request) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const limit = Number(params.get("limit") ?? "");
  return ok(
    await listCashMovements(
      {
        q: params.get("q")?.slice(0, 80) || undefined,
        from: params.get("from") || undefined,
        to: params.get("to") || undefined,
        type: type === "out" || type === "in" ? type : undefined,
        categoryKey: params.get("category") || undefined,
        cashierId: params.get("cashier") || undefined,
        status: params.get("status") || undefined,
        sessionId: params.get("session") || undefined,
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      },
      session.data,
    ),
  );
}
