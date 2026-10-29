import { sql } from "drizzle-orm";
import type { EventMenuGroup, EventOrderSnapshot } from "@/lib/event-menu-types";
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Runtime errors / unhandled exceptions — DB-backed scaffold.
// Upgradeable ke Sentry/Datadog: provider field bisa di-extend.
export const errorEvents = pgTable(
  "error_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // "api" | "client" | "job"
    route: text("route"),
    method: text("method"),
    userId: text("user_id"),
    userRole: text("user_role"),
    message: text("message").notNull(),
    stackTrace: text("stack_trace"),
    statusCode: integer("status_code"),
    requestId: text("request_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    fingerprint: text("fingerprint"), // hash buat group duplicate
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    resolved: boolean("resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
  },
  (table) => ({
    sourceIdx: index("error_events_source_idx").on(table.source),
    fingerprintIdx: index("error_events_fingerprint_idx").on(table.fingerprint),
    occurredAtIdx: index("error_events_occurred_at_idx").on(table.occurredAt),
    resolvedIdx: index("error_events_resolved_idx").on(table.resolved),
  }),
);

// Feedback collection — staff bisa report bug/UX issue saat pakai aplikasi.
export const feedbackEntries = pgTable(
  "feedback_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id"),
    userRole: text("user_role"),
    outletId: uuid("outlet_id"),
    category: text("category").notNull(), // bug | suggestion | praise | question
    priority: text("priority").notNull().default("medium"), // low | medium | high | critical
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    currentUrl: text("current_url"),
    userAgent: text("user_agent"),
    status: text("status").notNull().default("open"), // open | triaged | in_progress | resolved | wontfix
    triagedBy: text("triaged_by"),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("feedback_entries_status_idx").on(table.status),
    priorityIdx: index("feedback_entries_priority_idx").on(table.priority),
    categoryIdx: index("feedback_entries_category_idx").on(table.category),
    createdAtIdx: index("feedback_entries_created_at_idx").on(table.createdAt),
  }),
);

// Web Push subscriptions — per user/device.
// Endpoint + auth keys disimpan untuk kirim push lewat web-push (atau native).
// Trigger push aktif kalau setting notificationPushEnabled=true.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    keyP256dh: text("key_p256dh").notNull(),
    keyAuth: text("key_auth").notNull(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    failureCount: integer("failure_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("push_subscriptions_user_idx").on(table.userId),
    endpointIdx: uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint),
  }),
);

// Audit trail untuk login attempts — sukses & gagal. Dipake buat:
// 1) Lockout enforcement: cek jumlah failed dalam window terakhir per email
// 2) Security Center viewer: forensik kalau ada serangan brute force
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    success: boolean("success").notNull(),
    failureReason: text("failure_reason"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index("login_attempts_email_idx").on(table.email),
    attemptedAtIdx: index("login_attempts_attempted_at_idx").on(table.attemptedAt),
    emailAttemptedIdx: index("login_attempts_email_attempted_idx").on(
      table.email,
      table.attemptedAt,
    ),
  }),
);

// Better Auth twoFactor plugin storage — secret TOTP + backup codes per user.
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    // Kolom wajib plugin twoFactor Better Auth 1.6 — tanpa ini aktivasi 2FA
    // gagal 500 ("field verified does not exist"). Temuan QA-audit 2026-09-28.
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (table) => ({
    userIdx: index("two_factor_user_id_idx").on(table.userId),
  }),
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("session_user_id_idx").on(table.userId),
  }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("account_user_id_idx").on(table.userId),
  }),
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Rate limit Better Auth di DATABASE (audit 29 Okt 2026 #13): batas login & tebakan kode 2FA
// tidak ter-reset saat restart/deploy. Bentuk tabel mengikuti @better-auth/core (model "rateLimit").
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ── OAuth 2.1 untuk MCP ChatGPT (plugin jwt + @better-auth/mcp) ──────────────
// Dihasilkan dari generator schema @better-auth/drizzle-adapter 1.7.12 agar
// kolom persis sesuai plugin (pelajaran twoFactor: kolom kurang = 500). Hanya
// dipakai bila GARAGE_MCP_CHATGPT_ENABLED=true (lihat mcp-chatgpt-config.ts).
const tz = { withTimezone: true } as const;

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", tz).notNull(),
  expiresAt: timestamp("expires_at", tz),
  alg: text("alg"),
  crv: text("crv"),
});

export const oauthClient = pgTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    clientCredentialsScopes: text("client_credentials_scopes").array().default([]),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", tz),
    updatedAt: timestamp("updated_at", tz),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    userIdx: index("oauthClient_userId_idx").on(table.userId),
  }),
);

export const oauthResource = pgTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims"),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
  disabled: boolean("disabled").default(false),
  createdAt: timestamp("created_at", tz),
  updatedAt: timestamp("updated_at", tz),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata"),
});

export const oauthClientResource = pgTable(
  "oauth_client_resource",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", tz),
  },
  (table) => ({
    clientResourceUidx: uniqueIndex("oauthClientResource_clientId_resourceId_uidx").on(table.clientId, table.resourceId),
    clientIdx: index("oauthClientResource_clientId_idx").on(table.clientId),
    resourceIdx: index("oauthClientResource_resourceId_idx").on(table.resourceId),
  }),
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: timestamp("expires_at", tz),
    createdAt: timestamp("created_at", tz),
    revoked: timestamp("revoked", tz),
    rotatedAt: timestamp("rotated_at", tz),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", tz),
    authTime: timestamp("auth_time", tz),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (table) => ({
    clientIdx: index("oauthRefreshToken_clientId_idx").on(table.clientId),
    sessionIdx: index("oauthRefreshToken_sessionId_idx").on(table.sessionId),
    userIdx: index("oauthRefreshToken_userId_idx").on(table.userId),
    codeIdx: index("oauthRefreshToken_authorizationCodeId_idx").on(table.authorizationCodeId),
  }),
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", tz),
    createdAt: timestamp("created_at", tz),
    revoked: timestamp("revoked", tz),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (table) => ({
    clientIdx: index("oauthAccessToken_clientId_idx").on(table.clientId),
    sessionIdx: index("oauthAccessToken_sessionId_idx").on(table.sessionId),
    userIdx: index("oauthAccessToken_userId_idx").on(table.userId),
    codeIdx: index("oauthAccessToken_authorizationCodeId_idx").on(table.authorizationCodeId),
    refreshIdx: index("oauthAccessToken_refreshId_idx").on(table.refreshId),
  }),
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", tz),
    updatedAt: timestamp("updated_at", tz),
  },
  (table) => ({
    clientIdx: index("oauthConsent_clientId_idx").on(table.clientId),
    userIdx: index("oauthConsent_userId_idx").on(table.userId),
  }),
);

export const oauthClientAssertion = pgTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", tz).notNull(),
});

// Pengajuan akses staf (I3, PRD V4.0 §06.5–06.6, F44/F45). Mendaftar TIDAK membuat
// staff_profiles: pemohon tanpa profil ditolak semua API staf (STAFF_PROFILE_MISSING).
// Hanya Owner (2FA aktif) yang menyetujui; jabatan & outlet ditentukan Owner, bukan
// input pemohon. Satu pengajuan per akun; riwayat keputusan di audit_logs.
export const staffAccessRequests = pgTable(
  "staff_access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    // WhatsApp ternormalisasi E.164 (+62…). Verifikasi OTP menunggu I2 (D-05).
    phone: text("phone").notNull(),
    requestedPosition: text("requested_position").notNull(),
    note: text("note"),
    // pending_owner_approval | needs_info | approved | rejected
    status: text("status").notNull().default("pending_owner_approval"),
    emailVerified: boolean("email_verified").notNull().default(false),
    whatsappVerified: boolean("whatsapp_verified").notNull().default(false),
    infoRequest: text("info_request"),
    decisionReason: text("decision_reason"),
    approvedRole: text("approved_role"),
    approvedOutletId: uuid("approved_outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: uniqueIndex("staff_access_requests_user_idx").on(table.userId),
    statusIdx: index("staff_access_requests_status_idx").on(table.status, table.createdAt),
  }),
);

// Rate limit persisten (F-06): penghitung jendela tetap per kunci, dinaikkan
// atomik (INSERT … ON CONFLICT DO UPDATE). Bertahan saat restart & berlaku
// lintas proses/instance. Baris lama dihapus oportunistik (bukan data bisnis).
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.bucket, table.windowStart] }),
    windowIdx: index("rate_limit_counters_window_idx").on(table.windowStart),
  }),
);

// Operasi AI berisiko (R2/R3) lewat MCP ChatGPT: preview → konfirmasi Owner →
// eksekusi → receipt (PRD V4.0 §07.4–07.5, batch M2). Token konfirmasi sekali
// pakai: hanya hash nonce yang disimpan; klaim = UPDATE atomik status pending.
export const mcpOperations = pgTable(
  "mcp_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("chatgpt"),
    oauthClientId: text("oauth_client_id"),
    tool: text("tool").notNull(),
    risk: text("risk").notNull(),
    argsDigest: text("args_digest").notNull(),
    argsPreview: jsonb("args_preview").$type<Record<string, unknown>>().notNull(),
    nonceHash: text("nonce_hash").notNull(),
    // pending → confirmed (diklaim, sedang jalan) → executed | failed; confirmed tanpa
    // executed/failed = UNKNOWN (PRD P5: jangan klaim berhasil tanpa bukti).
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    resultSummary: jsonb("result_summary").$type<unknown>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("mcp_operations_user_id_idx").on(table.userId, table.createdAt),
  }),
);

export const outlets = pgTable("outlets", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// App settings — key-value JSON per outlet (atau global jika outletId null).
// Setiap key satu row; valueJson menyimpan struktur arbitrary.
// Lookup pattern: getDb().select().from(appSettings).where(eq(key, "tax.pb1Pct"))
export const appSettings = pgTable(
  "app_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueJson: jsonb("value_json").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletKeyIdx: uniqueIndex("app_settings_outlet_key_idx").on(
      table.outletId,
      table.key,
    ),
    keyIdx: index("app_settings_key_idx").on(table.key),
  }),
);

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    shiftLabel: text("shift_label").notNull().default("Shift aktif"),
    deviceLabel: text("device_label").notNull().default("POS-01"),
    division: text("division"),
    position: text("position"),
    status: text("status").notNull().default("active"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordResetRequired: boolean("password_reset_required").notNull().default(false),
    pinCode: text("pin_code"),
    // HMAC-SHA256 dari PIN (deterministik, bisa di-lookup). pinCode lama
    // dipertahankan untuk lazy-migration; verifikasi pakai pinHash bila ada.
    pinHash: text("pin_hash"),
    // Penugasan workstation Production Hub: "bar" | "dapur" | "all". NULL =
    // tidak ditugaskan produksi (mis. kasir di mesin kasir) → tidak boleh
    // MULAI/READY tiket. Owner/Manajer selalu boleh (override, tercatat audit).
    workstation: text("workstation"),
    // Kurir: "available" (siap antar) | "offline" (istirahat). Status
    // Ditugaskan/Mengantar diturunkan dari pesanan aktif (garage-courier).
    courierAvailability: text("courier_availability").notNull().default("offline"),
    courierAvailabilityAt: timestamp("courier_availability_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: uniqueIndex("staff_profiles_user_id_idx").on(table.userId),
    outletIdx: index("staff_profiles_outlet_id_idx").on(table.outletId),
    statusIdx: index("staff_profiles_status_idx").on(table.status),
  }),
);

// Data pribadi karyawan (profil 360°). 1:1 dengan staff_profiles. NIK & rekening
// hanya tampil penuh untuk Owner; Manajer melihat versi tersamar.
export const staffPersonal = pgTable(
  "staff_personal",
  {
    staffProfileId: uuid("staff_profile_id")
      .primaryKey()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    whatsapp: text("whatsapp"),
    address: text("address"),
    birthDate: date("birth_date"),
    gender: text("gender"),
    nik: text("nik"),
    bankName: text("bank_name"),
    bankAccountNumber: text("bank_account_number"),
    bankAccountName: text("bank_account_name"),
    emergencyName: text("emergency_name"),
    emergencyRelation: text("emergency_relation"),
    emergencyPhone: text("emergency_phone"),
    contractType: text("contract_type"),
    contractEnd: date("contract_end"),
    photoUrl: text("photo_url"),
    ktpUrl: text("ktp_url"),
    cvUrl: text("cv_url"),
    contractUrl: text("contract_url"),
    otherDocs: jsonb("other_docs").$type<Array<{ label: string; url: string }>>().notNull().default([]),
    notes: text("notes"),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// Master kategori produk jual (owner, Okt 2026) — dinamis, bukan daftar di kode.
// menu_items.category tetap menyimpan nama (snapshot tampilan & kompatibilitas);
// relasi resmi lewat menu_items.category_id. Kategori tidak pernah dihapus permanen:
// arsip (status "archived") + pindah produk supaya riwayat transaksi tetap utuh.
export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    // fnb | retail | operational — jenis bisnis kategori.
    kind: text("kind").notNull().default("fnb"),
    // Tipe default produk baru di kategori ini: menu | retail | bundle.
    defaultProductType: text("default_product_type").notNull().default("menu"),
    // Routing produksi default: bar | dapur | none (diserahkan kasir, tanpa tiket).
    station: text("station").notNull().default("dapur"),
    // Kelompok tombol POS: Dapur | Bar | Lainnya.
    posGroup: text("pos_group").notNull().default("Dapur"),
    // Prefix SKU otomatis (COF-001); kosong = GEN.
    skuPrefix: text("sku_prefix"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    // active | inactive | archived
    status: text("status").notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex("product_categories_name_idx").on(sql`lower(${table.name})`),
    statusIdx: index("product_categories_status_idx").on(table.status),
  }),
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    // SKU produk untuk kasir/inventory. Format kategori+urut (COF-001, FOOD-014).
    // Nullable supaya data lama tetap valid; di-backfill via migrasi. Unik bila terisi.
    sku: text("sku"),
    name: text("name").notNull(),
    category: text("category").notNull(),
    categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
    // menu = menu siap jual (resep/HPP), retail = barang jadi (rokok, mineral),
    // bundle = paket. Menentukan field form, HPP, dan kelengkapan data.
    productType: text("product_type").notNull().default("menu"),
    brand: text("brand"),
    // Barcode produk (EAN/UPC); unik bila terisi. Varian bisa punya barcode sendiri.
    barcode: text("barcode"),
    section: text("section").notNull(),
    stock: text("stock").notNull().default("ready"),
    status: text("status").notNull().default("active"),
    prep: text("prep").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // URL foto menu untuk tampilan menu digital (opsional). Kosong = pakai ikon kategori.
    imageUrl: text("image_url"),
    // Deskripsi singkat 1 baris untuk menu digital (mis. "Espresso, susu, gula aren").
    description: text("description"),
    // Promo per produk (harga tetap, toggle on/off). Aktif bila promoActive=true
    // dan promoPrice > 0; promoPrice meng-override harga varian saat POS/menu.
    promoActive: boolean("promo_active").notNull().default(false),
    promoPrice: integer("promo_price"),
    // Routing Production Hub: "bar" | "dapur". NULL = otomatis dari kategori
    // (Coffee/Non-Coffee → Bar, lainnya → Dapur).
    station: text("station"),
    // Boleh digabung Smart Batch dengan porsi produk sama dari order lain.
    batchEligible: boolean("batch_eligible").notNull().default(true),
    // Menu digital (QR /order): false = disembunyikan dari pelanggan, tetap jual di POS.
    showInDigitalMenu: boolean("show_in_digital_menu").notNull().default(true),
    // Menu unggulan → banner besar di atas menu digital.
    featured: boolean("featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    skuIdx: uniqueIndex("menu_items_sku_idx").on(table.sku),
    barcodeIdx: uniqueIndex("menu_items_barcode_idx").on(table.barcode),
    categoryIdIdx: index("menu_items_category_id_idx").on(table.categoryId),
  }),
);

export const menuVariants = pgTable(
  "menu_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: text("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    variantId: text("variant_id").notNull(),
    label: text("label").notNull(),
    price: integer("price").notNull(),
    baseCost: integer("base_cost").notNull().default(0),
    // SKU & barcode per varian (mis. rokok per bungkus vs per slop). Unik bila terisi.
    sku: text("sku"),
    barcode: text("barcode"),
    // Satuan jual varian (cup, porsi, bungkus, batang, botol) + isi dalam satuan dasar.
    sellUnit: text("sell_unit"),
    unitContents: real("unit_contents"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    itemVariantIdx: uniqueIndex("menu_variants_item_variant_idx").on(
      table.itemId,
      table.variantId,
    ),
    itemIdx: index("menu_variants_item_id_idx").on(table.itemId),
    skuIdx: uniqueIndex("menu_variants_sku_idx").on(table.sku),
    barcodeIdx: uniqueIndex("menu_variants_barcode_idx").on(table.barcode),
  }),
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull().unique(),
    tier: text("tier").notNull(),
    points: integer("points").notNull().default(0),
    visits: integer("visits").notNull().default(0),
    lastOrder: text("last_order").notNull().default("-"),
    flag: text("flag").notNull().default("-"),
    memberCode: text("member_code"),
    cardTier: text("card_tier").notNull().default("Silver"),
    membershipSince: timestamp("membership_since", { withTimezone: true }).notNull().defaultNow(),
    ultraCandidate: boolean("ultra_candidate").notNull().default(false),
    ultraApprovedAt: timestamp("ultra_approved_at", { withTimezone: true }),
    ultraApprovedBy: text("ultra_approved_by").references(() => user.id, { onDelete: "set null" }),
    staffNote: text("staff_note"),
    birthday: date("birthday"),
    referralCode: text("referral_code"),
    referredByCode: text("referred_by_code"),
    address: text("address"),
    photoUrl: text("photo_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Nomor WA sudah dicek aktif oleh staf (kasir menghubungi lewat wa.me).
    waVerifiedAt: timestamp("wa_verified_at", { withTimezone: true }),
    waVerifiedBy: text("wa_verified_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    referralCodeIdx: uniqueIndex("customers_referral_code_idx").on(table.referralCode),
    memberCodeIdx: uniqueIndex("customers_member_code_idx").on(table.memberCode),
    cardTierIdx: index("customers_card_tier_idx").on(table.cardTier),
    ultraCandidateIdx: index("customers_ultra_candidate_idx").on(table.ultraCandidate),
    expiresAtIdx: index("customers_expires_at_idx").on(table.expiresAt),
  }),
);

// WiFi gratis khusus member (MikroTik Hotspot): siapa memakai WiFi & kapan.
export const wifiAccessLogs = pgTable(
  "wifi_access_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    mac: text("mac"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("wifi_access_logs_customer_idx").on(table.customerId),
    createdIdx: index("wifi_access_logs_created_idx").on(table.createdAt),
  }),
);

export const customerTags = pgTable(
  "customer_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("customer_tags_customer_id_idx").on(table.customerId),
    tagIdx: index("customer_tags_tag_idx").on(table.tag),
  }),
);

export const memberAccounts = pgTable(
  "member_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: uniqueIndex("member_accounts_customer_id_idx").on(table.customerId),
    phoneIdx: uniqueIndex("member_accounts_phone_idx").on(table.phone),
    emailIdx: uniqueIndex("member_accounts_email_idx").on(table.email),
    statusIdx: index("member_accounts_status_idx").on(table.status),
  }),
);

export const memberSessions = pgTable(
  "member_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => memberAccounts.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountIdx: index("member_sessions_account_id_idx").on(table.accountId),
    refreshIdx: uniqueIndex("member_sessions_refresh_token_hash_idx").on(table.refreshTokenHash),
    expiresIdx: index("member_sessions_expires_at_idx").on(table.expiresAt),
  }),
);

