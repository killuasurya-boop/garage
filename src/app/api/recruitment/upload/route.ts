import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const maxBytes = 5 * 1024 * 1024; // 5 MB
const accepted: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

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

// Upload dokumen kandidat (CV / foto / portfolio). Publik tapi rate-limited.
export async function POST(request: Request) {
  const limited = rateLimit(request, "recruitment-upload", { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART", "Request harus multipart/form-data dengan field file.");
  }

  const file = formData.get("file");
  const kind = String(formData.get("kind") ?? "cv").replace(/[^a-z]/gi, "").toLowerCase() || "cv";
  if (!(file instanceof File)) {
    return fail(400, "FILE_MISSING", "File wajib diupload.");
  }
  if (file.size <= 0) {
    return fail(400, "FILE_EMPTY", "File kosong.");
  }
  if (file.size > maxBytes) {
    return fail(413, "FILE_TOO_LARGE", "Ukuran file maksimal 5 MB.");
  }
  const ext = accepted[file.type.toLowerCase()];
  if (!ext) {
    return fail(400, "FILE_UNSUPPORTED", "Format harus PDF, JPG, PNG, atau WebP.");
  }

  const dir = path.join(projectRoot(), "public", "garage-uploads", "recruitment");
  await mkdir(dir, { recursive: true });
  const fileName = `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  try {
    await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return fail(500, "FILE_SAVE_FAILED", error instanceof Error ? error.message : "Gagal menyimpan file.");
  }

  return ok({ url: `/garage-uploads/recruitment/${fileName}` }, { status: 201 });
}
