import "dotenv/config";

import { ensureDatabaseReady } from "@/db";
import { upsertIntegrationResource } from "@/lib/garage-integrations";
import { assertYoutubeChannelIdentity } from "@/lib/garage-google-integrations";

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} belum dikonfigurasi.`);
  return value;
}

async function main() {
  const refreshToken = env("LEGACY_YOUTUBE_REFRESH_TOKEN");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const token = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error_description?: string;
  };
  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description || `Refresh token legacy ditolak (${response.status}).`);
  }
  const channelResponse = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  const channel = (await channelResponse.json()) as {
    items?: Array<{ id: string; snippet?: { title?: string } }>;
  };
  const identity = channel.items?.[0];
  if (!channelResponse.ok || !identity) throw new Error("Channel YouTube legacy tidak ditemukan.");
  assertYoutubeChannelIdentity(process.env.YOUTUBE_CHANNEL_ID, identity.id);

  await ensureDatabaseReady();
  await upsertIntegrationResource({
    provider: "youtube",
    resourceType: "channel",
    resourceId: identity.id,
    accountName: identity.snippet?.title ?? "GARAGE",
    accessToken: token.access_token,
    refreshToken,
    tokenExpiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000)
      : null,
    scopes: token.scope?.split(" ").filter(Boolean) ?? [],
    status: "connected",
    metadata: { migratedFromLegacy: true, migratedAt: new Date().toISOString() },
  });
  process.stdout.write(`YouTube channel ${identity.id} berhasil dimigrasikan.\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Migrasi YouTube gagal."}\n`,
  );
  process.exitCode = 1;
});
