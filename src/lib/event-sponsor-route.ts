import { fail, ok } from "@/lib/api-response";
import { SponsorError } from "@/lib/event-sponsor-service";
/** Jalankan aksi sponsor dan petakan SponsorError ke { error: { code, message } }. */
export async function sponsorRoute<T>(run: () => Promise<T>, status = 200) {
  try {
    return ok(await run(), status === 200 ? undefined : { status });
  } catch (error) {
    if (error instanceof SponsorError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
