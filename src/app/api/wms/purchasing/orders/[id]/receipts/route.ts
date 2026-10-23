import { readJson } from "@/lib/api-response";
import { createPurchaseReceipt } from "@/lib/wms-purchasing";
import { createPurchaseReceiptSchema } from "@/lib/wms-purchasing-validation";
import { replenishmentSession,replenishmentOk,replenishmentFailure } from "@/lib/wms-replenishment-api";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const s=await replenishmentSession(true);if(s.response)return s.response;const body=await readJson(request,createPurchaseReceiptSchema);if(body.error)return body.error;const {id}=await context.params;try{return replenishmentOk(await createPurchaseReceipt(s.actor,id,body.data));}catch(e){return replenishmentFailure(e);}}
