---
title: WhatsApp 2-Way Inbox + Settings UI
module: WhatsApp Integration
phase: 4 (Future Development backlog)
depends_on: [Foundation/Auth, Foundation/RBAC, Integrations/WhatsApp Cloud (existing outbound)]
status: approved
author: Killua Surya + AI Coding Agent
date: 2026-07-12
---

# Spec: WhatsApp 2-Way Inbox + Settings UI (GARAGE OS)

## 1. Context & Problem

GARAGE OS sudah punya sisi **outbound** WhatsApp (antrian `whatsapp_messaging_queue`,
pengiriman template via Meta Cloud API, webhook status pengiriman, config via env,
broadcast marketing). Yang belum ada adalah sisi **inbound & 2-way**:

- Webhook WhatsApp hanya memproses `statuses` (delivery receipt), bukan pesan masuk customer.
- Tidak ada penyimpanan percakapan (conversation/message) → tidak bisa dibaca/CS balas.
- Tidak ada UI Inbox untuk CS membalas.
- Tidak ada UI Settings WhatsApp (status koneksi, health check, test).

Fitur ini menutup celah tersebut: customer bisa kirim pesan ke nomor GARAGE, pesan
masuk tercatat + di-link ke Customer, dan CS bisa membalas dari konsol Inbox dengan
aturan 24 jam Meta.

**Aturan main (dari PRD):** fitur ini berkaitan langsung dengan masalah "Approval desain
via WhatsApp / riwayat tercecer" dan komunikasi customer — bukan fitur kosong.

## 2. Scope

**Masuk scope (v1):**
1. Capture pesan inbound via webhook → simpan ke `whatsapp_conversations` + `whatsapp_messages`.
2. Auto-link conversation ke `customers` via nomor WA (normalized).
3. API balas (reply) dengan aturan 24 jam (freeform dalam 24j, template di luar 24j).
4. UI Inbox 2-pane (list + thread + composer) dengan mark-read / assign / close.
5. UI Settings WhatsApp (status, readiness, test connection, send test message).
6. Menu nav + role gate (Owner, Manager Operasional, Admin, Customer Service).

**YAGNI (v1, bukan scope):**
- Auto-reply bot / keyword SOP.
- Multi-agent assignment routing / SLA.
- Auto-create customer saat nomor tidak ditemukan.
- Broadcast campaign builder (sudah ada di modul Marketing).

## 3. Data Model (Drizzle, `src/db/schema.ts`)

```ts
export const whatsappConversations = pgTable(
  "whatsapp_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull(),        // normalized 62xxxx
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    status: text("status").notNull().default("open"),    // open | closed
    unreadCount: integer("unread_count").notNull().default(0),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneIdx: uniqueIndex("whatsapp_conversations_phone_idx").on(t.phoneNumber),
    statusIdx: index("whatsapp_conversations_status_idx").on(t.status),
    customerIdx: index("whatsapp_conversations_customer_idx").on(t.customerId),
  }),
);

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => whatsappConversations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),            // inbound | outbound
    messageType: text("message_type").notNull().default("text"), // text | template
    body: text("body"),
    templateName: text("template_name"),
    templateParams: jsonb("template_params").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text("status").notNull().default("received"), // received|sent|delivered|read|failed
    providerMessageId: text("provider_message_id"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    convIdx: index("whatsapp_messages_conversation_idx").on(t.conversationId),
    provIdx: index("whatsapp_messages_provider_idx").on(t.providerMessageId),
  }),
);
```

`whatsapp_messaging_queue` tetap dipakai untuk bulk/marketing. Reply CS dikirim
**inline** (low volume, feedback langsung di UI) dan didaftarkan ke `whatsapp_messages`.

## 4. Inbound Webhook (`src/app/api/webhooks/whatsapp/route.ts`)

- `extractWhatsappDeliveryEvents` tetap ada. Tambah `extractWhatsappInboundMessages(payload)`
  yang mem-parsing `entry[].changes[].value.messages[]` (type `text`).
- `POST` handler: untuk tiap inbound message:
  1. `phoneNumber = normalizeWhatsappRecipient(from)`.
  2. Upsert `whatsapp_conversations` by `phoneNumber`; set `customerId` bila match
     `customers.phone` (normalized sama); `unreadCount += 1`; `lastInboundAt = now`;
     `lastMessagePreview = body`.
  3. Insert `whatsapp_messages` (direction `inbound`, status `received`).
- Delivery status: `updateWhatsappDeliveryStatus` diperluas agar juga update
  `whatsapp_messages.status` where `providerMessageId` match (bukan hanya queue).

## 5. Reply API (`src/app/api/whatsapp/conversations/[id]/messages/route.ts`)

`POST` body:
```json
{ "type": "text", "text": "..." }
// atau
{ "type": "template", "templateName": "order_status", "templateParams": ["...", "..."] }
```

Logika:
- Auth + role gate (Owner, Manager Operasional, Admin, Customer Service).
- Jika `type === "text"`:
  - Baca `conversation.lastInboundAt`. Jika `now - lastInboundAt > 24h` → `400`
    `{ code: "WHATSAPP_24H_WINDOW_EXPIRED", message: "Gunakan template untuk membalas di luar 24 jam." }`.
- Kirim via Meta Cloud API (fetch ke `.../{phoneNumberId}/messages`, sama seperti
  `sendWhatsappQueueItem` tapi langsung, untuk text maupun template).
- Insert `whatsapp_messages` (direction `outbound`, status `sent`, `providerMessageId`,
  `createdBy = session user`). Reset `conversation.unreadCount = 0`, update preview.
- 24h window dihitung dari `lastInboundAt` conversation.

