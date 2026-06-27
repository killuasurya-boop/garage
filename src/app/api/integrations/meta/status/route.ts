import { NextResponse } from "next/server";
import { getMetaConnectionStatus } from "@/lib/garage-meta-publisher";
import { requirePermission } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;
  try {
    const status = await getMetaConnectionStatus();
    return NextResponse.json(status || null);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status Meta gagal dimuat." },
      { status: 500 },
    );
  }
}
