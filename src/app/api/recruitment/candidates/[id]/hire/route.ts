import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { auditLogs, candidates } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import {
  AbsenEmployeeError,
  absenCodePrefix,
  createAbsenEmployee,
  nextFreeCode,
} from "@/lib/garage-absen-employees";
import { requireGarageSession } from "@/lib/server-auth";
import { copyCandidateToStaffPersonal } from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hireSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{2,12}$/, "Kode 2–12 karakter: huruf, angka, atau tanda minus.")
    .optional()
    .or(z.literal("")),
  position: z.string().trim().max(40).optional().nullable(),
  monthlySalary: z.number().int().min(1_000, "Gaji bulanan minimal Rp 1.000.").max(100_000_000),
  shiftStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam masuk format HH:MM.")
    .optional()
    .nullable(),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal mulai kerja format YYYY-MM-DD."),
});

/**
 * Pelamar "Diterima" → karyawan (Payroll V2: kode absen + PIN + gaji). Data
 * nama & jabatan diambil dari lamaran; tidak perlu ketik ulang. Owner saja
 * (menyangkut gaji). PIN dikembalikan SEKALI.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_CANDIDATE_ID", "Candidate ID tidak valid.");
  const body = await readJson(request, hireSchema);
  if (body.error) return body.error;

  const db = getDb();
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  if (!candidate) return fail(404, "CANDIDATE_NOT_FOUND", "Kandidat tidak ditemukan.");
  if (candidate.status !== "Diterima") {
    return fail(409, "CANDIDATE_NOT_ACCEPTED", "Ubah status pelamar ke \"Diterima\" dulu sebelum dijadikan karyawan.");
  }
  if (candidate.hiredAt) {
    return fail(409, "CANDIDATE_ALREADY_HIRED", `Pelamar ini sudah jadi karyawan (kode ${candidate.hiredEmployeeCode}).`);
  }

  const position = body.data.position?.trim() || candidate.appliedPosition;
  const code = body.data.code?.trim() || (await nextFreeCode(absenCodePrefix(position, "Staf")));
  try {
    const created = await createAbsenEmployee(
      {
        code,
        name: candidate.fullName,
        position,
        monthlySalary: body.data.monthlySalary,
        shiftStart: body.data.shiftStart ?? null,
        joinDate: body.data.joinDate,
      },
      { name: session.data.user.name || session.data.user.email, outletId: session.data.profile.outlet.id },
    );
    // Tandai sekali (anti klik ganda): hanya bila belum ada hiredAt.
    await db
      .update(candidates)
      .set({ hiredAt: new Date(), hiredEmployeeCode: created.code, finalDecision: `Karyawan ${created.code}`, updatedAt: new Date() })
      .where(and(eq(candidates.id, id), isNull(candidates.hiredAt)));
    // WA, domisili, tgl lahir, foto, KTP & CV pelamar ikut ke profil karyawan.
    try {
      await copyCandidateToStaffPersonal(id, created.code);
    } catch (error) {
      console.error("Copy candidate data to staff profile failed", error);
    }
    await db.insert(auditLogs).values({
      time: new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date()),
      actor: `${session.data.user.name} / ${session.data.profile.role}`,
      action: "Rekrutmen: pelamar dijadikan karyawan",
      object: `${candidate.fullName} → ${created.code}`,
      device: session.data.profile.deviceLabel ?? "OS",
      status: "recorded",
      metadata: { candidateId: id, code: created.code, position, joinDate: body.data.joinDate },
    });
    return ok(
      { code: created.code, pin: created.pin, name: candidate.fullName, position },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AbsenEmployeeError) return fail(409, error.code, error.message);
    console.error("Hire candidate failed", error);
    return fail(500, "CANDIDATE_HIRE_FAILED", "Gagal membuat karyawan. Coba lagi.");
  }
}
