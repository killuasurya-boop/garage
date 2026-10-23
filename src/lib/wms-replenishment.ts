import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs, staffProfiles, user, inventoryItems, wmsBatch, wmsCategory, wmsProduct, wmsSupplier, wmsWarehouse, wmsWarehouseStock, wmsReceiving, wmsReceivingItem,
  wmsClosingSettings as settingsTable, wmsClosingLocation as locationsTable, wmsClosingAccess as accessTable,
  wmsClosingRequest as requestsTable, wmsClosingRequestItem as itemsTable, wmsClosingReservation as reservationsTable,
  wmsClosingShipment as shipmentsTable, wmsClosingAllocation as allocationsTable, wmsClosingShortage as shortagesTable,
  wmsClosingEvent as eventsTable, wmsClosingMutation as mutationsTable,
} from "@/db/schema";
import { recordStockMovement, runInTx } from "@/lib/wms-service";
import type { ClosingActor, ClosingDivision, ClosingFilters, ClosingSettingsInput, ClosingTransitionInput, SaveClosingInput, ShortageDecisionInput } from "@/lib/wms-replenishment-types";
export type { ClosingActor, ClosingDivision, ClosingFilters, ClosingSettingsInput, ClosingTransitionInput, SaveClosingInput, ShortageDecisionInput } from "@/lib/wms-replenishment-types";

