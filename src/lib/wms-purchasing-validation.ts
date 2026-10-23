import { z } from "zod";
const key=z.string().min(8).max(120),quantity=z.number().positive().max(100000000).refine(v=>Math.round(v*10000)/10000===v,"Maksimal 4 desimal.");
export const createPurchaseSchema=z.object({idempotencyKey:key,supplierId:z.string().uuid(),note:z.string().trim().max(1000).optional(),items:z.array(z.object({shortageId:z.string().uuid(),unitPrice:quantity}).strict()).min(1).max(100)}).strict();
export const approvePurchaseSchema=z.object({idempotencyKey:key}).strict();
export const createPurchaseReceiptSchema=z.object({idempotencyKey:key,warehouseId:z.string().uuid(),receivedDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),paymentMethod:z.enum(["Cash","Transfer","QRIS"]),additionalCost:z.number().nonnegative().max(1000000000).optional(),items:z.array(z.object({orderItemId:z.string().uuid(),qty:quantity,batchNo:z.string().trim().max(60).optional(),expiredAt:z.string().datetime({offset:true}).nullable().optional()}).strict()).min(1).max(100)}).strict();
export const discardPurchaseReceiptSchema=z.object({idempotencyKey:key,reason:z.string().trim().min(3).max(1000)}).strict();
