// =============================================================================
// QA — Smoke semua halaman (page.tsx) di server GLADI dengan sesi Owner.
// Setiap halaman harus merespons < 500 (redirect/404 untuk ID palsu boleh).
// Pakai: npx tsx src/scripts/qa-page-crawl.ts
// =============================================================================
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.GLADI_BASE_URL ?? "http://127.0.0.1:3002").replace(/\/+$/, "");
const APP = path.join(process.cwd(), "src", "app");

function pages(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "api" || e.name.startsWith("_")) continue;
      pages(full, out);
    } else if (e.name === "page.tsx") {
      const rel = path.relative(APP, path.dirname(full)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join("/");
      out.push(`/${rel}`);
    }
  }
  return out;
}

async function login() {
  const { accounts } = JSON.parse(fs.readFileSync(path.join(".tmp", "gladi-accounts.json"), "utf8")) as {
    accounts: Record<string, { email: string; password: string }>;
  };
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3002", "x-forwarded-for": "10.50.0.1" },
    body: JSON.stringify({ email: accounts.owner.email, password: accounts.owner.password }),
  });
  if (res.status !== 200) throw new Error(`login owner ${res.status}`);
  return ((res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  const cookie = await login();
  const list = pages(APP)
    .map((p) =>
      p
        .replace(/\[token\]/g, "qa-token-tidak-ada")
        .replace(/\[[^\]]+\]/g, "00000000-0000-4000-8000-000000000000")
        .replace(/\/+$/, "") || "/",
    )
    .sort();
  const results: Array<{ page: string; status: number; ms: number }> = [];
  for (const page of list) {
    const started = performance.now();
    let status = 0;
    try {
      const res = await fetch(`${BASE}${page}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
      status = res.status;
      await res.arrayBuffer();
    } catch {
      status = 0;
    }
    results.push({ page, status, ms: Math.round(performance.now() - started) });
  }
  const bad = results.filter((r) => r.status >= 500 || r.status === 0);
  const slow = results.filter((r) => r.ms > 3000);
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  console.log(`Halaman: ${results.length} · status: ${JSON.stringify(counts)}`);
  for (const r of bad) console.log(`  [FAIL] ${r.page} → ${r.status}`);
  for (const r of slow) console.log(`  [LAMBAT] ${r.page} → ${r.ms} ms`);
  fs.writeFileSync(".tmp/qa-page-crawl.json", JSON.stringify(results, null, 2));
  process.exit(bad.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
