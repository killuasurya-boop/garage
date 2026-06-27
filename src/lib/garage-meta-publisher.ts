import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { socialPublisherConnections } from "@/db/schema";
import { getConnectedAccessToken, upsertIntegrationResource } from "@/lib/garage-integrations";
import {
  signSocialOAuthState,
  verifySocialOAuthState,
} from "@/lib/social-publisher-crypto";

type GraphError = { error?: { message?: string; code?: number } };
type MetaTokenResponse = GraphError & { access_token?: string; expires_in?: number };
type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

const FACEBOOK_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
] as const;
const INSTAGRAM_PERMISSIONS = ["instagram_basic", "instagram_content_publish"] as const;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} belum dikonfigurasi.`);
  return value;
}

export function metaGraphVersion() {
  return process.env.META_GRAPH_VERSION?.trim() || "v23.0";
}

function graphUrl(path: string) {
  return `https://graph.facebook.com/${metaGraphVersion()}${path}`;
}

function publicBaseUrl() {
  return (
    process.env.GARAGE_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.trim() ||
    "https://app.garagecoffee.id"
  ).replace(/\/+$/, "");
}

export function metaRedirectUri() {
  return `${publicBaseUrl()}/api/integrations/meta/callback`;
}

export function metaClientConfigured() {
  return Boolean(process.env.META_CLIENT_ID?.trim() && process.env.META_CLIENT_SECRET?.trim());
}

