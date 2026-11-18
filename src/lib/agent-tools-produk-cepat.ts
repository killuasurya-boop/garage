// =============================================================================
// Produk cepat dari chat (Owner 18 Nov 2026): Owner cukup menyebut NAMA produk & kategori.
// - buat_produk: produk Garage baru (nama + kategori + harga per varian) lewat `createMenuProduct`
//   (validasi, SKU otomatis, audit sama dengan form Kelola Produk).
// - ubah_harga_produk: harga satu varian berdasarkan nama lewat `updateVariantPrice` (harga lama dicek).
// Produk mitra TIDAK lewat sini (harga/HPP mitra = Owner lewat tool mitra). Semua R2 → preview + konfirmasi.
// =============================================================================
import { z } from "zod";

import { AgentToolError, rupiah, type AgentTool } from "@/lib/agent-tool-core";
import type { GarageSession } from "@/lib/server-auth";

function assertOwnerOrManager(session: GarageSession) {
  if (session.profile.role !== "Owner" && session.profile.role !== "Manajer") {
    throw new AgentToolError("FORBIDDEN", "Hanya Owner atau Manajer.", 403);
  }
}

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** Kategori aktif dari nama (persis dulu, lalu satu-satunya yang mengandung kata itu). */
async function resolveCategory(nama: string) {
  const { listProductCategories } = await import("@/lib/product-management");
  const all = (await listProductCategories({ includeArchived: false })) as Array<{ id: string; name: string }>;
  const exact = all.filter((c) => norm(c.name) === norm(nama));
  const partial = all.filter((c) => norm(c.name).includes(norm(nama)));
  const pick = exact.length === 1 ? exact[0] : partial.length === 1 ? partial[0] : null;
  if (pick) return pick;
  const daftar = all.map((c) => c.name).join(", ");
  if (!partial.length) throw new AgentToolError("KATEGORI_TIDAK_DITEMUKAN", `Kategori "${nama}" tidak ada. Pilih salah satu: ${daftar}.`, 404);
  throw new AgentToolError("KATEGORI_AMBIGU", `Kategori "${nama}" cocok dengan ${partial.map((c) => c.name).join(", ")}. Sebut nama lengkapnya.`, 409);
}

const varianInput = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(40).describe("Mis. Regular, Hot, Ice, Large"),
      harga: z.number().int().min(1).max(100_000_000),
      hpp: z.number().int().min(0).max(100_000_000).optional().describe("Harga modal (produk retail) — boleh kosong untuk menu beresep"),
    }),
  )
  .min(1)
  .max(10);

const buatInput = z.object({
  nama: z.string().trim().min(2).max(80),
  kategori: z.string().trim().min(2).max(60).describe("Nama kategori yang sudah ada (lihat daftar_kategori_produk)"),
  varian: varianInput.optional().describe("Kosongkan bila hanya satu harga: isi `harga`"),
  harga: z.number().int().min(1).max(100_000_000).optional().describe("Harga jual bila hanya satu varian (Regular)"),
  hpp: z.number().int().min(0).max(100_000_000).optional(),
  deskripsi: z.string().trim().max(300).optional(),
  tampilDiMenuDigital: z.boolean().optional().describe("Default ya"),
  alasan: z.string().trim().min(3).max(300),
});

function variantsFrom(args: Record<string, unknown>) {
  const list = args.varian as Array<{ label: string; harga: number; hpp?: number }> | undefined;
  if (list?.length) return list;
  if (typeof args.harga === "number") return [{ label: "Regular", harga: args.harga, hpp: args.hpp as number | undefined }];
  throw new AgentToolError("VALIDATION_ERROR", "Isi `harga` (satu harga) atau `varian` (beberapa harga).");
}

async function findSameName(nama: string) {
  const { getDb } = await import("@/db");
  const { menuItems } = await import("@/db/schema");
  const { and, ilike, ne } = await import("drizzle-orm");
  return getDb()
    .select({ id: menuItems.id, name: menuItems.name })
    .from(menuItems)
    .where(and(ne(menuItems.status, "archived"), ilike(menuItems.name, nama.replace(/[\\%_]/g, (c) => `\\${c}`))))
    .limit(5);
}

