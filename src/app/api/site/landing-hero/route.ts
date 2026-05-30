import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { fail, ok } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { getLandingHeroAsset, landingHeroSlot, saveSiteAsset } from "@/lib/site-assets";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const maxInputBytes = 8 * 1024 * 1024;
const maxOutputBytes = 240 * 1024;
const maxHeroWidth = 1400;
const outputMimeType = "image/webp";
const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const acceptedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const qualitySteps = [68, 62, 56, 50, 44, 38, 32];

function fileExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return extension;
}

function isAcceptedImage(file: File) {
  const mimeType = file.type.toLowerCase();
  const extension = fileExtension(file.name);
  return acceptedMimeTypes.has(mimeType) || acceptedExtensions.has(extension);
}

function normalizeAlt(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "Hero Garage Coffee & Motor";
  }

  const clean = value.replace(/\s+/g, " ").trim();
  return clean.slice(0, 140) || "Hero Garage Coffee & Motor";
}

function timestampVersion(date = new Date()) {
  const parts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];

  return `${parts[0]}${String(parts[1]).padStart(2, "0")}${String(parts[2]).padStart(
    2,
    "0",
  )}${String(parts[3]).padStart(2, "0")}${String(parts[4]).padStart(
    2,
    "0",
  )}${String(parts[5]).padStart(2, "0")}`;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function nextOutputTarget(uploadDir: string) {
  const baseVersion = timestampVersion();
  let version = baseVersion;
  let fileName = `hero-${version}.webp`;
  let target = path.join(uploadDir, fileName);
  let suffix = 1;

  while (await fileExists(target)) {
    suffix += 1;
    version = `${baseVersion}-${suffix}`;
    fileName = `hero-${version}.webp`;
    target = path.join(uploadDir, fileName);
  }

  return { version, fileName, target };
}

async function convertHeroImage(input: Buffer) {
  let best:
    | {
        data: Buffer;
        width: number;
        height: number;
        quality: number;
      }
    | null = null;

  for (const quality of qualitySteps) {
    const result = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: maxHeroWidth, withoutEnlargement: true })
      .webp({ quality, effort: 5 })
      .toBuffer({ resolveWithObject: true });

    if (!result.info.width || !result.info.height) {
      throw new Error("Dimensi gambar tidak bisa dibaca.");
    }

    best = {
      data: result.data,
      width: result.info.width,
      height: result.info.height,
      quality,
    };

    if (result.data.length <= maxOutputBytes) {
      break;
    }
  }

  if (!best || best.data.length > maxOutputBytes) {
    throw new Error(
      "Gambar masih terlalu berat setelah dikompres. Pilih gambar yang lebih kecil atau lebih sederhana.",
    );
  }

  return best;
}

export async function GET() {
  return ok(await getLandingHeroAsset());
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    return session.response;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(
      400,
      "INVALID_MULTIPART_FORM",
      "Request harus multipart/form-data dengan field image.",
    );
  }

  const image = formData.get("image");
  if (!(image instanceof File)) {
    return fail(400, "LANDING_HERO_IMAGE_MISSING", "File gambar wajib diupload.");
  }

  if (image.size <= 0) {
    return fail(400, "LANDING_HERO_IMAGE_EMPTY", "File gambar kosong.");
  }

  if (image.size > maxInputBytes) {
    return fail(413, "LANDING_HERO_IMAGE_TOO_LARGE", "Ukuran gambar maksimal 8 MB.");
  }

  if (!isAcceptedImage(image)) {
    return fail(
      400,
      "LANDING_HERO_IMAGE_UNSUPPORTED",
      "Format belum didukung. Gunakan JPG, PNG, atau WebP.",
    );
  }

  const input = Buffer.from(await image.arrayBuffer());
  let output: Awaited<ReturnType<typeof convertHeroImage>>;
  try {
    output = await convertHeroImage(input);
  } catch (error) {
    return fail(
      400,
      "LANDING_HERO_IMAGE_INVALID",
      error instanceof Error ? error.message : "Gambar tidak bisa diproses.",
    );
  }

  const uploadDir = path.join(process.cwd(), "public", "garage-uploads", "landing");
  await mkdir(uploadDir, { recursive: true });
  const target = await nextOutputTarget(uploadDir);
  await writeFile(target.target, output.data);

  const publicUrl = `/garage-uploads/landing/${target.fileName}`;
  const asset = await saveSiteAsset({
    slot: landingHeroSlot,
    publicUrl,
    width: output.width,
    height: output.height,
    alt: normalizeAlt(formData.get("alt")),
    sizeBytes: output.data.length,
    mimeType: outputMimeType,
    version: target.version,
    updatedBy: session.data.user.id,
  });

  await createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "Website hero updated",
    object: `${target.fileName} (${Math.round(output.data.length / 1024)} KB)`,
    device: session.data.profile.deviceLabel,
    status: "uploaded",
    metadata: {
      slot: landingHeroSlot,
      publicUrl,
      width: output.width,
      height: output.height,
      sizeBytes: output.data.length,
      quality: output.quality,
      sourceName: image.name,
      sourceSizeBytes: image.size,
    },
  }).catch(() => undefined);

  return ok(asset, { status: 201 });
}
