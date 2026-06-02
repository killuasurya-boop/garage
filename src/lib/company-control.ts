import "server-only";

import { access, copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  companyDocumentVersions,
  companyDocuments,
  companyOrgRoles,
  trainingCourses,
  trainingLessons,
  trainingProgress,
} from "@/db/schema";
import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import { createAuditLog } from "@/lib/garage-service";
import {
  getApprovalData,
  getAuditData,
  getDashboardData,
  getFinanceSummary,
  getInventoryData,
} from "@/lib/garage-service";
import type {
  Approval,
  AuditLog,
  CashSession,
  InventoryItem,
  PaymentBreakdown,
} from "@/lib/garage-api-types";

const companyStorageRoot = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "storage",
  "company-documents",
);
const maxDocumentBytes = 25 * 1024 * 1024;

export const documentUploadMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
  "text/html",
]);

const documentUploadExtensions = new Set([".pdf", ".docx", ".md", ".txt", ".html"]);

const managementRoles = new Set<Role>(["Owner / CEO"]);

const allInternalRoles: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Finance / CFO",
  "Kasir",
  "Barista",
  "Koki",
  "Waiter 1",
  "Waiter 2",
  "Kitchen / Barista",
  "Gudang",
  "Supervisor Shift",
  "Delivery Admin",
];

export const createCompanyDocumentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  category: z.string().trim().min(2).max(80),
  summary: z.string().trim().max(800).optional().default(""),
  ownerRole: z.string().trim().min(2).max(80),
  confidentiality: z.string().trim().min(2).max(40).optional().default("internal"),
  allowedRoles: z.array(z.string().trim().min(2).max(80)).optional().default([]),
});

export const createTrainingCourseSchema = z.object({
  title: z.string().trim().min(3).max(160),
  category: z.string().trim().min(2).max(80),
  summary: z.string().trim().max(800).optional().default(""),
  targetRoles: z.array(z.string().trim().min(2).max(80)).optional().default([]),
});

export type CompanyDocumentDto = {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  ownerRole: string;
  confidentiality: string;
  status: string;
  currentVersion: number;
  allowedRoles: string[];
  source: string;
  updatedAt: string;
  latestVersion: CompanyDocumentVersionDto | null;
};

export type CompanyDocumentVersionDto = {
  id: string;
  documentId: string;
  version: number;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
  notes: string | null;
  createdAt: string;
};

export type TrainingCourseDto = {
  id: string;
  slug: string;
  title: string;
  category: string;
  targetRoles: string[];
  summary: string;
  sortOrder: number;
  status: string;
  progressStatus: string | null;
  completedAt: string | null;
  lessons: Array<{
    id: string;
    title: string;
    summary: string;
    checklist: string[];
    documentSlug: string | null;
    sortOrder: number;
  }>;
};

export type CompanyOrgRoleDto = {
  id: string;
  roleTitle: string;
  personName: string | null;
  reportsTo: string | null;
  division: string;
  responsibility: string;
  authority: string;
  kpi: string[];
  sortOrder: number;
};

export type CompanyControlDto = {
  me: {
    name: string;
    email: string;
    role: Role;
    canManage: boolean;
  };
  live: {
    generatedAt: string;
    dashboard: Awaited<ReturnType<typeof getDashboardData>>;
    inventoryWarnings: InventoryItem[];
    finance: {
      cashSession: CashSession;
      paymentBreakdown: PaymentBreakdown[];
      totalCaptured: number;
    };
    approvals: Approval[];
    auditLogs: AuditLog[];
    staffPerformance: {
      trainingCompliance: number;
      sopCompliance: number;
      attendanceCompliance: number;
    };
  };
  metrics: Array<{ label: string; value: string; detail: string }>;
  documents: CompanyDocumentDto[];
  training: TrainingCourseDto[];
  orgRoles: CompanyOrgRoleDto[];
  management: {
    roadmap: Array<{ phase: string; focus: string; output: string }>;
    approvalFlow: Array<{ area: string; owner: string }>;
    teamsChannels: string[];
    dailyReport: string[];
  };
};

type SeedDocument = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  ownerRole: string;
  confidentiality: string;
  allowedRoles: string[];
  sourcePath: string;
};

