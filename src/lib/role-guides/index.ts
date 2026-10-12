import type { Role } from "@/lib/garage-data";
import { kasirGuide } from "@/lib/role-guides/kasir";
import { kurirGuide } from "@/lib/role-guides/kurir";
import { manajerHarianGuide } from "@/lib/role-guides/manajer-harian";
import { manajerKasirGuide } from "@/lib/role-guides/manajer-kasir";
import { ownerGuide } from "@/lib/role-guides/owner";
import { baristaGuide, dapurGuide } from "@/lib/role-guides/produksi";
import { waiterGuide } from "@/lib/role-guides/waiter";
import type { RoleGuide } from "@/lib/role-guides/types";

export type { GuideSection, GuideStep, RoleGuide } from "@/lib/role-guides/types";

/** Semua panduan kerja per posisi (urutan = urutan di pilihan panduan). */
export const ROLE_GUIDES: RoleGuide[] = [
  kasirGuide,
  waiterGuide,
  kurirGuide,
  baristaGuide,
  dapurGuide,
  manajerHarianGuide,
  manajerKasirGuide,
  ownerGuide,
];

/**
 * Panduan untuk akun ini (role + posisi/workstation). Owner/Manajer melihat
 * semua panduan supaya bisa melatih tim.
 */
export function guidesForRole(role: Role | string, workstation?: string | null): RoleGuide[] {
  if (role === "Owner") return ROLE_GUIDES;
  // Manajer: panduan tim + panduan Manajer (panduan Owner disembunyikan).
  if (role === "Manajer") return ROLE_GUIDES.filter((guide) => guide.id !== "owner");
  const ws = workstation?.trim() || null;
  return ROLE_GUIDES.filter((guide) => {
    if (guide.workstations?.length) return Boolean(ws && guide.workstations.includes(ws.toLowerCase()));
    if (!guide.roles.includes(role as Role)) return false;
    return !(guide.onlyWithoutWorkstation && ws);
  });
}

/** Markdown untuk docs/panduan (npm run docs:guides) & cetak. */
export function guideToMarkdown(guide: RoleGuide): string {
  const lines: string[] = [
    `# ${guide.title}`,
    "",
    `> ${guide.summary}`,
    ">",
    `> Untuk: ${guide.roles.join(", ")} · Diperbarui ${guide.updatedAt}. Dokumen ini dibuat otomatis dari \`src/lib/role-guides/\` (\`npm run docs:guides\`) — ubah di sana, bukan di sini.`,
    "",
  ];
  for (const section of guide.sections) {
    lines.push(`## ${section.title}`, "");
    if (section.intro) lines.push(section.intro, "");
    section.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step.text}`);
      if (step.tip) lines.push(`   - Tips: ${step.tip}`);
      if (step.warn) lines.push(`   - **Penting:** ${step.warn}`);
    });
    lines.push("");
    if (section.faq?.length) {
      lines.push("**Tanya jawab**", "");
      for (const item of section.faq) lines.push(`- **${item.q}** ${item.a}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
