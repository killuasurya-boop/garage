import { ok } from "@/lib/api-response";
import { syncSocialAnalytics } from "@/lib/garage-content-publishing";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireGarageAiJobAuthorization(request);
  if (auth) return auth;
  const results = await syncSocialAnalytics();
  return ok({
    scanned: results.length,
    synced: results.filter((result) => result.status === "synced").length,
    status: "completed",
    results,
  });
}

export const GET = POST;