const seedDocuments: SeedDocument[] = [
  {
    slug: "master-business-package-garage-digital-ecosystem",
    title: "Master Business Package GARAGE Digital Ecosystem",
    category: "Executive",
    summary:
      "Paket dasar manajemen: profil perusahaan, struktur direksi, struktur operasional, alur komando, KPI, Teams, dan dashboard owner.",
    ownerRole: "CEO / CTO / CIO",
    confidentiality: "confidential",
    allowedRoles: ["Owner / CEO", "Admin", "Manager Operasional", "Finance / CFO"],
    sourcePath: "C:\\Users\\killu\\Downloads\\MASTER_BUSINESS_PACKAGE_GARAGE_DIGITAL_ECOSYSTEM.docx",
  },
  {
    slug: "master-sop-garage-digital-ecosystem-ringkas",
    title: "Master SOP GARAGE Digital Ecosystem Ringkas",
    category: "SOP",
    summary:
      "SOP operasional ringkas untuk opening, kasir, kitchen, waiter, gudang, closing, fraud prevention, dan sistem down.",
    ownerRole: "COO / CRO",
    confidentiality: "internal",
    allowedRoles: allInternalRoles,
    sourcePath: "C:\\Users\\killu\\Downloads\\MASTER_SOP_Garage_Digital_Ecosystem_Ringkas.docx",
  },
  {
    slug: "master-sop-per-divisi-garage-digital-ecosystem",
    title: "Master SOP Per Divisi GARAGE Digital Ecosystem",
    category: "Training",
    summary:
      "Materi per divisi untuk kasir, kitchen, gudang, service, supervisor, manager, delivery, membership, dan laporan harian.",
    ownerRole: "COO / CRO",
    confidentiality: "internal",
    allowedRoles: allInternalRoles,
    sourcePath:
      "C:\\Users\\killu\\Downloads\\MASTER_SOP_Per_Divisi_Garage_Digital_Ecosystem_Ringkas.docx",
  },
  {
    slug: "kerangka-perusahaan-siap-diterapkan",
    title: "Kerangka Perusahaan Siap Diterapkan",
    category: "Management",
    summary:
      "Kerangka PT operasional, kontrol kas/stok, KPI minimum owner, roadmap 90 hari, dan dokumen yang harus disiapkan.",
    ownerRole: "CEO / CTO / CIO",
    confidentiality: "confidential",
    allowedRoles: ["Owner / CEO", "Admin", "Manager Operasional", "Finance / CFO"],
    sourcePath:
      "C:\\Users\\killu\\Downloads\\Kerangka_Perusahaan_Siap_Diterapkan_Garage_Digital_Ecosystem.docx",
  },
  {
    slug: "struktur-organisasi-garage-formal",
    title: "Struktur Organisasi GARAGE Digital Ecosystem Formal",
    category: "Organization",
    summary:
      "Struktur organisasi formal dari direksi sampai staf outlet beserta fungsi utama dan jalur laporan.",
    ownerRole: "CEO / CTO / CIO",
    confidentiality: "internal",
    allowedRoles: allInternalRoles,
    sourcePath:
      "C:\\Users\\killu\\Downloads\\Struktur_Organisasi_Garage_Digital_Ecosystem_Formal.docx",
  },
  {
    slug: "garage-doc1-prd-master",
    title: "GARAGE OS Product Requirements Document",
    category: "Product",
    summary:
      "PRD GARAGE OS: visi produk, personas, MVP, acceptance criteria, risiko, dan kriteria launch.",
    ownerRole: "CEO / CTO / CIO",
    confidentiality: "confidential",
    allowedRoles: ["Owner / CEO", "Admin", "Manager Operasional"],
    sourcePath: "H:\\My Drive\\DOKUMENT\\GARAGE_DOC1_PRD.md",
  },
  {
    slug: "garage-doc2-erd-master",
    title: "GARAGE OS ERD & Struktur Data",
    category: "Product",
    summary:
      "Struktur database GARAGE OS: tenant, outlet, user, customer, menu, order, payment, inventory, loyalty, dan audit log.",
    ownerRole: "CEO / CTO / CIO",
    confidentiality: "confidential",
    allowedRoles: ["Owner / CEO", "Admin", "Manager Operasional"],
    sourcePath: "H:\\My Drive\\DOKUMENT\\GARAGE_DOC2_ERD.md",
  },
  {
    slug: "garage-doc3-master-sop-system",
    title: "GARAGE Master SOP System",
    category: "SOP",
    summary:
      "SOP lengkap operasional GARAGE: rekrutmen, training, shift, opening, closing, kasir, kitchen, inventory, complaint, teknologi, dan krisis.",
    ownerRole: "COO / CRO",
    confidentiality: "internal",
    allowedRoles: allInternalRoles,
    sourcePath: "H:\\My Drive\\DOKUMENT\\GARAGE_DOC3_Master_SOP_System.md",
  },
  {
    slug: "garage-doc5-digital-marketing-master",
    title: "GARAGE Digital Marketing Master",
    category: "Marketing",
    summary:
      "Strategi marketing GARAGE: buyer persona B2C/B2B, pilar konten, platform, kalender, copywriting, workflow, dan KPI.",
    ownerRole: "CMO",
    confidentiality: "confidential",
    allowedRoles: ["Owner / CEO", "Admin", "Manager Operasional"],
    sourcePath: "H:\\My Drive\\DOKUMENT\\GARAGE_DOC5_Digital_Marketing_Master.md",
  },
  {
    slug: "garage-complete-playbook-final-integrated",
    title: "GARAGE Complete Playbook Final Integrated",
    category: "Executive",
    summary:
      "Playbook perusahaan terintegrasi dari ide ke produksi: corporate structure, product, SOP, finance, brand, scaling, legal.",
    ownerRole: "CEO / CTO / CIO",
    confidentiality: "confidential",
    allowedRoles: ["Owner / CEO", "Admin", "Manager Operasional", "Finance / CFO"],
    sourcePath: "H:\\My Drive\\DOKUMENT\\GARAGE_Complete_Playbook_Final_Integrated.pdf",
  },
];

