import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import type {
  AiKnowledgeFileRecord,
  AiKnowledgeListResponse,
} from "@/lib/garage-api-types";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

type OpenAiVectorStoreFile = {
  id?: string;
  file_id?: string;
  status?: "in_progress" | "completed" | "failed" | "cancelled";
  created_at?: number;
  usage_bytes?: number;
  last_error?: { message?: string } | null;
};

type OpenAiVectorStoreList = {
  data?: OpenAiVectorStoreFile[];
};

type OpenAiFile = {
  id?: string;
  filename?: string;
  bytes?: number;
  created_at?: number;
};

const deleteSchema = z.object({
  vectorStoreFileId: z.string().min(3).max(160),
  openAiFileId: z.string().min(3).max(160).optional().nullable(),
});

function vectorStoreId() {
  return process.env.OPENAI_GARAGE_VECTOR_STORE_ID?.trim() || null;
}

function maskVectorStoreId(value: string | null) {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function parseOpenAiJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function openAiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if ("error" in payload && payload.error && typeof payload.error === "object") {
    const error = payload.error;
    if ("message" in error && typeof error.message === "string") {
      return sanitizeMessage(error.message);
    }
  }

  if ("message" in payload && typeof payload.message === "string") {
    return sanitizeMessage(payload.message);
  }

  return fallback;
}

function sanitizeMessage(message: string) {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted-key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

async function openAiFetch(path: string, init: RequestInit = {}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY belum dikonfigurasi.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("OpenAI-Beta", "assistants=v2");

  return fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers,
  });
}

function toIsoTime(seconds?: number) {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function retrieveOpenAiFile(fileId: string | null) {
  if (!fileId) {
    return null;
  }

  const response = await openAiFetch(`/files/${encodeURIComponent(fileId)}`);
  const payload = await parseOpenAiJson(response);
  if (!response.ok) {
    return null;
  }

  return payload as OpenAiFile;
}

async function listKnowledgeFiles(storeId: string) {
  const response = await openAiFetch(
    `/vector_stores/${encodeURIComponent(storeId)}/files?limit=40`,
  );
  const payload = await parseOpenAiJson(response);
  if (!response.ok) {
    throw new Error(
      openAiErrorMessage(payload, "Daftar Knowledge Base gagal dibaca."),
    );
  }

  const rows = (payload as OpenAiVectorStoreList | null)?.data ?? [];
  const files = await Promise.all(
    rows.map(async (row): Promise<AiKnowledgeFileRecord> => {
      const openAiFileId = row.file_id ?? row.id ?? null;
      const file = await retrieveOpenAiFile(openAiFileId);

      return {
        vectorStoreFileId: row.id ?? openAiFileId ?? "unknown",
        openAiFileId,
        fileName: file?.filename ?? openAiFileId ?? "Dokumen Knowledge Base",
        status: row.status ?? "unknown",
        sizeBytes: file?.bytes ?? row.usage_bytes ?? null,
        createdAt: toIsoTime(row.created_at ?? file?.created_at),
        lastError: row.last_error?.message
          ? sanitizeMessage(row.last_error.message)
          : null,
      };
    }),
  );

  return files;
}

export async function GET() {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const storeId = vectorStoreId();
  if (!storeId) {
    return ok({
      vectorStoreConfigured: false,
      vectorStoreId: null,
      status: "missing",
      message: "Knowledge Base belum dikonfigurasi.",
      files: [],
    } satisfies AiKnowledgeListResponse);
  }

  try {
    const files = await listKnowledgeFiles(storeId);
    const completed = files.filter((file) => file.status === "completed").length;

    return ok({
      vectorStoreConfigured: true,
      vectorStoreId: maskVectorStoreId(storeId),
      status: files.length ? "ready" : "empty",
      message: files.length
        ? `${completed}/${files.length} dokumen siap dipakai CEO Brain.`
        : "Vector store aktif, tetapi belum ada dokumen.",
      files,
    } satisfies AiKnowledgeListResponse);
  } catch (error) {
    return ok({
      vectorStoreConfigured: true,
      vectorStoreId: maskVectorStoreId(storeId),
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Status Knowledge Base gagal dibaca.",
      files: [],
    } satisfies AiKnowledgeListResponse);
  }
}

export async function DELETE(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const storeId = vectorStoreId();
  if (!storeId) {
    return fail(
      503,
      "AI_KNOWLEDGE_VECTOR_STORE_MISSING",
      "Knowledge Base belum dikonfigurasi.",
    );
  }

  const body = await readJson(request, deleteSchema);
  if (body.error) {
    return body.error;
  }

  const fileId = body.data.openAiFileId ?? body.data.vectorStoreFileId;
  const response = await openAiFetch(
    `/vector_stores/${encodeURIComponent(storeId)}/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
  );
  const payload = await parseOpenAiJson(response);

  if (!response.ok) {
    return fail(
      response.status,
      "AI_KNOWLEDGE_DELETE_FAILED",
      openAiErrorMessage(payload, "Dokumen Knowledge Base gagal dihapus."),
    );
  }

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "GARAGE AI knowledge deleted",
    object: fileId,
    device: session.data.profile.deviceLabel,
    status: "recorded",
    metadata: {
      vectorStoreFileId: body.data.vectorStoreFileId,
      openAiFileId: body.data.openAiFileId ?? null,
    },
  }).catch(() => undefined);

  return ok({
    deleted: true,
    vectorStoreFileId: body.data.vectorStoreFileId,
    openAiFileId: body.data.openAiFileId ?? null,
    message: "Dokumen dihapus dari Knowledge Base.",
  });
}
