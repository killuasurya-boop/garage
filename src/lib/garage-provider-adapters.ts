import { createHmac, timingSafeEqual } from "node:crypto";

import {
  getConnectedAccessToken,
  getIntegrationResource,
  type IntegrationProvider,
  recordIntegrationHealth,
  upsertIntegrationResource,
} from "@/lib/garage-integrations";
import { metaGraphVersion, publishFacebook, publishInstagram, testMetaResource } from "@/lib/garage-meta-publisher";
import { publishGoogleBusinessPost, publishYouTubeShort, testGoogleProvider } from "@/lib/garage-google-integrations";
import {
  googleAccessToken,
  validateGoogleBusinessProfile,
} from "@/lib/garage-google-integrations";
import { getTikTokConnectionStatus, publishTikTokVideo } from "@/lib/garage-tiktok-publisher";

export type PublishPayload = {
  title: string;
  caption: string;
  assetUrl: string;
  assetUrls?: string[];
};

async function json<T>(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const result = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || `Provider gagal (${response.status}).`);
  return result;
}

export async function testIntegration(provider: IntegrationProvider) {
  if (provider === "facebook" || provider === "instagram") return testMetaResource(provider);
  if (provider === "youtube") return testGoogleProvider(provider);
  if (provider === "google_business") return validateGoogleBusinessProfile();
  if (provider === "tiktok") {
    const status = await getTikTokConnectionStatus();
    if (!status) throw new Error("TikTok belum terhubung.");
    return status;
  }
  if (provider === "google_maps") {
    const key = process.env.GOOGLE_MAPS_SERVER_KEY?.trim();
    const placeId = process.env.GARAGE_GOOGLE_PLACE_ID?.trim();
    if (!key || !placeId) throw new Error("GOOGLE_MAPS_SERVER_KEY dan GARAGE_GOOGLE_PLACE_ID wajib.");
    const place = await json<{
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      googleMapsUri?: string;
      regularOpeningHours?: unknown;
    }>(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=id,displayName,formattedAddress,location,googleMapsUri,regularOpeningHours`,
      { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "*" } },
    );
    await upsertIntegrationResource({
      provider: "google_maps",
      resourceType: "place",
      resourceId: place.id,
      accountName: place.displayName?.text ?? "GARAGE",
      status: "connected",
      metadata: {
        formattedAddress: place.formattedAddress,
        latitude: place.location?.latitude,
        longitude: place.location?.longitude,
        googleMapsUri: place.googleMapsUri,
        regularOpeningHours: place.regularOpeningHours,
      },
    });
    return place;
  }
  if (provider === "whatsapp") {
    const token = process.env.WHATSAPP_CLOUD_API_TOKEN?.trim();
    const phoneId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
    if (!token || !phoneId) throw new Error("WhatsApp Cloud API belum dikonfigurasi.");
    const data = await json<{ id: string; display_phone_number?: string; verified_name?: string }>(
      `https://graph.facebook.com/${process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || metaGraphVersion()}/${phoneId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    await upsertIntegrationResource({
      provider: "whatsapp",
      resourceType: "phone_number",
      resourceId: data.id,
      accountName: data.verified_name || data.display_phone_number || "GARAGE",
      accessToken: token,
      metadata: { displayPhoneNumber: data.display_phone_number },
    });
    return data;
  }
  if (provider === "threads") {
    const { token, resource } = await getConnectedAccessToken("threads", "profile");
    return json(
      `https://graph.threads.net/${metaGraphVersion()}/${resource.resourceId}?fields=id,username`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }
  throw new Error(`Health check ${provider} belum tersedia.`);
}

export async function runIntegrationHealthCheck(provider: IntegrationProvider) {
  const resource = await getIntegrationResource(provider);
  try {
    const result = await testIntegration(provider);
    if (resource) {
      await recordIntegrationHealth({
        provider,
        resourceId: resource.resourceId,
        ok: true,
      }).catch(() => null);
    }
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check gagal.";
    if (resource) {
      await recordIntegrationHealth({
        provider,
        resourceId: resource.resourceId,
        ok: false,
        error: message,
      }).catch(() => null);
    }
    return { ok: false, error: message };
  }
}

