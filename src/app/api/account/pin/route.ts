import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/db";
import { account } from "@/db/schema";
import { getOwnPinStatus, setOwnApprovalPin } from "@/lib/admin-user-service";
import { fail, ok, readJson } from "@/lib/api-response";
import { auth } from "@/lib/auth";
import { guardLockedFor, guardRecordFail, guardReset, lockedMessage, PIN_CHANGE_POLICY } from "@/lib/pin-guard";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PIN persetujuan mandiri: Owner & Manajer mengganti PIN-nya sendiri (dipakai
// memutus void/refund/diskon langsung di tablet kasir).
const APPROVER_ROLES = ["Owner", "Manajer"] as const;

const schema = z.object({
  currentPassword: z.string().min(1, "Password akun wajib diisi."),
  newPin: z.string().trim().regex(/^\d{4,8}$/, "PIN harus 4-8 digit angka."),
});

export async function GET() {
  const session = await requireGarageSession([...APPROVER_ROLES]);
  if (session.response) return session.response;

  return ok(await getOwnPinStatus(session.data.user.id));
}

export async function POST(request: Request) {
  const session = await requireGarageSession([...APPROVER_ROLES]);
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;

  // Password salah / PIN bentrok dihitung gagal: cegah tebak password dan
  // "mencari" PIN staf lain lewat pesan PIN-sudah-dipakai.
  const guardKey = `pin-change:${session.data.user.id}`;
  const lockedFor = guardLockedFor(guardKey);
  if (lockedFor) return fail(429, "PIN_CHANGE_LOCKED", lockedMessage(lockedFor));

  // Konfirmasi password akun supaya tablet yang ditinggal login tidak bisa
  // dipakai orang lain untuk mengganti PIN persetujuan.
  const [credential] = await getDb()
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, session.data.user.id), eq(account.providerId, "credential")))
    .limit(1);
  if (!credential?.password) {
    return fail(400, "CREDENTIAL_NOT_FOUND", "Akun credential tidak ditemukan.");
  }
  const ctx = await auth.$context;
  const valid = await ctx.password.verify({
    hash: credential.password,
    password: parsed.data.currentPassword,
  });
  if (!valid) {
    guardRecordFail(guardKey, PIN_CHANGE_POLICY);
    return fail(403, "CURRENT_PASSWORD_INVALID", "Password akun tidak sesuai.");
  }

  const result = await setOwnApprovalPin(session.data.user.id, parsed.data.newPin, {
    actorUserId: session.data.user.id,
    actorName: session.data.user.name,
    actorRole: session.data.profile.role,
    deviceLabel: session.data.profile.deviceLabel,
  });
  if ("error" in result) {
    guardRecordFail(guardKey, PIN_CHANGE_POLICY);
    return fail(400, "SET_PIN_FAILED", result.error);
  }
  guardReset(guardKey);
  return ok({ pinConfigured: true });
}
