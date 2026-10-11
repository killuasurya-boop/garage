import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { TableClaimError, holdCustomerTable, releaseCustomerTable } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const holdSchema = z.object({
  table: z.string().trim().min(1).max(8),
  outletId: z.string().regex(UUID).optional(),
  holdToken: z.string().regex(/^[a-f0-9]{32,64}$/).optional(),
  joinCode: z.string().regex(/^\d{4}$/, "Kode gabung 4 angka.").optional(),
});

const releaseSchema = z.object({
  outletId: z.string().regex(UUID).optional(),
  holdToken: z.string().regex(/^[a-f0-9]{32,64}$/),
});

/**
 * Pelanggan memilih meja di menu digital → meja dikunci sementara ("Sedang
 * dipilih"). Dengan holdToken yang sama = perpanjang; joinCode = gabung meja terisi.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "customer-table-hold", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const body = await readJson(request, holdSchema);
  if (body.error) return body.error;
  try {
    const result = await holdCustomerTable({
      tableNumber: body.data.table,
      outletId: body.data.outletId,
      holdToken: body.data.holdToken,
      joinCode: body.data.joinCode,
    });
    return ok(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TableClaimError) return fail(409, error.code, error.message);
    return fail(400, "TABLE_HOLD_FAILED", error instanceof Error ? error.message : "Meja gagal dipilih.");
  }
}

/** Ganti meja / batal: lepas kunci milik pelanggan ini. */
export async function DELETE(request: Request) {
  const limited = rateLimit(request, "customer-table-release", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const body = await readJson(request, releaseSchema);
  if (body.error) return body.error;
  return ok(await releaseCustomerTable({ holdToken: body.data.holdToken, outletId: body.data.outletId }));
}
