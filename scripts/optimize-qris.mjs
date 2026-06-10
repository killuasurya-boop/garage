import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";

const SRC = "D:/GARAGEFIX/G A R A G E/public/payments/qris-garage.png";
const DST = "D:/GARAGEFIX/G A R A G E/public/payments/qris-garage.png";

const img = sharp(SRC);
const { width, height } = await img.metadata();
console.log(`source ${width}x${height}`);

// Crop to the merchant card (left half of the spread). Tighten the vertical
// extent so the QR module dominates the 180x180 POS preview — drop the
// upper/lower marketing whitespace and the small print footer.
const cropW = Math.round(width * 0.50);
const cropH = Math.round(height * 0.78);
const cropX = 0;
const cropY = Math.round(height * 0.04);

await mkdir(dirname(DST), { recursive: true });

await sharp(SRC)
  .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
  .resize({ width: 900, withoutEnlargement: true })
  .png({ compressionLevel: 9, palette: false })
  .toFile(DST + ".tmp");

await sharp(DST + ".tmp").toFile(DST);
const { size } = await stat(DST);
console.log(`saved ${DST} (${size} bytes)`);
