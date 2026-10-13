import { NextResponse, type NextRequest } from "next/server";

// Teruskan metode & path asli ke handler HANYA untuk request ber-API key agent,
// supaya requireGarageSession bisa menegakkan scope baca-saja, memblokir path
// terlarang, dan mencatat path di Audit. Nilai header ini dari klien selalu
// dibuang/ditimpa, jadi tidak bisa dipalsukan.
const METHOD_HEADER = "x-garage-agent-method";
const PATH_HEADER = "x-garage-agent-path";

function hasAgentKey(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  return /^Bearer\s+gk_agent_/i.test(auth) || (request.headers.get("x-garage-agent-key") ?? "").startsWith("gk_agent_");
}

export function proxy(request: NextRequest) {
  if (!hasAgentKey(request)) {
    if (!request.headers.has(METHOD_HEADER) && !request.headers.has(PATH_HEADER)) return NextResponse.next();
    const clean = new Headers(request.headers);
    clean.delete(METHOD_HEADER);
    clean.delete(PATH_HEADER);
    return NextResponse.next({ request: { headers: clean } });
  }
  const forwarded = new Headers(request.headers);
  forwarded.set(METHOD_HEADER, request.method);
  forwarded.set(PATH_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  matcher: "/api/:path*",
};
