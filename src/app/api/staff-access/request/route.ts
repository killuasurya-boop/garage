// Pengajuan akses staf (I3, PRD V4.0 §06.5): pemohon login dengan akun biasa
// (belum punya profil staf). Peran/outlet/status TIDAK bisa dikirim pemohon.
import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requireAccountSession } from "@/lib/server-auth";
import { getMyAccessRequest, StaffAccessError, submitAccessRequest } from "@/lib/staff-access";

export const runtime = "nodejs";

// .strict() di-skip sengaja: field lain (role, outletId, status) diabaikan, bukan dipakai.
const schema = z.object({
  legalName: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(8).max(30),
  requestedPosition: z.string().trim().min(2).max(80),
  note: z.string().trim().max(500).optional(),
});

export async function GET() {
  const session = await requireAccountSession();
  if (session.response) return session.response;
  return ok(await getMyAccessRequest(session.data.id));
}

export async function POST(request: Request) {
  const session = await requireAccountSession();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  try {
    const account = session.data;
    return ok(
      await submitAccessRequest(
        { id: account.id, name: account.name, email: account.email, emailVerified: Boolean(account.emailVerified) },
        body.data,
      ),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof StaffAccessError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
