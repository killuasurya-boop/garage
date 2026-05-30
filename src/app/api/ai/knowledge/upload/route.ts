import { fail, ok } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import type {
  AiKnowledgeUploadFileResult,
  AiKnowledgeUploadResponse,
} from "@/lib/garage-api-types";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxFiles = 5;
const maxFileSize = 20 * 1024 * 1024;
const acceptedExtensions = new Set([".pdf", ".md", ".txt", ".csv", ".docx", ".xlsx"]);

type OpenAiVectorStoreFile = {
  id?: string;
  status?: "in_progress" | "completed" | "failed" | "cancelled";
  last_error?: { message?: string } | null;
};

type OpenAiFileResponse = {
  id?: string;
};

function fileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^\w.\- ()]/g, "_").slice(0, 180) || "garage-ai-file";
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
      return error.message;
    }
  }

  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  return fallback;
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

async function uploadToOpenAi(file: File) {
  const form = new FormData();
  form.append("purpose", "assistants");
  form.append("file", file, safeFileName(file.name));

  const response = await openAiFetch("/files", {
    method: "POST",
    body: form,
  });
  const payload = await parseOpenAiJson(response);

  if (!response.ok) {
    throw new Error(openAiErrorMessage(payload, "Upload file ke OpenAI gagal."));
  }

  const uploaded = payload as OpenAiFileResponse;
  if (!uploaded.id) {
    throw new Error("OpenAI tidak mengembalikan file id.");
  }

  return uploaded.id;
}

async function attachToVectorStore(vectorStoreId: string, fileId: string) {
  const response = await openAiFetch(
    `/vector_stores/${encodeURIComponent(vectorStoreId)}/files`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    },
  );
  const payload = await parseOpenAiJson(response);

  if (!response.ok) {
    throw new Error(
      openAiErrorMessage(payload, "File gagal dimasukkan ke vector store."),
    );
  }

  const attached = payload as OpenAiVectorStoreFile;
  return attached.id ?? fileId;
}

async function readVectorStoreFile(vectorStoreId: string, fileId: string) {
  const response = await openAiFetch(
    `/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`,
  );
  const payload = await parseOpenAiJson(response);

  if (!response.ok) {
    throw new Error(
      openAiErrorMessage(payload, "Status indexing file gagal dibaca."),
    );
  }

  return payload as OpenAiVectorStoreFile;
}

async function waitForIndexing(vectorStoreId: string, fileId: string) {
  let lastStatus: OpenAiVectorStoreFile["status"] = "in_progress";

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const vectorFile = await readVectorStoreFile(vectorStoreId, fileId);
    lastStatus = vectorFile.status ?? "in_progress";

    if (lastStatus === "completed") {
      return {
        status: "completed" as const,
        message: "File sudah masuk Knowledge Base.",
      };
    }

    if (lastStatus === "failed" || lastStatus === "cancelled") {
      return {
        status: "failed" as const,
        message:
          vectorFile.last_error?.message ??
          "Indexing file ke Knowledge Base gagal.",
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return {
    status: "in_progress" as const,
    message: `File sedang indexing (${lastStatus ?? "in_progress"}). Coba tanya beberapa saat lagi.`,
  };
}

function validateFile(file: File): string | null {
  const extension = fileExtension(file.name);

  if (!acceptedExtensions.has(extension)) {
    return "Format belum didukung. Gunakan PDF, MD, TXT, CSV, DOCX, atau XLSX.";
  }

  if (file.size > maxFileSize) {
    return "Ukuran file melebihi 20 MB.";
  }

  if (file.size <= 0) {
    return "File kosong.";
  }

  return null;
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const vectorStoreId = process.env.OPENAI_GARAGE_VECTOR_STORE_ID?.trim();
  if (!vectorStoreId) {
    return fail(
      503,
      "AI_KNOWLEDGE_VECTOR_STORE_MISSING",
      "Knowledge Base belum dikonfigurasi. Isi OPENAI_GARAGE_VECTOR_STORE_ID di server.",
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(
      400,
      "INVALID_MULTIPART_FORM",
      "Request harus multipart/form-data dengan field files.",
    );
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File)
    .slice(0, maxFiles);

  if (!files.length) {
    return fail(400, "AI_KNOWLEDGE_FILES_MISSING", "Tidak ada file untuk diupload.");
  }

  const results: AiKnowledgeUploadFileResult[] = [];

  for (const file of files) {
    const validationError = validateFile(file);
    if (validationError) {
      results.push({
        fileName: file.name,
        size: file.size,
        status: "skipped",
        message: validationError,
        openAiFileId: null,
        vectorStoreFileId: null,
      });
      continue;
    }

    try {
      const openAiFileId = await uploadToOpenAi(file);
      const vectorStoreFileId = await attachToVectorStore(vectorStoreId, openAiFileId);
      const indexing = await waitForIndexing(vectorStoreId, openAiFileId);

      results.push({
        fileName: file.name,
        size: file.size,
        status: indexing.status,
        message: indexing.message,
        openAiFileId,
        vectorStoreFileId,
      });
    } catch (error) {
      results.push({
        fileName: file.name,
        size: file.size,
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Upload file ke Knowledge Base gagal.",
        openAiFileId: null,
        vectorStoreFileId: null,
      });
    }
  }

  const uploadedCount = results.filter((file) => file.status === "completed").length;
  const failedCount = results.filter(
    (file) => file.status === "failed" || file.status === "skipped",
  ).length;
  const response: AiKnowledgeUploadResponse = {
    vectorStoreConfigured: true,
    vectorStoreId,
    uploadedCount,
    failedCount,
    files: results,
  };

  await createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "GARAGE AI knowledge uploaded",
    object: `${uploadedCount}/${results.length} file`,
    device: session.data.profile.deviceLabel,
    status: failedCount ? "watch" : "uploaded",
    metadata: {
      vectorStoreConfigured: true,
      uploadedCount,
      failedCount,
      files: results.map((file) => ({
        fileName: file.fileName,
        size: file.size,
        status: file.status,
        message: file.message,
        openAiFileId: file.openAiFileId,
        vectorStoreFileId: file.vectorStoreFileId,
      })),
    },
  }).catch(() => undefined);

  return ok(response);
}
