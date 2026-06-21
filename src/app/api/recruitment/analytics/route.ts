import { NextResponse } from "next/server";
import { getRecruitmentStats } from "@/lib/garage-recruitment-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getRecruitmentStats();
    return NextResponse.json({ ok: true, data: stats });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Gagal mengambil statistik rekrutmen" },
      { status: 500 }
    );
  }
}
