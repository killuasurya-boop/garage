import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createCustomerOrder } from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const waiterOrderSchema = z.object({
  tableLabel: z.string().trim().min(1).max(40),
  outletId: z.string().uuid().optional(),
  customerNote: z.string().trim().max(240).optional(),
  // Nama tamu (opsional) — dicetak di chit Bar/Dapur & tampil di papan produksi.
  customerName: z.string().trim().max(40).optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        variantId: z.string().trim().min(1),
        qty: z.number().int().positive().max(25),
        note: z.string().trim().max(160).optional(),
      }),
    )
    .min(1)
    .max(40),
});

type WaiterOrderResult = Awaited<ReturnType<typeof createCustomerOrder>>;

// "Pesankan" dari aplikasi waiter: order meja dibuat lewat menu digital dengan nama
// pemesan otomatis ("Meja 5 · Andi"). Order WAJIB divalidasi kasir dulu (status
// menunggu kasir), sama seperti order QR pelanggan — kasir accept baru ke Bar/Dapur.
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, waiterOrderSchema);
  if (body.error) return body.error;

  const key = readIdempotencyKey(request);
  const cache = key ? checkIdempotency<WaiterOrderResult>(`waiter-order:${session.data.user.id}`, key) : null;
  if (cache?.kind === "hit") return ok(cache.result, { status: 200 });
  if (cache?.kind === "pending") {
    return fail(409, "WAITER_ORDER_IN_PROGRESS", "Pesanan masih diproses.");
  }

  try {
    const tableLabel = body.data.tableLabel.toLowerCase().startsWith("meja")
      ? body.data.tableLabel
      : `Meja ${body.data.tableLabel}`;
    const created = await createCustomerOrder({
      orderType: "dine-in",
      tableLabel,
      // Selalu outlet akun waiter (bukan dari body).
      outletId: session.data.profile.outlet.id,
      customerMode: "guest",
      // "Meja 5 · Andi · Waiter 1" (nama tamu diisi) atau "Meja 5 · Waiter 1".
      guestName: [tableLabel, body.data.customerName?.replace(/·/g, " ").trim(), session.data.user.name]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 80),
      customerNote: body.data.customerNote,
      source: "qr_table",
      staffOrder: true,
      paymentMethod: "Cash",
      items: body.data.items,
    });
    if (cache?.kind === "miss") cache.commit(created);
    return ok(created, { status: 201 });
  } catch (error) {
    if (cache?.kind === "miss") cache.abandon();
    return fail(
      400,
      "WAITER_ORDER_FAILED",
      error instanceof Error ? error.message : "Pesanan waiter gagal dibuat.",
    );
  }
}
