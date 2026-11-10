import { z } from "zod";

import { memberWhatsappSchema } from "@/lib/member-phone";

import { createMemberTokenPair, memberCookieHeaders } from "@/lib/member-auth";
import { recordCxEvent, recordMarketingConsent, resolveInvoiceOrder } from "@/lib/customer-experience-service";
import { registerMember } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nama member wajib diisi."),
  phone: memberWhatsappSchema,
  email: z.string().trim().email("Email tidak valid.").optional().or(z.literal("")),
  password: z.string().min(6, "Password/PIN minimal 6 karakter."),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal lahir harus YYYY-MM-DD.").optional().or(z.literal("")),
  referralCode: z.string().trim().max(24).optional().or(z.literal("")),
  acceptTerms: z.boolean().optional(),
  // CX Engine V4: izin promosi WhatsApp terpisah (default tidak dicentang di UI) +
  // asal pendaftaran. Opsional agar klien lama tetap jalan.
  marketingConsent: z.boolean().optional(),
  source: z.enum(["invoice", "member_login"]).optional(),
  invoiceToken: z.string().trim().min(12).max(128).optional(),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "member-auth-register", { limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readMemberJson(request, registerSchema);
  if (body.response) return body.response;

  const { marketingConsent, source, invoiceToken, ...memberInput } = body.data;
  const result = await registerMember({
    ...memberInput,
    email: body.data.email || null,
    birthday: body.data.birthday || null,
    referralCode: body.data.referralCode || null,
  });

  if (!result.data) {
    return errorJson(409, result.error ?? "Registrasi member gagal.");
  }

  const customerId = result.data.customer.id;
  if (marketingConsent !== undefined) {
    await recordMarketingConsent({
      customerId,
      granted: marketingConsent,
      source: source === "invoice" ? "invoice_register" : "member_register",
    }).catch(() => null);
  }
  if (source === "invoice" && invoiceToken) {
    // Funnel saja: invoice TIDAK ditautkan ke akun (token bukan bukti kepemilikan).
    const order = await resolveInvoiceOrder(invoiceToken).catch(() => null);
    if (order) await recordCxEvent({ event: "member_registered", orderId: order.id, customerId }).catch(() => null);
  }

  const tokenPair = await createMemberTokenPair(result.data.account.id, request);
  const headers = new Headers();
  for (const cookie of memberCookieHeaders(
    tokenPair.accessToken,
    tokenPair.refreshToken,
    tokenPair.refreshExpiresAt,
    request,
  )) {
    headers.append("Set-Cookie", cookie);
  }

  // Welcome voucher = baris voucher yang benar-benar diterbitkan registerMember.
  return successJson({ member: result.data.member, welcomeVoucher: result.data.welcomeVoucher }, { headers, status: 201 });
}
