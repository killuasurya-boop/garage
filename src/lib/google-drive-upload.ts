import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createSign,
  randomBytes,
  randomUUID,
} from "crypto";
import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { googleDriveConnections } from "@/db/schema";

const driveFileScope = "https://www.googleapis.com/auth/drive.file";
const defaultTokenUri = "https://oauth2.googleapis.com/token";
const googleAuthorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleUserInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";

type ServiceAccountConfig = {
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
  tokenUri: string;
};

type GoogleOAuthTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
  name?: string;
};

export type GoogleDriveUploadResult = {
  id: string;
  name: string;
  webViewLink?: string;
  webContentLink?: string;
  authMode?: "service_account" | "google_oauth";
};

export function googleDriveReportConfigStatus() {
  const serviceAccount = readServiceAccountConfig();
  const folderId = process.env.GOOGLE_DRIVE_REPORTS_FOLDER_ID?.trim() || null;
  const oauthClientConfigured = googleOAuthClientConfigured();

  return {
    configured: Boolean(serviceAccount && folderId),
    folderIdConfigured: Boolean(folderId),
    serviceAccountConfigured: Boolean(serviceAccount),
    serviceAccountEmail: serviceAccount?.clientEmail ?? null,
    oauthClientConfigured,
  };
}

export function googleOAuthClientConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
  );
}

export function googleDriveRedirectUri(origin: string) {
  return (
    process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI?.trim() ||
    new URL("/api/ai/drive/oauth/callback", origin).toString()
  );
}

export function buildGoogleDriveAuthorizeUrl(input: {
  origin: string;
  state: string;
}) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID belum dikonfigurasi.");
  }

  const url = new URL(googleAuthorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleDriveRedirectUri(input.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    [driveFileScope, "openid", "email", "profile"].join(" "),
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);

  return url.toString();
}

export function signGoogleDriveState(input: {
  userId: string;
  returnTo?: string;
}) {
  const payload = {
    userId: input.userId,
    returnTo: input.returnTo ?? "/",
    nonce: randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const encoded = base64Url(JSON.stringify(payload));
  const signature = base64Url(
    createHmac("sha256", googleSecret()).update(encoded).digest(),
  );

  return `${encoded}.${signature}`;
}

export function verifyGoogleDriveState(value: string) {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) {
    throw new Error("State Google Drive tidak valid.");
  }

  const expected = base64Url(
    createHmac("sha256", googleSecret()).update(encoded).digest(),
  );
  if (expected !== signature) {
    throw new Error("Signature Google Drive tidak valid.");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    userId?: string;
    returnTo?: string;
    exp?: number;
  };
  if (!payload.userId || !payload.exp || payload.exp < Date.now()) {
    throw new Error("State Google Drive expired.");
  }

  return {
    userId: payload.userId,
    returnTo: sanitizeReturnTo(payload.returnTo),
  };
}

function sanitizeReturnTo(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function googleSecret() {
  return (
    process.env.GOOGLE_DRIVE_OAUTH_STATE_SECRET?.trim() ||
    process.env.AI_CONFIG_ENCRYPTION_KEY?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "garage-google-drive-oauth-dev-secret"
  );
}

function encryptionSecret() {
  return (
    process.env.GOOGLE_DRIVE_OAUTH_ENCRYPTION_KEY?.trim() ||
    process.env.AI_CONFIG_ENCRYPTION_KEY?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim()
  );
}

function encryptionKey() {
  const secret = encryptionSecret();
  if (!secret) {
    throw new Error(
      "GOOGLE_DRIVE_OAUTH_ENCRYPTION_KEY atau AI_CONFIG_ENCRYPTION_KEY belum dikonfigurasi.",
    );
  }

  return createHash("sha256").update(secret).digest();
}

function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${payload.toString(
    "base64",
  )}`;
}

function decryptToken(value: string) {
  const [version, ivRaw, tagRaw, payloadRaw] = value.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !payloadRaw) {
    throw new Error("Format token Google Drive tidak valid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(payloadRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function readServiceAccountConfig(): ServiceAccountConfig | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as {
        client_email?: string;
        private_key?: string;
        private_key_id?: string;
        token_uri?: string;
      };

      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email,
          privateKey: normalizePrivateKey(parsed.private_key),
          privateKeyId: parsed.private_key_id,
          tokenUri: parsed.token_uri ?? defaultTokenUri,
        };
      }
    } catch {
      return null;
    }
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKey) {
    return null;
  }

  return {
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
    privateKeyId: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID?.trim(),
    tokenUri: process.env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI?.trim() ?? defaultTokenUri,
  };
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function requestServiceAccountAccessToken(serviceAccount: ServiceAccountConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    ...(serviceAccount.privateKeyId ? { kid: serviceAccount.privateKeyId } : {}),
  };
  const claimSet = {
    iss: serviceAccount.clientEmail,
    scope: driveFileScope,
    aud: serviceAccount.tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claimSet),
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const jwt = `${unsignedJwt}.${base64Url(signer.sign(serviceAccount.privateKey))}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const response = await fetch(serviceAccount.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json().catch(() => null)) as
    | GoogleOAuthTokenPayload
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description ??
        payload?.error ??
        "Google OAuth token tidak bisa dibuat.",
    );
  }

  return payload.access_token;
}

