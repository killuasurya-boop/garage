import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { socialPublisherConnections } from "@/db/schema";
import { decryptSocialToken, encryptSocialToken } from "@/lib/social-publisher-crypto";

export const INTEGRATION_PROVIDERS = [
  "facebook",
  "instagram",
  "threads",
  "whatsapp",
  "tiktok",
  "youtube",
  "google_maps",
  "google_business",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];
export type IntegrationStatus =
  | "not_configured"
  | "connecting"
  | "connected"
  | "expiring"
  | "error"
  | "review_required";

export type IntegrationReadiness = {
  ready: boolean;
  canPublish: boolean;
  checks: Array<{
    key: string;
    label: string;
    ok: boolean;
    severity: "info" | "warning" | "error";
  }>;
};

const LABELS: Record<IntegrationProvider, string> = {
  facebook: "Facebook Page",
  instagram: "Instagram Business",
  threads: "Threads",
  whatsapp: "WhatsApp Cloud API",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_maps: "Google Maps & Places",
  google_business: "Google Business Profile",
};

const REQUIRED_ENV: Record<IntegrationProvider, string[]> = {
  facebook: ["META_CLIENT_ID", "META_CLIENT_SECRET"],
  instagram: ["META_CLIENT_ID", "META_CLIENT_SECRET"],
  threads: ["THREADS_CLIENT_ID", "THREADS_CLIENT_SECRET"],
  whatsapp: ["WHATSAPP_CLOUD_API_TOKEN", "WHATSAPP_CLOUD_PHONE_NUMBER_ID"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  youtube: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
  google_maps: [
    "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY",
    "GOOGLE_MAPS_SERVER_KEY",
    "GARAGE_GOOGLE_PLACE_ID",
  ],
  google_business: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
};

const REQUIRED_RESOURCE_TYPES: Partial<Record<IntegrationProvider, string[]>> = {
  facebook: ["page"],
  instagram: ["business_account"],
  threads: ["profile"],
  whatsapp: ["phone_number"],
  tiktok: ["creator"],
  youtube: ["channel"],
  google_maps: ["place"],
  google_business: ["business_account"],
};

export const SOCIAL_PUBLISHING_PROVIDERS = [
  "facebook",
  "instagram",
  "threads",
  "tiktok",
  "youtube",
  "google_business",
] as const satisfies IntegrationProvider[];

export type IntegrationResourceInput = {
  provider: IntegrationProvider;
  resourceType: string;
  resourceId: string;
  accountId?: string | null;
  accountName?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  scopes?: string[];
  status?: IntegrationStatus;
  metadata?: Record<string, unknown>;
  connectedBy?: string | null;
  permissionsCheckedAt?: Date | null;
};

export function sanitizeIntegrationResource(row: typeof socialPublisherConnections.$inferSelect) {
  const expiring =
    row.tokenExpiresAt &&
    row.tokenExpiresAt.getTime() > Date.now() &&
    row.tokenExpiresAt.getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000;
  return {
    id: row.id,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    accountId: row.accountId,
    accountName: row.accountName,
    scopes: row.scopes,
    status: expiring ? "expiring" : row.status,
    tokenExpiresAt: row.tokenExpiresAt,
    lastHealthCheckAt: row.lastHealthCheckAt,
    lastError: row.lastError,
    metadata: row.metadata,
  };
}

export function missingProviderEnv(provider: IntegrationProvider) {
  return REQUIRED_ENV[provider].filter((name) => !process.env[name]?.trim());
}

export function buildIntegrationReadiness(input: {
  provider: IntegrationProvider;
  configured: boolean;
  resources: Array<ReturnType<typeof sanitizeIntegrationResource>>;
}) {
  const requiredTypes = REQUIRED_RESOURCE_TYPES[input.provider] ?? [];
  const missingEnv = missingProviderEnv(input.provider);
  const connectedResources = input.resources.filter((resource) =>
    ["connected", "expiring"].includes(resource.status),
  );
  const missingResources = requiredTypes.filter(
    (type) =>
      !input.resources.some(
        (resource) =>
          resource.resourceType === type && ["connected", "expiring"].includes(resource.status),
      ),
  );
  const expiring = connectedResources.some((resource) => resource.status === "expiring");
  const healthOk =
    connectedResources.length > 0 &&
    connectedResources.every((resource) => Boolean(resource.lastHealthCheckAt));
  const hasError = input.resources.some(
    (resource) => resource.status === "error" || Boolean(resource.lastError),
  );
  const reviewRequired =
    input.provider === "threads" && connectedResources.length === 0
      ? true
      : input.resources.some((resource) => resource.status === "review_required");
  const canPublish =
    input.configured &&
    missingEnv.length === 0 &&
    missingResources.length === 0 &&
    !hasError &&
    !reviewRequired;

  return {
    ready: canPublish && healthOk && !expiring,
    canPublish,
    checks: [
      {
        key: "env",
        label: missingEnv.length
          ? `Env belum lengkap: ${missingEnv.join(", ")}`
          : "Environment server lengkap",
        ok: missingEnv.length === 0,
        severity: "error",
      },
      {
        key: "resource",
        label: missingResources.length
          ? `Resource belum terhubung: ${missingResources.join(", ")}`
          : "Resource tujuan tersedia",
        ok: missingResources.length === 0,
        severity: "error",
      },
      {
        key: "permission",
        label: reviewRequired ? "Permission/app review masih dibutuhkan" : "Permission publish valid",
        ok: !reviewRequired,
        severity: "warning",
      },
      {
        key: "expiry",
        label: expiring ? "Token akan segera expired" : "Token tidak masuk masa expiring",
        ok: !expiring,
        severity: "warning",
      },
      {
        key: "health",
        label: healthOk ? "Health check sudah hijau" : "Health check belum hijau",
        ok: healthOk,
        severity: "warning",
      },
      {
        key: "error",
        label: hasError ? "Ada error terakhir pada resource" : "Tidak ada error terakhir",
        ok: !hasError,
        severity: "error",
      },
    ],
  } satisfies IntegrationReadiness;
}

export async function upsertIntegrationResource(input: IntegrationResourceInput) {
  const values = {
    provider: input.provider,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    accountId: input.accountId ?? input.resourceId,
    accountName: input.accountName ?? null,
    accessTokenEncrypted: input.accessToken ? encryptSocialToken(input.accessToken) : null,
    refreshTokenEncrypted: input.refreshToken ? encryptSocialToken(input.refreshToken) : null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    refreshExpiresAt: input.refreshExpiresAt ?? null,
    scopes: input.scopes ?? [],
    status: input.status ?? "connected",
    metadata: input.metadata ?? {},
    lastError: null,
    connectedBy: input.connectedBy ?? null,
    permissionsCheckedAt: input.permissionsCheckedAt ?? null,
    updatedAt: new Date(),
  };

  const [resource] = await getDb()
    .insert(socialPublisherConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [
        socialPublisherConnections.provider,
        socialPublisherConnections.resourceType,
        socialPublisherConnections.resourceId,
      ],
      set: values,
    })
    .returning();
  return resource;
}

