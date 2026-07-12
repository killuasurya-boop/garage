# Rencana Implementasi — WhatsApp Inbox 2-Arah + Settings UI

> **Untuk agentic workers:** SUB-SKILL WAJIB: gunakan superpowers:subagent-driven-development (rekomendasi) atau superpowers:executing-plans untuk menjalankan plan ini task-per-task. Step pakai syntax checkbox (`- [ ]`).

**Goal:** Tambahkan kemampuan WhatsApp 2-arah ke GARAGE OS: terima pesan masuk customer, simpan percakapan, dan CS bisa membalas dari Inbox dengan aturan jendela 24 jam Meta, plus UI Settings WhatsApp.

**Architecture:** Sisi outbound sudah ada (`whatsapp_messaging_queue` + Meta Cloud API). Kita tambah 2 tabel (`whatsapp_conversations`, `whatsapp_messages`), perluas webhook untuk menangkap pesan inbound, tambah API reply (inline send dengan validasi 24h), UI Inbox 2-pane, dan card Settings WhatsApp. Balasan CS dikirim inline (volume rendah) dan status kirim di-mirror dari webhook ke `whatsapp_messages`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Drizzle ORM + PGlite/PostgreSQL, Vitest (test), Tailwind + shadcn/ui + Framer Motion (UI), Meta WhatsApp Cloud API.

## Constraint Global

- Auth: `requireGarageSession(["Owner / CEO", ...])` dari `@/lib/server-auth` → `{ response?, data? }` (data.user.id).
- Response: `ok(payload, opts?)`, `fail(status, code, message)`, `readJson(request, schema)` dari `@/lib/api-response`.
- Normalisasi nomor: `normalizeWhatsappRecipient(value)` (sudah ada) → `62xxxx`.
- DB: `getDb()` dari `@/db`; tabel di `@/db/schema`.
- Test: `npm test` (= `vitest run`). Migrasi: `npm run db:generate` lalu `npm run db:migrate`.
- UI wajib ikut `ui-ux-pro-max`: crop-mark, warna status CMYK, target 44px, kontras >=4.5:1, reduced-motion, transisi 100–300ms.
- YAGNI: tidak ada auto-reply bot, routing multi-agent, auto-create customer, broadcast builder.

---

### Task 1: Skema & Migrasi — `whatsapp_conversations` + `whatsapp_messages`

**Files:**
- Modify: `src/db/schema.ts` (tambah 2 tabel setelah `whatsappMessagingQueue`, sekitar baris 1427)
- Test: `src/db/whatsapp-schema.test.ts`

**Interfaces:**
- Produces: tabel `whatsappConversations`, `whatsappMessages` (diimpor task berikutnya dari `@/db/schema`).

- [ ] **Step 1: Tulis test skema (import berhasil & bentuk kolom)**

```ts
import { describe, expect, it } from "vitest";
import { whatsappConversations, whatsappMessages } from "@/db/schema";

describe("skema WhatsApp inbox", () => {
  it("whatsapp_conversations punya kolom wajib", () => {
    const cols = whatsappConversations;
    expect(cols.phoneNumber).toBeDefined();
    expect(cols.customerId).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.unreadCount).toBeDefined();
    expect(cols.lastInboundAt).toBeDefined();
  });

  it("whatsapp_messages punya kolom arah & status", () => {
    const cols = whatsappMessages;
    expect(cols.conversationId).toBeDefined();
    expect(cols.direction).toBeDefined();
    expect(cols.messageType).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.providerMessageId).toBeDefined();
  });
});
```

- [ ] **Step 2: Jalankan test → gagal (tabel belum ada)**

Run: `npm test src/db/whatsapp-schema.test.ts`
Expected: FAIL — `whatsappConversations` is not exported.

- [ ] **Step 3: Tambahkan skema (tempel setelah definisi `whatsappMessagingQueue`)**

```ts
// Percakapan WhatsApp 2-arah: 1 nomor = 1 percakapan (upsert by phone).
export const whatsappConversations = pgTable(
  "whatsapp_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    status: text("status").notNull().default("open"),
    unreadCount: integer("unread_count").notNull().default(0),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    phoneIdx: uniqueIndex("whatsapp_conversations_phone_idx").on(table.phoneNumber),
    statusIdx: index("whatsapp_conversations_status_idx").on(table.status),
    customerIdx: index("whatsapp_conversations_customer_idx").on(table.customerId),
  }),
);

// Pesan per percakapan: inbound (customer) / outbound (CS/staff).
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    messageType: text("message_type").notNull().default("text"),
    body: text("body"),
    templateName: text("template_name"),
    templateParams: jsonb("template_params")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status").notNull().default("received"),
    providerMessageId: text("provider_message_id"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    convIdx: index("whatsapp_messages_conversation_idx").on(table.conversationId),
    provIdx: index("whatsapp_messages_provider_idx").on(table.providerMessageId),
  }),
);
```

