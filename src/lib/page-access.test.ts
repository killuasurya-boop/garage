import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), settings: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ requireGarageSession: mocks.session }));
vi.mock("@/lib/garage-settings-service", () => ({ loadSettingsByKeys: mocks.settings }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { requireModulePageAccess } from "@/lib/page-access";

beforeEach(() => { vi.clearAllMocks(); mocks.settings.mockResolvedValue({}); });

function denied(status: number, code: string) {
  mocks.session.mockResolvedValue({ data: null, response: Response.json({ error: { code } }, { status }) });
}

describe("staff page login redirects", () => {
  it("sends expired sessions to normal login", async () => {
    denied(401, "UNAUTHENTICATED");
    await expect(requireModulePageAccess("pos")).rejects.toThrow("REDIRECT:/login?next=%2Fos%3Fmodule%3Dpos&reason=SESSION_EXPIRED");
  });
  it("lets mandatory password changes reach their recovery page", async () => {
    denied(403, "PASSWORD_RESET_REQUIRED");
    await expect(requireModulePageAccess("dashboard")).rejects.toThrow("REDIRECT:/account/password?required=1");
  });
  it("sends missing 2FA to setup", async () => {
    denied(403, "TWO_FACTOR_REQUIRED");
    await expect(requireModulePageAccess("dashboard")).rejects.toThrow("REDIRECT:/control/2fa?enforced=1");
  });
  it.each(["ACCOUNT_SUSPENDED", "ACCOUNT_INACTIVE", "STAFF_PROFILE_MISSING", "UNEXPECTED_CODE"])("breaks the identity/access loop for %s", async (code) => {
    denied(403, code);
    await expect(requireModulePageAccess("dashboard")).rejects.toThrow(`&reason=${code === "UNEXPECTED_CODE" ? "ACCESS_DENIED" : code}`);
  });
  it("still opens the workspace for active staff", async () => {
    const data = { profile: { role: "Kasir", passwordResetRequired: false }, user: {} };
    mocks.session.mockResolvedValue({ data, response: null });
    await expect(requireModulePageAccess("pos")).resolves.toBe(data);
  });
  it("still directs event staff to their own workspace", async () => {
    mocks.session.mockResolvedValue({ data: { profile: { role: "Panitia" } }, response: null });
    await expect(requireModulePageAccess("dashboard")).rejects.toThrow("REDIRECT:/panitia");
  });
});
