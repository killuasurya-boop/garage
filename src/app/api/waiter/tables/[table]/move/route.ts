import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { moveTable } from "@/lib/garage-service";
import { TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  to: z.string().regex(/^\d{1,2}$/, "Nomor meja tujuan harus 01-50"),
});

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
  const fromNumber = parseTableNumber(table);
  if (!fromNumber) {
    return fail(400, "TABLE_INVALID", `Meja sumber tidak valid. ${TABLE_NUMBER_RANGE_MESSAGE}`);
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, "BODY_INVALID", parsed.error.issues[0]?.message ?? "Body invalid");
  }
  const toNumber = parseTableNumber(parsed.data.to);
  if (!toNumber) {
    return fail(400, "TABLE_INVALID", `Meja tujuan tidak valid. ${TABLE_NUMBER_RANGE_MESSAGE}`);
  }

  try {
    const result = await moveTable(fromNumber, toNumber, session.data);
    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal pindah meja.";
    return fail(409, "TABLE_MOVE_FAILED", message);
  }
}
