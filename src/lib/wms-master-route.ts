import { fail } from "@/lib/api-response";
import { WmsMasterError, type MasterActor } from "@/lib/wms-master-data";

type SessionLike = { user: { id: string; name?: string | null } };

/** Aktor audit dari sesi + mode ketat (input dari API/UI selalu divalidasi penuh). */
export function masterActor(session: SessionLike): MasterActor {
  return { userId: session.user.id, name: session.user.name ?? null, strict: true };
}

/** WmsMasterError → { error: { code, message } } dengan status yang sesuai; lainnya dilempar ulang. */
export async function withMasterErrors(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof WmsMasterError) return fail(e.status, e.code, e.message);
    // Unique violation dari DB (balapan langka setelah pengecekan) → pesan jelas, bukan 500.
    const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return fail(409, "DUPLICATE", "Data yang sama sudah ada (SKU/nama ganda). Muat ulang lalu coba lagi.");
    throw e;
  }
}
