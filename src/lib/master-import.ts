import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditLogs,
  inventoryItems,
  masterCrosswalk,
  masterImports,
  menuItems,
  menuRecipes,
  menuVariants,
  wmsCategory,
} from "@/db/schema";
import { syncRecipeBaseCosts } from "@/lib/menu-recipe-cost";
import {
  parseMasterWorkbook,
  planMasterImport,
  type CurrentState,
  type MasterImportPlan,
} from "@/lib/master-import-plan";
import { createWmsProduct, runInTx } from "@/lib/wms-service";

// =============================================================================
// Layanan impor master Excel → Garage OS (Owner). Lihat master-import-plan.ts
// untuk aturan. Semua penulisan dalam satu transaksi; bisa diulang (idempoten:
// SKU/resep yang sudah ada dilewati).
// =============================================================================

export type MasterImportActor = { id: string; name: string };

export class MasterImportError extends Error {}

async function loadCurrentState(): Promise<CurrentState> {
  const db = getDb();
  const materials = await db
    .select({
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      usageArea: inventoryItems.usageArea,
      unit: inventoryItems.unit,
      packageQty: inventoryItems.packageQty,
      purchasePrice: inventoryItems.purchasePrice,
      unitCost: inventoryItems.unitCost,
    })
    .from(inventoryItems);
  const menus = await db
    .select({ id: menuItems.id, name: menuItems.name, category: menuItems.category, status: menuItems.status })
    .from(menuItems);
  const variants = await db
    .select({ itemId: menuVariants.itemId, variantId: menuVariants.variantId, label: menuVariants.label, price: menuVariants.price })
    .from(menuVariants);
  const recipes = await db
    .select({ menuItemId: menuRecipes.menuItemId, variantId: menuRecipes.variantId, sku: menuRecipes.inventorySku, qty: menuRecipes.qty, status: menuRecipes.status })
    .from(menuRecipes);

  const activeRecipes = new Map<string, Map<string, number>>();
  const draftRecipeMenuIds = new Set<string>();
  for (const r of recipes) {
    if (!r.menuItemId || !r.sku) continue;
    if (r.status === "draft") draftRecipeMenuIds.add(r.menuItemId);
    if (r.status !== "active") continue;
    const key = `${r.menuItemId}:${r.variantId}`;
    const m = activeRecipes.get(key) ?? new Map<string, number>();
    m.set(r.sku, (m.get(r.sku) ?? 0) + Number(r.qty));
    activeRecipes.set(key, m);
  }
  return {
    materials: materials.map((m) => ({
      sku: m.sku,
      name: m.name,
      usageArea: m.usageArea,
      unit: m.unit,
      packageQty: Number(m.packageQty),
      purchasePrice: Number(m.purchasePrice),
      unitCost: Number(m.unitCost),
    })),
    menus: menus.map((m) => ({
      ...m,
      variants: variants
        .filter((v) => v.itemId === m.id)
        .map((v) => ({ variantId: v.variantId, label: v.label, price: Number(v.price) })),
    })),
    activeRecipes,
    draftRecipeMenuIds,
  };
}

function summarize(plan: MasterImportPlan) {
  return {
    materialsToCreate: plan.materials.toCreate.length,
    materialsExisting: plan.materials.alreadyExists.length,
    materialConflicts: plan.materials.nameConflicts.length,
    virtualSkipped: plan.materials.virtualSkipped.length,
    barDifferences: plan.materials.barDifferences.length,
    recipesNewDraft: plan.recipes.filter((r) => r.status === "new_draft").length,
    recipesSkipped: plan.recipes.filter((r) => r.status !== "new_draft").length,
    barRecipeDifferences: plan.barRecipeDifferences.length,
    excelNotInGarage: plan.posReconciliation.excelNotInGarage.length,
    garageNotInExcel: plan.posReconciliation.garageNotInExcel.length,
    priceDifferences: plan.posReconciliation.priceDifferences.length,
    warnings: plan.warnings.length,
  };
}

export async function previewMasterImport(input: { buffer: Buffer; fileName: string }, actor: MasterImportActor) {
  const data = parseMasterWorkbook(input.buffer);
  if (!data.materials.length && !data.recipeLines.length) {
    throw new MasterImportError(
      `Workbook tidak berisi sheet master yang dikenali (Master Bahan / Recipe Detail). Sheet: ${data.sheetNames.join(", ") || "-"}.`,
    );
  }
  const plan = planMasterImport(data, await loadCurrentState());
  const fileHash = createHash("sha256").update(input.buffer).digest("hex");
  await getDb()
    .insert(masterImports)
    .values({ fileName: input.fileName, fileHash, mode: "preview", summary: summarize(plan), createdBy: actor.id });
  return { fileName: input.fileName, fileHash, sheetNames: data.sheetNames, summary: summarize(plan), plan };
}

