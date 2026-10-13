// Inti server MCP (JSON-RPC 2.0) — dipakai src/app/api/mcp/route.ts & tes.
import { AgentToolError, listAgentTools, runAgentTool, type AgentToolContext } from "@/lib/agent-tools";
import type { GarageSession } from "@/lib/server-auth";

export const PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);

export type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
export function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function handleMcpMessage(message: JsonRpcRequest, session: GarageSession, ctx: AgentToolContext) {
  const id = message.id;
  switch (message.method) {
    case "initialize": {
      const requested = String(message.params?.protocolVersion ?? PROTOCOL_VERSION);
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "garage-os", title: "Garage Coffee & Motor OS", version: "1.0.0" },
        instructions:
          "Kontrol operasional Garage Coffee & Motor. Jawab owner dalam Bahasa Indonesia. Mulai dengan ringkasan_hari_ini. Untuk hal yang tidak ada tool-nya pakai garage_api. Laporan file: buat_laporan (base64) lalu kirim sebagai dokumen.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: listAgentTools(session).map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: !tool.write, destructiveHint: tool.write },
        })),
      });
    case "tools/call": {
      const name = String(message.params?.name ?? "");
      try {
        const result = await runAgentTool(session, name, message.params?.arguments ?? {}, ctx);
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: { result }, isError: false });
      } catch (error) {
        const text = error instanceof AgentToolError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : "Tool gagal.";
        if (error instanceof AgentToolError && error.code === "UNKNOWN_TOOL") return rpcError(id, -32602, text);
        return rpcResult(id, { content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Method tidak didukung: ${message.method}`);
  }
}

