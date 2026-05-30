import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createOrder, getOrderData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const orderSchema = z.object({
  orderType: z.enum(["dine-in", "takeaway", "delivery"]),
  tableNumber: z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, "Nomor meja harus 01 sampai 50.")
    .refine((value) => Number(value) >= 1 && Number(value) <= 50, {
      message: "Nomor meja harus 01 sampai 50.",
    })
    .optional(),
  tableLabel: z.string().min(1).optional(),
  paymentMethod: z.string().min(1).optional(),
  paymentProvider: z.string().min(1).optional(),
  paymentReference: z.string().trim().optional(),
  cashReceived: z.number().int().nonnegative().optional(),
  customerId: z.string().uuid().optional(),
  memberPhone: z.string().trim().min(8).optional(),
  guestName: z.string().trim().min(2).max(80).optional(),
  guestPhone: z.string().trim().min(8).max(24).optional(),
  voucherCode: z.string().trim().max(40).optional(),
  manualDiscount: z
    .object({
      approvalId: z.string().trim().min(8).optional(),
      type: z.enum(["amount", "percent"]),
      rawValue: z.number().positive(),
      amount: z.number().int().nonnegative(),
      reason: z.string().trim().min(3).max(200),
    })
    .optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        variantId: z.string().min(1),
        qty: z.number().int().positive(),
        note: z.string().trim().max(120).optional(),
      }),
    )
    .min(1),
});

export async function GET(request: Request) {
  const session = await requirePermission("orders:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  return ok(
    await getOrderData({
      status: url.searchParams.get("status") ?? undefined,
      channel: url.searchParams.get("channel") ?? undefined,
    }),
  );
}

export async function POST(request: Request) {
  const session = await requirePermission("orders:manage");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, orderSchema);
  if (body.error) {
    return body.error;
  }

  try {
    return ok(await createOrder(body.data, session.data), { status: 201 });
  } catch (error) {
    return fail(
      400,
      "ORDER_CREATE_FAILED",
      error instanceof Error ? error.message : "Unable to create order.",
    );
  }
}
