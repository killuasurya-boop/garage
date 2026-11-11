import { fail, ok } from "@/lib/api-response";
import { requestOrderRefundApproval, requestOrderVoidApproval } from "@/lib/garage-service";
import { paymentStatusOf } from "@/lib/payment-status";
import { PartnerHubError, rejectedPartnerTicketForRefund } from "@/lib/partner-hub-service";
import { rateLimit } from "@/lib/rate-limit";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Mitra menolak pesanan yang sudah dibayar → kasir mengajukan refund item itu (atau batal seluruh order bila
// hanya berisi item tersebut) lewat jalur approval resmi yang sama dengan POS. Tidak ada jalur uang baru.
export async function POST(request: Request, context: { params: Promise<{ ticketNo: string }> }) {
  const limited = rateLimit(request, "partner-rejected-refund", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { ticketNo } = await context.params;
  try {
    const target = await rejectedPartnerTicketForRefund(session.data.profile.outlet.id, ticketNo);
    if (paymentStatusOf({ status: target.orderStatus }) !== "paid") {
      return fail(409, "ORDER_NOT_PAID", "Bill belum dibayar — keluarkan item ini lewat Belum Bayar / batal item sebelum pelanggan membayar.");
    }
    const note = `Ditolak mitra ${target.partnerName}${target.reason ? `: ${target.reason}` : ""}`.slice(0, 200);
    try {
      const result = await requestOrderRefundApproval(target.orderNo, { reasonCode: "menu_habis", note, items: target.items }, session.data);
      return ok({ kind: "refund", approvalId: result.approvalId, status: result.status }, { status: 201 });
    } catch (error) {
      // Order hanya berisi item mitra ini → refund sebagian tidak berlaku; ajukan batal seluruh order.
      if (!(error instanceof Error) || !/Semua item dipilih/.test(error.message)) throw error;
      const result = await requestOrderVoidApproval(target.orderNo, { reasonCode: "menu_habis", note }, session.data);
      return ok({ kind: "void", approvalId: result.approvalId, status: result.status }, { status: 201 });
    }
  } catch (error) {
    if (error instanceof PartnerHubError) return fail(error.status, error.code, error.message);
    return fail(400, "PARTNER_REFUND_FAILED", error instanceof Error ? error.message : "Gagal mengajukan refund.");
  }
}
