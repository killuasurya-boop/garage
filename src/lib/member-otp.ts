// =============================================================================
// OTP WhatsApp member (owner Nov 2026) — lapisan server. Aturan murni di
// member-otp-rules.ts. Kirim LANGSUNG ke WhatsApp Cloud API (bukan lewat
// whatsapp_messaging_queue) agar kode tidak pernah tersimpan polos di DB.
// =============================================================================

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { memberOtpChallenges } from "@/db/schema";
import { memberOtpSecret } from "@/lib/member-auth";
import {
  buildOtpTemplateMessage,
  checkOtpChallenge,
  generateOtpCode,
  generateOtpToken,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TOKEN_TTL_MS,
  OTP_TTL_MS,
  otpHash,
  otpHashEquals,
  otpSendBlockReason,
  resolveOtpConfig,
  type OtpConfig,
  type OtpPurpose,
} from "@/lib/member-otp-rules";
import { normalizePhone } from "@/lib/member-types";
import { normalizeWaNumber } from "@/lib/whatsapp-link";

export class MemberOtpError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function getMemberOtpConfig(): Promise<OtpConfig> {
  let connected = false;
  if (!process.env.WHATSAPP_CLOUD_API_TOKEN?.trim()) {
    try {
      const { getConnectedAccessToken } = await import("@/lib/garage-integrations");
      connected = Boolean((await getConnectedAccessToken("whatsapp", "phone_number")).token);
    } catch {
      connected = false;
    }
  }
  return resolveOtpConfig(process.env, connected);
}