const seedOrgRoles: Array<Omit<CompanyOrgRoleDto, "id">> = [
  {
    roleTitle: "CEO / CTO / CIO",
    personName: "Surya",
    reportsTo: null,
    division: "Executive",
    responsibility: "Arah bisnis, keputusan strategis, teknologi, sistem, dan evaluasi performa.",
    authority: "Keputusan tertinggi strategi perusahaan, roadmap teknologi, dan prioritas investasi.",
    kpi: ["Operasional stabil", "Sistem kontrol berjalan", "Roadmap 90 hari tercapai"],
    sortOrder: 10,
  },
  {
    roleTitle: "COO / CRO",
    personName: "Acong",
    reportsTo: "CEO / CTO / CIO",
    division: "Operations",
    responsibility: "Operasional harian, risiko lapangan, SOP, dan disiplin eksekusi outlet.",
    authority: "Approval operasional harian, incident response, dan standar shift.",
    kpi: ["Kepatuhan SOP", "Order tepat waktu", "Komplain minim"],
    sortOrder: 20,
  },
  {
    roleTitle: "CFO",
    personName: "Chandra Agustian",
    reportsTo: "CEO / CTO / CIO",
    division: "Finance",
    responsibility: "Keuangan, kas, audit, pengeluaran, settlement, dan efisiensi biaya.",
    authority: "Approval pengeluaran, investigasi selisih kas, dan kontrol refund/void.",
    kpi: ["Kas cocok", "Selisih kas rendah", "Laporan closing disiplin"],
    sortOrder: 30,
  },
  {
    roleTitle: "CMO",
    personName: "Chandra Ariansyah",
    reportsTo: "CEO / CTO / CIO",
    division: "Marketing",
    responsibility: "Brand, hospitality, promosi, campaign, dan akuisisi pelanggan.",
    authority: "Approval promosi, konten brand, dan materi customer-facing.",
    kpi: ["Brand authority", "Customer acquisition", "Lead B2B/franchise"],
    sortOrder: 40,
  },
  {
    roleTitle: "Manajer Operasional / Admin Gudang",
    personName: null,
    reportsTo: "COO / CRO",
    division: "Outlet",
    responsibility: "Kontrol harian outlet, admin gudang, approval shift, laporan, stok, dan SOP.",
    authority: "Approval diskon/refund/void operasional sesuai matriks.",
    kpi: ["Stok aman", "Waste rendah", "Daily report lengkap"],
    sortOrder: 50,
  },
  {
    roleTitle: "Kasir",
    personName: null,
    reportsTo: "Manajer Operasional / Admin Gudang",
    division: "Outlet",
    responsibility: "Transaksi, membership, metode pembayaran, struk, dan cash control.",
    authority: "Input transaksi standar tanpa ubah harga manual.",
    kpi: ["Membership rate", "Kecepatan transaksi", "Kas cocok"],
    sortOrder: 60,
  },
  {
    roleTitle: "Barista",
    personName: null,
    reportsTo: "Manajer Operasional / Admin Gudang",
    division: "Production",
    responsibility: "Minuman sesuai resep, kualitas, timer KDS, dan station cleanliness.",
    authority: "Tandai order selesai dan lapor stock out bahan minuman.",
    kpi: ["SLA minuman", "Kualitas konsisten", "Waste rendah"],
    sortOrder: 70,
  },
  {
    roleTitle: "Koki",
    personName: null,
    reportsTo: "Manajer Operasional / Admin Gudang",
    division: "Production",
    responsibility: "Makanan sesuai resep, antrean kitchen, kebersihan, dan quality check.",
    authority: "Tandai order selesai dan lapor stock out bahan makanan.",
    kpi: ["SLA makanan", "Komplain rendah", "Higiene terjaga"],
    sortOrder: 80,
  },
  {
    roleTitle: "Asisten Koki",
    personName: null,
    reportsTo: "Koki",
    division: "Production",
    responsibility: "Prep bahan, bantu produksi, kebersihan kitchen, dan stock support.",
    authority: "Menyiapkan bahan sesuai arahan Koki.",
    kpi: ["Prep siap", "Area bersih", "Bahan tercatat"],
    sortOrder: 90,
  },
  {
    roleTitle: "Waiter 1",
    personName: null,
    reportsTo: "Manajer Operasional / Admin Gudang",
    division: "Service",
    responsibility: "Antar pesanan, meja, customer comfort, dan komplain awal.",
    authority: "Handoff order dan escalation ke supervisor/manager.",
    kpi: ["Salah antar minim", "Komplain cepat naik", "Service ramah"],
    sortOrder: 100,
  },
  {
    roleTitle: "Waiter 2",
    personName: null,
    reportsTo: "Manajer Operasional / Admin Gudang",
    division: "Service",
    responsibility: "Antar pesanan, meja, customer comfort, dan backup floor.",
    authority: "Handoff order dan escalation ke supervisor/manager.",
    kpi: ["Salah antar minim", "Table turnaround", "Service ramah"],
    sortOrder: 110,
  },
  {
    roleTitle: "Satpam / Kebersihan",
    personName: null,
    reportsTo: "Manajer Operasional / Admin Gudang",
    division: "Support",
    responsibility: "Keamanan area, kebersihan, checklist lingkungan, dan dukungan opening/closing.",
    authority: "Melaporkan risiko keamanan dan kebersihan ke manager.",
    kpi: ["Area aman", "Area bersih", "Checklist lengkap"],
    sortOrder: 120,
  },
];

