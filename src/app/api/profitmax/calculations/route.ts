import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { listProfitMaxSavedCalculations, saveProfitMaxCalculation } from "@/lib/profitmax-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const calculationSchema = z.object({
  type: z.enum(["hpp", "roi", "promo", "bundling", "overhead"]),
  title: z.string().min(3).max(120),
  input: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()),
});

export async function GET() {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  const calculations = await listProfitMaxSavedCalculations(session.data);
  return ok(
    { calculations },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  const { data, error } = await readJson(request, calculationSchema);
  if (error) return error;
  if (!data) return fail(400, "INVALID_PAYLOAD", "Payload kalkulasi ProfitMax tidak valid");

  const calculation = await saveProfitMaxCalculation(data, session.data);
  return ok(
    {
      calculation,
      message: "Kalkulasi ProfitMax tersimpan.",
    },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
