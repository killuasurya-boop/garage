import { readJson } from "@/lib/api-response";
import { createPurchaseOrder, listPurchaseOrders } from "@/lib/wms-purchasing";
import { createPurchaseSchema } from "@/lib/wms-purchasing-validation";
import { replenishmentSession,replenishmentOk,replenishmentFailure } from "@/lib/wms-replenishment-api";
export const runtime="nodejs";
export async function GET(){const s=await replenishmentSession(true);if(s.response)return s.response;try{return replenishmentOk(await listPurchaseOrders(s.actor));}catch(e){return replenishmentFailure(e);}}
export async function POST(request:Request){const s=await replenishmentSession(true);if(s.response)return s.response;const body=await readJson(request,createPurchaseSchema);if(body.error)return body.error;try{return replenishmentOk(await createPurchaseOrder(s.actor,body.data),201);}catch(e){return replenishmentFailure(e);}}
