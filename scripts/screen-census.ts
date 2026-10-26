/**
 * S0b — Sensus layar & route Garage OS (PRD V4.0 §25.1, F55).
 *
 * Read-only: hanya membaca src/app dan src/lib/role-access.ts, lalu menulis
 *   docs/master-2026/census/routes.json   (data mentah)
 *   docs/master-2026/census/TABLES.md     (tabel turunan)
 * Jalankan: npx tsx scripts/screen-census.ts
 * Output deterministik (diurutkan, tanpa timestamp) agar diff mudah ditinjau.
 */
import fs from "node:fs";
import path from "node:path";

import { roleModules } from "../src/lib/role-access";

const ROOT = process.cwd();
const APP = path.join(ROOT, "src/app");
const OUT_DIR = path.join(ROOT, "docs/master-2026/census");

// ── PRD §25.1 screen registry (ID → nama) ─────────────────────────────────
const PRD_SCREENS: Record<string, string> = {
  "DSH-01": "Owner 360", "DSH-02": "Trends", "DSH-03": "KPI Detail", "DSH-04": "Alerts",
  "POS-01": "Catalog/Cart", "POS-02": "Checkout", "POS-03": "Transactions", "POS-04": "Refund/Void",
  "POS-05": "Quick Retail", "POS-06": "Receipt", "POS-07": "Pending Payments",
  "SHF-01": "Open", "SHF-02": "Active", "SHF-03": "Cash Movement", "SHF-04": "Closing Wizard",
  "SHF-05": "Cash Count", "SHF-06": "Manager Handover", "SHF-07": "History",
  "FIN-01": "Overview", "FIN-02": "Cash Ledger", "FIN-03": "Reconciliation", "FIN-04": "QRIS",
  "FIN-05": "Deposit/Custody", "FIN-06": "Risk Cases", "FIN-07": "Daily Approval Center",
  "FIN-08": "Monthly Accountability",
  "CAT-01": "Catalog", "CAT-02": "Product Form", "CAT-03": "Variant/Add-on", "CAT-04": "Price List",
  "CAT-05": "Event Pricing", "CAT-06": "Import Review",
  "REC-01": "Materials", "REC-02": "BOM", "REC-03": "Supplier Cost", "REC-04": "HPP Impact",
  "REC-05": "Recipe Versions",
  "WMS-01": "Inventory", "WMS-02": "Requests", "WMS-03": "PR/PO", "WMS-04": "Receiving",
  "WMS-05": "Opname", "WMS-06": "Adjustments", "WMS-07": "Suppliers",
  "KDS-01": "Ticket Board", "KDS-02": "Ticket Detail", "KDS-03": "Batch", "KDS-04": "Stock-out",
  "KDS-05": "Material Request",
  "TBL-01": "Map", "TBL-02": "QR Setup", "ORD-01": "Digital Menu", "ORD-02": "Cart", "ORD-03": "Tracking",
  "DOC-01": "Explorer", "DOC-02": "Export History", "RPT-01": "Builder", "RPT-02": "Preview",
  "RPT-03": "Schedule", "RPT-04": "Delivery Logs",
  "MEM-01": "Login", "MEM-02": "Email/WA Verification", "MEM-03": "Profile", "MEM-04": "Card",
  "MEM-05": "Points", "CRM-01": "Directory", "CRM-02": "Segment",
  "HR-01": "Staff Applications", "HR-02": "Directory", "HR-03": "Role", "HR-04": "Attendance",
  "HR-05": "Schedule", "HR-06": "Payroll Preview",
  "EVT-01": "Events", "EVT-02": "Event Menu", "EVT-03": "Guest List", "EVT-04": "Personal Links",
  "EVT-05": "RSVP",
  "MKT-01": "Assets", "MKT-02": "Editor", "MKT-03": "Calendar", "MKT-04": "Publish Queue",
  "MKT-05": "Performance",
  "MSG-01": "Alerts", "MSG-02": "Email Draft", "MSG-03": "Templates", "MSG-04": "Rules",
  "SYS-01": "Access Approval", "SYS-02": "Role Matrix", "SYS-03": "Outlet/Business Date",
  "SYS-04": "Integrations", "SYS-05": "Audit & Recovery", "SYS-06": "Health", "SYS-07": "Settings",
  "SYS-08": "Module Registry",
  "AI-01": "Command Center", "AI-02": "Evidence Answer", "AI-03": "Action Preview & Diff",
  "AI-04": "Approval & Receipt", "AI-05": "Capability Registry", "AYA-01": "Contextual Assistant",
};

