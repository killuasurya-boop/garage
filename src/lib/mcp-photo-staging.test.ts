import { describe, expect, it } from "vitest";

import { photoRoute } from "@/lib/agent-tools-foto";
import { allowedPhotoHostSuffixes, isFotoId, photoSourceBlockReason } from "@/lib/mcp-photo-staging";
import { toolArgsPreview } from "@/lib/mcp-tool-audit";

// Aturan murni unggah foto dari ChatGPT: sumber yang boleh diunduh (anti-SSRF),
// tujuan yang boleh dipasang (daftar tetap), dan URL bertanda tangan tidak masuk audit.

describe("photoSourceBlockReason", () => {
  const ok = (url: string) => expect(photoSourceBlockReason(url)).toBeNull();
  const no = (url: string) => expect(photoSourceBlockReason(url)).toEqual(expect.any(String));

  it("menerima https dari host unggahan ChatGPT", () => {
    ok("https://files.oaiusercontent.com/file-abc?sig=1");
    ok("https://oaiusercontent.com/x.png");
    ok("https://files.openai.com/x");
  });

  it("menolak selain https, kredensial, port khusus", () => {
    no("http://files.oaiusercontent.com/x");
    no("file:///etc/passwd");
    no("https://user:pw@files.oaiusercontent.com/x");
    no("https://files.oaiusercontent.com:8443/x");
    no("bukan url");
  });

  it("menolak alamat IP & host internal (SSRF)", () => {
    no("https://127.0.0.1/x");
    no("https://169.254.169.254/latest/meta-data");
    no("https://[::1]/x");
    no("https://localhost/x");
    no("https://garagecoffee.id/api/finance/closing");
  });

  it("menolak host yang hanya mirip (akhiran palsu)", () => {
    no("https://oaiusercontent.com.evil.example/x");
    no("https://eviloaiusercontent.com/x");
    no("https://example.com/files.oaiusercontent.com");
  });

  it("host tambahan dari env hanya yang berbentuk domain", () => {
    const suffixes = allowedPhotoHostSuffixes("cdn.contoh.id, *.gambar.test, 10.0.0.1, bukan host");
    expect(suffixes).toContain("cdn.contoh.id");
    expect(suffixes).toContain("gambar.test");
    expect(suffixes).not.toContain("10.0.0.1");
    expect(photoSourceBlockReason("https://a.gambar.test/x", suffixes)).toBeNull();
  });
});

describe("isFotoId", () => {
  it("hanya 32 heksadesimal (tanpa jalur)", () => {
    expect(isFotoId("a".repeat(32))).toBe(true);
    expect(isFotoId("../../etc/passwd")).toBe(false);
    expect(isFotoId(`${"a".repeat(31)}/`)).toBe(false);
    expect(isFotoId("A".repeat(32))).toBe(false);
  });
});

describe("photoRoute", () => {
  it("memetakan tujuan tetap ke endpoint unggah yang ada", () => {
    expect(photoRoute("produk_menu", "itm-1", undefined).path).toBe("/api/menu/itm-1/image");
    expect(photoRoute("produk_mitra", "lnk_2", undefined).path).toBe("/api/partners/products/lnk_2/image");
    expect(photoRoute("bahan_gudang", "BAR-001", undefined).path).toBe("/api/wms/products/BAR-001/image");
    expect(photoRoute("hero_website", undefined, undefined)).toMatchObject({ path: "/api/site/landing-hero", fields: { slot: "landing_hero" } });
    expect(photoRoute("suasana_website", undefined, 3).fields).toEqual({ slot: "suasana_3" });
  });

  it("menolak id berisi jalur/karakter aneh dan slot di luar 1–4", () => {
    expect(() => photoRoute("produk_menu", "../orders/1/void", undefined)).toThrow();
    expect(() => photoRoute("produk_menu", "a/b", undefined)).toThrow();
    expect(() => photoRoute("produk_menu", "a%2fb", undefined)).toThrow();
    expect(() => photoRoute("produk_menu", undefined, undefined)).toThrow();
    expect(() => photoRoute("suasana_website", undefined, 5)).toThrow();
    expect(() => photoRoute("suasana_website", undefined, undefined)).toThrow();
  });
});

describe("audit argumen", () => {
  it("URL unduhan bertanda tangan disamarkan (host saja)", () => {
    const text = toolArgsPreview({ foto: { download_url: "https://files.oaiusercontent.com/f?sig=RAHASIA", file_id: "file_1" } });
    expect(text).not.toContain("RAHASIA");
    expect(text).toContain("files.oaiusercontent.com");
    expect(text).toContain("file_1");
  });
});