const seedCourses = [
  {
    slug: "executive-command-training",
    title: "Executive Command Training",
    category: "Management",
    targetRoles: ["Owner / CEO", "Admin", "Manager Operasional", "Finance / CFO"],
    summary:
      "Materi direksi untuk alur komando, approval, KPI owner, roadmap 90 hari, dan kontrol bisnis.",
    sortOrder: 10,
    lessons: [
      {
        title: "Alur Komando Direksi",
        summary: "CEO memutuskan strategi, COO mengunci operasi, CFO menjaga uang, CMO menjaga brand.",
        checklist: ["Pahami owner setiap keputusan", "Gunakan approval flow", "Catat keputusan besar"],
        documentSlug: "master-business-package-garage-digital-ecosystem",
      },
      {
        title: "KPI Owner & Dashboard",
        summary: "Fokus daily report: sales, transaksi, cash/QRIS/transfer, stok kritis, waste, komplain.",
        checklist: ["Review daily report", "Cek selisih kas", "Cek stok kritis", "Cek order terlambat"],
        documentSlug: "kerangka-perusahaan-siap-diterapkan",
      },
    ],
  },
  {
    slug: "cashier-sop-training",
    title: "Kasir: POS, Membership, dan Cash Control",
    category: "Outlet",
    targetRoles: ["Kasir", "Supervisor Shift", "Manager Operasional", "Admin"],
    summary: "Training kasir untuk order, pembayaran, member, refund/void, dan closing kas.",
    sortOrder: 20,
    lessons: [
      {
        title: "Transaksi Aman",
        summary: "Input order, cek member, pilih pembayaran, konfirmasi, dan pastikan order masuk kitchen.",
        checklist: ["Cek member", "Konfirmasi item", "Pastikan payment sesuai", "Pastikan struk/kitchen"],
        documentSlug: "master-sop-per-divisi-garage-digital-ecosystem",
      },
      {
        title: "Fraud Prevention",
        summary: "Refund, void, diskon manual, dan edit harga selalu butuh approval.",
        checklist: ["Tidak ubah harga sendiri", "Simpan bukti", "Laporkan transaksi mencurigakan"],
        documentSlug: "master-sop-garage-digital-ecosystem-ringkas",
      },
    ],
  },
  {
    slug: "kitchen-service-training",
    title: "Kitchen, Barista, dan Service Flow",
    category: "Production",
    targetRoles: ["Barista", "Koki", "Kitchen / Barista", "Waiter 1", "Waiter 2", "Supervisor Shift"],
    summary: "Training produksi dan service: antrean KDS, resep, kualitas, handoff, dan komplain.",
    sortOrder: 30,
    lessons: [
      {
        title: "KDS & SLA",
        summary: "Kerjakan order berdasarkan antrean, timer, dan status KDS.",
        checklist: ["Baca tiket", "Ikuti resep", "Tandai selesai", "Lapor bila terlambat"],
        documentSlug: "garage-doc3-master-sop-system",
      },
      {
        title: "Service dan Komplain",
        summary: "Antar item sesuai meja, cek kesesuaian order, dan eskalasi komplain cepat.",
        checklist: ["Cek nomor meja", "Pastikan item benar", "Sapa pelanggan", "Eskalasi komplain"],
        documentSlug: "master-sop-per-divisi-garage-digital-ecosystem",
      },
    ],
  },
  {
    slug: "inventory-control-training",
    title: "Gudang: Stock, Opname, dan Waste Control",
    category: "Inventory",
    targetRoles: ["Gudang", "Manager Operasional", "Supervisor Shift", "Admin"],
    summary: "Training gudang untuk barang masuk/keluar, stock out, opname, waste, dan laporan stok.",
    sortOrder: 40,
    lessons: [
      {
        title: "Stock In/Out",
        summary: "Semua barang masuk dan keluar harus tercatat, termasuk barang rusak/expired.",
        checklist: ["Cek jumlah", "Cek kondisi", "Update stok", "Tandai stok kritis"],
        documentSlug: "master-sop-per-divisi-garage-digital-ecosystem",
      },
      {
        title: "Opname dan Reorder",
        summary: "Cocokkan fisik dengan sistem, laporkan selisih, dan aktifkan reorder alert.",
        checklist: ["Opname rutin", "Lapor selisih", "Catat waste", "Follow up reorder"],
        documentSlug: "garage-doc3-master-sop-system",
      },
    ],
  },
];

