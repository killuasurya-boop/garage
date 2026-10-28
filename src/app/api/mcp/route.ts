// Server MCP (Model Context Protocol) — Streamable HTTP, stateless, JSON-RPC 2.0.
// Daftarkan di OpenClaw / Hermes: URL https://<domain>/api/mcp dengan header
// Authorization: Bearer gk_agent_… (key scope Owner atau Manajer).
import { agentToolContext } from "@/lib/agent-http";
import { handleMcpMessage, PROTOCOL_VERSION, rpcError, type JsonRpcRequest } from "@/lib/agent-mcp";
import { findAgentTool } from "@/lib/agent-tools";
import { auditMcpToolCall } from "@/lib/mcp-tool-audit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await requireGarageSession();
  if (session.response) {
    const res = session.response;
    if (res.status === 401) {
      return new Response(await res.text(), {
        status: 401,
        headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="garage-os", error="invalid_token"' },
      });
    }
    return res;
  }
  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }
  const ctx = await agentToolContext();
  const garage = session.data;
  // Audit per tool (dulu hanya satu baris "POST /api/mcp" untuk seluruh request):
  // sinkron sebelum eksekusi — gagal dicatat = tool tidak dijalankan.
  const beforeToolCall = (name: string, args: unknown) =>
    auditMcpToolCall({
      actor: garage.user.name,
      device: garage.profile.deviceLabel,
      label: "Agent MCP",
      tool: name,
      args,
      metadata: {
        source: garage.profile.agentKey ? "agent-key" : "session",
        agentKeyId: garage.profile.agentKey?.id ?? null,
        risk: findAgentTool(name)?.risk ?? null,
        userId: garage.user.id,
      },
    });
  const messages = Array.isArray(payload) ? payload : [payload];
  const responses = [];
  for (const message of messages) {
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      responses.push(rpcError(message?.id ?? null, -32600, "Invalid Request"));
      continue;
    }
    // Notifikasi (tanpa id) tidak dibalas.
    if (message.id === undefined || message.method.startsWith("notifications/")) continue;
    responses.push(await handleMcpMessage(message, garage, ctx, { beforeToolCall }));
  }
  if (!responses.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(payload) ? responses : responses[0], {
    headers: { "mcp-protocol-version": PROTOCOL_VERSION },
  });
}

export async function GET() {
  // Stateless: tidak ada stream SSE server→klien.
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
