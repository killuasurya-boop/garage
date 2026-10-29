// =============================================================================
// API key agent AI (OpenClaw / Hermes → WhatsApp & Telegram).
// - Key "gk_agent_<40 base62>" hanya ditampilkan sekali; DB menyimpan sha256.
// - Dipakai lewat header `Authorization: Bearer gk_agent_…` (atau
//   `x-garage-agent-key`) di endpoint /api/* mana pun → requireGarageSession
//   membangun sesi sintetis atas nama Owner pembuat key.
// - Scope: owner (penuh) | manajer | readonly (GET saja + izin ":read").
// - Metode & path request diteruskan src/proxy.ts (header x-garage-agent-*),
//   sehingga key hanya berlaku di /api dan scope baca-saja bisa ditegakkan.
// =============================================================================
import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull, notLike } from "drizzle-orm";

import { getDb } from "@/db";
import { agentApiKeys, auditLogs, outlets, staffProfiles, user } from "@/db/schema";
import { fail } from "@/lib/api-response";
import type { Role } from "@/lib/garage-data";
import { secretsMatch } from "@/lib/secret-compare";
import type { GarageSession } from "@/lib/server-auth";

export const AGENT_KEY_PREFIX = "gk_agent_";
export const AGENT_KEY_HEADER = "x-garage-agent-key";
/** Label key sementara MCP ChatGPT (mcp-delegated-api.ts). */
export const DELEGATED_KEY_LABEL_PREFIX = "ChatGPT·op ";
/** Diisi src/proxy.ts dari request asli (nilai kiriman klien dibuang). */
export const AGENT_METHOD_HEADER = "x-garage-agent-method";
export const AGENT_PATH_HEADER = "x-garage-agent-path";

