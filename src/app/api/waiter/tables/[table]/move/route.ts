import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { moveTable } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  to: z.string().regex(/^\d{1,2}$/, "Nomor meja tujuan harus 01-50"),
});

function normalizeTable(table: string) {
  if (!/^\d{1,2}$/.test(table) || Number(table) < 1 || Number(table) > 50) {
    return null;
  }
  return String(Number(table)).padStart(2, "0");
}

// Pindahkan bill aktif meja sumber ke meja tujuan (mis. tamu pindah meja).
export async function POST(
  request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const session = await requirePermission("tables:write");
  if (session.response) {
    return session.response;
  }

  const { table } = await context.params;
  const fromNumber = normalizeTable(table);
  if (!fromNumber) {
    return fail(400, "TABLE_INVALID", "Nomor meja sumber harus 01 sampai 50.");
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, "BODY_INVALID", parsed.error.issues[0]?.message ?? "Body invalid");
  }
  const toNumber = normalizeTable(parsed.data.to);
  if (!toNumber) {
    return fail(400, "TABLE_INVALID", "Nomor meja tujuan harus 01 sampai 50.");
  }

  try {
    const result = await moveTable(fromNumber, toNumber, session.data);
    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal pindah meja.";
    return fail(409, "TABLE_MOVE_FAILED", message);
  }
}
