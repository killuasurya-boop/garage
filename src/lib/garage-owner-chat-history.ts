import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { aiOwnerChatHistory } from "@/db/schema";
import type {
  AiOwnerChatHistoryRecord,
  AiTokenUsage,
} from "@/lib/garage-api-types";

type CreateOwnerChatHistoryInput = {
  ownerId: string;
  runId?: string | null;
  prompt: string;
  response: string;
  provider?: string | null;
  model?: string | null;
  profile?: string | null;
  tool?: string | null;
  dataAccessLevel?: string | null;
  latencyMs?: number | null;
  tokenUsage?: AiTokenUsage | null;
  metadata?: Record<string, unknown>;
};

function compactText(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

function rowToHistoryRecord(
  row: typeof aiOwnerChatHistory.$inferSelect,
): AiOwnerChatHistoryRecord {
  return {
    id: row.id,
    runId: row.runId,
    prompt: row.prompt,
    response: row.response,
    provider: row.provider,
    model: row.model,
    profile: row.profile,
    tool: row.tool,
    dataAccessLevel: row.dataAccessLevel,
    latencyMs: row.latencyMs,
    tokenUsage: row.tokenUsage ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createOwnerChatHistory(input: CreateOwnerChatHistoryInput) {
  const [row] = await getDb()
    .insert(aiOwnerChatHistory)
    .values({
      ownerId: input.ownerId,
      runId: input.runId ?? null,
      prompt: input.prompt,
      response: input.response,
      provider: input.provider ?? null,
      model: input.model ?? null,
      profile: input.profile ?? null,
      tool: input.tool ?? null,
      dataAccessLevel: input.dataAccessLevel ?? null,
      latencyMs: input.latencyMs ?? null,
      tokenUsage: input.tokenUsage ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();

  return rowToHistoryRecord(row);
}

export async function listOwnerChatHistory(input: {
  ownerId: string;
  search?: string | null;
  limit?: number;
}) {
  const rows = await getDb()
    .select()
    .from(aiOwnerChatHistory)
    .where(eq(aiOwnerChatHistory.ownerId, input.ownerId))
    .orderBy(desc(aiOwnerChatHistory.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 40, 1), 80));
  const search = input.search?.trim().toLowerCase();
  const filtered = search
    ? rows.filter(
        (row) =>
          row.prompt.toLowerCase().includes(search) ||
          row.response.toLowerCase().includes(search),
      )
    : rows;

  return filtered.map(rowToHistoryRecord);
}

export async function getOwnerChatHistory(ownerId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(aiOwnerChatHistory)
    .where(and(eq(aiOwnerChatHistory.ownerId, ownerId), eq(aiOwnerChatHistory.id, id)))
    .limit(1);

  return row ? rowToHistoryRecord(row) : null;
}

export async function deleteOwnerChatHistory(ownerId: string, id: string) {
  const rows = await getDb()
    .delete(aiOwnerChatHistory)
    .where(and(eq(aiOwnerChatHistory.ownerId, ownerId), eq(aiOwnerChatHistory.id, id)))
    .returning({ id: aiOwnerChatHistory.id });

  return rows.length;
}

export async function clearOwnerChatHistory(ownerId: string) {
  const rows = await getDb()
    .delete(aiOwnerChatHistory)
    .where(eq(aiOwnerChatHistory.ownerId, ownerId))
    .returning({ id: aiOwnerChatHistory.id });

  return rows.length;
}

export async function getCompactOwnerChatHistory(input: {
  ownerId: string;
  selectedHistoryId?: string | null;
}) {
  const recent = await getDb()
    .select()
    .from(aiOwnerChatHistory)
    .where(eq(aiOwnerChatHistory.ownerId, input.ownerId))
    .orderBy(desc(aiOwnerChatHistory.createdAt))
    .limit(3);
  const selected = input.selectedHistoryId
    ? await getOwnerChatHistory(input.ownerId, input.selectedHistoryId)
    : null;
  const rows = selected
    ? [
        {
          id: selected.id,
          prompt: selected.prompt,
          response: selected.response,
        },
        ...recent
          .filter((row) => row.id !== selected.id)
          .map((row) => ({
            id: row.id,
            prompt: row.prompt,
            response: row.response,
          })),
      ].slice(0, 3)
    : recent.map((row) => ({
        id: row.id,
        prompt: row.prompt,
        response: row.response,
      }));

  return rows.flatMap((row) => [
    {
      role: "user" as const,
      content: compactText(row.prompt, 700),
    },
    {
      role: "assistant" as const,
      content: compactText(row.response, 900),
    },
  ]);
}