type Db = ReturnType<typeof getDb>;
type Request = typeof requestsTable.$inferSelect;
type Item = typeof itemsTable.$inferSelect;
const terminals = ["completed", "rejected", "cancelled"];
const activeStatuses = ["approved", "partially_available", "preparing", "ready", "dispatched", "partially_received"];
const n = (value: number | string | null | undefined) => Number(value ?? 0);
const round = (v: number) => Math.round((v + Number.EPSILON) * 10_000) / 10_000;
const elevated = (a: ClosingActor) => a.role === "Owner" || a.role === "Manajer";
export class ClosingError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
function error(message: string, status = 409, code = "REPLENISHMENT_CONFLICT"): never { throw new ClosingError(status, code, message); }
function assertNumber(v: number, nullable = false) { if ((!nullable || v !== null) && (!Number.isFinite(v) || v < 0 || v > 100_000_000 || round(v) !== v)) error("Jumlah wajib positif/nol, maksimal 4 desimal.", 400); }
function assertDate(v: string) { const parsed=new Date(v+"T00:00:00Z"); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== v) error("Tanggal tidak valid.",400); }
function stable(v: unknown): string { if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`; if (v && typeof v === "object") return `{${Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${stable(x)}`).join(",")}}`; return JSON.stringify(v); }
function doc(prefix: string) { return `${prefix}-${new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date()).replaceAll("-","")}-${randomUUID().slice(0,8).toUpperCase()}`; }
async function transact<T>(actor: ClosingActor, key: string, payload: unknown, fn: (tx: Db) => Promise<T>): Promise<T> {
  if (!key || key.length > 120) error("Kunci permintaan wajib diisi.",400);
  return runInTx(async tx => {
    // Module-wide advisory lock also covers absent reservation/document rows. All other physical mutations use row locks.
    await tx.execute(sql`select pg_advisory_xact_lock(73453, 1)`);
    const hash = createHash("sha256").update(stable({ actorId:actor.id, payload })).digest("hex");
    const [prior] = await tx.select().from(mutationsTable).where(and(eq(mutationsTable.outletId,actor.outletId),eq(mutationsTable.key,key)));
    if (prior) { if (prior.payloadHash !== hash) error("Kunci yang sama dipakai untuk isi permintaan berbeda."); return prior.response as T; }
    const result = await fn(tx);
    await tx.insert(mutationsTable).values({outletId:actor.outletId,key,payloadHash:hash,response:JSON.parse(JSON.stringify(result)),actorId:actor.id});
    return result;
  });
}
async function event(tx: Db, actor: ClosingActor, requestId: string | null, action: string, detail: Record<string,unknown>) {
  await tx.insert(eventsTable).values({outletId:actor.outletId,requestId,action,actorId:actor.id,actorName:actor.name,detail});
  await tx.insert(auditLogs).values({time:new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",timeStyle:"short"}).format(new Date()),actor:actor.name,action,object:requestId ?? "Closing Stock",device:"WMS",status:"recorded",metadata:{requestId,userId:actor.id,...detail}});
}
async function location(tx: Db, actor: ClosingActor, warehouseId: string) {
  const [loc] = await tx.select({scope:locationsTable,warehouse:wmsWarehouse}).from(locationsTable).innerJoin(wmsWarehouse,eq(wmsWarehouse.id,locationsTable.warehouseId)).where(and(eq(locationsTable.warehouseId,warehouseId),eq(locationsTable.outletId,actor.outletId)));
  if (!loc) error("Lokasi belum ditautkan ke outlet aktif. Minta manajemen mengatur lokasi closing.",403,"LOCATION_SCOPE_REQUIRED");
  return loc;
}
async function warehouseOperator(tx: Db, actor: ClosingActor, warehouseId?: string) {
  if (elevated(actor)) { if (warehouseId) await location(tx,actor,warehouseId); return; }
  if (actor.role !== "Kasir") error("Akses gudang ditolak.",403,"FORBIDDEN");
  const assignments = await tx.select().from(accessTable).where(and(eq(accessTable.userId,actor.id),eq(accessTable.outletId,actor.outletId),eq(accessTable.capability,"warehouse"),warehouseId?eq(accessTable.warehouseId,warehouseId):undefined));
  if (!assignments.length) error("Penugasan petugas gudang diperlukan.",403,"FORBIDDEN");
}
async function divisionOperator(tx: Db, actor: ClosingActor, division: string, warehouseId: string) {
  const loc = await location(tx,actor,warehouseId);
  if (loc.scope.kind !== division || !["bar","dapur"].includes(division)) error("Lokasi tidak sesuai divisi.",403,"FORBIDDEN");
  if (elevated(actor)) return;
  if (actor.role !== "Kasir" || ![division, "all", `helper_${division}`, "helper_all"].includes(actor.workstation ?? "")) error("Workstation tidak sesuai divisi.",403,"FORBIDDEN");
  const [assignment] = await tx.select().from(accessTable).where(and(eq(accessTable.userId,actor.id),eq(accessTable.outletId,actor.outletId),eq(accessTable.warehouseId,warehouseId),eq(accessTable.capability,division)));
  if (!assignment) error("Penugasan lokasi divisi diperlukan.",403,"FORBIDDEN");
}
async function canRead(tx: Db, actor: ClosingActor, request: Request) {
  if(request.outletId!==actor.outletId) error("Dokumen tidak ditemukan.",404,"NOT_FOUND");
  if(elevated(actor)) return;
  try { await divisionOperator(tx,actor,request.division,request.warehouseId); return; } catch(e) { if (!(e instanceof ClosingError)) throw e; }
  await warehouseOperator(tx,actor);
}
async function findRequest(tx: Db, actor: ClosingActor, id: string, lock=false) {
  const query=tx.select().from(requestsTable).where(and(eq(requestsTable.id,id),eq(requestsTable.outletId,actor.outletId)));
  const [request]=await (lock?query.for("update"):query);
  if(!request) error("Permintaan tidak ditemukan.",404,"NOT_FOUND");
  await canRead(tx,actor,request); return request;
}
async function getSettings(tx: Db, actor: ClosingActor) {
  const [stored]=await tx.select().from(settingsTable).where(eq(settingsTable.outletId,actor.outletId));
  return stored ?? {outletId:actor.outletId,openTime:"15:00",closeTime:"23:00",cutoffTime:"23:59"};
}
async function stock(tx: Db, productId: string, warehouseId: string, lock=false) {
  if(lock) await tx.insert(wmsWarehouseStock).values({productId,warehouseId,qty:0}).onConflictDoNothing();
  const query=tx.select().from(wmsWarehouseStock).where(and(eq(wmsWarehouseStock.productId,productId),eq(wmsWarehouseStock.warehouseId,warehouseId)));
  const [row]=await (lock?query.for("update"):query);return n(row?.qty);
}
async function reserved(tx: Db, productId: string, warehouseId: string) {
  const [row]=await tx.select({qty:sql<number>`coalesce(sum(${reservationsTable.qty}),0)`}).from(reservationsTable).where(and(eq(reservationsTable.productId,productId),eq(reservationsTable.warehouseId,warehouseId)));
  return n(row.qty);
}
async function incoming(tx:Db, warehouseId:string, productId:string, neededDate:string, excluding?:string) {
  const rows=await tx.select({item:itemsTable,request:requestsTable}).from(itemsTable).innerJoin(requestsTable,eq(requestsTable.id,itemsTable.requestId)).where(and(eq(requestsTable.warehouseId,warehouseId),eq(itemsTable.productId,productId),eq(requestsTable.neededDate,neededDate),inArray(requestsTable.status,activeStatuses),excluding?ne(requestsTable.id,excluding):undefined));
  return round(rows.reduce((s,r)=>s+Math.max(0,n(r.item.approvedQty)-n(r.item.receivedQty)-n(r.item.damagedQty)),0));
}
async function productsForDivision(tx:Db,division:string) {
  return tx.select({product:wmsProduct,area:wmsCategory.area}).from(wmsProduct).innerJoin(wmsCategory,eq(wmsCategory.name,wmsProduct.category)).where(and(isNull(wmsProduct.archivedAt),inArray(wmsCategory.area,[division,"umum"]))).orderBy(asc(wmsProduct.name));
}
export async function getClosingSettings(actor: ClosingActor) {
  if(!elevated(actor)) error("Pengaturan hanya untuk Owner/Manajer.",403,"FORBIDDEN");
  const db=getDb(); const [locations,access,warehouses,staff]=await Promise.all([
    db.select().from(locationsTable).where(eq(locationsTable.outletId,actor.outletId)),
    db.select().from(accessTable).where(eq(accessTable.outletId,actor.outletId)),
    db.select().from(wmsWarehouse),
    db.select({userId:staffProfiles.userId,name:user.name,role:staffProfiles.role,workstation:staffProfiles.workstation}).from(staffProfiles).innerJoin(user,eq(user.id,staffProfiles.userId)).where(eq(staffProfiles.outletId,actor.outletId)),
  ]);
  return {...await getSettings(db,actor),locations,access,warehouses,staff};
}
export async function updateClosingSettings(actor:ClosingActor,input:ClosingSettingsInput) {
  if(!elevated(actor)) error("Pengaturan hanya untuk Owner/Manajer.",403,"FORBIDDEN");
  return transact(actor,input.idempotencyKey,{action:"settings",...input},async tx=>{
    const before=await getSettings(tx,actor);const after={openTime:input.openTime??before.openTime,closeTime:input.closeTime??before.closeTime,cutoffTime:input.cutoffTime??before.cutoffTime};
    for(const value of Object.values(after)) if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) error("Jam tidak valid.",400);
    await tx.insert(settingsTable).values({outletId:actor.outletId,...after}).onConflictDoUpdate({target:settingsTable.outletId,set:{...after,updatedAt:new Date()}});
    for (const proposed of input.createLocations ?? []) {
      if (!/^[A-Za-z0-9_-]{2,40}$/.test(proposed.code) || !proposed.name.trim() || !["transit", "damaged"].includes(proposed.kind) || !["bar", "dapur", "umum"].includes(proposed.area)) error("Lokasi internal tidak valid.", 400);
      const [existing] = await tx.select({id:wmsWarehouse.id}).from(wmsWarehouse).where(eq(wmsWarehouse.code, proposed.code));
      if (existing) error("Kode lokasi sudah digunakan. Pilih kode lain.", 409);
      const [created] = await tx.insert(wmsWarehouse).values({code:proposed.code,name:proposed.name.trim(),type:proposed.kind,area:proposed.area,isPrimary:false}).returning();
      await tx.insert(locationsTable).values({warehouseId:created.id,outletId:actor.outletId,kind:proposed.kind,area:proposed.area});
    }
    if(input.locations){
      const ids=new Set<string>();
      for(const loc of input.locations){if(ids.has(loc.warehouseId)) error("Lokasi ganda.",400);ids.add(loc.warehouseId);
        const [wh]=await tx.select().from(wmsWarehouse).where(eq(wmsWarehouse.id,loc.warehouseId));if(!wh)error("Gudang tidak ditemukan.",404);
        const [used]=await tx.select().from(locationsTable).where(eq(locationsTable.warehouseId,loc.warehouseId));if(used && used.outletId!==actor.outletId)error("Gudang sudah ditautkan ke outlet lain.",403);
        if(used && (used.kind!==loc.kind || used.area!==loc.area)){const [history]=await tx.select({id:requestsTable.id}).from(requestsTable).where(eq(requestsTable.warehouseId,loc.warehouseId)).limit(1);if(history)error("Lokasi dengan histori closing tidak dapat dialihkan divisinya.");}
        await tx.insert(locationsTable).values({...loc,outletId:actor.outletId}).onConflictDoUpdate({target:locationsTable.warehouseId,set:{kind:loc.kind,area:loc.area}});
      }
      // Mapping is append/update-only: never silently remove locations with active/history documents.
    }
    if(input.access){await tx.delete(accessTable).where(eq(accessTable.outletId,actor.outletId));
      for(const assignment of input.access){const [staff]=await tx.select().from(staffProfiles).where(and(eq(staffProfiles.userId,assignment.userId),eq(staffProfiles.outletId,actor.outletId)));if(!staff)error("Staf bukan anggota outlet aktif.",403);await location(tx,actor,assignment.warehouseId);await tx.insert(accessTable).values({...assignment,outletId:actor.outletId});}
    }
    await event(tx,actor,null,"Pengaturan closing diubah",{before,after,locations:input.locations?.length,assignments:input.access?.length,createdLocations:input.createLocations});return {ok:true,...after};
  });
}
export async function getClosingCatalog(actor:ClosingActor,division:ClosingDivision,neededDate?:string) {
  const db=getDb();const locs=await db.select({scope:locationsTable,warehouse:wmsWarehouse}).from(locationsTable).innerJoin(wmsWarehouse,eq(wmsWarehouse.id,locationsTable.warehouseId)).where(and(eq(locationsTable.outletId,actor.outletId),eq(locationsTable.kind,division)));
  const allowed=[];for(const loc of locs){try{await divisionOperator(db,actor,division,loc.scope.warehouseId);allowed.push(loc);}catch(e){if(!(e instanceof ClosingError))throw e;}}
  if(!allowed.length && !elevated(actor)) error("Belum ada lokasi divisi yang ditugaskan untuk akun ini.",403,"LOCATION_SCOPE_REQUIRED");
  const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const config=await getSettings(db,actor); const clock=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date()); const businessDate=clock<config.openTime?new Date(new Date(day+"T00:00:00Z").getTime()-86400000).toISOString().slice(0,10):day; const effectiveNeededDate=neededDate??new Date(new Date(businessDate+"T00:00:00Z").getTime()+86400000).toISOString().slice(0,10); assertDate(effectiveNeededDate);
  const products=await productsForDivision(db,division);
  const rows=await Promise.all(allowed.map(async loc=>({warehouseId:loc.scope.warehouseId,name:loc.warehouse.name,products:await Promise.all(products.map(async({product:p})=>({id:p.id,productId:p.id,sku:p.sku,name:p.name,category:p.category,unit:p.unit,minStock:n(p.minStock),targetQty:n(p.minStock),systemQty:await stock(db,p.id,loc.scope.warehouseId),incomingQty:await incoming(db,loc.scope.warehouseId,p.id,effectiveNeededDate),hpp:n(p.hpp)})))})));
  return {division,locations:allowed.map(l=>({id:l.scope.warehouseId,name:l.warehouse.name})),products:rows[0]?.products??[],stocks:rows,settings:config,businessDate,neededDate:effectiveNeededDate,capabilities:{manage:elevated(actor)},configurationRequired:!allowed.length,reminder:"Periksa kebutuhan bahan baku untuk operasional besok."};
}
export async function saveClosing(actor:ClosingActor,input:SaveClosingInput) {
  assertDate(input.businessDate);assertDate(input.neededDate);if(input.neededDate<input.businessDate)error("Tanggal kebutuhan tidak boleh sebelum tanggal operasional.",400);
  return transact(actor,input.idempotencyKey,{action:"save",...input},async tx=>{
    await divisionOperator(tx,actor,input.division,input.warehouseId);
    let request:Request|undefined;
    if(input.id){request=await findRequest(tx,actor,input.id,true);if(request.status!=="draft")error("Hanya draft yang dapat diedit.");if(input.version!==request.version)error("Draft berubah di perangkat lain. Muat ulang.");if(request.warehouseId!==input.warehouseId||request.division!==input.division||request.businessDate!==input.businessDate)error("Identitas closing draft tidak dapat diubah.");}
    else {const [existing]=await tx.select().from(requestsTable).where(and(eq(requestsTable.outletId,actor.outletId),eq(requestsTable.warehouseId,input.warehouseId),eq(requestsTable.businessDate,input.businessDate)));if(existing)error("Closing tanggal ini sudah ada. Buka riwayat untuk melanjutkan.");}
    if(input.items.length>500)error("Maksimal 500 bahan.",400);
    const allowed=new Map((await productsForDivision(tx,input.division)).map(p=>[p.product.id,p.product]));const seen=new Set<string>();
    const itemValues=[];for(const it of input.items){if(seen.has(it.productId))error("Bahan ganda.",400);seen.add(it.productId);if(!allowed.has(it.productId))error("Bahan tidak aktif atau tidak sesuai divisi.",400);if(it.physicalQty!==null)assertNumber(it.physicalQty);assertNumber(it.targetQty);assertNumber(it.requestedQty);
      const systemQty=await stock(tx,it.productId,input.warehouseId);const incomingQty=await incoming(tx,input.warehouseId,it.productId,input.neededDate,request?.id);const recommendationQty=round(Math.max(0,it.targetQty-(it.physicalQty??systemQty)-incomingQty));
      if(input.submit && it.physicalQty===null)error("Isi stok aktual untuk bahan yang diajukan.",400);
      if(input.submit && it.requestedQty!==recommendationQty && !(it.overrideReason?.trim()))error("Alasan perubahan jumlah rekomendasi wajib diisi.",400);
      itemValues.push({productId:it.productId,systemQty,physicalQty:it.physicalQty,targetQty:it.targetQty,incomingQty,recommendationQty,requestedQty:it.requestedQty,overrideReason:it.overrideReason?.trim()??"",note:it.note?.trim()??""});
    }
    if(input.submit && input.noRequest && itemValues.some(it=>it.requestedQty>0))error("Tidak ada permintaan tidak boleh memiliki jumlah permintaan.",400);
    if(input.submit && !input.noRequest && !itemValues.some(it=>it.requestedQty>0))error("Pilih Tidak Ada Permintaan atau isi kebutuhan.",400);
    const settings=await getSettings(tx,actor);const cutoff=new Date(`${input.businessDate}T${settings.cutoffTime}:00+07:00`);const late=Date.now()>cutoff.getTime();
    const status=input.submit?(input.noRequest?"completed":"submitted"):"draft";
    const values={neededDate:input.neededDate,status,priority:input.priority??"normal",note:input.note?.trim()??"",noRequest:input.noRequest??false,late:input.submit?late:false,submittedAt:input.submit?new Date():null,updatedAt:new Date()};
    if(request){[request]=await tx.update(requestsTable).set({...values,version:request.version+1}).where(eq(requestsTable.id,request.id)).returning();await tx.delete(itemsTable).where(eq(itemsTable.requestId,request.id));}
    else {[request]=await tx.insert(requestsTable).values({...values,doc:doc("CSR"),outletId:actor.outletId,warehouseId:input.warehouseId,division:input.division,businessDate:input.businessDate,createdBy:actor.id}).returning();}
    if(itemValues.length)await tx.insert(itemsTable).values(itemValues.map(it=>({...it,requestId:request.id})));
    await event(tx,actor,request.id,input.submit?(input.noRequest?"Closing tanpa permintaan":"Permintaan closing dikirim"):"Draft closing disimpan",{status,version:request.version,late:request.late});
    return detail(tx,actor,request);
  });
}
async function detail(tx:Db,actor:ClosingActor,request:Request) {
  const [rows,history,shipments]=await Promise.all([
    tx.select({item:itemsTable,product:wmsProduct}).from(itemsTable).innerJoin(wmsProduct,eq(wmsProduct.id,itemsTable.productId)).where(eq(itemsTable.requestId,request.id)),
    tx.select().from(eventsTable).where(eq(eventsTable.requestId,request.id)).orderBy(asc(eventsTable.createdAt)),
    tx.select().from(shipmentsTable).where(eq(shipmentsTable.requestId,request.id)).orderBy(asc(shipmentsTable.createdAt)),
  ]);
  const items=await Promise.all(rows.map(async({item,product})=>({...item,name:product.name,sku:product.sku,category:product.category,unit:product.unit,hpp:n(product.hpp),variance:item.physicalQty===null?null:round(n(item.physicalQty)-n(item.systemQty)),reservedQty:(await tx.select().from(reservationsTable).where(eq(reservationsTable.itemId,item.id))).reduce((s,r)=>s+n(r.qty),0),shortageQty:Math.max(0,n(item.requestedQty)-n(item.approvedQty))})));
  const shipmentDetails=await Promise.all(shipments.map(async shipment=>({...shipment,allocations:await tx.select().from(allocationsTable).where(eq(allocationsTable.shipmentId,shipment.id))})));
  const wh=await location(tx,actor,request.warehouseId);
  let canWarehouse=false; let canReceive=false; try{await warehouseOperator(tx,actor);canWarehouse=true;}catch(e){if(!(e instanceof ClosingError))throw e;}try{await divisionOperator(tx,actor,request.division,request.warehouseId);canReceive=true;}catch(e){if(!(e instanceof ClosingError))throw e;}
  const reservations=items.length?await tx.select().from(reservationsTable).where(inArray(reservationsTable.itemId,items.map(i=>i.id))):[];
  return {...request,warehouseName:wh.warehouse.name,items,history,shipments:shipmentDetails,reservations,capabilities:{manage:elevated(actor),warehouse:canWarehouse,receive:canReceive}};
}
export async function getReplenishment(actor:ClosingActor,id:string){const tx=getDb();return detail(tx,actor,await findRequest(tx,actor,id));}
export async function listReplenishments(actor:ClosingActor,filters:ClosingFilters={}) {
  const db=getDb();if(filters.neededDate)assertDate(filters.neededDate);if(filters.businessDate)assertDate(filters.businessDate);
  const rows=await db.select().from(requestsTable).where(and(eq(requestsTable.outletId,actor.outletId),filters.division?eq(requestsTable.division,filters.division):undefined,filters.neededDate?eq(requestsTable.neededDate,filters.neededDate):undefined,filters.businessDate?eq(requestsTable.businessDate,filters.businessDate):undefined,filters.status?eq(requestsTable.status,filters.status):undefined,filters.from?sql`${requestsTable.neededDate} >= ${filters.from}`:undefined,filters.to?sql`${requestsTable.neededDate} <= ${filters.to}`:undefined)).orderBy(desc(requestsTable.createdAt));
  const result=[];for(const row of rows){try{await canRead(db,actor,row);result.push(await detail(db,actor,row));}catch(e){if(!(e instanceof ClosingError))throw e;}}
  return result;
}
async function updateShortage(tx:Db,item:Item) {
  const qty=round(Math.max(0,n(item.requestedQty)-n(item.approvedQty)));
  const [product]=await tx.select().from(wmsProduct).where(eq(wmsProduct.id,item.productId));
  const [lastReceipt] = await tx.select({price:wmsReceivingItem.hpp}).from(wmsReceivingItem).innerJoin(wmsReceiving,eq(wmsReceiving.id,wmsReceivingItem.receivingId)).where(and(eq(wmsReceivingItem.productId,item.productId),eq(wmsReceiving.status,"completed"))).orderBy(desc(wmsReceiving.completedAt),desc(wmsReceiving.createdAt)).limit(1);
  const lastUnitPrice=n(lastReceipt?.price ?? product?.hpp);
  await tx.insert(shortagesTable).values({itemId:item.id,qty,lastUnitPrice,status:qty>0?"draft":"resolved"}).onConflictDoUpdate({target:shortagesTable.itemId,set:{qty,updatedAt:new Date(),...(qty===0?{status:"resolved"}:{})}});
}
async function requestItems(tx:Db,requestId:string){return tx.select().from(itemsTable).where(eq(itemsTable.requestId,requestId)).orderBy(asc(itemsTable.productId));}
function assertVersion(request:Request,version?:number){if(version!==request.version)error("Dokumen telah berubah. Muat ulang sebelum melanjutkan.");}
async function reservationForSource(tx:Db,item:Item,source:string){const [row]=await tx.select().from(reservationsTable).where(and(eq(reservationsTable.itemId,item.id),eq(reservationsTable.warehouseId,source)));return row;}
async function specialLocation(tx:Db,actor:ClosingActor,kind:"transit"|"damaged",division:string){
  const rows=await tx.select().from(locationsTable).where(and(eq(locationsTable.outletId,actor.outletId),eq(locationsTable.kind,kind),inArray(locationsTable.area,[division,"umum"])));
  const loc=rows.find(l=>l.area===division)??rows[0];if(!loc)error(`Lokasi ${kind==="transit"?"barang dalam perjalanan":"barang rusak"} belum dikonfigurasi.`,409,"LOCATION_SCOPE_REQUIRED");return loc.warehouseId;
}
async function reserveItems(tx:Db,actor:ClosingActor,request:Request,input:ClosingTransitionInput){
  if(!elevated(actor))error("Persetujuan jumlah hanya untuk Owner/Manajer.",403,"FORBIDDEN");
  if(!["submitted","under_review","partially_available","approved","preparing","ready","partially_received"].includes(request.status))error("Status tidak dapat disetujui.");
  const source=input.sourceWarehouseId;if(!source)error("Pilih gudang sumber.",400);const loc=await location(tx,actor,source);if(loc.scope.kind!=="main"||![request.division,"umum"].includes(loc.scope.area))error("Gudang sumber tidak sesuai area.",403);
  const items=await requestItems(tx,request.id);const selections=input.items??items.map(it=>({itemId:it.id,qty:round(n(it.requestedQty)-n(it.approvedQty))}));const seen=new Set<string>();
  for(const selection of selections){if(!selection.itemId||seen.has(selection.itemId))error("Baris persetujuan tidak valid/ganda.",400);seen.add(selection.itemId);const item=items.find(i=>i.id===selection.itemId);if(!item)error("Baris tidak ditemukan.",404);assertNumber(selection.qty);if(selection.qty===0)continue;
    if(n(item.approvedQty)+selection.qty>n(item.requestedQty))error("Jumlah persetujuan melebihi permintaan.");
    const onHand=await stock(tx,item.productId,source,true);const available=round(Math.max(0,onHand-await reserved(tx,item.productId,source)));const qty=round(Math.min(selection.qty,available));
    if(qty>0){const prior=await reservationForSource(tx,item,source);await tx.insert(reservationsTable).values({itemId:item.id,productId:item.productId,warehouseId:source,qty}).onConflictDoUpdate({target:[reservationsTable.itemId,reservationsTable.warehouseId],set:{qty:round(n(prior?.qty)+qty)}});await tx.update(itemsTable).set({approvedQty:round(n(item.approvedQty)+qty)}).where(eq(itemsTable.id,item.id));}
  }
  const after=await requestItems(tx,request.id);for(const item of after)await updateShortage(tx,item);
  return after.some(i=>n(i.approvedQty)<n(i.requestedQty))?"partially_available":"approved";
}
async function dispatch(tx:Db,actor:ClosingActor,request:Request,input:ClosingTransitionInput){
  if(!["ready","partially_received","dispatched"].includes(request.status))error("Siapkan dan tandai siap sebelum pengiriman.");
  if(!input.sourceWarehouseId)error("Pilih lokasi sumber pengiriman.",400);const source=input.sourceWarehouseId;await warehouseOperator(tx,actor,source);const loc=await location(tx,actor,source);if(loc.scope.kind!=="main"||![request.division,"umum"].includes(loc.scope.area))error("Sumber tidak sesuai divisi.",403);
  const transit=await specialLocation(tx,actor,"transit",request.division);if(transit===source||transit===request.warehouseId)error("Lokasi transit harus terpisah.");
  const items=await requestItems(tx,request.id);const selections=input.items??items.filter(i=>n(i.preparedQty)>n(i.dispatchedQty)).map(i=>({itemId:i.id,qty:round(n(i.preparedQty)-n(i.dispatchedQty))}));
  if(!selections.some(i=>i.qty>0))error("Tidak ada jumlah pengiriman.",400);
  const [shipment]=await tx.insert(shipmentsTable).values({doc:doc("DSP"),requestId:request.id,sourceWarehouseId:source,transitWarehouseId:transit,destinationWarehouseId:request.warehouseId,createdBy:actor.id}).returning();
  const seen=new Set<string>();for(const selection of [...selections].sort((a,b)=>(a.itemId??"").localeCompare(b.itemId??""))){if(!selection.itemId||seen.has(selection.itemId))error("Baris pengiriman ganda/tidak valid.",400);seen.add(selection.itemId);const item=items.find(i=>i.id===selection.itemId);if(!item)error("Baris pengiriman tidak ditemukan.",404);assertNumber(selection.qty);if(selection.qty===0)continue;
    if(selection.qty>round(n(item.preparedQty)-n(item.dispatchedQty)))error("Pengiriman melebihi jumlah disiapkan.");
    const reservation=await reservationForSource(tx,item,source);if(!reservation||selection.qty>n(reservation.qty))error("Reservasi sumber tidak cukup.");
    const onHand=await stock(tx,item.productId,source,true);const otherReserved=round(await reserved(tx,item.productId,source)-n(reservation.qty));if(selection.qty>onHand-otherReserved)error("Stok berubah setelah reservasi. Tinjau shortage sebelum mengirim.");
    const batches=await tx.select().from(wmsBatch).where(and(eq(wmsBatch.productId,item.productId),eq(wmsBatch.warehouseId,source),sql`${wmsBatch.qty} > 0`,sql`(${wmsBatch.expiredAt} is null or ${wmsBatch.expiredAt} >= now())`)).orderBy(sql`${wmsBatch.expiredAt} asc nulls last`,asc(wmsBatch.receivedAt)).for("update");
    if(batches.reduce((sum,b)=>sum+n(b.qty),0)<selection.qty)error("Batch layak pakai tidak cukup. Periksa batch/kedaluwarsa.");
    let remaining=selection.qty;for(const batch of batches){if(remaining<=0)break;const qty=round(Math.min(remaining,n(batch.qty)));await recordStockMovement(tx,{type:"transfer",productId:item.productId,warehouseId:source,deltaQty:-qty,hpp:n(batch.hpp),refDoc:shipment.doc,userId:actor.id,batchId:batch.id,reservationId:reservation.id});const inward=await recordStockMovement(tx,{type:"in",productId:item.productId,warehouseId:transit,deltaQty:qty,hpp:n(batch.hpp),refDoc:shipment.doc,userId:actor.id,batchNo:batch.batchNo,expiredAt:batch.expiredAt});if(!inward.batchId)error("Batch transit gagal dibuat.");await tx.insert(allocationsTable).values({shipmentId:shipment.id,itemId:item.id,sourceBatchId:batch.id,transitBatchId:inward.batchId,batchNo:batch.batchNo,expiredAt:batch.expiredAt,hpp:n(batch.hpp),qty});remaining=round(remaining-qty);}
    await tx.update(reservationsTable).set({qty:round(n(reservation.qty)-selection.qty)}).where(eq(reservationsTable.id,reservation.id));await tx.update(itemsTable).set({dispatchedQty:round(n(item.dispatchedQty)+selection.qty)}).where(eq(itemsTable.id,item.id));
  }
  return "dispatched";
}
async function receive(tx:Db,actor:ClosingActor,request:Request,input:ClosingTransitionInput){
  await divisionOperator(tx,actor,request.division,request.warehouseId);if(!["dispatched","partially_received"].includes(request.status))error("Tidak ada pengiriman yang dapat diterima.");
  if(!input.shipmentId)error("Pilih dokumen pengiriman.",400);const [shipment]=await tx.select().from(shipmentsTable).where(and(eq(shipmentsTable.id,input.shipmentId),eq(shipmentsTable.requestId,request.id))).for("update");if(!shipment)error("Pengiriman tidak ditemukan.",404);if(shipment.status==="completed")error("Pengiriman sudah diterima seluruhnya.");
  const allocations=await tx.select().from(allocationsTable).where(eq(allocationsTable.shipmentId,shipment.id)).for("update");const items=await requestItems(tx,request.id);if(!input.items?.length)error("Isi jumlah penerimaan.",400);const seen=new Set<string>();let moved=0;
  for(const selection of input.items){if(!selection.allocationId||seen.has(selection.allocationId))error("Alokasi penerimaan tidak valid/ganda.",400);seen.add(selection.allocationId);const allocation=allocations.find(a=>a.id===selection.allocationId);if(!allocation)error("Batch pengiriman tidak ditemukan.",404);assertNumber(selection.qty);assertNumber(selection.damagedQty??0);const accepted=selection.qty,damaged=selection.damagedQty??0,total=round(accepted+damaged);if(total===0)continue;if(total>round(n(allocation.qty)-n(allocation.receivedQty)-n(allocation.damagedQty)))error("Penerimaan melebihi jumlah tersisa.");if(damaged>0&&!(input.reason?.trim()))error("Alasan selisih/rusak wajib diisi.",400);
    const item=items.find(i=>i.id===allocation.itemId);if(!item)error("Baris permintaan tidak ditemukan.",404);
    await stock(tx,item.productId,shipment.transitWarehouseId,true);await recordStockMovement(tx,{type:"transfer",productId:item.productId,warehouseId:shipment.transitWarehouseId,deltaQty:-total,hpp:n(allocation.hpp),refDoc:`RCV ${shipment.doc}`,userId:actor.id,batchId:allocation.transitBatchId});
    if(accepted>0)await recordStockMovement(tx,{type:"in",productId:item.productId,warehouseId:request.warehouseId,deltaQty:accepted,hpp:n(allocation.hpp),refDoc:`RCV ${shipment.doc}`,userId:actor.id,batchNo:allocation.batchNo,expiredAt:allocation.expiredAt});
    if(damaged>0){const damagedLocation=await specialLocation(tx,actor,"damaged",request.division);if(damagedLocation===request.warehouseId||damagedLocation===shipment.transitWarehouseId)error("Lokasi rusak harus terpisah.");await recordStockMovement(tx,{type:"in",productId:item.productId,warehouseId:damagedLocation,deltaQty:damaged,hpp:n(allocation.hpp),refDoc:`DAMAGE ${shipment.doc}`,userId:actor.id,batchNo:allocation.batchNo,expiredAt:allocation.expiredAt});}
    await tx.update(allocationsTable).set({receivedQty:round(n(allocation.receivedQty)+accepted),damagedQty:round(n(allocation.damagedQty)+damaged)}).where(eq(allocationsTable.id,allocation.id));
    // Multiple allocations for one item must increment against current row, never overwrite a prior allocation.
    await tx.update(itemsTable).set({receivedQty:sql`${itemsTable.receivedQty} + ${accepted}`,damagedQty:sql`${itemsTable.damagedQty} + ${damaged}`}).where(eq(itemsTable.id,item.id));moved+=total;
  }
  if(moved===0)error("Tidak ada jumlah penerimaan.",400);
  const remaining=await tx.select().from(allocationsTable).where(eq(allocationsTable.shipmentId,shipment.id));await tx.update(shipmentsTable).set({status:remaining.every(a=>round(n(a.receivedQty)+n(a.damagedQty))===n(a.qty))?"completed":"partially_received"}).where(eq(shipmentsTable.id,shipment.id));
  const after=await requestItems(tx,request.id);return after.every(i=>n(i.receivedQty)>=n(i.requestedQty))?"completed":"partially_received";
}
export async function transitionReplenishment(actor:ClosingActor,id:string,input:ClosingTransitionInput){
  return transact(actor,input.idempotencyKey,{operation:"transition",id,...input},async tx=>{
    const request=await findRequest(tx,actor,id,true);assertVersion(request,input.version);if(terminals.includes(request.status))error("Permintaan sudah ditutup.");let status=request.status;
    if(input.action==="receive")status=await receive(tx,actor,request,input);
    else if(input.action==="resolve_difference"){
      if(!elevated(actor))error("Penyelesaian selisih hanya untuk Owner/Manajer.",403,"FORBIDDEN");
      if((input.reason?.trim().length??0)<3)error("Alasan penyelesaian selisih minimal tiga karakter.",400);
      if(request.status!=="partially_received")error("Hanya penerimaan berselisih yang dapat diselesaikan.");
      const items=await requestItems(tx,id);
      if(!items.length||!items.some(item=>n(item.damagedQty)>0)||!items.every(item=>round(n(item.receivedQty)+n(item.damagedQty))>=n(item.requestedQty)))error("Seluruh kebutuhan harus sudah tercatat diterima atau rusak sebelum selisih diselesaikan.");
      const reservations=await tx.select().from(reservationsTable).where(inArray(reservationsTable.itemId,items.map(item=>item.id))).for("update");
      if(reservations.some(reservation=>n(reservation.qty)!==0))error("Masih ada reservasi aktif yang harus diselesaikan.");
      const shipments=await tx.select().from(shipmentsTable).where(eq(shipmentsTable.requestId,id)).for("update");
      if(!shipments.length)error("Pengiriman belum tercatat.");
      const allocations=await tx.select().from(allocationsTable).where(inArray(allocationsTable.shipmentId,shipments.map(shipment=>shipment.id))).for("update");
      if(shipments.some(shipment=>!allocations.some(allocation=>allocation.shipmentId===shipment.id))||!allocations.every(allocation=>round(n(allocation.receivedQty)+n(allocation.damagedQty))===n(allocation.qty)))error("Seluruh barang dalam pengiriman harus sudah dipertanggungjawabkan.");
      // Administrative closure only: preserve quantities, batches, reservations and financial ledgers.
      status="completed";
    }
    else if(input.action==="approve")status=await reserveItems(tx,actor,request,input);
    else if(input.action==="dispatch")status=await dispatch(tx,actor,request,input);
    else if(input.action==="review"){await warehouseOperator(tx,actor);if(request.status!=="submitted")error("Hanya permintaan terkirim yang dapat direview.");status="under_review";}
    else if(input.action==="prepare"){await warehouseOperator(tx,actor);if(!["approved","partially_available","preparing","partially_received"].includes(request.status))error("Permintaan belum disetujui.");const items=await requestItems(tx,id);const selected=input.items??items.map(i=>({itemId:i.id,qty:round(n(i.approvedQty)-n(i.dispatchedQty))}));const seen=new Set<string>();for(const entry of selected){if(!entry.itemId||seen.has(entry.itemId))error("Baris persiapan tidak valid.",400);seen.add(entry.itemId);const item=items.find(i=>i.id===entry.itemId);if(!item)error("Baris tidak ditemukan.",404);assertNumber(entry.qty);if(entry.qty>n(item.approvedQty)-n(item.dispatchedQty))error("Jumlah persiapan melebihi persetujuan tersisa.");await tx.update(itemsTable).set({preparedQty:round(n(item.dispatchedQty)+entry.qty)}).where(eq(itemsTable.id,item.id));}status="preparing";}
    else if(input.action==="ready"){await warehouseOperator(tx,actor);if(request.status!=="preparing")error("Permintaan belum disiapkan.");if(!(await requestItems(tx,id)).some(i=>n(i.preparedQty)>n(i.dispatchedQty)))error("Belum ada bahan disiapkan.");status="ready";}
    else if(input.action==="reject"||input.action==="cancel"){
      if(!(input.reason?.trim()))error("Alasan wajib diisi.",400);
      if(input.action==="reject"){if(!elevated(actor))error("Penolakan hanya untuk Owner/Manajer.",403);if(!["submitted","under_review","approved","partially_available","preparing","ready"].includes(request.status))error("Status tidak dapat ditolak.");}
      else if(!elevated(actor)){await divisionOperator(tx,actor,request.division,request.warehouseId);if(request.status!=="draft")error("Staf hanya dapat membatalkan draft.",403);}
      const items=await requestItems(tx,id);if(items.some(i=>n(i.dispatchedQty)>0))error("Pengiriman sudah terjadi; selesaikan penerimaan dan koreksi terhubung, bukan batalkan dokumen.");
      for(const item of items){await tx.update(reservationsTable).set({qty:0}).where(eq(reservationsTable.itemId,item.id));await tx.update(shortagesTable).set({status:"cancelled",updatedAt:new Date()}).where(eq(shortagesTable.itemId,item.id));}status=input.action==="reject"?"rejected":"cancelled";
    }
    else error("Aksi tidak dikenal.",400);
    const [updated]=await tx.update(requestsTable).set({status,version:request.version+1,updatedAt:new Date()}).where(eq(requestsTable.id,id)).returning();
    await event(tx,actor,id,`Closing ${input.action}`,{before:request.status,after:status,version:updated.version,reason:input.reason,items:input.items,sourceWarehouseId:input.sourceWarehouseId,shipmentId:input.shipmentId});return detail(tx,actor,updated);
  });
}
export async function listShortages(actor:ClosingActor,filters:ClosingFilters={}){
  await warehouseOperator(getDb(),actor);const requests=await listReplenishments(actor,filters);const ids=requests.flatMap(r=>r.items.map(i=>i.id));if(!ids.length)return [];
  const rows=await getDb().select().from(shortagesTable).where(inArray(shortagesTable.itemId,ids));const result=[];for(const row of rows){const request=requests.find(r=>r.items.some(i=>i.id===row.itemId))!;const item=request.items.find(i=>i.id===row.itemId)!;const [inventory]=await getDb().select({purchasePrice:inventoryItems.purchasePrice,packageQty:inventoryItems.packageQty,packageSize:inventoryItems.packageSize}).from(inventoryItems).where(eq(inventoryItems.sku,item.sku)).limit(1);const [supplier]=row.supplierId?await getDb().select({name:wmsSupplier.name}).from(wmsSupplier).where(eq(wmsSupplier.id,row.supplierId)):[];result.push({...row,supplierName:supplier?.name??null,requestId:request.id,doc:request.doc,division:request.division,neededDate:request.neededDate,sku:item.sku,name:item.name,unit:item.unit,stockUnit:item.unit,purchaseUnit:inventory?.packageSize||item.unit,packQty:n(inventory?.packageQty)||1,lastPurchasePrice:n(inventory?.purchasePrice),estimatedCost:round(n(row.qty)*n(row.lastUnitPrice))});}return result;
}
export async function decideShortage(actor:ClosingActor,id:string,input:ShortageDecisionInput){
  if(!elevated(actor))error("Persetujuan pembelian hanya untuk Owner/Manajer.",403,"FORBIDDEN");
  return transact(actor,input.idempotencyKey,{operation:"shortage",id,...input},async tx=>{
    const [shortage]=await tx.select().from(shortagesTable).where(eq(shortagesTable.id,id)).for("update");if(!shortage)error("Kekurangan tidak ditemukan.",404);const [item]=await tx.select().from(itemsTable).where(eq(itemsTable.id,shortage.itemId));const request=await findRequest(tx,actor,item.requestId,true);if(terminals.includes(request.status))error("Permintaan sudah ditutup.");if(shortage.status!=="draft")error("Usulan pembelian sudah diputuskan.");
    if(input.action==="approve"){if(!input.supplierId)error("Pilih supplier terdaftar.",400);const [supplier]=await tx.select().from(wmsSupplier).where(and(eq(wmsSupplier.id,input.supplierId),isNull(wmsSupplier.archivedAt)));if(!supplier)error("Supplier tidak aktif/tidak ditemukan.",400);}
    if(input.action!=="approve"&&!input.note?.trim())error("Catatan penolakan/pembatalan diperlukan.",400);
    const [updated]=await tx.update(shortagesTable).set({status:input.action==="approve"?"approved":input.action==="reject"?"rejected":"cancelled",supplierId:input.supplierId??shortage.supplierId,note:input.note?.trim()??"",updatedAt:new Date()}).where(eq(shortagesTable.id,id)).returning();await event(tx,actor,request.id,`Usulan pembelian ${input.action}`,{shortageId:id,qty:shortage.qty,supplierId:updated.supplierId});return updated;
  });
}
export async function getPreparation(actor:ClosingActor,filters:ClosingFilters={}) {
  const db=getDb();
  await warehouseOperator(db,actor);
  const requests=(await listReplenishments(actor,filters)).filter(r=>r.status!=="draft");
  const reservations=await db.select().from(reservationsTable);
  const mapped=await db.select().from(locationsTable).where(and(eq(locationsTable.outletId,actor.outletId),eq(locationsTable.kind,"main")));
  const sources:typeof mapped=[];
  const sourceLocations=[];
  for (const source of mapped) {
    try {
      await warehouseOperator(db,actor,source.warehouseId);
      const loc=await location(db,actor,source.warehouseId);
      sources.push(source);
      sourceLocations.push({id:source.warehouseId,name:loc.warehouse.name});
    } catch(e) { if(!(e instanceof ClosingError))throw e; }
  }
  const pickList=[];
  for (const source of sources) {
    const contributions=[];
    for (const request of requests) {
      if(terminals.includes(request.status)||![request.division,"umum"].includes(source.area))continue;
      const preferred=sources.find(s=>s.area===request.division)??sources.find(s=>s.area==="umum");
      for (const item of request.items) {
        const remaining=Math.max(0,round(n(item.requestedQty)-n(item.dispatchedQty)));
        if(!remaining)continue;
        const held=reservations.filter(r=>r.itemId===item.id&&n(r.qty)>0);
        const sourceQty=held.filter(r=>r.warehouseId===source.warehouseId).reduce((sum,r)=>sum+n(r.qty),0);
        // A reserved line belongs only to its actual sources. Unassigned demand
        // appears once at the preferred compatible source, never once per warehouse.
        const qty=held.length?sourceQty:preferred?.warehouseId===source.warehouseId?remaining:0;
        if(qty<=0)continue;
        contributions.push({productId:item.productId,requestId:request.id,doc:request.doc,division:request.division,itemId:item.id,qty,reservedQty:sourceQty});
      }
    }
    for(const productId of new Set(contributions.map(c=>c.productId))) {
      const lines=contributions.filter(c=>c.productId===productId);
      const product=requests.flatMap(r=>r.items).find(i=>i.productId===productId)!;
      const onHand=await stock(db,productId,source.warehouseId);
      const reservedQty=await reserved(db,productId,source.warehouseId);
      pickList.push({productId,sku:product.sku,name:product.name,unit:product.unit,sourceWarehouseId:source.warehouseId,onHand,reserved:reservedQty,available:Math.max(0,round(onHand-reservedQty)),totalRequested:round(lines.reduce((sum,c)=>sum+c.qty,0)),totalReserved:round(lines.reduce((sum,c)=>sum+c.reservedQty,0)),requests:lines});
    }
  }
  return {requests,pickList,sourceLocations,capabilities:{manage:elevated(actor),warehouse:true},shortages:await listShortages(actor,filters),notifications:await getClosingNotifications(actor),generatedAt:new Date().toISOString()};
}
export async function getClosingReport(actor:ClosingActor,filters:ClosingFilters={}){
  const requests=await listReplenishments(actor,filters);const config=await getSettings(getDb(),actor);const lines=requests.flatMap(r=>r.items.filter(i=>!filters.productId||i.productId===filters.productId).map(i=>({doc:r.doc,division:r.division,businessDate:r.businessDate,neededDate:r.neededDate,status:r.status,late:r.late,sku:i.sku,name:i.name,unit:i.unit,systemQty:i.systemQty,physicalQty:i.physicalQty,variance:i.variance,targetQty:i.targetQty,incomingQty:i.incomingQty,requestedQty:i.requestedQty,approvedQty:i.approvedQty,dispatchedQty:i.dispatchedQty,receivedQty:i.receivedQty,damagedQty:i.damagedQty,shortageQty:i.shortageQty,estimatedCost:round(i.shortageQty*i.hpp),submittedAt:r.submittedAt,updatedAt:r.updatedAt,completedAt:r.status==="completed" ? r.updatedAt : null,fulfillmentTiming:r.noRequest?"Tidak ada permintaan":r.status==="completed"?(r.items.some(item=>n(item.damagedQty)>0)?"Selisih disetujui":new Date(r.updatedAt).getTime()<=new Date(`${r.neededDate}T${config.openTime}:00+07:00`).getTime()?"Tepat waktu":"Terlambat"):"Belum selesai"})));
  return {generatedAt:new Date().toISOString(),filters,requests,totalRequests:requests.length,lateRequests:requests.filter(r=>r.late).length,openRequests:requests.filter(r=>!terminals.includes(r.status)).length,lines};
}

/** Notifications are derived from authorized live documents, never simulated or separately posted. */
export async function getClosingNotifications(actor: ClosingActor) {
  const requests = await listReplenishments(actor);
  return requests.filter(r => !terminals.includes(r.status) && r.status !== "draft").map(r => ({
    id: `closing:${r.id}:${r.version}`, requestId:r.id, status:r.status,
    level:r.status === "partially_available" || r.late ? "warning" : "info",
    title:r.status === "submitted" ? "Permintaan baru" : r.status === "ready" ? "Bahan siap diserahkan" : ["dispatched", "partially_received"].includes(r.status) ? "Konfirmasi penerimaan bahan" : r.status === "partially_available" ? "Stok belum mencukupi" : "Permintaan sedang diproses",
    text:`${r.doc} · ${r.division === "bar" ? "Bar" : "Dapur"} · kebutuhan ${r.neededDate}${r.late ? " · Late Request" : ""}`,
    href:`/warehouse/requests?id=${r.id}`, updatedAt:r.updatedAt,
  }));
}
