import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

// Invoice & bukti bayar supplier: di luar public/ (storage/supplier-docs/<YYYY-MM-DD>/…),
// hanya disajikan lewat API Owner/Manajer. Foto dikompres ke WebP; PDF disimpan apa adanya.

export const SUPPLIER_DOC_MAX_BYTES = 8 * 1024 * 1024;
const RELATIVE = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}-[0-9a-f]{12}\.(webp|pdf)$/;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export function supplierDocRoot() {
  return path.join(process.cwd(), "storage", "supplier-docs");
}

export function isValidSupplierDocPath(relative: string) {
  return RELATIVE.test(relative);
}

export async function storeSupplierDoc(file: File): Promise<string> {
  if (file.size <= 0) throw new Error("File kosong.");
  if (file.size > SUPPLIER_DOC_MAX_BYTES) throw new Error("Ukuran file maksimal 8 MB.");
  const input = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  let output: Buffer;
  let ext: "webp" | "pdf";
  if (isPdf) {
    if (input.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("File PDF tidak valid.");
    output = input;
    ext = "pdf";
  } else if (IMAGE_TYPES.has(file.type.toLowerCase()) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    output = await sharp(input, { failOn: "error" }).rotate().resize({ width: 1800, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    ext = "webp";
  } else {
    throw new Error("Format harus foto (JPG/PNG/WebP) atau PDF.");
  }
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const relative = `${day}/${crypto.randomUUID()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const full = path.join(supplierDocRoot(), relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, output);
  return relative;
}

export async function readSupplierDoc(relative: string) {
  if (!isValidSupplierDocPath(relative)) return null;
  try {
    const data = await readFile(path.join(supplierDocRoot(), relative));
    return { data, contentType: relative.endsWith(".pdf") ? "application/pdf" : "image/webp" };
  } catch {
    return null;
  }
}
