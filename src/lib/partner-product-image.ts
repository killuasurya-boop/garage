import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

// Foto produk mitra (dipakai Garage OS /api/partners/... dan Portal Mitra /api/partner/...):
// dikompres ke WebP ≤ 200 KB (lebar 800) lalu disimpan di folder foto menu
// (disajikan /garage-uploads/menu/<file>, sama seperti foto menu Garage).
const MAX_INPUT = 8 * 1024 * 1024;
const MAX_OUTPUT = 200 * 1024;
const ACCEPTED = /\.(jpe?g|png|webp)$/i;

export class PartnerImageError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function projectRoot() {
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === "standalone" && path.basename(path.dirname(cwd)).toLowerCase() === ".next") {
    return path.resolve(cwd, "..", "..");
  }
  return process.env.GARAGE_PROJECT_ROOT ? path.resolve(process.env.GARAGE_PROJECT_ROOT) : cwd;
}

async function toWebp(input: Buffer) {
  for (const quality of [72, 64, 56, 48, 40]) {
    const data = await sharp(input, { failOn: "error" }).rotate().resize({ width: 800, withoutEnlargement: true }).webp({ quality, effort: 5 }).toBuffer();
    if (data.length <= MAX_OUTPUT) return data;
  }
  throw new PartnerImageError("IMAGE_INVALID", "Foto masih terlalu berat. Pilih foto yang lebih kecil.");
}

/** Baca field `image` dari multipart, validasi, lalu kompres. Belum menulis apa pun ke disk. */
export async function readPartnerProductImage(request: Request): Promise<Buffer> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new PartnerImageError("INVALID_MULTIPART_FORM", "Kirim foto sebagai multipart/form-data (field image).");
  }
  const image = form.get("image");
  if (!(image instanceof File) || image.size <= 0) throw new PartnerImageError("IMAGE_MISSING", "File foto wajib diunggah.");
  if (image.size > MAX_INPUT) throw new PartnerImageError("IMAGE_TOO_LARGE", "Ukuran foto maksimal 8 MB.", 413);
  if (!/^image\/(jpeg|png|webp)$/i.test(image.type) && !ACCEPTED.test(image.name)) throw new PartnerImageError("IMAGE_UNSUPPORTED", "Gunakan foto JPG, PNG, atau WebP.");
  try {
    return await toWebp(Buffer.from(await image.arrayBuffer()));
  } catch (error) {
    if (error instanceof PartnerImageError) throw error;
    throw new PartnerImageError("IMAGE_INVALID", "Foto tidak bisa diproses. Coba foto lain.");
  }
}

/** Simpan WebP ke /garage-uploads/menu dan kembalikan URL publiknya. */
export async function savePartnerProductImage(linkId: string, data: Buffer): Promise<string> {
  const dir = path.join(projectRoot(), "public", "garage-uploads", "menu");
  await mkdir(dir, { recursive: true });
  const fileName = `mitra-${linkId.replace(/[^a-z0-9]/gi, "").slice(0, 12)}-${Date.now()}.webp`;
  await writeFile(path.join(dir, fileName), data);
  return `/garage-uploads/menu/${fileName}`;
}
