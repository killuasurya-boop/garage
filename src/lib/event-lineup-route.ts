import { fail, ok } from "@/lib/api-response";
import { LineupError } from "@/lib/event-lineup-service";

/** Jalankan aksi lineup/panitia dan petakan LineupError ke { error: { code, message } }. */
export async function lineupRoute<T>(run: () => Promise<T>, status = 200) {
  try {
    return ok(await run(), status === 200 ? undefined : { status });
  } catch (error) {
    if (error instanceof LineupError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