- [ ] **Step 4: Jalankan test → PASS**

Run: `npm test src/db/whatsapp-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Generate & jalankan migrasi**

Run: `npm run db:generate` lalu `npm run db:migrate`
Expected: file migrasi baru di `drizzle/` dan tabel terbuat (cek `npm run db:studio` bila perlu).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/whatsapp-schema.test.ts drizzle
git commit -m "feat(whatsapp): skema whatsapp_conversations + whatsapp_messages"
```

---

### Task 2: Lib pesan — `sendWhatsappDirect`, `isWithin24hWindow`, `extractWhatsappInboundMessages`, mirror status

**Files:**
- Modify: `src/lib/garage-whatsapp-messaging.ts`
- Test: `src/lib/garage-whatsapp-inbox.test.ts`

**Interfaces:**
- Consumes: `whatsappConversations`, `whatsappMessages` (Task 1), `normalizeWhatsappRecipient` (sudah ada), `getDb`, `getConnectedAccessToken` (sudah ada).
- Produces:
  - `sendWhatsappDirect(input: { recipient; messageType: "text"|"template"; body?; templateName?; templateParameters?; createdBy? }): Promise<{ id; providerMessageId }>` — kirim langsung ke Meta, return id pesan (provider).
  - `isWithin24hWindow(lastInboundAt: Date | null): boolean`
  - `extractWhatsappInboundMessages(payload): { from; body; messageId }[]`
  - `updateWhatsappDeliveryStatus(...)` diperluas: juga update `whatsapp_messages.status` where `providerMessageId` match.

- [ ] **Step 1: Tulis test**

```ts
import { describe, expect, it } from "vitest";
import {
  extractWhatsappInboundMessages,
  isWithin24hWindow,
} from "@/lib/garage-whatsapp-messaging";

describe("parse inbound WhatsApp", () => {
  it("mengambil pesan teks masuk dari webhook", () => {
    expect(
      extractWhatsappInboundMessages({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    { from: "62812000111", id: "wamid.in.1", text: { body: "Halo" }, type: "text" },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([{ from: "62812000111", body: "Halo", messageId: "wamid.in.1" }]);
  });

  it("jendela 24 jam: dalam window true, lewat false, null false", () => {
    const now = new Date();
    const inWindow = new Date(now.getTime() - 60 * 60 * 1000); // 1 jam lalu
    const outWindow = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 jam lalu
    expect(isWithin24hWindow(inWindow)).toBe(true);
    expect(isWithin24hWindow(outWindow)).toBe(false);
    expect(isWithin24hWindow(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test → gagal**

Run: `npm test src/lib/garage-whatsapp-inbox.test.ts`
Expected: FAIL — fungsi belum ada.

- [ ] **Step 3: Implementasi di `garage-whatsapp-messaging.ts`**

Tambahkan import di bagian atas:
```ts
import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { whatsappConversations, whatsappMessages } from "@/db/schema";
```

Tambahkan fungsi (tempel setelah `processWhatsappQueue`):
```ts
export function isWithin24hWindow(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  const diffMs = Date.now() - new Date(lastInboundAt).getTime();
  return diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;
}

export function extractWhatsappInboundMessages(payload: unknown) {
  const typed = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };
  const out: Array<{ from: string; body: string; messageId: string }> = [];
  for (const entry of typed?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (!message.from || !message.id) continue;
        if (message.type === "text") {
          out.push({
            from: normalizeWhatsappRecipient(message.from),
            body: message.text?.body ?? "",
            messageId: message.id,
          });
        }
      }
    }
  }
  return out;
}

