// =============================================================================
// M3c — tool MCP domain Produk & Harga (PRD V4.0 §04 domain 5, D-01).
// Harga diubah per varian lewat `updateVariantPrice` (hanya kolom harga; varian,
// SKU, resep & HPP tetap). Aksi produk memakai `bulkProductAction` yang sama
// dengan katalog (audit per produk). R2 hanya jalan setelah preview + konfirmasi.
// =============================================================================
import { z } from "zod";

import { AgentToolError, rupiah, type AgentTool } from "@/lib/agent-tool-core";
import { CATALOG_BULK_ACTIONS } from "@/lib/product-catalog-types";
import type { GarageSession } from "@/lib/server-auth";

function assertOwnerOrManager(session: GarageSession) {
  if (session.profile.role !== "Owner" && session.profile.role !== "Manajer") {
    throw new AgentToolError("FORBIDDEN", "Hanya Owner atau Manajer.", 403);
  }
}

async function productsByIds(ids: string[]) {
  const { getDb } = await import("@/db");
  const { menuItems } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");
  return getDb()
    .select({ id: menuItems.id, name: menuItems.name, status: menuItems.status, stock: menuItems.stock, category: menuItems.category })
    .from(menuItems)
    .where(inArray(menuItems.id, ids));
}

const BULK_LABEL: Record<(typeof CATALOG_BULK_ACTIONS)[number], string> = {
  activate: "AKTIFKAN",
  archive: "ARSIPKAN (hilang dari POS & menu digital)",
  stock: "UBAH status stok",
  digital: "TAMPIL/SEMBUNYIKAN di menu digital",
  move_category: "PINDAHKAN kategori",
  product_type: "UBAH tipe produk",
};

export const productTools: AgentTool[] = [
  {
    name: "daftar_kategori_produk",
    title: "Daftar kategori produk",
    description: "Kategori produk (dinamis): id, nama, jenis, stasiun (bar/dapur/none), grup POS, status, jumlah produk aktif/arsip. Pakai id untuk aksi_produk move_category.",
    write: false,
    domain: "produk_harga",
    risk: "R0",
    permission: "inventory:read",
    input: z.object({ termasukArsip: z.boolean().optional() }),
    async run(_session, args) {
      const { listProductCategories } = await import("@/lib/product-management");
      return listProductCategories({ includeArchived: Boolean(args.termasukArsip) });
    },
  },
  {
    name: "ubah_harga_varian",
    title: "Ubah harga jual varian",
    description:
      "Ubah harga jual SATU varian menu (mis. Coffee Latte Cold). Wajib hargaLama (dari daftar_menu) — bila harga sudah berubah, ditolak STALE_PRICE. Resep, HPP, SKU tidak berubah; order lama tetap memakai harga saat itu. Alasan wajib. Owner/Manajer.",
    write: true,
    domain: "produk_harga",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({
      menuId: z.string().min(1).max(80),
      variantId: z.string().min(1).max(80),
      hargaLama: z.number().int().min(0),
      hargaBaru: z.number().int().min(0).max(100_000_000),
      alasan: z.string().min(3).max(300),
    }),
    async run(session, args) {
      assertOwnerOrManager(session);
      const { updateVariantPrice } = await import("@/lib/product-management");
      return updateVariantPrice(
        { itemId: String(args.menuId), variantId: String(args.variantId), price: Number(args.hargaBaru), expectedPrice: Number(args.hargaLama), reason: String(args.alasan) },
        session,
      );
    },
    async preview(session, args) {
      assertOwnerOrManager(session);
      const { getDb } = await import("@/db");
      const { menuItems, menuVariants } = await import("@/db/schema");
      const { and, eq } = await import("drizzle-orm");
      const [row] = await getDb()
        .select({ name: menuItems.name, label: menuVariants.label, price: menuVariants.price, baseCost: menuVariants.baseCost })
        .from(menuVariants)
        .innerJoin(menuItems, eq(menuItems.id, menuVariants.itemId))
        .where(and(eq(menuVariants.itemId, String(args.menuId)), eq(menuVariants.variantId, String(args.variantId))))
        .limit(1);
      if (!row) throw new AgentToolError("NOT_FOUND", "Varian produk tidak ditemukan.", 404);
      const next = Number(args.hargaBaru);
      const change = row.price ? Math.round(((next - row.price) / row.price) * 1000) / 10 : null;
      return {
        aksi: `UBAH HARGA ${row.name} (${row.label})`,
        hargaSaatIni: rupiah(row.price),
        hargaBaru: rupiah(next),
        perubahanPersen: change,
        hpp: row.baseCost > 0 ? rupiah(row.baseCost) : "belum ada (margin tidak dihitung)",
        marginBaru: row.baseCost > 0 && next > 0 ? `${Math.round(((next - row.baseCost) / next) * 1000) / 10}%` : null,
        alasan: args.alasan,
        catatan: row.price !== Number(args.hargaLama) ? `hargaLama (${rupiah(Number(args.hargaLama))}) ≠ harga saat ini — eksekusi akan ditolak.` : undefined,
      };
    },
  },
  {
    name: "aksi_produk",
    title: "Aksi produk (aktif/arsip/stok/menu digital/kategori/tipe)",
    description:
      "Aksi pada 1–100 produk: activate, archive, stock (nilai ready|limited|sold_out), digital (shown|hidden), move_category (nilai = id kategori), product_type (menu|retail|bundle). Tercatat per produk di audit. Owner/Manajer.",
    write: true,
    domain: "produk_harga",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({
      menuIds: z.array(z.string().min(1).max(80)).min(1).max(100),
      aksi: z.enum(CATALOG_BULK_ACTIONS),
      nilai: z.string().max(80).optional(),
    }),
    async run(session, args) {
      assertOwnerOrManager(session);
      const { bulkProductAction } = await import("@/lib/product-management");
      return bulkProductAction({ ids: args.menuIds as string[], action: args.aksi as (typeof CATALOG_BULK_ACTIONS)[number], value: (args.nilai as string | undefined) ?? null }, session);
    },
    async preview(session, args) {
      assertOwnerOrManager(session);
      const ids = args.menuIds as string[];
      const rows = await productsByIds(ids);
      const found = new Set(rows.map((row) => row.id));
      return {
        aksi: `${BULK_LABEL[args.aksi as (typeof CATALOG_BULK_ACTIONS)[number]]}${args.nilai ? ` → ${args.nilai}` : ""}`,
        jumlahProduk: rows.length,
        produk: rows.map((row) => `${row.name} [${row.category}] status=${row.status} stok=${row.stock}`),
        tidakDitemukan: ids.filter((id) => !found.has(id)),
      };
    },
  },
];
