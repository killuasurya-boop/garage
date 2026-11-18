// =============================================================================
// Mitra dari chat (Owner 18 Nov 2026): Partner Hub cukup dengan NAMA mitra / produk (tanpa id teknis).
// Semua lewat service Partner Hub yang sama dengan layar /partners (hak akses, audit `partner_events`,
// aturan aktivasi). Pembayaran/settlement mitra TIDAK ada di sini — uang tetap lewat Garage OS (Owner + 2FA).
// Data selalu outlet sesi (partner_id tidak pernah dari argumen bebas).
// =============================================================================
import { z } from "zod";

import { AgentToolError, rupiah, type AgentTool } from "@/lib/agent-tool-core";
import type { GarageSession } from "@/lib/server-auth";

function assertOwnerOrManager(session: GarageSession) {
  if (session.profile.role !== "Owner" && session.profile.role !== "Manajer") {
    throw new AgentToolError("FORBIDDEN", "Hanya Owner atau Manajer.", 403);
  }
}
function assertOwner(session: GarageSession) {
  if (session.profile.role !== "Owner") throw new AgentToolError("FORBIDDEN", "Hanya Owner.", 403);
}

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

type PartnerRow = { id: string; code: string; name: string; status: string; operationalStatus?: string; readiness?: { missing: string[] }; activeOrders?: number };

/** Mitra outlet sesi dari nama atau kode (persis dulu, lalu satu-satunya yang mengandung kata itu). */
async function resolvePartner(session: GarageSession, nama: string) {
  const { listPartners } = await import("@/lib/partner-hub-service");
  const all = (await listPartners(session)) as unknown as PartnerRow[];
  const q = norm(nama);
  const exact = all.filter((p) => norm(p.name) === q || norm(p.code) === q);
  const partial = all.filter((p) => norm(p.name).includes(q));
  const pick = exact.length === 1 ? exact[0] : partial.length === 1 ? partial[0] : null;
  if (pick) return pick;
  if (!partial.length) {
    throw new AgentToolError("MITRA_TIDAK_DITEMUKAN", `Mitra "${nama}" tidak ada. Mitra terdaftar: ${all.map((p) => p.name).join(", ") || "(belum ada)"}.`, 404);
  }
  throw new AgentToolError("MITRA_AMBIGU", `"${nama}" cocok dengan ${partial.map((p) => p.name).join(", ")}. Sebut nama lengkapnya.`, 409);
}

type ProductRow = {
  linkId: string;
  name: string;
  active: boolean;
  available: boolean;
  imageUrl: string | null;
  variants: Array<{ variantId: string; label: string; sellPrice: number; unitCost?: number }>;
};

async function productsOf(session: GarageSession, partnerId: string) {
  const { listPartnerProducts } = await import("@/lib/partner-hub-service");
  return (await listPartnerProducts(partnerId, { outletId: session.profile.outlet.id, showCost: true })) as unknown as ProductRow[];
}

/** Produk mitra outlet sesi dari nama produk (opsional dibatasi satu mitra). */
async function resolvePartnerProduct(session: GarageSession, produk: string, mitra?: string) {
  const { listPartners } = await import("@/lib/partner-hub-service");
  const partners = mitra ? [await resolvePartner(session, mitra)] : ((await listPartners(session)) as unknown as PartnerRow[]);
  const rows: Array<ProductRow & { partner: PartnerRow }> = [];
  for (const partner of partners) for (const product of await productsOf(session, partner.id)) rows.push({ ...product, partner });
  const q = norm(produk);
  const exact = rows.filter((r) => norm(r.name) === q);
  const partial = rows.filter((r) => norm(r.name).includes(q));
  const pick = exact.length === 1 ? exact[0] : partial.length === 1 ? partial[0] : null;
  if (pick) return pick;
  if (!partial.length) throw new AgentToolError("PRODUK_TIDAK_DITEMUKAN", `Produk mitra "${produk}" tidak ada.`, 404);
  throw new AgentToolError("PRODUK_AMBIGU", `"${produk}" cocok dengan ${partial.map((r) => `${r.name} (${r.partner.name})`).join(", ")}. Sebut nama lengkap.`, 409);
}

