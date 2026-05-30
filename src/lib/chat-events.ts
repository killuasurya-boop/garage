import { EventEmitter } from "events";

// In-memory pub/sub untuk realtime chat. OK untuk single-process Next.js node
// runtime; tidak survive horizontal scale (kalau multi-instance, ganti ke
// Redis/Postgres LISTEN). Untuk MVP internal app cukup.
export type ChatEvent =
  | {
      kind: "message";
      channelId: string;
      memberUserIds: string[];
      message: {
        id: string;
        channelId: string;
        senderUserId: string;
        senderName: string;
        body: string;
        attachmentUrl: string | null;
        attachmentType: string | null;
        attachmentSize: number | null;
        replyToId: string | null;
        createdAt: string;
      };
    }
  | {
      kind: "read";
      channelId: string;
      userId: string;
      lastReadAt: string;
    };

class ChatBus extends EventEmitter {
  publish(event: ChatEvent) {
    this.emit("event", event);
  }

  subscribe(handler: (event: ChatEvent) => void) {
    this.on("event", handler);
    return () => this.off("event", handler);
  }
}

declare global {
  var __garage_chat_bus__: ChatBus | undefined;
}

// Singleton lintas hot-reload di dev — pakai globalThis.
export const chatBus: ChatBus =
  globalThis.__garage_chat_bus__ ?? new ChatBus();

if (!globalThis.__garage_chat_bus__) {
  chatBus.setMaxListeners(200);
  globalThis.__garage_chat_bus__ = chatBus;
}