async function exchangeGoogleDriveCode(input: {
  code: string;
  origin: string;
}) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID/SECRET belum dikonfigurasi.");
  }

  const response = await fetch(defaultTokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleDriveRedirectUri(input.origin),
      grant_type: "authorization_code",
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | GoogleOAuthTokenPayload
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description ??
        payload?.error ??
        "Login Google Drive gagal menukar authorization code.",
    );
  }

  return payload;
}

async function refreshGoogleDriveToken(row: typeof googleDriveConnections.$inferSelect) {
  if (!row.refreshTokenEncrypted) {
    throw new Error("Refresh token Google Drive tidak tersedia. Connect ulang Google Drive.");
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID/SECRET belum dikonfigurasi.");
  }

  const response = await fetch(defaultTokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptToken(row.refreshTokenEncrypted),
      grant_type: "refresh_token",
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | GoogleOAuthTokenPayload
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description ??
        payload?.error ??
        "Refresh token Google Drive gagal.",
    );
  }

  const expiresAt = new Date(Date.now() + (payload.expires_in ?? 3600) * 1000);
  await getDb()
    .update(googleDriveConnections)
    .set({
      accessTokenEncrypted: encryptToken(payload.access_token),
      expiresAt,
      scope: payload.scope ?? row.scope,
      lastStatus: "connected",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(googleDriveConnections.id, row.id));

  return payload.access_token;
}

async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(googleUserInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return {};
  }

  return (await response.json().catch(() => ({}))) as GoogleUserInfo;
}

export async function saveGoogleDriveOAuthConnection(input: {
  userId: string;
  code: string;
  origin: string;
}) {
  const token = await exchangeGoogleDriveCode({
    code: input.code,
    origin: input.origin,
  });
  const profile = await fetchGoogleUserInfo(token.access_token ?? "");
  const existing = await getGoogleDriveConnection(input.userId);
  const refreshToken =
    token.refresh_token ??
    (existing?.refreshTokenEncrypted
      ? decryptToken(existing.refreshTokenEncrypted)
      : null);
  if (!refreshToken) {
    throw new Error(
      "Google tidak mengirim refresh token. Klik connect ulang dan pilih consent.",
    );
  }

  const now = new Date();
  const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000);

  await getDb()
    .insert(googleDriveConnections)
    .values({
      userId: input.userId,
      googleEmail: profile.email ?? existing?.googleEmail ?? null,
      googleName: profile.name ?? existing?.googleName ?? null,
      accessTokenEncrypted: encryptToken(token.access_token ?? ""),
      refreshTokenEncrypted: encryptToken(refreshToken),
      scope: token.scope ?? existing?.scope ?? null,
      tokenType: token.token_type ?? "Bearer",
      expiresAt,
      connectedAt: now,
      lastStatus: "connected",
      lastError: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleDriveConnections.userId,
      set: {
        googleEmail: profile.email ?? existing?.googleEmail ?? null,
        googleName: profile.name ?? existing?.googleName ?? null,
        accessTokenEncrypted: encryptToken(token.access_token ?? ""),
        refreshTokenEncrypted: encryptToken(refreshToken),
        scope: token.scope ?? existing?.scope ?? null,
        tokenType: token.token_type ?? "Bearer",
        expiresAt,
        connectedAt: now,
        lastStatus: "connected",
        lastError: null,
        updatedAt: now,
      },
    });
}

export async function getGoogleDriveConnection(userId: string) {
  const [row] = await getDb()
    .select()
    .from(googleDriveConnections)
    .where(eq(googleDriveConnections.userId, userId))
    .limit(1);

  return row ?? null;
}

async function getDefaultGoogleDriveConnection() {
  const [row] = await getDb()
    .select()
    .from(googleDriveConnections)
    .orderBy(desc(googleDriveConnections.updatedAt))
    .limit(1);

  return row ?? null;
}

export async function disconnectGoogleDrive(userId: string) {
  await getDb()
    .delete(googleDriveConnections)
    .where(eq(googleDriveConnections.userId, userId));
}

async function accessTokenForConnection(row: typeof googleDriveConnections.$inferSelect) {
  if (
    row.accessTokenEncrypted &&
    row.expiresAt &&
    row.expiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptToken(row.accessTokenEncrypted);
  }

  return refreshGoogleDriveToken(row);
}