function pickVariant(product: ProductRow, varian: string | undefined) {
  const pick = varian ? product.variants.filter((v) => norm(v.label) === norm(varian)) : product.variants.length === 1 ? product.variants : [];
  if (pick.length !== 1) {
    throw new AgentToolError("VARIAN_PERLU_DIPILIH", `${product.name}: sebut variannya — ${product.variants.map((v) => v.label).join(", ")}.`, 409);
  }
  return pick[0];
}

const productView = (p: ProductRow) => ({
  produk: p.name,
  disetujui: p.active ? "ya" : "menunggu persetujuan Owner",
  tersedia: p.available ? "Tersedia" : "Habis",
  foto: p.imageUrl ? "ada" : "BELUM ADA",
  harga: p.variants.map((v) => `${v.label}: jual ${rupiah(v.sellPrice)}${v.unitCost !== undefined ? ` · setor mitra ${rupiah(v.unitCost)}` : ""}`),
});

const STATUS_KIND = { aktifkan: "activate", bekukan: "freeze", nonaktifkan: "deactivate", buka_kembali: "reopen" } as const;

type ProposalRow = {
  id: string;
  proposalNo: string;
  partnerName: string;
  itemName: string;
  variantLabel: string;
  currentUnitCost: number;
  currentSellPrice: number;
  proposedUnitCost: number;
  suggestedSellPrice: number | null;
  reason: string | null;
  status: string;
  statusLabel: string;
};

async function proposals(session: GarageSession, status?: string) {
  const { listPartnerPriceProposals } = await import("@/lib/partner-hub-service");
  return (await listPartnerPriceProposals({ outletId: session.profile.outlet.id, status, withImpact: false, limit: 200 })) as unknown as ProposalRow[];
}

