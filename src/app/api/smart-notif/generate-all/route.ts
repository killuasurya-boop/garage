import { NextResponse } from "next/server";
import { requireGarageSession } from "@/lib/server-auth";

export async function POST() {
  try {
    // 1. Auth check (only Owner/Admin)
    const session = await requireGarageSession(["Owner / CEO", "Admin"]);
    if (session.response) return session.response;

    return NextResponse.json({
      success: true,
      message:
        "Audio permanen meja 1-50 tersedia. Regenerate asset dijalankan manual dari server, bukan via API runtime.",
      command: "npm run voice:generate-smart-notif -- --tables=1-50 --force",
      assetBasePath: "/audio/smart-notif",
      generatedTables: "1-50",
    });
  } catch (error: any) {
    console.error("[POST /api/smart-notif/generate-all] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
