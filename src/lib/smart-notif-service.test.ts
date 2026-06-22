import { describe, expect, it } from "vitest";

import {
  buildSmartNotifMessage,
  buildVoiceAssetPath,
  processSmartNotifTrigger,
  resolveFallbackVoiceUrl,
} from "@/lib/smart-notif-service";

describe("smart-notif-service", () => {
  it("builds POS order message with table and order number", () => {
    expect(
      buildSmartNotifMessage("pos.order_created", {
        tableNo: "7",
        orderNo: "G-021",
      }),
    ).toBe(
      "Ding ding ding. Perhatian. Pesanan baru meja 7, nomor G-021, telah masuk ke dapur.",
    );
  });

  it("falls back cleanly when table and order number are missing", () => {
    expect(buildSmartNotifMessage("pos.order_created", {})).toBe(
      "Ding ding ding. Perhatian. Pesanan baru telah masuk ke dapur.",
    );
  });

  it("resolves permanent MP3 asset path from a table label", () => {
    const asset = buildVoiceAssetPath("order_ready", {
      tableNo: "Meja 7",
      orderNo: "G-021",
    });

    expect(asset.publicUrl).toBe(
      "/audio/smart-notif/generated/kitchen.order_ready/table-7.mp3",
    );
    expect(asset.hasPermanentAudio).toBe(true);
  });

  it("resolves MP3 fallback by trigger", () => {
    expect(resolveFallbackVoiceUrl("pos.order_created")).toBe(
      "/audio/smart-notif/fallback/order-created.mp3",
    );
    expect(resolveFallbackVoiceUrl("waiter.order_ready")).toBe(
      "/audio/smart-notif/fallback/waiter-ready.mp3",
    );
    expect(resolveFallbackVoiceUrl("kitchen.sla_warning")).toBe(
      "/audio/smart-notif/fallback/kitchen-ready.mp3",
    );
  });

  it("returns permanent audio when the generated table MP3 exists", async () => {
    await expect(
      processSmartNotifTrigger("pos.order_created", {
        tableNo: "7",
        orderNo: "G-021",
      }),
    ).resolves.toMatchObject({
      audioUrl: "/audio/smart-notif/generated/pos.order_created/table-7.mp3",
      audioSource: "permanent",
      chimeUrl: "/audio/smart-notif/chime/garage-station-chime.mp3",
      tableNo: "7",
      orderNo: "G-021",
    });
  });

  it("returns fallback audio when the permanent table MP3 is missing", async () => {
    await expect(
      processSmartNotifTrigger("pos.order_created", {
        tableNo: "999",
        orderNo: "G-999",
      }),
    ).resolves.toMatchObject({
      audioUrl: "/audio/smart-notif/fallback/order-created.mp3",
      audioSource: "fallback",
      tableNo: "999",
      orderNo: "G-999",
    });
  });
});
