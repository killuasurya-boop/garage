// =============================================================================
// M3d — tool MCP domain Gudang / WMS (PRD V4.0 §04 domain 7, D-01).
// Membungkus service WMS yang sama dengan /warehouse: Minta Bahan (kirim =
// pindah stok FEFO), waste (keputusan Owner/Manajer), PO (draft → terkirim /
// batal), saran belanja min–max. Stok fisik hanya bergerak lewat ledger WMS.
// R2 hanya jalan setelah preview + konfirmasi (M2).
// =============================================================================
import { z } from "zod";

import { AgentToolError, rupiah, type AgentTool } from "@/lib/agent-tool-core";
import type { GarageSession } from "@/lib/server-auth";
import { wmsIsElevated } from "@/lib/wms-access";

function assertElevated(session: GarageSession) {
  if (!wmsIsElevated(session.profile.role)) throw new AgentToolError("FORBIDDEN", "Hanya Owner/Manajer gudang.", 403);
}

async function materialRequestOrThrow(id: string) {
  const { listMaterialRequests } = await import("@/lib/wms-material-request");
  const request = (await listMaterialRequests({ limit: 500 })).find((row) => row.id === id);
  if (!request) throw new AgentToolError("NOT_FOUND", "Permintaan bahan tidak ditemukan.", 404);
  return request;
}

async function wasteOrThrow(id: string) {
  const { listWmsWaste } = await import("@/lib/wms-waste");
  const row = (await listWmsWaste({ status: "pending_approval", limit: 500 })).find((item) => item.id === id);
  if (!row) throw new AgentToolError("NOT_FOUND", "Waste menunggu persetujuan dengan id ini tidak ditemukan.", 404);
  return row;
}

