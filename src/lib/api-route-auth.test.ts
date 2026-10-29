import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { KNOWN_ROUTE_GUARDS, PUBLIC_API_ROUTES } from "@/lib/public-routes";

// Audit 29 Okt 2026 (#3): setiap route API wajib punya guard yang dikenal atau terdaftar
// sebagai publik beserta alasannya. Mencegah route baru lupa auth tanpa ketahuan.

const API_DIR = path.join(process.cwd(), "src/app/api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

const routes = routeFiles(API_DIR).map((file) => ({
  key: path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/"),
  source: readFileSync(file, "utf8"),
}));

const isGuarded = (source: string) => KNOWN_ROUTE_GUARDS.some((pattern) => pattern.test(source));

describe("manifest auth route API", () => {
  it("menemukan semua route (sanity)", () => {
    expect(routes.length).toBeGreaterThan(500);
  });

  it("setiap route punya guard yang dikenal atau terdaftar publik dengan alasan", () => {
    const offenders = routes.filter((route) => !isGuarded(route.source) && !PUBLIC_API_ROUTES[route.key]).map((route) => route.key);
    expect(offenders, `Route tanpa guard & tidak terdaftar di src/lib/public-routes.ts:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("daftar publik tidak basi: setiap entri ada & benar-benar tanpa guard", () => {
    const keys = new Set(routes.map((route) => route.key));
    for (const key of Object.keys(PUBLIC_API_ROUTES)) {
      expect(keys.has(key), `entri publik tidak ada: ${key}`).toBe(true);
      const source = routes.find((route) => route.key === key)!.source;
      expect(isGuarded(source), `${key} sudah punya guard — hapus dari daftar publik`).toBe(false);
    }
  });

  it("route publik yang menerima tulis dilindungi (rate limit / PIN / token)", () => {
    for (const route of routes.filter((r) => PUBLIC_API_ROUTES[r.key])) {
      const writes = /export (?:async function|const) (?:POST|PUT|PATCH|DELETE)\b/.test(route.source);
      const guard = PUBLIC_API_ROUTES[route.key].abuseGuard;
      if (!writes || guard === "none") continue;
      if (guard === "rateLimit") expect(route.source, `${route.key} wajib memanggil rateLimit/hitRateLimit`).toMatch(/\b(?:rateLimit|hitRateLimit)\(/);
      if (guard === "pin") expect(route.source, `${route.key} wajib memakai pembatas tebakan PIN`).toMatch(/\b(?:checkPinAttempt|resolveAbsenEmployee)\(/);
    }
  });

  it("uji negatif: route tanpa guard terdeteksi", () => {
    expect(isGuarded("export async function POST(request: Request) { return ok({}); }")).toBe(false);
    expect(isGuarded("const s = await requireGarageSession(['Owner']);")).toBe(true);
  });
});
