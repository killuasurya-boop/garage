import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { fail } from "@/lib/api-response";
import { updatePartnerProductSettings } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

// Foto produk mitra: dikompres ke WebP ≤ 200 KB (lebar 800) lalu disimpan di folder foto menu
// (disajikan /garage-uploads/menu/<file>, sama seperti foto menu Garage).
const MAX_INPUT = 8 * 1024 * 1024;
const MAX_OUTPUT = 200 * 1024;
const ACCEPTED = /\.(jpe?g|png|webp)$/i;

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
  throw new Error("Foto masih terlalu berat. Pilih foto yang lebih kecil.");
}

export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { linkId } = await context.params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART_FORM", "Kirim foto sebagai multipart/form-data (field image).");
  }
  const image = form.get("image");
  if (!(image instanceof File) || image.size <= 0) return fail(400, "IMAGE_MISSING", "File foto wajib diunggah.");
  if (image.size > MAX_INPUT) return fail(413, "IMAGE_TOO_LARGE", "Ukuran foto maksimal 8 MB.");
  if (!/^image\/(jpeg|png|webp)$/i.test(image.type) && !ACCEPTED.test(image.name)) return fail(400, "IMAGE_UNSUPPORTED", "Gunakan foto JPG, PNG, atau WebP.");
  let data: Buffer;
  try {
    data = await toWebp(Buffer.from(await image.arrayBuffer()));
  } catch (error) {
    return fail(400, "IMAGE_INVALID", error instanceof Error ? error.message : "Foto tidak bisa diproses.");
  }
  return partnerRoute(async () => {
    const dir = path.join(projectRoot(), "public", "garage-uploads", "menu");
    await mkdir(dir, { recursive: true });
    const fileName = `mitra-${linkId.replace(/[^a-z0-9]/gi, "").slice(0, 12)}-${Date.now()}.webp`;
    const imageUrl = `/garage-uploads/menu/${fileName}`;
    // File dulu, baru data produk: bila simpan gagal (mis. bukan outlet ini), hanya tersisa file yatim, bukan foto rusak.
    await writeFile(path.join(dir, fileName), data);
    await updatePartnerProductSettings(linkId, { imageUrl }, session.data);
    return { imageUrl };
  }, 201);
}
