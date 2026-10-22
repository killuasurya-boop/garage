import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("separately verified standalone build typecheck policy", () => {
  it("keeps the Next typecheck enabled by default", async () => {
    vi.stubEnv("GARAGE_STANDALONE", "true");
    vi.stubEnv("GARAGE_BUILD_TYPECHECK_VERIFIED", "false");
    expect((await import("../../next.config")).default.typescript?.ignoreBuildErrors).not.toBe(true);
  });
  it("permits a separately verified standalone image build", async () => {
    vi.stubEnv("GARAGE_STANDALONE", "true");
    vi.stubEnv("GARAGE_BUILD_TYPECHECK_VERIFIED", "true");
    expect((await import("../../next.config")).default.typescript?.ignoreBuildErrors).toBe(true);
  });
  it("does not skip ordinary local builds", async () => {
    vi.stubEnv("GARAGE_STANDALONE", "false");
    vi.stubEnv("GARAGE_BUILD_TYPECHECK_VERIFIED", "true");
    expect((await import("../../next.config")).default.typescript?.ignoreBuildErrors).not.toBe(true);
  });
});
