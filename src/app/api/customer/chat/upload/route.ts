import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { fail, ok } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Foto dari pelanggan di live chat (mis. bukti bayar QRIS/transfer). Publik
// tanpa login → hanya gambar, maks 5 MB, dibatasi per IP. Nama file acak
// (tidak bisa ditebak) dan disimpan di volume garage-uploads (tahan redeploy).
const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

function projectRoot() {
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === "standalone" && path.basename(path.dirname(cwd)).toLowerCase() === ".next") {
    return path.resolve(cwd, "..", "..");
  }
  return process.env.GARAGE_PROJECT_ROOT ? path.resolve(process.env.GARAGE_PROJECT_ROOT) : cwd;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "customer-chat-upload", { limit: 6, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, "INVALID_FORM", "Form-data tidak valid.");
  const chatToken = String(form.get("chatToken") ?? "").trim();
  if (chatToken.length < 12 || chatToken.length > 120) return fail(400, "INVALID_TOKEN", "Token chat tidak valid.");
  const file = form.get("file");
  if (!(file instanceof Blob)) return fail(400, "MISSING_FILE", "Pilih foto terlebih dahulu.");
  if (file.size > MAX_BYTES) return fail(400, "FILE_TOO_LARGE", "Ukuran foto maksimal 5 MB.");
  const ext = EXT[file.type];
  if (!ext) return fail(400, "MIME_NOT_ALLOWED", "Hanya foto JPG, PNG, atau WEBP.");

  const buffer = Buffer.from(await file.arrayBuffer());
  // Cek tanda tangan file (bukan hanya MIME dari browser).
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isJpeg && !isPng && !isWebp) return fail(400, "MIME_NOT_ALLOWED", "File bukan foto yang valid.");

  const filename = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(12).toString("hex")}${ext}`;
  const dir = path.join(projectRoot(), "public", "garage-uploads", "chat");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return ok({ url: `/garage-uploads/chat/${filename}` }, { status: 201 });
}
