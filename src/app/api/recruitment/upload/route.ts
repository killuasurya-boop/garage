import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import {
  alertRecruitmentStorageFull,
  noteRecruitmentUpload,
  recruitmentStorageDir,
  recruitmentStorageHasRoom,
} from "@/lib/recruitment-storage";

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

// Upload dokumen kandidat (CV / foto / portfolio). Publik tapi rate-limited.
function startsWith(buffer: Buffer, bytes: number[], offset = 0) {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/** Cek tanda tangan file sesuai ekstensi tujuan. */
function contentMatchesExtension(buffer: Buffer, ext: string) {
  switch (ext) {
    case ".pdf":
      return startsWith(buffer, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case ".jpg":
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case ".png":
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47]);
    case ".webp":
      return startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8);
    case ".docx":
      return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]); // zip
    case ".doc":
      return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0]); // OLE
    default:
      return false;
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "recruitment-upload", { limit: 12, windowMs: 60_000 });
  if (limited) return limited;
  // Satu pelamar butuh ±5 berkas; 30/jam per IP cukup untuk beberapa kali coba ulang, menahan unggahan iseng.
  const hourly = rateLimit(request, "recruitment-upload-hour", { limit: 30, windowMs: 3_600_000 });
  if (hourly) return hourly;

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

  const buffer = Buffer.from(await file.arrayBuffer());
  // Tipe dari browser bisa dipalsukan → cocokkan isi file (magic bytes).
  if (!contentMatchesExtension(buffer, ext)) {
    return fail(400, "FILE_CONTENT_MISMATCH", `Isi file tidak sesuai format. ${rule.hint}`);
  }

  // Batas total berkas pelamar: disk penuh tidak boleh ikut mengganggu POS & kasir.
  if (!(await recruitmentStorageHasRoom(buffer.length))) {
    void alertRecruitmentStorageFull();
    return fail(507, "RECRUITMENT_STORAGE_FULL", "Unggahan berkas sedang ditutup sementara. Coba lagi nanti atau hubungi admin GARAGE.");
  }

  const dir = recruitmentStorageDir();
  await mkdir(dir, { recursive: true });
  const fileName = `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  try {
    await writeFile(path.join(dir, fileName), buffer);
    noteRecruitmentUpload(buffer.length);
  } catch (error) {
    console.error("Failed to save recruitment upload", error);
    return fail(500, "FILE_SAVE_FAILED", "Gagal menyimpan file. Coba lagi.");
  }

  return ok({ url: `/api/recruitment/files/${fileName}` }, { status: 201 });
}
