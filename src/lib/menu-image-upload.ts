import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const maxInputBytes = 8 * 1024 * 1024;
const maxOutputBytes = 200 * 1024;
const maxWidth = 800;
const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const acceptedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const qualitySteps = [72, 64, 56, 48, 40, 34];

export class MenuImageUploadError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

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

function isAcceptedImage(file: File) {
  const ext = path.extname(file.name).toLowerCase();
  return acceptedMimeTypes.has(file.type.toLowerCase()) || acceptedExtensions.has(ext);
}

async function convertMenuImage(input: Buffer) {
  let best: { data: Buffer; width: number; height: number } | null = null;
  for (const quality of qualitySteps) {
    const result = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    best = { data: result.data, width: result.info.width ?? 0, height: result.info.height ?? 0 };
    if (result.data.length <= maxOutputBytes) break;
  }
  if (!best || best.data.length > maxOutputBytes) {
    throw new Error("Gambar masih terlalu berat. Pilih foto yang lebih kecil.");
  }
  return best;
}

/** Baca field `image` (multipart), kompres ke webp ≤200 KB, simpan di public/garage-uploads/<folder>. */
export async function storeMenuImage(request: Request, folder: "menu" | "event-menu" | "event-lineup" | "event-sponsor", fileId: string) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new MenuImageUploadError(400, "INVALID_MULTIPART_FORM", "Request harus multipart/form-data dengan field image.");
  }
  const image = formData.get("image");
  if (!(image instanceof File)) throw new MenuImageUploadError(400, "MENU_IMAGE_MISSING", "File foto wajib diupload.");
  if (image.size <= 0) throw new MenuImageUploadError(400, "MENU_IMAGE_EMPTY", "File foto kosong.");
  if (image.size > maxInputBytes) throw new MenuImageUploadError(413, "MENU_IMAGE_TOO_LARGE", "Ukuran foto maksimal 8 MB.");
  if (!isAcceptedImage(image)) {
    throw new MenuImageUploadError(400, "MENU_IMAGE_UNSUPPORTED", "Format belum didukung. Gunakan JPG, PNG, atau WebP.");
  }

  return storeMenuImageBuffer(Buffer.from(await image.arrayBuffer()), folder, fileId);
}

/**
 * Simpan gambar yang sudah ada di memori (mis. foto dari ChatGPT yang sudah divalidasi `mcp-photo-staging`):
 * kompres ke webp ≤200 KB lalu tulis ke `/garage-uploads/<folder>` — sama persis dengan unggah form.
 */
export async function storeMenuImageBuffer(input: Buffer, folder: "menu" | "event-menu" | "event-lineup" | "event-sponsor", fileId: string) {
  let output: Awaited<ReturnType<typeof convertMenuImage>>;
  try {
    output = await convertMenuImage(input);
  } catch (error) {
    throw new MenuImageUploadError(400, "MENU_IMAGE_INVALID", error instanceof Error ? error.message : "Foto tidak bisa diproses.");
  }

  const uploadDir = path.join(projectRoot(), "public", "garage-uploads", folder);
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${fileId.replace(/[^a-z0-9_-]/gi, "_")}-${Date.now()}.webp`;
  await writeFile(path.join(uploadDir, fileName), output.data);
  return `/garage-uploads/${folder}/${fileName}`;
}
