import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { ORDER_CANCEL_REASON_CODES } from "@/lib/approval-rules";
import {
  getRefundableOrder,
  requestOrderRefundApproval,
  requestOrderVoidApproval,
  requestUnpaidItemCancelApproval,
} from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Production Hub V4 — Bar/Dapur mengajukan batal (owner Nov 2026: WAJIB disetujui
// Owner/Manajer). Endpoint ini hanya meneruskan ke jalur resmi yang sama dengan kasir:
//   seluruh order        → requestOrderVoidApproval   (APP-VOID → voidOrder)
//   item, order lunas    → requestOrderRefundApproval (APP-RFD  → executeOrderRefund)
//   item, belum lunas    → requestUnpaidItemCancelApproval (APP-PCX → pisah bill + void)
// Staf produksi tidak memegang uang; eksekusi terjadi saat Owner/Manajer menyetujui.

/** Item order yang masih bisa dibatalkan + status bayar & pengajuan yang menunggu. */
export async function GET(request: Request) {
  const session = await requirePermission("kitchen:read");
  if (session.response) {
    return session.response;
  }
  const orderId = new URL(request.url).searchParams.get("orderId") ?? "";
  if (!z.string().uuid().safeParse(orderId).success) {
    return fail(400, "INVALID_ORDER", "Order tidak valid.");
  }
  const order = await getRefundableOrder(orderId, session.data);
  if (!order) {
    return fail(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.");
  }
  return ok({ ...order, paid: order.status === "paid" });
}

const cancelSchema = z
  .object({
    orderId: z.string().uuid(),
    scope: z.enum(["order", "items"]),
    reasonCode: z.enum(ORDER_CANCEL_REASON_CODES),
    note: z.string().trim().max(200).optional().nullable(),
    items: z
      .array(z.object({ orderItemId: z.string().uuid(), qty: z.number().int().positive().max(999) }))
      .max(50)
      .optional(),
  })
  .refine((v) => v.scope === "order" || Boolean(v.items?.length), { message: "Pilih minimal satu item." });

export async function POST(request: Request) {
  const limited = rateLimit(request, "production-cancel-request", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requirePermission("kitchen:write");
  if (session.response) {
    return session.response;
  }
  const body = await readJson(request, cancelSchema);
  if (body.error) {
    return body.error;
  }
  const { orderId, scope, reasonCode, note, items } = body.data;
  try {
    if (scope === "order") {
      const result = await requestOrderVoidApproval(orderId, { reasonCode, note }, session.data);
      return ok({ kind: "void", ...result }, { status: 201 });
    }
    const order = await getRefundableOrder(orderId, session.data);
    if (!order) return fail(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.");
    const result =
      order.status === "paid"
        ? { kind: "refund", ...(await requestOrderRefundApproval(orderId, { reasonCode, note, items: items ?? [] }, session.data)) }
        : { kind: "unpaid_items", ...(await requestUnpaidItemCancelApproval(orderId, { reasonCode, note, items: items ?? [] }, session.data)) };
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(400, "CANCEL_REQUEST_FAILED", error instanceof Error ? error.message : "Gagal mengajukan pembatalan.");
  }
}
