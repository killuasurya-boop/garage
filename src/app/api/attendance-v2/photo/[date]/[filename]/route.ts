import { promises as fs } from "node:fs";
import path from "node:path";

import { requireGarageSession } from "@/lib/server-auth";
import { fail } from "@/lib/api-response";

export const runtime = "nodejs";

// Role yang boleh melihat selfie SEMUA karyawan (audit kehadiran).
const SUPERVISOR_ROLES = new Set([
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Supervisor Shift",
  "Finance / CFO",
]);

interface RouteContext {
  params: Promise<{ date: string; filename: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const { date, filename } = await params;
  // Validasi ketat: cegah path traversal.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[\w-]+\.(jpg|jpeg|png)$/i.test(filename)) {
    return fail(400, "INVALID_PATH", "Path foto tidak valid.");
  }

  // Otorisasi object-level: staf biasa HANYA boleh melihat selfie miliknya
  // (nama file diawali userId-nya). Manajer/owner boleh semua.
  const role = session.data!.profile.role;
  const userId = session.data!.user.id;
  const isSupervisor = SUPERVISOR_ROLES.has(role);
  if (!isSupervisor && !filename.startsWith(`${userId}-`)) {
    return fail(403, "FORBIDDEN", "Anda hanya bisa melihat selfie absensi sendiri.");
  }

  // Baca dari volume non-publik storage/attendance.
  const filePath = path.join(process.cwd(), "storage", "attendance", date, filename);
  try {
    const data = await fs.readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return fail(404, "PHOTO_NOT_FOUND", "Foto tidak ditemukan.");
  }
}