export const warehouseTools: AgentTool[] = [
  // ─── Baca (R0) ────────────────────────────────────────────────────────────
  {
    name: "daftar_minta_bahan",
    title: "Daftar permintaan bahan (Minta Bahan)",
    description: "Permintaan bahan Bar/Dapur (MRQ-…): status submitted/sent/received/cancelled, item, qty diminta/terkirim/kurang, stok gudang sumber.",
    write: false,
    domain: "gudang",
    risk: "R0",
    permission: "inventory:read",
    input: z.object({ status: z.enum(["submitted", "sent", "received", "cancelled"]).optional(), divisi: z.enum(["bar", "dapur"]).optional() }),
    async run(_session, args) {
      const { listMaterialRequests } = await import("@/lib/wms-material-request");
      return listMaterialRequests({
        division: args.divisi as "bar" | "dapur" | undefined,
        status: args.status ? [args.status as "submitted" | "sent" | "received" | "cancelled"] : undefined,
        limit: 50,
      });
    },
  },
  {
    name: "daftar_waste",
    title: "Daftar waste bahan",
    description: "Catatan waste/buang bahan (expired, rusak, tumpah, susut produksi): status recorded/pending_approval/rejected, qty, nilai. Waste ≥ Rp50.000 dari staf menunggu keputusan Owner/Manajer.",
    write: false,
    domain: "gudang",
    risk: "R0",
    permission: "inventory:read",
    input: z.object({ status: z.enum(["recorded", "pending_approval", "rejected"]).optional() }),
    async run(_session, args) {
      const { listWmsWaste } = await import("@/lib/wms-waste");
      return listWmsWaste({ status: args.status as string | undefined, limit: 100 });
    },
  },
  {
    name: "saran_belanja",
    title: "Saran belanja (min–max)",
    description: "Bahan di bawah minimum per ruang: kebutuhan, bagian yang bisa diisi dari gudang utama area, sisanya perlu dibeli (supplier & harga terakhir). Lanjutkan dengan buat_po_dari_saran.",
    write: false,
    domain: "gudang",
    risk: "R0",
    permission: "inventory:read",
    input: z.object({}),
    async run() {
      const { getReorderSuggestions } = await import("@/lib/wms-purchase");
      return getReorderSuggestions();
    },
  },
  {
    name: "daftar_po",
    title: "Daftar purchase order",
    description: "Purchase order gudang (draft/sent/partial/received/cancelled) dengan supplier, jumlah item & total.",
    write: false,
    domain: "gudang",
    risk: "R0",
    permission: "inventory:read",
    input: z.object({}),
    async run() {
      const { listPurchaseOrders } = await import("@/lib/wms-purchase");
      return listPurchaseOrders(50);
    },
  },
  {
    name: "batch_hampir_kedaluwarsa",
    title: "Batch hampir kedaluwarsa",
    description: "Batch bahan yang kedaluwarsa dalam N hari (default 3) per ruang — kandidat dipakai dulu (FEFO) atau di-waste.",
    write: false,
    domain: "gudang",
    risk: "R0",
    permission: "inventory:read",
    input: z.object({ hari: z.number().int().min(0).max(60).optional() }),
    async run(_session, args) {
      const { listExpiringWmsBatches } = await import("@/lib/wms-waste");
      return listExpiringWmsBatches((args.hari as number | undefined) ?? 3);
    },
  },

  // ─── Aksi ─────────────────────────────────────────────────────────────────
  {
    name: "kirim_minta_bahan",
    title: "Kirim permintaan bahan",
    description:
      "Gudang mengirim permintaan bahan: stok pindah dari gudang utama area ke ruang Bar/Dapur (FEFO, batch kedaluwarsa ditolak). Tanpa `kirim` = kirim sesuai qty diminta. Yang tidak terkirim jadi kekurangan (bisa dibelikan). Sekali kirim.",
    write: true,
    domain: "gudang",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({
      id: z.string().uuid(),
      kirim: z.array(z.object({ itemId: z.string().uuid(), qty: z.number().min(0) })).max(200).optional(),
    }),
    async run(session, args) {
      const { sendMaterialRequest } = await import("@/lib/wms-material-request");
      const request = await materialRequestOrThrow(String(args.id));
      const lines = (args.kirim as Array<{ itemId: string; qty: number }> | undefined) ?? request.items.map((item) => ({ itemId: item.id, qty: item.qty }));
      const result = await sendMaterialRequest(String(args.id), lines, { userId: session.user.id, outletId: session.profile.outlet.id });
      if (!result) throw new AgentToolError("NOT_FOUND", "Permintaan bahan tidak ditemukan.", 404);
      return result;
    },
    async preview(_session, args) {
      const request = await materialRequestOrThrow(String(args.id));
      const custom = new Map(((args.kirim as Array<{ itemId: string; qty: number }> | undefined) ?? []).map((line) => [line.itemId, line.qty]));
      return {
        aksi: `KIRIM permintaan bahan ${request.doc} → ${request.roomName ?? request.division}`,
        statusSaatIni: request.status,
        item: request.items.map((item) => {
          const send = custom.size ? (custom.get(item.id) ?? 0) : item.qty;
          return `${item.name}: kirim ${send}/${item.qty} ${item.unit} (stok gudang ${item.sourceOnHand})${send > item.sourceOnHand ? " — STOK KURANG" : ""}`;
        }),
        dampak: "Stok berpindah ruang di ledger WMS (nilai tetap). Bagian yang tidak terkirim tercatat sebagai kekurangan.",
        catatan: request.status !== "submitted" ? "Permintaan sudah diproses — eksekusi akan ditolak." : undefined,
      };
    },
  },
  {
    name: "putuskan_waste",
    title: "Setujui / tolak waste",
    description: "Putuskan waste staf yang menunggu persetujuan. Disetujui = stok dipotong (FEFO, batch kedaluwarsa dulu) dan nilainya masuk laporan Owner; ditolak wajib alasan, stok tidak berubah.",
    write: true,
    domain: "gudang",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({ id: z.string().uuid(), setujui: z.boolean(), catatan: z.string().max(300).optional() }),
    async run(session, args) {
      assertElevated(session);
      const { decideWmsWaste } = await import("@/lib/wms-waste");
      return decideWmsWaste(String(args.id), { approve: Boolean(args.setujui), note: args.catatan as string | undefined }, { userId: session.user.id });
    },
    async preview(session, args) {
      assertElevated(session);
      const row = await wasteOrThrow(String(args.id));
      return {
        aksi: args.setujui ? "SETUJUI waste (stok dipotong)" : "TOLAK waste (stok tetap)",
        bahan: `${row.productName ?? row.productId} (${row.sku ?? "-"})`,
        ruang: row.warehouseName,
        qty: Number(row.qty),
        alasanWaste: row.reason,
        perkiraanNilai: rupiah(Number(row.estimatedValue)),
      };
    },
  },
  {
    name: "ubah_status_po",
    title: "Tandai PO terkirim / batalkan PO",
    description: "send = PO yang SUDAH DISETUJUI ditandai sudah dikirim ke supplier (PO draft/menunggu persetujuan ditolak — setujui dulu di WMS → Purchase Order); cancel = batalkan PO (yang sudah diterima sebagian tidak bisa). Tidak ada uang bergerak; biaya bahan tercatat saat penerimaan gudang.",
    write: true,
    domain: "gudang",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({ id: z.string().uuid(), aksi: z.enum(["send", "cancel"]) }),
    async run(session, args) {
      assertElevated(session);
      const { setPurchaseOrderStatus } = await import("@/lib/wms-purchase");
      const result = await setPurchaseOrderStatus(String(args.id), args.aksi as "send" | "cancel", session.user.id);
      if (!result) throw new AgentToolError("NOT_FOUND", "PO tidak ditemukan.", 404);
      return result;
    },
    async preview(session, args) {
      assertElevated(session);
      const { getPurchaseOrder } = await import("@/lib/wms-purchase");
      const po = await getPurchaseOrder(String(args.id));
      if (!po) throw new AgentToolError("NOT_FOUND", "PO tidak ditemukan.", 404);
      return {
        aksi: args.aksi === "send" ? `TANDAI PO ${po.doc} terkirim ke supplier` : `BATALKAN PO ${po.doc}`,
        supplier: po.supplierName,
        statusSaatIni: po.status,
        total: rupiah(po.items.reduce((sum, item) => sum + item.orderedQty * item.unitPrice, 0)),
        item: po.items.map((item) => `${item.name}: ${item.orderedQty} ${item.unit} @ ${rupiah(item.unitPrice)} (diterima ${item.receivedQty})`),
      };
    },
  },
  {
    name: "buat_po_dari_saran",
    title: "Buat PO draft dari saran belanja",
    description: "Buat PO DRAFT per supplier dari saran belanja min–max (bagian yang tidak bisa diisi dari gudang utama). Hanya draft — belum dikirim, tidak ada uang bergerak.",
    write: true,
    domain: "gudang",
    risk: "R1",
    permission: "inventory:write",
    input: z.object({}),
    async run(session) {
      assertElevated(session);
      const { createPurchaseOrdersFromSuggestions } = await import("@/lib/wms-purchase");
      return createPurchaseOrdersFromSuggestions(session.user.id);
    },
  },
];
