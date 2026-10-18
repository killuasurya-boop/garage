import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Dokumen karyawan (foto, KTP, CV, kontrak) & foto member disimpan di
// storage/profiles (di luar public/, hanya lewat API ber-auth).
// Volume Docker: garage-profile-files.

export type ProfileFileScope = "staff" | "member" | "payment";
export type ProfileFileExt = ".jpg" | ".png" | ".webp" | ".pdf";

export const PROFILE_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_FILE_NAME = /^(staff|member|payment)-[0-9a-f-]{36}-\d{13}-[a-f0-9]{8}\.(jpg|png|webp|pdf)$/;

export const PROFILE_FILE_TYPES: Record<ProfileFileExt, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export function profileFilesDir(scope: ProfileFileScope) {
  const cwd = process.cwd();
  const root =
    path.basename(cwd).toLowerCase() === "standalone" && path.basename(path.dirname(cwd)).toLowerCase() === ".next"
      ? path.resolve(cwd, "..", "..")
      : process.env.GARAGE_PROJECT_ROOT
        ? path.resolve(process.env.GARAGE_PROJECT_ROOT)
        : cwd;
  return path.join(root, "storage", "profiles", scope);
}

function startsWith(buffer: Buffer, bytes: number[], offset = 0) {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/** Jenis file dari isi (magic bytes), bukan dari tipe kiriman browser. */
export function detectProfileFile(buffer: Buffer, allowPdf: boolean): ProfileFileExt | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return ".jpg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return ".png";
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return ".webp";
  if (allowPdf && startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return ".pdf";
  return null;
}

export class ProfileFileError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProfileFileError";
  }
}

/** Validasi + simpan file unggahan. Mengembalikan nama file tersimpan. */
export async function saveProfileFile(
  scope: ProfileFileScope,
  ownerId: string,
  file: unknown,
  options: { allowPdf: boolean },
): Promise<string> {
  if (!(file instanceof File) || file.size <= 0) throw new ProfileFileError(400, "FILE_MISSING", "Pilih file dulu.");
  if (file.size > PROFILE_FILE_MAX_BYTES) throw new ProfileFileError(413, "FILE_TOO_LARGE", "File terlalu besar (maks 5 MB).");
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = detectProfileFile(buffer, options.allowPdf);
  if (!ext) {
    throw new ProfileFileError(
      400,
      "FILE_UNSUPPORTED",
      options.allowPdf ? "File harus JPG, PNG, WEBP, atau PDF." : "Foto harus JPG, PNG, atau WEBP.",
    );
  }
  const fileName = `${scope}-${ownerId.toLowerCase()}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  const dir = profileFilesDir(scope);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), buffer);
  return fileName;
}

/** Baca file; null bila nama tidak valid, bukan milik `ownerId`, atau tidak ada. */
export async function readProfileFile(scope: ProfileFileScope, ownerId: string, fileName: string) {
  if (!PROFILE_FILE_NAME.test(fileName) || !fileName.startsWith(`${scope}-${ownerId.toLowerCase()}-`)) return null;
  try {
    const buffer = await readFile(path.join(profileFilesDir(scope), fileName));
    const ext = path.extname(fileName) as ProfileFileExt;
    return { buffer, contentType: PROFILE_FILE_TYPES[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export function profileFileResponse(file: { buffer: Buffer; contentType: string }) {
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "content-type": file.contentType,
      "cache-control": "private, max-age=3600",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    },
  });
}
