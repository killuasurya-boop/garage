import { readXlsxSheets, sheetRecords } from "@/lib/master-workbook";

// =============================================================================
// Impor master Excel Garage Coffee (v3.1+) → rencana (preview) yang bisa
// diaudit. Aturan owner (Okt 2026):
// - Identitas produk, harga jual & kategori POS TIDAK pernah diubah/dibuat.
// - Bahan baru hanya DITAMBAH (SKU yang sudah ada tidak ditimpa); harga/isi
//   bahan Garage yang sudah ada dipertahankan — selisih dilaporkan.
// - Resep Dapur masuk sebagai DRAFT (tidak memotong stok) sampai disetujui.
// - Bahan virtual/allowance (V-*) bukan stok → tidak diimpor.
// Modul ini murni (tanpa DB) supaya bisa diuji dengan workbook asli.
// =============================================================================

export type MasterMaterial = {
  key: string;
  station: string;
  name: string;
  baseUnit: string;
  packQty: number | null;
  packPriceModel: number | null;
  unitCost: number | null;
  confidence: string;
  note: string;
  sourceUnit: string;
  row: number;
};

export type MasterRecipeLine = {
  recipeId: string;
  menu: string;
  station: string;
  materialKey: string;
  qty: number;
  unit: string;
  confidence: string;
  row: number;
};

export type MasterPosRow = {
  posSku: string;
  name: string;
  station: string;
  variant: string;
  price: number | null;
  recipeLink: string;
  row: number;
};

export type MasterWorkbookData = {
  sheetNames: string[];
  materials: MasterMaterial[];
  recipeLines: MasterRecipeLine[];
  posRegister: MasterPosRow[];
  warnings: string[];
};

