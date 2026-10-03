import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createCustomerOrder, updateCustomerOrderStatus } from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const waiterOrderSchema = z.object({
  tableLabel: z.string().trim().min(1).max(40),
  outletId: z.string().uuid().optional(),
  customerNote: z.string().trim().max(240).optional(),
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

type WaiterOrderResult = Awaited<ReturnType<typeof createCustomerOrder>> & {
  acceptedDirectly: boolean;
  acceptMessage: string | null;
};

// "Pesankan" dari aplikasi waiter: order meja dibuat lewat menu digital lalu LANGSUNG
// diterima (tiket Bar/Dapur + potong stok) tanpa menunggu kasir. Pembayaran tetap
// di kasir saat bill (status order "accepted", belum lunas).
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
      outletId: body.data.outletId,
      customerMode: "guest",
      guestName: `${tableLabel} · ${session.data.user.name}`.slice(0, 80),
      customerNote: body.data.customerNote,
      source: "qr_table",
      paymentMethod: "Cash",
      items: body.data.items,
    });
    // Order sudah tersimpan. Kalau auto-terima gagal (mis. shift kas baru ditutup), jangan
    // laporkan gagal — waiter bisa kirim ulang dan order jadi dobel. Kembalikan sukses
    // dengan status menunggu kasir supaya kasir yang menerima.
    let acceptedDirectly = true;
    let acceptMessage: string | null = null;
    try {
      await updateCustomerOrderStatus(created.order.id, { action: "accept" }, session.data, {
        acceptWithOutletShift: true,
      });
    } catch (error) {
      acceptedDirectly = false;
      acceptMessage = error instanceof Error ? error.message : "Menunggu kasir.";
    }
    const result = { ...created, acceptedDirectly, acceptMessage };
    if (cache?.kind === "miss") cache.commit(result);
    return ok(result, { status: 201 });
  } catch (error) {
    if (cache?.kind === "miss") cache.abandon();
    return fail(
      400,
      "WAITER_ORDER_FAILED",
      error instanceof Error ? error.message : "Pesanan waiter gagal dibuat.",
    );
  }
}
