import { fail, ok } from "@/lib/api-response";
import { getDailyCashSessionReport } from "@/lib/garage-service";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function todayJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  const session = await requireAnyPermission(["finance:read", "finance:write"]);
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? todayJakarta();
  if (!isDateKey(date)) {
    return fail(400, "INVALID_DATE", "Format tanggal harus YYYY-MM-DD.");
  }

  return ok(
    await getDailyCashSessionReport({
      date,
      outletId: session.data.profile.outlet.id,
      requesterUserId: session.data.user.id,
    }),
  );
}