export async function publishThreads(input: PublishPayload) {
  const { token, resource } = await getConnectedAccessToken("threads", "profile");
  const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(input.assetUrl);
  const container = await json<{ id: string }>(
    `https://graph.threads.net/${metaGraphVersion()}/${resource.resourceId}/threads`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: isVideo ? "VIDEO" : "IMAGE",
        text: input.caption,
        [isVideo ? "video_url" : "image_url"]: input.assetUrl,
      }),
    },
  );
  const published = await json<{ id: string }>(
    `https://graph.threads.net/${metaGraphVersion()}/${resource.resourceId}/threads_publish`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id }),
    },
  );
  return { postId: published.id, publishedUrl: `https://www.threads.net/@${resource.accountName}` };
}

export async function publishToProvider(provider: string, input: PublishPayload) {
  switch (provider) {
    case "facebook":
      return publishFacebook(input);
    case "instagram":
      return publishInstagram(input);
    case "threads":
      return publishThreads(input);
    case "tiktok":
      return publishTikTokVideo(input);
    case "youtube":
      return publishYouTubeShort(input);
    case "google_business":
      return publishGoogleBusinessPost(input);
    default:
      throw new Error(`Publisher ${provider} tidak didukung.`);
  }
}

export async function fetchProviderAnalytics(provider: string, postId: string) {
  if (provider === "facebook") {
    const { token } = await getConnectedAccessToken("facebook", "page");
    const result = await json<{
      shares?: { count?: number };
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    }>(
      `https://graph.facebook.com/${metaGraphVersion()}/${postId}?fields=shares,reactions.limit(0).summary(true),comments.limit(0).summary(true)&access_token=${encodeURIComponent(token)}`,
      {},
    );
    return {
      shares: result.shares?.count ?? 0,
      reactions: result.reactions?.summary?.total_count ?? 0,
      comments: result.comments?.summary?.total_count ?? 0,
    };
  }
  if (provider === "instagram") {
    const { token } = await getConnectedAccessToken("instagram", "business_account");
    const result = await json<{ data?: Array<{ name: string; values?: Array<{ value?: number }> }> }>(
      `https://graph.facebook.com/${metaGraphVersion()}/${postId}/insights?metric=reach,likes,comments,saved,shares,views&access_token=${encodeURIComponent(token)}`,
      {},
    );
    return Object.fromEntries(
      (result.data ?? []).map((metric) => [metric.name, Number(metric.values?.[0]?.value ?? 0)]),
    );
  }
  if (provider === "youtube") {
    const { token } = await googleAccessToken("youtube");
    const result = await json<{
      items?: Array<{ statistics?: Record<string, string> }>;
    }>(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(postId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return Object.fromEntries(
      Object.entries(result.items?.[0]?.statistics ?? {}).map(([key, value]) => [
        key,
        Number(value),
      ]),
    );
  }
  return {};
}

export function verifyMetaWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.META_CLIENT_SECRET?.trim() || process.env.META_APP_SECRET?.trim();
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const actual = Buffer.from(signature.slice(7), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type MetaWebhookPublishEvent = {
  providerPostId: string;
  platform: "facebook" | "instagram";
  status: "published" | "failed";
  error?: string;
  eventType?: string;
};

export function extractMetaPublishEvents(payload: unknown): MetaWebhookPublishEvent[] {
  const root = payload as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          post_id?: string;
          media_id?: string;
          id?: string;
          item?: string;
          verb?: string;
          error?: { message?: string };
          status?: string;
        };
      }>;
    }>;
  };
  const events: MetaWebhookPublishEvent[] = [];
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const providerPostId = value.post_id || value.media_id || value.id;
      if (!providerPostId) continue;
      const failed = Boolean(value.error) || value.status === "failed" || value.verb === "failed";
      events.push({
        providerPostId,
        platform: root.object === "instagram" ? "instagram" : "facebook",
        status: failed ? "failed" : "published",
        error: value.error?.message,
        eventType: [change.field, value.item, value.verb, value.status].filter(Boolean).join(":"),
      });
    }
  }
  return events;
}
