import { ensureDatabaseReady } from "@/db";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

function isDevelopmentDemoEnabled() {
  return process.env.NODE_ENV !== "production";
}

export async function POST(request: Request) {
  if (!isDevelopmentDemoEnabled()) {
    return Response.json({ message: "Demo login hanya aktif di development." }, { status: 404 });
  }

  await ensureDatabaseReady();

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const password = process.env.GARAGE_SEED_PASSWORD ?? "garage12345";

  if (!email) {
    return Response.json({ message: "Email wajib diisi." }, { status: 400 });
  }

  const url = new URL("/api/auth/sign-in/email", request.url);
  const response = await auth.handler(new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": request.headers.get("user-agent") ?? "Garage local demo login",
      "X-Forwarded-For": request.headers.get("x-forwarded-for") ?? "",
      "X-Real-IP": request.headers.get("x-real-ip") ?? "",
    },
    body: JSON.stringify({ email, password }),
  }));

  const responseBody = await response.text();
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const setCookie = response.headers.get("set-cookie");

  if (contentType) headers.set("content-type", contentType);
  if (setCookie) headers.set("set-cookie", setCookie);

  return new Response(responseBody, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
