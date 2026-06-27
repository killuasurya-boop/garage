import { getIntegrationResource, upsertIntegrationResource } from "@/lib/garage-integrations";
import {
  decryptSocialToken,
  encryptSocialToken,
  signSocialOAuthState,
  verifySocialOAuthState,
} from "@/lib/social-publisher-crypto";
import { getDb } from "@/db";
import { socialPublisherConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

type GoogleToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error_description?: string;
};

export function assertYoutubeChannelIdentity(expected: string | undefined, actual: string) {
  if (expected?.trim() && expected.trim() !== actual) {
    throw new Error("Channel YouTube tidak sesuai dengan YOUTUBE_CHANNEL_ID GARAGE.");
  }
}

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} belum dikonfigurasi.`);
  return value;
}

function baseUrl() {
  return (
    process.env.GARAGE_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.trim() ||
    "https://app.garagecoffee.id"
  ).replace(/\/+$/, "");
}

export function googleRedirectUri(provider: "youtube" | "google_business") {
  return `${baseUrl()}/api/integrations/${provider}/callback`;
}

export function buildGoogleAuthorizationUrl(input: {
  provider: "youtube" | "google_business";
  userId: string;
  returnTo: string;
}) {
  const scopes =
    input.provider === "youtube"
      ? ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"]
      : ["https://www.googleapis.com/auth/business.manage"];
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env("GOOGLE_OAUTH_CLIENT_ID"));
  url.searchParams.set("redirect_uri", googleRedirectUri(input.provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set(
    "state",
    signSocialOAuthState({
      userId: input.userId,
      returnTo: `${input.returnTo}${input.returnTo.includes("?") ? "&" : "?"}provider=${input.provider}`,
    }),
  );
  return url.toString();
}

export { verifySocialOAuthState as verifyGoogleOAuthState };

async function tokenRequest(values: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
    cache: "no-store",
  });
  const result = (await response.json()) as GoogleToken;
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || `Google OAuth gagal (${response.status}).`);
  }
  return result;
}

async function googleJson<T>(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const result = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || `Google API gagal (${response.status}).`);
  return result;
}

export async function saveGoogleOAuthConnection(input: {
  provider: "youtube" | "google_business";
  code: string;
  userId: string;
}) {
  const token = await tokenRequest({
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: googleRedirectUri(input.provider),
  });
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
  const scopes = token.scope?.split(" ").filter(Boolean) ?? [];

  if (input.provider === "youtube") {
    const channel = await googleJson<{
      items?: Array<{ id: string; snippet?: { title?: string } }>;
    }>("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", token.access_token!);
    const identity = channel.items?.[0];
    if (!identity) throw new Error("Channel YouTube tidak ditemukan.");
    assertYoutubeChannelIdentity(process.env.YOUTUBE_CHANNEL_ID, identity.id);
    await upsertIntegrationResource({
      provider: "youtube",
      resourceType: "channel",
      resourceId: identity.id,
      accountName: identity.snippet?.title ?? "GARAGE",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt: expiresAt,
      scopes,
      connectedBy: input.userId,
    });
    return identity;
  }

  const accounts = await googleJson<{
    accounts?: Array<{ name: string; accountName?: string }>;
  }>("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", token.access_token!);
  const account = accounts.accounts?.[0];
  if (!account) throw new Error("Google Business Profile account tidak ditemukan.");
  await upsertIntegrationResource({
    provider: "google_business",
    resourceType: "business_account",
    resourceId: account.name,
    accountName: account.accountName ?? "GARAGE",
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenExpiresAt: expiresAt,
    scopes,
    status: process.env.GOOGLE_BUSINESS_LOCATION_ID?.trim() ? "connected" : "review_required",
    connectedBy: input.userId,
  });
  return account;
}

export async function googleAccessToken(provider: "youtube" | "google_business") {
  const resourceType = provider === "youtube" ? "channel" : "business_account";
  const resource = await getIntegrationResource(provider, resourceType);
  if (!resource?.accessTokenEncrypted) throw new Error(`${provider} belum terhubung.`);
  if (!resource.tokenExpiresAt || resource.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return { token: decryptSocialToken(resource.accessTokenEncrypted), resource };
  }
  if (!resource.refreshTokenEncrypted) throw new Error(`Refresh token ${provider} tidak tersedia.`);
  const refreshed = await tokenRequest({
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
    refresh_token: decryptSocialToken(resource.refreshTokenEncrypted),
    grant_type: "refresh_token",
  });
  await getDb()
    .update(socialPublisherConnections)
    .set({
      accessTokenEncrypted: encryptSocialToken(refreshed.access_token!),
      tokenExpiresAt: refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(socialPublisherConnections.id, resource.id));
  return { token: refreshed.access_token!, resource };
}

export async function testGoogleProvider(provider: "youtube" | "google_business") {
  const { token } = await googleAccessToken(provider);
  return provider === "youtube"
    ? googleJson("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", token)
    : googleJson("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", token);
}

export async function publishYouTubeShort(input: { assetUrl: string; title: string; caption: string }) {
  const { token, resource } = await googleAccessToken("youtube");
  const asset = await fetch(input.assetUrl, { cache: "no-store" });
  if (!asset.ok) throw new Error(`Asset YouTube tidak dapat diambil (${asset.status}).`);
  const video = Buffer.from(await asset.arrayBuffer());
  const metadata = {
    snippet: { title: input.title.slice(0, 100), description: input.caption, categoryId: "22" },
    status: { privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS?.trim() || "private" },
  };
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": asset.headers.get("content-type") || "video/mp4",
        "X-Upload-Content-Length": String(video.byteLength),
      },
      body: JSON.stringify(metadata),
    },
  );
  const uploadUrl = init.headers.get("location");
  if (!init.ok || !uploadUrl) throw new Error(`Inisialisasi YouTube gagal (${init.status}).`);
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": asset.headers.get("content-type") || "video/mp4",
      "Content-Length": String(video.byteLength),
    },
    body: video,
  });
  const result = (await upload.json()) as { id?: string; error?: { message?: string } };
  if (!upload.ok || !result.id) throw new Error(result.error?.message || "Upload YouTube gagal.");
  return {
    postId: result.id,
    publishedUrl: `https://www.youtube.com/watch?v=${result.id}`,
    channelId: resource.resourceId,
  };
}