export function buildMetaAuthorizationUrl(input: { userId: string; returnTo: string }) {
  const state = signSocialOAuthState(input);
  const url = new URL(`https://www.facebook.com/${metaGraphVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", requiredEnv("META_CLIENT_ID"));
  url.searchParams.set(
    "scope",
    [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
      "business_management",
    ].join(","),
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", metaRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

export { verifySocialOAuthState as verifyMetaOAuthState };

async function graphJson<T>(url: string | URL, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const result = (await response.json()) as T & GraphError;
  if (!response.ok || result.error) {
    throw new Error(result.error?.message || `Meta Graph API gagal (${response.status}).`);
  }
  return result;
}

async function fetchLongLivedToken(code: string) {
  const tokenUrl = new URL(graphUrl("/oauth/access_token"));
  tokenUrl.searchParams.set("client_id", requiredEnv("META_CLIENT_ID"));
  tokenUrl.searchParams.set("client_secret", requiredEnv("META_CLIENT_SECRET"));
  tokenUrl.searchParams.set("redirect_uri", metaRedirectUri());
  tokenUrl.searchParams.set("code", code);
  const short = await graphJson<MetaTokenResponse>(tokenUrl);
  if (!short.access_token) throw new Error("Meta tidak mengembalikan access token.");

  const exchangeUrl = new URL(graphUrl("/oauth/access_token"));
  exchangeUrl.searchParams.set("grant_type", "fb_exchange_token");
  exchangeUrl.searchParams.set("client_id", requiredEnv("META_CLIENT_ID"));
  exchangeUrl.searchParams.set("client_secret", requiredEnv("META_CLIENT_SECRET"));
  exchangeUrl.searchParams.set("fb_exchange_token", short.access_token);
  const long = await graphJson<MetaTokenResponse>(exchangeUrl);
  if (!long.access_token) throw new Error("Meta tidak mengembalikan long-lived token.");
  return long;
}

async function fetchGrantedPermissions(accessToken: string) {
  const url = new URL(graphUrl("/me/permissions"));
  url.searchParams.set("access_token", accessToken);
  const result = await graphJson<{
    data?: Array<{ permission?: string; status?: string }>;
  }>(url);
  return (result.data ?? [])
    .filter((permission) => permission.status === "granted" && permission.permission)
    .map((permission) => permission.permission!);
}

function missingPermissions(granted: string[], required: readonly string[]) {
  return required.filter((permission) => !granted.includes(permission));
}

export async function saveMetaOAuthConnection(input: { code: string; userId: string }) {
  const token = await fetchLongLivedToken(input.code);
  const grantedPermissions = await fetchGrantedPermissions(token.access_token!);
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000)
    : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const pagesUrl = new URL(graphUrl("/me/accounts"));
  pagesUrl.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username}",
  );
  pagesUrl.searchParams.set("access_token", token.access_token!);
  const pages = await graphJson<{ data: MetaPage[] }>(pagesUrl);
  if (!pages.data.length) throw new Error("Tidak ada Facebook Page yang dapat dikelola akun ini.");

  await getDb()
    .delete(socialPublisherConnections)
    .where(inArray(socialPublisherConnections.provider, ["facebook", "instagram"]));
  const configuredPageId = process.env.META_FACEBOOK_PAGE_ID?.trim();
  const autoSelectedPageId =
    configuredPageId && pages.data.some((page) => page.id === configuredPageId)
      ? configuredPageId
      : pages.data.length === 1
        ? pages.data[0].id
        : null;

  for (const page of pages.data) {
    const selected = page.id === autoSelectedPageId;
    const facebookMissing = missingPermissions(grantedPermissions, FACEBOOK_PERMISSIONS);
    await upsertIntegrationResource({
      provider: "facebook",
      resourceType: "page",
      resourceId: page.id,
      accountName: page.name,
      accessToken: page.access_token,
      tokenExpiresAt: expiresAt,
      scopes: grantedPermissions,
      status: selected
        ? facebookMissing.length
          ? "review_required"
          : "connected"
        : "connecting",
      permissionsCheckedAt: new Date(),
      metadata: {
        selected,
        linkedInstagramId: page.instagram_business_account?.id ?? null,
        missingPermissions: facebookMissing,
      },
      connectedBy: input.userId,
    });

    if (page.instagram_business_account) {
      const instagramMissing = missingPermissions(grantedPermissions, INSTAGRAM_PERMISSIONS);
      await upsertIntegrationResource({
        provider: "instagram",
        resourceType: "business_account",
        resourceId: page.instagram_business_account.id,
        accountName: page.instagram_business_account.username ?? "garage_tbt.id",
        accessToken: page.access_token,
        tokenExpiresAt: expiresAt,
        scopes: grantedPermissions,
        status: selected
          ? instagramMissing.length
            ? "review_required"
            : "connected"
          : "connecting",
        permissionsCheckedAt: new Date(),
        metadata: {
          selected,
          facebookPageId: page.id,
          missingPermissions: instagramMissing,
        },
        connectedBy: input.userId,
      });
    }
  }

  return {
    pages: pages.data.map((page) => ({
      id: page.id,
      name: page.name,
      instagram: page.instagram_business_account ?? null,
      selected: page.id === autoSelectedPageId,
    })),
    selectionRequired: !autoSelectedPageId,
  };
}

export async function selectMetaPage(pageId: string) {
  const db = getDb();
  const resources = await db
    .select()
    .from(socialPublisherConnections)
    .where(inArray(socialPublisherConnections.provider, ["facebook", "instagram"]));
  const page = resources.find(
    (resource) => resource.provider === "facebook" && resource.resourceId === pageId,
  );
  if (!page) throw new Error("Facebook Page candidate tidak ditemukan.");
  const metadata = (page.metadata ?? {}) as {
    linkedInstagramId?: string | null;
    missingPermissions?: string[];
  };

  for (const resource of resources) {
    const selected =
      (resource.provider === "facebook" && resource.resourceId === pageId) ||
      (resource.provider === "instagram" &&
        resource.resourceId === metadata.linkedInstagramId);
    const resourceMetadata = (resource.metadata ?? {}) as {
      missingPermissions?: string[];
    };
    await db
      .update(socialPublisherConnections)
      .set({
        status: selected
          ? resourceMetadata.missingPermissions?.length
            ? "review_required"
            : "connected"
          : "connecting",
        metadata: { ...resourceMetadata, selected },
        updatedAt: new Date(),
      })
      .where(eq(socialPublisherConnections.id, resource.id));
  }
  return {
    pageId,
    instagramId: metadata.linkedInstagramId ?? null,
  };
}

export async function getMetaConnectionStatus() {
  const [facebook, instagram] = await Promise.all([
    getConnectedAccessToken("facebook", "page").then(({ resource }) => resource).catch(() => null),
    getConnectedAccessToken("instagram", "business_account")
      .then(({ resource }) => resource)
      .catch(() => null),
  ]);
  return {
    status: facebook && instagram ? "connected" : facebook ? "review_required" : "not_configured",
    accountId: instagram?.accountId ?? facebook?.accountId ?? null,
    accountName: instagram?.accountName ?? facebook?.accountName ?? null,
  };
}

export async function testMetaResource(provider: "facebook" | "instagram") {
  const type = provider === "facebook" ? "page" : "business_account";
  const { token, resource } = await getConnectedAccessToken(provider, type);
  const granted = await fetchGrantedPermissions(token);
  const required = provider === "facebook" ? FACEBOOK_PERMISSIONS : INSTAGRAM_PERMISSIONS;
  const missing = missingPermissions(granted, required);
  if (missing.length) {
    throw new Error(`Permission ${provider} belum lengkap: ${missing.join(", ")}.`);
  }
  const url = new URL(graphUrl(`/${resource.resourceId}`));
  url.searchParams.set("fields", provider === "facebook" ? "id,name" : "id,username");
  url.searchParams.set("access_token", token);
  return graphJson<Record<string, unknown>>(url);
}

export async function publishFacebook(input: { assetUrl: string; caption: string }) {
  const { token, resource } = await getConnectedAccessToken("facebook", "page");
  const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(input.assetUrl);
  const endpoint = isVideo ? "videos" : "photos";
  const response = await graphJson<{ id: string; post_id?: string }>(
    graphUrl(`/${resource.resourceId}/${endpoint}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        [isVideo ? "file_url" : "url"]: input.assetUrl,
        [isVideo ? "description" : "caption"]: input.caption,
        published: true,
      }),
    },
  );
  const postId = response.post_id || response.id;
  return {
    postId,
    publishedUrl: `https://www.facebook.com/${resource.resourceId}/posts/${postId}`,
  };
}

