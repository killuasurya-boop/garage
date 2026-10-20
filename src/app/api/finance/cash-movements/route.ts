import { ok } from "@/lib/api-response";
import { cashMovementFiltersFrom } from "@/lib/cash-movement-http";
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
  const limit = Number(params.get("limit") ?? "");
  return ok(
    await listCashMovements(
      {
        ...cashMovementFiltersFrom(params),
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 300) : undefined,
      },
      session.data,
    ),
  );
}
