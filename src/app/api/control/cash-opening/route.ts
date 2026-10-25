import { fail, ok, readJson } from "@/lib/api-response";
import { CashOpeningError, certifyOpeningBalance, certifyOpeningSchema, getOpeningStatus } from "@/lib/cash-opening";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Status saldo pembuka per akun + sidik buku kas (Owner, P6). */
export async function GET() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  return ok(await getOpeningStatus());
}

/** Owner mengesahkan saldo nyata satu akun (sekali); selisih diposting `opening_balance`. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, certifyOpeningSchema);
  if (body.error) return body.error;
  try {
    const row = await certifyOpeningBalance(body.data, session.data);
    return ok({ id: row.id, scopeKey: row.scopeKey, adjustment: row.adjustment, asOf: row.asOf.toISOString() });
  } catch (error) {
    if (error instanceof CashOpeningError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
