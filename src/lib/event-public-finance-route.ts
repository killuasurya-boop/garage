import { fail, ok } from "@/lib/api-response";
import { PublicFinanceError } from "@/lib/event-public-finance";

export async function publicFinanceRoute<T>(run: () => Promise<T>) {
  try {
    return ok(await run());
  } catch (error) {
    if (error instanceof PublicFinanceError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
