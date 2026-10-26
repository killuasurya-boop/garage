import { beforeEach, describe, expect, it, vi } from "vitest";

// Guard server halaman /owner/payroll (Owner/Manajer, = API /api/payroll/*) dan
// /staff/wallet-* (wajib login) — temuan sensus S0b: dulu halaman tampil untuk siapa saja.

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/server-auth", () => ({ requireGarageSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/payroll/payroll-nav", () => ({ PayrollNav: () => null }));

import PayrollLayout from "@/app/owner/payroll/layout";
import StaffLayout from "@/app/staff/layout";

const denied = (status: number) => ({ data: null, response: new Response(null, { status }) });
const allowed = (role: string, passwordResetRequired = false) => ({ data: { profile: { role, passwordResetRequired } }, response: null });

describe("guard halaman payroll & wallet staf", () => {
  beforeEach(() => {
    mocks.session.mockReset();
    mocks.redirect.mockClear();
  });

  it("/owner/payroll: peran = MANAGEMENT_ROLES; tamu → login, Kasir → /os", async () => {
    mocks.session.mockResolvedValue(denied(401));
    await expect(PayrollLayout({ children: null })).rejects.toThrow("REDIRECT:/login?next=/owner/payroll");
    expect(mocks.session).toHaveBeenCalledWith(["Owner", "Manajer"]);

    mocks.session.mockResolvedValue(denied(403));
    await expect(PayrollLayout({ children: null })).rejects.toThrow("REDIRECT:/os");
  });

  it("/owner/payroll: Manajer boleh; wajib ganti password diarahkan", async () => {
    mocks.session.mockResolvedValue(allowed("Manajer"));
    await expect(PayrollLayout({ children: "isi" })).resolves.toBeTruthy();
    mocks.session.mockResolvedValue(allowed("Owner", true));
    await expect(PayrollLayout({ children: null })).rejects.toThrow("REDIRECT:/account/password?required=1");
  });

  it("/staff/*: wajib login; staf mana pun boleh", async () => {
    mocks.session.mockResolvedValue(denied(401));
    await expect(StaffLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
    mocks.session.mockResolvedValue(allowed("Kasir"));
    await expect(StaffLayout({ children: "wallet" })).resolves.toBe("wallet");
    expect(mocks.session).toHaveBeenLastCalledWith();
  });
});
