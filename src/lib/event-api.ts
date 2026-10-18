import { z } from "zod";

import { fail } from "@/lib/api-response";
import { EventError } from "@/lib/event-service";
import type { requirePermission } from "@/lib/server-auth";

type GarageSessionData = NonNullable<Awaited<ReturnType<typeof requirePermission>>["data"]>;

// Helper bersama route /api/events/** (validasi id + mapping error + aktor log).
export function invalidId(...ids: string[]) {
  return ids.some((id) => !z.string().uuid().safeParse(id).success)
    ? fail(400, "INVALID_ID", "ID tidak valid.")
    : null;
}

export function eventActor(session: GarageSessionData) {
  return { userId: session.user.id, name: `${session.user.name} / ${session.profile.role}` };
}

export function eventErrorResponse(error: unknown, fallback: string) {
  if (error instanceof EventError) return fail(error.status, error.code, error.message);
  console.error(`[events] ${fallback}`, error);
  return fail(500, "EVENT_ACTION_FAILED", fallback);
}
