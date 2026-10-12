// Panduan kerja per role (owner, Okt 2026). Satu sumber data untuk tab
// "Panduan" di modul Training dan dokumen docs/panduan/*.md (npm run docs:guides).

import type { Role } from "@/lib/garage-data";

export type GuideStep = {
  text: string;
  /** Tips singkat (latar amber). */
  tip?: string;
  /** Peringatan penting (latar merah). */
  warn?: string;
};

export type GuideSection = {
  id: string;
  title: string;
  /** Kalimat pembuka bab. */
  intro?: string;
  steps: GuideStep[];
  /** Pertanyaan/masalah umum di bab ini. */
  faq?: Array<{ q: string; a: string }>;
};

export type RoleGuide = {
  id: string;
  title: string;
  summary: string;
  roles: Role[];
  updatedAt: string;
  sections: GuideSection[];
};