export async function getIntegrationResource(
  provider: IntegrationProvider,
  resourceType?: string,
) {
  const filters = [eq(socialPublisherConnections.provider, provider)];
  if (resourceType) filters.push(eq(socialPublisherConnections.resourceType, resourceType));
  const [resource] = await getDb()
    .select()
    .from(socialPublisherConnections)
    .where(and(...filters))
    .limit(1);
  return resource ?? null;
}

export async function getConnectedAccessToken(
  provider: IntegrationProvider,
  resourceType?: string,
) {
  const filters = [
    eq(socialPublisherConnections.provider, provider),
    inArray(socialPublisherConnections.status, ["connected", "expiring"]),
  ];
  if (resourceType) filters.push(eq(socialPublisherConnections.resourceType, resourceType));
  const [resource] = await getDb()
    .select()
    .from(socialPublisherConnections)
    .where(and(...filters))
    .limit(1);
  if (!resource) {
    throw new Error(`${LABELS[provider]} belum terhubung.`);
  }
  if (!resource.accessTokenEncrypted) {
    throw new Error(`Token ${LABELS[provider]} tidak tersedia.`);
  }
  return { token: decryptSocialToken(resource.accessTokenEncrypted), resource };
}

function configured(provider: IntegrationProvider) {
  return missingProviderEnv(provider).length === 0;
}

