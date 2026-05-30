import { chatBus, type ChatEvent } from "@/lib/chat-events";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events stream — kirim event chat realtime ke client.
// Client subscribe lewat EventSource. Filter di server: hanya event dimana
// user ada di memberUserIds. Heartbeat tiap 25 detik biar koneksi survive.
export async function GET(request: Request) {
  const session = await requirePermission("chat:use");
  if (session.response) return session.response;

  const userId = session.data.user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: ChatEvent) => {
        try {
          if (event.kind === "message" && !event.memberUserIds.includes(userId)) {
            return;
          }
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Connection closed — handled by abort
        }
      };

      const unsubscribe = chatBus.subscribe(send);

      // Heartbeat untuk lewat proxy timeout
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* ignore */
        }
      }, 25_000);

      // Initial hello
      controller.enqueue(
        encoder.encode(`event: ready\ndata: {"userId":"${userId}"}\n\n`),
      );

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      request.signal.addEventListener("abort", cleanup);
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
