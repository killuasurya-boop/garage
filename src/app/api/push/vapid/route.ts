import { fail, ok } from "@/lib/api-response";
import { getVapidKeys } from "@/lib/web-push-sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kunci publik VAPID (aman dibagikan) untuk pushManager.subscribe di browser.
export async function GET() {
  try {
    const { publicKey } = await getVapidKeys();
    return ok({ publicKey });
  } catch (error) {
    return fail(503, "PUSH_UNAVAILABLE", error instanceof Error ? error.message : "Push belum siap.");
  }
}
