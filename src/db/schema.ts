import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: uniqueIndex("staff_profiles_user_id_idx").on(table.userId),
    outletIdx: index("staff_profiles_outlet_id_idx").on(table.outletId),
    statusIdx: index("staff_profiles_status_idx").on(table.status),
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
    section: text("section").notNull(),
    stock: text("stock").notNull().default("ready"),
    status: text("status").notNull().default("active"),
    prep: text("prep").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // URL foto menu untuk tampilan menu digital (opsional). Kosong = pakai ikon kategori.
    imageUrl: text("image_url"),
    // Promo per produk (harga tetap, toggle on/off). Aktif bila promoActive=true
    // dan promoPrice > 0; promoPrice meng-override harga varian saat POS/menu.
    promoActive: boolean("promo_active").notNull().default(false),
    promoPrice: integer("promo_price"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    skuIdx: uniqueIndex("menu_items_sku_idx").on(table.sku),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("point_redemptions_customer_id_idx").on(table.customerId),
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

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNo: text("order_no").notNull().unique(),
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
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("orders_status_idx").on(table.status),
    outletIdx: index("orders_outlet_id_idx").on(table.outletId),
    sourceIdx: index("orders_order_source_idx").on(table.orderSource),
    customerPhoneIdx: index("orders_customer_phone_idx").on(table.customerPhone),
    invoiceTrackingTokenIdx: uniqueIndex("orders_invoice_tracking_token_idx").on(table.invoiceTrackingToken),
    outletCreatedIdx: index("orders_outlet_created_idx").on(table.outletId, table.createdAt),
    statusCreatedIdx: index("orders_status_created_idx").on(table.status, table.createdAt),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("kitchen_tickets_status_idx").on(table.status),
    stationIdx: index("kitchen_tickets_station_idx").on(table.station),
    readyAtIdx: index("kitchen_tickets_ready_at_idx").on(table.readyAt),
    priorityIdx: index("kitchen_tickets_priority_idx").on(table.priority),
    statusCreatedIdx: index("kitchen_tickets_status_created_idx").on(table.status, table.createdAt),
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
    unitCost: integer("unit_cost").notNull().default(0),
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
    unitCost: integer("unit_cost").notNull().default(0),
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
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index("cash_sessions_status_idx").on(table.status),
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
    unitCost: integer("unit_cost").notNull().default(0),
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
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outletIdx: index("expenses_outlet_idx").on(table.outletId),
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
    type: text("type").notNull(),
    category: text("category").notNull().default("general"),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("recorded"),
    movementAt: timestamp("movement_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cashSessionIdx: index("cash_movements_session_idx").on(table.cashSessionId),
    outletIdx: index("cash_movements_outlet_idx").on(table.outletId),
    typeIdx: index("cash_movements_type_idx").on(table.type),
    movementAtIdx: index("cash_movements_at_idx").on(table.movementAt),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tableIdx: uniqueIndex("table_sessions_outlet_table_idx").on(table.outletId, table.tableNumber),
    statusIdx: index("table_sessions_status_idx").on(table.status),
    orderIdx: index("table_sessions_current_order_idx").on(table.currentOrderId),
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
  isPrimary: boolean("is_primary").notNull().default(false),
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

export const wmsReceiving = pgTable("wms_receiving", {
  id: uuid("id").primaryKey().defaultRandom(),
  doc: text("doc").notNull().unique(),
  supplier: text("supplier").notNull().default(""),
  warehouseId: uuid("warehouse_id").references(() => wmsWarehouse.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"), // draft|request|approved|issued|received|completed
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
  category: text("category").notNull().default(""),
  yieldQty: text("yield_qty").notNull().default("1"),
  sellPrice: integer("sell_price").notNull().default(0),
  version: text("version").notNull().default("v1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wmsBomItem = pgTable(
  "wms_bom_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => wmsRecipe.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
    qty: wmsNum("qty").notNull().default(0),
  },
  (t) => ({ recipeIdx: index("wms_bom_item_recipe_idx").on(t.recipeId) }),
);

// Resep PRODUKSI: olah bahan mentah → produk jadi/setengah-jadi (output = wms_product).
export const wmsProductionRecipe = pgTable("wms_production_recipe", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  outputProductId: uuid("output_product_id").references(() => wmsProduct.id, { onDelete: "set null" }),
  outputQty: wmsNum("output_qty").notNull().default(1), // hasil per 1 batch produksi
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
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  },
  (t) => ({ opnameIdx: index("wms_opname_line_opname_idx").on(t.opnameId) }),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index("wms_stock_movement_product_idx").on(t.productId),
    typeIdx: index("wms_stock_movement_type_idx").on(t.type),
    createdAtIdx: index("wms_stock_movement_created_at_idx").on(t.createdAt),
  }),
);


