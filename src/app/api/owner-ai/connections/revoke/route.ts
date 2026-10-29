import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { revokeConnections } from "@/lib/owner-ai-connect";
import { hitRateLimit } from "@/lib/rate-limit-db";
import { requireGarageSession } from "@/lib/server-auth";
import { StepUpError, verifyUserTotp } from "@/lib/step-up-totp";

export const runtime = "nodejs";

const schema = z.object({
  /** Kosong = cabut semua koneksi ChatGPT Owner. */
  connectionId: z.string().uuid().optional(),
  alasan: z.string().trim().min(3, "Isi alasan pencabutan.").max(300),
  kode2fa: z.string().trim().regex(/^\d{6}$/, "Kode 2FA 6 angka."),
});

/**
 * Cabut koneksi ChatGPT (Owner + kode 2FA; blueprint R3). Token lama langsung ditolak gateway,
 * refresh token dicabut. Dashboard Owner & POS tidak terpengaruh.
 */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  // Hanya Owner di layar Garage OS — API key/agent (termasuk kunci delegasi ChatGPT) ditolak.
  if (session.data.profile.agentKey) return fail(403, "FORBIDDEN", "AI Connect hanya dari layar Owner, bukan API key.");
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const limited = await hitRateLimit(`owner-ai-revoke:${session.data.user.id}`, { limit: 10, windowMs: 10 * 60_000 });
  if (limited.limited) return fail(429, "RATE_LIMITED", "Terlalu banyak percobaan. Tunggu beberapa menit.");

  try {
    if (!(await verifyUserTotp(session.data.user.id, body.data.kode2fa))) {
      return fail(400, "INVALID_CODE", "Kode 2FA salah. Ketik 6 angka terbaru dari aplikasi authenticator.");
    }
  } catch (error) {
    if (error instanceof StepUpError) return fail(error.status, error.code, error.message);
    throw error;
  }

  const result = await revokeConnections({
    ownerUserId: session.data.user.id,
    actorUserId: session.data.user.id,
    connectionId: body.data.connectionId,
    reason: body.data.alasan,
  });
  await createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: body.data.connectionId ? "AI Connect: koneksi ChatGPT dicabut" : "AI Connect: SEMUA koneksi ChatGPT dicabut",
    object: "ChatGPT",
    device: session.data.profile.deviceLabel,
    status: "revoked",
    metadata: { module: "owner-ai", ...result, reason: body.data.alasan },
  }).catch(() => undefined);
  return ok(result);
}
