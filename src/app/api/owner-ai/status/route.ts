import { fail, ok } from "@/lib/api-response";
import { mcpChatgpt } from "@/lib/auth";
import { loadSettingsByKeys } from "@/lib/garage-settings-service";
import { MCP_CHATGPT_PATH } from "@/lib/mcp-chatgpt-config";
import { loadOwnerAiStatus } from "@/lib/owner-ai-connect";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Status Owner AI Connect (Owner saja): dimensi terpisah, koneksi, URL MCP. Tanpa token/secret. */
export async function GET() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  // Hanya Owner di layar Garage OS — API key/agent (termasuk kunci delegasi ChatGPT) ditolak.
  if (session.data.profile.agentKey) return fail(403, "FORBIDDEN", "AI Connect hanya dari layar Owner, bukan API key.");
  const settings = await loadSettingsByKeys(["mcpChatgptPaused", "mcpChatgptWriteEnabled"]);
  const paused = Boolean(settings["mcpChatgptPaused"]);
  const writeEnabled = settings["mcpChatgptWriteEnabled"] !== false;
  const data = await loadOwnerAiStatus({
    ownerUserId: session.data.user.id,
    gatewayConfigured: mcpChatgpt.enabled,
    gatewayReason: mcpChatgpt.enabled ? null : mcpChatgpt.reason,
    paused,
    writeEnabled,
  });
  return ok(
    {
      ...data,
      mcpUrl: mcpChatgpt.enabled ? mcpChatgpt.resource : null,
      mcpPath: MCP_CHATGPT_PATH,
      settings: { paused, writeEnabled },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