export const memberTransactions = pgTable(
  "member_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    // Order asal poin — supaya void/refund bisa menarik poin order tsb. Null
    // untuk transaksi non-order (penyesuaian manual, referral lama).
    orderId: uuid("order_id").references((): AnyPgColumn => orders.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
    pointsEarned: integer("points_earned").notNull(),
    levelBefore: text("level_before").notNull(),
    levelAfter: text("level_after").notNull(),
    upgradeNotification: text("upgrade_notification"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("member_transactions_customer_id_idx").on(table.customerId),
    sourceIdx: index("member_transactions_source_idx").on(table.source),
    createdIdx: index("member_transactions_created_at_idx").on(table.createdAt),
  }),
);

export const pointRedemptions = pgTable(
  "point_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    pointsUsed: integer("points_used").notNull(),
    discount: integer("discount").notNull(),
    // Pakai poin saat bayar (owner, Okt 2026): terikat ke order supaya bisa
    // dikembalikan saat void/refund/tolak. source: POS | QR | MEMBER_APP | CRM.
    orderId: uuid("order_id").references((): AnyPgColumn => orders.id, { onDelete: "set null" }),
    source: text("source").notNull().default("MEMBER_APP"),
    status: text("status").notNull().default("redeemed"), // redeemed | returned
    returnedPoints: integer("returned_points").notNull().default(0),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("point_redemptions_customer_id_idx").on(table.customerId),
    orderIdx: index("point_redemptions_order_id_idx").on(table.orderId),
    createdIdx: index("point_redemptions_created_at_idx").on(table.createdAt),
  }),
);

export const posTerminals = pgTable(
  "pos_terminals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    terminalCode: text("terminal_code").notNull().unique(),
    location: text("location").notNull(),
    apiKeyHash: text("api_key_hash").notNull().unique(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("pos_terminals_terminal_code_idx").on(table.terminalCode),
    keyIdx: uniqueIndex("pos_terminals_api_key_hash_idx").on(table.apiKeyHash),
    statusIdx: index("pos_terminals_status_idx").on(table.status),
  }),
);

// API key agent AI (OpenClaw / Hermes via WhatsApp & Telegram). Key mentah hanya
// ditampilkan sekali saat dibuat; yang disimpan hanya hash sha256. Agent bertindak
// atas nama Owner pembuat (actingUserId) dengan scope owner | manajer | readonly.
export const agentApiKeys = pgTable(
  "agent_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    scope: text("scope").notNull().default("readonly"),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "cascade" }),
    actingUserId: text("acting_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastUsedIp: text("last_used_ip"),
    useCount: integer("use_count").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("agent_api_keys_key_hash_idx").on(table.keyHash),
    outletIdx: index("agent_api_keys_outlet_idx").on(table.outletId),
  }),
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNo: text("order_no").notNull().unique(),
    eventId: uuid("event_id").references((): AnyPgColumn => events.id, { onDelete: "restrict" }),
    // Nomor antrian harian (reset tiap hari, per outlet) — nomor pendek yang mudah
    // dicek: tampil di struk & papan Siap. Nullable untuk baris lama.
    queueNo: integer("queue_no"),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    tableLabel: text("table_label").notNull().default("T-12"),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("paid"),
    subtotal: integer("subtotal").notNull(),
    service: integer("service").notNull(),
    tax: integer("tax").notNull(),
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull(),
    orderSource: text("order_source").notNull().default("pos"),
    customerMode: text("customer_mode").notNull().default("cashier"),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    customerNote: text("customer_note"),
    campaign: text("campaign"),
    // Order online: "dine-in" | "takeaway" | "delivery" (null = order POS/lama).
    // Take away & delivery WAJIB lunas sebelum masuk produksi.
    fulfillment: text("fulfillment"),
    // Delivery: alamat + patokan, ongkir (Rp, di luar service/pajak), status antar
    // ("preparing" | "picked_up" | "on_the_way" | "delivered"; null = belum/ bukan delivery).
    deliveryAddress: text("delivery_address"),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    deliveryStatus: text("delivery_status"),
    // Kurir yang ditugaskan kasir (akun Waiter workstation "kurir") + posisi GPS
    // terakhirnya (hanya selama pengantaran; dihapus saat selesai demi privasi).
    courierUserId: text("courier_user_id").references(() => user.id, { onDelete: "set null" }),
    courierName: text("courier_name"),
    courierLat: numeric("courier_lat", { precision: 9, scale: 6, mode: "number" }),
    courierLng: numeric("courier_lng", { precision: 9, scale: 6, mode: "number" }),
    courierLocationAt: timestamp("courier_location_at", { withTimezone: true }),
    // Lokasi pelanggan (opsional, dibagikan saat checkout delivery).
    customerLat: numeric("customer_lat", { precision: 9, scale: 6, mode: "number" }),
    customerLng: numeric("customer_lng", { precision: 9, scale: 6, mode: "number" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    // Foto bukti terkirim (wajib saat kurir menandai "Sudah sampai").
    deliveryProofUrl: text("delivery_proof_url"),
    // Bukti transfer/QRIS yang diunggah pelanggan dari menu digital (privat, lewat API staf).
    paymentProofUrl: text("payment_proof_url"),
    paymentProofAt: timestamp("payment_proof_at", { withTimezone: true }),
    whatsappInvoiceStatus: text("whatsapp_invoice_status").notNull().default("not_sent"),
    whatsappInvoiceUrl: text("whatsapp_invoice_url"),
    invoiceTrackingToken: text("invoice_tracking_token"),
    invoicePdfPath: text("invoice_pdf_path"),
    invoicePdfUrl: text("invoice_pdf_url"),
    invoicePdfGeneratedAt: timestamp("invoice_pdf_generated_at", { withTimezone: true }),
    acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    rejectedBy: text("rejected_by").references(() => user.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    // Bill hasil "pisah bill per produk" menunjuk ke order meja asalnya.
    parentOrderId: uuid("parent_order_id"),
    // Kunci anti-dobel dari kasir ("<userId>:<X-Idempotency-Key>"). Unik di DB
    // → tombol Bayar diulang (juga setelah server restart) tidak membuat order kedua.
    clientRequestKey: text("client_request_key"),
    clientRequestFingerprint: text("client_request_fingerprint"),
    // Arsip invoice (Owner/Manajer): hanya menyembunyikan dari daftar bawaan —
    // laporan, stok, kas, dan pembayaran tidak berubah. Bisa dipulihkan.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by").references(() => user.id, { onDelete: "set null" }),
    archiveReason: text("archive_reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clientRequestKeyIdx: uniqueIndex("orders_client_request_key_idx").on(table.clientRequestKey),
    parentOrderIdx: index("orders_parent_order_id_idx").on(table.parentOrderId),
    customerIdx: index("orders_customer_id_idx").on(table.customerId),
    statusIdx: index("orders_status_idx").on(table.status),
    outletIdx: index("orders_outlet_id_idx").on(table.outletId),
    sourceIdx: index("orders_order_source_idx").on(table.orderSource),
    eventIdx: index("orders_event_id_idx").on(table.eventId),
    customerPhoneIdx: index("orders_customer_phone_idx").on(table.customerPhone),
    invoiceTrackingTokenIdx: uniqueIndex("orders_invoice_tracking_token_idx").on(table.invoiceTrackingToken),
    outletCreatedIdx: index("orders_outlet_created_idx").on(table.outletId, table.createdAt),
    statusCreatedIdx: index("orders_status_created_idx").on(table.status, table.createdAt),
    archivedIdx: index("orders_archived_at_idx").on(table.archivedAt),
  }),
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id").references(() => menuItems.id, {
      onDelete: "set null",
    }),
    variantId: text("variant_id").notNull(),
    itemName: text("item_name").notNull(),
    variantLabel: text("variant_label").notNull(),
    eventSnapshot: jsonb("event_snapshot").$type<EventOrderSnapshot>(),
    unitPrice: integer("unit_price").notNull(),
    qty: integer("qty").notNull(),
    lineTotal: integer("line_total").notNull(),
    // Catatan per-item dari pelanggan (mis. "less ice", "tanpa bawang").
    // Diteruskan ke itemNotes tiket dapur saat order diterima kasir.
    note: text("note"),
  },
  (table) => ({
    orderIdx: index("order_items_order_id_idx").on(table.orderId),
  }),
);

// Panggilan pelayan dari meja (QR dine-in): "call" (panggil pelayan),
// "bill" (minta bill), "water" (minta air/tisu), "other".
export const serviceRequests = pgTable(
  "service_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    tableLabel: text("table_label").notNull(),
    type: text("type").notNull().default("call"),
    note: text("note"),
    status: text("status").notNull().default("open"),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("service_requests_status_idx").on(table.status),
    outletIdx: index("service_requests_outlet_id_idx").on(table.outletId),
    createdIdx: index("service_requests_created_at_idx").on(table.createdAt),
  }),
);

// Live chat customer (guest/member) <-> kasir. Thread diikat ke meja + token
// acak (kontrol akses guest tanpa login, pola sama invoice_tracking_token).
// Terpisah dari chat INTERNAL staf (chat_channels/chat_messages di bawah).
export const customerChatThreads = pgTable(
  "customer_chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    tableLabel: text("table_label").notNull(),
    chatToken: text("chat_token").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    memberId: text("member_id"),
    status: text("status").notNull().default("open"),
    assignedToUserId: text("assigned_to_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    lastCustomerAt: timestamp("last_customer_at", { withTimezone: true }),
    staffReadAt: timestamp("staff_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("customer_chat_threads_chat_token_idx").on(table.chatToken),
    statusIdx: index("customer_chat_threads_status_idx").on(table.status),
    lastMsgIdx: index("customer_chat_threads_last_message_at_idx").on(table.lastMessageAt),
    orderIdx: index("customer_chat_threads_order_id_idx").on(table.orderId),
  }),
);

export const customerChatMessages = pgTable(
  "customer_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => customerChatThreads.id, { onDelete: "cascade" }),
    sender: text("sender").notNull(), // customer | staff | system
    staffUserId: text("staff_user_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    // Lampiran foto (mis. bukti bayar) — path /garage-uploads/chat/<acak>.jpg.
    attachmentUrl: text("attachment_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    threadIdx: index("customer_chat_messages_thread_id_created_at_idx").on(
      table.threadId,
      table.createdAt,
    ),
  }),
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, {
      onDelete: "set null",
    }),
    method: text("method").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("captured"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index("payments_order_id_idx").on(table.orderId),
    cashSessionIdx: index("payments_cash_session_id_idx").on(table.cashSessionId),
  }),
);

export const kitchenTickets = pgTable(
  "kitchen_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketNo: text("ticket_no").notNull().unique(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    tableLabel: text("table_label").notNull(),
    channel: text("channel").notNull(),
    station: text("station").notNull(),
    status: text("status").notNull().default("queue"),
    elapsed: integer("elapsed").notNull().default(0),
    priority: text("priority").notNull().default("normal"),
    targetMinutes: integer("target_minutes").notNull().default(15),
    targetGroup: text("target_group").notNull().default("food"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByName: text("accepted_by_name"),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    readyByName: text("ready_by_name"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveredByName: text("delivered_by_name"),
    // Klaim antar (waiter): waiter yang klaim duluan mengunci tiket & dapat fee
    // antar. Hanya pengklaim (atau manager) yang boleh menandai delivered.
    claimedBy: text("claimed_by").references(() => user.id, { onDelete: "set null" }),
    claimedByName: text("claimed_by_name"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    items: jsonb("items").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    itemNotes: jsonb("item_notes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    internalNotes: text("internal_notes"),
    // Snapshot identitas (Production Hub): nama customer + nomor order tetap
    // melekat di tiket walau data order berubah kemudian.
    customerName: text("customer_name"),
    orderNo: text("order_no"),
    // Tiket READY dikembalikan ke PROCESSING (salah/rusak) — alasan wajib.
    issueReason: text("issue_reason"),
    issueAt: timestamp("issue_at", { withTimezone: true }),
    // Serah-terima: helper Bar/Dapur ACC produk READY lalu memanggil waiter
    // (claimedBy = waiter yang dipanggil; null = siapa saja).
    handoverAt: timestamp("handover_at", { withTimezone: true }),
    handoverByName: text("handover_by_name"),
    // Chit cetak stasiun (printer Bar/Dapur): terisi saat sudah dicetak, supaya
    // tiket tidak tercetak dobel di perangkat stasiun mana pun.
    chitPrintedAt: timestamp("chit_printed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("kitchen_tickets_status_idx").on(table.status),
    orderIdx: index("kitchen_tickets_order_id_idx").on(table.orderId),
    stationIdx: index("kitchen_tickets_station_idx").on(table.station),
    readyAtIdx: index("kitchen_tickets_ready_at_idx").on(table.readyAt),
    priorityIdx: index("kitchen_tickets_priority_idx").on(table.priority),
    statusCreatedIdx: index("kitchen_tickets_status_created_idx").on(table.status, table.createdAt),
  }),
);

// =============================================================================
// PRODUCTION HUB — pengganti modul Kitchen.
// Tiket (kitchen_tickets) = satu order per workstation. Tiap baris order yang
// masuk tiket punya production_ticket_items sendiri supaya porsi bisa dibatch
// lintas order tanpa kehilangan identitas Customer + Meja + Order ID.
// =============================================================================

export const productionBatches = pgTable(
  "production_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchNo: text("batch_no").notNull().unique(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    station: text("station").notNull(),
    menuItemId: text("menu_item_id"),
    variantId: text("variant_id"),
    itemLabel: text("item_label").notNull(),
    note: text("note"),
    totalQty: integer("total_qty").notNull(),
    // processing → completed (allocation 100%) | cancelled
    status: text("status").notNull().default("processing"),
    startedByName: text("started_by_name"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedByName: text("completed_by_name"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    stationStatusIdx: index("production_batches_station_status_idx").on(table.station, table.status),
    createdIdx: index("production_batches_created_at_idx").on(table.createdAt),
  }),
);

export const productionTicketItems = pgTable(
  "production_ticket_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => kitchenTickets.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    menuItemId: text("menu_item_id"),
    variantId: text("variant_id"),
    itemName: text("item_name").notNull(),
    variantLabel: text("variant_label").notNull(),
    qty: integer("qty").notNull(),
    note: text("note"),
    station: text("station").notNull(),
    batchEligible: boolean("batch_eligible").notNull().default(true),
    batchId: uuid("batch_id").references(() => productionBatches.id, { onDelete: "set null" }),
    // waiting → processing → ready
    status: text("status").notNull().default("waiting"),
    customerName: text("customer_name"),
    tableLabel: text("table_label").notNull(),
    orderNo: text("order_no"),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ticketIdx: index("production_ticket_items_ticket_id_idx").on(table.ticketId),
    orderIdx: index("production_ticket_items_order_id_idx").on(table.orderId),
    batchIdx: index("production_ticket_items_batch_id_idx").on(table.batchId),
    stationStatusIdx: index("production_ticket_items_station_status_idx").on(
      table.station,
      table.status,
    ),
  }),
);

// Allocation: hasil batch dipetakan kembali ke porsi order asal. Batch baru
// boleh COMPLETE bila seluruh baris ter-allocate (coverage 100%, BR-06).
export const productionBatchAllocations = pgTable(
  "production_batch_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => productionBatches.id, { onDelete: "cascade" }),
    ticketItemId: uuid("ticket_item_id")
      .notNull()
      .references(() => productionTicketItems.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id").references(() => kitchenTickets.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    qty: integer("qty").notNull(),
    customerName: text("customer_name"),
    tableLabel: text("table_label").notNull(),
    orderNo: text("order_no"),
    note: text("note"),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }),
    allocatedByName: text("allocated_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    batchIdx: index("production_batch_allocations_batch_id_idx").on(table.batchId),
    ticketIdx: index("production_batch_allocations_ticket_id_idx").on(table.ticketId),
    orderIdx: index("production_batch_allocations_order_id_idx").on(table.orderId),
    ticketItemIdx: uniqueIndex("production_batch_allocations_ticket_item_idx").on(
      table.batchId,
      table.ticketItemId,
    ),
  }),
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    sku: text("sku").primaryKey(),
    name: text("name").notNull(),
    alternativeName: text("alternative_name").notNull(),
    category: text("category").notNull(),
    usageArea: text("usage_area").notNull().default("dapur"),
    unit: text("unit").notNull(),
    packageSize: text("package_size").notNull(),
    // HPP per satuan stok, boleh pecahan (mis. Rp144,7368/ml sirup botol 760 ml).
    unitCost: numeric("unit_cost", { precision: 14, scale: 4, mode: "number" }).notNull().default(0),
    // Harga beli per kemasan dari supplier (mis. Rp110.000/botol) & isi kemasan
    // dalam satuan stok (mis. 760 ml). unitCost = purchasePrice ÷ packageQty bila
    // keduanya diisi; update harga supplier cukup ubah purchasePrice. 0 = belum diisi.
    purchasePrice: numeric("purchase_price", { precision: 14, scale: 4, mode: "number" }).notNull().default(0),
    packageQty: numeric("package_qty", { precision: 14, scale: 4, mode: "number" }).notNull().default(0),
    onHand: real("on_hand").notNull(),
    min: real("min_stock").notNull(),
    // `status` = level stok operasional (low/watch/safe). JANGAN dipakai utk lifecycle.
    status: text("status").notNull(),
    // `stage` = lifecycle data (draft/active/archived). Default 'active' agar data
    // lama tetap aktif. Bahan Draft = masih riset; Archived = arsip (soft-delete).
    stage: text("stage").notNull().default("active"),
    movement: text("movement").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index("inventory_items_category_idx").on(table.category),
    usageAreaIdx: index("inventory_items_usage_area_idx").on(table.usageArea),
    statusIdx: index("inventory_items_status_idx").on(table.status),
    stageIdx: index("inventory_items_stage_idx").on(table.stage),
  }),
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemSku: text("item_sku").references(() => inventoryItems.sku, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    note: text("note").notNull(),
    qty: real("qty"),
    actor: text("actor").notNull().default("System"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    itemIdx: index("stock_movements_item_sku_idx").on(table.itemSku),
  }),
);

export const inventoryLocationStocks = pgTable(
  "inventory_location_stocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemSku: text("item_sku")
      .notNull()
      .references(() => inventoryItems.sku, { onDelete: "cascade" }),
    locationType: text("location_type").notNull(),
    locationKey: text("location_key").notNull(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
    onHand: real("on_hand").notNull().default(0),
    min: real("min_stock").notNull().default(0),
    status: text("status").notNull().default("safe"),
    movement: text("movement").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    stockLocationIdx: uniqueIndex("inventory_location_stocks_sku_location_idx").on(
      table.itemSku,
      table.locationKey,
    ),
    skuIdx: index("inventory_location_stocks_sku_idx").on(table.itemSku),
    outletIdx: index("inventory_location_stocks_outlet_idx").on(table.outletId),
    typeIdx: index("inventory_location_stocks_type_idx").on(table.locationType),
    statusIdx: index("inventory_location_stocks_status_idx").on(table.status),
  }),
);

export const inventoryTransferRequests = pgTable(
  "inventory_transfer_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestNo: text("request_no").notNull().unique(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    station: text("station").notNull().default("dapur"),
    status: text("status").notNull().default("requested"),
    note: text("note"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    issuedBy: text("issued_by").references(() => user.id, { onDelete: "set null" }),
    rejectedBy: text("rejected_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("inventory_transfer_requests_outlet_idx").on(table.outletId),
    stationIdx: index("inventory_transfer_requests_station_idx").on(table.station),
    statusIdx: index("inventory_transfer_requests_status_idx").on(table.status),
    createdAtIdx: index("inventory_transfer_requests_created_at_idx").on(table.createdAt),
  }),
);