export async function listIntegrations() {
  const rows = await getDb().select().from(socialPublisherConnections);

  return INTEGRATION_PROVIDERS.map((provider) => {
    const resources = rows
      .filter((row) => row.provider === provider)
      .map(sanitizeIntegrationResource);

    let status: IntegrationStatus = configured(provider) ? "connecting" : "not_configured";
    if (provider === "threads" && resources.length === 0) status = "review_required";
    if (resources.some((resource) => resource.status === "error")) status = "error";
    else if (resources.some((resource) => resource.status === "expiring")) status = "expiring";
    else if (resources.some((resource) => resource.status === "review_required")) {
      status = "review_required";
    }
    else if (resources.some((resource) => resource.status === "connected")) status = "connected";

    return {
      provider,
      label: LABELS[provider],
      status,
      configured: configured(provider),
      resources,
      readiness: buildIntegrationReadiness({
        provider,
        configured: configured(provider),
        resources,
      }),
    };
  });
}

export type IntegrationListItem = Awaited<ReturnType<typeof listIntegrations>>[number];

export function buildPublishingReadinessReport(
  integrations: IntegrationListItem[],
  providers: readonly IntegrationProvider[] = SOCIAL_PUBLISHING_PROVIDERS,
) {
  const providerSet = new Set(providers);
  const scoped = integrations.filter((item) => providerSet.has(item.provider));
  const blockers = scoped.flatMap((item) =>
    item.readiness.checks
      .filter((check) => !check.ok && check.severity === "error")
      .map((check) => ({
        provider: item.provider,
        label: item.label,
        check: check.key,
        message: check.label,
      })),
  );
  const warnings = scoped.flatMap((item) =>
    item.readiness.checks
      .filter((check) => !check.ok && check.severity !== "error")
      .map((check) => ({
        provider: item.provider,
        label: item.label,
        check: check.key,
        message: check.label,
      })),
  );
  const notReady = scoped.filter((item) => !item.readiness.ready);

  return {
    liveEnabled: process.env.SOCIAL_PUBLISHING_LIVE_ENABLED?.trim().toLowerCase() === "true",
    ready: notReady.length === 0,
    canPublish: scoped.every((item) => item.readiness.canPublish),
    checkedProviders: scoped.map((item) => item.provider),
    blockers,
    warnings,
    notReady: notReady.map((item) => ({
      provider: item.provider,
      label: item.label,
      status: item.status,
    })),
  };
}

export async function getPublishingReadinessReport(providers?: readonly IntegrationProvider[]) {
  return buildPublishingReadinessReport(await listIntegrations(), providers);
}

export async function disconnectIntegration(provider: IntegrationProvider) {
  const rows = await getDb()
    .select()
    .from(socialPublisherConnections)
    .where(eq(socialPublisherConnections.provider, provider));
  for (const row of rows) {
    if (!row.accessTokenEncrypted) continue;
    const token = decryptSocialToken(row.accessTokenEncrypted);
    try {
      if (provider === "youtube" || provider === "google_business") {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
          method: "POST",
          cache: "no-store",
        });
      } else if (provider === "facebook" || provider === "instagram") {
        await fetch(
          `https://graph.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || "v23.0"}/me/permissions?access_token=${encodeURIComponent(token)}`,
          { method: "DELETE", cache: "no-store" },
        );
      } else if (provider === "tiktok") {
        const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
        if (clientKey && clientSecret) {
          await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_key: clientKey,
              client_secret: clientSecret,
              token,
            }),
            cache: "no-store",
          });
        }
      } else if (provider === "threads") {
        await fetch(
          `https://graph.threads.net/me/permissions?access_token=${encodeURIComponent(token)}`,
          { method: "DELETE", cache: "no-store" },
        );
      }
    } catch {
      // Local disconnect must still remove an unusable or already-revoked token.
    }
  }
  return getDb()
    .delete(socialPublisherConnections)
    .where(eq(socialPublisherConnections.provider, provider))
    .returning({ id: socialPublisherConnections.id });
}

export async function recordIntegrationHealth(input: {
  provider: IntegrationProvider;
  resourceId: string;
  ok: boolean;
  error?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [row] = await getDb()
    .update(socialPublisherConnections)
    .set({
      status: input.ok ? "connected" : "error",
      lastHealthCheckAt: new Date(),
      lastError: input.ok ? null : input.error?.slice(0, 1000) || "Health check gagal.",
      metadata: input.metadata,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(socialPublisherConnections.provider, input.provider),
        eq(socialPublisherConnections.resourceId, input.resourceId),
      ),
    )
    .returning();
  return row ?? null;
}