async function deliverOtp(config: OtpConfig, phone: string, code: string) {
  if (config.mode === "dev_echo") return { status: "dev_echo", messageId: null };
  const to = normalizeWaNumber(phone);
  if (!to) throw new MemberOtpError("INVALID_PHONE", "Nomor WhatsApp tidak valid.");
  const { whatsappAccessToken } = await import("@/lib/garage-whatsapp-messaging");
  const token = await whatsappAccessToken();
  const version = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v23.0";
  const response = await fetch(
    `https://graph.facebook.com/${version}/${process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim()}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildOtpTemplateMessage({ to, template: config.template!, language: config.language, code })),
    },
  );
  const json = (await response.json().catch(() => ({}))) as { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } };
  if (!response.ok || !json.messages?.[0]?.id) {
    // Detail provider hanya ke log server (tanpa kode OTP); pelanggan dapat pesan umum.
    console.warn("[member-otp] kirim WhatsApp gagal:", response.status, json.error?.code, json.error?.message);
    throw new MemberOtpError("OTP_SEND_FAILED", "Kode WhatsApp gagal dikirim. Pastikan nomor aktif di WhatsApp, lalu coba lagi.", 502);
  }
  return { status: "sent", messageId: json.messages[0].id! };
}

export async function requestMemberOtp(input: { phone: string; purpose?: OtpPurpose; now?: Date }) {
  const config = await getMemberOtpConfig();
  if (!config.enabled) throw new MemberOtpError("OTP_DISABLED", "Verifikasi WhatsApp belum aktif.", 503);
  const purpose = input.purpose ?? "register";
  const phone = normalizePhone(input.phone);
  if (!normalizeWaNumber(phone)) throw new MemberOtpError("INVALID_PHONE", "Nomor WhatsApp tidak valid.");
  const now = input.now ?? new Date();
  const db = getDb();
  const recent = await db
    .select({ createdAt: memberOtpChallenges.createdAt })
    .from(memberOtpChallenges)
    .where(and(eq(memberOtpChallenges.phone, phone), gte(memberOtpChallenges.createdAt, new Date(now.getTime() - 24 * 3_600_000))))
    .orderBy(desc(memberOtpChallenges.createdAt));
  const block = otpSendBlockReason(recent.map((row) => row.createdAt), now);
  if (block) throw new MemberOtpError("OTP_RATE_LIMITED", block, 429);

  const code = generateOtpCode();
  const secret = memberOtpSecret();
  const [challenge] = await db
    .insert(memberOtpChallenges)
    .values({
      phone,
      purpose,
      codeHash: otpHash(secret, "code", phone, purpose, code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      deliveryStatus: "pending",
      createdAt: now,
    })
    .returning({ id: memberOtpChallenges.id, expiresAt: memberOtpChallenges.expiresAt });
  try {
    const delivery = await deliverOtp(config, phone, code);
    await db
      .update(memberOtpChallenges)
      .set({ deliveryStatus: delivery.status, providerMessageId: delivery.messageId })
      .where(eq(memberOtpChallenges.id, challenge.id));
  } catch (error) {
    await db.update(memberOtpChallenges).set({ deliveryStatus: "failed" }).where(eq(memberOtpChallenges.id, challenge.id));
    throw error;
  }
  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt.toISOString(),
    resendAfterSeconds: Math.round(OTP_RESEND_COOLDOWN_MS / 1000),
    maskedPhone: `${phone.slice(0, 4)}•••${phone.slice(-3)}`,
    // Hanya non-produksi + MEMBER_OTP_DEV_ECHO=1 (QA/E2E tanpa provider).
    devCode: config.mode === "dev_echo" ? code : undefined,
  };
}

/** Cek kode. Benar → token sekali pakai untuk register. Salah → attempts naik (atomik). */
export async function checkMemberOtpCode(input: { challengeId: string; code: string; now?: Date }) {
  const now = input.now ?? new Date();
  const db = getDb();
  const [challenge] = await db.select().from(memberOtpChallenges).where(eq(memberOtpChallenges.id, input.challengeId)).limit(1);
  const secret = memberOtpSecret();
  const code = input.code.replace(/\D/g, "");
  const submitted = challenge ? otpHash(secret, "code", challenge.phone, challenge.purpose as OtpPurpose, code) : "";
  const check = checkOtpChallenge(challenge ?? null, submitted, now);
  if (!check.ok) {
    if (challenge && check.code !== "NOT_FOUND" && check.code !== "ALREADY_USED") {
      await db
        .update(memberOtpChallenges)
        .set({ attempts: sql`${memberOtpChallenges.attempts} + 1` })
        .where(eq(memberOtpChallenges.id, challenge.id));
    }
    throw new MemberOtpError(check.code, check.message, check.code === "LOCKED" ? 429 : 400);
  }
  const token = generateOtpToken();
  // Klaim atomik: dua permintaan bersamaan tidak bisa sama-sama memverifikasi.
  const [claimed] = await db
    .update(memberOtpChallenges)
    .set({
      verifiedAt: now,
      attempts: sql`${memberOtpChallenges.attempts} + 1`,
      tokenHash: otpHash(secret, "token", challenge.phone, challenge.purpose as OtpPurpose, token),
      tokenExpiresAt: new Date(now.getTime() + OTP_TOKEN_TTL_MS),
    })
    .where(and(eq(memberOtpChallenges.id, challenge.id), isNull(memberOtpChallenges.verifiedAt), sql`${memberOtpChallenges.attempts} < ${OTP_MAX_ATTEMPTS}`))
    .returning({ id: memberOtpChallenges.id });
  if (!claimed) throw new MemberOtpError("ALREADY_USED", "Kode ini sudah dipakai. Minta kode baru.");
  return { verificationToken: token, phone: challenge.phone, tokenExpiresAt: new Date(now.getTime() + OTP_TOKEN_TTL_MS).toISOString() };
}

/** Token valid untuk nomor & tujuan ini (belum dipakai, belum kedaluwarsa)? Tidak mengonsumsi. */
export async function findValidOtpToken(input: { phone: string; token: string; purpose?: OtpPurpose; now?: Date }) {
  const purpose = input.purpose ?? "register";
  const phone = normalizePhone(input.phone);
  const hash = otpHash(memberOtpSecret(), "token", phone, purpose, input.token);
  const [row] = await getDb()
    .select()
    .from(memberOtpChallenges)
    .where(and(eq(memberOtpChallenges.tokenHash, hash), eq(memberOtpChallenges.phone, phone), eq(memberOtpChallenges.purpose, purpose)))
    .limit(1);
  const now = input.now ?? new Date();
  if (!row || row.consumedAt || !row.tokenExpiresAt || row.tokenExpiresAt <= now || !row.tokenHash || !otpHashEquals(row.tokenHash, hash)) {
    return null;
  }
  return row;
}

/** Tandai token terpakai (atomik). false = sudah dipakai permintaan lain. */
export async function consumeOtpToken(challengeId: string, now = new Date()) {
  const [row] = await getDb()
    .update(memberOtpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(memberOtpChallenges.id, challengeId), isNull(memberOtpChallenges.consumedAt)))
    .returning({ id: memberOtpChallenges.id });
  return Boolean(row);
}
