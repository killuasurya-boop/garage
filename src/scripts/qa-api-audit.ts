// =============================================================================
// QA — Audit API: inventaris guard auth semua route + uji HTTP.
//
// Tahap 1 (statis): baca semua src/app/api/**/route.ts (path literal, aman untuk
//   folder [id]) → method yang diekspor + guard yang dipakai. Route tanpa guard
//   dikenali harus ada di PUBLIC_ALLOWLIST (publik disengaja) atau dilaporkan.
// Tahap 2 (--live <baseUrl>): panggil setiap method TANPA sesi → wajib 401/403
//   (atau 4xx validasi untuk route publik), tidak boleh 200/5xx. Lalu dengan
//   cookie Waiter (--waiter-cookie) untuk route berizin Owner/Manajer → wajib 403.
//   Body invalid ({}) ke POST/PATCH/PUT → tidak boleh 500.
//
// Pakai:
//   npx tsx src/scripts/qa-api-audit.ts                         (statis saja)
//   npx tsx src/scripts/qa-api-audit.ts --live http://127.0.0.1:3002
// Hasil lengkap: .tmp/qa-api-audit.json
// =============================================================================
import fs from "node:fs";
import path from "node:path";

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

const GUARD_PATTERNS: Array<[string, RegExp]> = [
  ["permission", /requirePermission\(|requireAnyPermission\(|financeSectionHandler\(/],
  ["session", /requireGarageSession\(|getGarageSession\(|requireOwnerSession\(|requireManagerSession\(/],
  ["member", /requireMemberAuth\(|getMemberSession\(|requireMember\w*\(/],
  ["pos-terminal", /requirePosTerminal\(/],
  ["ai-job", /requireGarageAiJobAuthorization\(/],
  ["cron-secret", /CRON_SECRET|isAuthorizedCron|verifyCron/],
  ["webhook-signature", /x-hub-signature|verifyWebhook|verify_token|hub\.verify_token|signature/i],
  ["token", /invoiceTrackingToken|chatToken|trackingToken|findOrderByToken|public-status|tokenHash|verifyToken/],
  ["better-auth", /toNextJsHandler|auth\.api\.getSession/],
  ["absen-pin", /verifyAttendancePin|punchWithPin|attendancePin|verifyPin/i],
];

// Route publik yang disengaja (halaman pelanggan, rekrutmen, member auth,
// health, webhook, tracking). Tetap diuji: tidak boleh 5xx.
const PUBLIC_ALLOWLIST = [
  /^auth\//,
  /^customer\//,
  /^invoice\//,
  /^member\/auth\//,
  /^recruitment\/(apply|positions|track-status|upload|parse-cv)$/,
  /^health$/,
  /^webhooks\//,
  /^website-events$/,
  /^site\/live-(tracking|visit)$/,
  // Konten website publik (hero, info bisnis, testimoni) & kunci publik VAPID.
  /^site\/(business-info|landing-hero|testimonials|social-posts)$/,
  /^push\/subscribe$/,
  /^display\/customer-queue$/,
  /^vouchers\/validate$/,
  /^errors$/,
  /^dev\/demo-login$/,
  /^absen\//,
  // Kiosk absensi lama (auth = PIN). Mati (410) saat Payroll V2 aktif.
  /^hr\/attendance(\/check)?$/,
  /^integrations\/\[provider\]\/callback$/,
];

type RouteInfo = {
  route: string;
  file: string;
  methods: string[];
  guards: string[];
  permissions: string[];
  publicAllowed: boolean;
};

function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

function inventory(): RouteInfo[] {
  return walk(API_ROOT)
    .sort()
    .map((file) => {
      const source = fs.readFileSync(file, "utf8");
      const route = path.relative(API_ROOT, path.dirname(file)).split(path.sep).join("/");
      const methods = [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s*\{\s*([^}]*)\}/g)]
        .flatMap((m) => (m[1] ?? m[2] ? [m[1] ?? m[2]] : (m[3] ?? "").match(/\b(GET|POST|PUT|PATCH|DELETE)\b/g) ?? []))
        .filter(Boolean) as string[];
      const guards = GUARD_PATTERNS.filter(([, re]) => re.test(source)).map(([name]) => name);
      const permissions = [...source.matchAll(/require(?:Any)?Permission\(\s*\[?\s*"([^"]+)"/g)].map((m) => m[1]);
      return {
        route,
        file: path.relative(process.cwd(), file),
        methods: [...new Set(methods)],
        guards,
        permissions: [...new Set(permissions)],
        publicAllowed: PUBLIC_ALLOWLIST.some((re) => re.test(route)),
      };
    });
}

// --bad-id: parameter dinamis diisi string non-UUID → route harus 4xx, bukan 500.
const BAD_ID = process.argv.includes("--bad-id");

function fillParams(route: string) {
  return route
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, "session")
    .replace(/\[ticketNo\]/g, "KT-QA-0000")
    .replace(/\[table\]/g, "99")
    .replace(/\[phone\]/g, "080000000000")
    .replace(/\[token\]/g, "qa-token-tidak-ada")
    .replace(/\[date\]/g, "2026-01-01")
    .replace(/\[filename\]|\[file\]/g, "qa-tidak-ada.jpg")
    .replace(/\[provider\]/g, "qa")
    .replace(/\[[^\]]+\]/g, BAD_ID ? "bukan-uuid-qa" : "00000000-0000-4000-8000-000000000000");
}

type LiveResult = { route: string; method: string; phase: string; status: number; verdict: "PASS" | "FAIL" | "WARN"; note: string };

async function call(base: string, route: string, method: string, headers: Record<string, string> = {}, body?: string) {
  const url = `${base}/api/${fillParams(route)}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers },
      body: method === "GET" || method === "DELETE" ? undefined : body ?? "{}",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    return { status: res.status, text };
  } catch (error) {
    return { status: 0, text: error instanceof Error ? error.message : String(error) };
  }
}

async function live(base: string, routes: RouteInfo[], waiterCookie?: string, ownerCookie?: string) {
  const results: LiveResult[] = [];
  const managerPerms = /^(settings|admin|finance|payroll|approvals|audit|staff|users|ai|wms|marketing|crm|inventory|reports|hr|company)/;
  for (const info of routes) {
    for (const method of info.methods) {
      // Callback OAuth/Better Auth dilewati — butuh alur provider nyata.
      if (/^auth\//.test(info.route)) continue;
      const anon = await call(base, info.route, method);
      let verdict: LiveResult["verdict"] = "PASS";
      let note = "";
      if (anon.status >= 500 || anon.status === 0) {
        verdict = "FAIL";
        note = `5xx/timeout tanpa sesi: ${anon.text.slice(0, 160)}`;
      } else if (!info.publicAllowed && anon.status >= 200 && anon.status < 300) {
        verdict = "FAIL";
        note = "route non-publik mengembalikan 2xx TANPA sesi";
      } else if (!info.publicAllowed && ![401, 403, 404, 405, 400, 410, 422, 429].includes(anon.status)) {
        verdict = "WARN";
        note = `status tak lazim tanpa sesi: ${anon.status}`;
      } else if (anon.status >= 300 && anon.status < 400) {
        verdict = "WARN";
        note = `redirect ${anon.status}`;
      }
      results.push({ route: info.route, method, phase: "anon", status: anon.status, verdict, note });

      // Body invalid ({}) dengan sesi Owner → validasi harus 4xx, bukan 500.
      // Route berefek eksternal/destruktif dilewati (kirim WA, publish, AI berbayar, dll).
      if (
        ownerCookie &&
        (["POST", "PATCH", "PUT"].includes(method) || (BAD_ID && /\[/.test(info.route))) &&
        !/(send|publish|broadcast|^ai\/|integrations|webhooks|jobs|cron|purge|backup|restore|import|whatsapp|print|auth\/|logout|sign-out|reset|delete|parse-cv|upload|image|photo|selfie)/.test(info.route)
      ) {
        const asOwner = await call(base, info.route, method, { cookie: ownerCookie }, "{}");
        results.push({
          route: info.route,
          method,
          phase: "owner-invalid-body",
          status: asOwner.status,
          verdict: asOwner.status >= 500 || asOwner.status === 0 ? "FAIL" : "PASS",
          note: asOwner.status >= 500 || asOwner.status === 0 ? asOwner.text.slice(0, 200) : "",
        });
      }

      if (waiterCookie && !info.publicAllowed && info.permissions.some((p) => managerPerms.test(p)) && method !== "GET") {
        const asWaiter = await call(base, info.route, method, { cookie: waiterCookie });
        const bad = asWaiter.status >= 200 && asWaiter.status < 300;
        results.push({
          route: info.route,
          method,
          phase: "waiter",
          status: asWaiter.status,
          verdict: bad ? "FAIL" : asWaiter.status >= 500 ? "FAIL" : "PASS",
          note: bad ? `waiter berhasil (${info.permissions.join(",")})` : asWaiter.status >= 500 ? asWaiter.text.slice(0, 160) : "",
        });
      }
    }
  }
  return results;
}

// Login akun gladi (hanya ada di salinan DB) → cookie sesi.
async function loginAs(base: string, key: string): Promise<string | undefined> {
  const file = path.join(".tmp", "gladi-accounts.json");
  if (!fs.existsSync(file)) return undefined;
  const { accounts } = JSON.parse(fs.readFileSync(file, "utf8")) as {
    accounts: Record<string, { email: string; password: string }>;
  };
  const account = accounts[key];
  if (!account) return undefined;
  const res = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3002", "x-forwarded-for": `10.9.255.${key.length}` },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (res.status !== 200) return undefined;
  const cookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  const routes = inventory();
  const methodCount = routes.reduce((sum, r) => sum + r.methods.length, 0);
  const unguarded = routes.filter((r) => r.guards.length === 0 && !r.publicAllowed);
  const noMethods = routes.filter((r) => r.methods.length === 0);

  console.log(`Route file: ${routes.length}, handler method: ${methodCount}`);
  console.log(`Publik disengaja: ${routes.filter((r) => r.publicAllowed).length}`);
  console.log(`TANPA guard dikenali & bukan publik: ${unguarded.length}`);
  for (const r of unguarded) console.log(`  - ${r.route} [${r.methods.join(",")}]`);
  if (noMethods.length) console.log(`Tanpa method terdeteksi: ${noMethods.map((r) => r.route).join(", ")}`);

  const liveIdx = process.argv.indexOf("--live");
  let liveResults: LiveResult[] = [];
  if (liveIdx > -1) {
    const base = process.argv[liveIdx + 1] ?? "http://127.0.0.1:3002";
    const waiterCookie = await loginAs(base, "waiter1");
    console.log(waiterCookie ? "Sesi Waiter gladi: OK (uji eskalasi role aktif)" : "Sesi Waiter tidak tersedia — uji eskalasi dilewati");
    const ownerCookie = process.argv.includes("--owner-fuzz") ? await loginAs(base, "owner") : undefined;
    if (process.argv.includes("--owner-fuzz")) console.log(ownerCookie ? "Sesi Owner gladi: OK (uji body invalid aktif)" : "Sesi Owner gagal");
    liveResults = await live(base, routes, waiterCookie, ownerCookie);
    const fails = liveResults.filter((r) => r.verdict === "FAIL");
    const warns = liveResults.filter((r) => r.verdict === "WARN");
    console.log(`\nLIVE ${base}: panggilan=${liveResults.length} PASS=${liveResults.length - fails.length - warns.length} WARN=${warns.length} FAIL=${fails.length}`);
    for (const r of [...fails, ...warns]) console.log(`  [${r.verdict}] ${r.phase} ${r.method} /api/${r.route} → ${r.status} ${r.note}`);
  }

  fs.mkdirSync(".tmp", { recursive: true });
  fs.writeFileSync(".tmp/qa-api-audit.json", JSON.stringify({ routes, liveResults }, null, 2));
  const failed = unguarded.length > 0 || liveResults.some((r) => r.verdict === "FAIL");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
