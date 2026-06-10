import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { fail, ok } from "@/lib/api-response";
import { updateMenuProduct } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const maxInputBytes = 8 * 1024 * 1024;
const maxOutputBytes = 200 * 1024;
const maxWidth = 800;
const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const acceptedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const qualitySteps = [72, 64, 56, 48, 40, 34];

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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const safeId = id.trim();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART_FORM", "Request harus multipart/form-data dengan field image.");
  }

  const image = formData.get("image");
  if (!(image instanceof File)) {
    return fail(400, "MENU_IMAGE_MISSING", "File foto wajib diupload.");
  }
  if (image.size <= 0) {
    return fail(400, "MENU_IMAGE_EMPTY", "File foto kosong.");
  }
  if (image.size > maxInputBytes) {
    return fail(413, "MENU_IMAGE_TOO_LARGE", "Ukuran foto maksimal 8 MB.");
  }
  if (!isAcceptedImage(image)) {
    return fail(400, "MENU_IMAGE_UNSUPPORTED", "Format belum didukung. Gunakan JPG, PNG, atau WebP.");
  }

  let output: Awaited<ReturnType<typeof convertMenuImage>>;
  try {
    output = await convertMenuImage(Buffer.from(await image.arrayBuffer()));
  } catch (error) {
    return fail(400, "MENU_IMAGE_INVALID", error instanceof Error ? error.message : "Foto tidak bisa diproses.");
  }

  const uploadDir = path.join(process.cwd(), "public", "garage-uploads", "menu");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${safeId.replace(/[^a-z0-9_-]/gi, "_")}-${Date.now()}.webp`;
  await writeFile(path.join(uploadDir, fileName), output.data);
  const publicUrl = `/garage-uploads/menu/${fileName}`;

  try {
    const product = await updateMenuProduct(safeId, { imageUrl: publicUrl }, session.data);
    return ok({ imageUrl: publicUrl, product }, { status: 201 });
  } catch (error) {
    return fail(400, "MENU_IMAGE_SAVE_FAILED", error instanceof Error ? error.message : "Gagal menyimpan foto menu.");
  }
}