/** Pesan validasi `createMenuProduct` (Error biasa) aman ditampilkan; selain itu tetap tersembunyi. */
const CREATE_SAFE_MESSAGE = /^(Nama produk|ID produk|Harga|Produk wajib|Isi per satuan|Kategori|SKU|Barcode|Varian)/;

async function resolveGarageVariant(nama: string, varian: string | undefined) {
  const { resolveProductForPhoto } = await import("@/lib/agent-tools-foto");
  const product = await resolveProductForPhoto(nama, "garage");
  const { getDb } = await import("@/db");
  const { menuVariants } = await import("@/db/schema");
  const { asc, eq } = await import("drizzle-orm");
  const variants = await getDb()
    .select({ variantId: menuVariants.variantId, label: menuVariants.label, price: menuVariants.price, baseCost: menuVariants.baseCost })
    .from(menuVariants)
    .where(eq(menuVariants.itemId, product.id))
    .orderBy(asc(menuVariants.sortOrder));
  const label = varian?.trim();
  const pick = label ? variants.filter((v) => norm(v.label) === norm(label)) : variants.length === 1 ? variants : [];
  if (pick.length !== 1) {
    const daftar = variants.map((v) => `${v.label} (${rupiah(v.price)})`).join(", ");
    throw new AgentToolError(
      "VARIAN_PERLU_DIPILIH",
      label ? `Varian "${label}" tidak ada di ${product.name}. Pilihan: ${daftar}.` : `${product.name} punya beberapa varian: ${daftar}. Sebut variannya.`,
      409,
    );
  }
  return { product, variant: pick[0] };
}

/** Harga lama wajib ikut di argumen (terikat konfirmasi). Kosong/beda = tolak sambil menyebut harga sekarang. */
function assertKnownOldPrice(args: Record<string, unknown>, name: string, variant: { label: string; price: number }) {
  if (args.hargaLama === undefined) {
    throw new AgentToolError("HARGA_LAMA_DIPERLUKAN", `Harga ${name} (${variant.label}) sekarang ${rupiah(variant.price)}. Ulangi dengan hargaLama: ${variant.price}.`, 409);
  }
  if (Number(args.hargaLama) !== variant.price) {
    throw new AgentToolError("STALE_PRICE", `Harga ${name} (${variant.label}) sudah berubah menjadi ${rupiah(variant.price)}. Tanyakan Owner lagi, lalu ulangi dengan hargaLama: ${variant.price}.`, 409);
  }
}

