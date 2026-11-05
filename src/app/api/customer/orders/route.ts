import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { VIEW_ONLY_MESSAGE, selfOrderAllowed } from "@/lib/digital-menu-mode";
import { sweepUnpaidOrdersLazily } from "@/lib/garage-courier";
import {
  TableClaimError,
  createCustomerOrder,
  getCustomerOrderData,
  getDigitalMenuMode,
} from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { eventCartItemSchema } from "@/lib/event-menu-service";
import { EventError } from "@/lib/event-service";
import { requireMemberAuth } from "@/lib/member-auth";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type CustomerOrderResult = Awaited<ReturnType<typeof createCustomerOrder>>;

const itemSchema = z.object({
  itemId: z.string().trim().min(1),
  variantId: z.string().trim().min(1),
  qty: z.number().int().positive().max(25),
  // Catatan per-item opsional (mis. "less ice", "tanpa bawang").
  note: z.string().trim().max(160).optional(),
});

const customerOrderSchema = z.object({
  orderType: z.enum(["dine-in", "takeaway", "delivery"]).default("dine-in"),
  tableLabel: z.string().trim().max(40).optional(),
  outletId: z.string().uuid().optional(),
  customerMode: z.enum(["guest", "member"]).default("guest"),
  guestName: z.string().trim().min(2).max(80).optional(),
  // WA opsional: string kosong diperlakukan sebagai tidak diisi (undefined).
  guestPhone: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(8).max(24).optional(),
  ),
  customerNote: z.string().trim().max(240).optional(),
  source: z.enum(["qr_table", "qr_takeaway", "instagram", "campaign"]).optional(),
  campaign: z.string().trim().max(80).optional(),
  pointsToRedeem: z.number().int().min(0).max(1_000_000).optional(),
  voucherCode: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(["Cash", "QRIS", "Bank Transfer"]).default("Cash"),
  paymentProvider: z.string().trim().max(60).optional(),
  paymentReference: z.string().trim().max(80).optional(),
  // Token chat (opsional). Bila customer sudah ngobrol, order ditautkan ke
  // thread chat agar update status order otomatis muncul di percakapan.
  chatToken: z.string().trim().min(12).max(120).optional(),
  // Delivery: alamat lengkap + patokan (divalidasi di server untuk orderType delivery).
  deliveryAddress: z.string().trim().max(300).optional(),
  // Pilih meja menu digital: kunci meja milik pelanggan / kode gabung meja terisi.
  tableHoldToken: z.string().regex(/^[a-f0-9]{32,64}$/).optional(),
  tableJoinCode: z.string().regex(/^\d{4}$/, "Kode gabung 4 angka.").optional(),
  customerLat: z.number().min(-90).max(90).optional(),
  customerLng: z.number().min(-180).max(180).optional(),
  eventId: z.string().uuid().optional(),
  eventItems: z.array(eventCartItemSchema).max(40).optional(),
  items: z.array(itemSchema).max(40).default([]),
}).superRefine((value, ctx) => {
  if (value.eventId) {
    if (!value.eventItems?.length && !value.items.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Keranjang masih kosong." });
    if ((value.eventItems?.length ?? 0) + value.items.length > 40) ctx.addIssue({ code: "custom", path: ["items"], message: "Maksimal 40 pilihan dalam satu pesanan." });
  } else {
    if (!value.items.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Keranjang masih kosong." });
    if (value.eventItems?.length) ctx.addIssue({ code: "custom", path: ["eventId"], message: "Event belum dipilih." });
  }
});

export async function GET(request: Request) {
  const session = await requirePermission("orders:read");
  if (session.response) {
    return session.response;
  }

  // Tolak otomatis order take away/delivery yang lewat batas bayar (sapuan malas).
  await sweepUnpaidOrdersLazily();
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "unpaid" ? "unpaid" : undefined;
  return ok(
    await getCustomerOrderData({
      status: url.searchParams.get("status") ?? undefined,
      scope,
      // Daftar Belum Bayar = outlet staf saja (order lama tanpa outlet tetap ikut).
      outletId: scope ? session.data.profile.outlet.id : undefined,
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
  } else if (!body.data.guestName) {
    // Nomor WhatsApp opsional untuk guest — cukup nama untuk lanjut transaksi.
    return fail(400, "GUEST_REQUIRED", "Nama customer wajib diisi.");
  }

  // Menu V5: outlet bermode "Daftar Pilihan" → pesanan dicatat waiter, bukan checkout dari HP pelanggan.
  if (!selfOrderAllowed(await getDigitalMenuMode(body.data.outletId))) {
    return fail(403, "DIGITAL_MENU_VIEW_ONLY", VIEW_ONLY_MESSAGE);
  }

  // Anti double-tap QR ordering: klien kirim X-Idempotency-Key per submission.
  const key = readIdempotencyKey(request);
  if (body.data.eventId && !key) return fail(400, "EVENT_REQUEST_KEY_REQUIRED", "Muat ulang keranjang lalu coba checkout kembali.");
  const idemNamespace = `customer-order:${memberCustomerId ?? body.data.guestPhone ?? "guest"}`;
  // Event requests use the durable DB key and payload fingerprint, never the
  // process cache which cannot distinguish the same key with a different cart.
  const cache = key && !body.data.eventId ? checkIdempotency<CustomerOrderResult>(idemNamespace, key) : null;
  if (cache?.kind === "hit") return ok(cache.result, { status: 200 });
  if (cache?.kind === "pending") {
    return fail(409, "CUSTOMER_ORDER_IN_PROGRESS", "Order kamu masih diproses.");
  }

  try {
    const result = await createCustomerOrder({
      ...body.data,
      memberCustomerId,
      clientRequestKey: body.data.eventId ? key ?? undefined : undefined,
      // Dine-in dari menu digital wajib kunci meja / kode gabung (bukan order staf).
      enforceTableClaim: body.data.orderType === "dine-in",
    });
    if (cache?.kind === "miss") cache.commit(result);
    return ok(result, { status: 201 });
  } catch (error) {
    if (cache?.kind === "miss") cache.abandon();
    if (error instanceof TableClaimError) {
      return fail(409, error.code, error.message);
    }
    if (error instanceof EventError) return fail(error.status, error.code, error.message);
    const databaseCause = error instanceof Error ? error.cause : undefined;
    // A database failure can happen after the order transaction commits (for
    // example while attaching the invoice token). Keep it retryable so the
    // client preserves its durable request key and recovers the same order.
    const databaseFailure = Boolean(databaseCause) || (error instanceof Error && error.message.startsWith("Failed query:"));
    if (databaseCause && typeof databaseCause === "object") {
      const cause = databaseCause as Record<string, unknown>;
      console.error("Customer order database failure", {
        code: cause.code,
        constraint: cause.constraint,
        table: cause.table,
      });
    }
    return fail(
      databaseFailure ? 503 : 400,
      "CUSTOMER_ORDER_CREATE_FAILED",
      databaseFailure
        ? "Pesanan belum berhasil dibuat. Silakan coba kembali."
        : error instanceof Error ? error.message : "Customer order gagal dibuat.",
    );
  }
}
