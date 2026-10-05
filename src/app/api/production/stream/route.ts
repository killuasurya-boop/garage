import { productionBus } from "@/lib/production-events";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events: tanda "produksi berubah" untuk Production Hub & Control
// Center (semua staf aktif). Tanpa data — klien mengambil ulang via API yang
// memeriksa izin. Heartbeat 25 dtk agar lolos timeout proxy.
export async function GET(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Koneksi sudah tertutup — dibersihkan oleh abort.
        }
      };
      const unsubscribe = productionBus.subscribe((event) => {
        write(`event: change\ndata: {"at":${event.at}}\n\n`);
      });
      const heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
      write("event: ready\ndata: {}\n\n");

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
