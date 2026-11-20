import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: mocks.session } }));
import { GarageLogin } from "./garage-login";

afterEach(() => vi.unstubAllGlobals());

describe("login after staff access rejection", () => {
  it.each(["ACCOUNT_SUSPENDED", "ACCOUNT_INACTIVE", "STAFF_PROFILE_MISSING", "ACCESS_DENIED"])("shows a usable form for %s even with an identity session", (reason) => {
    vi.stubGlobal("window", { location: { href: "http://localhost:3001/login", search: `?reason=${reason}` } });
    mocks.session.mockReturnValue({ data: { user: { id: "staff" } }, isPending: false });
    const html = renderToStaticMarkup(<GarageLogin variant="os" />);
    expect(html).toContain("Owner atau Manajer");
    expect(html).toContain('type="password"');
    expect(html).not.toContain("Membuka area kerja");
  });
  it("allows re-login when the server rejects a stale browser session", () => {
    vi.stubGlobal("window", { location: { href: "http://localhost:3001/login", search: "?reason=SESSION_EXPIRED" } });
    mocks.session.mockReturnValue({ data: { user: { id: "stale-staff" } }, isPending: false });
    const html = renderToStaticMarkup(<GarageLogin />);
    expect(html).toContain("Silakan masuk lagi.");
    expect(html).toContain('type="password"');
    expect(html).not.toContain("Membuka area kerja");
  });
  it("keeps normal automatic entry for a valid session", () => {
    vi.stubGlobal("window", { location: { href: "http://localhost:3001/login", search: "" } });
    mocks.session.mockReturnValue({ data: { user: { id: "staff" } }, isPending: false });
    expect(renderToStaticMarkup(<GarageLogin />)).toContain("Membuka area kerja");
  });
  it("does not render arbitrary URL content as an error", () => {
    vi.stubGlobal("window", { location: { href: "http://localhost:3001/login", search: "?reason=untrusted-text" } });
    mocks.session.mockReturnValue({ data: null, isPending: false });
    const html = renderToStaticMarkup(<GarageLogin />);
    expect(html).not.toContain("untrusted-text");
    expect(html).toContain('type="password"');
  });
});