export async function applyMasterImport(input: { buffer: Buffer; fileName: string }, actor: MasterImportActor) {
  const data = parseMasterWorkbook(input.buffer);
  const plan = planMasterImport(data, await loadCurrentState());
  const fileHash = createHash("sha256").update(input.buffer).digest("hex");

  const result = await runInTx(async (tx) => {
    const [log] = await tx
      .insert(masterImports)
      .values({ fileName: input.fileName, fileHash, mode: "apply", summary: summarize(plan), createdBy: actor.id })
      .returning();

    for (const category of new Set(plan.materials.toCreate.map((m) => m.category))) {
      await tx.insert(wmsCategory).values({ name: category, area: "dapur" }).onConflictDoNothing();
    }
    let materialsCreated = 0;
    for (const m of plan.materials.toCreate) {
      const [exists] = await tx.select({ sku: inventoryItems.sku }).from(inventoryItems).where(eq(inventoryItems.sku, m.sku)).limit(1);
      if (exists) continue;
      await createWmsProduct(
        {
          sku: m.sku,
          name: m.name,
          category: m.category,
          unit: m.unit,
          minStock: 0,
          packPrice: m.packPrice,
          packQty: m.packQty,
          packName: "kemasan",
        },
        actor.id,
        tx as never,
      );
      materialsCreated++;
      await tx
        .insert(masterCrosswalk)
        .values({ kind: "material", sourceKey: m.sku, sourceName: m.name, targetSku: m.sku, status: "created", validated: m.validated, note: m.note, importId: log.id })
        .onConflictDoUpdate({
          target: [masterCrosswalk.kind, masterCrosswalk.sourceKey],
          set: { targetSku: m.sku, status: "created", validated: m.validated, note: m.note, importId: log.id, updatedAt: new Date() },
        });
    }
    for (const c of plan.materials.nameConflicts) {
      await tx
        .insert(masterCrosswalk)
        .values({ kind: "material", sourceKey: c.key, sourceName: c.excelName, targetSku: null, status: "unverified", note: `Nama sama dengan ${c.existingSku} (${c.existingName}) — cocokkan manual.`, importId: log.id })
        .onConflictDoNothing();
    }

    let recipesDrafted = 0;
    for (const r of plan.recipes) {
      if (r.status !== "new_draft" || !r.menuItemId || !r.variantId) {
        await tx
          .insert(masterCrosswalk)
          .values({ kind: "recipe", sourceKey: r.recipeId, sourceName: r.excelMenu, targetMenuItemId: r.menuItemId, targetVariantId: r.variantId, status: "skipped", note: r.status, importId: log.id })
          .onConflictDoNothing();
        continue;
      }
      // Cek ulang di dalam transaksi: resep aktif/draft bisa dibuat sejak preview.
      const existing = await tx
        .select({ id: menuRecipes.id })
        .from(menuRecipes)
        .where(and(eq(menuRecipes.menuItemId, r.menuItemId), inArray(menuRecipes.status, ["active", "draft"])))
        .limit(1);
      if (existing.length) continue;
      for (const line of r.lines) {
        await tx
          .insert(menuRecipes)
          .values({ menuItemId: r.menuItemId, variantId: r.variantId, inventorySku: line.sku, qty: line.qty, unit: line.unit, wastePct: 0, status: "draft" })
          .onConflictDoNothing();
      }
      recipesDrafted++;
      await tx
        .insert(masterCrosswalk)
        .values({
          kind: "recipe",
          sourceKey: r.recipeId,
          sourceName: r.excelMenu,
          targetMenuItemId: r.menuItemId,
          targetVariantId: r.variantId,
          status: "draft",
          note: r.skippedLines.length ? `Dilewati: ${r.skippedLines.map((l) => l.materialKey).join(", ")}` : "",
          importId: log.id,
        })
        .onConflictDoUpdate({
          target: [masterCrosswalk.kind, masterCrosswalk.sourceKey],
          set: { targetMenuItemId: r.menuItemId, targetVariantId: r.variantId, status: "draft", importId: log.id, updatedAt: new Date() },
        });
    }

    await tx.insert(auditLogs).values({
      time: new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date()),
      actor: actor.name,
      action: "Impor master Excel",
      object: input.fileName,
      device: "WMS",
      status: "recorded",
      metadata: { importId: log.id, fileHash, materialsCreated, recipesDrafted },
    });
    return { importId: log.id, materialsCreated, recipesDrafted };
  });

  return { ...result, summary: summarize(plan), plan };
}

