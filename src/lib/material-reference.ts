import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, inventoryItems, masterCrosswalk, masterImports, menuItems, menuRecipes, wmsCategory, wmsProduct, wmsRecipe } from "@/db/schema";
import { createWmsProduct, runInTx } from "@/lib/wms-service";
import {
  MaterialReferenceError, parseMaterialReferenceCsv, planMaterialReference, referenceUnitQuantity,
  type MaterialRecipeLink, type MaterialReferenceConfirmation, type MaterialReferenceResult,
  type MaterialReferenceRow, type MaterialReferenceStored,
} from "@/lib/material-reference-plan";

const KIND = "material-reference-v1";
const APPLY = "material-reference:apply";
type Db = ReturnType<typeof getDb>;
type Actor = { id: string; name: string };
export type MaterialReferenceInput = {
  buffer: Buffer; fileName: string; confirmations?: MaterialReferenceConfirmation[]; applyMetadata?: boolean;
};
type StoredSummary = {
  kind: typeof KIND; rows: MaterialReferenceRow[]; confirmations: MaterialReferenceConfirmation[];
  requestHash: string; applyMetadata: boolean; sourceText: string;
};

async function currentState(db: Db) {
  const materials = await db.select().from(inventoryItems);
  const products = await db.select().from(wmsProduct);
  const recipes = await db.select({
    menuItemId: menuRecipes.menuItemId, variantId: menuRecipes.variantId, sku: menuRecipes.inventorySku,
    qty: menuRecipes.qty, unit: menuRecipes.unit, status: menuRecipes.status, menuName: menuItems.name,
  }).from(menuRecipes).leftJoin(menuItems, eq(menuItems.id, menuRecipes.menuItemId))
    .where(sql`${menuRecipes.status} in ('active', 'draft')`);
  const synced = await db.select({ id: wmsRecipe.id, version: wmsRecipe.version })
    .from(wmsRecipe).where(sql`${wmsRecipe.recipeStatus} <> 'archived' and ${wmsRecipe.version} like 'os:%'`);
  const recipeMap = new Map(synced.map((r) => [r.version, r.id]));
  const recipesBySku: Record<string, MaterialRecipeLink[]> = {};
  for (const r of recipes) {
    if (!r.sku || !r.menuItemId) continue;
    (recipesBySku[r.sku] ??= []).push({ menuItemId: r.menuItemId, menuName: r.menuName ?? r.menuItemId,
      variantId: r.variantId, status: r.status, qty: Number(r.qty), unit: r.unit,
      wmsRecipeId: recipeMap.get(`os:${r.menuItemId}:${r.variantId}`) ?? null });
  }
  return {
    materials: materials.map((m) => ({ ...m, unitCost: Number(m.unitCost), min: Number(m.min), purchasePrice: Number(m.purchasePrice), packageQty: Number(m.packageQty) })),
    wmsProducts: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, category: p.category, archived: p.archivedAt !== null, minStock: Number(p.minStock) })),
    recipesBySku,
  };
}

function prepare(input: MaterialReferenceInput) {
  const sourceText = input.buffer.toString("utf8");
  if (!Buffer.from(sourceText, "utf8").equals(input.buffer)) throw new MaterialReferenceError("CSV harus menggunakan teks UTF-8 yang valid.");
  const rows = parseMaterialReferenceCsv(sourceText);
  const fileHash = createHash("sha256").update(input.buffer).digest("hex");
  const confirmations = [...(input.confirmations ?? [])].sort((a, b) => a.sourceSku.localeCompare(b.sourceSku));
  const applyMetadata = input.applyMetadata !== false;
  const requestHash = createHash("sha256").update(JSON.stringify({ fileHash, confirmations, applyMetadata })).digest("hex");
  const summary: StoredSummary = { kind: KIND, rows, confirmations, requestHash, applyMetadata, sourceText };
  return { rows, fileHash, confirmations, requestHash, summary, applyMetadata };
}

export async function previewMaterialReference(input: MaterialReferenceInput): Promise<MaterialReferenceResult> {
  const parsed = prepare(input);
  return { fileName: input.fileName, fileHash: parsed.fileHash,
    plan: planMaterialReference(parsed.rows, await currentState(getDb()), parsed.confirmations) };
}

