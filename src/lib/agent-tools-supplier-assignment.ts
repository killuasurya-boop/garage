// Penetapan supplier utama pada bahan Dapur yang sudah ada.
// Khusus master WMS: tidak mengubah stok, ledger, POS, resep, ataupun harga.
// Di MCP ChatGPT, perubahan massal wajib preview + konfirmasi Owner (R2).
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { wmsProduct, wmsSupplier } from "@/db/schema";
import { AgentToolError, type AgentTool } from "@/lib/agent-tool-core";
import { summaryHashOf } from "@/lib/step-up-totp";
import { runInTx, updateWmsProduct } from "@/lib/wms-service";
import type { GarageSession } from "@/lib/server-auth";

type Db = ReturnType<typeof getDb>;
type AssignmentInput = { supplierId: string; skus: string[]; alasan: string };

const input = z.object({
  supplierId: z.string().uuid().describe("ID supplier Dapur yang sudah terdaftar."),
  skus: z.array(z.string().trim().regex(/^KIT-\d{3}$/))
    .min(1).max(50)
    .refine((value) => new Set(value).size === value.length, "SKU tidak boleh berulang."),
  alasan: z.string().trim().min(5).max(300),
});

function ensureOwner(session: GarageSession) {
  if (session.profile.role !== "Owner") {
    throw new AgentToolError("FORBIDDEN", "Penetapan supplier massal hanya dapat disetujui Owner.", 403);
  }
}

async function inspect(db: Db, args: AssignmentInput, lockRows = false) {
  const [supplier] = await db.select({
    id: wmsSupplier.id,
    name: wmsSupplier.name,
    areas: wmsSupplier.areas,
    archivedAt: wmsSupplier.archivedAt,
  }).from(wmsSupplier).where(eq(wmsSupplier.id, args.supplierId)).limit(1);

  if (!supplier || supplier.archivedAt) {
    throw new AgentToolError("SUPPLIER_NOT_ACTIVE", "Supplier tidak ditemukan atau sudah diarsipkan.", 409);
  }
  if (!supplier.areas.includes("dapur")) {
    throw new AgentToolError("SUPPLIER_AREA_MISMATCH", "Supplier belum terdaftar untuk area Dapur.", 409);
  }

  const query = db.select({
    id: wmsProduct.id,
    sku: wmsProduct.sku,
    name: wmsProduct.name,
    category: wmsProduct.category,
    archivedAt: wmsProduct.archivedAt,
    defaultSupplierId: wmsProduct.defaultSupplierId,
  }).from(wmsProduct).where(inArray(wmsProduct.sku, args.skus));

  // Kunci baris saat commit agar perubahan supplier lain tak tertimpa.
  const products = lockRows ? await query.for("update") : await query;
  const found = new Set(products.map((p) => p.sku));
  const missing = args.skus.filter((sku) => !found.has(sku));
  if (missing.length) {
    throw new AgentToolError("MATERIAL_NOT_FOUND", `SKU tidak ditemukan: ${missing.join(", ")}`, 404);
  }

  for (const row of products) {
    if (row.archivedAt || !row.category.startsWith("Dapur · ") || row.category === "Dapur · Gas & Kebersihan") {
      throw new AgentToolError("MATERIAL_NOT_ELIGIBLE", `SKU ${row.sku} bukan bahan Dapur yang memenuhi syarat.`, 409);
    }
    if (row.defaultSupplierId && row.defaultSupplierId !== supplier.id) {
      throw new AgentToolError("SUPPLIER_CONFLICT", `SKU ${row.sku} sudah punya supplier lain; penetapan massal tidak akan menimpanya.`, 409);
    }
  }

  return {
    supplier: { id: supplier.id, name: supplier.name },
    products: products.sort((a, b) => a.sku.localeCompare(b.sku)),
    akanDiubah: products.filter((p) => !p.defaultSupplierId),
    sudahSesuai: products.filter((p) => p.defaultSupplierId === supplier.id),
  };
}

export const supplierAssignmentTools: AgentTool[] = [{
  name: "garage_assign_kitchen_suppliers",
  title: "Lengkapi supplier utama bahan Dapur",
  description: "Pasangkan 1 supplier Dapur ke 1–50 SKU bahan Dapur yang belum mempunyai supplier. Hanya Owner; preview dan konfirmasi wajib. Tidak mengubah stok/POS/resep, tidak menimpa supplier berbeda, dan tidak mencakup LPG/barang kebersihan ataupun produk terbatas.",
  write: true,
  domain: "gudang",
  risk: "R2",
  confirmOnly: true,
  permission: "inventory:write",
  input,
  async preview(session, raw) {
    ensureOwner(session);
    const args = raw as AssignmentInput;
    const result = await inspect(getDb(), args);
    return {
      aksi: "Tetapkan supplier utama bahan Dapur (tanpa stok)",
      supplier: result.supplier.name,
      jumlahDiminta: args.skus.length,
      akanDiubah: result.akanDiubah.map((p) => ({ sku: p.sku, nama: p.name })),
      sudahSesuai: result.sudahSesuai.map((p) => p.sku),
      alasan: args.alasan,
      peringatan: "Hanya relasi master supplier. Tidak ada barang diterima, pembelian, transaksi POS, resep, harga, atau stok yang berubah.",
    };
  },
  async run(session, raw) {
    ensureOwner(session);
    const args = raw as AssignmentInput;
    return runInTx(async (tx) => {
      const result = await inspect(tx, args, true);
      const sebelum = result.products.map((p) => ({ sku: p.sku, supplierId: p.defaultSupplierId }));
      for (const material of result.akanDiubah) {
        await updateWmsProduct(
          material.id,
          { defaultSupplierId: result.supplier.id },
          tx,
          { userId: session.user.id, name: session.user.name ?? null, strict: true },
        );
      }
      const after = await tx.select({
        sku: wmsProduct.sku,
        supplierId: wmsProduct.defaultSupplierId,
      }).from(wmsProduct).where(inArray(wmsProduct.sku, args.skus));
      if (after.length !== args.skus.length || after.some((x) => x.supplierId !== result.supplier.id)) {
        throw new AgentToolError("VERIFY_FAILED", "Pemeriksaan ulang gagal; transaksi dibatalkan.", 409);
      }
      return {
        tersimpan: true,
        supplier: result.supplier.name,
        diperbarui: result.akanDiubah.map((p) => p.sku),
        sudahSesuai: result.sudahSesuai.map((p) => p.sku),
        verifikasi: { cocok: after.length, total: args.skus.length },
        bukti: { sebelum: summaryHashOf(sebelum), sesudah: summaryHashOf(after) },
      };
    });
  },
}];
