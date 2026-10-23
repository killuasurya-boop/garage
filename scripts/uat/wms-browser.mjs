import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
const run=fs.mkdtempSync(path.join(os.tmpdir(),"garage-wms-browser-")), base="http://127.0.0.1:3456";
const output=path.resolve("test-artifacts/wms-browser");fs.mkdirSync(output,{recursive:true});
const env={...process.env,BETTER_AUTH_SECRET:randomUUID()+randomUUID(),BETTER_AUTH_URL:base,GARAGE_TRUST_LAN_ORIGINS:"false",GARAGE_UAT_ISOLATED:"true",GARAGE_DB_DRIVER:"pglite",PGLITE_DATA_DIR:path.join(run,"db"),GARAGE_DISABLE_AUTO_REJECT:"true",GARAGE_DISABLE_WARMUP:"true",GARAGE_DISABLE_BACKUPS:"true"};delete env.DATABASE_URL;
let server,browser;const evidence={fixture:"isolated CI database",checks:[],screens:[]};
try {
 const seeded=spawnSync(process.execPath,["--import","tsx","src/scripts/wms-release-browser-fixture.ts"],{env,stdio:"inherit"});assert.equal(seeded.status,0);
 const fixture=JSON.parse(fs.readFileSync(path.join(run,"fixture.json"),"utf8"));
 fs.cpSync(".next/static",".next/standalone/.next/static",{recursive:true});if(fs.existsSync("public"))fs.cpSync("public",".next/standalone/public",{recursive:true});
 const log=fs.openSync(path.join(output,"server.log"),"w");
 server=spawn(process.execPath,[".next/standalone/server.js"],{env:{...env,PORT:"3456",HOSTNAME:"127.0.0.1"},stdio:["ignore",log,log]});
 let ready=false;for(let i=0;i<90;i++){try{if((await fetch(base+"/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert(ready,"isolated production server did not become healthy");
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const owner=await browser.newContext(),bar=await browser.newContext({viewport:{width:390,height:844}});
 async function login(context,id){const r=await context.request.post(base+"/api/auth/sign-in/email",{data:{email:`${id}@garage.test`,password:fixture.password},headers:{origin:base}});assert(r.ok(),`fixture login ${r.status()}`);}
 await login(owner,"uat-owner");await login(bar,"uat-bar");
 async function api(context,url,data,method="post"){const r=await context.request[method](base+url,{...data?{data}:{},headers:{origin:base}});const json=await r.json();assert(r.ok(),`${url}: ${r.status()} ${JSON.stringify(json)}`);return json.data;}
 async function capture(page,name){await page.screenshot({path:path.join(output,name+".png"),fullPage:false});const width=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert(width.document<=width.viewport,`${name} horizontal overflow`);evidence.screens.push({name,...width});}
 const errors=[];const page=await owner.newPage();page.on("pageerror",e=>errors.push(e.message));
 await page.setViewportSize({width:1366,height:900});await page.goto(base+"/warehouse/master");
 await page.getByTestId("reference-material").first().waitFor();assert.equal(await page.getByTestId("reference-material").count(),36);
 await page.getByLabel("Divisi acuan").selectOption("Dapur");assert.equal(await page.getByTestId("reference-material").count(),40);
 await page.getByLabel("Divisi acuan").selectOption("Bar");await page.getByLabel("Cari bahan acuan").fill("BAR-914");await page.getByText("Biaya Garage tetap dipertahankan",{exact:false}).first().waitFor();await capture(page,"reference-desktop");
 await page.getByLabel("Cari bahan acuan").fill("");await page.getByText("Saya sudah meninjau pemetaan dan konflik.",{exact:false}).check();await page.getByTestId("material-reference-apply").click();await page.getByText("Acuan tersimpan.",{exact:false}).waitFor();
 const reference=await api(owner,"/api/wms/material-reference",null,"get");assert.equal(reference.plan.rows.length,76);assert.equal(reference.plan.summary.blankStock,76);assert.equal(reference.plan.rows.find(r=>r.sourceSku==="BAR-914").target.purchasePrice,220000);evidence.checks.push("76 source references saved without overwriting trusted price or blank stock");
 await page.setViewportSize({width:390,height:844});await page.reload();await page.getByTestId("reference-material").first().waitFor();await capture(page,"reference-mobile");
 const staff=await bar.newPage();staff.on("pageerror",e=>errors.push(e.message));await staff.goto(base+"/warehouse/closing");await staff.getByTestId("closing-material").first().waitFor();
 for(const summary of await staff.locator('[data-testid="closing-category"] > summary').all())if((await summary.locator("..").getAttribute("open"))===null)await summary.click();
 await staff.getByLabel("Target stok Drip Strawberry",{exact:true}).fill("7");await staff.getByLabel("Stok fisik Drip Strawberry",{exact:true}).fill("2");await staff.getByLabel("Stok fisik Drip Powder Coklat",{exact:true}).fill("0");
 await capture(staff,"closing-mobile");await staff.getByRole("button",{name:"Tinjau & Kirim",exact:true}).click();await staff.getByTestId("closing-submit").click();await staff.getByText("Permintaan sudah dikirim ke gudang",{exact:true}).waitFor();evidence.checks.push("Bar mobile physical count, grouped input and real UI submit");
 assert.equal((await bar.request.get(base+"/api/wms/replenishment/readiness")).status(),403);
 await page.setViewportSize({width:1366,height:900});await page.goto(base+"/warehouse/preparation?setup=1");await page.getByRole("heading",{name:"Kesiapan lokasi & akses",exact:true}).waitFor();const readiness=await api(owner,"/api/wms/replenishment/readiness",null,"get");assert.equal(readiness.ready,true);await capture(page,"readiness-desktop");evidence.checks.push("real fixture mappings ready; staff diagnostic access denied");
 const request=await api(owner,"/api/wms/replenishment/requests",{idempotencyKey:randomUUID(),division:"dapur",businessDate:"2026-10-23",neededDate:"2026-10-24",warehouseId:fixture.kitchen,submit:true,items:[{productId:fixture.kitchenProduct,physicalQty:0,targetQty:10,requestedQty:10}]});
 await api(owner,`/api/wms/replenishment/requests/${request.id}/actions`,{idempotencyKey:randomUUID(),action:"approve",version:request.version,sourceWarehouseId:fixture.mainKitchen,items:[{itemId:request.items[0].id,qty:0}]});
 const shortages=await api(owner,"/api/wms/replenishment/shortages",null,"get"),shortage=shortages.find(r=>r.requestId===request.id);assert(shortage);
 await api(owner,`/api/wms/replenishment/shortages/${shortage.id}/actions`,{idempotencyKey:randomUUID(),action:"approve",supplierId:fixture.supplier});
 await page.goto(base+"/warehouse/purchasing");await page.getByRole("button",{name:"Buat draft PO untuk usulan ini",exact:true}).waitFor();await page.getByLabel("Harga disepakati per gr (Rp)",{exact:true}).fill("90");await page.getByRole("button",{name:"Buat draft PO untuk usulan ini",exact:true}).click();await page.getByRole("button",{name:"Setujui PO ini",exact:true}).click();
 await page.getByText("Buat penerimaan parsial dari sisa PO",{exact:true}).click();await page.getByLabel("Gudang utama tujuan",{exact:true}).selectOption(fixture.mainKitchen);await page.getByLabel("Jumlah diterima (gr)",{exact:true}).fill("4");await page.getByLabel("Nomor batch",{exact:true}).fill("UAT-PURCHASE");await page.getByLabel("Kedaluwarsa",{exact:true}).fill("2099-01-01");await page.getByRole("button",{name:"Simpan draft Goods Receipt",exact:true}).click();await page.getByRole("button",{name:"Konfirmasi barang & selesaikan Goods Receipt",exact:true}).click();await page.getByText("Sudah masuk 4",{exact:true}).waitFor();await capture(page,"purchasing-desktop");await page.setViewportSize({width:390,height:844});await capture(page,"purchasing-mobile");evidence.checks.push("approved shortage -> explicit PO -> approval -> partial receipt -> existing stock posting through real UI");
 assert.deepEqual(errors,[]);evidence.pageErrors=errors;fs.writeFileSync(path.join(output,"evidence.json"),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
} finally {await browser?.close();server?.kill("SIGTERM");fs.rmSync(run,{recursive:true,force:true});}
