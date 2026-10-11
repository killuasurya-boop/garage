import path from "node:path";

// Foto bukti terkirim kurir disimpan di storage/delivery-proof (di luar public/,
// hanya bisa dibuka lewat API staf). Volume Docker: garage-delivery-proofs.

export const DELIVERY_PROOF_FILE = /^proof-[0-9a-f-]{36}-\d{13}-[a-f0-9]{8}\.(jpg|png|webp)$/;

export function deliveryProofDir() {
  const cwd = process.cwd();
  const root =
    path.basename(cwd).toLowerCase() === "standalone" && path.basename(path.dirname(cwd)).toLowerCase() === ".next"
      ? path.resolve(cwd, "..", "..")
      : process.env.GARAGE_PROJECT_ROOT
        ? path.resolve(process.env.GARAGE_PROJECT_ROOT)
        : cwd;
  return path.join(root, "storage", "delivery-proof");
}

function startsWith(buffer: Buffer, bytes: number[], offset = 0) {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/** Jenis gambar dari isi file (magic bytes), bukan dari tipe kiriman browser. */
export function detectProofImage(buffer: Buffer): ".jpg" | ".png" | ".webp" | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return ".jpg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return ".png";
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return ".webp";
  return null;
}
