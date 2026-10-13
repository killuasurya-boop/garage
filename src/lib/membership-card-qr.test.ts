import jsQR from "jsqr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { generateMembershipCardImage } from "@/lib/membership-card-image";

// QR di kartu member harus benar-benar terbaca scanner kasir untuk SEMUA tier
// (sebelumnya ULTRA memakai modul QR hampir putih di atas latar putih).
describe("QR kartu member terbaca", () => {
  for (const tier of ["Silver", "Gold", "Platinum", "Ultra"]) {
    it(`tier ${tier}`, async () => {
      const png = await generateMembershipCardImage(
        { name: "Budi Garage", phone: "081234567890", tier, memberCode: "GRG-0001" },
        { format: "png", side: "front", width: 1010 },
      );
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height);
      expect(result, `QR ${tier} tidak terbaca`).toBeTruthy();
      const payload = JSON.parse(result!.data);
      expect(payload).toMatchObject({ v: 1, tier, n: "Budi Garage" });
    }, 30_000);
  }
});
