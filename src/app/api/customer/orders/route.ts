import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  createCustomerOrder,
  getCustomerOrderData,
} from "@/lib/garage-service";
import { requireMemberAuth } from "@/lib/member-auth";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const itemSchema = z.object({
  itemId: z.string().trim().min(1),
  variantId: z.string().trim().min(1),
  qty: z.number().int().positive().max(25),
});

const customerOrderSchema = z.object({
  orderType: z.enum(["dine-in", "takeaway", "delivery"]).default("dine-in"),
  tableLabel: z.string().trim().max(40).optional(),
  outletId: z.string().uuid().optional(),
  customerMode: z.enum(["guest", "member"]).default("guest"),
  guestName: z.string().trim().min(2).max(80).optional(),
  guestPhone: z.string().trim().min(8).max(24).optional(),
  customerNote: z.string().trim().max(240).optional(),
  source: z.enum(["qr_table", "qr_takeaway", "instagram", "campaign"]).optional(),
  campaign: z.string().trim().max(80).optional(),
  voucherCode: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(["Cash", "QRIS", "Bank Transfer"]).default("Cash"),
  paymentProvider: z.string().trim().max(60).optional(),
  paymentReference: z.string().trim().max(80).optional(),
  items: z.array(itemSchema).min(1).max(40),
});

export async function GET(request: Request) {
  const session = await requirePermission("orders:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  return ok(
    await getCustomerOrderData({
      status: url.searchParams.get("status") ?? undefined,
    }),
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "customer-orders", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readJson(request, customerOrderSchema);
  if (body.error) {
    return body.error;
  }

  let memberCustomerId: string | undefined;
  if (body.data.customerMode === "member") {
    const member = await requireMemberAuth(request);
    if (member.response) {
      return fail(401, "MEMBER_LOGIN_REQUIRED", "Login member diperlukan untuk checkout member.");
    }
    memberCustomerId = member.data.customer.id;
  } else if (!body.data.guestName || !body.data.guestPhone) {
    return fail(400, "GUEST_REQUIRED", "Nama dan nomor WhatsApp guest wajib diisi.");
  }

  try {
    return ok(
      await createCustomerOrder({
        ...body.data,
        memberCustomerId,
      }),
      { status: 201 },
    );
  } catch (error) {
    return fail(
      400,
      "CUSTOMER_ORDER_CREATE_FAILED",
      error instanceof Error ? error.message : "Customer order gagal dibuat.",
    );
  }
}
