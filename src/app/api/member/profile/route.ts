import { z } from "zod";

import { requireMemberAuth } from "@/lib/member-auth";
import { getMemberProfile, updateMemberProfile } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter.").max(80).optional(),
  phone: z
    .string()
    .min(8, "Nomor telepon terlalu pendek.")
    .max(20, "Nomor telepon terlalu panjang.")
    .optional(),
  address: z.string().max(280, "Alamat maksimum 280 karakter.").optional().nullable(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal lahir YYYY-MM-DD.")
    .optional()
    .nullable(),
  photoUrl: z
    .string()
    .max(350_000, "Foto terlalu besar (maks ~250KB).")
    .optional()
    .nullable(),
});

export async function GET(request: Request) {
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;

  const member = await getMemberProfile(session.data.customer.id);
  return successJson({ member: member ?? session.data.member });
}

export async function PATCH(request: Request) {
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;

  const parsed = await readMemberJson(request, updateSchema);
  if (parsed.response) return parsed.response;

  const update = await updateMemberProfile({
    customerId: session.data.customer.id,
    ...parsed.data,
  });

  if (update.error || !update.data) {
    return errorJson(400, update.error ?? "Gagal update profil member.");
  }

  return successJson(update.data);
}
