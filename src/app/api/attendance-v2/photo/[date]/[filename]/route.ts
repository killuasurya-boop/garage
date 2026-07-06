import { promises as fs } from "node:fs";
import path from "node:path";

import { requireGarageSession } from "@/lib/server-auth";
import { fail } from "@/lib/api-response";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ date: string; filename: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const { date, filename } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[\w-]+\.(jpg|jpeg|png)$/i.test(filename)) {
    return fail(400, "INVALID_PATH", "Path foto tidak valid.");
  }

  const filePath = path.join(process.cwd(), "uploads", "attendance", date, filename);
  try {
    const data = await fs.readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return fail(404, "PHOTO_NOT_FOUND", "Foto tidak ditemukan.");
  }
}
