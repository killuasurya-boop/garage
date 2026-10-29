// Tool bertipe master supplier & bahan (blueprint V3 §6.2 Phase 3: garage_create_supplier,
// garage_update_supplier, garage_create_material). Memakai service yang SAMA dengan UI Gudang
// (wms-service: validasi, SKU otomatis terkunci, audit wms-master) — tidak ada logika tulis kedua.
// Perbedaan sengaja untuk AI:
// - create TIDAK pernah menimpa data lama (service UI meng-upsert nama sama) → tolak + arahkan ke update;
// - rekening bank supplier tidak bisa diisi/dibaca lewat AI (data keuangan sensitif);
// - stok awal tidak lewat tool ini (mutasi stok = alur gudang terpisah);
// - hasil membawa sidik sebelum/sesudah (bukti perubahan, AC-18).
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { wmsProduct, wmsSupplier } from "@/db/schema";
import { AgentToolError, type AgentTool } from "@/lib/agent-tool-core";
import type { GarageSession } from "@/lib/server-auth";
import { summaryHashOf } from "@/lib/step-up-totp";

const AREAS = ["bar", "dapur", "umum", "teknik"] as const;

const supplierFields = {
  phone: z.string().trim().max(40).optional().describe("Nomor WhatsApp, mis. 0812xxxxxxxx atau 62812xxxxxxxx"),
  address: z.string().trim().max(300).optional(),
  picName: z.string().trim().max(120).optional().describe("Nama kontak/PIC supplier"),
  areas: z.array(z.enum(AREAS)).max(4).optional().describe("Area yang dilayani: bar, dapur, umum, teknik"),
  productCategories: z.string().trim().max(200).optional().describe("Kategori barang, mis. 'susu, sirup'"),
  paymentMethod: z.enum(["cash", "transfer", "tempo"]).optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional().describe("Tempo hari (bila tempo)"),
  note: z.string().trim().max(200).optional(),
};

async function assertManagement(session: GarageSession) {
  const { wmsIsElevated } = await import("@/lib/wms-access");
  if (!wmsIsElevated(session.profile.role)) {
    throw new AgentToolError("FORBIDDEN", "Master supplier & bahan hanya untuk Owner/Manajer.", 403);
  }
}

async function masterCall<T>(run: () => Promise<T>) {
  const { WmsMasterError } = await import("@/lib/wms-master-data");
  try {
    return await run();
  } catch (error) {
    if (error instanceof WmsMasterError) throw new AgentToolError(error.code, error.message, error.status);
    throw error;
  }
}

function actorOf(session: GarageSession) {
  return { userId: session.user.id, name: session.user.name ?? null, strict: true };
}

/** Bentuk supplier tanpa rekening (AI tidak membaca/menulis data bank). */
function publicSupplier(row: Record<string, unknown>) {
  const { bankName: _bn, bankAccountNumber: _ban, bankAccountName: _bann, ...rest } = row as Record<string, unknown> & {
    bankName?: unknown;
    bankAccountNumber?: unknown;
    bankAccountName?: unknown;
  };
  void _bn;
  void _ban;
  void _bann;
  return rest;
}

