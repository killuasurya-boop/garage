// Handler MCP untuk ChatGPT (OAuth, keputusan Owner D-01). Token sudah
// diverifikasi requireMcpAuth (signature, issuer, audience, expiry, scope);
// di sini: kill switch → akun Owner aktif + 2FA → audit sinkron → tool.
// Memakai mesin MCP & tool registry yang sama dengan /api/mcp (tanpa duplikasi).
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { outlets, staffProfiles, user } from "@/db/schema";
import { handleMcpMessage, PROTOCOL_VERSION, rpcError, type JsonRpcRequest } from "@/lib/agent-mcp";
import { agentInternalOrigin } from "@/lib/agent-tools";
import { loadSettingsByKeys } from "@/lib/garage-settings-service";
import type { Role } from "@/lib/garage-data";
import { mcpChatgptAccess } from "@/lib/mcp-chatgpt-access";
import { runToolWithConfirmation } from "@/lib/mcp-confirmation";
import { auditMcpToolCall } from "@/lib/mcp-tool-audit";
import { hitRateLimit } from "@/lib/rate-limit-db";
import type { GarageSession } from "@/lib/server-auth";

// garage_api memanggil /api lain dengan header Authorization; token OAuth belum
// diterima rute lain (batch M3 menggantinya dengan tool bisnis eksplisit).
const HIDDEN_TOOLS: ReadonlySet<string> = new Set(["garage_api"]);
const DEVICE = "mcp:chatgpt";
/** Per akun Owner per menit — satu percakapan biasanya < 10 panggilan tool. */
const CHATGPT_RATE_LIMIT_PER_MINUTE = 60;

type Claims = { sub?: unknown; client_id?: unknown; azp?: unknown; scope?: unknown };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "mcp-protocol-version": PROTOCOL_VERSION } });
}

async function loadOwnerSession(userId: string): Promise<{ session: GarageSession } | { error: Response }> {
  const db = getDb();
  const [row] = await db
    .select({
      user,
      profileId: staffProfiles.id,
      role: staffProfiles.role,
      status: staffProfiles.status,
      outletId: outlets.id,
      outletCode: outlets.code,
      outletName: outlets.name,
      outletTimezone: outlets.timezone,
    })
    .from(user)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .innerJoin(outlets, eq(outlets.id, staffProfiles.outletId))
    .where(eq(user.id, userId))
    .limit(1);

  const access = mcpChatgptAccess({
    role: row?.role,
    status: row?.status,
    twoFactorEnabled: Boolean((row?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled),
  });
  if (!row || !access.allowed) {
    const error = access.allowed ? { code: "STAFF_PROFILE_MISSING", message: "Akun tidak ditemukan." } : access;
    return { error: json(rpcError(null, -32001, `${error.code}: ${error.message}`), 403) };
  }

  const now = new Date();
  return {
    session: {
      session: {
        id: `mcp-chatgpt-${row.user.id}`,
        userId: row.user.id,
        token: "mcp-chatgpt",
        expiresAt: new Date(now.getTime() + 15 * 60_000),
        createdAt: now,
        updatedAt: now,
        ipAddress: null,
        userAgent: "ChatGPT MCP",
      } as unknown as GarageSession["session"],
      user: { ...row.user, name: `${row.user.name} · ChatGPT` } as unknown as GarageSession["user"],
      profile: {
        id: row.profileId,
        role: row.role as Role,
        shiftLabel: "ChatGPT",
        deviceLabel: DEVICE,
        passwordResetRequired: false,
        workstation: null,
        position: null,
        outlet: { id: row.outletId, code: row.outletCode, name: row.outletName, timezone: row.outletTimezone },
        agentKey: null,
      },
    },
  };
}

export async function handleMcpChatgptRequest(request: Request, claims: Claims): Promise<Response> {
  const settings = await loadSettingsByKeys(["mcpChatgptPaused"]);
  if (settings["mcpChatgptPaused"]) {
    return json(rpcError(null, -32002, "MCP_PAUSED: Koneksi ChatGPT sedang dijeda Owner (Pengaturan → Keamanan)."), 503);
  }
  if (typeof claims.sub !== "string" || !claims.sub) {
    return json(rpcError(null, -32001, "INVALID_TOKEN: Token tidak terikat ke akun."), 401);
  }
  const owner = await loadOwnerSession(claims.sub);
  if ("error" in owner) return owner.error;
  // F-06: batas persisten per akun Owner (bukan per token) — bertahan saat restart.
  const limit = await hitRateLimit(`mcp-chatgpt:${claims.sub}`, { limit: CHATGPT_RATE_LIMIT_PER_MINUTE, windowMs: 60_000 });
  if (limit.limited) {
    return json(rpcError(null, -32003, `RATE_LIMITED: Terlalu banyak permintaan (maks. ${CHATGPT_RATE_LIMIT_PER_MINUTE}/menit). Coba lagi sebentar.`), 429);
  }
  const { session } = owner;

  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = await request.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  const clientId = typeof claims.client_id === "string" ? claims.client_id : typeof claims.azp === "string" ? claims.azp : null;
  // Audit SINKRON sebelum eksekusi: bila gagal dicatat, tool tidak dijalankan.
  const beforeToolCall = (name: string, args: unknown) =>
    auditMcpToolCall({
      actor: session.user.name,
      device: DEVICE,
      label: "ChatGPT MCP",
      tool: name,
      args,
      metadata: { source: "chatgpt", oauthClientId: clientId, userId: session.user.id },
    });

  const ctx = { authorization: "", internalOrigin: agentInternalOrigin() };
  const messages = Array.isArray(payload) ? payload : [payload];
  const responses = [];
  for (const message of messages) {
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      responses.push(rpcError(message?.id ?? null, -32600, "Invalid Request"));
      continue;
    }
    if (message.id === undefined || message.method.startsWith("notifications/")) continue;
    responses.push(
      await handleMcpMessage(message, session, ctx, {
        hiddenTools: HIDDEN_TOOLS,
        beforeToolCall,
        // D-01: aksi R2/R3 = preview → konfirmasi Owner di chat → eksekusi → receipt.
        confirmRiskyTools: true,
        callTool: (name, args, toolCtx) => runToolWithConfirmation({ session, name, rawArgs: args, ctx: toolCtx, oauthClientId: clientId }),
      }),
    );
  }
  if (!responses.length) return new Response(null, { status: 202 });
  return json(Array.isArray(payload) ? responses : responses[0]);
}
