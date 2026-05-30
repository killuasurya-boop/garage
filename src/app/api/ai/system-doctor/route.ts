import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { runGarageAiSystemDoctor } from "@/lib/garage-ai-system-doctor";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const systemDoctorSchema = z.object({
  autoHeal: z.boolean().optional(),
});

export async function GET() {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  try {
    return ok(
      await runGarageAiSystemDoctor({
        autoHeal: false,
        actor: session.data.user.name ?? session.data.user.email,
        device: session.data.profile.deviceLabel,
      }),
    );
  } catch (error) {
    return fail(
      500,
      "AI_SYSTEM_DOCTOR_FAILED",
      error instanceof Error ? error.message : "System Doctor gagal dijalankan.",
    );
  }
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, systemDoctorSchema);
  if (body.error) {
    return body.error;
  }

  try {
    return ok(
      await runGarageAiSystemDoctor({
        autoHeal: body.data.autoHeal ?? true,
        actor: session.data.user.name ?? session.data.user.email,
        device: session.data.profile.deviceLabel,
      }),
    );
  } catch (error) {
    return fail(
      500,
      "AI_SYSTEM_DOCTOR_FAILED",
      error instanceof Error ? error.message : "System Doctor gagal menjalankan auto-heal.",
    );
  }
}