async function findProposal(session: GarageSession, nomor: string) {
  const row = (await proposals(session)).find((r) => norm(r.proposalNo) === norm(nomor));
  if (!row) throw new AgentToolError("USULAN_TIDAK_DITEMUKAN", `Usulan ${nomor} tidak ada. Lihat usulan_harga_mitra.`, 404);
  return row;
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

export const mitraTools: AgentTool[] = [
  {
    name: "daftar_mitra",
    title: "Daftar mitra & kesiapannya",
    description:
      "Semua mitra outlet ini: nama, kode, status (draft/aktif/dibekukan…), status layanan (Buka/Jeda/Tutup/offline), pesanan aktif, dan syarat aktivasi yang masih kurang. Baca saja. Owner/Manajer.",
    write: false,
    domain: "produk_harga",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({}),
    async run(session) {
      assertOwnerOrManager(session);
      const { listPartners } = await import("@/lib/partner-hub-service");
      const all = (await listPartners(session)) as unknown as PartnerRow[];
      return all.map((p) => ({
        mitra: p.name,
        kode: p.code,
        status: p.status,
        layanan: p.operationalStatus ?? null,
        pesananAktif: p.activeOrders ?? 0,
        syaratKurang: p.readiness?.missing ?? [],
      }));
    },
  },
  {
    name: "produk_mitra",
    title: "Produk satu mitra",
    description:
      "Produk milik satu mitra (pakai nama mitra): disetujui atau belum, Tersedia/Habis, foto ada atau belum, harga jual & harga setor mitra per varian. Baca saja. Owner/Manajer.",
    write: false,
    domain: "produk_harga",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({ mitra: z.string().trim().min(2).max(80) }),
    async run(session, args) {
      assertOwnerOrManager(session);
      const partner = await resolvePartner(session, String(args.mitra));
      return { mitra: partner.name, produk: (await productsOf(session, partner.id)).map(productView) };
    },
  },
  {
    name: "pesanan_mitra",
    title: "Pesanan mitra hari ini",
    description:
      "Tiket pesanan mitra 24 jam terakhir (atau yang masih aktif saja): mitra, nomor tiket, status, item, status bayar, eskalasi. Opsional satu mitra. Baca saja. Owner/Manajer.",
    write: false,
    domain: "pos",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({ mitra: z.string().trim().min(2).max(80).optional(), hanyaAktif: z.boolean().optional() }),
    async run(session, args) {
      assertOwnerOrManager(session);
      const partner = args.mitra ? await resolvePartner(session, String(args.mitra)) : null;
      const { listPartnerOrdersForOutlet } = await import("@/lib/partner-hub-service");
      const rows = (await listPartnerOrdersForOutlet(session.profile.outlet.id, {
        partnerId: partner?.id,
        scope: args.hanyaAktif ? "active" : "today",
      })) as unknown as Array<Record<string, unknown>>;
      const keys = ["partnerName", "ticketNo", "orderNo", "status", "statusLabel", "items", "tableLabel", "fulfillment", "paymentLabel", "escalated", "needsRefund", "createdAt"];
      return {
        jumlah: rows.length,
        tiket: rows.slice(0, 60).map((row) => Object.fromEntries(keys.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]))),
      };
    },
  },
  {
    name: "tambah_produk_mitra",
    title: "Daftarkan produk mitra",
    description:
      "Daftarkan produk baru milik mitra (nama mitra, nama produk, kategori, harga jual & harga setor mitra per varian). Produk masuk NONAKTIF sampai Owner menyetujui (setujui_produk_mitra). Foto: pasang_foto dengan nama produk. Preview + konfirmasi. Owner/Manajer.",
    write: true,
    domain: "produk_harga",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({
      mitra: z.string().trim().min(2).max(80),
      nama: z.string().trim().min(2).max(80),
      kategori: z.string().trim().min(2).max(60),
      deskripsi: z.string().trim().max(300).optional(),
      varian: z
        .array(
          z.object({
            label: z.string().trim().min(1).max(40),
            hargaJual: z.number().int().min(1).max(100_000_000),
            hargaSetor: z.number().int().min(0).max(100_000_000).describe("HPP mitra = yang dibayar Garage ke mitra per porsi"),
          }),
        )
        .min(1)
        .max(10),
      kode: z.string().trim().regex(/^[A-Za-z0-9-]{2,20}$/).optional().describe("Kode produk; kosong = otomatis dari kode mitra"),
    }),
    async preview(session, args) {
      assertOwnerOrManager(session);
      const partner = await resolvePartner(session, String(args.mitra));
      const varian = args.varian as Array<{ label: string; hargaJual: number; hargaSetor: number }>;
      return {
        aksi: `DAFTARKAN PRODUK MITRA ${String(args.nama)} → ${partner.name}`,
        kategori: args.kategori,
        varian: varian.map((v) => `${v.label}: jual ${rupiah(v.hargaJual)} · setor ${rupiah(v.hargaSetor)} · untung Garage ${rupiah(v.hargaJual - v.hargaSetor)}`),
        catatan: "Produk NONAKTIF sampai Owner menyetujui.",
      };
    },
    async run(session, args) {
      assertOwnerOrManager(session);
      const partner = await resolvePartner(session, String(args.mitra));
      const existing = await productsOf(session, partner.id);
      if (existing.some((p) => norm(p.name) === norm(String(args.nama)))) {
        throw new AgentToolError("PRODUK_SUDAH_ADA", `${partner.name} sudah punya produk "${String(args.nama)}".`, 409);
      }
      const code = (args.kode as string | undefined) ?? `${partner.code}-${slug(String(args.nama)).slice(0, 12)}`;
      const varian = args.varian as Array<{ label: string; hargaJual: number; hargaSetor: number }>;
      const { createPartnerProduct } = await import("@/lib/partner-hub-service");
      await createPartnerProduct(
        partner.id,
        {
          code,
          name: String(args.nama),
          category: String(args.kategori),
          description: (args.deskripsi as string | undefined) ?? null,
          variants: varian.map((v, i) => ({ variantId: slug(v.label) || `v${i + 1}`, label: v.label, unitCost: v.hargaSetor, sellPrice: v.hargaJual })),
        },
        session,
      );
      return { mitra: partner.name, produk: args.nama, kode: code.toUpperCase(), status: "nonaktif — menunggu persetujuan Owner (setujui_produk_mitra)" };
    },
  },
  {
    name: "setujui_produk_mitra",
    title: "Setujui / nonaktifkan produk mitra",
    description:
      "Owner menyetujui (aktif = true) atau menonaktifkan (aktif = false) produk mitra berdasarkan nama produk. Produk aktif bisa dipesan di POS & menu digital selama mitra aktif dan produk Tersedia. Preview + konfirmasi. Owner saja.",
    write: true,
    domain: "produk_harga",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({ produk: z.string().trim().min(2).max(120), mitra: z.string().trim().max(80).optional(), aktif: z.boolean(), alasan: z.string().trim().min(3).max(300) }),
    async preview(session, args) {
      assertOwner(session);
      const p = await resolvePartnerProduct(session, String(args.produk), args.mitra as string | undefined);
      return { aksi: `${args.aktif ? "SETUJUI" : "NONAKTIFKAN"} ${p.name} (${p.partner.name})`, sekarang: productView(p), alasan: args.alasan };
    },
    async run(session, args) {
      assertOwner(session);
      const p = await resolvePartnerProduct(session, String(args.produk), args.mitra as string | undefined);
      const { setPartnerProductActive } = await import("@/lib/partner-hub-service");
      await setPartnerProductActive(p.linkId, Boolean(args.aktif), session);
      return { produk: p.name, mitra: p.partner.name, status: args.aktif ? "disetujui (aktif)" : "nonaktif" };
    },
  },
  {
    name: "ubah_harga_mitra",
    title: "Ubah harga jual / harga setor produk mitra",
    description:
      "Owner mengubah harga jual dan/atau harga setor (HPP mitra) satu varian produk mitra berdasarkan nama. Isi yang berubah saja; yang kosong tetap. Tercatat di riwayat harga mitra. Preview + konfirmasi. Owner saja.",
    write: true,
    domain: "produk_harga",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({
      produk: z.string().trim().min(2).max(120),
      varian: z.string().trim().max(40).optional(),
      hargaJual: z.number().int().min(1).max(100_000_000).optional(),
      hargaSetor: z.number().int().min(0).max(100_000_000).optional(),
      alasan: z.string().trim().min(3).max(300),
    }),
    async preview(session, args) {
      assertOwner(session);
      const p = await resolvePartnerProduct(session, String(args.produk));
      const v = pickVariant(p, args.varian as string | undefined);
      const sell = (args.hargaJual as number | undefined) ?? v.sellPrice;
      const cost = (args.hargaSetor as number | undefined) ?? v.unitCost ?? 0;
      return {
        aksi: `UBAH HARGA MITRA ${p.name} (${v.label}) — ${p.partner.name}`,
        hargaJual: `${rupiah(v.sellPrice)} → ${rupiah(sell)}`,
        hargaSetor: `${rupiah(v.unitCost ?? 0)} → ${rupiah(cost)}`,
        untungGaragePerPorsi: rupiah(sell - cost),
        alasan: args.alasan,
      };
    },
    async run(session, args) {
      assertOwner(session);
      if (args.hargaJual === undefined && args.hargaSetor === undefined) throw new AgentToolError("VALIDATION_ERROR", "Isi hargaJual dan/atau hargaSetor.");
      const p = await resolvePartnerProduct(session, String(args.produk));
      const v = pickVariant(p, args.varian as string | undefined);
      const { setPartnerProductPrice } = await import("@/lib/partner-hub-service");
      await setPartnerProductPrice(
        p.linkId,
        {
          variantId: v.variantId,
          unitCost: (args.hargaSetor as number | undefined) ?? v.unitCost ?? 0,
          sellPrice: (args.hargaJual as number | undefined) ?? v.sellPrice,
          reason: String(args.alasan),
        },
        session,
      );
      return { produk: p.name, varian: v.label, mitra: p.partner.name, tersimpan: true };
    },
  },
  {
    name: "usulan_harga_mitra",
    title: "Usulan harga dari mitra",
    description:
      "Pengajuan perubahan harga setor dari mitra (default yang menunggu keputusan): nomor, mitra, produk, harga sekarang vs usulan, alasan mitra. Baca saja. Owner/Manajer.",
    write: false,
    domain: "produk_harga",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({ semua: z.boolean().optional().describe("true = termasuk yang sudah diputuskan") }),
    async run(session, args) {
      assertOwnerOrManager(session);
      return (await proposals(session, args.semua ? undefined : "pending")).slice(0, 50).map((r) => ({
        nomor: r.proposalNo,
        mitra: r.partnerName,
        produk: `${r.itemName} (${r.variantLabel})`,
        setorSekarang: rupiah(r.currentUnitCost),
        setorUsulan: rupiah(r.proposedUnitCost),
        hargaJualSekarang: rupiah(r.currentSellPrice),
        saranHargaJual: r.suggestedSellPrice ? rupiah(r.suggestedSellPrice) : null,
        alasanMitra: r.reason,
        status: r.statusLabel,
      }));
    },
  },
  {
    name: "putuskan_usulan_harga_mitra",
    title: "Setujui / tolak usulan harga mitra",
    description:
      "Owner memutuskan usulan harga mitra berdasarkan nomor usulan (dari usulan_harga_mitra). Setuju boleh mengubah angka (hargaSetor/hargaJual); tolak wajib catatan. Preview + konfirmasi. Owner saja.",
    write: true,
    domain: "produk_harga",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({
      nomor: z.string().trim().min(3).max(40),
      setuju: z.boolean(),
      hargaSetor: z.number().int().min(0).max(100_000_000).optional(),
      hargaJual: z.number().int().min(1).max(100_000_000).optional(),
      catatan: z.string().trim().max(300).optional(),
    }),
    async preview(session, args) {
      assertOwner(session);
      const row = await findProposal(session, String(args.nomor));
      return {
        aksi: `${args.setuju ? "SETUJUI" : "TOLAK"} usulan ${row.proposalNo} — ${row.partnerName} · ${row.itemName} (${row.variantLabel})`,
        setor: `${rupiah(row.currentUnitCost)} → ${rupiah((args.hargaSetor as number | undefined) ?? row.proposedUnitCost)}`,
        catatan: args.catatan ?? null,
      };
    },
    async run(session, args) {
      assertOwner(session);
      if (!args.setuju && !String(args.catatan ?? "").trim()) throw new AgentToolError("VALIDATION_ERROR", "Menolak usulan wajib catatan alasan.");
      const row = await findProposal(session, String(args.nomor));
      const { decidePartnerPriceProposal } = await import("@/lib/partner-hub-service");
      await decidePartnerPriceProposal(
        row.id,
        {
          approve: Boolean(args.setuju),
          unitCost: (args.hargaSetor as number | undefined) ?? null,
          sellPrice: (args.hargaJual as number | undefined) ?? null,
          note: (args.catatan as string | undefined) ?? null,
        },
        session,
      );
      return { usulan: row.proposalNo, keputusan: args.setuju ? "disetujui" : "ditolak" };
    },
  },
  {
    name: "ubah_status_mitra",
    title: "Aktifkan / bekukan / nonaktifkan mitra",
    description:
      "Ubah status mitra berdasarkan nama: aktifkan (syarat aktivasi harus lengkap), bekukan (pesanan baru berhenti), nonaktifkan, buka_kembali. Alasan wajib. Aktif/nonaktif = Owner; bekukan/buka kembali = Owner atau Manajer. Preview + konfirmasi.",
    write: true,
    domain: "produk_harga",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({
      mitra: z.string().trim().min(2).max(80),
      aksi: z.enum(["aktifkan", "bekukan", "nonaktifkan", "buka_kembali"]),
      alasan: z.string().trim().min(3).max(300),
    }),
    async preview(session, args) {
      assertOwnerOrManager(session);
      const partner = await resolvePartner(session, String(args.mitra));
      return {
        aksi: `${String(args.aksi).toUpperCase()} mitra ${partner.name}`,
        statusSekarang: partner.status,
        pesananAktif: partner.activeOrders ?? 0,
        syaratKurang: partner.readiness?.missing ?? [],
        alasan: args.alasan,
      };
    },
    async run(session, args) {
      assertOwnerOrManager(session);
      const partner = await resolvePartner(session, String(args.mitra));
      const { applyPartnerStatusAction } = await import("@/lib/partner-hub-service");
      await applyPartnerStatusAction(partner.id, STATUS_KIND[args.aksi as keyof typeof STATUS_KIND], String(args.alasan), session);
      return { mitra: partner.name, aksi: args.aksi, selesai: true };
    },
  },
];
