// WMS Activity Log — audit siapa melakukan perpindahan stok kapan.
// Data source: wms_stock_movement (single source of truth per komentar schema).
// Owner/Manajer bisa akses semua; Kasir (pegang tugas gudang) lihat aktivitas
// sendiri saja.

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  user,
  wmsProduct,
  wmsStockMovement,
  wmsWarehouse,
} from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { isCalendarDateKey } from "@/lib/date-range";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const role = session.data!.profile.role;
  const isManager = (MANAGEMENT_ROLES as readonly string[]).includes(role);
  const isKasir = role === "Kasir";

  if (!isManager && !isKasir) {
    return fail(403, "FORBIDDEN", "Hanya role warehouse / manajerial yang boleh akses log ini.");
  }

  const url = new URL(request.url);
  const filterUserId = url.searchParams.get("userId");
  const filterType = url.searchParams.get("type");
  const filterWarehouseId = url.searchParams.get("warehouseId");
  const filterProductId = url.searchParams.get("productId");
  const fromDate = url.searchParams.get("from"); // YYYY-MM-DD
  const toDate = url.searchParams.get("to"); // YYYY-MM-DD
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);

  const db = getDb();

  const conditions = [];
  // Kasir (bukan manajerial) → hanya lihat aktivitas sendiri (privacy).
  if (isKasir && !isManager) {
    conditions.push(eq(wmsStockMovement.userId, session.data!.user.id));
  } else if (filterUserId) {
    conditions.push(eq(wmsStockMovement.userId, filterUserId));
  }
  if (filterType) conditions.push(eq(wmsStockMovement.type, filterType));
  if (filterWarehouseId) conditions.push(eq(wmsStockMovement.warehouseId, filterWarehouseId));
  if (filterProductId) conditions.push(eq(wmsStockMovement.productId, filterProductId));
  if ((fromDate && !isCalendarDateKey(fromDate)) || (toDate && !isCalendarDateKey(toDate))) {
    return fail(400, "INVALID_DATE", "Tanggal tidak valid (YYYY-MM-DD).");
  }
  if (fromDate && toDate && fromDate > toDate) {
    return fail(400, "INVALID_RANGE", "Tanggal mulai harus sebelum tanggal akhir.");
  }
  if (fromDate) {
    conditions.push(gte(wmsStockMovement.createdAt, new Date(`${fromDate}T00:00:00+07:00`)));
  }
  if (toDate) {
    // Akhir hari inklusif: < awal hari berikutnya (bukan 23:59:59 yang melewatkan milidetik terakhir).
    conditions.push(lt(wmsStockMovement.createdAt, new Date(new Date(`${toDate}T00:00:00+07:00`).getTime() + 86_400_000)));
  }

  try {
    const rows = await db
      .select({
        id: wmsStockMovement.id,
        createdAt: wmsStockMovement.createdAt,
        type: wmsStockMovement.type,
        qty: wmsStockMovement.qty,
        valueHpp: wmsStockMovement.valueHpp,
        refDoc: wmsStockMovement.refDoc,
        productId: wmsStockMovement.productId,
        productName: wmsProduct.name,
        productSku: wmsProduct.sku,
        warehouseId: wmsStockMovement.warehouseId,
        warehouseName: wmsWarehouse.name,
        userId: wmsStockMovement.userId,
        userName: user.name,
      })
      .from(wmsStockMovement)
      .leftJoin(wmsProduct, eq(wmsProduct.id, wmsStockMovement.productId))
      .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsStockMovement.warehouseId))
      .leftJoin(user, eq(user.id, wmsStockMovement.userId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(wmsStockMovement.createdAt))
      .limit(limit);

    // Agregat per staff (untuk cek performa)
    const agg = await db
      .select({
        userId: wmsStockMovement.userId,
        userName: user.name,
        totalAksi: sql<number>`COUNT(*)`,
        totalIn: sql<number>`COALESCE(SUM(CASE WHEN ${wmsStockMovement.type} = 'in' THEN ${wmsStockMovement.qty} ELSE 0 END), 0)`,
        totalOut: sql<number>`COALESCE(SUM(CASE WHEN ${wmsStockMovement.type} = 'out' THEN ${wmsStockMovement.qty} ELSE 0 END), 0)`,
        totalTransfer: sql<number>`COALESCE(SUM(CASE WHEN ${wmsStockMovement.type} = 'transfer' THEN ${wmsStockMovement.qty} ELSE 0 END), 0)`,
        totalWaste: sql<number>`COALESCE(SUM(CASE WHEN ${wmsStockMovement.type} = 'waste' THEN ${wmsStockMovement.qty} ELSE 0 END), 0)`,
        totalAdjustment: sql<number>`COALESCE(SUM(CASE WHEN ${wmsStockMovement.type} = 'adjustment' THEN ${wmsStockMovement.qty} ELSE 0 END), 0)`,
      })
      .from(wmsStockMovement)
      .leftJoin(user, eq(user.id, wmsStockMovement.userId))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(wmsStockMovement.userId, user.name)
      .orderBy(desc(sql`COUNT(*)`));

    return ok({
      viewerRole: role,
      viewerScope: isKasir && !isManager ? "self" : "all",
      count: rows.length,
      rows,
      byStaff: agg,
    });
  } catch (err) {
    return fail(500, "ACTIVITY_LOG_FAILED", (err as Error).message);
  }
}
