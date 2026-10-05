import { fail } from "@/lib/api-response";
import { secretsMatch } from "@/lib/secret-compare";

export function requireGarageAiJobAuthorization(request: Request) {
  const expectedSecret =
    process.env.GARAGE_JOB_SECRET?.trim() || process.env.CRON_SECRET?.trim();

  if (!expectedSecret) {
    return fail(
      503,
      "GARAGE_JOB_SECRET_MISSING",
      "GARAGE_JOB_SECRET atau CRON_SECRET belum dikonfigurasi.",
    );
  }

  if (!secretsMatch(request.headers.get("authorization"), `Bearer ${expectedSecret}`)) {
    return fail(401, "UNAUTHORIZED", "Job GARAGE AI tidak terotorisasi.");
  }

  return null;
}