export const AGENT_SCOPES = ["owner", "manajer", "readonly"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const AGENT_SCOPE_LABEL: Record<AgentScope, string> = {
  owner: "Owner penuh",
  manajer: "Manajer",
  readonly: "Baca-saja",
};

const SCOPE_ROLE: Record<AgentScope, Role> = { owner: "Owner", manajer: "Manajer", readonly: "Owner" };
const RATE_LIMIT_PER_MINUTE = 120;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function generateAgentKey() {
  const bytes = randomBytes(40);
  let body = "";
  for (const byte of bytes) body += BASE62[byte % 62];
  return `${AGENT_KEY_PREFIX}${body}`;
}

export function hashAgentKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** Ambil key agent dari header (Bearer gk_agent_… atau x-garage-agent-key). */
export function extractAgentKey(headers: Headers): string | null {
  const auth = headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  if (bearer?.startsWith(AGENT_KEY_PREFIX)) return bearer;
  const direct = headers.get(AGENT_KEY_HEADER)?.trim();
  if (direct?.startsWith(AGENT_KEY_PREFIX)) return direct;
  return null;
}

/** Path /api yang tidak boleh diakses lewat key (kelola key, auth, job internal). */
export function isAgentForbiddenPath(path: string) {
  return (
    path.startsWith("/api/auth") ||
    path.startsWith("/api/agent-keys") ||
    path.startsWith("/api/jobs") ||
    path.startsWith("/api/cron") ||
    path.startsWith("/api/webhooks") ||
    path.startsWith("/api/ai/jobs") ||
    path.startsWith("/api/ai/providers") ||
    path.startsWith("/api/admin/purge") ||
    path.startsWith("/api/account") ||
    // Identitas & akses (user, role, PIN, reset password, sesi, force-logout):
    // aksi R3 (PRD V4.0 §07.2) butuh MFA — key statis tidak punya.
    path.startsWith("/api/admin/users") ||
    // Owner AI Connect: AI tidak boleh membuat kode verifikasi untuk dirinya sendiri / mencabut koneksi.
    path.startsWith("/api/owner-ai") ||
    path.startsWith("/api/admin/security")
  );
}

/**
 * GET yang tetap diaudit (data keuangan, laporan, payroll, kontrol Owner).
 * Request yang mengubah data selalu diaudit.
 */
const AUDITED_READ_PREFIXES = [
  "/api/finance",
  "/api/reports",
  "/api/control",
  "/api/payroll",
  "/api/wallet-gaji",
  "/api/wallet-fee",
  "/api/earnings",
  "/api/owner",
  "/api/hr",
  "/api/approvals",
  "/api/audit",
];

export function agentRequestNeedsAudit(method: string, path: string) {
  if (method !== "GET" && method !== "HEAD") return true;
  return AUDITED_READ_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// ─── Rate limit per key (persisten, F-06) ───────────────────────────────────
// Penghitung di DB (rate_limit_counters): tidak ter-reset saat restart dan
// berlaku lintas proses — dulu Map in-memory per proses.
async function overRateLimit(keyId: string) {
  const { hitRateLimit } = await import("@/lib/rate-limit-db");
  return (await hitRateLimit(`agent-key:${keyId}`, { limit: RATE_LIMIT_PER_MINUTE, windowMs: 60_000 })).limited;
}

type AgentResolve = { data: GarageSession; response: null } | { data: null; response: Response };

/**
 * Validasi key & bangun sesi sintetis. `allowedRoles` sama seperti
 * requireGarageSession. Dipanggil hanya bila header key ada.
 */
export async function resolveAgentSession(rawKey: string, headers: Headers, allowedRoles?: Role[]): Promise<AgentResolve> {
  const deny = (status: number, code: string, message: string): AgentResolve => ({ data: null, response: fail(status, code, message) });
  const method = headers.get(AGENT_METHOD_HEADER)?.toUpperCase() ?? "";
  const path = headers.get(AGENT_PATH_HEADER) ?? "";
  if (!method || !path.startsWith("/api/")) {
    return deny(401, "AGENT_KEY_API_ONLY", "API key agent hanya berlaku untuk endpoint /api.");
  }
  if (isAgentForbiddenPath(path)) {
    return deny(403, "AGENT_FORBIDDEN_PATH", "Endpoint ini tidak boleh diakses lewat API key agent.");
  }

  const db = getDb();
  const keyHash = hashAgentKey(rawKey);
  const [row] = await db
    .select({
      key: agentApiKeys,
      userName: user.name,
      userEmail: user.email,
      user: user,
      profileId: staffProfiles.id,
      profileRole: staffProfiles.role,
      profileStatus: staffProfiles.status,
      outletId: outlets.id,
      outletCode: outlets.code,
      outletName: outlets.name,
      outletTimezone: outlets.timezone,
    })
    .from(agentApiKeys)
    .innerJoin(user, eq(user.id, agentApiKeys.actingUserId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, agentApiKeys.actingUserId))
    .innerJoin(outlets, eq(outlets.id, agentApiKeys.outletId))
    .where(eq(agentApiKeys.keyHash, keyHash))
    .limit(1);

  if (!row || !secretsMatch(keyHash, row.key.keyHash)) {
    return deny(401, "AGENT_KEY_INVALID", "API key agent tidak dikenal.");
  }
  if (row.key.revokedAt) return deny(401, "AGENT_KEY_REVOKED", "API key agent sudah dicabut.");
  if (row.key.expiresAt && row.key.expiresAt.getTime() <= Date.now()) {
    return deny(401, "AGENT_KEY_EXPIRED", "API key agent sudah kedaluwarsa. Buat key baru di Pengaturan → Integrasi.");
  }
  // Pemilik key harus tetap Owner aktif — Owner yang dinonaktifkan mematikan key-nya.
  if (row.profileRole !== "Owner" || row.profileStatus === "suspended" || row.profileStatus === "inactive") {
    return deny(401, "AGENT_KEY_OWNER_INACTIVE", "Pemilik API key bukan Owner aktif lagi.");
  }
  if (await overRateLimit(row.key.id)) {
    return deny(429, "AGENT_RATE_LIMITED", `Terlalu banyak permintaan (maks. ${RATE_LIMIT_PER_MINUTE}/menit per key).`);
  }

  const scope = (AGENT_SCOPES as readonly string[]).includes(row.key.scope) ? (row.key.scope as AgentScope) : "readonly";
  if (scope === "readonly" && method !== "GET" && method !== "HEAD") {
    return deny(403, "AGENT_READONLY", "API key ini baca-saja: hanya permintaan GET yang diizinkan.");
  }
  const role = SCOPE_ROLE[scope];
  if (allowedRoles?.length && !allowedRoles.includes(role)) {
    return deny(403, "FORBIDDEN", "Scope API key tidak punya akses untuk aksi ini.");
  }

  const ip = headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const now = new Date();
  const agentName = `${row.userName} · Agent ${row.key.label}`;
  void db
    .update(agentApiKeys)
    .set({ lastUsedAt: now, lastUsedIp: ip, useCount: row.key.useCount + 1 })
    .where(eq(agentApiKeys.id, row.key.id))
    .catch(() => undefined);
  // Audit SINKRON sebelum request diproses: bila jejak gagal dicatat, request
  // ditolak (dulu fire-and-forget — bisa hilang diam-diam; audit F-05).
  if (agentRequestNeedsAudit(method, path)) {
    try {
      await db.insert(auditLogs).values({
        time: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(now),
        actor: agentName,
        action: `Agent API ${method} ${path}`,
        object: row.key.label,
        device: `agent:${row.key.label}`,
        status: "recorded",
        metadata: { agentKeyId: row.key.id, scope, method, path, ip },
      });
    } catch {
      return deny(503, "AGENT_AUDIT_FAILED", "Jejak audit gagal dicatat; permintaan agent dibatalkan. Coba lagi.");
    }
  }

  const session = {
    data: {
      session: {
        id: `agent-${row.key.id}`,
        userId: row.user.id,
        token: `agent-${row.key.prefix}`,
        expiresAt: row.key.expiresAt ?? new Date(now.getTime() + 3_600_000),
        createdAt: row.key.createdAt,
        updatedAt: now,
        ipAddress: ip,
        userAgent: headers.get("user-agent"),
      } as unknown as GarageSession["session"],
      user: { ...row.user, name: agentName } as unknown as GarageSession["user"],
      profile: {
        id: row.profileId,
        role,
        shiftLabel: "Agent",
        deviceLabel: `agent:${row.key.label}`,
        passwordResetRequired: false,
        workstation: null,
        position: null,
        outlet: { id: row.outletId, code: row.outletCode, name: row.outletName, timezone: row.outletTimezone },
        agentKey: { id: row.key.id, label: row.key.label, scope },
      },
    } satisfies GarageSession,
    response: null,
  };
  return session;
}

// ─── Kelola key (Owner, sesi cookie) ────────────────────────────────────────

export type AgentKeyView = {
  id: string;
  label: string;
  prefix: string;
  scope: AgentScope;
  outletName: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  useCount: number;
  createdAt: string;
  status: "aktif" | "dicabut" | "kedaluwarsa";
};

export async function listAgentKeys(): Promise<AgentKeyView[]> {
  const rows = await getDb()
    .select({ key: agentApiKeys, outletName: outlets.name })
    .from(agentApiKeys)
    .innerJoin(outlets, eq(outlets.id, agentApiKeys.outletId))
    // Key sementara MCP ChatGPT (dicabut otomatis setelah 1 panggilan) tidak ditampilkan.
    .where(notLike(agentApiKeys.label, `${DELEGATED_KEY_LABEL_PREFIX}%`))
    .orderBy(desc(agentApiKeys.createdAt));
  const now = Date.now();
  return rows.map(({ key, outletName }) => ({
    id: key.id,
    label: key.label,
    prefix: key.prefix,
    scope: key.scope as AgentScope,
    outletName,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: key.lastUsedIp,
    useCount: key.useCount,
    createdAt: key.createdAt.toISOString(),
    status: key.revokedAt ? "dicabut" : key.expiresAt && key.expiresAt.getTime() <= now ? "kedaluwarsa" : "aktif",
  }));
}

export async function createAgentKey(
  input: { label: string; scope: AgentScope; expiresInDays: number | null },
  owner: GarageSession,
) {
  if (owner.profile.role !== "Owner" || owner.profile.agentKey) {
    throw new Error("Hanya Owner (login langsung) yang boleh membuat API key agent.");
  }
  const label = input.label.trim();
  if (label.length < 2 || label.length > 60) throw new Error("Nama key 2–60 karakter.");
  const db = getDb();
  const active = await db
    .select({ id: agentApiKeys.id, label: agentApiKeys.label })
    .from(agentApiKeys)
    .where(and(isNull(agentApiKeys.revokedAt), eq(agentApiKeys.label, label)));
  if (active.length) throw new Error(`Key aktif bernama "${label}" sudah ada. Pakai nama lain atau cabut yang lama.`);

  const key = generateAgentKey();
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;
  const [record] = await db
    .insert(agentApiKeys)
    .values({
      label,
      prefix: key.slice(0, AGENT_KEY_PREFIX.length + 6),
      keyHash: hashAgentKey(key),
      scope: input.scope,
      outletId: owner.profile.outlet.id,
      actingUserId: owner.user.id,
      expiresAt,
      createdBy: owner.user.id,
    })
    .returning();
  await db.insert(auditLogs).values({
    time: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date()),
    actor: owner.user.name,
    action: "API key agent dibuat",
    object: label,
    device: owner.profile.deviceLabel,
    status: "recorded",
    metadata: { agentKeyId: record.id, scope: input.scope, expiresAt: expiresAt?.toISOString() ?? null, prefix: record.prefix },
  });
  return { key, id: record.id, prefix: record.prefix };
}

export async function revokeAgentKey(id: string, owner: GarageSession) {
  if (owner.profile.role !== "Owner" || owner.profile.agentKey) {
    throw new Error("Hanya Owner (login langsung) yang boleh mencabut API key agent.");
  }
  const db = getDb();
  const [row] = await db
    .update(agentApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(agentApiKeys.id, id), isNull(agentApiKeys.revokedAt)))
    .returning();
  if (!row) throw new Error("Key tidak ditemukan atau sudah dicabut.");
  await db.insert(auditLogs).values({
    time: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date()),
    actor: owner.user.name,
    action: "API key agent dicabut",
    object: row.label,
    device: owner.profile.deviceLabel,
    status: "recorded",
    metadata: { agentKeyId: row.id, prefix: row.prefix },
  });
  return { id: row.id };
}
