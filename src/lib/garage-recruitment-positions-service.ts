import { asc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/db";
import { recruitmentPositions } from "@/db/schema";
import { RECRUITMENT_POSITIONS as SEED_POSITIONS } from "@/lib/garage-recruitment-data";

export type RecruitmentPositionRow = {
  id: string;
  slug: string;
  title: string;
  location: string;
  type: string;
  experience: string;
  description: string;
  isOpen: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PositionInput = {
  slug: string;
  title: string;
  location?: string;
  type?: string;
  experience?: string;
  description?: string;
  isOpen?: boolean;
  sortOrder?: number;
};

// Self-healing seed: pastikan SEMUA posisi default ada (insert yang slug-nya
// belum ada). Aman dijalankan berulang & di DB yang sudah pernah ter-seed —
// posisi baru yang ditambah ke RECRUITMENT_POSITIONS otomatis ikut muncul.
async function ensureSeeded() {
  const db = await ensureDatabaseReady();
  const existingRows = await db
    .select({ slug: recruitmentPositions.slug })
    .from(recruitmentPositions);
  const existingSlugs = new Set(existingRows.map((r) => r.slug));

  const missing = SEED_POSITIONS.map((p, i) => ({ p, i })).filter(
    ({ p }) => !existingSlugs.has(p.slug),
  );
  if (missing.length === 0) return;

  await db
    .insert(recruitmentPositions)
    .values(
      missing.map(({ p, i }) => ({
        slug: p.slug,
        title: p.title,
        location: p.location,
        type: p.type,
        experience: p.experience,
        description: p.description,
        isOpen: true,
        sortOrder: i,
        updatedAt: new Date(),
      })),
    )
    .onConflictDoNothing({ target: recruitmentPositions.slug });
}

function mapRow(row: typeof recruitmentPositions.$inferSelect): RecruitmentPositionRow {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Posisi terbuka — untuk halaman publik /recruitment.
export async function listOpenPositions(): Promise<RecruitmentPositionRow[]> {
  await ensureSeeded();
  const db = await ensureDatabaseReady();
  const rows = await db
    .select()
    .from(recruitmentPositions)
    .where(eq(recruitmentPositions.isOpen, true))
    .orderBy(asc(recruitmentPositions.sortOrder), asc(recruitmentPositions.createdAt));
  return rows.map(mapRow);
}

// Semua posisi — untuk dashboard admin/CEO.
export async function listAllPositions(): Promise<RecruitmentPositionRow[]> {
  await ensureSeeded();
  const db = await ensureDatabaseReady();
  const rows = await db
    .select()
    .from(recruitmentPositions)
    .orderBy(asc(recruitmentPositions.sortOrder), asc(recruitmentPositions.createdAt));
  return rows.map(mapRow);
}

// Buat posisi baru.
export async function createPosition(input: PositionInput): Promise<RecruitmentPositionRow> {
  const db = await ensureDatabaseReady();
  const [row] = await db
    .insert(recruitmentPositions)
    .values({
      slug: input.slug.trim().toLowerCase().replace(/\s+/g, "-"),
      title: input.title.trim(),
      location: input.location?.trim() ?? "Tebing Tinggi",
      type: input.type?.trim() ?? "Full-time",
      experience: input.experience?.trim() ?? "",
      description: input.description?.trim() ?? "",
      isOpen: input.isOpen ?? true,
      sortOrder: input.sortOrder ?? 0,
      updatedAt: new Date(),
    })
    .returning();
  return mapRow(row);
}

// Update posisi (buka/tutup, edit data).
export async function updatePosition(
  id: string,
  input: Partial<PositionInput>,
): Promise<RecruitmentPositionRow | null> {
  const db = await ensureDatabaseReady();
  const patch: Partial<typeof recruitmentPositions.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.slug !== undefined) patch.slug = input.slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (input.location !== undefined) patch.location = input.location.trim();
  if (input.type !== undefined) patch.type = input.type.trim();
  if (input.experience !== undefined) patch.experience = input.experience.trim();
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.isOpen !== undefined) patch.isOpen = input.isOpen;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

  const [row] = await db
    .update(recruitmentPositions)
    .set(patch)
    .where(eq(recruitmentPositions.id, id))
    .returning();
  return row ? mapRow(row) : null;
}

// Hapus posisi.
export async function deletePosition(id: string): Promise<boolean> {
  const db = await ensureDatabaseReady();
  const result = await db
    .delete(recruitmentPositions)
    .where(eq(recruitmentPositions.id, id))
    .returning({ id: recruitmentPositions.id });
  return result.length > 0;
}