Helper baru `sendWhatsappDirect({ recipient, messageType, body?, templateName?, templateParams?, createdBy })`
di `src/lib/garage-whatsapp-messaging.ts` (refactor `sendWhatsappQueueItem` agar share
fetch logic).

## 6. Inbox UI (new route, mis. `src/app/whatsapp/page.tsx` + subroutes)

- Layout 2-pane (list kiri, thread kanan), responsive (stack di mobile).
- List: avatar/nama customer (atau nomor), preview, waktu relatif, badge unread, status chip.
- Thread: bubble inbound kiri / outbound kanan; tick status (sent/delivered/read); waktu JetBrains Mono.
- Composer: textarea; jika di luar 24h → textarea disabled + tampil template picker (dropdown
  template terdaftar) + hint. Tombol "Kirim".
- Aksi: "Tandai dibaca" (reset unread), "Assign ke saya" (set `assignedTo`), "Tutup" (status closed).
- Panel customer: nama, tier, phone (dari `customers`) bila ter-link.
- Premium UX (`ui-ux-pro-max`): crop-mark di panel aktif, warna status CMYK
  (Cyan=in production/info, Magenta=needs attention, Amber=pending, Key=completed),
  target 44px, kontras >=4.5:1, reduced-motion aman, Framer Motion transisi 100–300ms.

## 7. Settings UI WhatsApp

- Card di halaman Integrations Settings:
  - Status koneksi + readiness checks (reuse `listIntegrations()`/`buildIntegrationReadiness`
    untuk provider `whatsapp`: env lengkap, resource `phone_number` terhubung, health check).
  - Nomor terverifikasi (dari resource `phone_number` metadata).
  - Tombol "Test Connection" → `POST /api/integrations/whatsapp/test` (sudah ada) / health check.
  - Tombol "Send Test Message" → enqueue template test ke nomor internal (reuse
    `enqueueWhatsappMessage`).

## 8. Nav / Roles

- Tambah menu **WhatsApp Inbox** di sidebar (role: Owner, Manager Operasional, Admin,
  Customer Service) + gate di `src/lib/role-access.ts`. Penempatan route group persis
  diverifikasi saat build (ikuti konvensi folder `src/app` yang ada).
- Settings WhatsApp card terlihat untuk role yang punya akses Integrations.

## 9. Acceptance Criteria (GIVEN / WHEN / THEN)

```
GIVEN webhook WhatsApp terkonfigurasi dan customer mengirim teks "Halo"
WHEN Meta mengirim payload messages ke /api/webhooks/whatsapp
THEN baris whatsapp_conversations baru (atau update) dengan phoneNumber ter-normalisasi
AND baris whatsapp_messages inbound status "received" tersimpan
AND unreadCount bertambah 1 dan lastInboundAt ter-set
AND bila nomor match customers.phone, customerId terisi
```

```
GIVEN conversation dengan lastInboundAt < 24 jam lalu
WHEN CS mengetik balasan bebas lalu klik Kirim
THEN pesan terkirim ke Meta dan whatsapp_messages outbound status "sent" tersimpan
AND unreadCount conversation reset ke 0
AND preview + lastMessageAt ter-update
```

```
GIVEN conversation dengan lastInboundAt > 24 jam lalu
WHEN CS mengetik balasan bebas lalu klik Kirim
THEN API menolak dengan 400 WHATSAPP_24H_WINDOW_EXPIRED
AND composer menampilkan template picker sebagai satu-satunya jalur kirim
```

```
GIVEN CS membuka thread di Inbox
WHEN halaman load
THEN pesan inbound tampil di kiri, outbound di kanan, dengan status tick
AND badge unread hilang setelah "Tandai dibaca"
```

```
GIVEN WhatsApp belum terkonfigurasi (env kosong)
WHEN owner buka Settings WhatsApp
THEN card menampilkan status "not_configured" + checklist env yang kurang
AND tidak ada tombol kirim test yang berfungsi
```

## 10. Testing

- Unit (`src/lib/garage-whatsapp-messaging.test.ts`):
  - `normalizeWhatsappRecipient` (sudah ada) tetap lolos.
  - `isWithin24hWindow(lastInboundAt)` helper.
  - `extractWhatsappInboundMessages` parse payload contoh.
- Integration (`src/lib/garage-whatsapp-inbox.test.ts`):
  - Simulasi webhook inbound → assert conversation + message row + customer link.
  - Enqueue reply → simulasi webhook delivery → assert `whatsapp_messages.status` update.
  - Reply di luar 24h → assert 400.
- Manual (go-live): connect via env, send test, terima inbound (webhook publik/ngrok),
  balas dalam & luar 24h.

## 11. Files To Touch

- `src/db/schema.ts` — 2 tabel baru + export ke `src/db/index` bila perlu.
- `src/lib/garage-whatsapp-messaging.ts` — `sendWhatsappDirect`, `isWithin24hWindow`,
  perluas `updateWhatsappDeliveryStatus` (mirror ke `whatsapp_messages`), `extractWhatsappInboundMessages`.
- `src/app/api/webhooks/whatsapp/route.ts` — inbound handling.
- `src/app/api/whatsapp/conversations/route.ts` — list (GET).
- `src/app/api/whatsapp/conversations/[id]/messages/route.ts` — reply (POST).
- `src/app/api/whatsapp/conversations/[id]/route.ts` — mark-read/assign/close (PATCH).
- `src/app/whatsapp/page.tsx` (+ components) — Inbox UI.
- Settings UI WhatsApp card — halaman integrations settings yg ada.
- `src/lib/role-access.ts` + sidebar config — menu + gate.
- Migration Drizzle baru untuk 2 tabel.
- Test files baru.
