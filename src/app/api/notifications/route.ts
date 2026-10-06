import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { listStaffNotifications, markStaffNotificationsRead } from "@/lib/staff-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pusat notifikasi staf: feed 48 jam terakhir sesuai peran akun (kasir, kurir,
// waiter, produksi, manajemen) + jumlah belum dibaca.
export async function GET() {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const { user, profile } = session.data;
  return ok(
    await listStaffNotifications({
      userId: user.id,
      outletId: profile.outlet.id,
      profile: { role: profile.role, workstation: profile.workstation, position: profile.position },
    }),
  );
}

const markSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

// Tandai dibaca (satu, beberapa, atau semua id yang sedang tampil).
export async function POST(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const body = await readJson(request, markSchema);
  if (body.error) return body.error;
  return ok(await markStaffNotificationsRead(session.data.user.id, body.data.ids));
}