export async function sendWhatsappDirect(input: {
  recipient: string;
  messageType: "text" | "template";
  body?: string | null;
  templateName?: string | null;
  templateParameters?: string[];
  createdBy?: string | null;
}) {
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  if (!phoneNumberId) throw new Error("WHATSAPP_CLOUD_PHONE_NUMBER_ID belum dikonfigurasi.");
  const token =
    process.env.WHATSAPP_CLOUD_API_TOKEN?.trim() ||
    (await getConnectedAccessToken("whatsapp", "phone_number").catch(() => null))?.token;
  if (!token) throw new Error("WhatsApp Cloud API belum dikonfigurasi.");
  const version = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v23.0";
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: normalizeWhatsappRecipient(input.recipient),
    type: input.messageType,
  };
  if (input.messageType === "text") {
    payload.text = { body: input.body ?? "" };
  } else {
    payload.template = {
      name: input.templateName,
      language: { code: "id" },
      components: input.templateParameters?.length
        ? [
            {
              type: "body",
              parameters: input.templateParameters.map((text) => ({ type: "text", text })),
            },
          ]
        : [],
    };
  }
  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  const result = (await response.json()) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
  if (!response.ok || !result.messages?.[0]?.id) {
    throw new Error(result.error?.message || `WhatsApp Cloud API gagal (${response.status}).`);
  }
  return { providerMessageId: result.messages[0].id };
}
```

Perluas `updateWhatsappDeliveryStatus` agar mirror ke `whatsapp_messages`:
```ts
export async function updateWhatsappDeliveryStatus(
  providerMessageId: string,
  status: string,
  error?: string | null,
) {
  const allowed = ["sent", "delivered", "read", "failed"];
  if (!allowed.includes(status)) return null;
  const [row] = await getDb()
    .update(whatsappMessagingQueue)
    .set({
      status,
      error: status === "failed" ? error?.slice(0, 1000) || "Delivery gagal." : null,
      updatedAt: new Date(),
    })
    .where(eq(whatsappMessagingQueue.providerMessageId, providerMessageId))
    .returning();
  // Mirror ke pesan inbox (jika pesan ini berasal dari reply CS).
  await getDb()
    .update(whatsappMessages)
    .set({ status, updatedAt: new Date() })
    .where(eq(whatsappMessages.providerMessageId, providerMessageId));
  return row ?? null;
}
```

- [ ] **Step 4: Jalankan test → PASS**

Run: `npm test src/lib/garage-whatsapp-inbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/garage-whatsapp-messaging.ts src/lib/garage-whatsapp-inbox.test.ts
git commit -m "feat(whatsapp): send direct, parse inbound, mirror delivery status"
```

---

### Task 3: Webhook inbound — simpan percakapan & pesan masuk

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts`
- Test: `src/lib/garage-whatsapp-webhook.test.ts`

**Interfaces:**
- Consumes: `extractWhatsappInboundMessages`, `updateWhatsappDeliveryStatus` (Task 2), `whatsappConversations`, `whatsappMessages`, `customers`.
- Produces: baris DB conversation + message saat pesan masuk.

- [ ] **Step 1: Tulis test**

```ts
import { describe, expect, it } from "vitest";
import { handleWhatsappInbound } from "@/lib/garage-whatsapp-webhook";

describe("webhook inbound", () => {
  it("upsert conversation + insert pesan inbound", async () => {
    const before = await getDb().select().from(whatsappConversations);
    await handleWhatsappInbound([
      { from: "62812000111", body: "Halo", messageId: "wamid.in.test" },
    ]);
    const conv = await getDb()
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.phoneNumber, "62812000111"))
      .limit(1);
    expect(conv.length).toBe(1);
    expect(conv[0].unreadCount).toBeGreaterThanOrEqual(1);
    expect(conv[0].lastInboundAt).not.toBeNull();
    const msgs = await getDb()
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conv[0].id));
    expect(msgs.some((m) => m.direction === "inbound" && m.body === "Halo")).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan test → gagal**

Run: `npm test src/lib/garage-whatsapp-webhook.test.ts`
Expected: FAIL.

- [ ] **Step 3: Buat `src/lib/garage-whatsapp-webhook.ts`**

```ts
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, whatsappConversations, whatsappMessages } from "@/db/schema";
import { normalizeWhatsappRecipient } from "@/lib/garage-whatsapp-messaging";

async function findCustomerIdByPhone(phone: string) {
  const [customer] = await getDb()
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);
  return customer?.id ?? null;
}

