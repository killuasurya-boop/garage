import { fail, ok } from "@/lib/api-response";
import { processEarningsRetry } from "@/lib/garage-earnings";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorized = requireGarageAiJobAuthorization(request);
  if (unauthorized) {
    return unauthorized;
  }

  const url = new URL(request.url);
  const batchSizeParam = url.searchParams.get("batchSize");
  const batchSize = batchSizeParam ? Number(batchSizeParam) : undefined;

  try {
    const result = await processEarningsRetry({
      batchSize: Number.isFinite(batchSize) ? (batchSize as number) : undefined,
    });
    return ok({ job: "earnings-retry", result });
  } catch (error) {
    return fail(
      500,
      "EARNINGS_RETRY_JOB_FAILED",
      error instanceof Error ? error.message : "Earnings retry job gagal.",
    );
  }
}
