// Inti server MCP (JSON-RPC 2.0) — dipakai src/app/api/mcp/route.ts & tes.
import { AgentToolError, listAgentTools, runAgentTool, type AgentToolContext } from "@/lib/agent-tools";
import { GARAGE_DOMAINS, RISK_LABELS, riskNeedsConfirmation } from "@/lib/mcp-tool-registry";
import type { GarageSession } from "@/lib/server-auth";

function domainLabel(id: string) {
  return GARAGE_DOMAINS.find((domain) => domain.id === id)?.label ?? id;
}

export const PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);

export type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
export function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export type McpMessageOptions = {
  /** Tool yang tidak tersedia di pintu masuk ini (mis. garage_api di MCP ChatGPT). */
  hiddenTools?: ReadonlySet<string>;
  /** Dipanggil sebelum tools/call dijalankan; melempar error = tool batal. */
  beforeToolCall?: (name: string, args: unknown) => Promise<void>;
  /** Pengganti eksekusi tool (mis. preview → konfirmasi R2/R3 di MCP ChatGPT). */
  callTool?: (name: string, args: unknown, ctx: AgentToolContext) => Promise<unknown>;
  /** Tambahkan parameter `konfirmasi` ke skema tool R2/R3 (pasangan callTool konfirmasi). */
  confirmRiskyTools?: boolean;
};

function withConfirmationParam(schema: unknown) {
  const base = (schema && typeof schema === "object" ? schema : {}) as { properties?: Record<string, unknown> };
  return {
    ...base,
    properties: {
      ...(base.properties ?? {}),
      konfirmasi: {
        type: "string",
        description:
          "Kosongkan pada panggilan pertama (server membalas preview + token). Isi dengan token dari preview HANYA setelah Owner setuju.",
      },
    },
  };
}

export async function handleMcpMessage(
  message: JsonRpcRequest,
  session: GarageSession,
  ctx: AgentToolContext,
  options: McpMessageOptions = {},
) {
  const id = message.id;
  const hidden = options.hiddenTools ?? new Set<string>();
  switch (message.method) {
    case "initialize": {
      const requested = String(message.params?.protocolVersion ?? PROTOCOL_VERSION);
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "garage-os", title: "Garage Coffee OS", version: "1.0.0" },
        instructions: [
          "Kontrol operasional Garage Coffee. Jawab owner dalam Bahasa Indonesia. Mulai dengan ringkasan_hari_ini.",
          "Untuk mengetahui apa yang bisa dan belum bisa dilakukan, panggil kemampuan_sistem.",
          options.confirmRiskyTools
            ? "Tool berlabel R2/R3 TIDAK langsung dijalankan: panggilan pertama membalas preview + token `konfirmasi`. Tunjukkan ringkasannya ke Owner, minta persetujuan eksplisit, lalu panggil ulang dengan argumen sama + `konfirmasi`. Klaim berhasil hanya bila ada receipt; cek dengan status_operasi bila ragu."
            : "Setiap tool diberi label risiko [R0 Baca … R3 Kritis]; jelaskan dampak aksi R2/R3 kepada Owner sebelum menjalankannya.",
          hidden.has("garage_api") ? "" : "Untuk hal yang tidak ada tool-nya pakai garage_api.",
          "Laporan file: buat_laporan (base64) lalu kirim sebagai dokumen.",
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: listAgentTools(session).filter((tool) => !hidden.has(tool.name)).map((tool) => ({
          name: tool.name,
          title: tool.title,
          // Risiko & domain di depan deskripsi supaya model memahami bobot aksi (PRD §07.2).
          description: `[${tool.risk} ${RISK_LABELS[tool.risk]} · ${domainLabel(tool.domain)}] ${tool.description}`,
          inputSchema:
            options.confirmRiskyTools && riskNeedsConfirmation(tool.risk) ? withConfirmationParam(tool.inputSchema) : tool.inputSchema,
          annotations: { readOnlyHint: tool.risk === "R0", destructiveHint: riskNeedsConfirmation(tool.risk) },
          _meta: { "garage/domain": tool.domain, "garage/risk": tool.risk },
        })),
      });
    case "tools/call": {
      const name = String(message.params?.name ?? "");
      if (hidden.has(name)) return rpcError(id, -32602, `UNKNOWN_TOOL: Tool "${name}" tidak tersedia di koneksi ini.`);
      try {
        await options.beforeToolCall?.(name, message.params?.arguments ?? {});
        const toolCtx = { ...ctx, hiddenTools: hidden };
        const args = message.params?.arguments ?? {};
        const result = options.callTool ? await options.callTool(name, args, toolCtx) : await runAgentTool(session, name, args, toolCtx);
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

