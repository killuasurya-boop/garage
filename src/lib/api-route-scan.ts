// Pemindai route /api untuk katalog endpoint MCP (scripts/generate-api-catalog.ts
// dan tes sinkron). Hanya dipakai di Node saat generate/tes — bukan di runtime.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type ApiRouteEntry = { path: string; methods: string[]; note: string };

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === "route.ts") out.push(full);
  }
}

function firstComment(source: string) {
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^\/\/\s?(.*)$/.exec(trimmed);
    if (!match) return "";
    const text = match[1].replace(/^=+$/, "").trim();
    if (text) return text.slice(0, 160);
  }
  return "";
}

export function scanApiRoutes(apiDir: string): ApiRouteEntry[] {
  const files: string[] = [];
  walk(apiDir, files);
  return files.map((file) => {
    const source = readFileSync(file, "utf8");
    const dir = relative(apiDir, file).split(sep).slice(0, -1);
    const path = `/api/${dir.map((part) => part.replace(/^\[\.{3}(.+)\]$/, "{...$1}").replace(/^\[(.+)\]$/, "{$1}")).join("/")}`.replace(/\/$/, "");
    const methods = METHODS.filter((method) =>
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b|export\\s*\\{[^}]*\\b${method}\\b`).test(source),
    );
    return { path, methods: [...methods], note: firstComment(source) };
  });
}

export function renderApiCatalog(routes: ApiRouteEntry[]) {
  return [
    "// FILE HASIL GENERATE — jangan diedit manual.",
    "// Ulangi: npx tsx scripts/generate-api-catalog.ts (tes api-route-catalog memastikan sinkron).",
    'import type { ApiRouteEntry } from "@/lib/api-route-scan";',
    "",
    "export const API_ROUTE_CATALOG: ApiRouteEntry[] = [",
    ...routes.map((route) => `  ${JSON.stringify(route)},`),
    "];",
    "",
  ].join("\n");
}
