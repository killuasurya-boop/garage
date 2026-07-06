import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import {
  getAllPayrollSettings,
  setPayrollSetting,
} from "@/lib/garage-payroll-settings";

export const runtime = "nodejs";

const OWNER_ROLES = ["Owner / CEO", "Admin", "Finance / CFO"] as const;

export async function GET() {
  const session = await requireGarageSession([...OWNER_ROLES]);
  if (session.response) return session.response;
  const all = await getAllPayrollSettings();
  return ok({ settings: all });
}

const patchSchema = z.object({
  key: z.string().min(1).max(64),
  value: z.unknown(),
});

export async function PATCH(request: Request) {
  const session = await requireGarageSession([...OWNER_ROLES]);
  if (session.response) return session.response;

  const body = await readJson(request, patchSchema);
  if (body.error) return body.error;

  try {
    const value = await setPayrollSetting(body.data.key, body.data.value, session.data!.user.id);
    return ok({ key: body.data.key, value });
  } catch (err) {
    return fail(500, "SETTINGS_UPDATE_FAILED", (err as Error).message);
  }
}