export const inventoryTransferItems = pgTable(
  "inventory_transfer_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => inventoryTransferRequests.id, { onDelete: "cascade" }),
    itemSku: text("item_sku").references(() => inventoryItems.sku, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    unit: text("unit").notNull(),
    requestedQty: real("requested_qty").notNull(),
    issuedQty: real("issued_qty").notNull().default(0),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4, mode: "number" }).notNull().default(0),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestIdx: index("inventory_transfer_items_request_idx").on(table.requestId),
    skuIdx: index("inventory_transfer_items_sku_idx").on(table.itemSku),
  }),
);

export const stockOpnameSessions = pgTable(
  "stock_opname_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    locationType: text("location_type").notNull().default("outlet"),
    locationKey: text("location_key").notNull().default("outlet"),
    status: text("status").notNull().default("draft"),
    note: text("note"),
    totalItems: integer("total_items").notNull().default(0),
    totalDelta: real("total_delta").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    appliedBy: text("applied_by").references(() => user.id, { onDelete: "set null" }),
    rejectedBy: text("rejected_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("stock_opname_sessions_outlet_idx").on(table.outletId),
    statusIdx: index("stock_opname_sessions_status_idx").on(table.status),
    createdAtIdx: index("stock_opname_sessions_created_at_idx").on(table.createdAt),
  }),
);

export const stockOpnameItems = pgTable(
  "stock_opname_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => stockOpnameSessions.id, { onDelete: "cascade" }),
    itemSku: text("item_sku").references(() => inventoryItems.sku, {
      onDelete: "set null",
    }),
    itemName: text("item_name").notNull(),
    unit: text("unit").notNull(),
    systemQty: real("system_qty").notNull(),
    physicalQty: real("physical_qty").notNull(),
    delta: real("delta").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index("stock_opname_items_session_idx").on(table.sessionId),
    skuIdx: index("stock_opname_items_sku_idx").on(table.itemSku),
  }),
);

export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    openingCash: integer("opening_cash").notNull(),
    expectedCash: integer("expected_cash").notNull(),
    actualCash: integer("actual_cash"),
    discrepancy: integer("discrepancy").notNull().default(0),
    discrepancyStatus: text("discrepancy_status").notNull().default("ok"),
    status: text("status").notNull().default("open"),
    checklist: jsonb("checklist")
      .$type<Array<{ label: string; done: boolean }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    denominations: jsonb("denominations")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    closingNote: text("closing_note"),
    openedBy: text("opened_by").references(() => user.id, { onDelete: "set null" }),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
    managerSignOffBy: text("manager_sign_off_by").references(() => user.id, {
      onDelete: "set null",
    }),
    managerSignOffAt: timestamp("manager_sign_off_at", { withTimezone: true }),
    // Pencocokan QRIS (terpisah dari selisih laci tunai): total QRIS tercatat
    // sistem vs total di aplikasi/mutasi BNI. counted null = belum dicocokkan.
    qrisRecorded: integer("qris_recorded"),
    qrisCounted: integer("qris_counted"),
    qrisDiscrepancy: integer("qris_discrepancy"),
    qrisCheckedBy: text("qris_checked_by").references(() => user.id, { onDelete: "set null" }),
    qrisCheckedAt: timestamp("qris_checked_at", { withTimezone: true }),
    // Serah terima uang laci saat tutup: ditinggal untuk modal shift berikutnya
    // dan untuk disetor ke rekening (= uang dihitung − ditinggal).
    floatLeft: integer("float_left"),
    depositAmount: integer("deposit_amount"),
    // Laporan pertanggungjawaban kasir (owner, Okt 2026): hitungan pecahan saat
    // buka shift + siapa yang memverifikasi modal awal.
    openingDenominations: jsonb("opening_denominations")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    openingVerifiedBy: text("opening_verified_by").references(() => user.id, { onDelete: "set null" }),
    openingVerifiedAt: timestamp("opening_verified_at", { withTimezone: true }),
    // Pemeriksaan laporan shift oleh Manajer/Owner: pending | verified | needs_followup.
    // true = saldo laci dari buku kas (cash_ledger_entries); false = shift format lama.
    ledgerMode: boolean("ledger_mode").notNull().default(false),
    reviewStatus: text("review_status").notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    // P3 closing (owner, Okt 2026): actual_cash/denominations = hitungan PERTAMA kasir
    // (tidak pernah ditimpa). Tutup tanpa pecahan hanya darurat: alasan + PIN Manajer.
    countSkippedReason: text("count_skipped_reason"),
    // Hitung ulang oleh pemeriksa (Manajer lain/Owner) saat verifikasi.
    recountCash: integer("recount_cash"),
    recountDenominations: jsonb("recount_denominations").$type<Record<string, number>>(),
    recountBy: text("recount_by").references(() => user.id, { onDelete: "set null" }),
    recountAt: timestamp("recount_at", { withTimezone: true }),
    // Selisih ≠ 0 hanya bisa "verified" bila pemeriksa mengakui selisih + catatan.
    discrepancyAcknowledged: boolean("discrepancy_acknowledged").notNull().default(false),
    // Owner memverifikasi shift miliknya sendiri = "tanpa pemeriksa kedua".
    reviewSelfVerified: boolean("review_self_verified").notNull().default(false),
    // B4 (PRD §13): tutup kasir & verifikasi Manajer BUKAN final. Final hanya Owner +
    // TOTP terikat hash ringkasan (src/lib/cash-final-approval.ts).
    // pending | approved | approved_with_exception | returned | legacy (tutup sebelum B4).
    finalStatus: text("final_status").notNull().default("pending"),
    finalDecidedBy: text("final_decided_by").references(() => user.id, { onDelete: "set null" }),
    finalDecidedAt: timestamp("final_decided_at", { withTimezone: true }),
    finalNote: text("final_note"),
    finalSummaryHash: text("final_summary_hash"),
    finalVersion: integer("final_version").notNull().default(0),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index("cash_sessions_status_idx").on(table.status),
    // Pengaman terakhir: 1 pengguna = 1 sesi kas terbuka, walau dua request
    // buka shift lolos cek aplikasi secara bersamaan.
    openPerUserIdx: uniqueIndex("cash_sessions_open_per_user_idx")
      .on(table.openedBy)
      .where(sql`${table.status} = 'open'`),
  }),
);

// B4 (PRD §10.8): setiap hitungan laci = rekaman append-only (trigger menolak UPDATE/DELETE,
// kecuali reset grand opening). count_1/count_2/count_3 = kasir (blind, #2 tidak disalin
// dari #1); manager_recount = pemeriksa. cash_sessions.actual_cash tetap hitungan sah kasir.
export const cashSessionCounts = pgTable(
  "cash_session_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cashSessionId: uuid("cash_session_id")
      .notNull()
      .references(() => cashSessions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    denominations: jsonb("denominations").$type<Record<string, number>>().notNull(),
    total: integer("total").notNull(),
    countedBy: text("counted_by").references(() => user.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index("cash_session_counts_session_idx").on(table.cashSessionId, table.createdAt),
  }),
);

// B7 (PRD §20.2, AC-F30): setiap keputusan final Owner = snapshot ringkasan append-only
// (report ID + hash + versi). Koreksi setelah final membuat versi baru; yang lama tetap.
export const cashSessionFinalSnapshots = pgTable(
  "cash_session_final_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cashSessionId: uuid("cash_session_id")
      .notNull()
      .references(() => cashSessions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    reportId: text("report_id").notNull().unique(),
    decision: text("decision").notNull(),
    finalStatus: text("final_status").notNull(),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    summaryHash: text("summary_hash").notNull(),
    exceptions: jsonb("exceptions").$type<string[]>().notNull(),
    note: text("note"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    sessionVersionIdx: uniqueIndex("cash_session_final_snapshots_session_version_idx").on(table.cashSessionId, table.version),
  }),
);

// B6 (PRD §14): alert risiko explainable LV1–LV5 = prioritas pemeriksaan, BUKAN vonis.
// Satu alert per (aturan, subjek) lewat dedupe_key; disposisi diputuskan manusia.
export const riskAlerts = pgTable(
  "risk_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    ruleId: text("rule_id").notNull(),
    ruleVersion: integer("rule_version").notNull(),
    riskLevel: integer("risk_level").notNull(),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, { onDelete: "set null" }),
    personUserId: text("person_user_id").references(() => user.id, { onDelete: "set null" }),
    personRole: text("person_role"),
    // cashier | manager | qris | bank | system — matriks akuntabilitas PRD §14.5.
    custodyScope: text("custody_scope").notNull(),
    evidence: jsonb("evidence").$type<Array<{ type: string; ref: string; label: string }>>().notNull(),
    // Kelengkapan bukti (bukan peluang curang): complete | partial.
    completeness: text("completeness").notNull().default("complete"),
    // OPEN | FALSE_POSITIVE | EXPLAINED | SUBSTANTIATED | DISPUTED | CLOSED
    disposition: text("disposition").notNull().default("OPEN"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    auditCaseId: uuid("audit_case_id").references(() => auditCases.id, { onDelete: "set null" }),
  },
  (table) => ({
    openIdx: index("risk_alerts_disposition_idx").on(table.disposition, table.riskLevel),
    sessionIdx: index("risk_alerts_session_idx").on(table.cashSessionId),
  }),
);

// Step-up 2FA (B4 final Owner, D-01a aksi R3 MCP): tantangan terikat subjek + hash
// ringkasan, nonce sekali pakai (hanya hash disimpan), kedaluwarsa pendek. Kode TOTP
// yang sudah dipakai disimpan sebagai hash agar tidak bisa diputar ulang.
export const stepUpChallenges = pgTable(
  "step_up_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    subjectId: text("subject_id").notNull(),
    summaryHash: text("summary_hash").notNull(),
    nonceHash: text("nonce_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    codeHash: text("code_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("step_up_challenges_user_idx").on(table.userId, table.createdAt),
  }),
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull().default("COGS"),
    contactName: text("contact_name"),
    phone: text("phone"),
    address: text("address"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("suppliers_outlet_idx").on(table.outletId),
    codeIdx: uniqueIndex("suppliers_code_idx").on(table.code),
    statusIdx: index("suppliers_status_idx").on(table.status),
  }),
);

export const supplierInvoices = pgTable(
  "supplier_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    invoiceNo: text("invoice_no").notNull().unique(),
    category: text("category").notNull().default("COGS"),
    description: text("description").notNull().default(""),
    amount: integer("amount").notNull(),
    paidAmount: integer("paid_amount").notNull().default(0),
    status: text("status").notNull().default("unpaid"),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    paidBy: text("paid_by").references(() => user.id, { onDelete: "set null" }),
    paymentRef: text("payment_ref"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    supplierIdx: index("supplier_invoices_supplier_idx").on(table.supplierId),
    outletIdx: index("supplier_invoices_outlet_idx").on(table.outletId),
    statusIdx: index("supplier_invoices_status_idx").on(table.status),
    dueIdx: index("supplier_invoices_due_idx").on(table.dueDate),
  }),
);

export const supplierReceivings = pgTable(
  "supplier_receivings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    supplierInvoiceId: uuid("supplier_invoice_id").references(() => supplierInvoices.id, {
      onDelete: "set null",
    }),
    invoiceNo: text("invoice_no"),
    status: text("status").notNull().default("posted"),
    totalAmount: integer("total_amount").notNull().default(0),
    note: text("note"),
    receivedBy: text("received_by").references(() => user.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    supplierIdx: index("supplier_receivings_supplier_idx").on(table.supplierId),
    invoiceIdx: index("supplier_receivings_invoice_idx").on(table.supplierInvoiceId),
    receivedAtIdx: index("supplier_receivings_received_at_idx").on(table.receivedAt),
  }),
);

export const supplierReceivingItems = pgTable(
  "supplier_receiving_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receivingId: uuid("receiving_id")
      .notNull()
      .references(() => supplierReceivings.id, { onDelete: "cascade" }),
    itemSku: text("item_sku").references(() => inventoryItems.sku, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    unit: text("unit").notNull(),
    qty: real("qty").notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4, mode: "number" }).notNull().default(0),
    lineTotal: integer("line_total").notNull().default(0),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    receivingIdx: index("supplier_receiving_items_receiving_idx").on(table.receivingId),
    skuIdx: index("supplier_receiving_items_sku_idx").on(table.itemSku),
  }),
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    supplierInvoiceId: uuid("supplier_invoice_id").references(() => supplierInvoices.id, {
      onDelete: "set null",
    }),
    category: text("category").notNull(),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    paymentMethod: text("payment_method").notNull().default("Cash"),
    status: text("status").notNull().default("recorded"),
    expenseDate: timestamp("expense_date", { withTimezone: true }).notNull().defaultNow(),
    receiptUrl: text("receipt_url"),
    notes: text("notes"),
    // Belanja bahan dari penerimaan gudang (dibayar cash langsung): "<doc>#<area>".
    // Hanya baris ber-sourceDoc yang menjadi biaya "Belanja bahan" di laba rugi.
    sourceDoc: text("source_doc"),
    // Sumber dana biaya tunai (buku kas): drawer | bank_jago | bank_bni | external.
    // null = data lama / bukan tunai.
    cashSource: text("cash_source"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("expenses_outlet_idx").on(table.outletId),
    sourceDocUidx: uniqueIndex("expenses_source_doc_uidx").on(table.sourceDoc),
    supplierIdx: index("expenses_supplier_idx").on(table.supplierId),
    categoryIdx: index("expenses_category_idx").on(table.category),
    statusIdx: index("expenses_status_idx").on(table.status),
    dateIdx: index("expenses_date_idx").on(table.expenseDate),
  }),
);

export const paymentSettlements = pgTable(
  "payment_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    settlementNo: text("settlement_no").notNull().unique(),
    method: text("method").notNull(),
    provider: text("provider").notNull(),
    expectedAmount: integer("expected_amount").notNull(),
    settledAmount: integer("settled_amount").notNull().default(0),
    feeAmount: integer("fee_amount").notNull().default(0),
    status: text("status").notNull().default("pending"),
    settlementDate: timestamp("settlement_date", { withTimezone: true }).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    reference: text("reference"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("payment_settlements_outlet_idx").on(table.outletId),
    methodIdx: index("payment_settlements_method_idx").on(table.method),
    statusIdx: index("payment_settlements_status_idx").on(table.status),
    dateIdx: index("payment_settlements_date_idx").on(table.settlementDate),
  }),
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, {
      onDelete: "set null",
    }),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    // Nomor referensi per outlet: KAS-YYMMDD-0001 (null untuk baris lama).
    refNo: text("ref_no"),
    type: text("type").notNull(),
    // Label kategori (tampilan) + kunci katalog `src/lib/cash-drawer.ts`.
    category: text("category").notNull().default("general"),
    categoryKey: text("category_key"),
    cashGroup: text("cash_group"),
    description: text("description").notNull(),
    note: text("note"),
    amount: integer("amount").notNull(),
    // recorded (uang sudah bergerak) | pending_approval (pengajuan, uang BELUM
    // bergerak) | rejected | voided. Hanya `recorded` memengaruhi saldo laci.
    status: text("status").notNull().default("recorded"),
    // Buku kas: sumber/penerima uang, nomor bukti/nota, dan invoice terkait.
    counterparty: text("counterparty"),
    referenceNo: text("reference_no"),
    orderNo: text("order_no"),
    vendorName: text("vendor_name"),
    // Foto nota/bukti: path relatif di storage/cash-receipts (non-publik).
    receiptPhoto: text("receipt_photo"),
    orderId: uuid("order_id"),
    employeeUserId: text("employee_user_id").references(() => user.id, { onDelete: "set null" }),
    relatedMovementId: uuid("related_movement_id"),
    correctsMovementId: uuid("corrects_movement_id"),
    expenseId: uuid("expense_id"),
    // Baris buku kas yang menggerakkan uang mutasi ini (null = data lama / belum bergerak).
    ledgerEntryId: uuid("ledger_entry_id"),
    // Setoran ke rekening (owner, Okt 2026 — tanpa brankas/serah ke Owner): laci →
    // "setoran dalam perjalanan"; baru masuk rekening saat penerima (≠ penyetor)
    // mengonfirmasi dengan nomor bukti bank.
    depositAccount: text("deposit_account"),
    depositConfirmedBy: text("deposit_confirmed_by").references(() => user.id, { onDelete: "set null" }),
    depositConfirmedAt: timestamp("deposit_confirmed_at", { withTimezone: true }),
    depositBankRef: text("deposit_bank_ref"),
    depositLedgerEntryId: uuid("deposit_ledger_entry_id"),
    // Saldo laci (expectedCash sesi) tepat sebelum/sesudah uang bergerak.
    balanceBefore: integer("balance_before"),
    balanceAfter: integer("balance_after"),
    // Jejak efek samping untuk pembatalan tepat (alokasi kasbon, potongan expense).
    effects: jsonb("effects").$type<Record<string, unknown>>(),
    movementAt: timestamp("movement_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: text("rejected_by").references(() => user.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    voidedBy: text("voided_by").references(() => user.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    refNoIdx: uniqueIndex("cash_movements_outlet_ref_idx").on(table.outletId, table.refNo),
    statusIdx: index("cash_movements_status_idx").on(table.status),
    cashSessionIdx: index("cash_movements_session_idx").on(table.cashSessionId),
    outletIdx: index("cash_movements_outlet_idx").on(table.outletId),
    typeIdx: index("cash_movements_type_idx").on(table.type),
    movementAtIdx: index("cash_movements_at_idx").on(table.movementAt),
  }),
);

// Petty cash (kas kecil) — dana operasional TERPISAH dari laci kasir: tidak
// mengubah expectedCash shift. Saldo = top-up disetujui − pengeluaran disetujui
// ± penyesuaian. Status: submitted | approved | rejected | cancelled.
export const pettyCashEntries = pgTable(
  "petty_cash_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryNo: text("entry_no").notNull().unique(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, { onDelete: "set null" }),
    type: text("type").notNull(), // topup | expense | adjustment
    category: text("category").notNull(),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    recipient: text("recipient"),
    receiptNo: text("receipt_no"),
    receiptUrl: text("receipt_url"),
    status: text("status").notNull().default("submitted"),
    decisionNote: text("decision_note"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // P2 (owner, Okt 2026): disetujui ≠ dibayar. Saldo hanya berubah saat uang
    // benar-benar diserahkan/diterima (baris buku kas akun `petty`).
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: text("paid_by").references(() => user.id, { onDelete: "set null" }),
    ledgerEntryId: uuid("ledger_entry_id"),
    reversalLedgerEntryId: uuid("reversal_ledger_entry_id"),
    // Top-up: dari mana dananya (bank_jago | bank_bni | external = uang pribadi Owner).
    fundSource: text("fund_source"),
    // true = dicatat & disetujui orang yang sama (Owner) — tidak diperiksa independen.
    selfApproved: boolean("self_approved").notNull().default(false),
    entryAt: timestamp("entry_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("petty_cash_outlet_idx").on(table.outletId),
    sessionIdx: index("petty_cash_session_idx").on(table.cashSessionId),
    entryAtIdx: index("petty_cash_entry_at_idx").on(table.entryAt),
  }),
);

