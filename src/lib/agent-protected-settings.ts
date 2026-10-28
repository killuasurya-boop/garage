// Pengaturan keamanan tidak boleh diubah lewat API key agent statis (gk_agent_):
// kebijakan 2FA/lockout/sesi dan kill switch MCP ChatGPT adalah rem darurat —
// agent yang sedang direm tidak boleh bisa melepasnya. Key statis tidak punya
// MFA, sedangkan PRD V4.0 §07.2 menaruh perubahan keamanan di R3 (step-up MFA).
// Ditegakkan di updateAppSettings (titik temu semua rute pengaturan).

const PROTECTED_PREFIXES = ["security", "mcpChatgpt"] as const;

export function isProtectedSettingKey(key: string) {
  return PROTECTED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export class AgentProtectedSettingError extends Error {
  readonly code = "AGENT_PROTECTED_SETTING";
  constructor(readonly keys: string[]) {
    super(`Pengaturan keamanan (${keys.join(", ")}) hanya bisa diubah Owner yang login langsung, bukan lewat API key agent.`);
  }
}

export function assertAgentMayWriteSettings(garage: { profile: { agentKey?: unknown } }, keys: string[]) {
  if (!garage.profile.agentKey) return;
  const blocked = keys.filter(isProtectedSettingKey);
  if (blocked.length) throw new AgentProtectedSettingError(blocked);
}
