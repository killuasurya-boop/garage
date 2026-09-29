import { createHash, timingSafeEqual } from "node:crypto";

import { and, eq, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { posTerminals } from "@/db/schema";
import { errorJson } from "@/lib/member-types";

// Kunci bawaan seed development — tertulis di kode sumber, jadi tidak pernah
// boleh membuka akses di production walau terminal lama masih memakainya.
export const DEV_POS_API_KEY = "garage-pos-dev-key";

export function hashPosApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

export async function requirePosTerminal(request: Request, terminalCode?: string) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return { data: null, response: errorJson(401, "x-api-key wajib diisi untuk akses POS.") };
  }
  if (apiKey === DEV_POS_API_KEY && process.env.NODE_ENV === "production") {
    return { data: null, response: errorJson(401, "POS terminal tidak terotorisasi.") };
  }

  const apiKeyHash = hashPosApiKey(apiKey);
  const filters: SQL[] = [eq(posTerminals.apiKeyHash, apiKeyHash), eq(posTerminals.status, "active")];
  if (terminalCode) {
    filters.push(eq(posTerminals.terminalCode, terminalCode));
  }

  const [terminal] = await getDb()
    .select()
    .from(posTerminals)
    .where(and(...filters))
    .limit(1);

  if (!terminal) {
    return { data: null, response: errorJson(401, "POS terminal tidak terotorisasi.") };
  }

  const actual = Buffer.from(apiKeyHash);
  const expected = Buffer.from(terminal.apiKeyHash);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { data: null, response: errorJson(401, "POS terminal tidak terotorisasi.") };
  }

  return { data: terminal, response: null };
}
