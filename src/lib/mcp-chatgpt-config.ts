// Gateway MCP ChatGPT (OAuth 2.1, keputusan Owner D-01 — docs/master-2026).
//
// Plugin OAuth hanya dipasang bila GARAGE_MCP_CHATGPT_ENABLED=true DAN URL
// resource valid. Default mati: merge/deploy tidak mengubah perilaku produksi
// sampai Owner menyalakan env ini. mcp() melempar error untuk resource non-HTTPS
// (kecuali loopback) — dicek di sini supaya login tidak pernah ikut gagal.

export const MCP_CHATGPT_PATH = "/api/mcp/chatgpt";

/** Scope yang di-advertise; `garage:owner` = kendali penuh Owner (D-01). */
export const MCP_CHATGPT_SCOPES = ["openid", "profile", "email", "offline_access", "garage:owner"] as const;

export type McpChatgptConfig =
  | { enabled: true; baseURL: string; resource: string }
  | { enabled: false; reason: string };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function resolveMcpChatgptConfig(env: Record<string, string | undefined> = process.env): McpChatgptConfig {
  if (env.GARAGE_MCP_CHATGPT_ENABLED?.trim().toLowerCase() !== "true") {
    return { enabled: false, reason: "GARAGE_MCP_CHATGPT_ENABLED belum true." };
  }
  const raw = env.BETTER_AUTH_URL?.trim();
  if (!raw) return { enabled: false, reason: "BETTER_AUTH_URL kosong." };
  let base: URL;
  try {
    base = new URL(raw);
  } catch {
    return { enabled: false, reason: "BETTER_AUTH_URL tidak valid." };
  }
  if (base.username || base.password || base.search || base.hash) {
    return { enabled: false, reason: "BETTER_AUTH_URL tidak boleh berisi kredensial/query/fragment." };
  }
  const isLoopback = LOOPBACK_HOSTS.has(base.hostname);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && isLoopback)) {
    return { enabled: false, reason: "MCP ChatGPT butuh BETTER_AUTH_URL HTTPS (http hanya untuk localhost)." };
  }
  const baseURL = base.origin;
  return { enabled: true, baseURL, resource: `${baseURL}${MCP_CHATGPT_PATH}` };
}
