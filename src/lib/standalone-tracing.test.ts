import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
vi.mock("node:os", () => ({ networkInterfaces: () => ({}) }));
import config from "../../next.config";

// Gunakan matcher yang dipakai collect-build-traces Next sendiri.
const require = createRequire(import.meta.url);
const picomatch = require("next/dist/compiled/picomatch") as (glob: string | string[], options?: { contains?: boolean; dot?: boolean }) => (value: string) => boolean;

describe("standalone tracing exclusions", () => {
  it("keeps the Next server bootstrap while excluding repository artifacts from routes", () => {
    const rules = config.outputFileTracingExcludes!;
    const frameworkIgnores = Object.entries(rules).filter(([route]) => picomatch(route)("next-server")).flatMap(([, globs]) => globs);
    const runtimeLog = path.join(process.cwd(), "node_modules/next/dist/build/output/log.js");
    expect(picomatch(frameworkIgnores, { contains: true, dot: true })(runtimeLog)).toBe(false);
    const routeIgnores = Object.entries(rules).filter(([route]) => picomatch(route, { contains: true })("/login")).flatMap(([, globs]) => globs).map(glob => path.join(process.cwd(), glob));
    const ignored = picomatch(routeIgnores, { contains: true, dot: true });
    expect(ignored(path.join(process.cwd(), "output/report.csv"))).toBe(true);
    expect(ignored(path.join(process.cwd(), ".pglite-data/base.db"))).toBe(true);
    expect(ignored(runtimeLog)).toBe(false);
  });
});