// Buku kas tunggal (owner, Okt 2026, P1 closing): akun uang + satu baris per
// perpindahan uang yang benar-benar terjadi. Saldo laci = Σ baris akun drawer per
// sesi; cash_sessions.expected_cash hanya cache. Baris TIDAK pernah diubah/dihapus
// (trigger DB) — koreksi = baris pembalik (reverses_id). Lihat src/lib/cash-ledger.ts.
export const cashAccounts = pgTable("cash_accounts", {
  code: text("code").primaryKey(), // drawer | petty | bank_jago | bank_bni | qris_clearing | external
  kind: text("kind").notNull(), // drawer | petty | bank | clearing | external
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cashLedgerEntries = pgTable(
  "cash_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
    businessDate: text("business_date").notNull(), // YYYY-MM-DD Asia/Jakarta
    outletId: uuid("outlet_id"),
    cashSessionId: uuid("cash_session_id"),
    fromAccount: text("from_account").notNull(),
    toAccount: text("to_account").notNull(),
    amount: integer("amount").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    sourceRef: text("source_ref"),
    reversesId: uuid("reverses_id"),
    actorUserId: text("actor_user_id"),
    approverUserId: text("approver_user_id"),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex("cash_ledger_idempotency_idx").on(table.idempotencyKey),
    seqIdx: uniqueIndex("cash_ledger_seq_idx").on(table.seq),
    sessionIdx: index("cash_ledger_session_idx").on(table.cashSessionId),
    outletDateIdx: index("cash_ledger_outlet_date_idx").on(table.outletId, table.businessDate),
    sourceIdx: index("cash_ledger_source_idx").on(table.sourceType, table.sourceId),
    reversesIdx: index("cash_ledger_reverses_idx").on(table.reversesId),
  }),
);

// Saldo pembuka disahkan Owner (P6): satu kali per akun (petty per outlet, rekening global).
// Selisih hitungan nyata − buku kas diposting sebagai baris `opening_balance`; immutable (trigger).
export const cashOpeningCertifications = pgTable(
  "cash_opening_certifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeKey: text("scope_key").notNull(), // `${account}:${outletId ?? "all"}`
    account: text("account").notNull(),
    outletId: uuid("outlet_id"),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    ledgerBalance: integer("ledger_balance").notNull(),
    countedBalance: integer("counted_balance").notNull(),
    adjustment: integer("adjustment").notNull(),
    adjustmentEntryId: uuid("adjustment_entry_id"),
    legacyEntries: integer("legacy_entries").notNull().default(0),
    legacyTotal: integer("legacy_total").notNull().default(0),
    evidenceRef: text("evidence_ref").notNull(),
    note: text("note"),
    certifiedBy: text("certified_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeIdx: uniqueIndex("cash_opening_cert_scope_idx").on(table.scopeKey),
  }),
);

// Catatan kejadian shift (selisih kas, gangguan QRIS/printer, komplain, dll.).
// Status: open | follow_up | resolved.
export const shiftIncidents = pgTable(
  "shift_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    orderNo: text("order_no"),
    financialImpact: integer("financial_impact"),
    actionTaken: text("action_taken"),
    status: text("status").notNull().default("open"),
    responsibleName: text("responsible_name"),
    managerNote: text("manager_note"),
    reportedBy: text("reported_by").references(() => user.id, { onDelete: "set null" }),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index("shift_incidents_session_idx").on(table.cashSessionId),
    occurredIdx: index("shift_incidents_occurred_idx").on(table.occurredAt),
  }),
);

export const tableSessions = pgTable(
  "table_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    tableNumber: text("table_number").notNull(),
    tableLabel: text("table_label").notNull(),
    status: text("status").notNull().default("empty"),
    currentOrderId: uuid("current_order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    needsCleaning: boolean("needs_cleaning").notNull().default(false),
    lastStatusAt: timestamp("last_status_at", { withTimezone: true }).notNull().defaultNow(),
    cleanedAt: timestamp("cleaned_at", { withTimezone: true }),
    // Kunci sementara saat customer memilih meja di menu digital (owner, Okt
    // 2026): meja "Sedang dipilih" sampai heldUntil; token disimpan sebagai hash.
    heldUntil: timestamp("held_until", { withTimezone: true }),
    heldTokenHash: text("held_token_hash"),
    // Kode gabung 4 digit untuk teman semeja (dibuat saat pesanan pertama,
    // dihapus saat meja dikosongkan).
    joinCode: text("join_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tableIdx: uniqueIndex("table_sessions_outlet_table_idx").on(table.outletId, table.tableNumber),
    statusIdx: index("table_sessions_status_idx").on(table.status),
    orderIdx: index("table_sessions_current_order_idx").on(table.currentOrderId),
  }),
);

// Master meja per outlet (menu Atur Meja). Tanpa baris untuk outlet → semua
// meja 01–50 dianggap aktif (lihat getOutletTables). Nomor meja 2 digit ("06").
export const diningTables = pgTable(
  "dining_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "cascade" }),
    tableNumber: text("table_number").notNull(),
    area: text("area").notNull().default(""),
    capacity: integer("capacity").notNull().default(4),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletTableIdx: uniqueIndex("dining_tables_outlet_table_idx").on(table.outletId, table.tableNumber),
  }),
);

export const vouchers = pgTable(
  "vouchers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    type: text("type").notNull().default("fixed"),
    value: integer("value").notNull(),
    minSpend: integer("min_spend").notNull().default(0),
    maxDiscount: integer("max_discount"),
    audience: text("audience").notNull().default("all"),
    status: text("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("vouchers_customer_id_idx").on(table.customerId),
    codeIdx: uniqueIndex("vouchers_code_idx").on(table.code),
    statusIdx: index("vouchers_status_idx").on(table.status),
    audienceIdx: index("vouchers_audience_idx").on(table.audience),
  }),
);

export const crmCampaignLogs = pgTable(
  "crm_campaign_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerPhone: text("customer_phone"),
    segmentKey: text("segment_key").notNull(),
    templateKey: text("template_key").notNull(),
    channel: text("channel").notNull().default("whatsapp"),
    messagePreview: text("message_preview").notNull().default(""),
    status: text("status").notNull().default("opened"),
    sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("crm_campaign_logs_customer_id_idx").on(table.customerId),
    segmentIdx: index("crm_campaign_logs_segment_idx").on(table.segmentKey),
    createdIdx: index("crm_campaign_logs_created_at_idx").on(table.createdAt),
  }),
);

export const voucherRedemptions = pgTable(
  "voucher_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voucherId: uuid("voucher_id").references(() => vouchers.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerPhone: text("customer_phone"),
    discount: integer("discount").notNull().default(0),
    status: text("status").notNull().default("redeemed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    voucherIdx: index("voucher_redemptions_voucher_id_idx").on(table.voucherId),
    orderIdx: index("voucher_redemptions_order_id_idx").on(table.orderId),
    customerIdx: index("voucher_redemptions_customer_id_idx").on(table.customerId),
    phoneIdx: index("voucher_redemptions_customer_phone_idx").on(table.customerPhone),
  }),
);

// Marketing master — persisted campaign lifecycle (draft → scheduled → active → completed/archived).
// channel: whatsapp | instagram | in_store | multi. objective: winback | acquisition | retention | awareness | loyalty.
// budget & spend dalam IDR (integer). target/actual metrics dipakai untuk ROI estimasi di Overview.
export const marketingCampaigns = pgTable(
  "marketing_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    objective: text("objective").notNull().default("retention"),
    channel: text("channel").notNull().default("whatsapp"),
    segmentKey: text("segment_key").notNull().default("atRisk"),
    audienceSize: integer("audience_size").notNull().default(0),
    budget: integer("budget").notNull().default(0),
    spend: integer("spend").notNull().default(0),
    targetOrders: integer("target_orders").notNull().default(0),
    targetRevenue: integer("target_revenue").notNull().default(0),
    actualOrders: integer("actual_orders").notNull().default(0),
    actualRevenue: integer("actual_revenue").notNull().default(0),
    status: text("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ownerName: text("owner_name"),
    notes: text("notes"),
    voucherId: uuid("voucher_id").references(() => vouchers.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("marketing_campaigns_code_idx").on(table.code),
    statusIdx: index("marketing_campaigns_status_idx").on(table.status),
    channelIdx: index("marketing_campaigns_channel_idx").on(table.channel),
    segmentIdx: index("marketing_campaigns_segment_idx").on(table.segmentKey),
    startsIdx: index("marketing_campaigns_starts_at_idx").on(table.startsAt),
  }),
);

// Marketing broadcasts — per-campaign WA blast atau IG post tracking.
// status: draft | scheduled | sending | sent | cancelled.
export const marketingBroadcasts = pgTable(
  "marketing_broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").references(() => marketingCampaigns.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    channel: text("channel").notNull().default("whatsapp"),
    segmentKey: text("segment_key").notNull().default("atRisk"),
    templateBody: text("template_body").notNull().default(""),
    status: text("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    totalRecipients: integer("total_recipients").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    openedCount: integer("opened_count").notNull().default(0),
    clickedCount: integer("clicked_count").notNull().default(0),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    campaignIdx: index("marketing_broadcasts_campaign_idx").on(table.campaignId),
    statusIdx: index("marketing_broadcasts_status_idx").on(table.status),
    channelIdx: index("marketing_broadcasts_channel_idx").on(table.channel),
    scheduledIdx: index("marketing_broadcasts_scheduled_at_idx").on(table.scheduledAt),
  }),
);

// Catatan pengiriman per-penerima untuk sebuah broadcast.
// status: queued | simulated | sent | failed
// provider: simulation | fonnte | cloud_api | email (pluggable)
export const marketingBroadcastDeliveries = pgTable(
  "marketing_broadcast_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => marketingBroadcasts.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    recipientName: text("recipient_name").notNull().default(""),
    recipientPhone: text("recipient_phone").notNull().default(""),
    channel: text("channel").notNull().default("whatsapp"),
    provider: text("provider").notNull().default("simulation"),
    status: text("status").notNull().default("queued"),
    renderedBody: text("rendered_body").notNull().default(""),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    broadcastIdx: index("marketing_broadcast_deliveries_broadcast_idx").on(
      table.broadcastId,
    ),
    statusIdx: index("marketing_broadcast_deliveries_status_idx").on(table.status),
  }),
);

// Social publishing connection. OAuth tokens are encrypted before persistence.
export const socialPublisherConnections = pgTable(
  "social_publisher_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("platform").notNull(),
    resourceType: text("resource_type").notNull().default("account"),
    resourceId: text("resource_id").notNull(),
    accountId: text("account_id"),
    accountName: text("account_name"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
    scopes: jsonb("scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text("status").notNull().default("connected"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    lastError: text("last_error"),
    permissionsCheckedAt: timestamp("permissions_checked_at", { withTimezone: true }),
    webhookSubscribedAt: timestamp("webhook_subscribed_at", { withTimezone: true }),
    connectedBy: text("connected_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    resourceIdx: uniqueIndex("social_publisher_connections_resource_idx").on(
      table.provider,
      table.resourceType,
      table.resourceId,
    ),
    providerIdx: index("social_publisher_connections_provider_idx").on(table.provider),
    statusIdx: index("social_publisher_connections_status_idx").on(table.status),
  }),
);

// Content approval and scheduling queue owned by GARAGE OS.
export const contentPublishingQueue = pgTable(
  "content_publishing_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").references(() => marketingCampaigns.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    contentText: text("content_text").notNull().default(""),
    caption: text("caption").notNull().default(""),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    assetUrl: text("asset_url"),
    assetUrls: jsonb("asset_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    thumbnailUrl: text("thumbnail_url"),
    platforms: jsonb("platforms").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text("status").notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    revisionNotes: text("revision_notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    campaignIdx: index("content_publishing_queue_campaign_idx").on(table.campaignId),
    statusIdx: index("content_publishing_queue_status_idx").on(table.status),
    scheduleIdx: index("content_publishing_queue_scheduled_at_idx").on(table.scheduledAt),
  }),
);

export const contentPublishingResults = pgTable(
  "content_publishing_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queueId: uuid("queue_id")
      .notNull()
      .references(() => contentPublishingQueue.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("queued"),
    providerPostId: text("provider_post_id"),
    publishedUrl: text("published_url"),
    error: text("error"),
    analytics: jsonb("analytics").$type<Record<string, number>>(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    queuePlatformIdx: uniqueIndex("content_publishing_results_queue_platform_idx").on(
      table.queueId,
      table.platform,
    ),
    idempotencyIdx: uniqueIndex("content_publishing_results_idempotency_idx").on(
      table.idempotencyKey,
    ),
    statusIdx: index("content_publishing_results_status_idx").on(table.status),
  }),
);

// WhatsApp uses a dedicated queue because it is a messaging channel, not a social post.
export const whatsappMessagingQueue = pgTable(
  "whatsapp_messaging_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipient: text("recipient").notNull(),
    messageType: text("message_type").notNull().default("template"),
    templateName: text("template_name"),
    templateLanguage: text("template_language").notNull().default("id"),
    templateParameters: jsonb("template_parameters")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    body: text("body"),
    status: text("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex("whatsapp_messaging_queue_idempotency_idx").on(
      table.idempotencyKey,
    ),
    statusScheduleIdx: index("whatsapp_messaging_queue_status_schedule_idx").on(
      table.status,
      table.scheduledAt,
    ),
    providerMessageIdx: index("whatsapp_messaging_queue_provider_message_idx").on(
      table.providerMessageId,
    ),
  }),
);

export const menuRecipes = pgTable(
  "menu_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    menuItemId: text("menu_item_id").references(() => menuItems.id, { onDelete: "cascade" }),
    variantId: text("variant_id").notNull().default("all"),
    inventorySku: text("inventory_sku").references(() => inventoryItems.sku, {
      onDelete: "set null",
    }),
    qty: real("qty").notNull(),
    unit: text("unit").notNull(),
    wastePct: real("waste_pct").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recipeIdx: uniqueIndex("menu_recipes_menu_variant_sku_idx").on(
      table.menuItemId,
      table.variantId,
      table.inventorySku,
    ),
    itemIdx: index("menu_recipes_menu_item_idx").on(table.menuItemId),
    skuIdx: index("menu_recipes_inventory_sku_idx").on(table.inventorySku),
    statusIdx: index("menu_recipes_status_idx").on(table.status),
  }),
);

// Riset Menu — catatan eksperimen rasa/resep/HPP sebelum produk diaktifkan.
// productId opsional (boleh riset produk yang belum jadi menuItems).
export const menuResearch = pgTable(
  "menu_research",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: text("product_id").references(() => menuItems.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    tasteNotes: text("taste_notes").notNull().default(""),
    recipeNotes: text("recipe_notes").notNull().default(""),
    hppNotes: text("hpp_notes").notNull().default(""),
    sellingPriceNotes: text("selling_price_notes").notNull().default(""),
    // research | revise | approved | rejected
    decision: text("decision").notNull().default("research"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    decisionIdx: index("menu_research_decision_idx").on(table.decision),
    productIdx: index("menu_research_product_idx").on(table.productId),
  }),
);

export const shiftHandoverReports = pgTable(
  "shift_handover_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, {
      onDelete: "set null",
    }),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    status: text("status").notNull().default("recorded"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("shift_handover_reports_outlet_idx").on(table.outletId),
    cashSessionIdx: index("shift_handover_reports_cash_session_idx").on(table.cashSessionId),
    createdIdx: index("shift_handover_reports_created_at_idx").on(table.createdAt),
  }),
);

export const printJobs = pgTable(
  "print_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobType: text("job_type").notNull(),
    target: text("target").notNull(),
    status: text("status").notNull().default("pending"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    ticketNo: text("ticket_no"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    printedAt: timestamp("printed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("print_jobs_status_idx").on(table.status),
    orderIdx: index("print_jobs_order_id_idx").on(table.orderId),
    ticketIdx: index("print_jobs_ticket_no_idx").on(table.ticketNo),
    createdIdx: index("print_jobs_created_at_idx").on(table.createdAt),
  }),
);

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  requester: text("requester").notNull(),
  requesterPhone: text("requester_phone"),
  amount: text("amount").notNull(),
  reason: text("reason").notNull(),
  risk: text("risk").notNull(),
  age: text("age").notNull(),
  status: text("status").notNull().default("pending"),
  decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
  decidedByName: text("decided_by_name"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  reasonDecided: text("reason_decided"),
  // Data detail pengajuan (orderId, kode alasan, item refund, dll).
  // Bentuk: ApprovalPayload di src/lib/approval-rules.ts.
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  // "board" (diputus di modul Persetujuan) | "pin" (PIN Manajer di POS) | "auto"
  decidedVia: text("decided_via"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiProviderConfigs = pgTable(
  "ai_provider_configs",
  {
    provider: text("provider").primaryKey(),
    label: text("label").notNull(),
    baseUrl: text("base_url").notNull(),
    model: text("model").notNull(),
    apiKeyEncrypted: text("api_key_encrypted"),
    enabled: boolean("enabled").notNull().default(false),
    priority: integer("priority").notNull().default(100),
    lastStatus: text("last_status").notNull().default("untested"),
    lastError: text("last_error"),
    lastLatencyMs: integer("last_latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    enabledIdx: index("ai_provider_configs_enabled_idx").on(table.enabled),
    priorityIdx: index("ai_provider_configs_priority_idx").on(table.priority),
  }),
);

export const aiAgentConfigs = pgTable(
  "ai_agent_configs",
  {
    agentId: text("agent_id").primaryKey(),
    label: text("label").notNull(),
    description: text("description").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    autonomyMode: text("autonomy_mode").notNull().default("controlled"),
    maxRiskLevel: text("max_risk_level").notNull().default("medium"),
    allowedIntents: jsonb("allowed_intents").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    enabledIdx: index("ai_agent_configs_enabled_idx").on(table.enabled),
    sortIdx: index("ai_agent_configs_sort_idx").on(table.sortOrder),
  }),
);

export const aiActionRegistry = pgTable(
  "ai_action_registry",
  {
    actionType: text("action_type").primaryKey(),
    label: text("label").notNull(),
    description: text("description").notNull(),
    safetyLevel: text("safety_level").notNull(),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true),
    allowedRoles: jsonb("allowed_roles").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    safetyIdx: index("ai_action_registry_safety_idx").on(table.safetyLevel),
    enabledIdx: index("ai_action_registry_enabled_idx").on(table.enabled),
  }),
);

export const aiAgentRuns = pgTable(
  "ai_agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prompt: text("prompt").notNull(),
    intent: text("intent").notNull(),
    profile: text("profile").notNull().default("fast"),
    dataAccessLevel: text("data_access_level").notNull().default("operational"),
    provider: text("provider"),
    model: text("model"),
    role: text("role").notNull(),
    status: text("status").notNull(),
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    latencyMs: integer("latency_ms"),
    tokenUsage: jsonb("token_usage").$type<{
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    }>(),
    supervisorDecision: jsonb("supervisor_decision").$type<Record<string, unknown>>(),
    agentsUsed: jsonb("agents_used").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    handoffs: jsonb("handoffs").$type<
      Array<{ from: string; to: string; reason: string }>
    >().notNull().default(sql`'[]'::jsonb`),
    riskLevel: text("risk_level").notNull().default("low"),
    approvalStatus: text("approval_status").notNull().default("not_required"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdIdx: index("ai_agent_runs_created_at_idx").on(table.createdAt),
    providerIdx: index("ai_agent_runs_provider_idx").on(table.provider),
    intentIdx: index("ai_agent_runs_intent_idx").on(table.intent),
  }),
);

export const aiActionDrafts = pgTable(
  "ai_action_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => aiAgentRuns.id, { onDelete: "set null" }),
    actionType: text("action_type").notNull(),
    agentId: text("agent_id").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    riskLevel: text("risk_level").notNull(),
    safetyLevel: text("safety_level").notNull(),
    approvalStatus: text("approval_status").notNull().default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runIdx: index("ai_action_drafts_run_idx").on(table.runId),
    actionIdx: index("ai_action_drafts_action_idx").on(table.actionType),
    statusIdx: index("ai_action_drafts_status_idx").on(table.approvalStatus),
  }),
);

export const aiAgentEvents = pgTable(
  "ai_agent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => aiAgentRuns.id, { onDelete: "set null" }),
    agentId: text("agent_id").notNull(),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runIdx: index("ai_agent_events_run_idx").on(table.runId),
    agentIdx: index("ai_agent_events_agent_idx").on(table.agentId),
    createdIdx: index("ai_agent_events_created_idx").on(table.createdAt),
  }),
);

