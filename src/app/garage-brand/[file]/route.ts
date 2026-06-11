import { readFile } from "node:fs/promises";
import path from "node:path";

import { fail } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedBrandNames = /^(logo-website|logo-icon)\.png$/;

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;
  const safeFile = path.basename(file);

  if (safeFile !== file || !allowedBrandNames.test(safeFile)) {
    return fail(400, "INVALID_BRAND_ASSET", "Nama asset brand tidak valid.");
  }

  const candidates = [
    path.join(projectRoot(), "public", "garage-brand", safeFile),
    path.join(process.cwd(), "public", "garage-brand", safeFile),
  ];

  for (const filePath of Array.from(new Set(candidates))) {
    const buffer = await readFile(filePath).catch(() => null);
    if (!buffer) continue;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return fail(404, "BRAND_ASSET_NOT_FOUND", "Asset brand tidak ditemukan.");
}
