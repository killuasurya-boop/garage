/**
 * APEX WMS — deterministic, read-only data quality gate.
 *
 * It deliberately NEVER changes stock, PO, supplier, recipe or finance data.
 * It is not an approval policy; a PASS only means the inputs checked here are
 * consistent enough for further human/policy review, NOT permission to execute.
 */
export type ApexSeverity = "critical" | "warning";
export type ApexArea = "procurement" | "inventory" | "recipe" | "opname" | "batch";

export type ApexFinding = {
  id: string;
  code: string;
  area: ApexArea;
  severity: ApexSeverity;
  blocksAutoProcurement: boolean;
  objectId: string;
  evidence: Record<string, string | number | boolean | null>;
  explanation: string;
  action: string;
};

export type ApexSnapshot = {
  dataAsOf: string;
  materials: Array<{
    id: string; sku: string; name: string; onHand: number; unit: string;
  }>;
  reorderSuggestions: Array<{
    productId: string; sku: string; name: string; warehouseId: string;
    warehouseName: string; onHand: number; purchaseQty: number;
    supplierId: string | null; lastPrice: number | null;
  }>;
  purchaseOrders: Array<{
    id: string; doc: string; status: string; total: number; items: number;
  }>;
  margins: Array<{
    menuItemId: string; variantId: string; menuName: string;
    ingredients: number; recipeCost: number;
  }>;
  expiringBatches: Array<{
    batchId: string; batchNo: string; productId: string; sku: string;
    expiredAt: string | null; qty: number;
  }>;
  batchIntegrityGaps: Array<{
    productId: string; warehouseId: string; gap: number;
  }>;
  lossSummary?: {
    grossShortage: number;
    grossSurplus: number;
    accuracyPct: number | null;
    coveragePct: number | null;
  };
};