export const aiContextSnapshots = pgTable(
  "ai_context_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    snapshotKey: text("snapshot_key").notNull(),
    dataAccessLevel: text("data_access_level").notNull(),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("ai_context_snapshots_outlet_idx").on(table.outletId),
    keyIdx: index("ai_context_snapshots_key_idx").on(table.snapshotKey),
    expiresIdx: index("ai_context_snapshots_expires_idx").on(table.expiresAt),
  }),
);

export const aiOwnerChatHistory = pgTable(
  "ai_owner_chat_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => aiAgentRuns.id, { onDelete: "set null" }),
    prompt: text("prompt").notNull(),
    response: text("response").notNull(),
    provider: text("provider"),
    model: text("model"),
    profile: text("profile"),
    tool: text("tool"),
    dataAccessLevel: text("data_access_level"),
    latencyMs: integer("latency_ms"),
    tokenUsage: jsonb("token_usage").$type<{
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    }>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIdx: index("ai_owner_chat_history_owner_idx").on(table.ownerId),
    ownerCreatedIdx: index("ai_owner_chat_history_owner_created_idx").on(
      table.ownerId,
      table.createdAt,
    ),
    runIdx: index("ai_owner_chat_history_run_idx").on(table.runId),
  }),
);

export const googleDriveConnections = pgTable(
  "google_drive_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    googleEmail: text("google_email"),
    googleName: text("google_name"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    scope: text("scope"),
    tokenType: text("token_type").notNull().default("Bearer"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastStatus: text("last_status").notNull().default("connected"),
    lastError: text("last_error"),
    lastUploadAt: timestamp("last_upload_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: uniqueIndex("google_drive_connections_user_id_idx").on(table.userId),
    statusIdx: index("google_drive_connections_status_idx").on(table.lastStatus),
  }),
);

export const siteAssets = pgTable("site_assets", {
  slot: text("slot").primaryKey(),
  publicUrl: text("public_url").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  alt: text("alt").notNull().default(""),
  sizeBytes: integer("size_bytes").notNull(),
  mimeType: text("mime_type").notNull(),
  version: text("version").notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyDocuments = pgTable(
  "company_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    summary: text("summary").notNull().default(""),
    ownerRole: text("owner_role").notNull(),
    confidentiality: text("confidentiality").notNull().default("internal"),
    status: text("status").notNull().default("active"),
    currentVersion: integer("current_version").notNull().default(1),
    allowedRoles: jsonb("allowed_roles").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    source: text("source").notNull().default("manual"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index("company_documents_category_idx").on(table.category),
    ownerIdx: index("company_documents_owner_idx").on(table.ownerRole),
    statusIdx: index("company_documents_status_idx").on(table.status),
  }),
);

export const companyDocumentVersions = pgTable(
  "company_document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => companyDocuments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storagePath: text("storage_path").notNull(),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentIdx: index("company_document_versions_document_idx").on(table.documentId),
    documentVersionIdx: uniqueIndex("company_document_versions_document_version_idx").on(
      table.documentId,
      table.version,
    ),
    createdIdx: index("company_document_versions_created_idx").on(table.createdAt),
  }),
);

export const trainingCourses = pgTable(
  "training_courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    targetRoles: jsonb("target_roles").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    summary: text("summary").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index("training_courses_category_idx").on(table.category),
    orderIdx: index("training_courses_order_idx").on(table.sortOrder),
    statusIdx: index("training_courses_status_idx").on(table.status),
  }),
);

export const trainingLessons = pgTable(
  "training_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => trainingCourses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    checklist: jsonb("checklist").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    documentSlug: text("document_slug"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courseIdx: index("training_lessons_course_idx").on(table.courseId),
    orderIdx: index("training_lessons_order_idx").on(table.sortOrder),
  }),
);

export const trainingProgress = pgTable(
  "training_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => trainingCourses.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("in_progress"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCourseIdx: uniqueIndex("training_progress_user_course_idx").on(
      table.userId,
      table.courseId,
    ),
    userIdx: index("training_progress_user_idx").on(table.userId),
    courseIdx: index("training_progress_course_idx").on(table.courseId),
  }),
);

export const companyOrgRoles = pgTable(
  "company_org_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleTitle: text("role_title").notNull(),
    personName: text("person_name"),
    reportsTo: text("reports_to"),
    division: text("division").notNull(),
    responsibility: text("responsibility").notNull(),
    authority: text("authority").notNull().default(""),
    kpi: jsonb("kpi").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    roleIdx: uniqueIndex("company_org_roles_title_idx").on(table.roleTitle),
    divisionIdx: index("company_org_roles_division_idx").on(table.division),
    orderIdx: index("company_org_roles_order_idx").on(table.sortOrder),
  }),
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    time: text("time").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    object: text("object").notNull(),
    device: text("device").notNull(),
    status: text("status").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdIdx: index("audit_logs_created_at_idx").on(table.createdAt),
    actorIdx: index("audit_logs_actor_idx").on(table.actor),
    actionIdx: index("audit_logs_action_idx").on(table.action),
  }),
);

export const staffEarningPayouts = pgTable(
  "staff_earning_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    cycleStart: timestamp("cycle_start", { withTimezone: true }).notNull(),
    cycleEnd: timestamp("cycle_end", { withTimezone: true }).notNull(),
    itemCountFood: integer("item_count_food").notNull().default(0),
    itemCountDrink: integer("item_count_drink").notNull().default(0),
    itemCountPackaging: integer("item_count_packaging").notNull().default(0),
    itemCountService: integer("item_count_service").notNull().default(0),
    itemCountCashier: integer("item_count_cashier").notNull().default(0),
    totalAmount: integer("total_amount").notNull().default(0),
    status: text("status").notNull().default("pending"),
    note: text("note"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidBy: text("paid_by").references(() => user.id, { onDelete: "set null" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentRef: text("payment_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    staffIdx: index("staff_earning_payouts_staff_idx").on(table.staffUserId),
    statusIdx: index("staff_earning_payouts_status_idx").on(table.status),
    cycleIdx: index("staff_earning_payouts_cycle_idx").on(table.cycleStart),
    staffCycleIdx: uniqueIndex("staff_earning_payouts_staff_cycle_idx").on(
      table.staffUserId,
      table.cycleStart,
    ),
  }),
);

export const staffEarnings = pgTable(
  "staff_earnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    ticketId: uuid("ticket_id").references(() => kitchenTickets.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    itemKind: text("item_kind").notNull(),
    role: text("role"),
    event: text("event").notNull().default("ticket_ready"),
    qty: integer("qty").notNull().default(1),
    unitFee: integer("unit_fee").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("accrued"),
    payoutId: uuid("payout_id").references(() => staffEarningPayouts.id, {
      onDelete: "set null",
    }),
    cycleStart: timestamp("cycle_start", { withTimezone: true }).notNull(),
    cycleEnd: timestamp("cycle_end", { withTimezone: true }).notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reverseReason: text("reverse_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    staffIdx: index("staff_earnings_staff_idx").on(table.staffUserId),
    statusIdx: index("staff_earnings_status_idx").on(table.status),
    payoutIdx: index("staff_earnings_payout_idx").on(table.payoutId),
    orderItemIdx: index("staff_earnings_order_item_id_idx").on(table.orderItemId),
    cycleIdx: index("staff_earnings_cycle_idx").on(table.cycleStart),
    ticketIdx: index("staff_earnings_ticket_idx").on(table.ticketId),
    orderIdx: index("staff_earnings_order_idx").on(table.orderId),
  }),
);

export const earningsFailedQueue = pgTable(
  "earnings_failed_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    lastTriedAt: timestamp("last_tried_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    pendingIdx: index("earnings_failed_queue_pending_idx").on(table.resolvedAt, table.createdAt),
  }),
);

// ── Internal chat ────────────────────────────────────────────────────────
// chat_channels: type='direct' (DM 1-on-1), 'role' (auto member by role),
// 'broadcast' (owner -> all). Untuk direct, name otomatis dari peer member.
export const chatChannels = pgTable(
  "chat_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    name: text("name"),
    roleKey: text("role_key"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    typeIdx: index("chat_channels_type_idx").on(table.type),
    roleIdx: index("chat_channels_role_key_idx").on(table.roleKey),
    lastMsgIdx: index("chat_channels_last_message_at_idx").on(table.lastMessageAt),
  }),
);

export const chatChannelMembers = pgTable(
  "chat_channel_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    muted: boolean("muted").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqMember: uniqueIndex("chat_channel_members_channel_user_idx").on(
      table.channelId,
      table.userId,
    ),
    userIdx: index("chat_channel_members_user_idx").on(table.userId),
  }),
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    attachmentUrl: text("attachment_url"),
    attachmentType: text("attachment_type"),
    attachmentSize: integer("attachment_size"),
    replyToId: uuid("reply_to_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelCreatedIdx: index("chat_messages_channel_created_idx").on(
      table.channelId,
      table.createdAt,
    ),
    senderIdx: index("chat_messages_sender_idx").on(table.senderUserId),
  }),
);

// ── Audit Cases (Smart Audit case management) ─────────────────────────
export const auditCases = pgTable(
  "audit_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flagKind: text("flag_kind").notNull(),
    severity: text("severity").notNull().default("watch"),
    actorUserId: text("actor_user_id"),
    actorName: text("actor_name"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("open"),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    notes: jsonb("notes")
      .$type<Array<{ by: string; byName: string; text: string; at: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("audit_cases_status_idx").on(table.status),
    actorIdx: index("audit_cases_actor_idx").on(table.actorUserId),
    createdIdx: index("audit_cases_created_at_idx").on(table.createdAt),
  }),
);

// ── Staff Tasks (Garage CEO AI → karyawan) ───────────────────────────
// Tugas yang di-assign ke role tertentu (channel role) atau user spesifik.
// source: 'ceo_ai' (di-broadcast oleh Garage CEO AI) | 'manual'.
// priority: low | medium | high. status: open | acknowledged | done | cancelled.
export const staffTasks = pgTable(
  "staff_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetRole: text("target_role").notNull(),
    assigneeUserId: text("assignee_user_id").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("open"),
    source: text("source").notNull().default("manual"),
    sourceRunId: uuid("source_run_id"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: text("acknowledged_by").references(() => user.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by").references(() => user.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    targetRoleIdx: index("staff_tasks_target_role_idx").on(table.targetRole),
    statusIdx: index("staff_tasks_status_idx").on(table.status),
    assigneeIdx: index("staff_tasks_assignee_idx").on(table.assigneeUserId),
    sourceIdx: index("staff_tasks_source_idx").on(table.source),
    createdAtIdx: index("staff_tasks_created_at_idx").on(table.createdAt),
  }),
);

export type StaffRole = typeof staffProfiles.$inferSelect.role;

// ── CRM Custom Segments ──────────────────────────────────────────────────────
// Pre-computed customer segments built with a visual rule builder.
// rules JSON shape: Array<{ field: string; op: string; value: string|number|boolean; logic?: "AND"|"OR" }>
export const customSegments = pgTable(
  "custom_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    rules: jsonb("rules").$type<SegmentRule[]>().notNull().default(sql`'[]'::jsonb`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index("custom_segments_name_idx").on(table.name),
    createdByIdx: index("custom_segments_created_by_idx").on(table.createdBy),
    createdAtIdx: index("custom_segments_created_at_idx").on(table.createdAt),
  }),
);

// Pre-computed membership of each custom segment.
// Repopulated whenever the segment rules are saved.
export const customSegmentCustomers = pgTable(
  "custom_segment_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => customSegments.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
  },
  (table) => ({
    segmentIdx: index("custom_segment_customers_segment_idx").on(table.segmentId),
    customerIdx: index("custom_segment_customers_customer_idx").on(table.customerId),
    uniqIdx: uniqueIndex("custom_segment_customers_segment_customer_idx").on(
      table.segmentId,
      table.customerId,
    ),
  }),
);

// Union type describing all supported rule field + operator combinations.
export type SegmentRuleField =
  | "tier"
  | "totalSpend"
  | "visits"
  | "points"
  | "daysSinceVisit"
  | "hasTag"
  | "hasVoucher"
  | "birthdayThisWeek"
  | "createdAfter"
  | "createdBefore";

export type SegmentRuleOp =
  | "equals"
  | "notEquals"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "contains";

export type SegmentRule = {
  field: SegmentRuleField;
  op: SegmentRuleOp;
  value: string | number | boolean;
  logic?: "AND" | "OR";
};


export const employeeAttendances = pgTable(
  "employee_attendances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").notNull().references(() => staffProfiles.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // 'in' or 'out'
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    // Bukti lokasi punch + jarak ke titik presensi (meter) saat dicatat.
    latitude: real("latitude"),
    longitude: real("longitude"),
    distanceMeters: real("distance_meters"),
    // Status kepatuhan vs jadwal shift: 'normal' | 'on_time' | 'late' | 'early_leave'.
    status: text("status").notNull().default("normal"),
    // Jadwal yang dipakai sebagai acuan (bila ada) + catatan tambahan.
    scheduleId: uuid("schedule_id").references(() => shiftSchedules.id, { onDelete: "set null" }),
    note: text("note"),
    // Selfie wajah saat punch (anti titip-absen). Path publik di /uploads/attendance.
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    staffIdx: index("employee_attendances_staff_idx").on(table.staffId),
    outletIdx: index("employee_attendances_outlet_idx").on(table.outletId),
    timeIdx: index("employee_attendances_time_idx").on(table.timestamp),
    staffTimeIdx: index("employee_attendances_staff_time_idx").on(table.staffId, table.timestamp),
  })
);

export const shiftSchedules = pgTable(
  "shift_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").notNull().references(() => staffProfiles.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    shiftType: text("shift_type").notNull(), // 'morning', 'evening', 'off'
    startTime: text("start_time"), // '08:00'
    endTime: text("end_time"), // '16:00'
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    staffIdx: index("shift_schedules_staff_idx").on(table.staffId),
    dateIdx: index("shift_schedules_date_idx").on(table.date),
  })
);

export const sopChecklists = pgTable(
  "sop_checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    roleTarget: text("role_target").notNull(), // e.g., 'Kasir', 'Barista', 'All'
    shiftTarget: text("shift_target").notNull(), // 'morning', 'evening', 'all'
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const sopLogs = pgTable(
  "sop_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checklistId: uuid("checklist_id").notNull().references(() => sopChecklists.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").notNull().references(() => staffProfiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: text("status").notNull(), // 'done', 'skipped'
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    checklistIdx: index("sop_logs_checklist_idx").on(table.checklistId),
    dateIdx: index("sop_logs_date_idx").on(table.date),
  })
);

export const kpiEvaluations = pgTable(
  "kpi_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").notNull().references(() => staffProfiles.id, { onDelete: "cascade" }),
    evaluatorId: text("evaluator_id").references(() => user.id, { onDelete: "set null" }),
    period: text("period").notNull(), // e.g., '2026-05'
    score: real("score").notNull(),
    feedback: text("feedback"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    staffIdx: index("kpi_evaluations_staff_idx").on(table.staffId),
    periodIdx: index("kpi_evaluations_period_idx").on(table.period),
  })
);

export const staffSalaries = pgTable(
  "staff_salaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").notNull().references(() => staffProfiles.id, { onDelete: "cascade" }),
    baseSalary: integer("base_salary").notNull(),
    allowance: integer("allowance").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    staffIdx: index("staff_salaries_staff_idx").on(table.staffId),
  })
);

export const staffPayrolls = pgTable(
  "staff_payrolls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").notNull().references(() => staffProfiles.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    baseSalary: integer("base_salary").notNull(),
    allowance: integer("allowance").notNull(),
    bonus: integer("bonus").notNull().default(0),
    deduction: integer("deduction").notNull().default(0),
    netSalary: integer("net_salary").notNull(),
    status: text("status").notNull().default("draft"), // 'draft', 'approved', 'paid'
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    staffIdx: index("staff_payrolls_staff_idx").on(table.staffId),
    periodIdx: index("staff_payrolls_period_idx").on(table.period),
    statusIdx: index("staff_payrolls_status_idx").on(table.status),
  })
);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    targetRole: text("target_role").notNull().default("All"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("announcements_outlet_idx").on(table.outletId),
  })
);

export const staffAdvances = pgTable(
  "staff_advances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").notNull().references(() => staffProfiles.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // Format 'YYYY-MM'
    amount: integer("amount").notNull(),
    reason: text("reason"),
    status: text("status").notNull().default("pending"), // 'pending', 'approved', 'deducted', 'rejected'
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    staffIdx: index("staff_advances_staff_idx").on(table.staffId),
    periodIdx: index("staff_advances_period_idx").on(table.period),
    statusIdx: index("staff_advances_status_idx").on(table.status),
  })
);

export const staffShiftHandovers = pgTable(
  "staff_shift_handovers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
    fromStaffId: uuid("from_staff_id").notNull().references(() => staffProfiles.id, { onDelete: "cascade" }),
    toStaffId: uuid("to_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    fromShift: text("from_shift").notNull(), // 'pagi' | 'sore' | 'malam'
    toShift: text("to_shift").notNull(),
    cashInDrawer: integer("cash_in_drawer").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("pending_validation"), // pending_validation | validated | disputed
    disputeReason: text("dispute_reason"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("staff_shift_handovers_outlet_idx").on(table.outletId),
    statusIdx: index("staff_shift_handovers_status_idx").on(table.status),
    createdIdx: index("staff_shift_handovers_created_at_idx").on(table.createdAt),
  })
);

export const operationLocations = pgTable(
  "operation_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g., 'Outlet Utama', 'Kunjungan Servis Matraman'
    type: text("type").notNull(), // 'presensi' atau 'kunjungan'
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    radius: integer("radius").notNull().default(100), // radius toleransi dalam meter
    address: text("address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("operation_locations_outlet_idx").on(table.outletId),
    typeIdx: index("operation_locations_type_idx").on(table.type),
  })
);

export const operationGlossary = pgTable(
  "operation_glossary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    term: text("term").notNull(), // e.g., 'Dialing Espresso', 'CV Joint', 'Oli SAE 10W-30'
    definition: text("definition").notNull(),
    category: text("category").notNull(), // 'F&B Kafe', 'Bengkel Motor', 'Umum'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    termIdx: index("operation_glossary_term_idx").on(table.term),
    categoryIdx: index("operation_glossary_category_idx").on(table.category),
  })
);

// Compliance tracker — pajak, BPJS, izin usaha, sertifikat halal/training, dll.
// Owner perlu tahu apa yang akan kadaluarsa supaya tidak kena denda atau
// terhenti operasi. category bebas-text supaya outlet baru bisa menambah
// kategori sendiri tanpa migrasi.
export const complianceItems = pgTable(
  "compliance_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
    category: text("category").notNull(), // 'Pajak' | 'BPJS' | 'Izin' | 'Sertifikat' | 'Training' | dst
    name: text("name").notNull(), // contoh: 'SPT Tahunan PPh Badan'
    issuer: text("issuer"), // contoh: 'DJP', 'BPJS Kesehatan'
    refNumber: text("ref_number"), // nomor referensi/SK/NPWP/SIUP
    issuedAt: date("issued_at"),
    expiresAt: date("expires_at"), // null = tidak ada kadaluarsa (mis. NPWP)
    reminderDays: integer("reminder_days").notNull().default(30),
    status: text("status").notNull().default("active"), // active | grace | expired | archived
    attachmentUrl: text("attachment_url"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("compliance_items_outlet_idx").on(table.outletId),
    categoryIdx: index("compliance_items_category_idx").on(table.category),
    expiresIdx: index("compliance_items_expires_idx").on(table.expiresAt),
    statusIdx: index("compliance_items_status_idx").on(table.status),
  }),
);

