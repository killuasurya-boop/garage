import { describe, expect, it } from "vitest";

import { secretsMatch } from "./secret-compare";

describe("secretsMatch", () => {
  it("cocok hanya bila rahasia persis sama", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
    expect(secretsMatch("abc124", "abc123")).toBe(false);
    expect(secretsMatch("abc1234", "abc123")).toBe(false);
    expect(secretsMatch("Bearer s3cret", "Bearer s3cret")).toBe(true);
  });

  it("rahasia kosong atau belum diatur selalu ditolak", () => {
    expect(secretsMatch("", "")).toBe(false);
    expect(secretsMatch(null, undefined)).toBe(false);
    expect(secretsMatch("x", undefined)).toBe(false);
    expect(secretsMatch(undefined, "x")).toBe(false);
  });
});
