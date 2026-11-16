import { CheckinBlockedError } from "@/lib/event-checkin-service";
import { EventError } from "@/lib/event-service";

/** Jalankan aksi check-in; EventError → { error: { code, message, detail? } }. */
export async function checkinRoute<T>(run: () => Promise<T>, status = 200) {
  try {
    return Response.json({ data: await run() }, { status });
  } catch (error) {
    if (error instanceof EventError) {
      const detail = error instanceof CheckinBlockedError && Object.keys(error.detail).length ? error.detail : undefined;
      return Response.json({ error: { code: error.code, message: error.message, ...(detail ? { detail } : {}) } }, { status: error.status });
    }
    throw error;
  }
}
