// Siapa boleh memakai MCP ChatGPT (keputusan Owner D-01: full access hanya
// untuk Owner). Dipakai halaman consent DAN endpoint /api/mcp/chatgpt, supaya
// aturan tidak bisa berbeda di dua tempat.

export type McpChatgptAccess = { allowed: true } | { allowed: false; code: string; message: string };

export function mcpChatgptAccess(input: {
  role: string | null | undefined;
  status: string | null | undefined;
  twoFactorEnabled: boolean;
}): McpChatgptAccess {
  if (!input.role) {
    return { allowed: false, code: "STAFF_PROFILE_MISSING", message: "Profil staf Garage tidak ditemukan." };
  }
  if (input.status && input.status !== "active") {
    return { allowed: false, code: "ACCOUNT_INACTIVE", message: "Akun tidak aktif." };
  }
  if (input.role !== "Owner") {
    return { allowed: false, code: "OWNER_ONLY", message: "Koneksi ChatGPT hanya untuk akun Owner." };
  }
  // Kendali penuh lewat ChatGPT minimal setara MFA (PRD V4.0 §05, §13.3).
  if (!input.twoFactorEnabled) {
    return {
      allowed: false,
      code: "TWO_FACTOR_REQUIRED",
      message: "Aktifkan 2FA Owner dulu (Pengaturan → Keamanan → 2FA, /control/2fa) sebelum menghubungkan ChatGPT.",
    };
  }
  return { allowed: true };
}
