import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { AbsenEmployeeError, updateAbsenEmployee } from "@/lib/garage-absen-employees";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

const updateSchema = z
  .object({
    name: z.string().trim().min(2, "Nama minimal 2 huruf.").max(60).optional(),
    position: z.string().trim().max(40).optional().nullable(),
    monthlySalary: z.number().int().min(1_000, "Gaji bulanan minimal Rp 1.000.").max(100_000_000).optional(),
    shiftStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam masuk format HH:MM.")
      .optional()
      .nullable(),
    excludeFromFee: z.boolean().optional(),
    active: z.boolean().optional(),
    joinDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal mulai kerja format YYYY-MM-DD.")
      .optional()
      .nullable(),
    monthlyDeduction: z.number().int().min(0).max(10_000_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Tidak ada perubahan.");

interface Ctx {
  params: Promise<{ code: string }>;
}

export async function PATCH(request: Request, { params }: Ctx) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const { code } = await params;
  const body = await readJson(request, updateSchema);
  if (body.error) return body.error;

  // Manajer: nama, jabatan, jam masuk. Gaji, fee, aktif/nonaktif, tanggal mulai
  // kerja (THR) & potongan tetap (BPJS) = Owner.
  const payFields = (["monthlySalary", "excludeFromFee", "active", "joinDate", "monthlyDeduction"] as const).filter(
    (k) => body.data[k] !== undefined,
  );
  if (payFields.length > 0 && session.data!.profile.role !== "Owner") {
    return fail(
      403,
      "OWNER_ONLY",
      "Gaji, fee, status aktif, tanggal mulai kerja, dan potongan tetap hanya bisa diubah Owner.",
    );
  }

  try {
    const res = await updateAbsenEmployee(code, body.data, {
      name: session.data!.user.name || session.data!.user.email,
      outletId: session.data!.profile.outlet.id,
    });
    return ok(res);
  } catch (err) {
    if (err instanceof AbsenEmployeeError) return fail(404, err.code, err.message);
    return fail(500, "EMPLOYEE_UPDATE_FAILED", (err as Error).message);
  }
}
