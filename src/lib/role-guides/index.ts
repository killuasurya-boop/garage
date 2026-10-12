import type { Role } from "@/lib/garage-data";
import { kasirGuide } from "@/lib/role-guides/kasir";
import { manajerKasirGuide } from "@/lib/role-guides/manajer-kasir";
import type { RoleGuide } from "@/lib/role-guides/types";

export type { GuideSection, GuideStep, RoleGuide } from "@/lib/role-guides/types";

/** Semua panduan. Tambah role lain di sini (Barista, Waiter, Kurir, …). */
export const ROLE_GUIDES: RoleGuide[] = [kasirGuide, manajerKasirGuide];

/** Panduan untuk role ini. Owner/Manajer melihat semua panduan. */
export function guidesForRole(role: Role | string): RoleGuide[] {
  if (role === "Owner" || role === "Manajer") return ROLE_GUIDES;
  return ROLE_GUIDES.filter((guide) => guide.roles.includes(role as Role));
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
