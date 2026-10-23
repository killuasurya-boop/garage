import { fail, ok } from "@/lib/api-response";
import { requireGarageSession, type GarageSession } from "@/lib/server-auth";
import type { ClosingActor } from "@/lib/wms-replenishment-types";

export async function replenishmentSession(managementOnly = false) {
  const session = await requireGarageSession(managementOnly ? ["Owner", "Manajer"] : ["Owner", "Manajer", "Kasir"]);
  if (session.response) return { response: session.response, actor: null };
  return { response: null, actor: replenishmentActor(session.data) };
}

function replenishmentActor(session: GarageSession): ClosingActor {
  return {
    id: session.user.id,
    name: session.user.name,
    role: session.profile.role,
    workstation: session.profile.workstation,
    position: session.profile.position,
    outletId: session.profile.outlet.id,
  };
}

export function replenishmentOk<T>(data: T, status = 200) {
  return ok(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function replenishmentFailure(error: unknown) {
  if (error instanceof Error && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500) {
    const code = "code" in error && typeof error.code === "string" ? error.code : "REPLENISHMENT_CONFLICT";
    return fail(error.status, code, error.message);
  }
  console.error("[wms/replenishment]", error);
  return fail(500, "REPLENISHMENT_FAILED", "Proses gudang gagal. Muat ulang dokumen sebelum mencoba lagi.");
}
