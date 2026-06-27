import { NextResponse } from "next/server";
import { requireGarageSession } from "@/lib/server-auth";
import { buildMetaAuthorizationUrl, metaClientConfigured } from "@/lib/garage-meta-publisher";
import { auditSafely } from "@/lib/garage-social-audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const permission = await requireGarageSession(["Owner / CEO"]);
    if (permission.response) return permission.response;
    const user = permission.data.user;
    if (!metaClientConfigured()) {
      return NextResponse.json({ error: "Meta OAuth belum dikonfigurasi (META_CLIENT_ID atau META_CLIENT_SECRET kosong)." }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const returnTo = searchParams.get("returnTo") || "/?module=marketing";

    const url = buildMetaAuthorizationUrl({
      userId: user.id,
      returnTo,
    });
    auditSafely({
      actor: user.id,
      action: "integration.connect.start",
      object: "meta",
      status: "recorded",
      metadata: { provider: "meta" },
    });

    return NextResponse.redirect(url);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta OAuth gagal." },
      { status: 500 },
    );
  }
}
