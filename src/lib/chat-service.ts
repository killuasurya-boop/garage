import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  staffProfiles,
  user,
} from "@/db/schema";
import { chatBus } from "@/lib/chat-events";
import type { Role } from "@/lib/garage-data";

export const GLOBAL_CHANNEL_ROLE_KEY = "__all__";

export type ChatUserSummary = {
  userId: string;
  name: string;
  role: Role;
  outletName: string;
};

export type ChatChannelSummary = {
  id: string;
  type: "direct" | "role" | "broadcast";
  name: string;
  roleKey: string | null;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  unread: number;
  members: Array<{ userId: string; name: string; role: Role }>;
  preview: string | null;
};

export type ChatMessageRow = {
  id: string;
  channelId: string;
  senderUserId: string;
  senderName: string;
  body: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  attachmentSize: number | null;
  replyToId: string | null;
  createdAt: string;
};

function deriveDirectName(currentUserId: string, members: Array<{ userId: string; name: string }>) {
  const other = members.find((m) => m.userId !== currentUserId);
  return other?.name ?? "Direct chat";
}

export async function listChatUsers(currentUserId: string): Promise<ChatUserSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      role: staffProfiles.role,
      outletId: staffProfiles.outletId,
    })
    .from(user)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .where(ne(user.id, currentUserId))
    .orderBy(asc(user.name));

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    role: r.role as Role,
    outletName: r.outletId ?? "",
  }));
}