export async function googleDriveOAuthStatus(input: {
  userId?: string;
  origin: string;
}) {
  const serviceAccount = readServiceAccountConfig();
  const folderId = process.env.GOOGLE_DRIVE_REPORTS_FOLDER_ID?.trim() || null;
  const connection = input.userId
    ? await getGoogleDriveConnection(input.userId)
    : await getDefaultGoogleDriveConnection();
  const oauthConnected = Boolean(connection);
  const oauthClientConfigured = googleOAuthClientConfigured();
  const serviceReady = Boolean(serviceAccount && folderId);
  const authMode: "service_account" | "google_oauth" | "missing" = oauthConnected
    ? "google_oauth"
    : serviceReady
      ? "service_account"
      : "missing";

  return {
    configured: serviceReady || oauthConnected,
    authMode,
    oauthClientConfigured,
    oauthConnected,
    oauthEmail: connection?.googleEmail ?? null,
    oauthName: connection?.googleName ?? null,
    connectedAt: connection?.connectedAt.toISOString() ?? null,
    lastStatus: connection?.lastStatus ?? null,
    lastError: connection?.lastError ?? null,
    lastUploadAt: connection?.lastUploadAt?.toISOString() ?? null,
    folderIdConfigured: Boolean(folderId),
    serviceAccountConfigured: Boolean(serviceAccount),
    serviceAccountEmail: serviceAccount?.clientEmail ?? null,
    redirectUri: googleDriveRedirectUri(input.origin),
    message: oauthConnected
      ? `Google Drive terhubung sebagai ${connection?.googleEmail ?? "akun Google"}.`
      : serviceReady
        ? "Google Drive siap via service account."
        : oauthClientConfigured
          ? "Klik Connect Google Drive untuk memberi akses upload."
          : "Isi GOOGLE_OAUTH_CLIENT_ID dan GOOGLE_OAUTH_CLIENT_SECRET untuk login Google Drive.",
  };
}

async function uploadWithAccessToken(input: {
  accessToken: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  authMode: "service_account" | "google_oauth";
}) {
  const folderId = process.env.GOOGLE_DRIVE_REPORTS_FOLDER_ID?.trim();
  const metadata: Record<string, unknown> = {
    name: input.fileName,
    mimeType: input.mimeType,
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = `garage-ai-report-${randomUUID()}`;
  const multipartBody = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata,
      )}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
    ),
    input.buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const url = new URL("https://www.googleapis.com/upload/drive/v3/files");
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("fields", "id,name,webViewLink,webContentLink");
  if (process.env.GOOGLE_DRIVE_SUPPORTS_ALL_DRIVES === "true") {
    url.searchParams.set("supportsAllDrives", "true");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(multipartBody.byteLength),
    },
    body: multipartBody,
  });
  const payload = (await response.json().catch(() => null)) as
    | (GoogleDriveUploadResult & { error?: { message?: string } })
    | null;

  if (!response.ok || !payload?.id) {
    throw new Error(
      payload?.error?.message ??
        "Upload laporan GARAGE AI ke Google Drive gagal.",
    );
  }

  return {
    ...payload,
    authMode: input.authMode,
  } satisfies GoogleDriveUploadResult;
}

export async function uploadBufferToGoogleDrive(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  userId?: string;
}) {
  const connection = input.userId
    ? (await getGoogleDriveConnection(input.userId)) ??
      (await getDefaultGoogleDriveConnection())
    : await getDefaultGoogleDriveConnection();
  if (connection) {
    try {
      const accessToken = await accessTokenForConnection(connection);
      const result = await uploadWithAccessToken({
        accessToken,
        fileName: input.fileName,
        mimeType: input.mimeType,
        buffer: input.buffer,
        authMode: "google_oauth",
      });
      await getDb()
        .update(googleDriveConnections)
        .set({
          lastStatus: "uploaded",
          lastError: null,
          lastUploadAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(googleDriveConnections.id, connection.id));
      return result;
    } catch (error) {
      await getDb()
        .update(googleDriveConnections)
        .set({
          lastStatus: "error",
          lastError: error instanceof Error ? error.message.slice(0, 500) : "Upload gagal.",
          updatedAt: new Date(),
        })
        .where(eq(googleDriveConnections.id, connection.id));
      throw error;
    }
  }

  const serviceAccount = readServiceAccountConfig();
  const folderId = process.env.GOOGLE_DRIVE_REPORTS_FOLDER_ID?.trim();
  if (!serviceAccount || !folderId) {
    throw new Error(
      "Google Drive belum terhubung. Connect Google Drive atau isi service account + folder ID.",
    );
  }

  return uploadWithAccessToken({
    accessToken: await requestServiceAccountAccessToken(serviceAccount),
    fileName: input.fileName,
    mimeType: input.mimeType,
    buffer: input.buffer,
    authMode: "service_account",
  });
}
