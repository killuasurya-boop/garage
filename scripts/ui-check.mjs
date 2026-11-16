#!/usr/bin/env node
// Cek visual hemat token: hanya mencetak temuan, bukan isi halaman.
// Pakai: node scripts/ui-check.mjs /pos /inventory [--base=http://127.0.0.1:3000] [--shots=DIR] [--only=desktop|mobile]
// Cek: console error / page error, overflow horizontal, teks terpotong (elemen dengan scrollWidth > clientWidth).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// @playwright/test (devDependency) bila node_modules terpasang, else Playwright global (NODE_PATH, sesi cloud).
const require = createRequire(import.meta.url);
const loadPlaywright = () => {
  for (const name of ["@playwright/test", "playwright"]) {
    try {
      return require(name);
    } catch {}
  }
  throw new Error("Playwright tidak ditemukan: jalankan npm install dulu.");
};
const { chromium } = loadPlaywright();

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const base = (opt("base") ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const shots = opt("shots");
const only = opt("only");
const paths = args.filter((a) => !a.startsWith("--"));
if (paths.length === 0) paths.push("/");

const viewports = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
].filter((v) => !only || v.name === only);

const MAX = 8; // maksimal temuan per jenis per halaman
let problems = 0;

const launch = async () => {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  }
};

const browser = await launch();
if (shots) mkdirSync(shots, { recursive: true });

for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  for (const path of paths) {
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));

    const url = /^(https?|file|data):/.test(path) ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    let status = "?";
    try {
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      status = res?.status() ?? "?";
    } catch (e) {
      console.log(`✗ ${vp.name} ${path} gagal dibuka: ${String(e.message).split("\n")[0]}`);
      problems++;
      await page.close();
      continue;
    }

    const result = await page.evaluate((max) => {
      const doc = document.documentElement;
      const hOverflow = doc.scrollWidth - doc.clientWidth;
      const label = (el) => {
        const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}`;
      };
      const clipped = [];
      const wide = [];
      for (const el of document.body.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden") continue;
        if (r.right > doc.clientWidth + 1 && wide.length < max && style.position !== "fixed") {
          const scroller = el.closest("[data-scroll-x], .overflow-x-auto, .overflow-auto, .overflow-x-scroll");
          if (!scroller) wide.push(`${label(el)} kanan=${Math.round(r.right)}px`);
        }
        const text = (el.childElementCount === 0 ? el.textContent : "")?.trim();
        if (!text) continue;
        const hidesX = /hidden|clip/.test(style.overflowX) || style.textOverflow === "ellipsis";
        if (hidesX && el.scrollWidth > el.clientWidth + 1 && clipped.length < max) {
          clipped.push(`${label(el)} "${text.slice(0, 40)}"`);
        }
      }
      return { hOverflow, clipped, wide };
    }, MAX);

    const issues = [];
    if (errors.length) issues.push(`console error (${errors.length}): ${errors.slice(0, 3).join(" | ")}`);
    if (result.hOverflow > 0) issues.push(`overflow horizontal ${result.hOverflow}px: ${result.wide.slice(0, 4).join(", ")}`);
    if (result.clipped.length) issues.push(`teks terpotong: ${result.clipped.join(", ")}`);

    if (shots) {
      const file = join(shots, `${vp.name}${path.replace(/[^a-z0-9]+/gi, "_") || "_root"}.png`);
      await page.screenshot({ path: file });
    }

    if (issues.length) {
      problems += issues.length;
      console.log(`✗ ${vp.name} ${path} [${status}]`);
      for (const i of issues) console.log(`   - ${i}`);
    } else {
      console.log(`✓ ${vp.name} ${path} [${status}]`);
    }
    await page.close();
  }
  await context.close();
}

await browser.close();
console.log(problems ? `${problems} temuan.` : "Bersih.");
process.exit(problems ? 1 : 0);