export async function handleWhatsappInbound(
  messages: Array<{ from: string; body: string; messageId: string }>,
) {
  const db = getDb();
  for (const msg of messages) {
    const phoneNumber = normalizeWhatsappRecipient(msg.from);
    const customerId = await findCustomerIdByPhone(phoneNumber);
    const [conv] = await db
      .insert(whatsappConversations)
      .values({ phoneNumber, customerId, unreadCount: 1, lastInboundAt: new Date(), lastMessagePreview: msg.body })
      .onConflictDoUpdate({
        target: whatsappConversations.phoneNumber,
        set: {
          unreadCount: sql`${whatsappConversations.unreadCount} + 1`,
          lastInboundAt: new Date(),
          lastMessagePreview: msg.body,
          updatedAt: new Date(),
          ...(customerId ? { customerId } : {}),
        },
      })
      .returning();
    await db.insert(whatsappMessages).values({
      conversationId: conv.id,
      direction: "inbound",
      messageType: "text",
      body: msg.body,
      status: "received",
      providerMessageId: msg.messageId,
    });
  }
}
```

- [ ] **Step 4: Perluas route webhook `src/app/api/webhooks/whatsapp/route.ts`**

Ganti blok `POST` agar juga menangani inbound:
```ts
import { fail, ok } from "@/lib/api-response";
import {
  extractWhatsappDeliveryEvents,
  extractWhatsappInboundMessages,
  updateWhatsappDeliveryStatus,
} from "@/lib/garage-whatsapp-messaging";
import { handleWhatsappInbound } from "@/lib/garage-whatsapp-webhook";
import { verifyMetaWebhookSignature } from "@/lib/garage-provider-adapters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() &&
    url.searchParams.get("hub.challenge")
  ) {
    return new Response(url.searchParams.get("hub.challenge"));
  }
  return fail(403, "WEBHOOK_VERIFY_FAILED", "Verifikasi webhook WhatsApp gagal.");
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaWebhookSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return fail(401, "WEBHOOK_SIGNATURE_INVALID", "Signature webhook WhatsApp tidak valid.");
  }
  const payload = JSON.parse(raw) as unknown;
  let updated = 0;
  for (const event of extractWhatsappDeliveryEvents(payload)) {
    const row = await updateWhatsappDeliveryStatus(event.providerMessageId, event.status, event.error);
    if (row) updated += 1;
  }
  const inbound = extractWhatsappInboundMessages(payload);
  if (inbound.length) await handleWhatsappInbound(inbound);
  return ok({ received: true, updated, inbound: inbound.length });
}
```

- [ ] **Step 5: Jalankan test → PASS**

Run: `npm test src/lib/garage-whatsapp-webhook.test.ts`
Expected: PASS. (Pastikan migrasi Task 1 sudah dijalankan ke DB test/PGLite.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/garage-whatsapp-webhook.ts src/app/api/webhooks/whatsapp/route.ts src/lib/garage-whatsapp-webhook.test.ts
git commit -m "feat(whatsapp): tangkap pesan inbound + simpan percakapan"
```

---

### Task 4: API Inbox — list, reply (dengan aturan 24h), mark-read/assign/close

**Files:**
- Create: `src/app/api/whatsapp/conversations/route.ts` (GET list)
- Create: `src/app/api/whatsapp/conversations/[id]/messages/route.ts` (POST reply)
- Create: `src/app/api/whatsapp/conversations/[id]/route.ts` (PATCH)
- Test: `src/lib/garage-whatsapp-api.test.ts`

**Interfaces:**
- Consumes: `sendWhatsappDirect`, `isWithin24hWindow` (Task 2), `whatsappConversations`, `whatsappMessages`, `requireGarageSession`, `ok/fail/readJson`.
- Produces: endpoint JSON untuk UI Inbox.

- [ ] **Step 1: Tulis test**

```ts
import { describe, expect, it } from "vitest";
// Asumsi sudah ada conversation + customer fixture di DB test.
import { requireGarageSession } from "@/lib/server-auth";
// (test integrasi cukup verifikasi logic 24h via unit; endpoint diuji manual/api test)
import { isWithin24hWindow } from "@/lib/garage-whatsapp-messaging";

describe("aturan 24 jam reply", () => {
  it("reply teks ditolak di luar 24 jam", () => {
    expect(isWithin24hWindow(new Date(Date.now() - 25 * 3600 * 1000))).toBe(false);
  });
});
```

- [ ] **Step 2: Buat `src/app/api/whatsapp/conversations/route.ts`**

