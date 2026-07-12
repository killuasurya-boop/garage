import { describe, expect, it } from "vitest";
import {
  extractWhatsappInboundMessages,
  isWithin24hWindow,
} from "@/lib/garage-whatsapp-messaging";

describe("parse inbound WhatsApp", () => {
  it("mengambil pesan teks masuk dari webhook", () => {
    expect(
      extractWhatsappInboundMessages({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    { from: "62812000111", id: "wamid.in.1", text: { body: "Halo" }, type: "text" },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([{ from: "62812000111", body: "Halo", messageId: "wamid.in.1" }]);
  });

  it("mengabaikan pesan non-teks", () => {
    expect(
      extractWhatsappInboundMessages({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [{ from: "62812000111", id: "wamid.img", type: "image" }],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("jendela 24 jam: dalam window true, lewat false, null false", () => {
    const now = new Date();
    const inWindow = new Date(now.getTime() - 60 * 60 * 1000);
    const outWindow = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(isWithin24hWindow(inWindow)).toBe(true);
    expect(isWithin24hWindow(outWindow)).toBe(false);
    expect(isWithin24hWindow(null)).toBe(false);
  });
});
