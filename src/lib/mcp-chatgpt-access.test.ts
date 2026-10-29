import { describe, expect, it } from "vitest";

import { mcpChatgptAccess } from "@/lib/mcp-chatgpt-access";

// Blueprint V3 AC-05: hanya Owner aktif ber-2FA; peran lain ditolak apa pun isi argumennya.
describe("mcpChatgptAccess", () => {
  it("hanya Owner aktif + 2FA yang boleh", () => {
    expect(mcpChatgptAccess({ role: "Owner", status: "active", twoFactorEnabled: true })).toEqual({ allowed: true });
  });
  it.each(["Manajer", "Kasir", "Waiter", "Member", "owner", ""])("peran %s ditolak", (role) => {
    const res = mcpChatgptAccess({ role, status: "active", twoFactorEnabled: true });
    expect(res.allowed).toBe(false);
  });
  it("Owner tanpa 2FA / tidak aktif / tanpa profil ditolak dengan kode jelas", () => {
    expect(mcpChatgptAccess({ role: "Owner", status: "active", twoFactorEnabled: false })).toMatchObject({ code: "TWO_FACTOR_REQUIRED" });
    expect(mcpChatgptAccess({ role: "Owner", status: "suspended", twoFactorEnabled: true })).toMatchObject({ code: "ACCOUNT_INACTIVE" });
    expect(mcpChatgptAccess({ role: null, status: null, twoFactorEnabled: true })).toMatchObject({ code: "STAFF_PROFILE_MISSING" });
  });
});
