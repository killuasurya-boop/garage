import { fail, ok } from "@/lib/api-response";
import { lookupMemberByPhone } from "@/lib/member-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const phone = url.searchParams.get("phone")?.trim();
  if (!phone) {
    return fail(400, "VALIDATION_ERROR", "Nomor HP member wajib diisi.");
  }

  const result = await lookupMemberByPhone(phone);
  if (!result.data) {
    return fail(404, "MEMBER_NOT_FOUND", result.error ?? "Member tidak ditemukan.");
  }

  return ok(result.data);
}

export async function POST(_request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) {
    return session.response;
  }

  return fail(
    403,
    "POS_MEMBER_REGISTRATION_DISABLED",
    "Member wajib registrasi sendiri lewat portal member.",
  );
}
