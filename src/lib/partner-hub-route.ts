// Smart Partner Hub — helper route: error domain → { error: { code, message } } (tanpa membocorkan SQL/stack).
import { fail } from "@/lib/api-response";
import { PartnerOrderError } from "@/lib/partner-hub-orders";
import { PartnerHubError } from "@/lib/partner-hub-service";

export async function partnerRoute<T>(run: () => Promise<T>, okStatus = 200): Promise<Response> {
  try {
    const data = await run();
    return Response.json({ data }, { status: okStatus });
  } catch (error) {
    if (error instanceof PartnerHubError) return fail(error.status, error.code, error.message);
    if (error instanceof PartnerOrderError) return fail(409, "PARTNER_ORDER_BLOCKED", error.message);
    console.error("[partner-hub]", error);
    return fail(500, "PARTNER_HUB_FAILED", "Permintaan Partner Hub gagal diproses. Coba lagi.");
  }
}

/** Periode dari query ?from=YYYY-MM-DD&to=YYYY-MM-DD (WIB, inklusif). Default: hari ini WIB. */
export function periodFromQuery(url: URL) {
  const parse = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+07:00`) : null);
  const todayKey = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const from = parse(url.searchParams.get("from")) ?? new Date(`${todayKey}T00:00:00+07:00`);
  const toStart = parse(url.searchParams.get("to")) ?? from;
  const to = new Date(toStart.getTime() + 86_400_000);
  if (to.getTime() - from.getTime() > 366 * 86_400_000) return { from, to: new Date(from.getTime() + 366 * 86_400_000) };
  return { from, to: to > from ? to : new Date(from.getTime() + 86_400_000) };
}
