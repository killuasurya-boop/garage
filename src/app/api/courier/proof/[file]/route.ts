import { readFile } from "node:fs/promises";
import path from "node:path";

import { fail } from "@/lib/api-response";
import { DELIVERY_PROOF_FILE, deliveryProofDir } from "@/lib/delivery-proof-storage";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

// Foto bukti terkirim — hanya untuk staf yang login (kasir/kurir/manajer/owner).
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const { file } = await context.params;
  if (!DELIVERY_PROOF_FILE.test(file)) return fail(404, "PROOF_NOT_FOUND", "Foto tidak ditemukan.");
  try {
    const buffer = await readFile(path.join(deliveryProofDir(), file));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "cache-control": "private, max-age=3600",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return fail(404, "PROOF_NOT_FOUND", "Foto tidak ditemukan.");
  }
}
