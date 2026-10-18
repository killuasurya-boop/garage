import { z } from "zod";

import { normalizeWaNumber } from "@/lib/whatsapp-link";

// Nomor member = nomor WhatsApp aktif (dipakai invoice WA, promo, WiFi member).
// Format wajib 08… / 628… / +628…; nomor rumah, kependekan, atau acak ditolak.
export const memberWhatsappSchema = z
  .string()
  .trim()
  .min(8, "Nomor WhatsApp wajib diisi.")
  .max(24)
  .refine((value) => normalizeWaNumber(value) !== "", "Nomor WhatsApp tidak valid. Gunakan nomor HP aktif, contoh 0812xxxxxxxx.");
