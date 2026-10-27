// Discovery OAuth (RFC 8414 / RFC 9728) untuk MCP ChatGPT di root domain.
// Plugin mcp() menyajikannya lewat hook onRequest auth.handler yang mencocokkan
// path URL, jadi rute /.well-known/* cukup meneruskan request ke auth.handler.
// Fitur mati (GARAGE_MCP_CHATGPT_ENABLED≠true) → 404.
import { auth, mcpChatgpt } from "@/lib/auth";

export async function serveMcpChatgptDiscovery(request: Request) {
  if (!mcpChatgpt.enabled) return new Response(null, { status: 404 });
  return auth.handler(request);
}
