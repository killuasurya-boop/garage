import { toNextJsHandler } from "better-auth/next-js";

import { ensureDatabaseReady } from "@/db";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

export async function GET(request: Request) {
  await ensureDatabaseReady();
  return handlers.GET(request);
}

export async function POST(request: Request) {
  await ensureDatabaseReady();
  return handlers.POST(request);
}
