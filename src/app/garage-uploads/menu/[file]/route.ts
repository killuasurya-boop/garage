import { readFile } from "node:fs/promises";
import path from "node:path";

import { fail } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedImageNames = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(webp|jpg|jpeg|png)$/;
const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#2a2622"/>
      <stop offset="1" stop-color="#111116"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <circle cx="400" cy="330" r="92" fill="#d11a2a" opacity=".18"/>
  <path d="M270 470h260l-62-82-46 52-58-76-94 106Z" fill="#f2ca50" opacity=".72"/>
  <rect x="220" y="220" width="360" height="360" rx="34" fill="none" stroke="#f2ca50" stroke-opacity=".38" stroke-width="16"/>
  <text x="400" y="638" fill="#f4f4f5" font-family="Arial, sans-serif" font-size="34" font-weight="700" text-anchor="middle">GARAGE MENU</text>
</svg>`;

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

function menuImagePaths(file: string) {
  const rootPath = path.join(projectRoot(), "public", "garage-uploads", "menu", file);
  const runtimePath = path.join(
    process.cwd(),
    "public",
    "garage-uploads",
    "menu",
    file,
  );
  return rootPath === runtimePath ? [rootPath] : [rootPath, runtimePath];
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;
  const safeFile = path.basename(file);

  if (safeFile !== file || !allowedImageNames.test(safeFile)) {
    return fail(400, "INVALID_MENU_IMAGE", "Nama file foto menu tidak valid.");
  }

  for (const filePath of menuImagePaths(safeFile)) {
    const buffer = await readFile(filePath).catch(() => null);
    if (!buffer) continue;

    const ext = path.extname(safeFile).toLowerCase();
    const contentType =
      ext === ".webp"
        ? "image/webp"
        : ext === ".png"
          ? "image/png"
          : "image/jpeg";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(fallbackSvg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
