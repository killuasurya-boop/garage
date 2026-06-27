import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { socialPublisherConnections } from "@/db/schema";
import { upsertIntegrationResource } from "@/lib/garage-integrations";
import {
  decryptSocialToken,
  encryptSocialToken,
  signSocialOAuthState,
  verifySocialOAuthState,
} from "@/lib/social-publisher-crypto";

const PLATFORM = "tiktok";

type TikTokTokenResponse = {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type TikTokResponse<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

type TikTokCreatorInfo = {
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
};

type TikTokInitData = {
  publish_id: string;
  upload_url: string;
};

type TikTokStatusData = {
  status: "FAILED" | "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "PUBLISH_COMPLETE";
  fail_reason?: string;
  publicaly_available_post_id?: Array<string | number>;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} belum dikonfigurasi.`);
  return value;
}

function publicBaseUrl() {
  return (
    process.env.GARAGE_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.trim() ||
    "https://app.garagecoffee.id"
  ).replace(/\/+$/, "");
}

export function tiktokRedirectUri() {
  return `${publicBaseUrl()}/api/integrations/tiktok/callback`;
}

export function tiktokClientConfigured() {
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim(),
  );
}

export function buildTikTokAuthorizationUrl(input: { userId: string; returnTo: string }) {
  const state = signSocialOAuthState(input);
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", requiredEnv("TIKTOK_CLIENT_KEY"));
  url.searchParams.set("scope", "user.info.basic,video.upload,video.publish");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", tiktokRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

export { verifySocialOAuthState as verifyTikTokOAuthState };

async function fetchTokens(values: Record<string, string>) {
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
    cache: "no-store",
  });
  const result = (await response.json()) as TikTokTokenResponse;
  if (!response.ok || result.error || !result.access_token) {
    throw new Error(
      `TikTok OAuth gagal: ${result.error_description ?? result.error ?? response.status}`,
    );
  }
  return result;
}

async function tiktokApi<T>(path: string, accessToken: string, body: object) {
  const response = await fetch(`https://open.tiktokapis.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = (await response.json()) as TikTokResponse<T>;
  if (!response.ok || result.error?.code !== "ok" || !result.data) {
    throw new Error(
      `TikTok API gagal: ${result.error?.code ?? response.status} ${
        result.error?.message ?? ""
      }`.trim(),
    );
  }
  return result.data;
}

export async function saveTikTokOAuthConnection(input: {
  code: string;
  userId: string;
}) {
  const token = await fetchTokens({
    client_key: requiredEnv("TIKTOK_CLIENT_KEY"),
    client_secret: requiredEnv("TIKTOK_CLIENT_SECRET"),
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: tiktokRedirectUri(),
  });

  const creator = await tiktokApi<TikTokCreatorInfo>(
    "/v2/post/publish/creator_info/query/",
    token.access_token!,
    {},
  );
  const now = Date.now();
  await upsertIntegrationResource({
    provider: PLATFORM,
    resourceType: "creator",
    resourceId: token.open_id ?? creator.creator_username,
    accountId: token.open_id ?? null,
    accountName: creator.creator_username || creator.creator_nickname,
    accessToken: token.access_token!,
    refreshToken: token.refresh_token,
    tokenExpiresAt: token.expires_in
      ? new Date(now + token.expires_in * 1000)
      : null,
    refreshExpiresAt: token.refresh_expires_in
      ? new Date(now + token.refresh_expires_in * 1000)
      : null,
    scopes: token.scope?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? [],
    status: "connected",
    metadata: {
      nickname: creator.creator_nickname,
      privacyLevels: creator.privacy_level_options,
    },
    connectedBy: input.userId,
  });

  return {
    username: creator.creator_username,
    nickname: creator.creator_nickname,
  };
}

