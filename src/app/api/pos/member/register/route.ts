import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createCrmMember } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Kasir daftarkan member di POS. Selalu tier Silver (tier lebih tinggi hanya
// lewat menu admin Membership). Membuat akun member aktif + record CRM.
const registerSchema = z.object({
  name: z.string().trim().min(2, "Nama member wajib diisi."),
  phone: z.string().trim().min(8, "Nomor HP wajib valid."),
  password: z.string().min(6, "PIN minimal 6 digit/karakter."),
  email: z.string().trim().email("Email tidak valid.").optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;

  const body = await readJson(request, registerSchema);
  if (body.error) return body.error;

  const result = await createCrmMember({
    name: body.data.name,
    phone: body.data.phone,
    password: body.data.password,
    email: body.data.email || null,
    cardTier: "Silver",
    createdByUserId: session.data.user.id,
  });

  if (!result.data) {
    return fail(409, "MEMBER_CREATE_FAILED", result.error ?? "Member gagal dibuat.");
  }

  return ok(
    {
      customerId: result.data.customer.id,
      name: result.data.customer.name,
      memberCode: result.data.customer.memberCode ?? null,
    },
    { status: 201 },
  );
}
