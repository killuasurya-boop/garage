import { fail } from "@/lib/api-response";
import { getOrderForReceipt } from "@/lib/garage-service";
import { generateInvoicePdf } from "@/lib/garage-invoice-pdf";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("orders:read");
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const data = await getOrderForReceipt(id);
  if (!data) {
    return fail(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.");
  }

  const pdf = await generateInvoicePdf(data);
  const filename = `invoice-${data.order.invoiceNo}.pdf`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
