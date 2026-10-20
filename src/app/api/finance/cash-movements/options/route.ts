import { ok } from "@/lib/api-response";
import { getCashMovementOptions } from "@/lib/garage-service";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Pilihan form kas laci: karyawan (+ sisa kasbon) & kas keluar shift aktif. */
export async function GET() {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  return ok(await getCashMovementOptions(session.data));
}