export async function applyMaterialReference(input: MaterialReferenceInput, actor: Actor): Promise<MaterialReferenceResult> {
  const parsed = prepare(input);
  return runInTx(async (tx) => {
    // Same lock as W2 master imports: both create canonical material identities.
    await tx.execute(sql`select pg_advisory_xact_lock(73452, 1)`);
    const state = await currentState(tx);
    const plan = planMaterialReference(parsed.rows, state, parsed.confirmations);
    const [previous] = await tx.select({ id: masterImports.id }).from(masterImports)
      .where(and(eq(masterImports.mode, APPLY), eq(masterImports.fileHash, parsed.fileHash),
        sql`${masterImports.summary}->>'requestHash' = ${parsed.requestHash}`)).limit(1);
    if (previous) return { fileName: input.fileName, fileHash: parsed.fileHash, plan, importId: previous.id,
      materialsCreated: 0, metadataUpdated: 0, alreadyApplied: true };

    const [log] = await tx.insert(masterImports).values({ fileName: input.fileName, fileHash: parsed.fileHash,
      mode: APPLY, summary: parsed.summary, createdBy: actor.id }).returning({ id: masterImports.id });
    let materialsCreated = 0;
    let metadataUpdated = 0;
    const changes: Array<Record<string, unknown>> = [];
    for (const row of plan.rows) {
      const validated = row.status === "ready_create" || Boolean(row.target && row.metadata.canApply && !row.issues.some((issue) => issue.code === "price_conflict"));
      if (row.status === "ready_create" && row.creation) {
        const [cat] = await tx.select({ area: wmsCategory.area }).from(wmsCategory)
          .where(eq(wmsCategory.name, row.sourceCategory)).limit(1);
        if (cat && cat.area !== row.sourceCategory.toLowerCase()) throw new MaterialReferenceError(`Area kategori ${row.sourceCategory} perlu direkonsiliasi dahulu.`);
        await tx.insert(wmsCategory).values({ name: row.sourceCategory, area: row.sourceCategory.toLowerCase() }).onConflictDoNothing();
        const c = row.creation;
        await createWmsProduct({ sku: row.canonicalSku, name: row.sourceName, category: row.sourceCategory,
          unit: c.unit, minStock: c.minStock, packPrice: c.packagePrice, packQty: c.packageQty,
          packName: "kemasan terkonfirmasi", barcode: row.sourceBarcode || null }, actor.id, tx as never);
        materialsCreated++;
        changes.push({ sku: row.canonicalSku, action: "create", unit: c.unit, packageQty: c.packageQty,
          purchasePrice: c.packagePrice, unitCost: c.unitCost, stockEffect: "none" });
      } else if (parsed.applyMetadata && row.metadata.canApply && row.target && row.status !== "conflict") {
        // Only the explicit minimum and searchable alias are metadata writes.
        // Prices, units, names, categories, recipes and physical stock stay intact.
        const old = row.target;
        const aliasParts = old.alternativeName.split(" | ").filter(Boolean);
        if (row.metadata.alias && !aliasParts.includes(row.metadata.alias)) aliasParts.push(row.metadata.alias);
        const alias = aliasParts.join(" | ");
        const min = row.metadata.minStock ?? old.min;
        const product = state.wmsProducts.find((p) => p.sku === row.canonicalSku)!;
        const wmsMin = row.sourceMin === null ? null : referenceUnitQuantity(row.sourceMin, row.sourceUnit, product.unit);
        if (alias !== old.alternativeName || min !== old.min || (wmsMin !== null && wmsMin !== product.minStock)) {
          await tx.update(inventoryItems).set({ alternativeName: alias, min, status: sql<string>`case when ${inventoryItems.onHand} <= ${min} then 'low' when ${inventoryItems.onHand} <= ${min * 1.25} then 'watch' else 'safe' end`, updatedAt: new Date() }).where(eq(inventoryItems.sku, row.canonicalSku));
          if (wmsMin !== null) await tx.update(wmsProduct).set({ minStock: wmsMin, updatedAt: new Date() }).where(eq(wmsProduct.id, old.wmsProductId!));
          metadataUpdated++;
          changes.push({ sku: row.canonicalSku, action: "metadata", before: { alternativeName: old.alternativeName, min: old.min }, after: { alternativeName: alias, min }, costEffect: "none", stockEffect: "none" });
        }
      }
      // Keep source identity independent of trusted Excel reconciliation records.
      await tx.insert(masterCrosswalk).values({ kind: "material_reference", sourceKey: row.sourceSku,
        sourceName: row.sourceName, targetSku: row.target?.sku ?? (row.creation ? row.canonicalSku : null),
        status: row.status === "ready_create" ? "created" : row.status,
        validated,
        note: JSON.stringify({ fileHash: parsed.fileHash, row: row.row, category: row.sourceCategory,
          sourceUnit: row.sourceUnit, sourceMin: row.sourceMin, sourceHpp: row.sourceHpp, sourceStock: row.sourceStock,
          issues: row.issues.map((i) => i.code) }), importId: log.id })
        .onConflictDoUpdate({ target: [masterCrosswalk.kind, masterCrosswalk.sourceKey], set: {
          sourceName: row.sourceName, targetSku: row.target?.sku ?? (row.creation ? row.canonicalSku : null),
          status: row.status === "ready_create" ? "created" : row.status,
          validated,
          note: JSON.stringify({ fileHash: parsed.fileHash, row: row.row, category: row.sourceCategory,
            sourceUnit: row.sourceUnit, sourceMin: row.sourceMin, sourceHpp: row.sourceHpp, sourceStock: row.sourceStock,
            issues: row.issues.map((i) => i.code) }), importId: log.id, updatedAt: new Date(),
        } });
    }
    await tx.insert(auditLogs).values({ time: new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date()),
      actor: actor.name, action: "Impor referensi bahan CSV", object: input.fileName, device: "WMS", status: "recorded",
      metadata: { importId: log.id, fileHash: parsed.fileHash, materialsCreated, metadataUpdated, changes, noStockPosting: true, noPosChanges: true } });
    return { fileName: input.fileName, fileHash: parsed.fileHash, plan, importId: log.id, materialsCreated, metadataUpdated, alreadyApplied: false };
  });
}

export async function getMaterialReference(): Promise<MaterialReferenceStored> {
  const [latest] = await getDb().select().from(masterImports).where(eq(masterImports.mode, APPLY))
    .orderBy(desc(masterImports.createdAt)).limit(1);
  if (!latest) return { fileName: null, fileHash: null, importedAt: null, plan: null };
  const summary = latest.summary as StoredSummary;
  if (summary.kind !== KIND || !Array.isArray(summary.rows)) throw new MaterialReferenceError("Format referensi tersimpan tidak dikenali.");
  return { fileName: latest.fileName, fileHash: latest.fileHash, importedAt: latest.createdAt.toISOString(),
    plan: planMaterialReference(summary.rows, await currentState(getDb()), summary.confirmations) };
}