async function ensureGlobalChannel(): Promise<string> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(chatChannels)
    .where(and(eq(chatChannels.type, "broadcast"), eq(chatChannels.roleKey, GLOBAL_CHANNEL_ROLE_KEY)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(chatChannels)
    .values({
      type: "broadcast",
      name: "# Semua tim",
      roleKey: GLOBAL_CHANNEL_ROLE_KEY,
    })
    .returning();
  return created.id;
}

export async function ensureUserAutoChannels(userId: string, role: Role) {
  const db = getDb();
  const globalChannelId = await ensureGlobalChannel();

  // Role channel — per role, lazy-create
  const roleKey = `role:${role}`;
  let [roleChannel] = await db
    .select()
    .from(chatChannels)
    .where(and(eq(chatChannels.type, "role"), eq(chatChannels.roleKey, roleKey)))
    .limit(1);
  if (!roleChannel) {
    const [created] = await db
      .insert(chatChannels)
      .values({ type: "role", name: `# ${role}`, roleKey })
      .returning();
    roleChannel = created;
  }

  // Pastikan user member dari kedua channel
  await db
    .insert(chatChannelMembers)
    .values([
      { channelId: globalChannelId, userId },
      { channelId: roleChannel.id, userId },
    ])
    .onConflictDoNothing();
}

export async function getOrCreateDirectChannel(
  userIdA: string,
  userIdB: string,
): Promise<string> {
  if (userIdA === userIdB) {
    throw new Error("Tidak bisa DM diri sendiri.");
  }
  const db = getDb();

  // Cari channel direct yang punya kedua user
  const candidate = await db
    .select({ channelId: chatChannelMembers.channelId })
    .from(chatChannelMembers)
    .innerJoin(chatChannels, eq(chatChannels.id, chatChannelMembers.channelId))
    .where(
      and(
        eq(chatChannels.type, "direct"),
        inArray(chatChannelMembers.userId, [userIdA, userIdB]),
      ),
    );

  const counts = new Map<string, number>();
  for (const row of candidate) {
    counts.set(row.channelId, (counts.get(row.channelId) ?? 0) + 1);
  }
  for (const [channelId, count] of counts.entries()) {
    if (count === 2) return channelId;
  }

  const [created] = await db
    .insert(chatChannels)
    .values({ type: "direct", name: null, createdBy: userIdA })
    .returning();

  await db.insert(chatChannelMembers).values([
    { channelId: created.id, userId: userIdA },
    { channelId: created.id, userId: userIdB },
  ]);

  return created.id;
}

export async function listUserChannels(currentUserId: string): Promise<ChatChannelSummary[]> {
  const db = getDb();
  const memberRows = await db
    .select({
      channelId: chatChannelMembers.channelId,
      lastReadAt: chatChannelMembers.lastReadAt,
    })
    .from(chatChannelMembers)
    .where(eq(chatChannelMembers.userId, currentUserId));

  if (memberRows.length === 0) return [];
  const channelIds = memberRows.map((r) => r.channelId);
  const lastReadByChannel = new Map(
    memberRows.map((r) => [r.channelId, r.lastReadAt]),
  );

  const channelRows = await db
    .select()
    .from(chatChannels)
    .where(inArray(chatChannels.id, channelIds))
    .orderBy(desc(chatChannels.lastMessageAt));

  // Members per channel
  const allMembers = await db
    .select({
      channelId: chatChannelMembers.channelId,
      userId: chatChannelMembers.userId,
      name: user.name,
      role: staffProfiles.role,
    })
    .from(chatChannelMembers)
    .innerJoin(user, eq(user.id, chatChannelMembers.userId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, chatChannelMembers.userId))
    .where(inArray(chatChannelMembers.channelId, channelIds));

  const membersByChannel = new Map<
    string,
    Array<{ userId: string; name: string; role: Role }>
  >();
  for (const m of allMembers) {
    const list = membersByChannel.get(m.channelId) ?? [];
    list.push({ userId: m.userId, name: m.name, role: (m.role ?? "Kasir") as Role });
    membersByChannel.set(m.channelId, list);
  }

  // Last message preview per channel
  const previewRows = await db
    .select({
      channelId: chatMessages.channelId,
      body: chatMessages.body,
      attachmentUrl: chatMessages.attachmentUrl,
      createdAt: chatMessages.createdAt,
      rn: sql<number>`row_number() over (partition by ${chatMessages.channelId} order by ${chatMessages.createdAt} desc)::int`,
    })
    .from(chatMessages)
    .where(and(inArray(chatMessages.channelId, channelIds), isNull(chatMessages.deletedAt)));
  const previewByChannel = new Map<string, string>();
  for (const row of previewRows) {
    if (Number(row.rn) === 1) {
      const text = row.body?.trim() || (row.attachmentUrl ? "📎 Lampiran" : "");
      previewByChannel.set(row.channelId, text);
    }
  }

  // Unread count per channel
  const unreadRows = await db
    .select({
      channelId: chatMessages.channelId,
      count: sql<number>`count(*)::int`,
    })
    .from(chatMessages)
    .where(
      and(
        inArray(chatMessages.channelId, channelIds),
        isNull(chatMessages.deletedAt),
        ne(chatMessages.senderUserId, currentUserId),
      ),
    )
    .groupBy(chatMessages.channelId);
  const totalByChannel = new Map<string, number>();
  for (const row of unreadRows) totalByChannel.set(row.channelId, Number(row.count));

  const readSinceRows = await db
    .select({
      channelId: chatMessages.channelId,
      count: sql<number>`count(*)::int`,
    })
    .from(chatMessages)
    .where(
      and(
        inArray(chatMessages.channelId, channelIds),
        isNull(chatMessages.deletedAt),
        ne(chatMessages.senderUserId, currentUserId),
      ),
    )
    .groupBy(chatMessages.channelId);
  // We'll compute unread per channel: total - readSince
  // Simpler: per channel, count messages where createdAt > lastReadAt
  const unreadByChannel = new Map<string, number>();
  for (const channelId of channelIds) {
    const lastRead = lastReadByChannel.get(channelId);
    if (!lastRead) {
      unreadByChannel.set(channelId, totalByChannel.get(channelId) ?? 0);
      continue;
    }
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.channelId, channelId),
          isNull(chatMessages.deletedAt),
          ne(chatMessages.senderUserId, currentUserId),
          gt(chatMessages.createdAt, lastRead),
        ),
      );
    unreadByChannel.set(channelId, Number(row?.count ?? 0));
  }
  // Suppress unused-var lint for readSinceRows
  void readSinceRows;

  return channelRows.map((c) => {
    const members = membersByChannel.get(c.id) ?? [];
    const name =
      c.type === "direct"
        ? deriveDirectName(currentUserId, members)
        : c.name ?? "Channel";
    return {
      id: c.id,
      type: c.type as ChatChannelSummary["type"],
      name,
      roleKey: c.roleKey,
      lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
      lastReadAt: lastReadByChannel.get(c.id)?.toISOString() ?? null,
      unread: unreadByChannel.get(c.id) ?? 0,
      members,
      preview: previewByChannel.get(c.id) ?? null,
    };
  });
}

