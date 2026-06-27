import { NextResponse } from "next/server";
import { saveMetaOAuthConnection, verifyMetaOAuthState } from "@/lib/garage-meta-publisher";
import { auditSafely } from "@/lib/garage-social-audit";
import { requireGarageSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorReason = searchParams.get("error_reason");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      return NextResponse.json(
        { error: `Meta OAuth ditolak: ${errorDescription ?? errorReason ?? error}` },
        { status: 400 },
      );
    }
    if (!code || !state) {
      return NextResponse.json({ error: "Missing code atau state dari Meta." }, { status: 400 });
    }

    const { userId, returnTo } = verifyMetaOAuthState(state);
    if (userId !== session.data.user.id) {
      return NextResponse.json({ error: "Session Owner tidak sesuai." }, { status: 403 });
    }

    await saveMetaOAuthConnection({
      code,
      userId,
    });
    auditSafely({
      actor: userId,
      action: "integration.connect.callback",
      object: "meta",
      status: "success",
      metadata: { provider: "meta" },
    });

    const destination = new URL(returnTo, process.env.GARAGE_PUBLIC_BASE_URL || "https://app.garagecoffee.id");
    destination.searchParams.set("meta_connected", "1");
    return NextResponse.redirect(destination.toString());
  } catch (err: unknown) {
    auditSafely({
      actor: session.data.user.id,
      action: "integration.connect.callback",
      object: "meta",
      status: "failed",
      metadata: { provider: "meta", error: err instanceof Error ? err.message : "Meta OAuth gagal." },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Meta OAuth gagal." },
      { status: 500 },
    );
  }
}