export const masterTools: AgentTool[] = [
  {
    name: "garage_create_supplier",
    title: "Tambah supplier baru",
    description:
      "Tambah supplier BARU (nama, WhatsApp, alamat, PIC, area, kategori barang, cara bayar). Ditolak bila nama/nomor sudah ada — pakai garage_update_supplier. Rekening bank diisi Owner di layar Gudang, bukan lewat AI.",
    write: true,
    domain: "gudang",
    risk: "R1",
    permission: "inventory:write",
    input: z.object({ name: z.string().trim().min(2).max(120), ...supplierFields }),
    async run(session, args) {
      await assertManagement(session);
      const input = args as { name: string; phone?: string } & Record<string, unknown>;
      const db = getDb();
      const [byName] = await db
        .select({ id: wmsSupplier.id, name: wmsSupplier.name, archivedAt: wmsSupplier.archivedAt })
        .from(wmsSupplier)
        .where(sql`lower(${wmsSupplier.name}) = lower(${input.name})`)
        .limit(1);
      if (byName) {
        throw new AgentToolError(
          "SUPPLIER_EXISTS",
          `Supplier "${byName.name}" sudah ada${byName.archivedAt ? " (diarsipkan)" : ""} (id ${byName.id}). Untuk mengubah datanya pakai garage_update_supplier — data lama tidak ditimpa diam-diam.`,
          409,
        );
      }
      if (input.phone) {
        const { normalizeWhatsapp } = await import("@/lib/wms-master-data");
        const phone = await masterCall(async () => normalizeWhatsapp(input.phone));
        const [byPhone] = await db
          .select({ id: wmsSupplier.id, name: wmsSupplier.name })
          .from(wmsSupplier)
          .where(and(eq(wmsSupplier.phone, phone), isNull(wmsSupplier.archivedAt)))
          .limit(1);
        if (byPhone) {
          throw new AgentToolError("SUPPLIER_PHONE_EXISTS", `Nomor ${phone} sudah dipakai supplier "${byPhone.name}" (id ${byPhone.id}).`, 409);
        }
      }
      const { createWmsSupplier } = await import("@/lib/wms-service");
      const row = await masterCall(() => createWmsSupplier(input as never, actorOf(session)));
      const after = publicSupplier(row as unknown as Record<string, unknown>);
      return { dibuat: true, supplier: after, bukti: { sebelum: null, sesudah: summaryHashOf(after) } };
    },
  },
  {
    name: "garage_update_supplier",
    title: "Ubah data supplier",
    description:
      "Ubah data supplier yang ada (hanya field yang dikirim), atau arsipkan/aktifkan lagi. Mengembalikan field yang berubah + sidik sebelum/sesudah. Rekening bank tidak bisa diubah lewat AI.",
    write: true,
    domain: "gudang",
    risk: "R1",
    permission: "inventory:write",
    input: z.object({
      supplierId: z.string().uuid(),
      name: z.string().trim().min(2).max(120).optional(),
      ...supplierFields,
      arsipkan: z.boolean().optional().describe("true = arsipkan, false = aktifkan lagi"),
    }),
    async run(session, args) {
      await assertManagement(session);
      const { supplierId, arsipkan, ...patch } = args as { supplierId: string; arsipkan?: boolean } & Record<string, unknown>;
      if (!Object.keys(patch).length && arsipkan === undefined) {
        throw new AgentToolError("VALIDATION_ERROR", "Tidak ada field yang diubah.");
      }
      const db = getDb();
      const [before] = await db.select().from(wmsSupplier).where(eq(wmsSupplier.id, supplierId)).limit(1);
      if (!before) throw new AgentToolError("NOT_FOUND", "Supplier tidak ditemukan.", 404);
      if (typeof patch.phone === "string" && patch.phone) {
        const { normalizeWhatsapp } = await import("@/lib/wms-master-data");
        const phone = await masterCall(async () => normalizeWhatsapp(patch.phone as string));
        const [other] = await db
          .select({ name: wmsSupplier.name })
          .from(wmsSupplier)
          .where(and(eq(wmsSupplier.phone, phone), isNull(wmsSupplier.archivedAt), ne(wmsSupplier.id, supplierId)))
          .limit(1);
        if (other) throw new AgentToolError("SUPPLIER_PHONE_EXISTS", `Nomor ${phone} sudah dipakai supplier "${other.name}".`, 409);
      }
      const { archiveWmsSupplier, updateWmsSupplier } = await import("@/lib/wms-service");
      // updateWmsSupplier hanya bisa MENGAKTIFKAN lagi (archived:false); arsip = archiveWmsSupplier.
      if (Object.keys(patch).length || arsipkan === false) {
        await masterCall(() =>
          updateWmsSupplier(supplierId, { ...(patch as object), ...(arsipkan === false ? { archived: false } : {}) } as never, actorOf(session)),
        );
      }
      if (arsipkan === true && !before.archivedAt) {
        await masterCall(() => archiveWmsSupplier(supplierId, actorOf(session)));
      }
      // Hasil dibaca ulang dari DB: yang dilaporkan = yang benar-benar tersimpan.
      const [row] = await db.select().from(wmsSupplier).where(eq(wmsSupplier.id, supplierId)).limit(1);
      const beforePublic = publicSupplier(before as unknown as Record<string, unknown>);
      const afterPublic = publicSupplier(row as unknown as Record<string, unknown>);
      const berubah = Object.keys(afterPublic).filter(
        (key) => key in beforePublic && JSON.stringify(beforePublic[key]) !== JSON.stringify(afterPublic[key]) && key !== "updatedAt",
      );
      return {
        diubah: true,
        supplier: afterPublic,
        berubah,
        bukti: { sebelum: summaryHashOf(beforePublic), sesudah: summaryHashOf(afterPublic) },
      };
    },
  },
  {
    name: "garage_create_material",
    title: "Tambah bahan baku (master gudang)",
    description:
      "Tambah bahan baku/barang gudang baru: nama, kategori gudang, satuan dasar (ml/gr/pcs…), SKU (kosong = otomatis), stok minimum, kemasan beli (nama, isi, harga per kemasan → HPP per satuan). Tidak menambah stok — stok awal lewat penerimaan/opname. Ditolak bila nama aktif sama sudah ada.",
    write: true,
    domain: "bahan_resep",
    risk: "R1",
    permission: "inventory:write",
    input: z.object({
      name: z.string().trim().min(2).max(140),
      category: z.string().trim().min(2).max(80).describe("Kategori gudang yang sudah ada"),
      unit: z.string().trim().min(1).max(24).describe("Satuan dasar stok, mis. ml, gr, pcs"),
      sku: z
        .string()
        .trim()
        .max(40)
        .regex(/^$|^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/, "SKU hanya huruf, angka, titik, strip, garis bawah.")
        .optional(),
      minStock: z.number().nonnegative().max(10_000_000).optional(),
      packName: z.string().trim().max(40).optional().describe("Nama kemasan beli, mis. botol, dus"),
      packQty: z.number().positive().max(100_000_000).optional().describe("Isi per kemasan dalam satuan dasar"),
      packPrice: z.number().nonnegative().max(1_000_000_000).optional().describe("Harga beli per kemasan (Rp)"),
      defaultSupplierId: z.string().uuid().optional(),
      barcode: z.string().trim().max(64).optional(),
      izinkanNamaSama: z.boolean().optional().describe("true hanya bila memang barang berbeda dengan nama sama"),
    }),
    async run(session, args) {
      await assertManagement(session);
      const { izinkanNamaSama, ...input } = args as { izinkanNamaSama?: boolean; name: string } & Record<string, unknown>;
      if (!izinkanNamaSama) {
        const [dup] = await getDb()
          .select({ id: wmsProduct.id, sku: wmsProduct.sku, name: wmsProduct.name })
          .from(wmsProduct)
          .where(and(sql`lower(${wmsProduct.name}) = lower(${input.name})`, isNull(wmsProduct.archivedAt)))
          .limit(1);
        if (dup) {
          throw new AgentToolError("MATERIAL_EXISTS", `Bahan "${dup.name}" sudah ada (SKU ${dup.sku}). Kirim izinkanNamaSama=true hanya bila barangnya memang berbeda.`, 409);
        }
      }
      const { createWmsProduct } = await import("@/lib/wms-service");
      const row = await masterCall(() => createWmsProduct(input as never, session.user.id, undefined, actorOf(session)));
      return { dibuat: true, bahan: row, bukti: { sebelum: null, sesudah: summaryHashOf(row) } };
    },
  },
];