async function assertMembership(channelId: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);
  if (!row) {
    throw new Error("Anda bukan member channel ini.");
  }
}

export async function listChannelMessages(
  channelId: string,
  currentUserId: string,
  params?: { before?: string; limit?: number },
): Promise<ChatMessageRow[]> {
  await assertMembership(channelId, currentUserId);
  const db = getDb();
  const limit = Math.max(1, Math.min(100, params?.limit ?? 50));
  const before = params?.before ? new Date(params.before) : null;

  const filters = [eq(chatMessages.channelId, channelId), isNull(chatMessages.deletedAt)];
  if (before) filters.push(lt(chatMessages.createdAt, before));

  const rows = await db
    .select({
      id: chatMessages.id,
      channelId: chatMessages.channelId,
      senderUserId: chatMessages.senderUserId,
      senderName: user.name,
      body: chatMessages.body,
      attachmentUrl: chatMessages.attachmentUrl,
      attachmentType: chatMessages.attachmentType,
      attachmentSize: chatMessages.attachmentSize,
      replyToId: chatMessages.replyToId,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .innerJoin(user, eq(user.id, chatMessages.senderUserId))
    .where(and(...filters))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  return rows.reverse().map((r) => ({
    id: r.id,
    channelId: r.channelId,
    senderUserId: r.senderUserId,
    senderName: r.senderName,
    body: r.body,
    attachmentUrl: r.attachmentUrl,
    attachmentType: r.attachmentType,
    attachmentSize: r.attachmentSize,
    replyToId: r.replyToId,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function sendChatMessage(
  channelId: string,
  currentUserId: string,
  payload: {
    body: string;
    attachmentUrl?: string | null;
    attachmentType?: string | null;
    attachmentSize?: number | null;
    replyToId?: string | null;
  },
): Promise<ChatMessageRow> {
  await assertMembership(channelId, currentUserId);
  const db = getDb();
  const body = (payload.body ?? "").trim();
  if (!body && !payload.attachmentUrl) {
    throw new Error("Pesan tidak boleh kosong.");
  }
  if (body.length > 4000) {
    throw new Error("Pesan maksimal 4000 karakter.");
  }

  const [inserted] = await db
    .insert(chatMessages)
    .values({
      channelId,
      senderUserId: currentUserId,
      body,
      attachmentUrl: payload.attachmentUrl ?? null,
      attachmentType: payload.attachmentType ?? null,
      attachmentSize: payload.attachmentSize ?? null,
      replyToId: payload.replyToId ?? null,
    })
    .returning();

  await db
    .update(chatChannels)
    .set({ lastMessageAt: inserted.createdAt, updatedAt: new Date() })
    .where(eq(chatChannels.id, channelId));

  const [senderRow] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, currentUserId))
    .limit(1);

  const memberRows = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .where(eq(chatChannelMembers.channelId, channelId));

  const message: ChatMessageRow = {
    id: inserted.id,
    channelId: inserted.channelId,
    senderUserId: inserted.senderUserId,
    senderName: senderRow?.name ?? "Unknown",
    body: inserted.body,
    attachmentUrl: inserted.attachmentUrl,
    attachmentType: inserted.attachmentType,
    attachmentSize: inserted.attachmentSize,
    replyToId: inserted.replyToId,
    createdAt: inserted.createdAt.toISOString(),
  };

  chatBus.publish({
    kind: "message",
    channelId,
    memberUserIds: memberRows.map((m) => m.userId),
    message,
  });

  return message;
}

export async function markChannelRead(channelId: string, currentUserId: string) {
  await assertMembership(channelId, currentUserId);
  const db = getDb();
  const now = new Date();
  await db
    .update(chatChannelMembers)
    .set({ lastReadAt: now })
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        eq(chatChannelMembers.userId, currentUserId),
      ),
    );
  chatBus.publish({
    kind: "read",
    channelId,
    userId: currentUserId,
    lastReadAt: now.toISOString(),
  });
}

// Suppress unused-export warning for `or` if unused — kept for future filter use.
void or;
