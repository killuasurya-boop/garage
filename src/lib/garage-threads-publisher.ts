import { upsertIntegrationResource } from "@/lib/garage-integrations";
import {
  signSocialOAuthState,
  verifySocialOAuthState,
} from "@/lib/social-publisher-crypto";

type ThreadsToken = {
  access_token?: string;
  user_id?: string | number;
  expires_in?: number;
  error_message?: string;
};

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

export function threadsRedirectUri() {
  return `${baseUrl()}/api/integrations/threads/callback`;
}

export function buildThreadsAuthorizationUrl(input: { userId: string; returnTo: string }) {
  const url = new URL("https://threads.net/oauth/authorize");
  url.searchParams.set("client_id", env("THREADS_CLIENT_ID"));
  url.searchParams.set("redirect_uri", threadsRedirectUri());
  url.searchParams.set("scope", "threads_basic,threads_content_publish,threads_manage_insights");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", signSocialOAuthState(input));
  return url.toString();
}

export { verifySocialOAuthState as verifyThreadsOAuthState };

async function threadsJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const result = (await response.json()) as T & { error_message?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(result.error?.message || result.error_message || `Threads API gagal (${response.status}).`);
  }
  return result;
}

export async function saveThreadsOAuthConnection(input: { code: string; userId: string }) {
  const short = await threadsJson<ThreadsToken>("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("THREADS_CLIENT_ID"),
      client_secret: env("THREADS_CLIENT_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: threadsRedirectUri(),
      code: input.code,
    }),
  });
  if (!short.access_token || !short.user_id) throw new Error("Threads tidak mengembalikan token.");

  const exchange = new URL("https://graph.threads.net/access_token");
  exchange.searchParams.set("grant_type", "th_exchange_token");
  exchange.searchParams.set("client_secret", env("THREADS_CLIENT_SECRET"));
  exchange.searchParams.set("access_token", short.access_token);
  const long = await threadsJson<ThreadsToken>(exchange.toString());
  if (!long.access_token) throw new Error("Threads long-lived token tidak tersedia.");

  const profile = await threadsJson<{ id: string; username?: string }>(
    `https://graph.threads.net/me?fields=id,username&access_token=${encodeURIComponent(long.access_token)}`,
  );
  await upsertIntegrationResource({
    provider: "threads",
    resourceType: "profile",
    resourceId: profile.id,
    accountName: profile.username ?? "GARAGE",
    accessToken: long.access_token,
    tokenExpiresAt: long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000)
      : null,
    scopes: ["threads_basic", "threads_content_publish", "threads_manage_insights"],
    connectedBy: input.userId,
  });
  return profile;
}
