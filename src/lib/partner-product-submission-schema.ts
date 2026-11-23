import { z } from "zod";

import { MAX_PARTNER_PRICE, MAX_SUBMISSION_VARIANTS } from "@/lib/partner-product-submission";

/** Body pengajuan produk mandiri mitra (buat & perbaiki). Aturan bisnis lengkap di partnerSubmissionProblems. */
export const partnerSubmissionSchema = z.object({
  name: z.string().trim().min(2, "Nama produk minimal 2 huruf.").max(120),
  category: z.string().trim().min(2, "Pilih atau ketik kategori produk.").max(60),
  description: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  variants: z
    .array(
      z.object({
        label: z.string().trim().max(60),
        unitCost: z.number().int().positive().max(MAX_PARTNER_PRICE),
        sellPrice: z.number().int().positive().max(MAX_PARTNER_PRICE),
      }),
    )
    .min(1, "Isi minimal satu harga.")
    .max(MAX_SUBMISSION_VARIANTS),
});
