import { z } from "zod";

import { createMemberTokenPair, memberCookieHeaders } from "@/lib/member-auth";
import { registerMember } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nama member wajib diisi."),
  phone: z.string().trim().min(8, "Nomor HP wajib valid."),
  email: z.string().trim().email("Email tidak valid.").optional().or(z.literal("")),
  password: z.string().min(6, "Password/PIN minimal 6 karakter."),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal lahir harus YYYY-MM-DD.").optional().or(z.literal("")),
  referralCode: z.string().trim().max(24).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "member-auth-register", { limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readMemberJson(request, registerSchema);
  if (body.response) return body.response;

  const result = await registerMember({
    ...body.data,
    email: body.data.email || null,
    birthday: body.data.birthday || null,
    referralCode: body.data.referralCode || null,
  });

  if (!result.data) {
    return errorJson(409, result.error ?? "Registrasi member gagal.");
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

  return successJson({ member: result.data.member }, { headers, status: 201 });
}
