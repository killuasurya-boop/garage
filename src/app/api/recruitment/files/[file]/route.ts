import { readFile } from "node:fs/promises";
import path from "node:path";

import { fail } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedFileName = /^(cv|photo|ktp|portfolio|certificate)-\d{13}-[a-f0-9]{8}\.(pdf|doc|docx|jpg|png|webp)$/;

function projectRoot() {
  const cwd = process.cwd();
  if (
    path.basename(cwd).toLowerCase() === "standalone" &&
    path.basename(path.dirname(cwd)).toLowerCase() === ".next"
  ) {
    return path.resolve(cwd, "..", "..");
  }
  return process.env.GARAGE_PROJECT_ROOT
    ? path.resolve(process.env.GARAGE_PROJECT_ROOT)
    : cwd;
}

function contentTypeFor(file: string) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
  ]);
  if (session.response) return session.response;

  const { file } = await context.params;
  const safeFile = path.basename(file);
  if (safeFile !== file || !allowedFileName.test(safeFile)) {
    return fail(400, "INVALID_RECRUITMENT_FILE", "Nama file kandidat tidak valid.");
  }

  const filePath = path.join(projectRoot(), "storage", "recruitment", safeFile);
  const buffer = await readFile(filePath).catch(() => null);
  if (!buffer) {
    return fail(404, "RECRUITMENT_FILE_NOT_FOUND", "File kandidat tidak ditemukan.");
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeFor(safeFile),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