// ─── Recruitment: kandidat open hiring (Garage Recruitment System) ──────────
// Data dikumpulkan dari form publik /recruitment, dikelola admin/HR/CEO di OS.
export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Data pribadi
    fullName: text("full_name").notNull(),
    whatsapp: text("whatsapp").notNull(),
    email: text("email").notNull(),
    domicile: text("domicile").notNull(),
    birthDate: date("birth_date"),
    gender: text("gender"),
    // Posisi & ketersediaan
    appliedPosition: text("applied_position").notNull(),
    preferredLocation: text("preferred_location"),
    workType: text("work_type"),
    availableStartDate: date("available_start_date"),
    willingShift: boolean("willing_shift").notNull().default(false),
    willingRelocate: boolean("willing_relocate").notNull().default(false),
    // Pendidikan & pengalaman
    education: text("education"),
    lastExperience: text("last_experience"),
    experienceDuration: text("experience_duration"),
    previousCompany: text("previous_company"),
    resignReason: text("resign_reason"),
    // Skill & karakter
    mainSkill: text("main_skill"),
    skillLevel: text("skill_level"),
    strength: text("strength"),
    weakness: text("weakness"),
    motivation: text("motivation"),
    customerExperience: text("customer_experience"),
    // Ekspektasi
    expectedSalary: integer("expected_salary"),
    interviewAvailability: text("interview_availability"),
    // Dokumen
    cvUrl: text("cv_url"),
    photoUrl: text("photo_url"),
    ktpUrl: text("ktp_url"),
    certificateUrl: text("certificate_url"),
    portfolioUrl: text("portfolio_url"),
    instagramUrl: text("instagram_url"),
    tiktokUrl: text("tiktok_url"),
    linkedinUrl: text("linkedin_url"),
    socialMediaUrl: text("social_media_url"),
    // Sumber pelamar — dari mana tahu lowongan (Instagram/TikTok/Teman/Poster/dll)
    referralSource: text("referral_source"),
    // Manajemen (pipeline / scoring / follow-up)
    status: text("status").notNull().default("Baru"),
    score: integer("score"),
    notes: text("notes"),
    assignedTo: text("assigned_to"),
    followUpDate: date("follow_up_date"),
    finalDecision: text("final_decision"),
    // Jadwal Interview (Superpowers Goal)
    interviewDate: timestamp("interview_date", { withTimezone: true }),
    interviewLink: text("interview_link"),
    // Data parsing AI
    cvParsedData: jsonb("cv_parsed_data"),
    // Diterima → dijadikan karyawan (Payroll V2 / absen): kode karyawan & waktu.
    hiredAt: timestamp("hired_at", { withTimezone: true }),
    hiredEmployeeCode: text("hired_employee_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("candidates_status_idx").on(table.status),
    positionIdx: index("candidates_position_idx").on(table.appliedPosition),
    locationIdx: index("candidates_location_idx").on(table.preferredLocation),
    createdIdx: index("candidates_created_idx").on(table.createdAt),
  }),
);
// ─── Recruitment Positions: posisi yang dibuka (dinamis, bisa buka/tutup) ──
// Dikelola oleh CEO/Admin dari OS. Pelamar di /recruitment melihat isOpen=true.
export const recruitmentPositions = pgTable(
  "recruitment_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    location: text("location").notNull().default("Tebing Tinggi"),
    type: text("type").notNull().default("Full-time"),
    experience: text("experience").notNull().default(""),
    description: text("description").notNull().default(""),
    isOpen: boolean("is_open").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("recruitment_positions_slug_idx").on(table.slug),
    isOpenIdx: index("recruitment_positions_is_open_idx").on(table.isOpen),
    sortIdx: index("recruitment_positions_sort_idx").on(table.sortOrder),
  }),
);

// Pusat notifikasi staf (feed per outlet). `audience` = siapa yang menerima:
// "cashier" (pegang uang), "courier", "production", "management", "all", atau
// "user" (khusus `userId`). Status baca per user di staff_notification_reads.
export const staffNotifications = pgTable(
  "staff_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
    audience: text("audience").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    severity: text("severity").notNull().default("info"), // info | warning | urgent
    title: text("title").notNull(),
    body: text("body"),
    url: text("url"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    // Kunci anti-dobel (mis. "qr_new:<orderId>").
    dedupKey: text("dedup_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletCreatedIdx: index("staff_notifications_outlet_created_idx").on(table.outletId, table.createdAt),
    userIdx: index("staff_notifications_user_idx").on(table.userId),
    dedupIdx: uniqueIndex("staff_notifications_dedup_idx").on(table.dedupKey),
  }),
);

export const staffNotificationReads = pgTable(
  "staff_notification_reads",
  {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => staffNotifications.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: uniqueIndex("staff_notification_reads_pk").on(table.notificationId, table.userId),
  }),
);

// Web Push untuk PELANGGAN (tanpa akun): langganan diikat ke satu order.
export const orderPushSubscriptions = pgTable(
  "order_push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    keyP256dh: text("key_p256dh").notNull(),
    keyAuth: text("key_auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderEndpointIdx: uniqueIndex("order_push_subscriptions_order_endpoint_idx").on(table.orderId, table.endpoint),
  }),
);

// Kunci sistem yang dibuat otomatis (mis. VAPID web push). Tidak pernah
// diekspos lewat API pengaturan.
export const systemKeys = pgTable("system_keys", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 🔊 Smart Notification Logs
export const notificationLogs = pgTable(
  "notification_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    triggerKey: text("trigger_key").notNull(),
    tableNo: text("table_no"),
    orderNo: text("order_no"),
    audioUrl: text("audio_url"),
    audioSource: text("audio_source"),
    voiceGeneratedAt: timestamp("voice_generated_at", { withTimezone: true }),
    ttsProvider: text("tts_provider"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    triggerKeyIdx: index("notification_logs_trigger_key_idx").on(table.triggerKey),
    createdAtIdx: index("notification_logs_created_at_idx").on(table.createdAt),
  }),
);

// =============================================================================
// GARAGE WMS — Warehouse Management System (subsistem independen, terhubung POS
// lewat webhook). Semua tabel prefix wms_. Mutasi stok WAJIB lewat wms_stock_movement.
// =============================================================================

export const wmsWarehouse = pgTable("wms_warehouse", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // main | bar | kitchen
  area: text("area").notNull().default("umum"), // bar | dapur | umum — bedakan 2 ruang gudang utama
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Master kategori bahan (bebas ditambah owner). area = pengelompokan outlet:
// bar | dapur | umum → memudahkan pisahkan bahan Bar vs Dapur di seluruh sistem.
export const wmsCategory = pgTable("wms_category", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  area: text("area").notNull().default("umum"), // bar | dapur | umum
  // Arsip (bukan hapus): baris tetap ada supaya lookup area bahan lama tetap jalan.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Master supplier (didaftarkan owner, dipilih saat Receiving).
export const wmsSupplier = pgTable("wms_supplier", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  phone: text("phone").notNull().default(""), // nomor WhatsApp
  address: text("address").notNull().default(""),
  note: text("note").notNull().default(""),
  // Phase 2 (pengadaan): PIC, area layanan, kategori produk, cara & termin bayar.
  picName: text("pic_name").notNull().default(""),
  areas: jsonb("areas").$type<string[]>().notNull().default(sql`'[]'::jsonb`), // bar | dapur | umum | teknik
  productCategories: text("product_categories").notNull().default(""),
  paymentMethod: text("payment_method").notNull().default(""), // cash | transfer | tempo
  paymentTermDays: integer("payment_term_days").notNull().default(0),
  // Rekening tujuan transfer — hanya untuk Owner/Manajer (API menyembunyikannya dari peran lain).
  bankName: text("bank_name").notNull().default(""),
  bankAccountNumber: text("bank_account_number").notNull().default(""),
  bankAccountName: text("bank_account_name").notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Kolom uang/kuantitas WMS: numeric desimal EKSAK (mode number → tetap JS number).
// Menghindari drift float pada HPP per-unit pecahan (Rp0,12/gram) & akumulasi nilai.
const wmsNum = (name: string) => numeric(name, { precision: 14, scale: 4, mode: "number" });

export const wmsProduct = pgTable(
  "wms_product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory").notNull().default(""),
    brand: text("brand").notNull().default(""),
    // Supplier utama (default PO/receiving); riwayat harga tetap dari receiving.
    defaultSupplierId: uuid("default_supplier_id").references(() => wmsSupplier.id, { onDelete: "set null" }),
    unit: text("unit").notNull(),
    minStock: wmsNum("min_stock").notNull().default(0),
    hpp: wmsNum("hpp").notNull().default(0), // harga modal rata-rata (boleh pecahan)
    imageUrl: text("image_url"), // foto bahan baku (opsional)
    barcode: text("barcode"), // barcode asli kemasan supplier (EAN/UPC), opsional
    archivedAt: timestamp("archived_at", { withTimezone: true }), // soft-delete: jejak laporan tetap utuh
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    categoryIdx: index("wms_product_category_idx").on(t.category),
    barcodeIdx: index("wms_product_barcode_idx").on(t.barcode),
  }),
);

export const wmsWarehouseStock = pgTable(
  "wms_warehouse_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => wmsProduct.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => wmsWarehouse.id, { onDelete: "cascade" }),
    qty: wmsNum("qty").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pwIdx: uniqueIndex("wms_warehouse_stock_product_wh_idx").on(t.productId, t.warehouseId),
  }),
);

export const wmsBatch = pgTable(
  "wms_batch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => wmsProduct.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
    batchNo: text("batch_no").notNull(),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    qty: wmsNum("qty").notNull().default(0),
    hpp: wmsNum("hpp").notNull().default(0),
    location: text("location").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index("wms_batch_product_idx").on(t.productId),
    fefoIdx: index("wms_batch_fefo_idx").on(t.productId, t.expiredAt),
  }),
);

// Purchase Order tersimpan (ala ERPNext Purchase Order): draft → sent → partial →
// received | cancelled. Penerimaan merujuk PO; qty diterima diakumulasi per baris.
export const wmsPurchaseOrder = pgTable(
  "wms_purchase_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    doc: text("doc").notNull().unique(),
    supplierId: uuid("supplier_id").references(() => wmsSupplier.id, { onDelete: "set null" }),
    supplierName: text("supplier_name").notNull().default(""),
    warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft"),
    expectedDate: text("expected_date"), // YYYY-MM-DD
    note: text("note").notNull().default(""),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Phase 2: persetujuan, alur kirim WhatsApp, konfirmasi supplier, revisi dokumen.
    // status: draft | pending_approval | approved | wa_opened | sent | confirmed | processing | partial | received | cancelled
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    waOpenedAt: timestamp("wa_opened_at", { withTimezone: true }),
    sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    processingAt: timestamp("processing_at", { withTimezone: true }),
    /** Naik setiap PO diubah setelah dokumen pernah dikirim ke supplier (PDF bertanda REVISI n). */
    revision: integer("revision").notNull().default(0),
    /** Revisi terakhir yang benar-benar terkirim (null = belum pernah). */
    sentRevision: integer("sent_revision"),
    showPrices: boolean("show_prices").notNull().default(true),
    paymentTerms: text("payment_terms").notNull().default(""),
    deliveryNote: text("delivery_note").notNull().default(""),
  },
  (t) => ({ statusIdx: index("wms_purchase_order_status_idx").on(t.status, t.createdAt) }),
);

/**
 * Jejak pengiriman PO ke supplier (audit): PDF dibuat, WhatsApp dibuka, terkirim (konfirmasi
 * manual petugas / bukti API resmi), konfirmasi supplier. Tidak pernah diubah — hanya ditambah.
 */
export const wmsPoDispatch = pgTable(
  "wms_po_dispatch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => wmsPurchaseOrder.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(0),
    /** whatsapp_manual | whatsapp_cloud | system */
    channel: text("channel").notNull(),
    /** pdf_generated | wa_opened | sent_confirmed | provider_accepted | provider_failed | supplier_confirmed | supplier_processing */
    event: text("event").notNull(),
    supplierId: uuid("supplier_id").references(() => wmsSupplier.id, { onDelete: "set null" }),
    supplierName: text("supplier_name").notNull().default(""),
    recipient: text("recipient").notNull().default(""),
    pdfSha256: text("pdf_sha256"),
    providerMessageId: text("provider_message_id"),
    providerStatus: text("provider_status"),
    note: text("note").notNull().default(""),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    userName: text("user_name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ poIdx: index("wms_po_dispatch_po_idx").on(t.purchaseOrderId, t.createdAt) }),
);

/** Bahan yang disediakan supplier: harga referensi + peran utama/alternatif. */
export const wmsSupplierProduct = pgTable(
  "wms_supplier_product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => wmsSupplier.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => wmsProduct.id, { onDelete: "cascade" }),
    /** Harga referensi per satuan dasar (bukan harga final; final = invoice/receiving). */
    refPrice: wmsNum("ref_price").notNull().default(0),
    /** primary | alternative */
    role: text("role").notNull().default("alternative"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ spIdx: uniqueIndex("wms_supplier_product_sp_idx").on(t.supplierId, t.productId) }),
);

/**
 * Tagihan supplier dari penerimaan tempo / pembayaran bertahap. BUKAN biaya baru: biaya
 * pembelian tetap satu baris expenses dari penerimaan (sourceDoc WMS:<doc>#area). Tagihan
 * hanya melacak sisa hutang & pembayaran supaya tidak ada pengeluaran ganda.
 */
export const wmsSupplierBill = pgTable(
  "wms_supplier_bill",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    doc: text("doc").notNull().unique(),
    supplierId: uuid("supplier_id").references(() => wmsSupplier.id, { onDelete: "set null" }),
    supplierName: text("supplier_name").notNull().default(""),
    purchaseOrderId: uuid("purchase_order_id").references(() => wmsPurchaseOrder.id, { onDelete: "set null" }),
    receivingId: uuid("receiving_id").references(() => wmsReceiving.id, { onDelete: "set null" }),
    invoiceNo: text("invoice_no").notNull().default(""),
    invoiceDate: date("invoice_date"),
    dueDate: date("due_date"),
    amount: integer("amount").notNull(),
    paidAmount: integer("paid_amount").notNull().default(0),
    /** unpaid | partial | paid | void */
    status: text("status").notNull().default("unpaid"),
    invoiceUrl: text("invoice_url"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    receivingUidx: uniqueIndex("wms_supplier_bill_receiving_uidx").on(t.receivingId),
    statusIdx: index("wms_supplier_bill_status_idx").on(t.status, t.dueDate),
  }),
);

/**
 * Pembayaran / DP ke supplier. Mencatat sumber dana, nominal, petugas, referensi, bukti,
 * persetujuan. Tidak membuat baris expenses dan tidak memotong laci kasir.
 */
export const wmsSupplierPayment = pgTable(
  "wms_supplier_payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    doc: text("doc").notNull().unique(),
    billId: uuid("bill_id").references(() => wmsSupplierBill.id, { onDelete: "set null" }),
    /** DP sebelum barang datang menempel ke PO; ditautkan ke tagihan saat penerimaan selesai. */
    purchaseOrderId: uuid("purchase_order_id").references(() => wmsPurchaseOrder.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => wmsSupplier.id, { onDelete: "set null" }),
    /** payment | dp */
    kind: text("kind").notNull().default("payment"),
    amount: integer("amount").notNull(),
    /** cash | transfer */
    method: text("method").notNull(),
    /** bank_jago | bank_bni | petty | external (uang Owner) — tidak pernah laci kasir */
    fundSource: text("fund_source").notNull(),
    reference: text("reference").notNull().default(""),
    proofUrl: text("proof_url"),
    /** pending_verification | verified | void */
    status: text("status").notNull().default("pending_verification"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdByName: text("created_by_name").notNull().default(""),
    verifiedBy: text("verified_by").references(() => user.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    billIdx: index("wms_supplier_payment_bill_idx").on(t.billId),
    poIdx: index("wms_supplier_payment_po_idx").on(t.purchaseOrderId),
  }),
);

export const wmsPurchaseOrderItem = pgTable(
  "wms_purchase_order_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => wmsPurchaseOrder.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    orderedQty: wmsNum("ordered_qty").notNull(),
    receivedQty: wmsNum("received_qty").notNull().default(0),
    unitPrice: wmsNum("unit_price").notNull().default(0), // Rp per satuan simpan
    // Kemasan saat dipesan (cetak "4 kotak @ Rp45.000"); null = satuan dasar.
    uom: text("uom"),
    uomFactor: wmsNum("uom_factor"),
    /** Asal kebutuhan (mis. ["MRQ-…/Bar"]) — tetap terlihat walau bahan digabung per supplier. */
    sourceRefs: jsonb("source_refs").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (t) => ({ poIdx: index("wms_purchase_order_item_po_idx").on(t.purchaseOrderId) }),
);

// Aturan reorder per ruang (ala ERPNext Item Reorder per warehouse): stok ruang ≤ min →
// isi sampai max. Outlet Bar/Dapur diisi dari gudang utama areanya dulu, sisanya beli.
export const wmsReorderRule = pgTable(
  "wms_reorder_rule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => wmsProduct.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => wmsWarehouse.id, { onDelete: "cascade" }),
    minQty: wmsNum("min_qty").notNull(),
    maxQty: wmsNum("max_qty").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pwIdx: uniqueIndex("wms_reorder_rule_product_wh_idx").on(t.productId, t.warehouseId) }),
);

