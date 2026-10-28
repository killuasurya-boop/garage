import { describe, expect, it } from "vitest";

import { argsDigest, splitConfirmation } from "@/lib/mcp-confirmation";

describe("mcp-confirmation (murni)", () => {
  it("sidik argumen stabil terhadap urutan key & mengabaikan undefined", () => {
    expect(argsDigest("t", { a: 1, b: "x" })).toBe(argsDigest("t", { b: "x", a: 1, c: undefined }));
    expect(argsDigest("t", { a: 1 })).not.toBe(argsDigest("t", { a: 2 }));
    expect(argsDigest("t1", { a: 1 })).not.toBe(argsDigest("t2", { a: 1 }));
  });

  it("memisahkan token konfirmasi dari argumen tool", () => {
    expect(splitConfirmation({ a: 1, konfirmasi: "id.nonce" })).toEqual({ args: { a: 1 }, token: "id.nonce", totpCode: null });
    expect(splitConfirmation({ a: 1 })).toEqual({ args: { a: 1 }, token: null, totpCode: null });
    expect(splitConfirmation(null)).toEqual({ args: {}, token: null, totpCode: null });
  });

  it("D-01a: kode2fa dilepas dari argumen tool; angka tetap 6 digit (nol di depan)", () => {
    expect(splitConfirmation({ a: 1, konfirmasi: "id.nonce", kode2fa: " 012345 " })).toEqual({
      args: { a: 1 },
      token: "id.nonce",
      totpCode: "012345",
    });
    expect(splitConfirmation({ konfirmasi: "id.nonce", kode2fa: 12345 }).totpCode).toBe("012345");
  });
});
