import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  AbsenEmployeeError,
  createAbsenEmployee,
  listAbsenEmployees,
} from "@/lib/garage-absen-employees";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{2,12}$/, "Kode 2–12 karakter: huruf, angka, atau tanda minus."),
  name: z.string().trim().min(2, "Nama minimal 2 huruf.").max(60),
  position: z.string().trim().max(40).optional().nullable(),
  monthlySalary: z.number().int().min(1_000, "Gaji bulanan minimal Rp 1.000.").max(100_000_000),
  shiftStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam masuk format HH:MM.")
    .optional()
    .nullable(),
  excludeFromFee: z.boolean().optional(),
  joinDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal mulai kerja format YYYY-MM-DD.")
    .optional()
    .nullable(),
  monthlyDeduction: z.number().int().min(0).max(10_000_000).optional(),
});

export async function GET() {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  try {
    return ok({
      employees: await listAbsenEmployees(),
      // Gaji, fee, tambah/nonaktifkan karyawan = wewenang Owner.
      canManagePay: session.data!.profile.role === "Owner",
    });
  } catch (err) {
    return fail(500, "EMPLOYEES_FAILED", (err as Error).message);
  }
}

export async function POST(request: Request) {
  // Menambah karyawan (dengan gaji) = wewenang Owner.
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, createSchema);
  if (body.error) return body.error;

  try {
    const created = await createAbsenEmployee(body.data, {
      name: session.data!.user.name || session.data!.user.email,
      outletId: session.data!.profile.outlet.id,
    });
    // Berisi PIN (sekali tampil) — jangan di-cache.
    return ok(created, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof AbsenEmployeeError) return fail(409, err.code, err.message);
    return fail(500, "EMPLOYEE_CREATE_FAILED", (err as Error).message);
  }
}
