// ETag helper untuk endpoint polling (KDS, waiter, customer queue).
// Pattern: server hash payload → kirim ETag header. Client polling kirim
// If-None-Match → kalau cocok, server return 304 (kosong, hemat bandwidth).

import { createHash } from "node:crypto";

export function computeEtag(data: unknown): string {
  const json = JSON.stringify(data);
  const hash = createHash("sha1").update(json).digest("base64url").slice(0, 22);
  return `W/"${hash}"`;
}

// Bangun Response: kalau client kirim If-None-Match cocok → 304.
// Selain itu, return ok({ data }) dengan header ETag + Cache-Control no-store.
export function okWithEtag<T>(request: Request, data: T): Response {
  const etag = computeEtag(data);
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "no-store",
      },
    });
  }
  return Response.json(
    { data },
    {
      status: 200,
      headers: {
        ETag: etag,
        "Cache-Control": "no-store",
      },
    },
  );
}
