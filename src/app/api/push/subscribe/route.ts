import { z } from "zod";

import { isDatabaseConfigured } from "@/db";
import { fail, ok, readJson } from "@/lib/api-response";
import {
  getVapidPublicKey,
  isPushEnabled,
  subscribePush,
  unsubscribePush,
} from "@/lib/garage-push-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
  expirationTime: z.number().nullable().optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function GET() {
  const enabled = await isPushEnabled();
  const vapidPublicKey = getVapidPublicKey();
  return ok({
    enabled,
    vapidPublicKey,
    ready: enabled && Boolean(vapidPublicKey),
  });
}

export async function POST(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  if (!(await isPushEnabled())) {
    return fail(
      503,
      "PUSH_DISABLED",
      "Push notification dinonaktifkan di /control/settings → Notifikasi.",
    );
  }

  const parsed = await readJson(request, subscribeSchema);
  if (parsed.error) return parsed.error;

  const result = await subscribePush({
    userId: session.data.user.id,
    endpoint: parsed.data.endpoint,
    keys: parsed.data.keys,
    userAgent: parsed.data.userAgent ?? request.headers.get("user-agent"),
    expiresAt: parsed.data.expirationTime ? new Date(parsed.data.expirationTime) : null,
  });

  return ok(result, { status: result.created ? 201 : 200 });
}

export async function DELETE(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const parsed = await readJson(request, unsubscribeSchema);
  if (parsed.error) return parsed.error;

  const result = await unsubscribePush(parsed.data.endpoint, session.data.user.id);
  return ok(result);
}