export const wmsReceiving = pgTable("wms_receiving", {
  id: uuid("id").primaryKey().defaultRandom(),
  doc: text("doc").notNull().unique(),
  supplier: text("supplier").notNull().default(""), // snapshot nama (tampil di dokumen lama)
  supplierId: uuid("supplier_id").references(() => wmsSupplier.id, { onDelete: "set null" }),
  poNumber: text("po_number").notNull().default(""), // No. PO / referensi order
  purchaseOrderId: uuid("purchase_order_id").references(() => wmsPurchaseOrder.id, { onDelete: "set null" }),
  additionalCost: wmsNum("additional_cost").notNull().default(0), // ongkir/pajak → landed cost
  warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"), // draft|pending_approval|completed|cancelled
  // Belanja dibayar langsung (owner, Okt 2026): metode bayar + tanggal barang
  // diterima (= tanggal biaya belanja di laporan keuangan).
  paymentMethod: text("payment_method").notNull().default("Cash"),
  receivedDate: date("received_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: text("cancelled_by").references(() => user.id, { onDelete: "set null" }),
  cancelReason: text("cancel_reason"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wmsReceivingItem = pgTable(
  "wms_receiving_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receivingId: uuid("receiving_id")
      .notNull()
      .references(() => wmsReceiving.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    orderedQty: wmsNum("ordered_qty").notNull().default(0),
    receivedQty: wmsNum("received_qty").notNull().default(0),
    hpp: wmsNum("hpp").notNull().default(0),
    // Konversi satuan beli→simpan: receivedQty = buyQty × packSize (bila diisi).
    buyQty: wmsNum("buy_qty"),
    packSize: wmsNum("pack_size"),
    buyUnit: text("buy_unit"),
    discrepancyNote: text("discrepancy_note").notNull().default(""),
    putAwayLocation: text("put_away_location").notNull().default(""),
    qc: text("qc").notNull().default("pass"), // pass|discrepancy|reject
    batchNo: text("batch_no"),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
  },
  (t) => ({ recIdx: index("wms_receiving_item_rec_idx").on(t.receivingId) }),
);

export const wmsInternalOrder = pgTable(
  "wms_internal_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    doc: text("doc").notNull().unique(),
    outletWarehouseId: uuid("outlet_warehouse_id").references(() => wmsWarehouse.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("draft"),
    totalHpp: wmsNum("total_hpp").notNull().default(0),
    // Idempotensi integrasi POS: penanda sumber (mis. sale:<orderId>). Unik agar
    // retry webhook penjualan yang sama tidak memotong bahan dua kali.
    sourceRef: text("source_ref"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceRefIdx: uniqueIndex("wms_internal_order_source_ref_idx").on(t.sourceRef),
  }),
);

export const wmsInternalOrderItem = pgTable(
  "wms_internal_order_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => wmsInternalOrder.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    batchId: uuid("batch_id").references(() => wmsBatch.id, { onDelete: "set null" }),
    qty: wmsNum("qty").notNull().default(0),
    lineHpp: wmsNum("line_hpp").notNull().default(0),
  },
  (t) => ({ orderIdx: index("wms_internal_order_item_order_idx").on(t.orderId) }),
);

export const wmsRecipe = pgTable("wms_recipe", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  recipeSku: text("recipe_sku").notNull().default(""),
  recipeCode: text("recipe_code").notNull().default(""),
  category: text("category").notNull().default(""),
  subCategory: text("sub_category").notNull().default(""),
  productionArea: text("production_area").notNull().default(""),
  yieldQty: text("yield_qty").notNull().default("1"),
  yieldUnit: text("yield_unit").notNull().default("porsi"),
  sellPrice: integer("sell_price").notNull().default(0),
  /** draft | published | archived */
  recipeStatus: text("recipe_status").notNull().default("published"),
  description: text("description").notNull().default(""),
  /** JSON array langkah produksi/SOP — PRD §9 */
  sopSteps: text("sop_steps").notNull().default("[]"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  /** os:{menuId}:{variantId} untuk sync OS; v1 untuk manual */
  version: text("version").notNull().default("v1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Audit trail perubahan resep (PRD §17–§18). */
export const wmsRecipeAuditLog = pgTable(
  "wms_recipe_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => wmsRecipe.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    step: text("step").notNull().default(""),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ recipeIdx: index("wms_recipe_audit_recipe_idx").on(t.recipeId) }),
);

/** Snapshot versi resep untuk compare/restore (PRD §16). */
export const wmsRecipeVersion = pgTable(
  "wms_recipe_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => wmsRecipe.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    label: text("label").notNull().default(""),
    snapshot: text("snapshot").notNull(),
    cogs: integer("cogs").notNull().default(0),
    sellPrice: integer("sell_price").notNull().default(0),
    foodCostPct: real("food_cost_pct").notNull().default(0),
    actorName: text("actor_name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    recipeIdx: index("wms_recipe_version_recipe_idx").on(t.recipeId),
    recipeVersionIdx: index("wms_recipe_version_recipe_no_idx").on(t.recipeId, t.versionNo),
  }),
);

export const wmsBomItem = pgTable(
  "wms_bom_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => wmsRecipe.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    /** ingredient | packaging | sub_recipe */
    lineType: text("line_type").notNull().default("ingredient"),
    qty: wmsNum("qty").notNull().default(0),
    wastePct: real("waste_pct").notNull().default(0),
    shrinkagePct: real("shrinkage_pct").notNull().default(0),
    notes: text("notes").notNull().default(""),
    subRecipeId: uuid("sub_recipe_id").references(() => wmsProductionRecipe.id, { onDelete: "set null" }),
  },
  (t) => ({ recipeIdx: index("wms_bom_item_recipe_idx").on(t.recipeId) }),
);

// Resep PRODUKSI: olah bahan mentah → produk jadi/setengah-jadi (output = wms_product).
export const wmsProductionRecipe = pgTable("wms_production_recipe", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  outputProductId: uuid("output_product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
  outputQty: wmsNum("output_qty").notNull().default(1), // hasil per 1 batch produksi
  shelfLifeHours: integer("shelf_life_hours"), // umur simpan hasil (jam); null = ikut bahan input
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wmsProductionBom = pgTable(
  "wms_production_bom",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => wmsProductionRecipe.id, { onDelete: "cascade" }),
    inputProductId: uuid("input_product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    qty: wmsNum("qty").notNull().default(0), // bahan per 1 batch
  },
  (t) => ({ recipeIdx: index("wms_production_bom_recipe_idx").on(t.recipeId) }),
);

export const wmsStockOpname = pgTable("wms_stock_opname", {
  id: uuid("id").primaryKey().defaultRandom(),
  doc: text("doc").notNull(),
  warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
  // draft → submitted (penghitung kirim) → completed (Owner/Manajer setujui & posting);
  // ditolak → kembali draft dengan reject_reason. Stok hanya berubah saat completed.
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  submittedBy: text("submitted_by").references(() => user.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectReason: text("reject_reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Phase 3: jenis & cakupan. scope partial = perilaku lama (hanya baris terhitung diposting);
  // full = semua baris wajib dihitung sebelum dikirim; cycle = daftar prioritas (skor risiko).
  kind: text("kind").notNull().default("incidental"), // daily | weekly | monthly | incidental
  scope: text("scope").notNull().default("partial"), // full | partial | cycle
  businessDate: date("business_date"),
  recountRequestedAt: timestamp("recount_requested_at", { withTimezone: true }),
});

export const wmsOpnameLine = pgTable(
  "wms_opname_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opnameId: uuid("opname_id")
      .notNull()
      .references(() => wmsStockOpname.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    systemQty: wmsNum("system_qty").notNull().default(0),
    physicalQty: wmsNum("physical_qty").notNull().default(0),
    // Diisi saat petugas memasukkan hitungan fisik. Baris yang tidak dihitung
    // tidak di-adjust saat finalisasi (penjualan selama opname tidak dibatalkan).
    countedAt: timestamp("counted_at", { withTimezone: true }),
    countedBy: text("counted_by").references(() => user.id, { onDelete: "set null" }),
    // Phase 3: hitungan pertama disimpan (hitung ulang tidak menghapus jejak), klasifikasi toleransi,
    // dan nilai yang benar-benar diposting (historis, dari ledger saat finalisasi).
    firstPhysicalQty: wmsNum("first_physical_qty"),
    firstSystemQty: wmsNum("first_system_qty"),
    countAttempts: integer("count_attempts").notNull().default(0),
    needsRecount: boolean("needs_recount").notNull().default(false),
    recountReason: text("recount_reason").notNull().default(""),
    classification: text("classification"), // match | minor | recount | manager | owner
    postedVariance: wmsNum("posted_variance"),
    postedValue: wmsNum("posted_value"),
    postedRate: wmsNum("posted_rate"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (t) => ({ opnameIdx: index("wms_opname_line_opname_idx").on(t.opnameId) }),
);

/** Riwayat setiap hitungan (append-only): hitung awal & hitung ulang, dengan snapshot stok saat itu. */
export const wmsOpnameCount = pgTable(
  "wms_opname_count",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => wmsOpnameLine.id, { onDelete: "cascade" }),
    opnameId: uuid("opname_id")
      .notNull()
      .references(() => wmsStockOpname.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    kind: text("kind").notNull().default("count"), // count | recount
    physicalQty: wmsNum("physical_qty").notNull(),
    systemQty: wmsNum("system_qty").notNull(),
    /** Rincian input (mis. { packs: 2, factor: 1000, loose: 350 }) — konversi tercatat. */
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>(),
    /** Idempotensi autosave: kiriman ulang dengan id sama tidak menambah percobaan. */
    clientRequestId: text("client_request_id"),
    countedBy: text("counted_by").references(() => user.id, { onDelete: "set null" }),
    countedAt: timestamp("counted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lineIdx: index("wms_opname_count_line_idx").on(t.lineId, t.attempt),
    clientReqIdx: uniqueIndex("wms_opname_count_client_req_idx").on(t.lineId, t.clientRequestId),
  }),
);

/** Tindakan dari rekomendasi Smart Opname (temuan → bukti → tindakan → status). */
export const wmsOpnameAction = pgTable(
  "wms_opname_action",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Kunci unik aturan + bahan + periode supaya rekomendasi sama tidak dobel. */
    dedupKey: text("dedup_key").notNull().unique(),
    rule: text("rule").notNull(),
    productId: uuid("product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
    finding: text("finding").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    confidence: text("confidence").notNull().default("medium"), // low | medium | high
    limitation: text("limitation").notNull().default(""),
    impactValue: integer("impact_value").notNull().default(0),
    recommendation: text("recommendation").notNull(),
    ownerRole: text("owner_role").notNull().default("Manajer"),
    status: text("status").notNull().default("open"), // open | in_progress | done | dismissed
    note: text("note").notNull().default(""),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ statusIdx: index("wms_opname_action_status_idx").on(t.status, t.createdAt) }),
);

export const wmsColdChainReading = pgTable(
  "wms_cold_chain_reading",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitCode: text("unit_code").notNull(),
    tempC: real("temp_c").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ unitIdx: index("wms_cold_chain_unit_idx").on(t.unitCode, t.recordedAt) }),
);

// Checklist gudang: harian buka/tutup, QC saat receiving, langkah opname.
export const wmsChecklistRun = pgTable("wms_checklist_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // daily | receiving | opname
  warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
  refId: text("ref_id"), // opsional: kaitkan ke dokumen receiving/opname
  status: text("status").notNull().default("draft"), // draft | completed
  note: text("note").notNull().default(""),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wmsChecklistRunItem = pgTable(
  "wms_checklist_run_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => wmsChecklistRun.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    checked: boolean("checked").notNull().default(false),
    note: text("note").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({ runIdx: index("wms_checklist_run_item_run_idx").on(t.runId) }),
);

export const wmsStockMovement = pgTable(
  "wms_stock_movement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(), // in|out|transfer|waste|adjustment|internal_out
    productId: uuid("product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
    qty: wmsNum("qty").notNull(),
    valueHpp: wmsNum("value_hpp").notNull().default(0),
    refDoc: text("ref_doc").notNull().default(""),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    // Saldo ruang setelah mutasi & biaya/unit (ala Stock Ledger Entry). Null = baris lama (sebelum 0151).
    balanceAfter: wmsNum("balance_after"),
    valuationRate: wmsNum("valuation_rate"),
    batchId: uuid("batch_id").references(() => wmsBatch.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index("wms_stock_movement_product_idx").on(t.productId),
    typeIdx: index("wms_stock_movement_type_idx").on(t.type),
    createdAtIdx: index("wms_stock_movement_created_at_idx").on(t.createdAt),
  }),
);

// Waste / write-off bahan (ala ERPNext Stock Entry "Material Issue"): rusak, kedaluwarsa,
// tumpah, susut prep. Hanya status "recorded" yang memotong stok (movement type waste).
export const wmsWaste = pgTable(
  "wms_waste",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    doc: text("doc").notNull().unique(),
    warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    batchId: uuid("batch_id").references(() => wmsBatch.id, { onDelete: "set null" }),
    qty: wmsNum("qty").notNull(),
    unit: text("unit").notNull().default(""),
    reason: text("reason").notNull(), // expired | damaged | spill | prep_loss | other
    note: text("note").notNull().default(""),
    estimatedValue: wmsNum("estimated_value").notNull().default(0),
    value: wmsNum("value").notNull().default(0), // biaya aktual FEFO saat dicatat
    status: text("status").notNull().default("recorded"), // recorded | pending_approval | rejected
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    requestedByName: text("requested_by_name").notNull().default(""),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("wms_waste_status_idx").on(t.status, t.createdAt),
    productIdx: index("wms_waste_product_idx").on(t.productId),
  }),
);

// Kemasan per bahan (konsep ERPNext UOM Conversion): 1 kotak = 1000 ml, 1 dus = 24 botol.
// Satuan dasar wms_product.unit tetap kebenaran stok/HPP; kemasan hanya untuk input &
// tampilan (hitung opname, minta bahan, PO, surat jalan).
export const wmsProductUom = pgTable(
  "wms_product_uom",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => wmsProduct.id, { onDelete: "cascade" }),
    uom: text("uom").notNull(),
    factor: wmsNum("factor").notNull(), // isi dalam satuan dasar
    isPurchase: boolean("is_purchase").notNull().default(false), // default beli/terima/PO
    isCount: boolean("is_count").notNull().default(false), // default hitung/minta bahan
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ productUomIdx: uniqueIndex("wms_product_uom_product_uom_idx").on(t.productId, sql`lower(${t.uom})`) }),
);

// Permintaan bahan Bar/Dapur → gudang (daftar belanja dari layar produksi, ala ERPNext
// Material Request "Material Transfer"). Tanpa approval: gudang kirim, divisi konfirmasi.
// Bagian yang tidak tersedia di gudang = kekurangan → manajer buat PO.
export const wmsMaterialRequest = pgTable(
  "wms_material_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    doc: text("doc").notNull().unique(),
    division: text("division").notNull(), // bar | dapur
    warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }), // ruang Bar/Dapur
    sourceWarehouseId: uuid("source_warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
    status: text("status").notNull().default("submitted"), // submitted | sent | received | cancelled
    urgent: boolean("urgent").notNull().default(false),
    note: text("note").notNull().default(""),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    requestedByName: text("requested_by_name").notNull().default(""),
    sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedBy: text("received_by").references(() => user.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receiveNote: text("receive_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ statusIdx: index("wms_material_request_status_idx").on(t.status, t.createdAt) }),
);

export const wmsMaterialRequestItem = pgTable(
  "wms_material_request_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => wmsMaterialRequest.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => wmsProduct.id, { onDelete: "cascade" }),
    qty: wmsNum("qty").notNull(),
    stockAtRequest: wmsNum("stock_at_request").notNull().default(0), // stok ruang saat diminta
    sentQty: wmsNum("sent_qty").notNull().default(0),
    shortQty: wmsNum("short_qty").notNull().default(0), // tidak ada di gudang → perlu beli
    purchaseOrderId: uuid("purchase_order_id").references(() => wmsPurchaseOrder.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
  },
  (t) => ({ requestIdx: index("wms_material_request_item_request_idx").on(t.requestId) }),
);

// Jejak batch per penjualan (ala ERPNext "return against"): void/refund mengembalikan
// stok ke ruang & batch asal. batch_id null = bagian tanpa batch / terjual minus.
export const wmsSaleAllocation = pgTable(
  "wms_sale_allocation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    refDoc: text("ref_doc").notNull(), // SALE <orderNo>
    productId: uuid("product_id")
      .notNull()
      .references(() => wmsProduct.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
    batchId: uuid("batch_id").references(() => wmsBatch.id, { onDelete: "set null" }),
    qty: wmsNum("qty").notNull(),
    returnedQty: wmsNum("returned_qty").notNull().default(0),
    // Urutan potong (satu transaksi = created_at sama) → retur LIFO: yang terakhir terpotong kembali dulu.
    seq: bigserial("seq", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ refIdx: index("wms_sale_allocation_ref_idx").on(t.refDoc, t.productId) }),
);

// Masalah stok yang dulu terlewat diam-diam (bahan belum di WMS, satuan resep ≠ satuan
// gudang, terjual melebihi stok). Tampil di dashboard gudang sampai ditandai beres.
export const wmsStockIssue = pgTable(
  "wms_stock_issue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // not_in_wms | unit_mismatch | oversold | batch_gap
    sku: text("sku").notNull().default(""),
    productId: uuid("product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    refDoc: text("ref_doc").notNull().default(""),
    detail: text("detail").notNull().default(""),
    qty: wmsNum("qty").notNull().default(0),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    openIdx: index("wms_stock_issue_open_idx").on(t.resolvedAt, t.createdAt),
  }),
);

// =============================================================================
// PAYROLL V2 — Absensi + Wallet Gaji + Wallet Fee Pool
// Feature-flagged: PAYROLL_V2_ENABLED. Non-destructive extension.
// =============================================================================

// Key-value config: koordinat GPS, upah default, bracket telat, fee/produk, dst.
export const payrollSettings = pgTable("payroll_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().$type<Record<string, unknown> | unknown[]>(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Upah harian per staff (override default role).
export const staffWageConfig = pgTable(
  "staff_wage_config",
  {
    staffUserId: text("staff_user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    dailyWage: integer("daily_wage").notNull().default(0),
    // Gaji bulanan persis sesuai input owner (dailyWage = round(monthlySalary / 30)).
    monthlySalary: integer("monthly_salary"),
    overtimeHourly: integer("overtime_hourly").notNull().default(0),
    monthlyDeduction: integer("monthly_deduction").notNull().default(0),
    // Payroll V2: kecualikan staff ini dari fee/produk (mis. jaga malam) walau
    // role-nya berhak. Per-orang, tidak bergantung role (sistem 4-role).
    excludeFromFee: boolean("exclude_from_fee").notNull().default(false),
    // Kode login absen (kode + PIN di /absen). Terisi = identitas absen payroll,
    // terpisah dari akun login sistem.
    absenCode: text("absen_code"),
    // Jam masuk shift pribadi (menit sejak 00:00 WIB, mis. 1380 = 23:00). Kosong =
    // pakai general.openHour. Shift >= 12:00 dianggap shift malam (lintas tengah malam).
    shiftStartMinutes: integer("shift_start_minutes"),
    // Tanggal mulai kerja (dasar masa kerja THR). Kosong = tanggal akun absen dibuat.
    joinDate: date("join_date"),
    notes: text("notes"),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    absenCodeUnique: uniqueIndex("staff_wage_config_absen_code_uidx").on(t.absenCode),
  }),
);

// Log absensi V2 (PIN + Selfie + GPS). Satu baris per staff per tanggal.
export const staffAttendanceV2 = pgTable(
  "staff_attendance_v2",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    checkinAt: timestamp("checkin_at", { withTimezone: true }),
    checkinLat: real("checkin_lat"),
    checkinLng: real("checkin_lng"),
    checkinSelfieUrl: text("checkin_selfie_url"),
    checkinDevice: text("checkin_device"),
    checkoutAt: timestamp("checkout_at", { withTimezone: true }),
    checkoutLat: real("checkout_lat"),
    checkoutLng: real("checkout_lng"),
    checkoutSelfieUrl: text("checkout_selfie_url"),
    checkoutDevice: text("checkout_device"),
    method: text("method").notNull().default("pin_selfie_gps"), // pin | pin_selfie_gps | pin_selfie_gps_multi
    lateMinutes: integer("late_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    workedMinutes: integer("worked_minutes").notNull().default(0),
    // valid | invalid | absent | pending (belum ada checkout)
    status: text("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffDateUnique: uniqueIndex("staff_attendance_v2_staff_date_uidx").on(t.staffUserId, t.date),
    dateIdx: index("staff_attendance_v2_date_idx").on(t.date),
    statusIdx: index("staff_attendance_v2_status_idx").on(t.status),
  }),
);

// Izin / sakit / cuti yang dicatat manajer. Hari ini tidak dihitung "tidak hadir"
// (bonus tidak gugur) dan tetap tidak digaji (tidak absen = tidak bergaji).
export const staffLeaves = pgTable(
  "staff_leaves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    type: text("type").notNull(), // izin | sakit | cuti
    reason: text("reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffDateUnique: uniqueIndex("staff_leaves_staff_date_uidx").on(t.staffUserId, t.date),
    dateIdx: index("staff_leaves_date_idx").on(t.date),
  }),
);

// Wallet Gaji: kredit upah harian + lembur + bonus kehadiran (per staff per tanggal).
export const staffDailyWages = pgTable(
  "staff_daily_wages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    baseWage: integer("base_wage").notNull().default(0),
    lateMultiplierPct: integer("late_multiplier_pct").notNull().default(100),
    overtimeAmount: integer("overtime_amount").notNull().default(0),
    bonusAmount: integer("bonus_amount").notNull().default(0),
    deductionAmount: integer("deduction_amount").notNull().default(0),
    totalCredited: integer("total_credited").notNull().default(0),
    balanceAfter: integer("balance_after").notNull().default(0),
    // source: cron_finalize | manual_owner_adjust | monthly_attendance_bonus
    source: text("source").notNull().default("cron_finalize"),
    note: text("note"),
    payoutId: uuid("payout_id"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Unik per source: gaji harian, bonus bulanan, dan penyesuaian owner boleh
    // jatuh di tanggal yang sama tanpa saling menimpa.
    staffDateSourceUnique: uniqueIndex("staff_daily_wages_staff_date_source_uidx").on(
      t.staffUserId,
      t.date,
      t.source,
    ),
    payoutIdx: index("staff_daily_wages_payout_idx").on(t.payoutId),
    dateIdx: index("staff_daily_wages_date_idx").on(t.date),
  }),
);

