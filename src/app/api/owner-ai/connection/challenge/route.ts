import { fail, ok } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { createVerificationChallenge } from "@/lib/owner-ai-connect";
import { hitRateLimit } from "@/lib/rate-limit-db";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Buat kode verifikasi ChatGPT (Owner saja). Kode hanya muncul di respons ini — tidak dicatat. */
export async function POST() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  // Hanya Owner di layar Garage OS — API key/agent (termasuk kunci delegasi ChatGPT) ditolak.
  if (session.data.profile.agentKey) return fail(403, "FORBIDDEN", "AI Connect hanya dari layar Owner, bukan API key.");
  const limited = await hitRateLimit(`owner-ai-challenge:${session.data.user.id}`, { limit: 10, windowMs: 10 * 60_000 });
  if (limited.limited) return fail(429, "RATE_LIMITED", "Terlalu sering membuat kode. Tunggu beberapa menit.");

  const challenge = await createVerificationChallenge(session.data.user.id);
  await createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "AI Connect: kode verifikasi dibuat",
    object: "ChatGPT",
    device: session.data.profile.deviceLabel,
    status: "created",
    metadata: { module: "owner-ai", challengeId: challenge.challengeId, expiresAt: challenge.expiresAt },
  }).catch(() => undefined);
  return ok(challenge, { headers: { "cache-control": "no-store" } });
}
