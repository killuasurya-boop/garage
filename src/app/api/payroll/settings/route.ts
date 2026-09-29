import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import {
  getAllPayrollSettings,
  setPayrollSetting,
} from "@/lib/garage-payroll-settings";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const all = await getAllPayrollSettings();
  return ok({ settings: all });
}

const patchSchema = z.object({
  key: z.string().min(1).max(64),
  value: z.unknown(),
});

// Aturan yang menyangkut uang hanya boleh diubah Owner; manajer boleh mengatur
// hal operasional (GPS toko, catatan slip, metode absen, keamanan PIN).
const OWNER_ONLY_KEYS = new Set([
  "general",
  "late.brackets",
  "late.penalty",
  "overtime",
  "fee.pool",
  "bonus.target",
  "bonus.zeroKomplain",
  "bonus.attendance",
  "payout",
  "umk",
  "backup", // menentukan ke mana salinan data ditulis
]);

export async function PATCH(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;

  const body = await readJson(request, patchSchema);
  if (body.error) return body.error;
  if (OWNER_ONLY_KEYS.has(body.data.key) && session.data!.profile.role !== "Owner") {
    return fail(403, "OWNER_ONLY", "Aturan gaji hanya bisa diubah Owner.");
  }

  try {
    const value = await setPayrollSetting(body.data.key, body.data.value, session.data!.user.id);
    return ok({ key: body.data.key, value });
  } catch (err) {
    return fail(500, "SETTINGS_UPDATE_FAILED", (err as Error).message);
  }
}