export function assessApexWmsSnapshot(snapshot: ApexSnapshot) {
  const findings: ApexFinding[] = [];
  const seen = new Set<string>();
  function add(f: ApexFinding) {
    if (seen.has(f.id)) return;
    seen.add(f.id);
    findings.push(f);
  }
  const numbersValid = (a: number[]) => a.every((v) => Number.isFinite(v));
  const matById = new Map(snapshot.materials.map((m) => [m.id, m]));

  for (const p of snapshot.reorderSuggestions) {
    if (!Number.isFinite(p.purchaseQty) || p.purchaseQty <= 0) continue;
    const key = p.productId + ":" + p.warehouseId;

    if (!p.supplierId) {
      add({
        id: "SUPPLIER_MISSING:" + key, code: "SUPPLIER_MISSING",
        area: "procurement", severity: "critical",
        blocksAutoProcurement: true, objectId: key,
        evidence: { sku: p.sku, warehouse: p.warehouseName, purchaseQty: p.purchaseQty },
        explanation: "Saran pembelian belum memiliki supplier terverifikasi.",
        action: "Verifikasi dan pilih supplier sebelum PO diproses.",
      });
    }
    if (p.lastPrice === null || !Number.isFinite(p.lastPrice) || p.lastPrice <= 0) {
      add({
        id: "PRICE_UNVERIFIED:" + key, code: "PRICE_UNVERIFIED",
        area: "procurement", severity: "critical",
        blocksAutoProcurement: true, objectId: key,
        evidence: { sku: p.sku, lastPrice: p.lastPrice, purchaseQty: p.purchaseQty },
        explanation: "Harga satuan pembelian tidak valid atau belum terverifikasi.",
        action: "Cocokkan penawaran harga dan satuan kemasan dengan supplier.",
      });
    }
    if (!numbersValid([p.onHand, p.purchaseQty]) || p.onHand < 0) {
      add({
        id: "INVALID_REORDER_QTY:" + key, code: "INVALID_REORDER_QTY",
        area: "inventory", severity: "critical",
        blocksAutoProcurement: true, objectId: key,
        evidence: { sku: p.sku, sourceQty: p.onHand, purchaseQty: p.purchaseQty },
        explanation: "Kuantitas stok/saran pembelian tidak valid.",
        action: "Rekonsiliasi ledger dan satuan sebelum membuat PO.",
      });
    }
    const aggregate = matById.get(p.productId);
    if (aggregate && Number.isFinite(aggregate.onHand) && aggregate.onHand > p.onHand) {
      add({
        id: "CROSS_WAREHOUSE_REVIEW:" + key, code: "CROSS_WAREHOUSE_REVIEW",
        area: "inventory", severity: "warning",
        blocksAutoProcurement: true, objectId: key,
        evidence: {
          sku: p.sku, roomOnHand: p.onHand,
          allWarehouseOnHand: aggregate.onHand, purchaseQty: p.purchaseQty,
        },
        explanation: "Stok gabungan lebih besar dari stok ruang tujuan; perpindahan mungkin lebih tepat daripada pembelian.",
        action: "Periksa ketersediaan, area, batch, reservasi dan izin transfer antar-ruang.",
      });
    }
  }

  for (const po of snapshot.purchaseOrders) {
    if (po.status === "cancelled" || po.status === "received") continue;
    if (!Number.isFinite(po.total) || po.total <= 0 || po.items <= 0) {
      add({
        id: "PO_VALUE_UNVERIFIED:" + po.id, code: "PO_VALUE_UNVERIFIED",
        area: "procurement", severity: "critical",
        blocksAutoProcurement: true, objectId: po.id,
        evidence: { doc: po.doc, status: po.status, total: po.total, items: po.items },
        explanation: "PO aktif/draft bernilai nol, tidak valid, atau tanpa item.",
        action: "Baca setiap baris PO; validasi harga/satuan sebelum submit/approve/send.",
      });
    }
  }

  let missingRecipeVariants = 0;
  for (const m of snapshot.margins) {
    if (m.ingredients > 0 && Number.isFinite(m.recipeCost) && m.recipeCost > 0) continue;
    missingRecipeVariants++;
    add({
      id: "RECIPE_COST_UNVERIFIED:" + m.menuItemId + ":" + m.variantId,
      code: "RECIPE_COST_UNVERIFIED", area: "recipe", severity: "warning",
      blocksAutoProcurement: false, objectId: m.menuItemId + ":" + m.variantId,
      evidence: { menu: m.menuName, ingredients: m.ingredients, recipeCost: m.recipeCost },
      explanation: "Margin menu tidak dapat dianggap valid karena resep/HPP tidak lengkap.",
      action: "Verifikasi BOM/resep aktif, takaran bahan, serta HPP sebelum publikasi margin.",
    });
  }

  for (const batch of snapshot.expiringBatches) {
    if (batch.qty <= 0) continue;
    const expiryTime = batch.expiredAt ? Date.parse(batch.expiredAt) : NaN;
    if (!Number.isFinite(expiryTime)) {
      add({
        id: "BATCH_EXPIRY_UNKNOWN:" + batch.batchId, code: "BATCH_EXPIRY_UNKNOWN",
        area: "batch", severity: "warning", blocksAutoProcurement: false,
        objectId: batch.batchId,
        evidence: { sku: batch.sku, batch: batch.batchNo, qty: batch.qty },
        explanation: "Tanggal batch tidak valid.",
        action: "Verifikasi label kemasan asli dan dokumen penerimaan.",
      });
      continue;
    }
    if (expiryTime <= Date.parse(snapshot.dataAsOf)) {
      add({
        id: "BATCH_EXPIRY_REVIEW:" + batch.batchId, code: "BATCH_EXPIRY_REVIEW",
        area: "batch", severity: "warning", blocksAutoProcurement: false,
        objectId: batch.batchId,
        evidence: { sku: batch.sku, batch: batch.batchNo, qty: batch.qty, expiredAt: batch.expiredAt },
        explanation: "Tanggal batch sudah lewat menurut sistem; data batch INIT harus divalidasi sebelum dinyatakan waste.",
        action: "Periksa kemasan dan kondisi fisik, pisahkan bila tidak layak; catat waste melalui alur resmi.",
      });
    }
  }

  for (const gap of snapshot.batchIntegrityGaps) {
    if (!Number.isFinite(gap.gap) || Math.abs(gap.gap) < 0.00005) continue;
    add({
      id: "BATCH_LEDGER_GAP:" + gap.productId + ":" + gap.warehouseId,
      code: "BATCH_LEDGER_GAP", area: "inventory",
      severity: "critical", blocksAutoProcurement: true,
      objectId: gap.productId + ":" + gap.warehouseId,
      evidence: { ledgerBatchGap: gap.gap },
      explanation: "Kuantitas batch dan saldo ruang tidak cocok.",
      action: "Audit mutasi, bukan edit saldo langsung; gunakan workflow integritas yang diotorisasi Owner.",
    });
  }

  if (snapshot.lossSummary && snapshot.lossSummary.grossShortage > 0) {
    add({
      id: "OPNAME_GROSS_VARIANCE:" + snapshot.dataAsOf.slice(0, 10),
      code: "OPNAME_GROSS_VARIANCE", area: "opname", severity: "warning",
      blocksAutoProcurement: false, objectId: "periodic-loss",
      evidence: {
        grossShortage: snapshot.lossSummary.grossShortage,
        grossSurplus: snapshot.lossSummary.grossSurplus,
        countAccuracyPct: snapshot.lossSummary.accuracyPct,
        countCoveragePct: snapshot.lossSummary.coveragePct,
      },
      explanation: "Kekurangan opname adalah eksposur bruto, BUKAN kerugian yang sudah dikonfirmasi.",
      action: "Cocokkan hitung ulang, konversi satuan, transfer, waste dan ledger sebelum kesimpulan.",
    });
  }

  const severityWeight = { critical: 2, warning: 1 };
  findings.sort((a, b) =>
    severityWeight[b.severity] - severityWeight[a.severity] ||
    a.code.localeCompare(b.code) || a.objectId.localeCompare(b.objectId)
  );

  const blockers = findings.filter((f) => f.blocksAutoProcurement);
  return {
    state: blockers.length ? "BLOCKED" as const : findings.length ? "WARN" as const : "PASS" as const,
    source: "Garage OS database (WMS/POS source-of-truth)",
    dataAsOf: snapshot.dataAsOf,
    dataGatePass: blockers.length === 0,
    executionAuthorized: false as const,
    note: "PASS tidak memberikan izin auto-approval; server tetap wajib memeriksa delegasi Owner, R2/R3, dan konfirmasi.",
    metrics: {
      materials: snapshot.materials.length,
      purchaseSuggestions: snapshot.reorderSuggestions.length,
      purchaseOrders: snapshot.purchaseOrders.length,
      marginVariants: snapshot.margins.length,
      missingRecipeVariants,
      expiredOrNearExpiryBatches: snapshot.expiringBatches.length,
      batchIntegrityGaps: snapshot.batchIntegrityGaps.length,
      findings: findings.length,
      autoProcurementBlockers: blockers.length,
    },
    findings,
  };
}
