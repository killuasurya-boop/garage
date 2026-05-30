import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { fail, ok } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

function safeExt(mime: string, fallbackName: string) {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
  };
  if (map[mime]) return map[mime];
  const ext = path.extname(fallbackName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

export async function POST(request: Request) {
  const session = await requirePermission("chat:use");
  if (session.response) return session.response;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return fail(400, "INVALID_FORM", "Form-data tidak valid.");
  }
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return fail(400, "MISSING_FILE", "Field 'file' wajib diisi.");
  }
  if (file.size > MAX_BYTES) {
    return fail(400, "FILE_TOO_LARGE", "Maksimal 10 MB.");
  }
  const type = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(type)) {
    return fail(400, "MIME_NOT_ALLOWED", `Tipe file tidak didukung: ${type}.`);
  }

  const originalName = (file instanceof File && file.name) || "upload";
  const ext = safeExt(type, originalName);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${stamp}-${randomBytes(6).toString("hex")}${ext}`;

  const uploadDir = path.join(process.cwd(), "public", "uploads", "chat");
  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), buffer);

  const publicUrl = `/uploads/chat/${filename}`;
  return ok({
    url: publicUrl,
    type,
    size: file.size,
    name: originalName,
  });
}
