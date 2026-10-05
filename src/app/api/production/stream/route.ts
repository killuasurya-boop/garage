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
  let cleanup: () => void = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: () => void = () => {};
      cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* sudah tertutup */
        }
      };
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Koneksi putus tanpa abort → bersihkan agar listener tidak bocor.
          cleanup();
        }
      };
      if (request.signal.aborted) {
        cleanup();
        return;
      }
      unsubscribe = productionBus.subscribe((event) => {
        write(`event: change\ndata: {"at":${event.at}}\n\n`);
      });
      heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
      write("event: ready\ndata: {}\n\n");
      request.signal.addEventListener("abort", () => cleanup(), { once: true });
    },
    cancel() {
      cleanup();
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
