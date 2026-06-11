import { fail, ok } from "@/lib/api-response";
import { dispatchBroadcast } from "@/lib/messaging/dispatch-broadcast";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/marketing/broadcasts/[id]/send
// Kirim broadcast ke semua penerima segmen (mode provider aktif; default simulasi).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("marketing:write");
  if (session.response) return session.response;

  const { id } = await params;

  try {
    const summary = await dispatchBroadcast(id);
    return ok(summary);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal mengirim broadcast.";
    // Pesan domain (sudah dikirim / tidak ditemukan) -> 400; lainnya 500.
    const isDomain =
      /tidak ditemukan|sudah|sedang|dibatalkan/i.test(message);
    return fail(
      isDomain ? 400 : 500,
      isDomain ? "BROADCAST_STATE" : "INTERNAL_ERROR",
      message,
    );
  }
}
