// =============================================================================
// Panggilan /api atas nama Owner untuk MCP ChatGPT (tool ubah_data_garage).
//
// Token OAuth ChatGPT tidak pernah diteruskan ke route lain. Untuk SATU
// panggilan yang sudah dikonfirmasi Owner, server membuat API key agent
// sementara (scope owner, berlaku 2 menit, label "ChatGPT·op …"), memanggil
// route lewat alamat internal, lalu langsung mencabut key itu. Dengan begitu
// semua penjaga yang ada ikut berlaku: path terlarang agent, audit sinkron
// per request, rate limit, `requireHumanSession`, setting yang dilindungi,
// validasi Zod & aturan bisnis di route.
// Key ini tidak pernah keluar dari proses server dan disembunyikan dari daftar
// API key di Pengaturan → Integrasi.
// =============================================================================
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { agentApiKeys } from "@/db/schema";
import { AGENT_KEY_PREFIX, DELEGATED_KEY_LABEL_PREFIX, generateAgentKey, hashAgentKey, type AgentScope } from "@/lib/agent-api-key";
import type { GarageSession } from "@/lib/server-auth";

const DELEGATED_KEY_TTL_MS = 2 * 60_000;
const RESPONSE_TEXT_LIMIT = 6_000;

export type DelegatedRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  /** Multipart (mis. unggah foto) — menggantikan `body` JSON; content-type diisi fetch (boundary). */
  form?: FormData;
};

export type DelegatedResponse = { status: number; ok: boolean; json: unknown; text: string | null };

const SECRET_KEY_EXACT = new Set(["pin", "pincode", "otp", "totp", "apikey", "backupcode", "backupcodes"]);
const SECRET_REPLACEMENT = "[disembunyikan — lihat langsung di layar Garage OS]";

/** Nama field yang berisi kredensial (PIN, password, token, secret). */
export function isSecretKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  return (
    SECRET_KEY_EXACT.has(normalized) ||
    normalized.endsWith("pin") ||
    normalized.endsWith("password") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("token")
  );
}

/**
 * Kredensial tidak pernah keluar ke chat: route yang membuat akun/karyawan bisa
 * mengembalikan PIN atau password awal — nilainya diganti sebelum dikirim ke
 * ChatGPT atau disimpan sebagai hasil operasi.
 */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isSecretKey(key) && entry !== null && entry !== undefined && entry !== "" ? SECRET_REPLACEMENT : redactSecrets(entry),
      ]),
    );
  }
  return value;
}

function trimJson(raw: unknown): unknown {
  const value = redactSecrets(raw);
  const text = JSON.stringify(value ?? null);
  return text.length > RESPONSE_TEXT_LIMIT ? { terpotong: true, awal: text.slice(0, RESPONSE_TEXT_LIMIT) } : value;
}

export async function callApiAsOwner(
  session: GarageSession,
  request: DelegatedRequest,
  options: { operationId: string; internalOrigin: string; scope?: AgentScope },
): Promise<DelegatedResponse> {
  const db = getDb();
  const key = generateAgentKey();
  const scope = options.scope ?? "owner";
  const [record] = await db
    .insert(agentApiKeys)
    .values({
      label: `${DELEGATED_KEY_LABEL_PREFIX}${options.operationId.slice(0, 8)}${scope === "readonly" ? " baca" : ""}`,
      prefix: key.slice(0, AGENT_KEY_PREFIX.length + 6),
      keyHash: hashAgentKey(key),
      scope,
      outletId: session.profile.outlet.id,
      actingUserId: session.user.id,
      expiresAt: new Date(Date.now() + DELEGATED_KEY_TTL_MS),
      createdBy: session.user.id,
    })
    .returning({ id: agentApiKeys.id });
  try {
    const url = new URL(request.path, options.internalOrigin);
    for (const [name, value] of Object.entries(request.query ?? {})) url.searchParams.set(name, value);
    const form = request.method !== "GET" ? request.form : undefined;
    const hasBody = !form && request.method !== "GET" && request.body !== undefined;
    const response = await fetch(url, {
      method: request.method,
      headers: { authorization: `Bearer ${key}`, ...(hasBody ? { "content-type": "application/json" } : {}) },
      body: form ?? (hasBody ? JSON.stringify(request.body) : undefined),
      cache: "no-store",
    });
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      return { status: response.status, ok: response.ok, json: trimJson(await response.json().catch(() => null)), text: null };
    }
    const text = await response.text().catch(() => "");
    return { status: response.status, ok: response.ok, json: null, text: text.slice(0, RESPONSE_TEXT_LIMIT) };
  } finally {
    await db.update(agentApiKeys).set({ revokedAt: new Date() }).where(eq(agentApiKeys.id, record.id));
  }
}