```ts
import { desc, eq } from "drizzle-orm";
import { ok } from "@/lib/api-response";
import { getDb } from "@/db";
import { whatsappConversations } from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Manager Operasional",
    "Admin",
    "Customer Service",
  ]);
  if (session.response) return session.response;
  const rows = await getDb()
    .select()
    .from(whatsappConversations)
    .orderBy(desc(whatsappConversations.lastInboundAt))
    .limit(200);
  return ok(rows);
}
```

- [ ] **Step 3: Buat `src/app/api/whatsapp/conversations/[id]/messages/route.ts`**

```ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api-response";
import { getDb } from "@/db";
import { whatsappConversations, whatsappMessages } from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";
import { isWithin24hWindow, sendWhatsappDirect } from "@/lib/garage-whatsapp-messaging";

export const runtime = "nodejs";

const schema = z.object({
  type: z.enum(["text", "template"]),
  text: z.string().max(4096).optional(),
  templateName: z.string().trim().min(1).max(512).optional(),
  templateParameters: z.array(z.string().max(1024)).max(20).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Manager Operasional",
    "Admin",
    "Customer Service",
  ]);
  if (session.response) return session.response;
  const { id } = await params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;

  const [conv] = await getDb()
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, id))
    .limit(1);
  if (!conv) return fail(404, "CONVERSATION_NOT_FOUND", "Percakapan tidak ditemukan.");

  if (body.data.type === "text") {
    if (!isWithin24hWindow(conv.lastInboundAt)) {
      return fail(
        400,
        "WHATSAPP_24H_WINDOW_EXPIRED",
        "Gunakan template untuk membalas di luar jendela 24 jam.",
      );
    }
    const { providerMessageId } = await sendWhatsappDirect({
      recipient: conv.phoneNumber,
      messageType: "text",
      body: body.data.text,
      createdBy: session.data.user.id,
    });
    const [msg] = await getDb()
      .insert(whatsappMessages)
      .values({
        conversationId: conv.id,
        direction: "outbound",
        messageType: "text",
        body: body.data.text,
        status: "sent",
        providerMessageId,
        createdBy: session.data.user.id,
      })
      .returning();
    await getDb()
      .update(whatsappConversations)
      .set({ unreadCount: 0, lastMessagePreview: body.data.text, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, conv.id));
    return ok(msg, { status: 201 });
  }

  // template
  const { providerMessageId } = await sendWhatsappDirect({
    recipient: conv.phoneNumber,
    messageType: "template",
    templateName: body.data.templateName,
    templateParameters: body.data.templateParameters,
    createdBy: session.data.user.id,
  });
  const [msg] = await getDb()
    .insert(whatsappMessages)
    .values({
      conversationId: conv.id,
      direction: "outbound",
      messageType: "template",
      templateName: body.data.templateName,
      templateParams: body.data.templateParameters ?? [],
      status: "sent",
      providerMessageId,
      createdBy: session.data.user.id,
    })
    .returning();
  await getDb()
    .update(whatsappConversations)
    .set({
      unreadCount: 0,
      lastMessagePreview: `Template: ${body.data.templateName}`,
      updatedAt: new Date(),
    })
    .where(eq(whatsappConversations.id, conv.id));
  return ok(msg, { status: 201 });
}
```

- [ ] **Step 4: Buat `src/app/api/whatsapp/conversations/[id]/route.ts`**

```ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api-response";
import { getDb } from "@/db";
import { whatsappConversations, whatsappMessages } from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["mark_read", "assign", "close", "open"]),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Manager Operasional",
    "Admin",
    "Customer Service",
  ]);
  if (session.response) return session.response;
  const { id } = await params;
  const [conv] = await getDb()
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, id))
    .limit(1);
  if (!conv) return fail(404, "CONVERSATION_NOT_FOUND", "Percakapan tidak ditemukan.");
  const messages = await getDb()
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.conversationId, conv.id))
    .orderBy(whatsappMessages.createdAt);
  return ok({ conversation: conv, messages });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Manager Operasional",
    "Admin",
    "Customer Service",
  ]);
  if (session.response) return session.response;
  const { id } = await params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const [conv] = await getDb()
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, id))
    .limit(1);
  if (!conv) return fail(404, "CONVERSATION_NOT_FOUND", "Percakapan tidak ditemukan.");

  if (body.data.action === "mark_read") {
    await getDb()
      .update(whatsappConversations)
      .set({ unreadCount: 0, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, id));
  } else if (body.data.action === "assign") {
    await getDb()
      .update(whatsappConversations)
      .set({ assignedTo: session.data.user.id, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, id));
  } else if (body.data.action === "close" || body.data.action === "open") {
    await getDb()
      .update(whatsappConversations)
      .set({ status: body.data.action === "close" ? "closed" : "open", updatedAt: new Date() })
      .where(eq(whatsappConversations.id, id));
  }
  const [updated] = await getDb()
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, id))
    .limit(1);
  return ok(updated);
}
```