// Halaman → layar PRD. Kunci = path URL persis; nilai pertama = layar utama.
// Catatan singkat menjelaskan pemetaan yang tidak 1:1.
const PAGE_MAP: Record<string, { screens: string[]; area: string; note?: string }> = {
  "/": { screens: [], area: "Publik", note: "Website publik Garage Coffee (di luar registry operasional)" },
  "/absen": { screens: ["HR-04"], area: "HR" },
  "/account/password": { screens: ["SYS-07"], area: "Akun" },
  "/account/pin": { screens: ["SYS-07"], area: "Akun" },
  "/attendance": { screens: ["HR-04"], area: "HR" },
  "/control": { screens: ["DSH-01"], area: "Owner Control" },
  "/control/2fa": { screens: ["SYS-07"], area: "Owner Control", note: "Pemasangan MFA" },
  "/control/admin": { screens: ["SYS-07"], area: "Owner Control" },
  "/control/branches": { screens: ["SYS-03"], area: "Owner Control" },
  "/control/briefing": { screens: ["DSH-04"], area: "Owner Control" },
  "/control/cash-closing": { screens: ["FIN-07", "FIN-05"], area: "Owner Control" },
  "/control/cashflow": { screens: ["FIN-02"], area: "Owner Control" },
  "/control/compliance": { screens: ["SYS-05"], area: "Owner Control" },
  "/control/customers": { screens: ["CRM-01"], area: "Owner Control" },
  "/control/financial": { screens: ["FIN-01"], area: "Owner Control" },
  "/control/financial/closing": { screens: ["FIN-08"], area: "Owner Control" },
  "/control/financial/intelligence": { screens: ["DSH-02"], area: "Owner Control" },
  "/control/financial/settings": { screens: ["SYS-07"], area: "Owner Control" },
  "/control/health": { screens: ["SYS-06"], area: "Owner Control" },
  "/control/hr": { screens: ["HR-02"], area: "Owner Control" },
  "/control/inventory-intel": { screens: ["WMS-01", "DSH-03"], area: "Owner Control" },
  "/control/kitchen-ops": { screens: ["DSH-03"], area: "Owner Control" },
  "/control/menu-engineering": { screens: ["REC-04", "CAT-04"], area: "Owner Control" },
  "/control/onboarding": { screens: ["HR-01"], area: "Owner Control" },
  "/control/operations": { screens: ["DSH-01"], area: "Owner Control" },
  "/control/permissions": { screens: ["SYS-02"], area: "Owner Control" },
  "/control/profitmax": { screens: ["DSH-03"], area: "Owner Control" },
  "/control/risk": { screens: ["FIN-06"], area: "Owner Control" },
  "/control/sales": { screens: ["DSH-02"], area: "Owner Control" },
  "/control/security": { screens: ["SYS-07", "SYS-04"], area: "Owner Control" },
  "/control/settings": { screens: ["SYS-07"], area: "Owner Control" },
  "/control/themes": { screens: ["SYS-07"], area: "Owner Control" },
  "/control/users": { screens: ["SYS-02", "HR-03"], area: "Owner Control" },
  "/dashboard": { screens: ["DSH-01"], area: "Dashboard" },
  "/display/customer-queue": { screens: ["ORD-03"], area: "Display" },
  "/display/payment": { screens: ["POS-02"], area: "Display", note: "Layar pelanggan saat bayar" },
  "/events/[slug]/menu": { screens: ["EVT-02"], area: "Event" },
  "/grand-opening": { screens: ["EVT-01"], area: "Publik" },
  "/invoice/[token]": { screens: ["POS-06"], area: "Publik" },
  "/legal/privacy": { screens: [], area: "Publik" },
  "/legal/terms": { screens: [], area: "Publik" },
  "/login": { screens: [], area: "Auth", note: "Login staf (tidak ada di registry §25.1)" },
  "/login/2fa": { screens: [], area: "Auth" },
  "/member": { screens: ["MEM-03", "MEM-04", "MEM-05"], area: "Member" },
  "/member-login": { screens: ["MEM-01"], area: "Member" },
  "/oauth/consent": { screens: ["AI-04"], area: "AI/MCP", note: "Consent OAuth ChatGPT (M0)" },
  "/order": { screens: ["ORD-01", "ORD-02", "ORD-03"], area: "Order/QR" },
  "/order/qr-print": { screens: ["TBL-02"], area: "Order/QR" },
  "/os": { screens: [], area: "OS shell", note: "Kerangka 24 modul /os?module=… (lihat tabel modul)" },
  "/owner/payroll": { screens: ["HR-06"], area: "Payroll" },
  "/owner/payroll/employees": { screens: ["HR-02"], area: "Payroll" },
  "/owner/payroll/pay": { screens: ["HR-06"], area: "Payroll" },
  "/owner/payroll/readiness": { screens: ["HR-06"], area: "Payroll" },
  "/owner/payroll/requests": { screens: ["HR-06"], area: "Payroll" },
  "/owner/payroll/settings": { screens: ["HR-06", "SYS-07"], area: "Payroll" },
  "/owner/payroll/thr": { screens: ["HR-06"], area: "Payroll" },
  "/owner/payroll/today": { screens: ["HR-04", "HR-06"], area: "Payroll" },
  "/pos": { screens: ["POS-01", "POS-02"], area: "POS" },
  "/pos-login": { screens: [], area: "Auth", note: "Login kasir/terminal POS" },
  "/recruitment": { screens: ["HR-01"], area: "HR" },
  "/saas-executive": { screens: ["DSH-01"], area: "Dashboard", note: "Tampilan eksekutif lama; kandidat digabung" },
  "/sales-history": { screens: ["POS-03", "POS-04"], area: "POS" },
  "/shift": { screens: ["SHF-01", "SHF-02", "SHF-03", "SHF-04", "SHF-05"], area: "Shift" },
  "/staff/wallet-fee": { screens: ["HR-06"], area: "Payroll" },
  "/staff/wallet-gaji": { screens: ["HR-06"], area: "Payroll" },
  "/undangan/[token]": { screens: ["EVT-04", "EVT-05"], area: "Event" },
  "/warehouse": { screens: ["WMS-01"], area: "WMS" },
  "/warehouse/activity-log": { screens: ["SYS-05"], area: "WMS" },
  "/warehouse/adjustment": { screens: ["WMS-06"], area: "WMS" },
  "/warehouse/analytics": { screens: ["RPT-02"], area: "WMS" },
  "/warehouse/bar": { screens: ["KDS-03"], area: "WMS" },
  "/warehouse/checklist": { screens: ["WMS-01"], area: "WMS" },
  "/warehouse/closing": { screens: ["WMS-05"], area: "WMS" },
  "/warehouse/cold-chain": { screens: ["WMS-01"], area: "WMS" },
  "/warehouse/internal-order": { screens: ["WMS-02"], area: "WMS" },
  "/warehouse/inventory": { screens: ["WMS-01"], area: "WMS" },
  "/warehouse/keuangan": { screens: ["WMS-03", "REC-03"], area: "WMS" },
  "/warehouse/kitchen": { screens: ["KDS-03"], area: "WMS" },
  "/warehouse/master": { screens: ["WMS-07", "REC-01"], area: "WMS" },
  "/warehouse/material-requests": { screens: ["WMS-02", "KDS-05"], area: "WMS" },
  "/warehouse/opname": { screens: ["WMS-05"], area: "WMS" },
  "/warehouse/preparation": { screens: ["KDS-03"], area: "WMS" },
  "/warehouse/production": { screens: ["KDS-03"], area: "WMS" },
  "/warehouse/purchase-orders": { screens: ["WMS-03"], area: "WMS" },
  "/warehouse/purchasing": { screens: ["WMS-03"], area: "WMS" },
  "/warehouse/receiving": { screens: ["WMS-04"], area: "WMS" },
  "/warehouse/recipe": { screens: ["REC-02", "REC-05"], area: "WMS" },
  "/warehouse/reorder": { screens: ["WMS-03"], area: "WMS" },
  "/warehouse/reports": { screens: ["RPT-02"], area: "WMS" },
  "/warehouse/requests": { screens: ["WMS-02"], area: "WMS" },
  "/warehouse/scan": { screens: ["WMS-01"], area: "WMS" },
  "/warehouse/settings": { screens: ["SYS-07"], area: "WMS" },
  "/warehouse/transfer": { screens: ["WMS-06"], area: "WMS" },
  "/warehouse/waste": { screens: ["WMS-06"], area: "WMS" },
  "/wifi": { screens: ["MEM-03"], area: "Member" },
};

