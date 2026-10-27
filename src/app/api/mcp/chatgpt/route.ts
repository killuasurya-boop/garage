// MCP untuk ChatGPT — Streamable HTTP stateless, OAuth 2.1 (bukan API key).
// Aktif hanya bila GARAGE_MCP_CHATGPT_ENABLED=true (lihat mcp-chatgpt-config.ts).
// Token diverifikasi requireMcpAuth (JWKS, issuer, audience, expiry, scope);
// 401 tanpa token membawa WWW-Authenticate RFC 9728 agar ChatGPT memulai OAuth.
import { requireMcpAuth } from "@better-auth/mcp";

import { agentInternalOrigin } from "@/lib/agent-tools";
import { auth, mcpChatgpt } from "@/lib/auth";
import { handleMcpChatgptRequest } from "@/lib/mcp-chatgpt-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const protectedHandler = mcpChatgpt.enabled
  ? requireMcpAuth(auth, (request, claims) => handleMcpChatgptRequest(request, claims), {
      resource: mcpChatgpt.resource,
      requiredScopes: ["garage:owner"],
      // JWKS diambil dari server ini sendiri lewat alamat internal, bukan lewat
      // domain publik (hindari hairpin VPS → internet → VPS).
      jwksUrl: `${agentInternalOrigin()}/api/auth/jwks`,
    })
  : null;

export async function POST(request: Request) {
  if (!protectedHandler) return new Response(null, { status: 404 });
  return protectedHandler(request);
}

export async function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
