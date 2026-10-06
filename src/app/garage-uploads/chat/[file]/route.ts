import { readFile } from "node:fs/promises";
import path from "node:path";

import { fail } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowed = /^[0-9]{8}-[a-f0-9]{24}\.(webp|jpg|png)$/;

function projectRoot() {
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === "standalone" && path.basename(path.dirname(cwd)).toLowerCase() === ".next") {
    return path.resolve(cwd, "..", "..");
  }
  return process.env.GARAGE_PROJECT_ROOT ? path.resolve(process.env.GARAGE_PROJECT_ROOT) : cwd;
}

// Foto lampiran live chat (nama acak 24 heksa — tidak bisa ditebak).
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const safe = path.basename(file);
  if (safe !== file || !allowed.test(safe)) return fail(400, "INVALID_FILE", "Nama file tidak valid.");
  const buffer = await readFile(path.join(projectRoot(), "public", "garage-uploads", "chat", safe)).catch(() => null);
  if (!buffer) return fail(404, "NOT_FOUND", "Foto tidak ditemukan.");
  const ext = path.extname(safe);
  const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
