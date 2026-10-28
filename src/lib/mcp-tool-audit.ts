// Audit per tool MCP (dipakai /api/mcp API key & /api/mcp/chatgpt). Dicatat
// SINKRON sebelum tool jalan: bila gagal tercatat, tool tidak dijalankan.
// Argumen diringkas (maks. 2.000 karakter); token konfirmasi tidak pernah ikut.
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { splitConfirmation } from "@/lib/mcp-confirmation";

const ARGS_PREVIEW_LIMIT = 2_000;

export function toolArgsPreview(args: unknown) {
  try {
    const text = JSON.stringify(args ?? {});
    return text.length > ARGS_PREVIEW_LIMIT ? `${text.slice(0, ARGS_PREVIEW_LIMIT)}…` : text;
  } catch {
    return "[tidak bisa diserialisasi]";
  }
}

export async function auditMcpToolCall(input: {
  actor: string;
  device: string;
  /** Label sumber di judul audit, mis. "ChatGPT MCP" / "Agent MCP". */
  label: string;
  tool: string;
  args: unknown;
  metadata: Record<string, unknown>;
}) {
  const { args, token } = splitConfirmation(input.args);
  const now = new Date();
  await getDb()
    .insert(auditLogs)
    .values({
      time: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(now),
      actor: input.actor,
      action: `${input.label} tool ${input.tool}`,
      object: input.tool,
      device: input.device,
      status: "recorded",
      metadata: { ...input.metadata, tool: input.tool, args: toolArgsPreview(args), withConfirmation: Boolean(token) },
    });
}