- [ ] **Step 5: Jalankan test & lint**

Run: `npm test src/lib/garage-whatsapp-api.test.ts && npm run lint`
Expected: PASS (unit 24h) + lint bersih.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/whatsapp
git commit -m "feat(whatsapp): API inbox list/reply/mark-read/assign/close"
```

---

### Task 5: UI Inbox 2-pane (`/whatsapp`)

**Files:**
- Create: `src/app/whatsapp/page.tsx`
- Create: `src/app/whatsapp/[id]/page.tsx` (opsional; list+thread bisa 1 halaman)
- Create: `src/components/whatsapp/WhatsappInbox.tsx`
- Create: `src/components/whatsapp/ConversationList.tsx`
- Create: `src/components/whatsapp/MessageThread.tsx`
- Create: `src/components/whatsapp/ReplyComposer.tsx`

**Interfaces:**
- Consumes: endpoint Task 4 (`/api/whatsapp/conversations`, `/api/whatsapp/conversations/[id]`, POST messages).
- Produces: halaman Inbox yang bisa dipakai CS.

- [ ] **Step 1: Buat `WhatsappInbox.tsx` (client component, fetch + state)**

Komponen utama: fetch list di `useEffect`, pilih conversation → fetch detail, render list + thread + composer. Gunakan `fetch('/api/whatsapp/conversations')`. Tampilkan bubble: inbound kiri, outbound kanan. Status tick dari `status` (sent/delivered/read).

- [ ] **Step 2: Buat `ConversationList.tsx`**

Prop: `conversations`, `selectedId`, `onSelect`. Tampilkan nama customer (atau nomor), preview, waktu relatif, badge unread (warna Magenta `#E8368F` untuk attention). Crop-mark di item aktif.

- [ ] **Step 3: Buat `MessageThread.tsx`**

Prop: `messages`, `conversation`. Render bubble dengan JetBrains Mono untuk timestamp. Status: sent (✓), delivered (✓✓ cyan `#00C2D9`), read (✓✓ hitam/putih).

- [ ] **Step 4: Buat `ReplyComposer.tsx`**

Prop: `conversation`, `onSent`. State: `text`, `mode` (text/template), `templateName`. Logika: jika `conversation.lastInboundAt` di luar 24h → textarea disabled + tampil picker template + hint "Gunakan template (24 jam habis)". Kirim `POST /api/whatsapp/conversations/[id]/messages`. Tangani 400 `WHATSAPP_24H_WINDOW_EXPIRED` → tampilkan pesan & paksa mode template.

- [ ] **Step 5: Buat `src/app/whatsapp/page.tsx`**

Server component shell (layout GARAGE OS) yang merender `<WhatsappInbox />`. Ikuti konvensi layout halaman yang sudah ada (cek `src/app/owner/payroll` sebagai referensi struktur). Pastikan target sentuh 44px, kontras >=4.5:1, animasi Framer Motion 100–300ms, `prefers-reduced-motion` dihormati.

- [ ] **Step 6: Build & lint**

Run: `npm run lint` dan `npm run build`
Expected: build sukses, lint bersih.

- [ ] **Step 7: Commit**

```bash
git add src/app/whatsapp src/components/whatsapp
git commit -m "feat(whatsapp): UI inbox 2-pane + composer dengan aturan 24h"
```

---

### Task 6: Settings UI WhatsApp (card Integrations)

**Files:**
- Modify: halaman Settings/Integrations yang ada (cari file `src/app/.../integrations` atau `src/app/settings`) — tambah card WhatsApp.
- Create: `src/components/settings/WhatsappIntegrationCard.tsx`

**Interfaces:**
- Consumes: `listIntegrations()` / `buildIntegrationReadiness` (sudah ada) untuk provider `whatsapp`; endpoint test sudah ada (`/api/integrations/whatsapp/test`); `enqueueWhatsappMessage` untuk send test.
- Produces: card status + tombol test.