/** Resep draft per menu + HPP referensi (biaya bahan saat ini). */
export async function listDraftRecipes() {
  const db = getDb();
  const rows = await db
    .select({
      menuItemId: menuRecipes.menuItemId,
      variantId: menuRecipes.variantId,
      sku: menuRecipes.inventorySku,
      qty: menuRecipes.qty,
      unit: menuRecipes.unit,
      wastePct: menuRecipes.wastePct,
      itemName: inventoryItems.name,
      unitCost: inventoryItems.unitCost,
      menuName: menuItems.name,
    })
    .from(menuRecipes)
    .leftJoin(inventoryItems, eq(inventoryItems.sku, menuRecipes.inventorySku))
    .leftJoin(menuItems, eq(menuItems.id, menuRecipes.menuItemId))
    .where(eq(menuRecipes.status, "draft"));
  const prices = await db.select({ itemId: menuVariants.itemId, price: menuVariants.price }).from(menuVariants);
  const byMenu = new Map<string, { menuItemId: string; menuName: string; variantId: string; price: number; referenceHpp: number; lines: Array<{ sku: string; name: string; qty: number; unit: string; unitCost: number; cost: number }> }>();
  for (const r of rows) {
    if (!r.menuItemId || !r.sku) continue;
    const entry =
      byMenu.get(r.menuItemId) ??
      {
        menuItemId: r.menuItemId,
        menuName: r.menuName ?? r.menuItemId,
        variantId: r.variantId,
        price: Math.min(...prices.filter((p) => p.itemId === r.menuItemId).map((p) => Number(p.price))),
        referenceHpp: 0,
        lines: [],
      };
    const unitCost = Number(r.unitCost ?? 0);
    const cost = Number(r.qty) * (1 + Number(r.wastePct) / 100) * unitCost;
    entry.lines.push({ sku: r.sku, name: r.itemName ?? r.sku, qty: Number(r.qty), unit: r.unit, unitCost, cost: Math.round(cost) });
    entry.referenceHpp += cost;
    byMenu.set(r.menuItemId, entry);
  }
  return [...byMenu.values()]
    .map((e) => ({ ...e, referenceHpp: Math.round(e.referenceHpp) }))
    .sort((a, b) => a.menuName.localeCompare(b.menuName));
}

/**
 * Setujui resep draft satu menu → aktif (mulai memotong stok saat jual & masuk
 * HPP varian). Ditolak bila menu sudah punya resep aktif.
 */
export async function approveDraftRecipe(menuItemId: string, actor: MasterImportActor) {
  const result = await runInTx(async (tx) => {
    const lines = await tx
      .select({ id: menuRecipes.id, sku: menuRecipes.inventorySku })
      .from(menuRecipes)
      .where(and(eq(menuRecipes.menuItemId, menuItemId), eq(menuRecipes.status, "draft")))
      .for("update");
    if (!lines.length) throw new MasterImportError("Tidak ada resep draft untuk menu ini.");
    const active = await tx
      .select({ id: menuRecipes.id })
      .from(menuRecipes)
      .where(and(eq(menuRecipes.menuItemId, menuItemId), eq(menuRecipes.status, "active")))
      .limit(1);
    if (active.length) throw new MasterImportError("Menu ini sudah punya resep aktif. Arsipkan resep aktif dulu atau tolak draft.");
    await tx
      .update(menuRecipes)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(menuRecipes.menuItemId, menuItemId), eq(menuRecipes.status, "draft")));
    await tx
      .update(masterCrosswalk)
      .set({ status: "approved", validated: true, updatedAt: new Date() })
      .where(and(eq(masterCrosswalk.kind, "recipe"), eq(masterCrosswalk.targetMenuItemId, menuItemId)));
    await syncRecipeBaseCosts(tx as never, { skus: lines.map((l) => l.sku).filter((s): s is string => Boolean(s)) });
    await tx.insert(auditLogs).values({
      time: new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date()),
      actor: actor.name,
      action: "Resep draft disetujui",
      object: menuItemId,
      device: "WMS",
      status: "recorded",
      metadata: { menuItemId, lines: lines.length, userId: actor.id },
    });
    return { menuItemId, lines: lines.length };
  });
  // Resep aktif baru ikut ke WMS (BOM) untuk laporan & webhook.
  const { syncOsRecipesToWms } = await import("@/lib/wms-bridge");
  await syncOsRecipesToWms();
  return result;
}

/** Tolak resep draft (diarsip, tidak dihapus) dengan alasan. */
export async function rejectDraftRecipe(menuItemId: string, reason: string, actor: MasterImportActor) {
  const note = reason.trim();
  if (note.length < 3) throw new MasterImportError("Alasan penolakan wajib diisi.");
  return runInTx(async (tx) => {
    const rows = await tx
      .update(menuRecipes)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(menuRecipes.menuItemId, menuItemId), eq(menuRecipes.status, "draft")))
      .returning({ id: menuRecipes.id });
    if (!rows.length) throw new MasterImportError("Tidak ada resep draft untuk menu ini.");
    await tx
      .update(masterCrosswalk)
      .set({ status: "skipped", note: `Ditolak: ${note}`, updatedAt: new Date() })
      .where(and(eq(masterCrosswalk.kind, "recipe"), eq(masterCrosswalk.targetMenuItemId, menuItemId)));
    await tx.insert(auditLogs).values({
      time: new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date()),
      actor: actor.name,
      action: "Resep draft ditolak",
      object: menuItemId,
      device: "WMS",
      status: "warning",
      metadata: { menuItemId, reason: note, userId: actor.id },
    });
    return { menuItemId, archived: rows.length };
  });
}
