import { ok } from "@/lib/api-response";
import { processScheduledPublishing } from "@/lib/garage-content-publishing";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = requireGarageAiJobAuthorization(request);
  if (auth) return auth;
  return ok(await processScheduledPublishing());
}

export const GET = POST;