export async function publishGoogleBusinessPost(input: { caption: string; assetUrl?: string }) {
  const { token, resource } = await googleAccessToken("google_business");
  const locationId = env("GOOGLE_BUSINESS_LOCATION_ID");
  await validateGoogleBusinessProfile();
  const body = {
    languageCode: "id",
    summary: input.caption.slice(0, 1500),
    topicType: "STANDARD",
    ...(input.assetUrl ? { media: [{ mediaFormat: "PHOTO", sourceUrl: input.assetUrl }] } : {}),
  };
  const response = await fetch(
    `https://mybusiness.googleapis.com/v4/${resource.resourceId}/locations/${locationId}/localPosts`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const result = (await response.json()) as { name?: string; searchUrl?: string; error?: { message?: string } };
  if (!response.ok || !result.name) {
    throw new Error(result.error?.message || `Google Business post gagal (${response.status}).`);
  }
  return { postId: result.name, publishedUrl: result.searchUrl || "" };
}

export async function validateGoogleBusinessProfile() {
  const { token } = await googleAccessToken("google_business");
  const rawLocationId = env("GOOGLE_BUSINESS_LOCATION_ID");
  const locationName = rawLocationId.startsWith("locations/")
    ? rawLocationId
    : `locations/${rawLocationId}`;
  const url = new URL(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}`,
  );
  url.searchParams.set(
    "readMask",
    "name,title,storefrontAddress,regularHours,metadata,websiteUri,phoneNumbers",
  );
  const result = await googleJson<Record<string, unknown>>(url.toString(), token);
  return {
    validateOnly: true,
    valid: true,
    location: result,
  };
}
