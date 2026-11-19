import { readFile } from "node:fs/promises";
import path from "node:path";

import { fail } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { recruitmentStorageDir } from "@/lib/recruitment-storage";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedFileName = /^(cv|photo|ktp|portfolio|certificate)-\d{13}-[a-f0-9]{8}\.(pdf|doc|docx|jpg|png|webp)$/;

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
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;

  const { file } = await context.params;
  const safeFile = path.basename(file);
  if (safeFile !== file || !allowedFileName.test(safeFile)) {
    return fail(400, "INVALID_RECRUITMENT_FILE", "Nama file kandidat tidak valid.");
  }

  const filePath = path.join(recruitmentStorageDir(), safeFile);
  const buffer = await readFile(filePath).catch(() => null);
  if (!buffer) {
    return fail(404, "RECRUITMENT_FILE_NOT_FOUND", "File kandidat tidak ditemukan.");
  }
  // KTP = data paling sensitif: setiap pembukaan dicatat di Audit (siapa membuka berkas siapa).
  if (safeFile.startsWith("ktp-")) {
    await createAuditLog({
      actor: session.data.user.name ?? session.data.profile.role,
      action: "Buka KTP pelamar",
      object: safeFile,
      device: session.data.profile.deviceLabel ?? "Garage OS",
      metadata: { module: "recruitment", file: safeFile, role: session.data.profile.role },
    }).catch(() => null);
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeFor(safeFile),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Dokumen Word selalu diunduh (bukan dibuka di browser); PDF/foto tampil inline
      // tanpa skrip.
      "Content-Disposition": /\.(doc|docx)$/.test(safeFile) ? `attachment; filename="${safeFile}"` : "inline",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