// Modul OS (/os?module=…) → layar PRD.
const MODULE_MAP: Record<string, { screens: string[]; note?: string }> = {
  "ai-agent": { screens: ["AI-01", "AYA-01"] },
  approvals: { screens: ["FIN-07", "SYS-01"] },
  audit: { screens: ["SYS-05"] },
  chat: { screens: ["MSG-01"], note: "Chat internal staf/pelanggan" },
  "company-control": { screens: ["SYS-07", "SYS-08"] },
  courier: { screens: ["ORD-03"] },
  crm: { screens: ["CRM-01", "CRM-02"] },
  dashboard: { screens: ["DSH-01"] },
  earnings: { screens: ["HR-06"] },
  events: { screens: ["EVT-01", "EVT-03", "CAT-05"] },
  finance: { screens: ["FIN-01", "FIN-02", "FIN-03", "FIN-04"] },
  inventory: { screens: ["WMS-01"], note: "Ringkas; operasi stok di /warehouse" },
  kitchen: { screens: ["KDS-01", "KDS-02", "KDS-04"] },
  marketing: { screens: ["MKT-01", "MKT-02", "MKT-03", "MKT-04"] },
  membership: { screens: ["CRM-02", "MEM-04", "MEM-05"] },
  "ops-center": { screens: ["DSH-04"] },
  pos: { screens: ["POS-01", "POS-02", "POS-07"] },
  produk: { screens: ["CAT-01", "CAT-02", "CAT-03", "CAT-06"] },
  recruitment: { screens: ["HR-01"] },
  settings: { screens: ["SYS-07", "SYS-03"] },
  "smart-notif": { screens: ["MSG-04"] },
  "team-management": { screens: ["HR-02", "HR-05"] },
  training: { screens: [], note: "Panduan per role (tidak ada di registry)" },
  waiter: { screens: ["TBL-01"] },
  website: { screens: ["MKT-01"], note: "Kelola website publik" },
};

