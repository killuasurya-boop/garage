import { z } from "zod";

export const closingDivisionSchema = z.enum(["bar", "dapur"]);
export const closingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Tanggal kalender tidak valid.");
export const closingQuantitySchema = z.number().finite().min(0).max(100_000_000)
  .refine((v) => Math.abs(v * 10_000 - Math.round(v * 10_000)) < 0.0001, "Jumlah maksimal empat angka desimal.");
const text = z.string().trim().max(500);
const key = z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9:_-]+$/, "Kunci permintaan tidak valid.");
const version = z.number().int().positive();

const closingItemSchema = z.object({
  productId: z.string().uuid(),
  physicalQty: closingQuantitySchema.nullable(),
  targetQty: closingQuantitySchema,
  requestedQty: closingQuantitySchema,
  overrideReason: text.optional(),
  note: text.optional(),
}).strict();

export const saveClosingSchema = z.object({
  id: z.string().uuid().optional(),
  version: version.optional(),
  idempotencyKey: key,
  division: closingDivisionSchema,
  businessDate: closingDateSchema,
  neededDate: closingDateSchema,
  warehouseId: z.string().uuid(),
  priority: z.enum(["normal", "urgent"]).default("normal"),
  note: text.optional(),
  submit: z.boolean().default(false),
  noRequest: z.boolean().default(false),
  items: z.array(closingItemSchema).max(300),
}).strict().superRefine((v, ctx) => {
  if (v.id && !v.version) ctx.addIssue({ code: "custom", path: ["version"], message: "Versi draft wajib untuk menghindari perubahan tertimpa." });
  if (v.neededDate < v.businessDate) ctx.addIssue({ code: "custom", path: ["neededDate"], message: "Tanggal kebutuhan tidak boleh sebelum tanggal operasional." });
  if (new Set(v.items.map((i) => i.productId)).size !== v.items.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Bahan yang sama tidak boleh ditambahkan dua kali." });
  if (v.noRequest && v.items.some((i) => i.requestedQty > 0)) ctx.addIssue({ code: "custom", path: ["items"], message: "Tidak Ada Permintaan harus tanpa jumlah permintaan." });
});

const actionItemSchema = z.object({
  itemId: z.string().uuid().optional(),
  allocationId: z.string().uuid().optional(),
  qty: closingQuantitySchema,
  damagedQty: closingQuantitySchema.optional(),
}).strict().superRefine((v, ctx) => {
  if (Boolean(v.itemId) === Boolean(v.allocationId)) ctx.addIssue({ code: "custom", message: "Pilih tepat satu baris permintaan atau alokasi pengiriman." });
});

export const replenishmentActionSchema = z.object({
  action: z.enum(["review", "approve", "prepare", "ready", "dispatch", "receive", "resolve_difference", "reject", "cancel"]),
  idempotencyKey: key,
  version,
  sourceWarehouseId: z.string().uuid().optional(),
  shipmentId: z.string().uuid().optional(),
  items: z.array(actionItemSchema).max(300).optional(),
  reason: text.optional(),
}).strict().superRefine((v, ctx) => {
  const lines = v.items ?? [];
  const ids = lines.map((i) => i.itemId ?? i.allocationId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Baris tindakan tidak boleh duplikat." });
  if ((v.action === "reject" || v.action === "cancel" || v.action === "resolve_difference") && (v.reason?.length ?? 0) < 3) ctx.addIssue({ code: "custom", path: ["reason"], message: "Alasan minimal tiga karakter." });
  if (v.action === "receive") {
    if (!v.shipmentId) ctx.addIssue({ code: "custom", path: ["shipmentId"], message: "Pengiriman wajib dipilih." });
    if (!lines.length || lines.some((i) => !i.allocationId)) ctx.addIssue({ code: "custom", path: ["items"], message: "Isi alokasi batch yang diterima." });
  } else if (lines.some((i) => i.allocationId)) ctx.addIssue({ code: "custom", path: ["items"], message: "Alokasi batch hanya untuk penerimaan." });
});

export const replenishmentFilterSchema = z.object({
  division: closingDivisionSchema.optional(),
  neededDate: closingDateSchema.optional(),
  businessDate: closingDateSchema.optional(),
  from: closingDateSchema.optional(),
  to: closingDateSchema.optional(),
  status: z.enum(["draft", "submitted", "under_review", "approved", "partially_available", "preparing", "ready", "dispatched", "partially_received", "completed", "rejected", "cancelled", "no_request"]).optional(),
  productId: z.string().uuid().optional(),
}).strict().superRefine((v, ctx) => {
  if (v.from && v.to) {
    const days = (new Date(`${v.to}T00:00:00Z`).getTime() - new Date(`${v.from}T00:00:00Z`).getTime()) / 86_400_000;
    if (days < 0 || days > 366) ctx.addIssue({ code: "custom", path: ["to"], message: "Rentang tanggal harus berurutan dan maksimal 366 hari." });
  }
});

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Waktu harus HH:mm WIB.");
export const closingSettingsSchema = z.object({
  idempotencyKey: key,
  openTime: time.optional(),
  closeTime: time.optional(),
  cutoffTime: time.optional(),
  locations: z.array(z.object({
    warehouseId: z.string().uuid(),
    kind: z.enum(["main", "bar", "dapur", "transit", "damaged"]),
    area: z.enum(["bar", "dapur", "umum"]),
  }).strict()).max(100).optional(),
  createLocations: z.array(z.object({
    code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().trim().min(2).max(120),
    kind: z.enum(["transit", "damaged"]),
    area: z.enum(["bar", "dapur", "umum"]),
  }).strict()).max(20).optional(),
  access: z.array(z.object({
    userId: z.string().min(1).max(128),
    warehouseId: z.string().uuid(),
    capability: z.enum(["bar", "dapur", "warehouse"]),
  }).strict()).max(300).optional(),
}).strict().superRefine((v, ctx) => {
  if (Object.keys(v).length <= 1) ctx.addIssue({ code: "custom", message: "Pilih pengaturan yang diubah." });
  const locations = v.locations ?? [];
  if (new Set(locations.map((l) => l.warehouseId)).size !== locations.length) ctx.addIssue({ code: "custom", path: ["locations"], message: "Lokasi tidak boleh duplikat." });
  const assignments = v.access ?? [];
  if (new Set(assignments.map((a) => `${a.userId}:${a.warehouseId}:${a.capability}`)).size !== assignments.length) ctx.addIssue({ code: "custom", path: ["access"], message: "Penugasan staf tidak boleh duplikat." });
});

export const shortageActionSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  idempotencyKey: key,
  supplierId: z.string().uuid().optional(),
  note: text.optional(),
}).strict().refine((v) => !["reject", "cancel"].includes(v.action) || (v.note?.length ?? 0) >= 3, { path: ["note"], message: "Alasan minimal tiga karakter." });

export function parseReplenishmentFilters(url: URL) {
  const allowed = new Set(["division", "neededDate", "businessDate", "from", "to", "status", "productId"]);
  return replenishmentFilterSchema.safeParse(Object.fromEntries([...url.searchParams].filter(([k, v]) => allowed.has(k) && v !== "" && v !== "all")));
}
