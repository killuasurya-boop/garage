import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createCustomerOrder, updateCustomerOrderStatus } from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// "Bayar nanti" dari POS (owner, Okt 2026): pesanan langsung diproses Bar/Dapur,
// tagihan tetap terbuka dan dilunasi lewat Final Bayar (Cash/QRIS/Transfer).
const openBillSchema = z
  .object({
    orderType: z.enum(["dine-in", "takeaway"]),
    tableLabel: z.string().trim().max(40).optional(),
    customerName: z.string().trim().max(60).optional(),
    customerNote: z.string().trim().max(240).optional(),
    items: z
      .array(
        z.object({
          itemId: z.string().trim().min(1),
          variantId: z.string().trim().min(1),
          qty: z.number().int().positive().max(50),
          note: z.string().trim().max(160).optional(),
        }),
      )
      .min(1)
      .max(60),
  })
  .refine((value) => (value.orderType === "dine-in" ? Boolean(value.tableLabel) : Boolean(value.customerName)), {
    message: "Bayar nanti wajib pilih meja (dine-in) atau isi nama pelanggan (takeaway).",
  });

type OpenBillResult = { orderId: string; orderNo: string; total: number; tableLabel: string | null };

export async function POST(request: Request) {
  const session = await requireCashierSession();
  if (session.response) return session.response;

  const body = await readJson(request, openBillSchema);
  if (body.error) return body.error;

  const key = readIdempotencyKey(request);
  const cache = key ? checkIdempotency<OpenBillResult>(`open-bill:${session.data.user.id}`, key) : null;
  if (cache?.kind === "hit") return ok(cache.result);
  if (cache?.kind === "pending") return fail(409, "OPEN_BILL_IN_PROGRESS", "Tagihan masih diproses.");

  try {
    const { orderType, tableLabel, customerName, customerNote, items } = body.data;
    const table =
      orderType === "dine-in" && tableLabel
        ? tableLabel.toLowerCase().startsWith("meja")
          ? tableLabel
          : `Meja ${tableLabel}`
        : undefined;
    const created = await createCustomerOrder({
      orderType,
      tableLabel: table,
      outletId: session.data.profile.outlet.id,
      customerMode: "guest",
      // Nama tamu saja (meja tampil terpisah di tiket); kosong → antrian #.
      guestName: customerName?.replace(/·/g, " ").trim().slice(0, 80) || "Guest Customer",
      customerNote,
      source: orderType === "dine-in" ? "qr_table" : "qr_takeaway",
      staffOrder: true,
      allowHiddenItems: true,
      paymentMethod: "Cash",
      items,
    });
    // Kasir sendiri yang membuat → langsung diterima & masuk Bar/Dapur.
    await updateCustomerOrderStatus(created.order.id, { action: "accept" }, session.data, { openBill: true });
    const result: OpenBillResult = {
      orderId: created.order.id,
      orderNo: created.order.orderNo,
      total: created.order.total,
      tableLabel: created.order.tableLabel ?? null,
    };
    if (cache?.kind === "miss") cache.commit(result);
    return ok(result, { status: 201 });
  } catch (error) {
    if (cache?.kind === "miss") cache.abandon();
    return fail(400, "OPEN_BILL_FAILED", error instanceof Error ? error.message : "Tagihan gagal disimpan.");
  }
}
