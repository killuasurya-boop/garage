import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertContentCanPublish,
  canTransitionContentStatus,
  isSocialPublishingLiveEnabled,
  shouldSkipPublishedPlatform,
} from "@/lib/garage-content-publishing";

describe("GARAGE content publishing approval gate", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("menolak publish sebelum approved", () => {
    for (const status of ["draft", "ai_ready", "needs_approval", "revision", "rejected"]) {
      expect(() => assertContentCanPublish(status)).toThrow(
        "Konten hanya dapat dipublish setelah status APPROVED.",
      );
    }
  });

  it("mengizinkan publish dan retry hanya setelah approval", () => {
    for (const status of ["approved", "scheduled", "failed", "partial"]) {
      expect(() => assertContentCanPublish(status)).not.toThrow();
    }
  });

  it("mencegah lompatan langsung dari draft ke approved", () => {
    expect(canTransitionContentStatus("draft", "approved")).toBe(false);
    expect(canTransitionContentStatus("draft", "needs_approval")).toBe(true);
    expect(canTransitionContentStatus("needs_approval", "approved")).toBe(true);
    expect(canTransitionContentStatus("published", "revision")).toBe(false);
  });

  it("mematikan scheduler live secara default dan melewati platform yang sudah sukses", () => {
    vi.stubEnv("SOCIAL_PUBLISHING_LIVE_ENABLED", "false");
    expect(isSocialPublishingLiveEnabled()).toBe(false);
    expect(shouldSkipPublishedPlatform("published")).toBe(true);
    expect(shouldSkipPublishedPlatform("failed")).toBe(false);
  });
});