export function canManageCompanyControl(role: Role) {
  return managementRoles.has(role);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function storageRelativePath(...segments: string[]) {
  return path.join("storage", "company-documents", ...segments);
}

function resolveStoragePath(storagePath: string) {
  const absolute = path.resolve(/* turbopackIgnore: true */ process.cwd(), storagePath);
  const root = path.resolve(companyStorageRoot);
  if (!absolute.startsWith(root)) {
    throw new Error("Invalid company document storage path.");
  }
  return absolute;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function mimeFromName(fileName: string, fallback = "application/octet-stream") {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === ".md") return "text/markdown";
  if (extension === ".txt") return "text/plain";
  if (extension === ".html") return "text/html";
  return fallback;
}

function isAcceptedCompanyFile(fileName: string, mimeType: string) {
  return documentUploadExtensions.has(path.extname(fileName).toLowerCase()) ||
    documentUploadMimeTypes.has(mimeType.toLowerCase());
}

function versionDownloadUrl(documentId: string, versionId: string) {
  return `/api/company/documents/${documentId}/versions/${versionId}/download`;
}

function serializeDocument(
  row: typeof companyDocuments.$inferSelect,
  latestVersion?: typeof companyDocumentVersions.$inferSelect,
): CompanyDocumentDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    summary: row.summary,
    ownerRole: row.ownerRole,
    confidentiality: row.confidentiality,
    status: row.status,
    currentVersion: row.currentVersion,
    allowedRoles: row.allowedRoles,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
    latestVersion: latestVersion ? serializeVersion(latestVersion) : null,
  };
}

