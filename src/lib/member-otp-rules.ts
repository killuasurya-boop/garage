// =============================================================================
// OTP WhatsApp member (owner Nov 2026) — aturan MURNI (tanpa DB/jaringan).
// Kode 6 digit dikirim lewat WhatsApp Cloud API (template kategori AUTHENTICATION).
// Kode & token hanya disimpan sebagai HMAC-SHA256 dengan secret server; tidak
// pernah masuk antrean pesan, log, atau respons API (kecuali mode dev-echo non-produksi).
// =============================================================================

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const OTP_MAX_SENDS_15_MIN = 3;
export const OTP_MAX_SENDS_PER_DAY = 8;
/** Token hasil verifikasi berlaku untuk menyelesaikan pendaftaran. */
export const OTP_TOKEN_TTL_MS = 15 * 60_000;

export type OtpPurpose = "register";

export function generateOtpCode() {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

export function generateOtpToken() {
  return randomBytes(32).toString("base64url");
}

/** HMAC terikat tujuan + nomor: kode yang sama tidak berlaku untuk nomor/tujuan lain. */
export function otpHash(secret: string, kind: "code" | "token", phone: string, purpose: OtpPurpose, value: string) {
  return createHmac("sha256", secret).update(`${kind}|${purpose}|${phone}|${value}`).digest("hex");
}

export function otpHashEquals(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/** Alasan menolak pengiriman kode (null = boleh kirim). `recent` = waktu kirim untuk nomor ini, terbaru dulu. */
export function otpSendBlockReason(recent: Date[], now = new Date()): string | null {
  const t = now.getTime();
  const last = recent[0];
  if (last && t - last.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (t - last.getTime())) / 1000);
    return `Tunggu ${wait} detik sebelum minta kode lagi.`;
  }
  if (recent.filter((at) => t - at.getTime() < 15 * 60_000).length >= OTP_MAX_SENDS_15_MIN) {
    return "Terlalu sering meminta kode. Coba lagi 15 menit lagi.";
  }
  if (recent.filter((at) => t - at.getTime() < 24 * 3_600_000).length >= OTP_MAX_SENDS_PER_DAY) {
    return "Batas kode hari ini tercapai. Coba lagi besok atau minta bantuan kasir.";
  }
  return null;
}

export type OtpCheck =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "EXPIRED" | "LOCKED" | "WRONG_CODE" | "ALREADY_USED"; message: string; attemptsLeft?: number };

/** Validasi kode terhadap tantangan (sebelum attempts dinaikkan). */
export function checkOtpChallenge(
  challenge: { codeHash: string; attempts: number; expiresAt: Date; verifiedAt: Date | null } | null,
  submittedHash: string,
  now = new Date(),
): OtpCheck {
  if (!challenge) return { ok: false, code: "NOT_FOUND", message: "Kode tidak ditemukan. Minta kode baru." };
  if (challenge.verifiedAt) return { ok: false, code: "ALREADY_USED", message: "Kode ini sudah dipakai. Minta kode baru." };
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, code: "LOCKED", message: "Terlalu banyak percobaan. Minta kode baru." };
  }
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, code: "EXPIRED", message: "Kode sudah kedaluwarsa. Minta kode baru." };
  }
  if (!otpHashEquals(challenge.codeHash, submittedHash)) {
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - challenge.attempts - 1);
    return {
      ok: false,
      code: attemptsLeft === 0 ? "LOCKED" : "WRONG_CODE",
      message: attemptsLeft === 0 ? "Kode salah. Batas percobaan habis — minta kode baru." : `Kode salah. Sisa ${attemptsLeft} percobaan.`,
      attemptsLeft,
    };
  }
  return { ok: true };
}

/**
 * Body request WhatsApp Cloud API untuk template AUTHENTICATION (Meta): parameter body = kode,
 * dan tombol "salin kode" (sub_type url, index 0) juga menerima kode.
 */
export function buildOtpTemplateMessage(input: { to: string; template: string; language: string; code: string }) {
  return {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.template,
      language: { code: input.language },
      components: [
        { type: "body", parameters: [{ type: "text", text: input.code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: input.code }] },
      ],
    },
  };
}

export type OtpConfig = {
  enabled: boolean;
  /** dev_echo = tanpa provider, kode dikembalikan di respons (HANYA non-produksi, untuk QA/E2E). */
  mode: "whatsapp" | "dev_echo" | "off";
  template: string | null;
  language: string;
  missing: string[];
};

/** Konfigurasi dari env. Token Cloud API bisa dari env ATAU integrasi tersambung (dicek di server). */
export function resolveOtpConfig(env: Record<string, string | undefined>, hasConnectedToken = false): OtpConfig {
  const language = env.WHATSAPP_OTP_TEMPLATE_LANG?.trim() || "id";
  if (env.MEMBER_OTP_DEV_ECHO === "1" && env.NODE_ENV !== "production") {
    return { enabled: true, mode: "dev_echo", template: null, language, missing: [] };
  }
  const missing: string[] = [];
  if (!env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim()) missing.push("WHATSAPP_CLOUD_PHONE_NUMBER_ID");
  if (!env.WHATSAPP_CLOUD_API_TOKEN?.trim() && !hasConnectedToken) missing.push("WHATSAPP_CLOUD_API_TOKEN");
  if (!env.WHATSAPP_OTP_TEMPLATE?.trim()) missing.push("WHATSAPP_OTP_TEMPLATE");
  if (env.MEMBER_OTP_ENABLED?.trim() === "false") missing.push("MEMBER_OTP_ENABLED=false");
  return {
    enabled: missing.length === 0,
    mode: missing.length === 0 ? "whatsapp" : "off",
    template: env.WHATSAPP_OTP_TEMPLATE?.trim() || null,
    language,
    missing,
  };
}

/**
 * Data customer POS lama yang berisi riwayat (poin/kunjungan) hanya boleh diklaim
 * akun member setelah nomor WA terbukti milik pendaftar (OTP).
 */
export function customerHasHistory(customer: { points: number; visits: number } | null | undefined) {
  return Boolean(customer && (customer.points > 0 || customer.visits > 0));
}
