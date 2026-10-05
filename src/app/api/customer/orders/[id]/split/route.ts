import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { splitCustomerOrder } from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rate-limit";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

type SplitResult = Awaited<ReturnType<typeof splitCustomerOrder>>;

const splitSchema = z.object({
  guestName: z.string().trim().max(60).optional().nullable(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        qty: z.number().int().positive().max(999),
      }),
    )
    .min(1, "Pilih minimal satu item untuk dipisah.")
    .max(50),
});

/** Pisah bill meja per produk → item terpilih pindah ke bill baru di meja yang sama. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "customer-order-split", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  // Sama dengan yang boleh Final Bayar bill meja.
  const session = await requireCashierSession();
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, splitSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  // Anti dobel: "Pisahkan" diulang setelah koneksi putus → kembalikan hasil
  // pemisahan pertama, jangan pisah dua kali.
  const key = readIdempotencyKey(request);
  const cache = key
    ? checkIdempotency<SplitResult>(`order-split:${session.data.user.id}:${id}`, key, 15 * 60_000)
    : null;
  if (cache?.kind === "hit") return ok(cache.result, { status: 200 });
  if (cache?.kind === "pending") {
    return fail(409, "ORDER_SPLIT_IN_PROGRESS", "Pemisahan bill ini masih diproses.");
  }
  try {
    const result = await splitCustomerOrder(id, body.data, session.data);
    if (cache?.kind === "miss") cache.commit(result);
    return ok(result, { status: 201 });
  } catch (error) {
    if (cache?.kind === "miss") cache.abandon();
    return fail(
      400,
      "ORDER_SPLIT_FAILED",
      error instanceof Error ? error.message : "Gagal memisah bill.",
    );
  }
}