// Pool fee harian (akumulasi Rp 200 × produk).
export const feePoolDaily = pgTable(
  "fee_pool_daily",
  {
    date: date("date").primaryKey(),
    poolAmount: integer("pool_amount").notNull().default(0),
    productCount: integer("product_count").notNull().default(0),
    feePerProduct: integer("fee_per_product").notNull().default(200),
    // proportional_hours | equal
    splitMode: text("split_mode").notNull().default("proportional_hours"),
    // hangus | kas
    fallbackMode: text("fallback_mode").notNull().default("hangus"),
    totalStaffValid: integer("total_staff_valid").notNull().default(0),
    totalMinutesValid: integer("total_minutes_valid").notNull().default(0),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// Rincian split fee pool per staff per tanggal.
export const feePoolSplits = pgTable(
  "fee_pool_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    minutesWorked: integer("minutes_worked").notNull(),
    sharePct: real("share_pct").notNull(),
    amount: integer("amount").notNull(),
    bonusTarget: integer("bonus_target").notNull().default(0),
    bonusZeroKomplain: integer("bonus_zero_komplain").notNull().default(0),
    earningId: uuid("earning_id"),
    // Terisi = fee hari itu sudah dibayar lewat gajian (staff_payroll_payments.id).
    paymentId: uuid("payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dateStaffUnique: uniqueIndex("fee_pool_splits_date_staff_uidx").on(t.date, t.staffUserId),
    dateIdx: index("fee_pool_splits_date_idx").on(t.date),
  }),
);

// Gajian: pembayaran gaji + fee yang belum dibayar s/d `paidUntil`, dipotong kasbon.
// Baris staff_daily_wages.payout_id & fee_pool_splits.payment_id menunjuk ke sini.
export const staffPayrollPayments = pgTable(
  "staff_payroll_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    paidUntil: date("paid_until").notNull(),
    grossGaji: integer("gross_gaji").notNull().default(0),
    grossFee: integer("gross_fee").notNull().default(0),
    advanceDeducted: integer("advance_deducted").notNull().default(0),
    netPaid: integer("net_paid").notNull().default(0),
    method: text("method").notNull().default("Cash"),
    note: text("note"),
    gajiExpenseId: uuid("gaji_expense_id"),
    feeExpenseId: uuid("fee_expense_id"),
    // paid | cancelled (dibatalkan manajer / pengeluaran ditolak di Approvals).
    status: text("status").notNull().default("paid"),
    // Kasbon yang dilunasi gajian ini: [{ advanceId, amount }] — untuk pembatalan tepat.
    advanceAllocations: jsonb("advance_allocations")
      .$type<Array<{ advanceId: string; amount: number }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffIdx: index("staff_payroll_payments_staff_idx").on(t.staffUserId),
    createdIdx: index("staff_payroll_payments_created_idx").on(t.createdAt),
  }),
);

// THR (Tunjangan Hari Raya): satu baris per karyawan per hari raya. Masa kerja ≥ 12
// bulan = 1× gaji bulanan; 1–12 bulan = proporsional (masa kerja/12 × gaji).
export const staffThrPayments = pgTable(
  "staff_thr_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    holidayName: text("holiday_name").notNull(),
    holidayDate: date("holiday_date").notNull(),
    monthsWorked: integer("months_worked").notNull(),
    baseSalary: integer("base_salary").notNull(),
    amount: integer("amount").notNull(),
    method: text("method").notNull().default("Cash"),
    note: text("note"),
    expenseId: uuid("expense_id"),
    // paid | cancelled
    status: text("status").notNull().default("paid"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffIdx: index("staff_thr_payments_staff_idx").on(t.staffUserId),
    holidayIdx: index("staff_thr_payments_holiday_idx").on(t.holidayDate),
  }),
);

// Kasbon karyawan. Dipotong otomatis saat gajian (FIFO); sisa terbawa ke gajian berikutnya.
export const staffCashAdvances = pgTable(
  "staff_cash_advances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    amount: integer("amount").notNull(),
    settledAmount: integer("settled_amount").notNull().default(0),
    method: text("method").notNull().default("Cash"),
    note: text("note"),
    expenseId: uuid("expense_id"),
    // active | cancelled. Kasbon yang pengeluarannya masih menunggu Approvals
    // belum dipotong (uang belum boleh diserahkan).
    status: text("status").notNull().default("active"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffIdx: index("staff_cash_advances_staff_idx").on(t.staffUserId),
  }),
);

// Payout request V2 (bisa dari Wallet Gaji atau Wallet Fee atau keduanya).
export const staffPayoutRequests = pgTable(
  "staff_payout_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // gaji | fee | keduanya
    walletType: text("wallet_type").notNull(),
    amountGaji: integer("amount_gaji").notNull().default(0),
    amountFee: integer("amount_fee").notNull().default(0),
    reason: text("reason"),
    // pending | approved | rejected | paid
    status: text("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    expenseIdGaji: uuid("expense_id_gaji"),
    expenseIdFee: uuid("expense_id_fee"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffIdx: index("staff_payout_requests_staff_idx").on(t.staffUserId),
    statusIdx: index("staff_payout_requests_status_idx").on(t.status),
    createdIdx: index("staff_payout_requests_created_idx").on(t.createdAt),
  }),
);

// ─── Event & Undangan Digital (PRD GC-PRD-EVENT-001) ────────────────────────
// Satu sumber data event untuk homepage, landing /grand-opening, dan undangan.

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "restrict" }),
    bannerUrl: text("banner_url"),
    tagline: text("tagline"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    venueName: text("venue_name").notNull(),
    address: text("address").notNull(),
    mapsUrl: text("maps_url").notNull(),
    contactWhatsapp: text("contact_whatsapp").notNull(),
    highlights: jsonb("highlights").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    about: text("about"),
    faq: jsonb("faq").$type<Array<{ q: string; a: string }>>().notNull().default(sql`'[]'::jsonb`),
    gallery: jsonb("gallery").$type<Array<{ src: string; alt: string }>>().notNull().default(sql`'[]'::jsonb`),
    // Rundown acara (jam lokal event, "HH:MM").
    agenda: jsonb("agenda")
      .$type<Array<{ start: string; end: string; title: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    promoText: text("promo_text"),
    // Sponsor tampil sebagai teks; ageGate = konfirmasi usia 21+ sebelum landing (sponsor produk tembakau).
    sponsorName: text("sponsor_name"),
    ageGate: boolean("age_gate").notNull().default(false),
    // draft | published | archived
    status: text("status").notNull().default("draft"),
    featuredOnHome: boolean("featured_on_home").notNull().default(true),
    rsvpDeadline: timestamp("rsvp_deadline", { withTimezone: true }),
    defaultMaxPax: integer("default_max_pax").notNull().default(2),
    contentVersion: integer("content_version").notNull().default(1),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("events_slug_unique").on(t.slug),
    statusIdx: index("events_status_idx").on(t.status),
  }),
);

export const eventMenuEntries = pgTable(
  "event_menu_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "restrict" }),
    kind: text("kind").notNull().default("item"),
    name: text("name").notNull(),
    description: text("description"),
    menuItemId: text("menu_item_id").references(() => menuItems.id, { onDelete: "restrict" }),
    variantId: text("variant_id"),
    price: integer("price").notNull(),
    status: text("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    quota: integer("quota"),
    usedQuantity: integer("used_quantity").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    groups: jsonb("groups").$type<EventMenuGroup[]>().notNull().default(sql`'[]'::jsonb`),
    // Foto paket (owner, Okt 2026). Kosong = kolase foto komponen di menu digital/POS.
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ eventIdx: index("event_menu_entries_event_idx").on(t.eventId, t.status) }),
);

export const eventGuests = pgTable(
  "event_guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    notes: text("notes"),
    maxPax: integer("max_pax").notNull().default(2),
    // active | archived
    status: text("status").notNull().default("active"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventIdx: index("event_guests_event_idx").on(t.eventId),
    phoneUnique: uniqueIndex("event_guests_event_phone_unique")
      .on(t.eventId, t.phoneNormalized)
      .where(sql`${t.phoneNormalized} IS NOT NULL`),
  }),
);

export const eventInvitations = pgTable(
  "event_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => eventGuests.id, { onDelete: "cascade" }),
    // sha256(token) untuk lookup; token asli terenkripsi (AES-GCM) agar link bisa disalin ulang.
    tokenHash: text("token_hash").notNull(),
    tokenEnc: text("token_enc").notNull(),
    tokenRef: text("token_ref").notNull(),
    // ready | shared | revoked
    status: text("status").notNull().default("ready"),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    sharedBy: text("shared_by").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => user.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex("event_invitations_token_hash_unique").on(t.tokenHash),
    // Satu undangan aktif per tamu (yang dicabut tidak dihitung).
    activeGuestUnique: uniqueIndex("event_invitations_active_guest_unique")
      .on(t.guestId)
      .where(sql`${t.status} <> 'revoked'`),
    eventIdx: index("event_invitations_event_idx").on(t.eventId),
  }),
);

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => eventInvitations.id, { onDelete: "cascade" }),
    // attending | declined (tanpa baris = pending)
    response: text("response").notNull(),
    pax: integer("pax").notNull().default(0),
    note: text("note"),
    // guest | admin
    source: text("source").notNull().default("guest"),
    changeCount: integer("change_count").notNull().default(0),
    respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invitationUnique: uniqueIndex("event_rsvps_invitation_unique").on(t.invitationId),
  }),
);

export const eventActivityLogs = pgTable(
  "event_activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id").references(() => eventInvitations.id, { onDelete: "set null" }),
    guestId: uuid("guest_id").references(() => eventGuests.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    // nama staf atau "Tamu"
    actor: text("actor").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventIdx: index("event_activity_logs_event_idx").on(t.eventId, t.occurredAt),
  }),
);

// Impor master Excel (owner, Okt 2026): log setiap preview/terapkan + crosswalk
// kode Excel → SKU/menu Garage yang dapat diaudit. Data POS tidak pernah diubah.
export const masterImports = pgTable(
  "master_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileName: text("file_name").notNull(),
    fileHash: text("file_hash").notNull(),
    mode: text("mode").notNull(), // preview | apply
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("master_imports_created_idx").on(t.createdAt),
  }),
);

export const masterCrosswalk = pgTable(
  "master_crosswalk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // material | recipe
    kind: text("kind").notNull(),
    sourceKey: text("source_key").notNull(),
    sourceName: text("source_name").notNull().default(""),
    targetSku: text("target_sku"),
    targetMenuItemId: text("target_menu_item_id"),
    targetVariantId: text("target_variant_id"),
    // created | existing | unverified | skipped | draft | approved
    status: text("status").notNull(),
    validated: boolean("validated").notNull().default(false),
    note: text("note").notNull().default(""),
    importId: uuid("import_id").references(() => masterImports.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyUnique: uniqueIndex("master_crosswalk_kind_key_unique").on(t.kind, t.sourceKey),
  }),
);

// Garage Financial Control System (PRD V2.0) — tabel di file terpisah.
export * from "./schema-finance";

// Closing observations and replenishment documents reuse WMS products/warehouses/ledger.
export const wmsClosingSettings = pgTable("wms_closing_settings", {
  outletId: uuid("outlet_id").primaryKey().references(() => outlets.id),
  openTime: text("open_time").notNull().default("15:00"), closeTime: text("close_time").notNull().default("23:00"),
  cutoffTime: text("cutoff_time").notNull().default("23:59"), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const wmsClosingLocation = pgTable("wms_closing_location", {
  warehouseId: uuid("warehouse_id").primaryKey().references(() => wmsWarehouse.id), outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  kind: text("kind").notNull(), area: text("area").notNull(),
}, t => ({ kind: check("wms_closing_location_kind_check", sql`${t.kind} in ('main','bar','dapur','transit','damaged')`), area: check("wms_closing_location_area_check", sql`${t.area} in ('bar','dapur','umum')`) }));
export const wmsClosingAccess = pgTable("wms_closing_access", {
  id: uuid("id").primaryKey().defaultRandom(), userId: text("user_id").notNull().references(() => user.id),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id), warehouseId: uuid("warehouse_id").notNull().references(() => wmsWarehouse.id),
  capability: text("capability").notNull(),
}, t => ({ scope: uniqueIndex("wms_closing_access_scope").on(t.userId,t.warehouseId,t.capability), capability: check("wms_closing_access_capability_check", sql`${t.capability} in ('bar','dapur','warehouse')`) }));
export const wmsClosingRequest = pgTable("wms_closing_request", {
  id: uuid("id").primaryKey().defaultRandom(), doc: text("doc").notNull().unique(), outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => wmsWarehouse.id), division: text("division").notNull(),
  businessDate: date("business_date").notNull(), neededDate: date("needed_date").notNull(),
  status: text("status").notNull().default("draft"), version: integer("version").notNull().default(1),
  noRequest: boolean("no_request").notNull().default(false), late: boolean("late").notNull().default(false), priority: text("priority").notNull().default("normal"),
  note: text("note").notNull().default(""), createdBy: text("created_by").notNull().references(() => user.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ closing: uniqueIndex("wms_closing_request_daily").on(t.outletId,t.warehouseId,t.businessDate), needed: index("wms_closing_request_needed").on(t.outletId,t.neededDate,t.status), division: check("wms_closing_request_division_check", sql`${t.division} in ('bar','dapur')`), status: check("wms_closing_request_status_check", sql`${t.status} in ('draft','submitted','under_review','approved','partially_available','preparing','ready','dispatched','partially_received','completed','rejected','cancelled')`), dates: check("wms_closing_request_dates_check",sql`${t.neededDate} >= ${t.businessDate}`) }));
export const wmsClosingRequestItem = pgTable("wms_closing_request_item", {
  id: uuid("id").primaryKey().defaultRandom(), requestId: uuid("request_id").notNull().references(() => wmsClosingRequest.id), productId: uuid("product_id").notNull().references(() => wmsProduct.id),
  systemQty: wmsNum("system_qty").notNull(), physicalQty: wmsNum("physical_qty"), targetQty: wmsNum("target_qty").notNull(), incomingQty: wmsNum("incoming_qty").notNull().default(0),
  recommendationQty: wmsNum("recommendation_qty").notNull(), requestedQty: wmsNum("requested_qty").notNull(), approvedQty: wmsNum("approved_qty").notNull().default(0),
  preparedQty: wmsNum("prepared_qty").notNull().default(0), dispatchedQty: wmsNum("dispatched_qty").notNull().default(0), receivedQty: wmsNum("received_qty").notNull().default(0), damagedQty: wmsNum("damaged_qty").notNull().default(0),
  overrideReason: text("override_reason").notNull().default(""), note: text("note").notNull().default(""),
}, t => ({ material: uniqueIndex("wms_closing_request_item_material").on(t.requestId,t.productId), amounts: check("wms_closing_item_amount_check", sql`(${t.physicalQty} is null or ${t.physicalQty} >= 0) and ${t.targetQty} >= 0 and ${t.incomingQty} >= 0 and ${t.recommendationQty} >= 0 and ${t.requestedQty} >= 0 and ${t.approvedQty} >= 0 and ${t.approvedQty} <= ${t.requestedQty} and ${t.preparedQty} >= 0 and ${t.preparedQty} <= ${t.approvedQty} and ${t.dispatchedQty} >= 0 and ${t.dispatchedQty} <= ${t.preparedQty} and ${t.receivedQty} >= 0 and ${t.damagedQty} >= 0 and ${t.receivedQty} + ${t.damagedQty} <= ${t.dispatchedQty}`) }));
export const wmsClosingReservation = pgTable("wms_closing_reservation", {
  id: uuid("id").primaryKey().defaultRandom(), itemId: uuid("item_id").notNull().references(() => wmsClosingRequestItem.id), productId: uuid("product_id").notNull().references(() => wmsProduct.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => wmsWarehouse.id), qty: wmsNum("qty").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ itemSource: uniqueIndex("wms_closing_reservation_item_source").on(t.itemId,t.warehouseId), source: index("wms_closing_reservation_source").on(t.productId,t.warehouseId), qty:check("wms_closing_reservation_qty_check",sql`${t.qty} >= 0`) }));
export const wmsClosingShipment = pgTable("wms_closing_shipment", {
  id: uuid("id").primaryKey().defaultRandom(), doc: text("doc").notNull().unique(), requestId: uuid("request_id").notNull().references(() => wmsClosingRequest.id),
  sourceWarehouseId: uuid("source_warehouse_id").notNull().references(() => wmsWarehouse.id), transitWarehouseId: uuid("transit_warehouse_id").notNull().references(() => wmsWarehouse.id),
  destinationWarehouseId: uuid("destination_warehouse_id").notNull().references(() => wmsWarehouse.id), status: text("status").notNull().default("dispatched"),
  createdBy: text("created_by").notNull().references(() => user.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const wmsClosingAllocation = pgTable("wms_closing_allocation", {
  id: uuid("id").primaryKey().defaultRandom(), shipmentId: uuid("shipment_id").notNull().references(() => wmsClosingShipment.id), itemId: uuid("item_id").notNull().references(() => wmsClosingRequestItem.id),
  sourceBatchId: uuid("source_batch_id").notNull().references(() => wmsBatch.id), transitBatchId: uuid("transit_batch_id").notNull().references(() => wmsBatch.id),
  batchNo: text("batch_no").notNull(), expiredAt: timestamp("expired_at", { withTimezone: true }), hpp: wmsNum("hpp").notNull(), qty: wmsNum("qty").notNull(),
  receivedQty: wmsNum("received_qty").notNull().default(0), damagedQty: wmsNum("damaged_qty").notNull().default(0),
}, t => ({amounts:check("wms_closing_allocation_amount_check",sql`${t.qty} > 0 and ${t.hpp} >= 0 and ${t.receivedQty} >= 0 and ${t.damagedQty} >= 0 and ${t.receivedQty} + ${t.damagedQty} <= ${t.qty}`)}));
export const wmsClosingShortage = pgTable("wms_closing_shortage", {
  id: uuid("id").primaryKey().defaultRandom(), itemId: uuid("item_id").notNull().unique().references(() => wmsClosingRequestItem.id),
  qty: wmsNum("qty").notNull(), status: text("status").notNull().default("draft"), supplierId: uuid("supplier_id").references(() => wmsSupplier.id),
  lastUnitPrice: wmsNum("last_unit_price").notNull().default(0), note: text("note").notNull().default(""), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const wmsClosingEvent = pgTable("wms_closing_event", {
  id: uuid("id").primaryKey().defaultRandom(), outletId: uuid("outlet_id").notNull().references(() => outlets.id), requestId: uuid("request_id").references(() => wmsClosingRequest.id),
  action: text("action").notNull(), actorId: text("actor_id").notNull().references(() => user.id), actorName: text("actor_name").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const wmsClosingMutation = pgTable("wms_closing_mutation", {
  id: uuid("id").primaryKey().defaultRandom(), outletId: uuid("outlet_id").notNull().references(() => outlets.id), key: text("key").notNull(),
  payloadHash: text("payload_hash").notNull(), response: jsonb("response").$type<unknown>().notNull(), actorId: text("actor_id").notNull().references(() => user.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ replay: uniqueIndex("wms_closing_mutation_replay").on(t.outletId,t.key) }));
