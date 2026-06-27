import { afterEach, describe, expect, it, vi } from "vitest";

import { assertYoutubeChannelIdentity } from "@/lib/garage-google-integrations";
import { extractMetaPublishEvents } from "@/lib/garage-provider-adapters";
import {
  extractWhatsappDeliveryEvents,
  normalizeWhatsappRecipient,
} from "@/lib/garage-whatsapp-messaging";
import {
  buildIntegrationReadiness,
  buildPublishingReadinessReport,
  sanitizeIntegrationResource,
} from "@/lib/garage-integrations";
import {
  MANUAL_ACTIVATION_CHECKS,
  buildActivationChecklist,
} from "@/lib/garage-integration-activation";

describe("GARAGE integration invariants", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("menolak channel YouTube yang bukan milik GARAGE", () => {
    expect(() => assertYoutubeChannelIdentity("garage-channel", "wrong-channel")).toThrow(
      "Channel YouTube tidak sesuai",
    );
    expect(() => assertYoutubeChannelIdentity("garage-channel", "garage-channel")).not.toThrow();
  });

  it("menormalisasi nomor WhatsApp Indonesia", () => {
    expect(normalizeWhatsappRecipient("0812-3456-7890")).toBe("6281234567890");
    expect(() => normalizeWhatsappRecipient("123")).toThrow();
  });

  it("mengambil delivery status WhatsApp dari webhook", () => {
    expect(
      extractWhatsappDeliveryEvents({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [{ id: "wamid.1", status: "delivered" }],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([{ providerMessageId: "wamid.1", status: "delivered", error: undefined }]);
  });

  it("tidak pernah mengembalikan token melalui payload Control Center", () => {
    const sanitized = sanitizeIntegrationResource({
      id: "00000000-0000-0000-0000-000000000001",
      provider: "youtube",
      resourceType: "channel",
      resourceId: "channel-1",
      accountId: "channel-1",
      accountName: "GARAGE",
      accessTokenEncrypted: "encrypted-access",
      refreshTokenEncrypted: "encrypted-refresh",
      tokenExpiresAt: null,
      refreshExpiresAt: null,
      scopes: [],
      status: "connected",
      metadata: {},
      lastHealthCheckAt: null,
      lastError: null,
      permissionsCheckedAt: null,
      webhookSubscribedAt: null,
      connectedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(sanitized).not.toHaveProperty("accessTokenEncrypted");
    expect(sanitized).not.toHaveProperty("refreshTokenEncrypted");
  });

  it("membuat readiness summary tanpa token dan menandai missing health check", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    const resource = sanitizeIntegrationResource({
      id: "00000000-0000-0000-0000-000000000002",
      provider: "youtube",
      resourceType: "channel",
      resourceId: "garage-channel",
      accountId: "garage-channel",
      accountName: "GARAGE",
      accessTokenEncrypted: "encrypted-access",
      refreshTokenEncrypted: "encrypted-refresh",
      tokenExpiresAt: null,
      refreshExpiresAt: null,
      scopes: ["youtube.upload"],
      status: "connected",
      metadata: {},
      lastHealthCheckAt: null,
      lastError: null,
      permissionsCheckedAt: null,
      webhookSubscribedAt: null,
      connectedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const readiness = buildIntegrationReadiness({
      provider: "youtube",
      configured: true,
      resources: [resource],
    });
    expect(readiness.canPublish).toBe(true);
    expect(readiness.ready).toBe(false);
    expect(readiness.checks.find((check) => check.key === "health")?.ok).toBe(false);
  });

  it("mengambil event publish/error dari webhook Meta", () => {
    expect(
      extractMetaPublishEvents({
        object: "instagram",
        entry: [
          {
            changes: [
              { field: "media", value: { media_id: "ig-media-1", status: "finished" } },
              {
                field: "media",
                value: { media_id: "ig-media-2", status: "failed", error: { message: "bad" } },
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        providerPostId: "ig-media-1",
        platform: "instagram",
        status: "published",
        error: undefined,
        eventType: "media:finished",
      },
      {
        providerPostId: "ig-media-2",
        platform: "instagram",
        status: "failed",
        error: "bad",
        eventType: "media:failed",
      },
    ]);
  });

  it("membuat preflight publishing dengan blocker provider yang belum siap", () => {
    const report = buildPublishingReadinessReport([
      {
        provider: "instagram",
        label: "Instagram Business",
        status: "connected",
        configured: true,
        resources: [],
        readiness: {
          ready: false,
          canPublish: false,
          checks: [
            {
              key: "resource",
              label: "Resource belum terhubung: business_account",
              ok: false,
              severity: "error",
            },
          ],
        },
      },
      {
        provider: "youtube",
        label: "YouTube",
        status: "connected",
        configured: true,
        resources: [],
        readiness: {
          ready: true,
          canPublish: true,
          checks: [],
        },
      },
    ]);

    expect(report.ready).toBe(false);
    expect(report.canPublish).toBe(false);
    expect(report.blockers).toEqual([
      {
        provider: "instagram",
        label: "Instagram Business",
        check: "resource",
        message: "Resource belum terhubung: business_account",
      },
    ]);
  });

  it("menahan activation runbook sampai auto dan manual gate selesai", () => {
    const integrations = ["facebook", "instagram", "tiktok", "youtube"].map((provider) => ({
      provider,
      label: provider,
      configured: true,
      status: "connected",
      readiness: { ready: true, canPublish: true },
      resources: [
        {
          resourceType: provider === "instagram" ? "business_account" : "page",
          resourceId: `${provider}-1`,
          accountName: "GARAGE",
          metadata: provider === "facebook" ? { selected: true } : {},
        },
      ],
    }));
    const blocked = buildActivationChecklist({
      integrations,
      manualCompleted: {},
    });
    expect(blocked.readyForStagedLive).toBe(false);
    expect(blocked.blockers.length).toBeGreaterThan(0);

    const completed = Object.fromEntries(
      MANUAL_ACTIVATION_CHECKS.map((item) => [item.id, true]),
    );
    const ready = buildActivationChecklist({
      integrations,
      manualCompleted: completed,
    });
    expect(ready.readyForStagedLive).toBe(true);
  });
});
