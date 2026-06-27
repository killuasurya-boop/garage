import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyMetaWebhookSignature } from "@/lib/garage-provider-adapters";
import {
  decryptSocialToken,
  encryptSocialToken,
  signSocialOAuthState,
  verifySocialOAuthState,
} from "@/lib/social-publisher-crypto";

describe("GARAGE social publisher security", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mengenkripsi token tanpa menyimpan plaintext", () => {
    vi.stubEnv("SOCIAL_PUBLISHER_ENCRYPTION_KEY", "test-secret-minimum-32-characters-long");
    const encrypted = encryptSocialToken("provider-secret-token");
    expect(encrypted).not.toContain("provider-secret-token");
    expect(decryptSocialToken(encrypted)).toBe("provider-secret-token");
  });

  it("menolak OAuth state yang dimodifikasi", () => {
    vi.stubEnv("SOCIAL_PUBLISHER_ENCRYPTION_KEY", "test-secret-minimum-32-characters-long");
    const state = signSocialOAuthState({ userId: "owner-1", returnTo: "/" });
    expect(verifySocialOAuthState(state).userId).toBe("owner-1");
    expect(() => verifySocialOAuthState(`${state}tampered`)).toThrow();
  });

  it("mengganti returnTo eksternal agar callback tidak menjadi open redirect", () => {
    vi.stubEnv("SOCIAL_PUBLISHER_ENCRYPTION_KEY", "test-secret-minimum-32-characters-long");
    const state = signSocialOAuthState({
      userId: "owner-1",
      returnTo: "https://attacker.example/steal",
    });
    expect(verifySocialOAuthState(state).returnTo).toBe("/");
  });

  it("memverifikasi signature webhook Meta", () => {
    vi.stubEnv("META_CLIENT_SECRET", "meta-test-secret");
    const body = JSON.stringify({ object: "page", entry: [] });
    const signature = `sha256=${createHmac("sha256", "meta-test-secret")
      .update(body)
      .digest("hex")}`;
    expect(verifyMetaWebhookSignature(body, signature)).toBe(true);
    expect(verifyMetaWebhookSignature(`${body}x`, signature)).toBe(false);
  });
});
