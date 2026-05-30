import { z } from "zod";

import { isDatabaseConfigured } from "@/db";
import { fail, ok, readJson } from "@/lib/api-response";
import { GarageOsThemeSaveError } from "@/lib/garage-theme";
import {
  deleteOutletOverrides,
  loadSettingsWithScope,
  saveSettings,
} from "@/lib/garage-settings-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  outletId: z.string().uuid().nullable().optional(),
  updates: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
});

const deleteSchema = z.object({
  outletId: z.string().uuid(),
  keys: z.array(z.string()).min(1),
});

function parseOutletId(value: string | null): string | null {
  if (!value || value === "null" || value === "global") return null;
  // Validasi UUID minimum
  if (!/^[0-9a-f-]{36}$/i.test(value)) return null;
  return value;
}

export async function GET(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const url = new URL(request.url);
  const outletId = parseOutletId(url.searchParams.get("outletId"));

  const data = await loadSettingsWithScope(outletId);
  return ok({
    outletId,
    settings: data.settings,
    globalSettings: data.globalSettings,
    overrideKeys: data.overrideKeys,
  });
}

export async function POST(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const parsed = await readJson(request, updateSchema);
  if (parsed.error) return parsed.error;

  const outletId = parsed.data.outletId ?? null;
  try {
    const result = await saveSettings(parsed.data.updates, session.data, outletId);
    return ok({ ...result, outletId });
  } catch (error) {
    if (error instanceof GarageOsThemeSaveError) {
      return fail(400, "INVALID_THEME_PRESET", error.message);
    }
    throw error;
  }
}

// DELETE: hapus outlet-specific override untuk keys tertentu (revert ke global).
export async function DELETE(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const parsed = await readJson(request, deleteSchema);
  if (parsed.error) return parsed.error;

  const result = await deleteOutletOverrides(parsed.data.keys, parsed.data.outletId);
  return ok(result);
}