const API_GUARDS = [
  "requirePermission",
  "requireAnyPermission",
  "requireGarageSession",
  "requireOwnerOrManager",
  "requireCashierSession",
  "requireHumanSession",
  "requireMemberAuth",
  "requirePosTerminal",
  "requireMcpAuth",
  "requireGarageAiJobAuthorization",
  "verifyMetaWebhookSignature",
];
// Guard tidak langsung: helper yang di dalamnya memanggil guard, atau mekanisme non-sesi.
const INDIRECT_GUARDS: Array<[RegExp, string]> = [
  [/\bfinanceSectionHandler\(/, "helper→requirePermission(finance:read)"],
  [/\breplenishmentSession\(/, "helper→requireGarageSession"],
  [/\bresolveAbsenEmployee\(|\bpinHash\b/, "PIN karyawan"],
  [/\bsecretsMatch\(/, "shared secret"],
  [/NODE_ENV\s*!==\s*"production"/, "dev-only"],
  [/\bauth\.handler\b|toNextJsHandler\(/, "Better Auth"],
  [/\b(oauthProviderAuthServerMetadata|oauthProviderProtectedResourceMetadata|oAuthDiscoveryMetadata|oAuthProtectedResourceMetadata)\b|mcp-chatgpt-discovery/, "OAuth discovery (publik)"],
];
const PAGE_GUARDS = ["requireGarageSession", "requireModulePageAccess", "requirePermission", "redirect"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function walk(dir: string, file: string, acc: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, file, acc);
    else if (entry.name === file) acc.push(full);
  }
  return acc;
}

function urlFor(file: string) {
  const rel = path.relative(APP, path.dirname(file)).split(path.sep).filter(Boolean);
  // Folder (group) dan _private tidak masuk URL.
  const hidden = rel.some((s) => s.startsWith("_"));
  // Folder (group) tidak masuk URL; folder privat `_…` dipertahankan agar terlihat jelas bukan route.
  const segments = rel.filter((s) => !/^\(.*\)$/.test(s));
  return { url: "/" + segments.join("/"), hidden };
}

function read(file: string) {
  return fs.readFileSync(file, "utf8");
}

function ancestorLayouts(file: string) {
  const layouts: string[] = [];
  let dir = path.dirname(file);
  while (dir.startsWith(APP)) {
    const layout = path.join(dir, "layout.tsx");
    if (fs.existsSync(layout) && dir !== APP) layouts.push(layout);
    dir = path.dirname(dir);
  }
  return layouts;
}

function guardsIn(source: string, names: string[]) {
  return names.filter((name) => new RegExp(`\\b${name}\\(`).test(source));
}

function rel(file: string) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

// ── Halaman ───────────────────────────────────────────────────────────────
const pages = walk(APP, "page.tsx").map((file) => {
  const { url, hidden } = urlFor(file);
  const source = read(file);
  const layoutGuards = ancestorLayouts(file).flatMap((l) => guardsIn(read(l), PAGE_GUARDS));
  // Wrapper /control/* mengimpor implementasi dari /control/_dashboard/*/page: ikutkan guard-nya.
  const importedPages = [...source.matchAll(/from\s+"@\/app\/([^"]+\/page)"/g)].map((m) => path.join(APP, `${m[1]}.tsx`));
  const importedGuards = importedPages.filter((f) => fs.existsSync(f)).flatMap((f) => guardsIn(read(f), PAGE_GUARDS));
  const wrapperGuards = /<ControlDashboardRoute\b/.test(source) ? ["ControlDashboardRoute"] : [];
  const guards = [...new Set([...guardsIn(source, PAGE_GUARDS), ...layoutGuards, ...importedGuards, ...wrapperGuards])].sort();
  const imports = [...source.matchAll(/from\s+"(@\/components\/[^"]+)"/g)].map((m) => m[1]).sort();
  const mapped = hidden ? undefined : PAGE_MAP[url];
  return {
    url,
    file: rel(file),
    hidden,
    area: hidden ? "Implementasi (_private)" : mapped?.area ?? "UNMAPPED",
    screens: mapped?.screens ?? [],
    note: hidden ? "Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati)" : mapped?.note ?? "",
    serverGuards: guards,
    components: imports,
    client: /^\s*["']use client["']/.test(source),
  };
});

// ── Modul OS ──────────────────────────────────────────────────────────────
const appSource = read(path.join(ROOT, "src/components/garage/garage-app.tsx"));
const moduleIds = [...new Set([...appSource.matchAll(/safeActiveModule === "([a-z-]+)"/g)].map((m) => m[1]))].sort();
const roles = Object.keys(roleModules).sort() as (keyof typeof roleModules)[];
const modules = moduleIds.map((id) => ({
  id,
  url: `/os?module=${id}`,
  screens: MODULE_MAP[id]?.screens ?? [],
  note: MODULE_MAP[id]?.note ?? (MODULE_MAP[id] ? "" : "UNMAPPED"),
  roles: roles.filter((r) => (roleModules[r] as string[]).includes(id)),
}));

// ── API ───────────────────────────────────────────────────────────────────
const apiRoutes = walk(APP, "route.ts").map((file) => {
  const { url } = urlFor(file);
  const isApi = url.startsWith("/api/");
  const source = read(file);
  const methods = METHODS.filter((m) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b|export\\s+const\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b`).test(source),
  );
  const guards = guardsIn(source, API_GUARDS);
  const indirect = guards.length ? [] : INDIRECT_GUARDS.filter(([re]) => re.test(source)).map(([, label]) => label);
  const legacy410 = /\blegacyInventoryGone\(/.test(source);
  const rateLimited = /\brateLimit\(/.test(source);
  // Route handler di luar /api (well-known OAuth, file upload, kalender) dikelompokkan dengan prefiks "~".
  const group = isApi ? url.split("/")[2] ?? "" : `~${url.split("/")[1] ?? ""}`;
  const access = guards.length ? "guard" : indirect.length ? "indirect" : legacy410 ? "legacy410" : "public";
  return { url, group, file: rel(file), methods, guards, indirect, access, legacy410, rateLimited };
});

// ── Ringkasan & gap ───────────────────────────────────────────────────────
const usedScreens = new Set<string>([...pages.flatMap((p) => p.screens), ...modules.flatMap((m) => m.screens)]);
const missingScreens = Object.keys(PRD_SCREENS).filter((id) => !usedScreens.has(id));
const apiGroups = [...new Set(apiRoutes.map((r) => r.group))].sort().map((group) => {
  const rows = apiRoutes.filter((r) => r.group === group);
  return {
    group,
    routes: rows.length,
    indirect: rows.filter((r) => r.access === "indirect").length,
    public: rows.filter((r) => r.access === "public").length,
    legacy410: rows.filter((r) => r.legacy410).length,
    rateLimited: rows.filter((r) => r.rateLimited).length,
  };
});

const census = {
  source: "src/app (main)",
  totals: {
    pages: pages.length,
    routablePages: pages.filter((p) => !p.hidden).length,
    hiddenPages: pages.filter((p) => p.hidden).length,
    osModules: modules.length,
    apiRoutes: apiRoutes.length,
    apiGroups: apiGroups.length,
    apiIndirectGuard: apiRoutes.filter((r) => r.access === "indirect").length,
    apiPublic: apiRoutes.filter((r) => r.access === "public").length,
    apiLegacy410: apiRoutes.filter((r) => r.legacy410).length,
    prdScreens: Object.keys(PRD_SCREENS).length,
    prdScreensCovered: Object.keys(PRD_SCREENS).length - missingScreens.length,
  },
  pages,
  modules,
  apiGroups,
  apiRoutes,
  missingScreens: missingScreens.map((id) => ({ id, name: PRD_SCREENS[id] })),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "routes.json"), JSON.stringify(census, null, 2) + "\n");

// ── TABLES.md ─────────────────────────────────────────────────────────────
const cell = (v: string) => v.replace(/\|/g, "\\|");
const screensLabel = (ids: string[]) => (ids.length ? ids.map((id) => `${id} ${PRD_SCREENS[id] ?? "?"}`).join(", ") : "—");
const lines: string[] = [];
lines.push("# Tabel sensus (dihasilkan `scripts/screen-census.ts` — jangan diedit manual)", "");
lines.push("## Halaman", "", "| URL | Area | Layar PRD §25.1 | Guard server | Catatan |", "|---|---|---|---|---|");
for (const p of pages) {
  lines.push(
    `| \`${p.url}\` | ${p.area} | ${cell(screensLabel(p.screens))} | ${p.serverGuards.join(", ") || "— (client/API)"} | ${cell(p.note)} |`,
  );
}
lines.push("", "## Modul OS (`/os?module=…`)", "", "| Modul | Layar PRD | Role | Catatan |", "|---|---|---|---|");
for (const m of modules) lines.push(`| \`${m.id}\` | ${cell(screensLabel(m.screens))} | ${m.roles.join(", ")} | ${cell(m.note)} |`);
lines.push("", "## Route handler per grup", "", "Grup berawalan `~` = route handler di luar `/api` (mis. `~.well-known`, `~garage-uploads`).", "", "| Grup | Route | Guard tidak langsung | Publik* | Legacy 410 | Rate limit |", "|---|---|---|---|---|---|");
for (const g of apiGroups) lines.push(`| \`${g.group}\` | ${g.routes} | ${g.indirect} | ${g.public} | ${g.legacy410} | ${g.rateLimited} |`);
lines.push(
  "",
  "*Publik = file `route.ts` tidak memanggil guard sesi/permission yang dikenal maupun helper guard. Sebagian besar",
  "memang publik (menu digital, status pesanan, webhook, health, file upload); daftar lengkap di bawah untuk ditinjau.",
  "",
  "## Route dengan guard tidak langsung",
  "",
  "| Route | Method | Mekanisme |",
  "|---|---|---|",
);
for (const r of apiRoutes.filter((x) => x.access === "indirect")) lines.push(`| \`${r.url}\` | ${r.methods.join(", ")} | ${r.indirect.join(", ")} |`);
lines.push("", "## Route publik (tanpa guard sesi)", "", "| Route | Method | Rate limit |", "|---|---|---|");
for (const r of apiRoutes.filter((x) => x.access === "public")) lines.push(`| \`${r.url}\` | ${r.methods.join(", ")} | ${r.rateLimited ? "ya" : "—"} |`);
lines.push("", "## Layar PRD §25.1 tanpa halaman/modul", "", "| ID | Nama |", "|---|---|");
for (const s of census.missingScreens) lines.push(`| ${s.id} | ${s.name} |`);
lines.push("");
fs.writeFileSync(path.join(OUT_DIR, "TABLES.md"), lines.join("\n"));

console.log(JSON.stringify(census.totals, null, 2));
