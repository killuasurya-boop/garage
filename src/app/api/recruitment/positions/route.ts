import { ok } from "@/lib/api-response";
import { listOpenPositions } from "@/lib/garage-recruitment-positions-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Posisi yang dibuka — endpoint PUBLIK untuk halaman /recruitment.
export async function GET() {
  const positions = await listOpenPositions();
  return ok({ positions });
}