export async function publishInstagram(input: {
  assetUrl: string;
  assetUrls?: string[];
  caption: string;
}) {
  const { token, resource } = await getConnectedAccessToken("instagram", "business_account");
  const carouselAssets = [input.assetUrl, ...(input.assetUrls ?? [])].filter(
    (value, index, values) => value && values.indexOf(value) === index,
  );
  if (carouselAssets.length > 1) {
    const children = [];
    for (const assetUrl of carouselAssets.slice(0, 10)) {
      const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(assetUrl);
      const child = await graphJson<{ id: string }>(
        graphUrl(`/${resource.resourceId}/media`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: token,
            is_carousel_item: true,
            ...(isVideo
              ? { media_type: "VIDEO", video_url: assetUrl }
              : { image_url: assetUrl }),
          }),
        },
      );
      children.push(child.id);
    }
    const carousel = await graphJson<{ id: string }>(
      graphUrl(`/${resource.resourceId}/media`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: token,
          media_type: "CAROUSEL",
          caption: input.caption,
          children,
        }),
      },
    );
    const published = await graphJson<{ id: string }>(
      graphUrl(`/${resource.resourceId}/media_publish`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, creation_id: carousel.id }),
      },
    );
    return {
      postId: published.id,
      publishedUrl: "https://www.instagram.com/garage_tbt.id/",
    };
  }
  const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(input.assetUrl);
  const container = await graphJson<{ id: string }>(
    graphUrl(`/${resource.resourceId}/media`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        caption: input.caption,
        ...(isVideo
          ? { media_type: "REELS", video_url: input.assetUrl, share_to_feed: true }
          : { image_url: input.assetUrl }),
      }),
    },
  );
  if (isVideo) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const statusUrl = new URL(graphUrl(`/${container.id}`));
      statusUrl.searchParams.set("fields", "status_code");
      statusUrl.searchParams.set("access_token", token);
      const status = await graphJson<{ status_code?: string }>(statusUrl);
      if (status.status_code === "FINISHED") break;
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw new Error(`Instagram media processing ${status.status_code}.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  const published = await graphJson<{ id: string }>(
    graphUrl(`/${resource.resourceId}/media_publish`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token, creation_id: container.id }),
    },
  );
  return {
    postId: published.id,
    publishedUrl: `https://www.instagram.com/garage_tbt.id/`,
  };
}
