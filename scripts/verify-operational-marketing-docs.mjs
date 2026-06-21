#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const packageDocs = [
  "docs/GARAGE-OPERATIONAL-MARKETING-MANIFEST.md",
  "docs/GARAGE-OPERATIONAL-MARKETING-START-HERE.md",
  "docs/GARAGE-OPERATIONAL-MARKETING-CHECKLIST.md",
  "docs/GARAGE-PROMO-PROFIT-WORKSHEET.md",
  "docs/GARAGE-WHATSAPP-ORDER-SOP.md",
  "docs/GARAGE-GOOGLE-MAPS-LOCAL-SEO-CHECKLIST.md",
  "docs/GARAGE-MARKETING-30-DAY-CONTENT-CALENDAR.md",
  "docs/GARAGE-STAFF-SOFT-LAUNCH-TRAINING-CHECKLIST.md",
  "docs/GARAGE-DAILY-OWNER-REPORT-TEMPLATE.md",
];

const supportDocs = [
  "docs/PILOT_LAUNCH_CHECKLIST.md",
  "docs/GO-LIVE-FINAL-CHECKLIST.md",
  "docs/PILOT-ISSUE-LOG.md",
  "docs/SOP-FINAL-OPERASIONAL-GARAGE.md",
  "docs/buku-pintar-panduan-sop-karyawan.md",
  "docs/garage-qr-cashier-sop.md",
  "design-system/pages/landing.md",
];

const allowedGoClaimPatterns = [
  /belum menyatakan GARAGE sudah GO/i,
  /belum menyatakan GARAGE GO/i,
  /GO \/ CONDITIONAL \/ NO-GO/i,
  /GO\/CONDITIONAL\/NO-GO/i,
  /GO\/NO-GO/i,
  /GO jika:/i,
  /NO-GO jika:/i,
  /Status naik jika:/i,
  /Status akhir yang dicari bukan/i,
  /Tidak boleh mengubah status ke `GO`/i,
  /Owner memutuskan `GO \/ CONDITIONAL \/ NO-GO`/i,
  /Campaign boleh jalan normal jika:/i,
  /Tahan campaign jika:/i,
];

const failures = [];
const warnings = [];

function normalizeRef(ref) {
  return ref.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function isLocalMarkdownRef(ref) {
  if (/^(https?:|mailto:|#)/i.test(ref)) return false;
  return normalizeRef(ref).endsWith(".md");
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function extractMarkdownRefs(text) {
  const refs = new Set();
  const codeRefPattern = /`([^`]+\.md)`/g;
  const linkPattern = /\[[^\]]+\]\(([^)]+\.md)(?::\d+)?\)/g;

  for (const match of text.matchAll(codeRefPattern)) {
    const value = match[1].trim();
    if (isLocalMarkdownRef(value)) refs.add(normalizeRef(value));
  }

  for (const match of text.matchAll(linkPattern)) {
    const value = match[1].trim();
    if (isLocalMarkdownRef(value)) refs.add(normalizeRef(value));
  }

  return Array.from(refs);
}

function hasUnsafeGoClaim(line) {
  const trimmed = line.trim();
  if (!/\b(sudah GO|dinyatakan GO|Status akhir|status akhir)\b/i.test(trimmed)) {
    return false;
  }
  return !allowedGoClaimPatterns.some((pattern) => pattern.test(trimmed));
}

for (const doc of [...packageDocs, ...supportDocs]) {
  if (!(await exists(doc))) {
    failures.push(`Missing required document: ${doc}`);
  }
}

for (const doc of packageDocs) {
  if (!(await exists(doc))) continue;

  const text = await readFile(path.join(root, doc), "utf8");
  const refs = extractMarkdownRefs(text);

  for (const ref of refs) {
    if (!(await exists(ref))) {
      failures.push(`${doc} references missing document: ${ref}`);
    }
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (hasUnsafeGoClaim(line)) {
      failures.push(`${doc}:${index + 1} has unsafe readiness claim: ${line.trim()}`);
    }
  });

  if (!text.includes("Draft") && !doc.endsWith("DAILY-OWNER-REPORT-TEMPLATE.md")) {
    warnings.push(`${doc} does not include an explicit Draft status marker`);
  }
}

if (warnings.length > 0) {
  console.warn("[operational-marketing-docs] warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (failures.length > 0) {
  console.error("[operational-marketing-docs] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[operational-marketing-docs] OK");
console.log(`Checked ${packageDocs.length} package docs and ${supportDocs.length} support docs.`);
