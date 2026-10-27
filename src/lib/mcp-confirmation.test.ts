import { describe, expect, it } from "vitest";

import { argsDigest, splitConfirmation } from "@/lib/mcp-confirmation";

describe("mcp-confirmation (murni)", () => {
  it("sidik argumen stabil terhadap urutan key & mengabaikan undefined", () => {
    expect(argsDigest("t", { a: 1, b: "x" })).toBe(argsDigest("t", { b: "x", a: 1, c: undefined }));
    expect(argsDigest("t", { a: 1 })).not.toBe(argsDigest("t", { a: 2 }));
    expect(argsDigest("t1", { a: 1 })).not.toBe(argsDigest("t2", { a: 1 }));
  });

  it("memisahkan token konfirmasi dari argumen tool", () => {
    expect(splitConfirmation({ a: 1, konfirmasi: "id.nonce" })).toEqual({ args: { a: 1 }, token: "id.nonce" });
    expect(splitConfirmation({ a: 1 })).toEqual({ args: { a: 1 }, token: null });
    expect(splitConfirmation(null)).toEqual({ args: {}, token: null });
  });
});
