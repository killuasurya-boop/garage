// Permission matrix audit.
//
// Scan semua route handler di src/app/api/**/route.ts, ekstrak panggilan
// requirePermission / requireAnyPermission, lalu tampilkan matrix:
//   role × endpoint → ALLOW | DENY
//
// Pakai untuk verifikasi sebelum rilis: pastikan kasir tidak bisa lihat
// finance, waiter tidak bisa close shift, dst.
//
// Jalankan: tsx src/scripts/check-permissions.ts
//   - default: print matrix + summary
//   - --json: keluarkan JSON (untuk diff CI)
//   - --only=role,role: filter role tertentu

import { promises as fs } from "node:fs";
import path from "node:path";
import { rolePermissions, type Permission } from "@/lib/role-access";
import { roles, type Role } from "@/lib/garage-data";

type Endpoint = {
  routeFile: string;
  httpPath: string;
  method: string;
  required: Permission[];
  mode: "all" | "any"; // "all" = requirePermission (single), "any" = requireAnyPermission
};

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.isFile() && e.name === "route.ts") out.push(full);
  }
  return out;
}

function fileToHttpPath(file: string): string {
  const rel = path.relative(API_ROOT, file).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
  return "/api/" + rel;
}

function parseRoute(content: string, file: string): Endpoint[] {
  // Cari handler export: GET, POST, PATCH, PUT, DELETE
  const methodRe = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\s*\(/g;
  const methods: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = methodRe.exec(content)) !== null) methods.push(m[1]);

  // Cari semua call permission (file-level, kita asumsikan satu set permission
  // dipakai oleh seluruh handler di file ini — pola umum di Garage repo).
  const single = [...content.matchAll(/requirePermission\(\s*"([a-z:]+)"\s*\)/g)].map(
    (x) => x[1] as Permission,
  );
  const anyMatches = [...content.matchAll(/requireAnyPermission\(\s*\[([^\]]+)\]/g)].map(
    (x) =>
      x[1]
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean) as Permission[],
  );

  // Format: kalau ada `requireAnyPermission`, jadikan satu group OR.
  // Kalau hanya `requirePermission`, semua permission = ALL.
  const endpoints: Endpoint[] = [];
  for (const method of methods.length > 0 ? methods : ["GET"]) {
    if (anyMatches.length > 0) {
      endpoints.push({
        routeFile: file,
        httpPath: fileToHttpPath(file),
        method,
        required: anyMatches[0],
        mode: "any",
      });
    } else if (single.length > 0) {
      endpoints.push({
        routeFile: file,
        httpPath: fileToHttpPath(file),
        method,
        required: [single[0]],
        mode: "all",
      });
    } else {
      endpoints.push({
        routeFile: file,
        httpPath: fileToHttpPath(file),
        method,
        required: [],
        mode: "all",
      });
    }
  }
  return endpoints;
}

function canAccess(role: Role, endpoint: Endpoint): boolean {
  if (endpoint.required.length === 0) return true; // public
  const perms = rolePermissions[role] ?? [];
  if (endpoint.mode === "any") {
    return endpoint.required.some((p) => perms.includes(p));
  }
  return endpoint.required.every((p) => perms.includes(p));
}

async function main() {
  const args = process.argv.slice(2);
  const wantJson = args.includes("--json");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg
    ? (onlyArg.replace("--only=", "").split(",") as Role[])
    : (roles as Role[]);

  const files = await walk(API_ROOT);
  const endpoints: Endpoint[] = [];
  for (const f of files) {
    const content = await fs.readFile(f, "utf8");
    endpoints.push(...parseRoute(content, f));
  }

  endpoints.sort((a, b) =>
    a.httpPath === b.httpPath
      ? a.method.localeCompare(b.method)
      : a.httpPath.localeCompare(b.httpPath),
  );

  if (wantJson) {
    const matrix = endpoints.map((e) => ({
      path: e.httpPath,
      method: e.method,
      mode: e.mode,
      required: e.required,
      access: Object.fromEntries(only.map((r) => [r, canAccess(r, e)])),
    }));
    console.log(JSON.stringify({ endpoints: matrix }, null, 2));
    return;
  }

  // Print summary table.
  const w = (s: string, n: number) => s.padEnd(n).slice(0, n);
  const colWidth = 4;

  console.log("\n=== Permission Matrix Audit ===");
  console.log(`${endpoints.length} endpoint discovered, ${only.length} role checked.\n`);

  // Header
  const header = ["METHOD ", "PATH".padEnd(50), ...only.map((r) => w(r.slice(0, colWidth), colWidth))].join(" | ");
  console.log(header);
  console.log("-".repeat(header.length));

  // Rows
  let totalCells = 0;
  let allowCells = 0;
  for (const e of endpoints) {
    const row = [
      w(e.method, 6) + " ",
      w(e.httpPath, 50),
      ...only.map((r) => {
        totalCells += 1;
        const ok = canAccess(r, e);
        if (ok) allowCells += 1;
        return w(ok ? "✓" : "·", colWidth);
      }),
    ].join(" | ");
    console.log(row);
  }

  console.log(
    `\nTotal allow cells: ${allowCells}/${totalCells} (${((allowCells / totalCells) * 100).toFixed(1)}%)`,
  );

  // Sanity checks — known invariants.
  // Catatan: endpoint OR-mode (requireAnyPermission) bisa sengaja dibuka utk
  // multiple role lewat permission alternatif (mis. cash-session pakai
  // ["finance:write", "shift:cash"] supaya kasir bisa). Itu BUKAN pelanggaran.
  // Invariant hanya berlaku utk endpoint single-required (mode "all").
  const fails: string[] = [];
  for (const e of endpoints) {
    if (e.mode !== "all") continue;
    // Kasir TIDAK boleh akses endpoint finance:write murni
    if (e.required.includes("finance:write") && canAccess("Kasir", e)) {
      fails.push(`Kasir bisa akses ${e.method} ${e.httpPath} (butuh finance:write)`);
    }
    // Waiter TIDAK boleh akses endpoint inventory:write murni
    if (e.required.includes("inventory:write") && canAccess("Waiter 1", e)) {
      fails.push(`Waiter 1 bisa akses ${e.method} ${e.httpPath} (butuh inventory:write)`);
    }
    // Barista/Koki TIDAK boleh akses endpoint finance:read murni
    if (e.required.includes("finance:read") && canAccess("Barista", e)) {
      fails.push(`Barista bisa akses ${e.method} ${e.httpPath} (butuh finance:read)`);
    }
  }

  if (fails.length > 0) {
    console.log(`\n❌ ${fails.length} pelanggaran invariants:`);
    for (const f of fails) console.log(`   - ${f}`);
    process.exit(1);
  } else {
    console.log("\n✓ Semua invariants permission terpenuhi.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
