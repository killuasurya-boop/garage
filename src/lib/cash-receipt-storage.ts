import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

// Foto nota kas laci (owner, Okt 2026). Disimpan di volume NON-publik
// storage/cash-receipts/<YYYY-MM-DD>/ dan hanya disajikan lewat
// /api/finance/cash-movements/[id]/receipt (cek akses per transaksi).

export const CASH_RECEIPT_MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 350 * 1024;
const MAX_WIDTH = 1280;
const QUALITY_STEPS = [78, 70, 62, 54, 46, 38];
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const RELATIVE_PATH = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}-[0-9a-f]{16}\.webp$/;

export function cashReceiptRoot() {
  return path.join(process.cwd(), "storage", "cash-receipts");
}

export function isAcceptedReceiptImage(file: File) {
  return ACCEPTED_TYPES.has(file.type.toLowerCase()) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

/** Kompres ke WebP ≤ 350 KB (foto nota tetap terbaca), simpan, kembalikan path relatif. */
export async function storeCashReceipt(movementId: string, input: Buffer, now = new Date()) {
  let output: Buffer | null = null;
  for (const quality of QUALITY_STEPS) {
    output = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();
    if (output.length <= MAX_OUTPUT_BYTES) break;
  }
  if (!output || output.length > MAX_OUTPUT_BYTES) {
    throw new Error("Foto masih terlalu berat. Ambil ulang foto nota dengan resolusi lebih kecil.");
  }
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const relative = `${day}/${movementId}-${randomBytes(8).toString("hex")}.webp`;
  await mkdir(path.join(cashReceiptRoot(), day), { recursive: true });
  await writeFile(path.join(cashReceiptRoot(), relative), output);
  return relative;
}

export async function readCashReceipt(relative: string) {
  if (!RELATIVE_PATH.test(relative)) return null;
  return readFile(path.join(cashReceiptRoot(), relative)).catch(() => null);
}
