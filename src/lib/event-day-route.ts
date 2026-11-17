import { fail, ok } from "@/lib/api-response";
import { EventDayError } from "@/lib/event-day-service";

/** Jalankan aksi hari-H event dan petakan EventDayError ke { error: { code, message } }. */
export async function eventDayRoute<T>(run: () => Promise<T>, status = 200) {
  try {
    return ok(await run(), status === 200 ? undefined : { status });
  } catch (error) {
    if (error instanceof EventDayError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
