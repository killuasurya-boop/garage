import { ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getWmsProducts, listWmsSuppliers } from "@/lib/wms-service";
import { assessMasterData } from "@/lib/apex-wms-master-completeness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * APEX Master Data Audit: OWNER only, reads verified DB master records.
 * No mutation, no auto-fill from unverified search, no bank/payment detail leak.
 */
export async function GET() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;

  const [products, suppliers] = await Promise.all([
    getWmsProducts({ warehouseId: "all" }),
    listWmsSuppliers(),
  ]);
  const result = assessMasterData(
    products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      area: p.area,
      unit: p.unit,
      brand: p.brand,
      subcategory: p.subcategory,
      defaultSupplierId: p.defaultSupplierId,
      minStock: Number(p.minStock),
      hpp: Number(p.hpp),
      packPrice: Number(p.packPrice),
      packQty: Number(p.packQty),
      packageLabel: p.packageLabel,
      barcode: p.barcode,
      imageUrl: p.imageUrl,
      uoms: p.uoms.map((u) => ({
        uom: u.uom, factor: Number(u.factor),
        isPurchase: u.isPurchase, isCount: u.isCount,
      })),
    })),
    suppliers.map((s) => ({
      id: s.id, name: s.name,
      phone: s.phone, address: s.address,
      picName: s.picName, areas: s.areas,
      paymentMethod: s.paymentMethod,
      productCount: s.productCount,
      note: s.note,
    })),
    new Date().toISOString(),
  );

  const limit = 100;
  return ok({
    ...result,
    findings: result.findings.slice(0, limit),
    findingsReturned: Math.min(result.findings.length, limit),
    findingsTruncated: result.findings.length > limit,
  });
}
