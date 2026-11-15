#!/usr/bin/env node
/**
 * Garage OS public-repository preflight.
 * Scans tracked working-tree files only. Does NOT scan Git history or assert
 * that the repository is free of secrets or personal information.
 * Never prints matched credential values.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const blockedPaths = [
  /^\.claude\/settings\.local\.json$/,
  /^docs\/franchise-internal\/uploads\//,
  /^docs\/data\//,
  /^storage\/company-documents\/seed\//,
  /^public\/uploads\//,
  /^output\//,
  /^tmp\//,
  /^testsprite_tests\/tmp\//,
  /(^|\/)\.env($|\.)/,
  /\.(pem|p12|pfx|key)$/i,
];

const highConfidenceSecrets = [
  ["private-key-block", /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/],
  ["github-token", /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ["aws-access-key-id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["stripe-live-secret", /\bsk_live_[A-Za-z0-9]{16,}\b/],
  ["slack-token", /\bxox(?:b|p|a|s)-[0-9A-Za-z-]{20,}/],
];

const scanExtensions = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|txt|yml|yaml|sh|ps1|py|toml|ini|xml|html|css|conf|properties)$/i;
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0").filter(Boolean);
const findings = [];

for (const file of files) {
  if (blockedPaths.some((re) => re.test(file))) {
    findings.push({ file, issue: "blocked-private-or-generated-path" });
    continue;
  }
  if (!scanExtensions.test(file)) continue;
  const absolute = resolve(root, file);
  try {
    if (statSync(absolute).size > 2_000_000) continue;
    const content = readFileSync(absolute, "utf8");
    for (const [name, re] of highConfidenceSecrets) {
      if (re.test(content)) findings.push({ file, issue: name });
    }
  } catch (error) {
    findings.push({ file, issue: "could-not-read-file" });
  }
}

if (findings.length > 0) {
  console.error("PUBLICATION PRECHECK: FAILED. Tracked risky paths / potential tokens:");
  for (const f of findings) console.error(` - ${f.file} [${f.issue}]`);
  console.error("Do not copy potentially sensitive contents into public issues or CI logs.");
  process.exitCode = 1;
} else {
  console.log(`PUBLICATION PRECHECK: PASSED for ${files.length} tracked working-tree paths.`);
  console.log("Note: historical commits, binaries, third-party licenses, and business-private documents still require separate manual review.");
}
