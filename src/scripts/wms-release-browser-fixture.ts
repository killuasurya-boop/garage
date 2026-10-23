/** Isolated CI fixture only. Never reads a production URL or seeds an existing DB. */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { ensureDatabaseReady, getDb, getPgPool, schema } from "@/db";
import { createWmsProduct, recordStockMovement, runInTx } from "@/lib/wms-service";
import { updateClosingSettings } from "@/lib/wms-replenishment";

async function main() {
  const dir=process.env.PGLITE_DATA_DIR;
  if(process.env.GARAGE_UAT_ISOLATED!=="true"||process.env.GARAGE_DB_DRIVER!=="pglite"||!dir||!path.basename(path.dirname(dir)).startsWith("garage-wms-browser-")||fs.existsSync(dir)) throw new Error("Only a new isolated browser fixture database is allowed.");
  fs.mkdirSync(path.dirname(dir),{recursive:true});
  delete process.env.DATABASE_URL;
  await ensureDatabaseReady();
  const pool=getPgPool() as unknown as {exec:(sql:string)=>Promise<unknown>;end:()=>Promise<void>};
  for(const statement of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema))) await pool.exec(statement);
  const db=getDb();
  const [outlet]=await db.insert(schema.outlets).values({code:"UAT-ONLY",name:"Isolated Browser UAT"}).returning();
  const password=randomUUID()+"-Aa1!";
  for(const [id,role,workstation,position] of [["uat-owner","Owner","all","Owner"],["uat-bar","Kasir","bar","Barista"],["uat-kitchen","Kasir","dapur","Koki"],["uat-warehouse","Kasir","all","Gudang"]]) {
    await db.insert(schema.user).values({id,name:id,email:`${id}@garage.test`,emailVerified:true});
    await db.insert(schema.account).values({id:randomUUID(),userId:id,accountId:id,providerId:"credential",password:await hashPassword(password)});
    await db.insert(schema.staffProfiles).values({userId:id,outletId:outlet.id,role,workstation,position});
  }
  const locations=await db.insert(schema.wmsWarehouse).values([
    {code:"UAT-MAIN-BAR",name:"UAT Gudang Bar",type:"main",area:"bar"},
    {code:"UAT-MAIN-DAPUR",name:"UAT Gudang Dapur",type:"main",area:"dapur"},
    {code:"UAT-BAR",name:"UAT Bar",type:"bar",area:"bar"},
    {code:"UAT-DAPUR",name:"UAT Dapur",type:"kitchen",area:"dapur"},
    {code:"UAT-TRANSIT",name:"UAT Transit",type:"transit",area:"umum"},
    {code:"UAT-DAMAGE",name:"UAT Karantina",type:"damaged",area:"umum"},
  ]).returning();
  const [mainBar,mainKitchen,bar,kitchen,transit,damage]=locations;
  const owner={id:"uat-owner",name:"uat-owner",role:"Owner",outletId:outlet.id};
  await updateClosingSettings(owner,{idempotencyKey:randomUUID(),locations:locations.map((l,i)=>({warehouseId:l.id,kind:(["main","main","bar","dapur","transit","damaged"] as const)[i],area:l.area as "bar"|"dapur"|"umum"})),access:[{userId:"uat-bar",warehouseId:bar.id,capability:"bar"},{userId:"uat-kitchen",warehouseId:kitchen.id,capability:"dapur"},{userId:"uat-warehouse",warehouseId:mainBar.id,capability:"warehouse"},{userId:"uat-warehouse",warehouseId:mainKitchen.id,capability:"warehouse"}]});
  await db.insert(schema.wmsCategory).values([{name:"Bar",area:"bar"},{name:"Bar Powder",area:"bar"},{name:"Dapur",area:"dapur"}]);
  const a=await createWmsProduct({sku:"BAR-001",name:"Drip Strawberry",category:"Bar",unit:"ml",minStock:7,packPrice:110000,packQty:760},owner.id);
  await createWmsProduct({sku:"BAR-014",name:"Drip Powder Coklat",category:"Bar Powder",unit:"gr",minStock:0,packPrice:220000,packQty:760},owner.id);
  const k=await createWmsProduct({sku:"KIT-001",name:"cabe merah",category:"Dapur",unit:"gr",minStock:10,packPrice:90000,packQty:1000},owner.id);
  await runInTx(async tx=>{await recordStockMovement(tx,{type:"in",productId:a.id,warehouseId:mainBar.id,deltaQty:20,hpp:110000/760,refDoc:"UAT-ONLY",batchNo:"UAT-FEFO",expiredAt:new Date("2099-01-01"),userId:owner.id});});
  await db.insert(schema.menuItems).values({id:"uat-menu",sku:"UAT-MENU",name:"UAT Coffee",category:"Coffee",section:"Minuman",status:"ready",prep:"UAT only"});
  await db.insert(schema.menuVariants).values({itemId:"uat-menu",variantId:"cold",label:"Cold",price:20000});
  await db.insert(schema.menuRecipes).values({menuItemId:"uat-menu",variantId:"cold",inventorySku:"BAR-001",qty:25,unit:"ml",status:"active"});
  const [supplier]=await db.insert(schema.wmsSupplier).values({name:"UAT Supplier"}).returning();
  fs.writeFileSync(path.join(path.dirname(dir),"fixture.json"),JSON.stringify({password,mainBar:mainBar.id,mainKitchen:mainKitchen.id,bar:bar.id,kitchen:kitchen.id,transit:transit.id,damage:damage.id,product:a.id,kitchenProduct:k.id,supplier:supplier.id}),{mode:0o600});
  await pool.exec(fs.readFileSync("scripts/wms-readiness-preflight.sql","utf8"));
  await pool.end();console.log("Isolated browser fixture ready; no production data used.");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
