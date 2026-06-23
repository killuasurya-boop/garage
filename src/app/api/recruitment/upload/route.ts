import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

type UploadKind = "cv" | "photo" | "ktp" | "portfolio" | "certificate";

const uploadRules: Record<UploadKind, { label: string; maxBytes: number; accepted: Record<string, string>; hint: string }> = {
  cv: {
    label: "CV",
    maxBytes: 5 * 1024 * 1024,
    accepted: {
      "application/pdf": ".pdf",
      "application/msword": ".doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    },
    hint: "Format CV harus PDF, DOC, atau DOCX maksimal 5 MB.",
  },
  photo: {
    label: "Pas foto",
    maxBytes: 3 * 1024 * 1024,
    accepted: {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
    },
    hint: "Format pas foto harus JPG, PNG, atau WebP maksimal 3 MB.",
  },
  ktp: {
    label: "KTP",
    maxBytes: 5 * 1024 * 1024,
    accepted: {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
    },
    hint: "Format KTP harus JPG, PNG, atau PDF maksimal 5 MB.",
  },
  portfolio: {
    label: "Portfolio",
    maxBytes: 10 * 1024 * 1024,
    accepted: {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
    },
    hint: "Format portfolio harus PDF, JPG, atau PNG maksimal 10 MB.",
  },
  certificate: {
    label: "Sertifikat",
    maxBytes: 10 * 1024 * 1024,
    accepted: {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
    },
    hint: "Format sertifikat harus PDF, JPG, atau PNG maksimal 10 MB.",
  },
};

function projectRoot() {
  const cwd = process.cwd();
  if (
    path.basename(cwd).toLowerCase() === "standalone" &&
    path.basename(path.dirname(cwd)).toLowerCase() === ".next"
  ) {
    return path.resolve(cwd, "..", "..");
  }
  return process.env.GARAGE_PROJECT_ROOT
    ? path.resolve(process.env.GARAGE_PROJECT_ROOT)
    : cwd;
}

// Upload dokumen kandidat (CV / foto / portfolio). Publik tapi rate-limited.
export async function POST(request: Request) {
  const limited = rateLimit(request, "recruitment-upload", { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART", "Request harus multipart/form-data dengan field file.");
  }

  const file = formData.get("file");
  const kindRaw = String(formData.get("kind") ?? "cv").replace(/[^a-z]/gi, "").toLowerCase();
  const kind = (Object.keys(uploadRules).includes(kindRaw) ? kindRaw : "cv") as UploadKind;
  const rule = uploadRules[kind];
  if (!(file instanceof File)) {
    return fail(400, "FILE_MISSING", "File wajib diupload.");
  }
  if (file.size <= 0) {
    return fail(400, "FILE_EMPTY", "File kosong.");
  }
  if (file.size > rule.maxBytes) {
    return fail(413, "FILE_TOO_LARGE", `${rule.label} terlalu besar. ${rule.hint}`);
  }
  const ext = rule.accepted[file.type.toLowerCase()];
  if (!ext) {
    return fail(400, "FILE_UNSUPPORTED", rule.hint);
  }

  const dir = path.join(projectRoot(), "storage", "recruitment");
  await mkdir(dir, { recursive: true });
  const fileName = `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  try {
    await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return fail(500, "FILE_SAVE_FAILED", error instanceof Error ? error.message : "Gagal menyimpan file.");
  }

  return ok({ url: `/api/recruitment/files/${fileName}` }, { status: 201 });
}
