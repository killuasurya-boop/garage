import { describe, expect, it } from "vitest";
import { whatsappConversations, whatsappMessages } from "@/db/schema";

describe("skema WhatsApp inbox", () => {
  it("whatsapp_conversations punya kolom wajib", () => {
    const cols = whatsappConversations;
    expect(cols.phoneNumber).toBeDefined();
    expect(cols.customerId).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.unreadCount).toBeDefined();
    expect(cols.lastInboundAt).toBeDefined();
  });

  it("whatsapp_messages punya kolom arah & status", () => {
    const cols = whatsappMessages;
    expect(cols.conversationId).toBeDefined();
    expect(cols.direction).toBeDefined();
    expect(cols.messageType).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.providerMessageId).toBeDefined();
  });
});
