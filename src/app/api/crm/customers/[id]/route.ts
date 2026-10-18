import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { memberWhatsappSchema } from "@/lib/member-phone";
import {
  deleteCustomerCrmProfile,
  getCustomerCardTier,
  getCustomerDetailForCrm,
  updateCustomerCrmProfile,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;

  const { id } = await context.params;
  const detail = await getCustomerDetailForCrm(id);
  if (!detail) {
    return fail(404, "CUSTOMER_NOT_FOUND", "Customer tidak ditemukan.");
  }

  return ok(detail);
}

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: memberWhatsappSchema.optional(),
  address: z.string().max(500).nullable().optional(),
  photoUrl: z.string().max(500).nullable().optional(),
  memberPassword: z.string().max(72).optional(),
  staffNote: z.string().max(500).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  referralCode: z.string().max(24).nullable().optional(),
  memberCode: z.string().max(32).nullable().optional(),
  cardTier: z.enum(["Silver", "Gold", "Platinum", "Ultra"]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;

  const { id } = await context.params;
  const body = await readJson(request, patchSchema);
  if (body.error) return body.error;

  const isOwner = session.data.profile.role === "Owner";

  if (body.data.cardTier === "Ultra" && !isOwner) {
    return fail(403, "ULTRA_OWNER_ONLY", "Ultra hanya bisa diset oleh Owner.");
  }

  if (!isOwner) {
    const currentTier = await getCustomerCardTier(id);
    if (currentTier === "Ultra") {
      return fail(
        403,
        "ULTRA_MEMBER_OWNER_ONLY",
        "Member tier Ultra hanya bisa diedit oleh Owner.",
      );
    }
  }

  const passwordChangeRequested = Boolean(body.data.memberPassword?.trim());
  if (
    passwordChangeRequested &&
    session.data.profile.role !== "Owner" &&
    session.data.profile.role !== "Manajer"
  ) {
    return fail(
      403,
      "MEMBER_PASSWORD_ADMIN_ONLY",
      "Password member hanya bisa diubah oleh Manajer atau Owner.",
    );
  }

  let updated;
  try {
    updated = await updateCustomerCrmProfile(id, {
      ...body.data,
      ultraApprovedBy: body.data.cardTier === "Ultra" ? session.data.user.id : null,
    });
  } catch (error) {
    return fail(
      409,
      "CUSTOMER_UPDATE_CONFLICT",
      error instanceof Error ? error.message : "Gagal update customer.",
    );
  }
  if (!updated) {
    return fail(404, "CUSTOMER_NOT_FOUND", "Customer tidak ditemukan.");
  }

  return ok({ ok: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;

  const role = session.data.profile.role;
  const isOwner = role === "Owner";
  const isManajer = role === "Manajer";
  if (!isOwner && !isManajer) {
    return fail(
      403,
      "MEMBER_DELETE_FORBIDDEN",
      "Hapus member hanya untuk Owner atau Manajer.",
    );
  }

  const { id } = await context.params;

  const currentTier = await getCustomerCardTier(id);
  if (currentTier === "Ultra" && !isOwner) {
    return fail(
      403,
      "ULTRA_MEMBER_OWNER_ONLY",
      "Member tier Ultra hanya bisa dihapus oleh Owner.",
    );
  }

  const deleted = await deleteCustomerCrmProfile(id);
  if (!deleted) {
    return fail(404, "CUSTOMER_NOT_FOUND", "Customer tidak ditemukan.");
  }

  return ok({ ok: true });
}
