import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { ensureDatabaseReady } from "@/db";
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
  workType?: string | null;
  availableStartDate?: string | null;
  willingShift?: boolean;
  willingRelocate?: boolean;
  education?: string | null;
  lastExperience?: string | null;
  experienceDuration?: string | null;
  previousCompany?: string | null;
  resignReason?: string | null;
  mainSkill?: string | null;
  skillLevel?: string | null;
  strength?: string | null;
  weakness?: string | null;
  motivation?: string | null;
  customerExperience?: string | null;
  expectedSalary?: number | null;
  interviewAvailability?: string | null;
  cvUrl?: string | null;
  photoUrl?: string | null;
  ktpUrl?: string | null;
  certificateUrl?: string | null;
  portfolioUrl?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  linkedinUrl?: string | null;
  socialMediaUrl?: string | null;
  referralSource?: string | null;
};

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};

// Buat kandidat baru dari form publik. Status awal selalu "Baru".
export async function createCandidate(input: CandidateInput) {
  const db = await ensureDatabaseReady();
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
      workType: clean(input.workType),
      availableStartDate: clean(input.availableStartDate),
      willingShift: Boolean(input.willingShift),
      willingRelocate: Boolean(input.willingRelocate),
      education: clean(input.education),
      lastExperience: clean(input.lastExperience),
      experienceDuration: clean(input.experienceDuration),
      previousCompany: clean(input.previousCompany),
      resignReason: clean(input.resignReason),
      mainSkill: clean(input.mainSkill),
      skillLevel: clean(input.skillLevel),
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
      ktpUrl: clean(input.ktpUrl),
      certificateUrl: clean(input.certificateUrl),
      portfolioUrl: clean(input.portfolioUrl),
      instagramUrl: clean(input.instagramUrl),
      tiktokUrl: clean(input.tiktokUrl),
      linkedinUrl: clean(input.linkedinUrl),
      socialMediaUrl: clean(input.socialMediaUrl),
      referralSource: clean(input.referralSource),
      status: "Baru",
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
  score?: number | null;
  notes?: string | null;
  followUpDate?: string | null;
  assignedTo?: string | null;
  finalDecision?: string | null;
  interviewDate?: string | null;
  interviewLink?: string | null;
};

// Daftar kandidat untuk admin/HR/CEO. Urut terbaru. Support pagination.
export async function listCandidates(params: CandidateListParams = {}) {
  const db = await ensureDatabaseReady();
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
  const db = await ensureDatabaseReady();
  const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  if (!row) return null;
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateCandidate(id: string, input: CandidateUpdateInput) {
  const db = await ensureDatabaseReady();
  const patch: Partial<typeof candidates.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.status !== undefined) patch.status = input.status;
  if (input.score !== undefined) {
    patch.score = input.score == null ? null : Math.min(Math.max(Math.round(input.score), 1), 10);
  }
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
    if (input.status === "Interview" && input.interviewDate) {
      const dateStr = new Date(input.interviewDate).toLocaleString("id-ID");
      messageBody = `Halo ${row.fullName}, selamat Anda lolos ke tahap Interview untuk posisi ${row.appliedPosition} di GARAGE. Jadwal interview Anda: ${dateStr}. ${input.interviewLink ? "Link: " + input.interviewLink : ""}`;
    } else if (input.status === "Diterima") {
      messageBody = `Halo ${row.fullName}, SELAMAT! Anda dinyatakan LULUS dan diterima untuk posisi ${row.appliedPosition} di GARAGE. Tim HR kami akan segera menghubungi Anda untuk proses pemberkasan dan onboarding. Terima kasih!`;
    } else if (input.status === "Talent Pool") {
      messageBody = `Halo ${row.fullName}, terima kasih telah melamar di GARAGE untuk posisi ${row.appliedPosition}. Profil Anda sangat menarik, namun posisi ini sudah terpenuhi saat ini. Kami menyimpan data Anda di Talent Pool dan akan menghubungi Anda jika ada lowongan yang sesuai!`;
    } else if (input.status === "Ditolak") {
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
  const db = await ensureDatabaseReady();
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

// Analytics mendalam: conversion funnel, time-to-hire, per-posisi, sumber pelamar.
export async function getRecruitmentAnalytics() {
  const db = await ensureDatabaseReady();

  // 1. Per-posisi breakdown
  const byPosition = await db
    .select({
      position: candidates.appliedPosition,
      total: sql<number>`count(*)::int`,
      accepted: sql<number>`count(*) filter (where ${candidates.status} = 'Diterima')::int`,
      rejected: sql<number>`count(*) filter (where ${candidates.status} = 'Ditolak')::int`,
      talentPool: sql<number>`count(*) filter (where ${candidates.status} = 'Talent Pool')::int`,
    })
    .from(candidates)
    .groupBy(candidates.appliedPosition)
    .orderBy(sql`count(*) desc`);

  // 2. Time-to-hire (rata-rata hari dari createdAt ke updatedAt bagi yang Diterima)
  const [tthRow] = await db
    .select({
      avgDays: sql<number>`coalesce(avg(extract(epoch from (${candidates.updatedAt} - ${candidates.createdAt})) / 86400)::int, 0)`,
      minDays: sql<number>`coalesce(min(extract(epoch from (${candidates.updatedAt} - ${candidates.createdAt})) / 86400)::int, 0)`,
      maxDays: sql<number>`coalesce(max(extract(epoch from (${candidates.updatedAt} - ${candidates.createdAt})) / 86400)::int, 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(eq(candidates.status, "Diterima"));

  // 3. Pelamar per minggu (4 minggu terakhir)
  const weeklyTrend = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${candidates.createdAt}), 'YYYY-MM-DD')`,
      total: sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(sql`${candidates.createdAt} >= now() - interval '28 days'`)
    .groupBy(sql`date_trunc('week', ${candidates.createdAt})`)
    .orderBy(sql`date_trunc('week', ${candidates.createdAt})`);

  // 4. Sumber pelamar (referral source)
  const bySource = await db
    .select({
      source: sql<string>`coalesce(${candidates.referralSource}, 'Belum diisi')`,
      total: sql<number>`count(*)::int`,
    })
    .from(candidates)
    .groupBy(sql`coalesce(${candidates.referralSource}, 'Belum diisi')`)
    .orderBy(sql`count(*) desc`);

  return {
    byPosition,
    timeToHire: {
      avgDays: Number(tthRow?.avgDays ?? 0),
      minDays: Number(tthRow?.minDays ?? 0),
      maxDays: Number(tthRow?.maxDays ?? 0),
      totalHired: Number(tthRow?.count ?? 0),
    },
    weeklyTrend,
    bySource,
  };
}

// Cek duplikat lamaran — apakah WA/email sudah pernah apply posisi yang sama dalam 30 hari.
export async function checkDuplicateCandidate(whatsapp: string, email: string, position: string) {
  const db = await ensureDatabaseReady();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [existing] = await db
    .select({ id: candidates.id, status: candidates.status, createdAt: candidates.createdAt })
    .from(candidates)
    .where(
      and(
        or(
          eq(candidates.whatsapp, whatsapp),
          eq(candidates.email, email),
        ),
        eq(candidates.appliedPosition, position),
        sql`${candidates.createdAt} >= ${thirtyDaysAgo.toISOString()}`,
      ),
    )
    .orderBy(desc(candidates.createdAt))
    .limit(1);

  return existing ?? null;
}