async function connectedAccessToken() {
  const db = getDb();
  const [connection] = await db
    .select()
    .from(socialPublisherConnections)
    .where(eq(socialPublisherConnections.provider, PLATFORM))
    .limit(1);

  if (!connection || connection.status !== "connected" || !connection.accessTokenEncrypted) {
    throw new Error("Akun TikTok GARAGE belum terhubung.");
  }

  const shouldRefresh =
    connection.refreshTokenEncrypted &&
    (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000);
  if (!shouldRefresh) return decryptSocialToken(connection.accessTokenEncrypted);

  const refreshed = await fetchTokens({
    client_key: requiredEnv("TIKTOK_CLIENT_KEY"),
    client_secret: requiredEnv("TIKTOK_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: decryptSocialToken(connection.refreshTokenEncrypted!),
  });
  const now = Date.now();
  await db
    .update(socialPublisherConnections)
    .set({
      accessTokenEncrypted: encryptSocialToken(refreshed.access_token!),
      refreshTokenEncrypted: refreshed.refresh_token
        ? encryptSocialToken(refreshed.refresh_token)
        : connection.refreshTokenEncrypted,
      tokenExpiresAt: refreshed.expires_in
        ? new Date(now + refreshed.expires_in * 1000)
        : null,
      refreshExpiresAt: refreshed.refresh_expires_in
        ? new Date(now + refreshed.refresh_expires_in * 1000)
        : connection.refreshExpiresAt,
      scopes: refreshed.scope?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? connection.scopes,
      updatedAt: new Date(),
    })
    .where(eq(socialPublisherConnections.id, connection.id));

  return refreshed.access_token!;
}

export async function getTikTokConnectionStatus() {
  const db = getDb();
  const [connection] = await db
    .select({
      accountId: socialPublisherConnections.accountId,
      accountName: socialPublisherConnections.accountName,
      scopes: socialPublisherConnections.scopes,
      status: socialPublisherConnections.status,
      updatedAt: socialPublisherConnections.updatedAt,
    })
    .from(socialPublisherConnections)
    .where(eq(socialPublisherConnections.provider, PLATFORM))
    .limit(1);
  return connection ?? null;
}

export async function publishTikTokVideo(input: {
  assetUrl: string;
  caption: string;
}) {
  const token = await connectedAccessToken();
  const creator = await tiktokApi<TikTokCreatorInfo>(
    "/v2/post/publish/creator_info/query/",
    token,
    {},
  );
  const privacy = process.env.TIKTOK_PRIVACY_LEVEL?.trim() || "SELF_ONLY";
  if (!creator.privacy_level_options.includes(privacy)) {
    throw new Error(`Privasi TikTok ${privacy} tidak tersedia untuk akun ini.`);
  }

  const asset = await fetch(input.assetUrl, { cache: "no-store" });
  if (!asset.ok) throw new Error(`Asset TikTok tidak dapat diambil (${asset.status}).`);
  const contentType = asset.headers.get("content-type")?.split(";")[0] ?? "video/mp4";
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(contentType)) {
    throw new Error(`Format video TikTok tidak didukung: ${contentType}`);
  }
  const video = Buffer.from(await asset.arrayBuffer());
  const maxBytes = Number(process.env.TIKTOK_MAX_VIDEO_BYTES ?? 200_000_000);
  if (video.byteLength > maxBytes) {
    throw new Error(`Video TikTok melebihi batas ${maxBytes} byte.`);
  }

  const initialized = await tiktokApi<TikTokInitData>(
    "/v2/post/publish/video/init/",
    token,
    {
      post_info: {
        title: input.caption.slice(0, 2200),
        privacy_level: privacy,
        disable_duet: creator.duet_disabled,
        disable_comment: creator.comment_disabled,
        disable_stitch: creator.stitch_disabled,
        brand_content_toggle: false,
        brand_organic_toggle: true,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: video.byteLength,
        chunk_size: video.byteLength,
        total_chunk_count: 1,
      },
    },
  );

  const upload = await fetch(initialized.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(video.byteLength),
      "Content-Range": `bytes 0-${video.byteLength - 1}/${video.byteLength}`,
    },
    body: video,
  });
  if (!upload.ok) throw new Error(`Upload binary TikTok gagal (${upload.status}).`);

  const attempts = Number(process.env.TIKTOK_STATUS_POLL_ATTEMPTS ?? 60);
  const intervalMs = Number(process.env.TIKTOK_STATUS_POLL_INTERVAL_MS ?? 5_000);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await tiktokApi<TikTokStatusData>(
      "/v2/post/publish/status/fetch/",
      token,
      { publish_id: initialized.publish_id },
    );
    if (status.status === "FAILED") {
      throw new Error(`TikTok processing gagal: ${status.fail_reason ?? "unknown"}`);
    }
    if (status.status === "PUBLISH_COMPLETE") {
      const postId = String(status.publicaly_available_post_id?.[0] ?? initialized.publish_id);
      return {
        postId,
        publishedUrl: status.publicaly_available_post_id?.length
          ? `https://www.tiktok.com/@${creator.creator_username}/video/${postId}`
          : `https://www.tiktok.com/@${creator.creator_username}`,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("TikTok belum menyelesaikan publish sebelum batas waktu.");
}
