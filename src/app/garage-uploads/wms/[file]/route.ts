import { readFile } from "node:fs/promises";
import path from "node:path";

import { fail } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Menu punya route serupa. Diperlukan karena Next standalone TIDAK menyajikan file
// yang ditulis ke public/ saat runtime — harus di-stream lewat route handler.
const allowedImageNames = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(webp|jpg|jpeg|png)$/;
const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#F1F2F4"/>
  <rect x="120" y="120" width="160" height="160" rx="18" fill="none" stroke="#C7CBD1" stroke-width="10"/>
  <circle cx="170" cy="175" r="16" fill="#C7CBD1"/>
  <path d="M140 260l45-52 30 34 28-30 37 48Z" fill="#C7CBD1"/>
</svg>`;

function projectRoot() {
  const cwd = process.cwd();
  if (
    path.basename(cwd).toLowerCase() === "standalone" &&
    path.basename(path.dirname(cwd)).toLowerCase() === ".next"
  ) {
    return path.resolve(cwd, "..", "..");
  }
  return process.env.GARAGE_PROJECT_ROOT ? path.resolve(process.env.GARAGE_PROJECT_ROOT) : cwd;
}

function wmsImagePaths(file: string) {
  const rootPath = path.join(projectRoot(), "public", "garage-uploads", "wms", file);
  const runtimePath = path.join(process.cwd(), "public", "garage-uploads", "wms", file);
  return rootPath === runtimePath ? [rootPath] : [rootPath, runtimePath];
}

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const safeFile = path.basename(file);

  if (safeFile !== file || !allowedImageNames.test(safeFile)) {
    return fail(400, "INVALID_WMS_IMAGE", "Nama file foto tidak valid.");
  }

  for (const filePath of wmsImagePaths(safeFile)) {
    const buffer = await readFile(filePath).catch(() => null);
    if (!buffer) continue;
    const ext = path.extname(safeFile).toLowerCase();
    const contentType = ext === ".webp" ? "image/webp" : ext === ".png" ? "image/png" : "image/jpeg";
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  }

  return new Response(fallbackSvg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