const num = (raw: string) => {
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function parseMasterWorkbook(buf: Buffer): MasterWorkbookData {
  const sheets = readXlsxSheets(buf);
  const warnings: string[] = [];
  const pick = (...names: string[]) => {
    for (const name of names) {
      const hit = [...sheets.keys()].find((s) => s.trim().toLowerCase() === name.toLowerCase());
      if (hit) return sheets.get(hit);
    }
    return undefined;
  };

  const materials: MasterMaterial[] = [];
  const bahanRows = pick("Master Bahan");
  if (!bahanRows) warnings.push('Sheet "Master Bahan" tidak ditemukan.');
  for (const r of sheetRecords(bahanRows, "Key/SKU")) {
    const key = r.get("Key/SKU");
    if (!/^[A-Z]/.test(key) || key.includes(" ")) continue;
    materials.push({
      key,
      station: r.get("Station"),
      name: r.get("Nama Bahan"),
      baseUnit: r.get("Unit Dasar"),
      packQty: num(r.get("Isi Paket Normalisasi")),
      packPriceModel: num(r.get("Harga Paket Model")),
      unitCost: num(r.get("HPP per Unit")),
      confidence: r.get("Confidence").toUpperCase(),
      note: r.get("Catatan Audit"),
      sourceUnit: r.get("Satuan Sumber"),
      row: r.row,
    });
  }

  const recipeLines: MasterRecipeLine[] = [];
  const detailRows = pick("Recipe Detail");
  if (!detailRows) warnings.push('Sheet "Recipe Detail" tidak ditemukan.');
  for (const r of sheetRecords(detailRows, "Recipe ID")) {
    const recipeId = r.get("Recipe ID");
    const qty = num(r.get("Qty per Porsi"));
    if (!/^[A-Z]{2}-\d+$/.test(recipeId) || qty === null) continue;
    recipeLines.push({
      recipeId,
      menu: r.get("Menu"),
      station: r.get("Station"),
      materialKey: r.get("Material Key"),
      qty,
      unit: r.get("Unit Resep"),
      confidence: r.get("Confidence").toUpperCase(),
      row: r.row,
    });
  }

  const posRegister: MasterPosRow[] = [];
  const posRows = pick("POS Menu Register");
  if (!posRows) warnings.push('Sheet "POS Menu Register" tidak ditemukan.');
  for (const r of sheetRecords(posRows, "POS SKU")) {
    const posSku = r.get("POS SKU");
    if (!/^POS-\d+$/.test(posSku)) continue;
    posRegister.push({
      posSku,
      name: r.get("Nama Menu POS"),
      station: r.get("Station"),
      variant: r.get("Varian"),
      price: num(r.get("Harga POS Aktif")),
      recipeLink: r.get("Menu HPP Link"),
      row: r.row,
    });
  }

  return { sheetNames: [...sheets.keys()], materials, recipeLines, posRegister, warnings };
}

// ---------------------------------------------------------------------------
// Rencana impor
// ---------------------------------------------------------------------------

export type CurrentMaterial = {
  sku: string;
  name: string;
  usageArea: string;
  unit: string;
  packageQty: number;
  purchasePrice: number;
  unitCost: number;
};

export type CurrentMenu = {
  id: string;
  name: string;
  category: string;
  status: string;
  variants: Array<{ variantId: string; label: string; price: number }>;
};

export type CurrentState = {
  materials: CurrentMaterial[];
  menus: CurrentMenu[];
  /** `${menuItemId}:${variantId}` → sku → qty (resep AKTIF). */
  activeRecipes: Map<string, Map<string, number>>;
  /** menuItemId yang sudah punya resep draft. */
  draftRecipeMenuIds: Set<string>;
};

export type PlannedMaterial = {
  sku: string;
  name: string;
  unit: string;
  packQty: number;
  packPrice: number;
  unitCost: number;
  category: string;
  validated: boolean;
  note: string;
};

export type PlannedRecipe = {
  recipeId: string;
  excelMenu: string;
  posSku: string | null;
  menuItemId: string | null;
  menuName: string | null;
  variantId: string | null;
  status: "new_draft" | "has_active" | "has_draft" | "menu_not_found" | "no_lines";
  lines: Array<{ sku: string; qty: number; unit: string; unitCost: number; lowConfidence: boolean }>;
  skippedLines: Array<{ materialKey: string; qty: number; unit: string; reason: string }>;
  referenceHpp: number;
};

export type MasterImportPlan = {
  materials: {
    toCreate: PlannedMaterial[];
    alreadyExists: Array<{ sku: string; name: string }>;
    nameConflicts: Array<{ key: string; excelName: string; existingSku: string; existingName: string }>;
    virtualSkipped: Array<{ key: string; name: string }>;
    barDifferences: Array<{ excelKey: string; sku: string; name: string; field: string; excel: string; garage: string }>;
  };
  recipes: PlannedRecipe[];
  barRecipeDifferences: Array<{ recipeId: string; menu: string; variant: string; detail: string }>;
  posReconciliation: {
    excelNotInGarage: Array<{ posSku: string; name: string; variant: string; price: number | null }>;
    garageNotInExcel: Array<{ menuItemId: string; name: string; category: string }>;
    priceDifferences: Array<{ posSku: string; name: string; variant: string; excel: number; garage: number }>;
  };
  warnings: string[];
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Satuan resep/bahan Excel → satuan Garage. */
export function garageUnit(unit: string) {
  const u = unit.trim().toLowerCase().replace(/\*$/, "");
  if (u === "g" || u === "gram" || u === "gr") return "gr";
  if (u === "ml") return "ml";
  if (u === "pcs" || u === "pc") return "pcs";
  return u;
}

/** BAR-9NN di workbook = BAR-0NN di Garage (urutan bahan bar sama, 1:1). */
export function excelKeyToGarageSku(key: string) {
  const bar = key.match(/^BAR-9(\d{2})$/);
  if (bar) return `BAR-0${bar[1]}`;
  return key;
}

function kitchenCategory(name: string) {
  return /sunlight|sabun|gas/i.test(name) ? "Dapur · Gas & Kebersihan" : "Dapur · Bahan Baku";
}

function variantFor(menu: CurrentMenu, label: string) {
  const l = label.trim().toLowerCase();
  if (l === "cold" || l === "hot") return menu.variants.find((v) => v.variantId === l || v.label.toLowerCase() === l) ?? null;
  return menu.variants.length === 1 ? menu.variants[0] : null;
}

export function planMasterImport(data: MasterWorkbookData, current: CurrentState): MasterImportPlan {
  const warnings = [...data.warnings];
  const bySku = new Map(current.materials.map((m) => [m.sku, m]));
  // Nama sama hanya dianggap bentrok di area yang sama (Gula bar = sirup ml,
  // gula dapur = gula pasir gr → bahan berbeda).
  const byName = new Map(
    current.materials.filter((m) => m.usageArea === "dapur").map((m) => [norm(m.name), m]),
  );

  const toCreate: PlannedMaterial[] = [];
  const alreadyExists: MasterImportPlan["materials"]["alreadyExists"] = [];
  const nameConflicts: MasterImportPlan["materials"]["nameConflicts"] = [];
  const virtualSkipped: MasterImportPlan["materials"]["virtualSkipped"] = [];
  const barDifferences: MasterImportPlan["materials"]["barDifferences"] = [];
  const seenKeys = new Set<string>();

  for (const m of data.materials) {
    if (seenKeys.has(m.key)) {
      warnings.push(`Kode bahan ganda di Excel: ${m.key} (baris ${m.row}) — baris kedua diabaikan.`);
      continue;
    }
    seenKeys.add(m.key);
    if (m.key.startsWith("V-")) {
      virtualSkipped.push({ key: m.key, name: m.name });
      continue;
    }
    const sku = excelKeyToGarageSku(m.key);
    const existing = bySku.get(sku);
    if (existing) {
      alreadyExists.push({ sku, name: existing.name });
      if (sku.startsWith("BAR-")) {
        if (m.packQty !== null && Math.abs(m.packQty - existing.packageQty) > 0.0001) {
          barDifferences.push({ excelKey: m.key, sku, name: existing.name, field: "Isi kemasan", excel: String(m.packQty), garage: String(existing.packageQty) });
        }
        if (m.packPriceModel !== null && Math.abs(m.packPriceModel - existing.purchasePrice) > 0.5) {
          barDifferences.push({ excelKey: m.key, sku, name: existing.name, field: "Harga kemasan", excel: String(m.packPriceModel), garage: String(existing.purchasePrice) });
        }
      }
      continue;
    }
    const sameName = byName.get(norm(m.name));
    if (sameName) {
      // Nama sama tapi SKU beda: jangan menebak (hindari pencocokan nama saja).
      nameConflicts.push({ key: m.key, excelName: m.name, existingSku: sameName.sku, existingName: sameName.name });
      continue;
    }
    if (!m.key.startsWith("KIT-")) {
      warnings.push(`Bahan ${m.key} (${m.name}) tidak dikenal polanya — tidak diimpor.`);
      continue;
    }
    const packQty = m.packQty && m.packQty > 0 ? m.packQty : 1;
    const packPrice = m.packPriceModel ?? 0;
    const hasContent = Boolean(m.packQty && m.packQty > 0);
    const unit = hasContent ? garageUnit(m.baseUnit) : garageUnit(m.sourceUnit || m.baseUnit);
    toCreate.push({
      sku,
      name: m.name.trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase()),
      unit,
      packQty,
      packPrice,
      unitCost: Math.round((packPrice / packQty) * 10_000) / 10_000,
      category: kitchenCategory(m.name),
      validated: m.confidence !== "LOW" && hasContent,
      note: hasContent ? m.note : `Isi kemasan tidak tercatat — biaya per ${unit}. ${m.note}`.trim(),
    });
  }

  // --- Peta resep Excel → menu Garage lewat POS Menu Register ---
  const menusByName = new Map<string, CurrentMenu[]>();
  for (const menu of current.menus) {
    const key = norm(menu.name);
    menusByName.set(key, [...(menusByName.get(key) ?? []), menu]);
  }
  const linkRows = new Map<string, MasterPosRow[]>();
  for (const p of data.posRegister) {
    if (!/^[A-Z]{2}-\d+$/.test(p.recipeLink)) continue;
    linkRows.set(p.recipeLink, [...(linkRows.get(p.recipeLink) ?? []), p]);
  }
  const resolvePos = (p: MasterPosRow) => {
    const candidates = menusByName.get(norm(p.name)) ?? [];
    if (candidates.length !== 1) return null;
    const menu = candidates[0];
    const variant = variantFor(menu, p.variant);
    return variant ? { menu, variant } : null;
  };

  const plannedSkus = new Map(toCreate.map((m) => [m.sku, m]));
  const costOf = (sku: string) => plannedSkus.get(sku)?.unitCost ?? bySku.get(sku)?.unitCost ?? null;

  const recipes: PlannedRecipe[] = [];
  const barRecipeDifferences: MasterImportPlan["barRecipeDifferences"] = [];
  const recipeIds = [...new Set(data.recipeLines.map((l) => l.recipeId))];
  for (const recipeId of recipeIds) {
    const lines = data.recipeLines.filter((l) => l.recipeId === recipeId);
    const posRows = linkRows.get(recipeId) ?? [];

    if (recipeId.startsWith("BR-")) {
      // Resep bar Garage sudah aktif (owner Sep 2026) → hanya laporan selisih.
      for (const p of posRows) {
        const hit = resolvePos(p);
        if (!hit) continue;
        const active =
          current.activeRecipes.get(`${hit.menu.id}:${hit.variant.variantId}`) ??
          current.activeRecipes.get(`${hit.menu.id}:all`);
        if (!active) {
          barRecipeDifferences.push({ recipeId, menu: hit.menu.name, variant: hit.variant.label, detail: "Garage belum punya resep aktif untuk varian ini." });
          continue;
        }
        const excel = new Map<string, number>();
        for (const l of lines) {
          if (l.materialKey.startsWith("V-")) continue;
          const sku = excelKeyToGarageSku(l.materialKey);
          excel.set(sku, (excel.get(sku) ?? 0) + l.qty);
        }
        const diffs: string[] = [];
        for (const [sku, qty] of excel) {
          const g = active.get(sku);
          if (g === undefined) diffs.push(`${sku} ${qty} hanya di Excel`);
          else if (Math.abs(g - qty) > 0.0001) diffs.push(`${sku} Excel ${qty} vs Garage ${g}`);
        }
        for (const [sku, qty] of active) if (!excel.has(sku)) diffs.push(`${sku} ${qty} hanya di Garage`);
        if (diffs.length) barRecipeDifferences.push({ recipeId, menu: hit.menu.name, variant: hit.variant.label, detail: diffs.join("; ") });
      }
      continue;
    }

    const pos = posRows[0] ?? null;
    const hit = pos ? resolvePos(pos) : null;
    const planned: PlannedRecipe = {
      recipeId,
      excelMenu: lines[0]?.menu ?? recipeId,
      posSku: pos?.posSku ?? null,
      menuItemId: hit?.menu.id ?? null,
      menuName: hit?.menu.name ?? null,
      variantId: hit ? (hit.menu.variants.length === 1 ? "all" : hit.variant.variantId) : null,
      status: "new_draft",
      lines: [],
      skippedLines: [],
      referenceHpp: 0,
    };
    const merged = new Map<string, { qty: number; unit: string; low: boolean }>();
    for (const l of lines) {
      if (l.materialKey.startsWith("V-")) {
        planned.skippedLines.push({ materialKey: l.materialKey, qty: l.qty, unit: l.unit, reason: "Allowance/virtual — bukan stok" });
        continue;
      }
      const sku = excelKeyToGarageSku(l.materialKey);
      if (costOf(sku) === null) {
        planned.skippedLines.push({ materialKey: l.materialKey, qty: l.qty, unit: l.unit, reason: "Bahan tidak ada di Garage / tidak diimpor" });
        continue;
      }
      const prev = merged.get(sku);
      merged.set(sku, {
        qty: (prev?.qty ?? 0) + l.qty,
        unit: garageUnit(l.unit),
        low: Boolean(prev?.low) || l.confidence === "LOW",
      });
    }
    for (const [sku, v] of merged) {
      const unitCost = costOf(sku) ?? 0;
      planned.lines.push({ sku, qty: Math.round(v.qty * 10_000) / 10_000, unit: v.unit, unitCost, lowConfidence: v.low });
      planned.referenceHpp += v.qty * unitCost;
    }
    planned.referenceHpp = Math.round(planned.referenceHpp);
    if (!hit) planned.status = "menu_not_found";
    else if (planned.lines.length === 0) planned.status = "no_lines";
    else if (
      [...current.activeRecipes.keys()].some((k) => k.startsWith(`${hit.menu.id}:`))
    )
      planned.status = "has_active";
    else if (current.draftRecipeMenuIds.has(hit.menu.id)) planned.status = "has_draft";
    recipes.push(planned);
  }

  // --- Rekonsiliasi POS dua arah (hanya laporan) ---
  const excelNotInGarage: MasterImportPlan["posReconciliation"]["excelNotInGarage"] = [];
  const priceDifferences: MasterImportPlan["posReconciliation"]["priceDifferences"] = [];
  const matchedMenuIds = new Set<string>();
  for (const p of data.posRegister) {
    const hit = resolvePos(p);
    if (!hit) {
      excelNotInGarage.push({ posSku: p.posSku, name: p.name, variant: p.variant, price: p.price });
      continue;
    }
    matchedMenuIds.add(hit.menu.id);
    if (p.price !== null && p.price !== hit.variant.price) {
      priceDifferences.push({ posSku: p.posSku, name: p.name, variant: p.variant, excel: p.price, garage: hit.variant.price });
    }
  }
  const garageNotInExcel = current.menus
    .filter((m) => m.status === "active" && !matchedMenuIds.has(m.id))
    .map((m) => ({ menuItemId: m.id, name: m.name, category: m.category }));

  return {
    materials: { toCreate, alreadyExists, nameConflicts, virtualSkipped, barDifferences },
    recipes,
    barRecipeDifferences,
    posReconciliation: { excelNotInGarage, garageNotInExcel, priceDifferences },
    warnings,
  };
}