export const produkCepatTools: AgentTool[] = [
  {
    name: "buat_produk",
    title: "Tambah produk Garage baru",
    description:
      "Tambah produk menu/retail Garage cukup dengan nama, kategori (nama), dan harga (satu harga atau beberapa varian). SKU dibuat otomatis, produk langsung aktif di POS (dan menu digital kecuali dimatikan). Resep/HPP menu diisi kemudian di Garage OS. Foto: setelah ini pakai siapkan_foto + pasang_foto dengan nama produk. Produk MITRA pakai tambah_produk_mitra. Preview + konfirmasi. Owner/Manajer.",
    write: true,
    domain: "produk_harga",
    risk: "R2",
    permission: "inventory:write",
    input: buatInput,
    async preview(session, args) {
      assertOwnerOrManager(session);
      const category = await resolveCategory(String(args.kategori));
      const variants = variantsFrom(args);
      const same = await findSameName(String(args.nama));
      return {
        aksi: `TAMBAH PRODUK ${String(args.nama)}`,
        kategori: category.name,
        varian: variants.map((v) => `${v.label}: ${rupiah(v.harga)}${v.hpp ? ` (modal ${rupiah(v.hpp)})` : ""}`),
        menuDigital: args.tampilDiMenuDigital === false ? "disembunyikan" : "tampil",
        alasan: args.alasan,
        peringatan: same.length ? `Sudah ada produk bernama sama: ${same.map((p) => p.name).join(", ")} — pembuatan akan ditolak.` : undefined,
      };
    },
    async run(session, args) {
      assertOwnerOrManager(session);
      const category = await resolveCategory(String(args.kategori));
      const variants = variantsFrom(args);
      if ((await findSameName(String(args.nama))).length) {
        throw new AgentToolError("PRODUK_SUDAH_ADA", `Produk "${String(args.nama)}" sudah ada. Pakai ubah_harga_produk untuk mengubah harganya.`, 409);
      }
      const { createMenuProduct } = await import("@/lib/garage-service");
      try {
        const created = (await createMenuProduct(
          {
            name: String(args.nama),
            category: category.name as never,
            categoryId: category.id,
            description: (args.deskripsi as string | undefined) ?? null,
            showInDigitalMenu: args.tampilDiMenuDigital !== false,
            variants: variants.map((v) => ({ label: v.label, price: v.harga, baseCost: v.hpp ?? 0 })),
          },
          session,
        )) as { id?: string; name?: string; sku?: string } | null;
        return {
          dibuat: created?.name ?? args.nama,
          id: created?.id ?? null,
          sku: created?.sku ?? null,
          kategori: category.name,
          langkahBerikut: "Tambahkan foto dengan siapkan_foto lalu pasang_foto (cukup nama produk). Resep/HPP menu diisi di Garage OS → Produk.",
        };
      } catch (error) {
        if (error instanceof Error && CREATE_SAFE_MESSAGE.test(error.message)) throw new AgentToolError("PRODUK_DITOLAK", error.message, 400);
        throw error;
      }
    },
  },
  {
    name: "ubah_harga_produk",
    title: "Ubah harga produk Garage (pakai nama)",
    description:
      "Ubah harga jual satu varian produk Garage cukup dengan nama produk (+ nama varian bila lebih dari satu, mis. \"Ice\"). Isi hargaLama (harga sekarang); bila kosong tool menyebutkan harga sekarang untuk diulang — mencegah menimpa perubahan orang lain. Resep, HPP, SKU tetap; order lama tetap harga lama. Produk mitra: ubah_harga_mitra. Owner/Manajer.",
    write: true,
    domain: "produk_harga",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({
      nama: z.string().trim().min(2).max(120),
      varian: z.string().trim().max(40).optional(),
      hargaLama: z.number().int().min(0).max(100_000_000).optional().describe("Harga sekarang; bila kosong tool menyebutkannya lalu ulangi dengan hargaLama"),
      hargaBaru: z.number().int().min(1).max(100_000_000),
      alasan: z.string().trim().min(3).max(300),
    }),
    async preview(session, args) {
      assertOwnerOrManager(session);
      const { product, variant } = await resolveGarageVariant(String(args.nama), args.varian as string | undefined);
      assertKnownOldPrice(args, product.name, variant);
      const next = Number(args.hargaBaru);
      return {
        aksi: `UBAH HARGA ${product.name} (${variant.label})`,
        hargaSaatIni: rupiah(variant.price),
        hargaBaru: rupiah(next),
        hpp: variant.baseCost > 0 ? rupiah(variant.baseCost) : "belum ada (margin tidak dihitung)",
        marginBaru: variant.baseCost > 0 ? `${Math.round(((next - variant.baseCost) / next) * 1000) / 10}%` : null,
        alasan: args.alasan,
      };
    },
    async run(session, args) {
      assertOwnerOrManager(session);
      const { product, variant } = await resolveGarageVariant(String(args.nama), args.varian as string | undefined);
      assertKnownOldPrice(args, product.name, variant);
      const { updateVariantPrice } = await import("@/lib/product-management");
      // expectedPrice = harga yang Owner lihat saat pratinjau (argumen terkonfirmasi), bukan bacaan ulang: perubahan
      // orang lain di antara pratinjau & konfirmasi → ditolak STALE_PRICE, tidak tertimpa diam-diam.
      await updateVariantPrice(
        { itemId: product.id, variantId: variant.variantId, price: Number(args.hargaBaru), expectedPrice: Number(args.hargaLama), reason: String(args.alasan) },
        session,
      );
      return { produk: product.name, varian: variant.label, hargaLama: rupiah(Number(args.hargaLama)), hargaBaru: rupiah(Number(args.hargaBaru)) };
    },
  },
];
