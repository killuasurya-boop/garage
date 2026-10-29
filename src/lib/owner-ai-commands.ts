// =============================================================================
// Owner AI Command Center in-app (blueprint V3 ADR-001, GAI-012): layar Owner memakai
// MESIN TOOL YANG SAMA dengan ChatGPT — validasi Zod, izin, preview R2/R3 + token sekali
// pakai, kode 2FA untuk R3, receipt dengan sidik argumen & hasil. Tidak ada jalur pintas:
// bila ChatGPT tidak mendukung tulis, Owner tetap bisa bertindak di sini dengan aturan sama.
// =============================================================================
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { mcpOperations } from "@/db/schema";
import { AgentToolError, agentInternalOrigin, listAgentTools } from "@/lib/agent-tools";
import { CONFIRM_ARG, getOperation, operationView, runToolWithConfirmation, TOTP_ARG } from "@/lib/mcp-confirmation";
import { auditMcpToolCall } from "@/lib/mcp-tool-audit";
import { GARAGE_DOMAINS, riskNeedsConfirmation } from "@/lib/mcp-tool-registry";
import type { GarageSession } from "@/lib/server-auth";

export const OWNER_UI_DEVICE = "owner-ui:ai-command";
/** Tool yang hanya bermakna di jalur ChatGPT. */
const UI_HIDDEN_TOOLS: ReadonlySet<string> = new Set(["garage_verify_connection"]);

export function listOwnerCommandTools(session: GarageSession) {
  const tools = listAgentTools(session, { includeConfirmOnly: true }).filter((tool) => !UI_HIDDEN_TOOLS.has(tool.name));
  return GARAGE_DOMAINS.map((domain) => ({
    id: domain.id,
    no: domain.no,
    label: domain.label,
    tools: tools
      .filter((tool) => tool.domain === domain.id)
      .map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        risk: tool.risk,
        write: tool.write,
        needsConfirmation: riskNeedsConfirmation(tool.risk),
        inputSchema: tool.inputSchema,
      })),
  })).filter((domain) => domain.tools.length > 0);
}

export async function runOwnerCommand(
  session: GarageSession,
  input: { tool: string; args: Record<string, unknown>; konfirmasi?: string | null; kode2fa?: string | null },
) {
  if (UI_HIDDEN_TOOLS.has(input.tool)) {
    throw new AgentToolError("CAPABILITY_UNAVAILABLE", "Tool ini hanya untuk ChatGPT.", 400);
  }
  const rawArgs: Record<string, unknown> = { ...input.args };
  delete rawArgs[CONFIRM_ARG];
  delete rawArgs[TOTP_ARG];
  if (input.konfirmasi) rawArgs[CONFIRM_ARG] = input.konfirmasi;
  if (input.kode2fa) rawArgs[TOTP_ARG] = input.kode2fa;

  // Audit SINKRON sebelum eksekusi (aturan sama dengan ChatGPT): gagal dicatat = tidak dijalankan.
  await auditMcpToolCall({
    actor: session.user.name,
    device: OWNER_UI_DEVICE,
    label: "AI Command Center",
    tool: input.tool,
    args: rawArgs,
    metadata: { source: "garage_owner_ui", userId: session.user.id },
  });

  return runToolWithConfirmation({
    session,
    name: input.tool,
    rawArgs,
    ctx: { authorization: "", internalOrigin: agentInternalOrigin(), confirmFlow: true, hiddenTools: UI_HIDDEN_TOOLS },
    oauthClientId: null,
    source: "garage_owner_ui",
  });
}

/** Timeline operasi R2/R3 Owner (ChatGPT + layar Owner) — AI-07 Audit Timeline. */
export async function listOwnerOperations(userId: string, options: { limit?: number; source?: "chatgpt" | "garage_owner_ui" } = {}) {
  const rows = await getDb()
    .select()
    .from(mcpOperations)
    .where(
      and(
        eq(mcpOperations.userId, userId),
        options.source ? eq(mcpOperations.source, options.source) : inArray(mcpOperations.source, ["chatgpt", "garage_owner_ui"]),
      ),
    )
    .orderBy(desc(mcpOperations.createdAt))
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200));
  // Ringkasan argumen/hasil cukup untuk timeline; detail lengkap lewat GET per operasi.
  return rows.map((row) => ({ ...operationView(row), argumen: undefined, hasil: undefined }));
}

export { getOperation };
