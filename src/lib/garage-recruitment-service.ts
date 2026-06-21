import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { candidates } from "@/db/schema";
import { getSender, resolveProvider } from "@/lib/messaging/senders";

// Re-export konstanta client-safe agar import lama tetap jalan.
export {
  RECRUITMENT_POSITIONS,
  RECRUITMENT_STATUSES,
  type RecruitmentPosition,
} from "@/lib/garage-recruitment-data";

export type CandidateInput = {
  fullName: string;
  whatsapp: string;
  email: string;
  domicile: string;
  birthDate?: string | null;
  gender?: string | null;
  appliedPosition: string;
  preferredLocation?: string | null;
  availableStartDate?: string | null;
  willingShift?: boolean;
  willingRelocate?: boolean;
  education?: string | null;
  lastExperience?: string | null;
  experienceDuration?: string | null;
  previousCompany?: string | null;
  resignReason?: string | null;
  mainSkill?: string | null;
  strength?: string | null;
  weakness?: string | null;
  motivation?: string | null;
  customerExperience?: string | null;
  expectedSalary?: number | null;
  interviewAvailability?: string | null;
  cvUrl?: string | null;
  photoUrl?: string | null;
  portfolioUrl?: string | null;
  socialMediaUrl?: string | null;
};

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};

// Buat kandidat baru dari form publik. Status awal selalu "New Applicant".
export async function createCandidate(input: CandidateInput) {
  const db = getDb();
  const [row] = await db
    .insert(candidates)
    .values({
      fullName: input.fullName.trim(),
      whatsapp: input.whatsapp.trim(),
      email: input.email.trim(),
      domicile: input.domicile.trim(),
      birthDate: clean(input.birthDate),
      gender: clean(input.gender),
      appliedPosition: input.appliedPosition.trim(),
      preferredLocation: clean(input.preferredLocation),
      availableStartDate: clean(input.availableStartDate),
      willingShift: Boolean(input.willingShift),
      willingRelocate: Boolean(input.willingRelocate),
      education: clean(input.education),
      lastExperience: clean(input.lastExperience),
      experienceDuration: clean(input.experienceDuration),
      previousCompany: clean(input.previousCompany),
      resignReason: clean(input.resignReason),
      mainSkill: clean(input.mainSkill),
      strength: clean(input.strength),
      weakness: clean(input.weakness),
      motivation: clean(input.motivation),
      customerExperience: clean(input.customerExperience),
      expectedSalary:
        input.expectedSalary != null && Number.isFinite(input.expectedSalary)
          ? Math.max(0, Math.round(input.expectedSalary))
          : null,
      interviewAvailability: clean(input.interviewAvailability),
      cvUrl: clean(input.cvUrl),
      photoUrl: clean(input.photoUrl),
      portfolioUrl: clean(input.portfolioUrl),
      socialMediaUrl: clean(input.socialMediaUrl),
      status: "Pelamar Baru",
      updatedAt: new Date(),
    })
    .returning({ id: candidates.id, fullName: candidates.fullName, appliedPosition: candidates.appliedPosition });
  return row;
}

export type CandidateListParams = {
  status?: string;
  position?: string;
  location?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export type CandidateUpdateInput = {
  status?: string;
  notes?: string | null;
  followUpDate?: string | null;
  assignedTo?: string | null;
  finalDecision?: string | null;
  interviewDate?: string | null;
  interviewLink?: string | null;
};

// Daftar kandidat untuk admin/HR/CEO. Urut terbaru. Support pagination.
export async function listCandidates(params: CandidateListParams = {}) {
  const db = getDb();
  const filters = [];
  if (params.status && params.status !== "all") {
    filters.push(eq(candidates.status, params.status));
  }
  if (params.position && params.position !== "all") {
    filters.push(eq(candidates.appliedPosition, params.position));
  }
  if (params.location && params.location !== "all") {
    filters.push(eq(candidates.preferredLocation, params.location));
  }
  if (params.q) {
    const search = `%${params.q}%`;
    filters.push(
      or(
        ilike(candidates.fullName, search),
        ilike(candidates.whatsapp, search),
        ilike(candidates.email, search),
        ilike(candidates.appliedPosition, search),
      ),
    );
  }

  const whereClause = filters.length ? and(...filters) : undefined;
  const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 100);
  const page = Math.max(params.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(candidates)
      .where(whereClause)
      .orderBy(desc(candidates.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(candidates)
      .where(whereClause),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  return {
    items: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Ambil satu kandidat by ID (untuk panel detail).
export async function getCandidateById(id: string) {
  const db = getDb();
  const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  if (!row) return null;
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateCandidate(id: string, input: CandidateUpdateInput) {
  const db = getDb();
  const patch: Partial<typeof candidates.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = clean(input.notes);
  if (input.followUpDate !== undefined) patch.followUpDate = clean(input.followUpDate);
  if (input.assignedTo !== undefined) patch.assignedTo = clean(input.assignedTo);
  if (input.finalDecision !== undefined) patch.finalDecision = clean(input.finalDecision);
  if (input.interviewDate !== undefined) patch.interviewDate = input.interviewDate ? new Date(input.interviewDate) : null;
  if (input.interviewLink !== undefined) patch.interviewLink = clean(input.interviewLink);

  const [row] = await db
    .update(candidates)
    .set(patch)
    .where(eq(candidates.id, id))
    .returning();

  if (row && input.status) {
    // Auto Notifikasi via WhatsApp
    const provider = resolveProvider();
    const sender = getSender(provider);
    
    let messageBody = "";
    if (input.status === "Interview Scheduled" && input.interviewDate) {
      const dateStr = new Date(input.interviewDate).toLocaleString("id-ID");
      messageBody = `Halo ${row.fullName}, selamat Anda lolos ke tahap Interview untuk posisi ${row.appliedPosition} di GARAGE. Jadwal interview Anda: ${dateStr}. ${input.interviewLink ? "Link: " + input.interviewLink : ""}`;
    } else if (input.status === "Rejected") {
      messageBody = `Halo ${row.fullName}, terima kasih atas minat Anda pada GARAGE. Saat ini kami belum bisa melanjutkan lamaran Anda untuk posisi ${row.appliedPosition}. Tetap semangat!`;
    }

    if (messageBody) {
      // Kirim asinkron, biarkan jalan di background
      sender.send({
        channel: "whatsapp",
        to: row.whatsapp,
        recipientName: row.fullName,
        body: messageBody,
      }).catch(err => console.error("Auto Notif Error:", err));
    }
  }

  return row
    ? {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        interviewDate: row.interviewDate?.toISOString() ?? null,
      }
    : null;
}

// Ringkasan statistik untuk dashboard recruitment.
export async function getRecruitmentStats() {
  const db = getDb();
  const rows = await db
    .select({ status: candidates.status, total: sql<number>`count(*)::int` })
    .from(candidates)
    .groupBy(candidates.status);
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byStatus[r.status] = Number(r.total);
    total += Number(r.total);
  }
  return { total, byStatus };
}
