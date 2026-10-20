import { ok } from "@/lib/api-response";
import { getPosBaseline } from "@/lib/pos-baseline";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Snapshot data POS terlindungi (produk, varian, harga, kategori) + hash SHA-256.
// Owner mengunduhnya sebelum & sesudah deploy untuk membuktikan tidak ada perubahan.
export async function GET() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  return ok(await getPosBaseline());
}
