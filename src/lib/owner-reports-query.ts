import { z } from "zod";

// Query GET /api/reports/owner-official (B7b/B7c). Dipisah dari route supaya bisa dites.
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD.");
const monthKey = z.string().regex(/^\d{4}-\d{2}$/, "Format bulan YYYY-MM.");
export const ownerOfficialQuery = z.discriminatedUnion("type", [
  z.object({ type: z.literal("closing"), date: dateKey.optional(), format: z.enum(["json", "pdf"]).optional() }),
  z.object({
    type: z.literal("monthly"),
    month: monthKey.optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
    format: z.enum(["json", "pdf"]).optional(),
  }),
  z.object({
    type: z.literal("ledger"),
    month: monthKey.optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
    format: z.enum(["json", "pdf", "xlsx"]).optional(),
  }),
  z.object({ type: z.literal("case"), caseId: z.string().uuid("ID kasus tidak valid."), format: z.enum(["json", "pdf"]).optional() }),
]);
