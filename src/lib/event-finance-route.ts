import { fail, ok } from "@/lib/api-response";
import { EventFinanceError } from "@/lib/event-finance-service";

/** Jalankan aksi keuangan event dan petakan EventFinanceError ke { error: { code, message } }. */
export async function eventFinanceRoute<T>(run: () => Promise<T>, status = 200) {
  try {
    return ok(await run(), status === 200 ? undefined : { status });
  } catch (error) {
    if (error instanceof EventFinanceError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