function serializeVersion(row: typeof companyDocumentVersions.$inferSelect): CompanyDocumentVersionDto {
  return {
    id: row.id,
    documentId: row.documentId,
    version: row.version,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    downloadUrl: versionDownloadUrl(row.documentId, row.id),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function documentVisibleToRole(document: CompanyDocumentDto, role: Role) {
  return canManageCompanyControl(role) || document.allowedRoles.length === 0 || document.allowedRoles.includes(role);
}

function courseVisibleToRole(course: TrainingCourseDto, role: Role) {
  return canManageCompanyControl(role) || course.targetRoles.length === 0 || course.targetRoles.includes(role);
}

let companySeedPromise: Promise<void> | null = null;

export async function ensureCompanyControlSeed() {
  if (!companySeedPromise) {
    companySeedPromise = runCompanyControlSeed().catch((error) => {
      companySeedPromise = null;
      throw error;
    });
  }

  return companySeedPromise;
}

async function runCompanyControlSeed() {
  const db = getDb();
  await mkdir(path.join(companyStorageRoot, "seed"), { recursive: true });

  for (const role of seedOrgRoles) {
    await db
      .insert(companyOrgRoles)
      .values(role)
      .onConflictDoUpdate({
        target: companyOrgRoles.roleTitle,
        set: {
          personName: role.personName,
          reportsTo: role.reportsTo,
          division: role.division,
          responsibility: role.responsibility,
          authority: role.authority,
          kpi: role.kpi,
          sortOrder: role.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const document of seedDocuments) {
    const [row] = await db
      .insert(companyDocuments)
      .values({
        slug: document.slug,
        title: document.title,
        category: document.category,
        summary: document.summary,
        ownerRole: document.ownerRole,
        confidentiality: document.confidentiality,
        allowedRoles: document.allowedRoles,
        source: "seed",
      })
      .onConflictDoUpdate({
        target: companyDocuments.slug,
        set: {
          title: document.title,
          category: document.category,
          summary: document.summary,
          ownerRole: document.ownerRole,
          confidentiality: document.confidentiality,
          allowedRoles: document.allowedRoles,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    const [existingVersion] = await db
      .select()
      .from(companyDocumentVersions)
      .where(and(eq(companyDocumentVersions.documentId, row.id), eq(companyDocumentVersions.version, 1)))
      .limit(1);

    if (existingVersion || !(await exists(document.sourcePath))) {
      continue;
    }

    const extension = path.extname(document.sourcePath).toLowerCase() || ".docx";
    const storagePath = storageRelativePath("seed", `${document.slug}${extension}`);
    const targetPath = resolveStoragePath(storagePath);
    await copyFile(document.sourcePath, targetPath);
    const fileStat = await stat(targetPath);

    await db.insert(companyDocumentVersions).values({
      documentId: row.id,
      version: 1,
      originalFileName: path.basename(document.sourcePath),
      mimeType: mimeFromName(document.sourcePath),
      sizeBytes: fileStat.size,
      storagePath,
      notes: "Imported from initial GARAGE company document bundle.",
    }).onConflictDoNothing({
      target: [companyDocumentVersions.documentId, companyDocumentVersions.version],
    });
  }

  for (const course of seedCourses) {
    const [row] = await db
      .insert(trainingCourses)
      .values({
        slug: course.slug,
        title: course.title,
        category: course.category,
        targetRoles: course.targetRoles,
        summary: course.summary,
        sortOrder: course.sortOrder,
      })
      .onConflictDoUpdate({
        target: trainingCourses.slug,
        set: {
          title: course.title,
          category: course.category,
          targetRoles: course.targetRoles,
          summary: course.summary,
          sortOrder: course.sortOrder,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    const [firstLesson] = await db
      .select({ id: trainingLessons.id })
      .from(trainingLessons)
      .where(eq(trainingLessons.courseId, row.id))
      .limit(1);

    if (firstLesson) continue;

    await db.insert(trainingLessons).values(
      course.lessons.map((lesson, index) => ({
        courseId: row.id,
        title: lesson.title,
        summary: lesson.summary,
        checklist: lesson.checklist,
        documentSlug: lesson.documentSlug,
        sortOrder: (index + 1) * 10,
      })),
    );
  }
}

export async function getCompanyDocuments(role: Role) {
  await ensureCompanyControlSeed();
  const db = getDb();
  const rows = await db
    .select()
    .from(companyDocuments)
    .orderBy(asc(companyDocuments.category), asc(companyDocuments.title));
  const versions = await db
    .select()
    .from(companyDocumentVersions)
    .orderBy(desc(companyDocumentVersions.version), desc(companyDocumentVersions.createdAt));

  const latestByDocument = new Map<string, typeof companyDocumentVersions.$inferSelect>();
  for (const version of versions) {
    if (!latestByDocument.has(version.documentId)) {
      latestByDocument.set(version.documentId, version);
    }
  }

  return rows
    .map((row) => serializeDocument(row, latestByDocument.get(row.id)))
    .filter((document) => documentVisibleToRole(document, role));
}

export async function getCompanyDocumentVersions(documentId: string, role: Role) {
  await ensureCompanyControlSeed();
  const [document] = await getDb()
    .select()
    .from(companyDocuments)
    .where(eq(companyDocuments.id, documentId))
    .limit(1);

  if (!document) return null;
  const documentDto = serializeDocument(document);
  if (!documentVisibleToRole(documentDto, role)) return null;

  const rows = await getDb()
    .select()
    .from(companyDocumentVersions)
    .where(eq(companyDocumentVersions.documentId, documentId))
    .orderBy(desc(companyDocumentVersions.version));

  return rows.map(serializeVersion);
}

export async function getCompanyDocumentVersionForDownload(
  documentId: string,
  versionId: string,
  role: Role,
) {
  await ensureCompanyControlSeed();
  const [row] = await getDb()
    .select({
      document: companyDocuments,
      version: companyDocumentVersions,
    })
    .from(companyDocumentVersions)
    .innerJoin(companyDocuments, eq(companyDocumentVersions.documentId, companyDocuments.id))
    .where(and(eq(companyDocumentVersions.id, versionId), eq(companyDocuments.id, documentId)))
    .limit(1);

  if (!row) return null;
  if (!documentVisibleToRole(serializeDocument(row.document), role)) return null;

  return {
    path: resolveStoragePath(row.version.storagePath),
    fileName: row.version.originalFileName,
    mimeType: row.version.mimeType,
    sizeBytes: row.version.sizeBytes,
  };
}

export async function createCompanyDocument(
  input: z.infer<typeof createCompanyDocumentSchema>,
  garage: GarageSession,
) {
  const parsed = createCompanyDocumentSchema.parse(input);
  const baseSlug = slugify(parsed.title);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;
  const [row] = await getDb()
    .insert(companyDocuments)
    .values({
      slug,
      title: parsed.title,
      category: parsed.category,
      summary: parsed.summary,
      ownerRole: parsed.ownerRole,
      confidentiality: parsed.confidentiality,
      allowedRoles: parsed.allowedRoles.length ? parsed.allowedRoles : allInternalRoles,
      createdBy: garage.user.id,
      source: "upload",
    })
    .returning();

  await createAuditLog({
    actor: garage.user.name ?? garage.user.email,
    action: "Company document created",
    object: row.title,
    device: garage.profile.deviceLabel,
    status: "created",
    metadata: { documentId: row.id, category: row.category },
  }).catch(() => undefined);

  return serializeDocument(row);
}

export async function saveCompanyDocumentVersion(input: {
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  data: Buffer;
  notes?: string | null;
  garage: GarageSession;
}) {
  if (input.sizeBytes <= 0) {
    throw new Error("File dokumen kosong.");
  }
  if (input.sizeBytes > maxDocumentBytes) {
    throw new Error("Ukuran dokumen maksimal 25 MB.");
  }
  if (!isAcceptedCompanyFile(input.fileName, input.mimeType)) {
    throw new Error("Format belum didukung. Gunakan PDF, DOCX, MD, TXT, atau HTML.");
  }

  const db = getDb();
  const [document] = await db
    .select()
    .from(companyDocuments)
    .where(eq(companyDocuments.id, input.documentId))
    .limit(1);
  if (!document) {
    throw new Error("Dokumen tidak ditemukan.");
  }

  const [{ nextVersion }] = await db
    .select({
      nextVersion: sql<number>`coalesce(max(${companyDocumentVersions.version}), 0)::int + 1`,
    })
    .from(companyDocumentVersions)
    .where(eq(companyDocumentVersions.documentId, input.documentId));

  const extension = path.extname(input.fileName).toLowerCase() || ".bin";
  const dir = path.join(companyStorageRoot, input.documentId);
  await mkdir(dir, { recursive: true });
  const storagePath = storageRelativePath(input.documentId, `v${nextVersion}${extension}`);
  const targetPath = resolveStoragePath(storagePath);
  await writeFile(targetPath, input.data);

  const [row] = await db
    .insert(companyDocumentVersions)
    .values({
      documentId: input.documentId,
      version: nextVersion,
      originalFileName: input.fileName,
      mimeType: input.mimeType || mimeFromName(input.fileName),
      sizeBytes: input.sizeBytes,
      storagePath,
      uploadedBy: input.garage.user.id,
      notes: input.notes ?? null,
    })
    .returning();

  await db
    .update(companyDocuments)
    .set({ currentVersion: nextVersion, updatedAt: sql`now()` })
    .where(eq(companyDocuments.id, input.documentId));

  await createAuditLog({
    actor: input.garage.user.name ?? input.garage.user.email,
    action: "Company document version uploaded",
    object: `${document.title} v${nextVersion}`,
    device: input.garage.profile.deviceLabel,
    status: "uploaded",
    metadata: {
      documentId: input.documentId,
      versionId: row.id,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
    },
  }).catch(() => undefined);

  return serializeVersion(row);
}

export async function getTrainingCourses(garage: GarageSession) {
  await ensureCompanyControlSeed();
  const db = getDb();
  const [courses, lessons, progress] = await Promise.all([
    db.select().from(trainingCourses).orderBy(asc(trainingCourses.sortOrder), asc(trainingCourses.title)),
    db.select().from(trainingLessons).orderBy(asc(trainingLessons.sortOrder)),
    db.select().from(trainingProgress).where(eq(trainingProgress.userId, garage.user.id)),
  ]);

  const lessonsByCourse = new Map<string, typeof trainingLessons.$inferSelect[]>();
  for (const lesson of lessons) {
    lessonsByCourse.set(lesson.courseId, [...(lessonsByCourse.get(lesson.courseId) ?? []), lesson]);
  }

  const progressByCourse = new Map(progress.map((row) => [row.courseId, row]));

  return courses
    .map((course): TrainingCourseDto => {
      const courseProgress = progressByCourse.get(course.id);
      return {
        id: course.id,
        slug: course.slug,
        title: course.title,
        category: course.category,
        targetRoles: course.targetRoles,
        summary: course.summary,
        sortOrder: course.sortOrder,
        status: course.status,
        progressStatus: courseProgress?.status ?? null,
        completedAt: courseProgress?.completedAt?.toISOString() ?? null,
        lessons: (lessonsByCourse.get(course.id) ?? []).map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          summary: lesson.summary,
          checklist: lesson.checklist,
          documentSlug: lesson.documentSlug,
          sortOrder: lesson.sortOrder,
        })),
      };
    })
    .filter((course) => courseVisibleToRole(course, garage.profile.role));
}

export async function createTrainingCourse(
  input: z.infer<typeof createTrainingCourseSchema>,
  garage: GarageSession,
) {
  const parsed = createTrainingCourseSchema.parse(input);
  const [row] = await getDb()
    .insert(trainingCourses)
    .values({
      slug: `${slugify(parsed.title)}-${Date.now().toString(36)}`,
      title: parsed.title,
      category: parsed.category,
      targetRoles: parsed.targetRoles.length ? parsed.targetRoles : allInternalRoles,
      summary: parsed.summary,
      sortOrder: 1000,
    })
    .returning();

  await createAuditLog({
    actor: garage.user.name ?? garage.user.email,
    action: "Training course created",
    object: row.title,
    device: garage.profile.deviceLabel,
    status: "created",
    metadata: { courseId: row.id, category: row.category },
  }).catch(() => undefined);

  return row;
}

export async function completeTrainingCourse(courseId: string, garage: GarageSession) {
  await ensureCompanyControlSeed();
  const visibleCourses = await getTrainingCourses(garage);
  if (!visibleCourses.some((course) => course.id === courseId)) {
    throw new Error("Training tidak ditemukan atau tidak tersedia untuk role ini.");
  }

  const [row] = await getDb()
    .insert(trainingProgress)
    .values({
      userId: garage.user.id,
      courseId,
      status: "completed",
      completedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [trainingProgress.userId, trainingProgress.courseId],
      set: {
        status: "completed",
        completedAt: sql`now()`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  await createAuditLog({
    actor: garage.user.name ?? garage.user.email,
    action: "Training course completed",
    object: courseId,
    device: garage.profile.deviceLabel,
    status: "completed",
    metadata: { courseId },
  }).catch(() => undefined);

  return row;
}

export async function getCompanyOrgRoles() {
  await ensureCompanyControlSeed();
  const rows = await getDb().select().from(companyOrgRoles).orderBy(asc(companyOrgRoles.sortOrder));
  return rows.map((row): CompanyOrgRoleDto => ({
    id: row.id,
    roleTitle: row.roleTitle,
    personName: row.personName,
    reportsTo: row.reportsTo,
    division: row.division,
    responsibility: row.responsibility,
    authority: row.authority,
    kpi: row.kpi,
    sortOrder: row.sortOrder,
  }));
}

export async function getCompanyControlData(garage: GarageSession): Promise<CompanyControlDto> {
  const [documents, training, orgRoles, dashboard, inventoryWarnings, finance, approvals, auditLogs] = await Promise.all([
    getCompanyDocuments(garage.profile.role),
    getTrainingCourses(garage),
    getCompanyOrgRoles(),
    getDashboardData(),
    getInventoryData({ status: "low" }),
    getFinanceSummary(),
    getApprovalData({ status: "pending" }),
    getAuditData(),
  ]);

  // Fetch staff performance data
  const db = getDb();
  
  // Hitung SOP Compliance hari ini
  const today = new Date().toISOString().split("T")[0];
  const allStaffCountResult = await db.execute(sql`SELECT count(*) FROM staff_profiles`);
  const allStaffCount = Number(allStaffCountResult.rows[0].count) || 1;
  const sopLogsToday = await db.execute(sql`SELECT count(distinct staff_id) FROM sop_logs WHERE date = ${today} AND status = 'done'`);
  const sopCompliance = Math.round((Number(sopLogsToday.rows[0].count) / allStaffCount) * 100);

  // Hitung Training Compliance 
  const totalCoursesResult = await db.execute(sql`SELECT count(*) FROM training_courses WHERE status = 'active'`);
  const totalCourses = Number(totalCoursesResult.rows[0].count) || 1;
  const totalExpectedCompletions = totalCourses * allStaffCount;
  const completedProgressResult = await db.execute(sql`SELECT count(*) FROM training_progress WHERE status = 'completed'`);
  const completedProgress = Number(completedProgressResult.rows[0].count) || 0;
  const trainingCompliance = Math.round((completedProgress / totalExpectedCompletions) * 100);

  // Hitung Attendance Compliance (Clock In hari ini)
  const presentStaffTodayResult = await db.execute(sql`SELECT count(distinct staff_id) FROM employee_attendances WHERE timestamp >= ${today + "T00:00:00Z"} AND action = 'in'`);
  const presentStaffToday = Number(presentStaffTodayResult.rows[0].count) || 0;
  const attendanceCompliance = Math.round((presentStaffToday / allStaffCount) * 100);

  const completedTraining = training.filter((course) => course.progressStatus === "completed").length;
  const latestDocuments = documents.filter((document) => document.latestVersion).length;
  const totalCaptured = finance.paymentBreakdown.reduce((sum, item) => sum + item.amount, 0);

  return {
    me: {
      name: garage.user.name ?? garage.user.email,
      email: garage.user.email,
      role: garage.profile.role,
      canManage: canManageCompanyControl(garage.profile.role),
    },
    live: {
      generatedAt: new Date().toISOString(),
      dashboard,
      inventoryWarnings: inventoryWarnings.slice(0, 8),
      finance: {
        cashSession: finance.cashSession,
        paymentBreakdown: finance.paymentBreakdown,
        totalCaptured,
      },
      approvals: approvals.slice(0, 8),
      auditLogs: auditLogs.rows.slice(0, 8),
      staffPerformance: {
        trainingCompliance: Math.min(trainingCompliance, 100),
        sopCompliance: Math.min(sopCompliance, 100),
        attendanceCompliance: Math.min(attendanceCompliance, 100)
      }
    },
    metrics: [
      { label: "Dokumen aktif", value: String(documents.length), detail: `${latestDocuments} file tersedia` },
      { label: "Training role", value: String(training.length), detail: `${completedTraining} sudah selesai` },
      { label: "Role organisasi", value: String(orgRoles.length), detail: "Direksi sampai outlet" },
      { label: "Approval flow", value: "5", detail: "CEO, COO, CFO, CMO, Manager" },
    ],
    documents,
    training,
    orgRoles,
    management: {
      roadmap: [
        { phase: "Hari 1-30", focus: "Transaksi hidup", output: "PT aktif, POS, payment, menu, SOP dasar" },
        { phase: "Hari 31-60", focus: "Kontrol operasional", output: "KDS, inventory dasar, cash control, handover" },
        { phase: "Hari 61-90", focus: "Growth engine", output: "Membership, delivery dashboard, report mingguan" },
      ],
      approvalFlow: [
        { area: "Strategi perusahaan", owner: "CEO / CTO / CIO - Surya" },
        { area: "Operasional harian", owner: "COO / CRO - Acong" },
        { area: "Keuangan dan pengeluaran", owner: "CFO - Chandra Agustian" },
        { area: "Promosi dan branding", owner: "CMO - Chandra Ariansyah" },
        { area: "Operasional outlet", owner: "Manajer Operasional / Admin Gudang" },
      ],
      teamsChannels: [
        "Announcement",
        "Daily Operation",
        "Cash & Finance",
        "Stock & Inventory",
        "Kitchen Control",
        "Delivery & Online",
        "SOP & Training",
        "Incident & Fraud Report",
        "Daily Report",
        "KPI & Target",
      ],
      dailyReport: [
        "Total sales",
        "Jumlah transaksi",
        "Cash / QRIS / Transfer",
        "Selisih kas",
        "Stok kritis",
        "Waste",
        "Komplain pelanggan",
        "Kendala operasional",
      ],
    },
  };
}

export async function documentIdsVisibleToRole(documentIds: string[], role: Role) {
  if (!documentIds.length) return new Set<string>();
  const docs = await getCompanyDocuments(role);
  return new Set(docs.filter((document) => documentIds.includes(document.id)).map((document) => document.id));
}

export function acceptedCompanyDocumentSummary() {
  return {
    maxBytes: maxDocumentBytes,
    extensions: [...documentUploadExtensions],
    mimeTypes: [...documentUploadMimeTypes],
  };
}
