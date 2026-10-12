// Tulis docs/panduan/*.md dari data panduan per role (src/lib/role-guides).
// Jalankan: npm run docs:guides
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { guideToMarkdown, ROLE_GUIDES } from "../src/lib/role-guides";

const outDir = path.join(process.cwd(), "docs", "panduan");
mkdirSync(outDir, { recursive: true });
const fileNames: Record<string, string> = {
  kasir: "KASIR.md",
  waiter: "WAITER.md",
  kurir: "KURIR.md",
  barista: "BARISTA.md",
  dapur: "DAPUR.md",
  "manajer-harian": "MANAJER-HARIAN.md",
  "manajer-kasir": "MANAJER-KASIR.md",
  owner: "OWNER.md",
};
for (const guide of ROLE_GUIDES) {
  const file = path.join(outDir, fileNames[guide.id] ?? `${guide.id.toUpperCase()}.md`);
  writeFileSync(file, guideToMarkdown(guide));
  console.log(`✓ ${path.relative(process.cwd(), file)}`);
}