- [ ] **Step 1: Cari halaman Settings/Integrations**

Run (grep): cari file yang merender daftar integrations. Tambahkan `WhatsappIntegrationCard` di sana.

- [ ] **Step 2: Buat `WhatsappIntegrationCard.tsx`**

Fetch `/api/integrations` (atau panggil `listIntegrations` di server component). Tampilkan:
- Status: `not_configured` / `connected` / `error` dengan warna CMYK.
- Readiness checks (env lengkap?, resource phone_number terhubung?, health check?).
- Nomor terverifikasi dari resource metadata.
- Tombol "Test Connection" → `POST /api/integrations/whatsapp/test`.
- Tombol "Send Test Message" → `POST /api/messaging/whatsapp` (reuse) dengan template + idempotencyKey.

- [ ] **Step 3: Pasang card ke halaman settings**

- [ ] **Step 4: Lint & build**

Run: `npm run lint && npm run build`
Expected: sukses.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/WhatsappIntegrationCard.tsx <file settings yang diubah>
git commit -m "feat(whatsapp): card Settings Integrations + test connection"
```

---

### Task 7: Nav & Role Gate

**Files:**
- Modify: `src/lib/role-access.ts` (tambah menu WhatsApp Inbox + gate route)
- Modify: konfigurasi sidebar (cari file menu navigasi, mis. `src/components/*/Sidebar` atau `*nav*`) untuk tambah item "WhatsApp Inbox".

**Interfaces:**
- Consumes: route `/whatsapp` (Task 5).
- Produces: menu terlihat hanya untuk role CS/Owner/Manager/Admin.

- [ ] **Step 1: Tambah gate di `role-access.ts`**

Tambahkan entri module `whatsapp` dengan route `/whatsapp` dan role `["Owner / CEO","Manager Operasional","Admin","Customer Service"]`. Ikuti pola entri modul yang sudah ada di file tersebut.

- [ ] **Step 2: Tambah item menu sidebar**

Di konfigurasi nav yang digunakan (cek struktur folder `src/app` + komponen sidebar), tambahkan item "WhatsApp Inbox" → `/whatsapp`, dengan icon SVG (bukan emoji).

- [ ] **Step 3: Lint & build**

Run: `npm run lint && npm run build`
Expected: sukses.

- [ ] **Step 4: Commit**

```bash
git add src/lib/role-access.ts <file sidebar>
git commit -m "feat(whatsapp): menu nav + role gate inbox"
```

---

### Task 8: Integration test & verifikasi manual

**Files:**
- Test: `src/lib/garage-whatsapp-flow.test.ts`

- [ ] **Step 1: Tulis integration test alur**

```ts
import { describe, expect, it } from "vitest";
import { handleWhatsappInbound } from "@/lib/garage-whatsapp-webhook";
import { updateWhatsappDeliveryStatus } from "@/lib/garage-whatsapp-messaging";
import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import { whatsappConversations, whatsappMessages } from "@/db/schema";

describe("alur inbox end-to-end (DB)", () => {
  it("inbound lalu delivery status ter-mirror ke pesan", async () => {
    await handleWhatsappInbound([{ from: "62812000999", body: "Test", messageId: "wamid.flow.1" }]);
    const conv = await getDb().select().from(whatsappConversations).where(eq(whatsappConversations.phoneNumber, "62812000999")).limit(1);
    await updateWhatsappDeliveryStatus("wamid.flow.1", "delivered");
    const msgs = await getDb().select().from(whatsappMessages).where(eq(whatsappMessages.conversationId, conv[0].id));
    expect(msgs[0].status).toBe("delivered");
  });
});
```

- [ ] **Step 2: Jalankan semua test**

Run: `npm test`
Expected: semua PASS.

- [ ] **Step 3: Build & lint final**

Run: `npm run build && npm run lint`
Expected: sukses.

- [ ] **Step 4: Verifikasi manual (go-live)**

1. Set env `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `META_WEBHOOK_VERIFY_TOKEN`.
2. `npm run db:migrate`.
3. Buka Settings → WhatsApp → Test Connection (hijau).
4. Kirim pesan ke nomor dari WA customer → cek Inbox menerima (butuh webhook publik/ngrok ke `/api/webhooks/whatsapp`).
5. Balas dalam 24h (teks bebas) → customer menerima. Balas di luar 24h → UI paksa template.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "test(whatsapp): integration flow inbox + dokumentasi go-live"
```
