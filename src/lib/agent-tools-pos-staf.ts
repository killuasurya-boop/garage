// =============================================================================
// M3b — tool MCP domain POS/Order + Karyawan (PRD V4.0 §04 domain 2 & 10, D-01).
// Membungkus service yang sudah dipakai layar admin order & kelola user; alur
// checkout/pembayaran kasir (B3) tidak disentuh. Batal/refund tetap lewat
// pengajuan (APP-VOID / APP-RFD) sesuai pengaturan; kasir tidak pernah
// menghapus penjualan. R2/R3 hanya jalan setelah preview + konfirmasi (M2).
// =============================================================================
import { z } from "zod";

import { AgentToolError, rupiah, type AgentTool } from "@/lib/agent-tool-core";
import { ORDER_CANCEL_REASON_CODES } from "@/lib/approval-rules";
import type { GarageSession } from "@/lib/server-auth";

const orderRef = z.string().trim().min(1).max(80).describe("Id order atau nomor order (mis. GC-…)");
const reasonCode = z.enum(ORDER_CANCEL_REASON_CODES);

async function refundableOrThrow(session: GarageSession, ref: string) {
  const { getRefundableOrder } = await import("@/lib/garage-service");
  const order = await getRefundableOrder(ref, session);
  if (!order) throw new AgentToolError("NOT_FOUND", "Order tidak ditemukan di outlet ini.", 404);
  return order;
}

/** Identitas & peran staf hanya lewat sesi Owner sungguhan (ChatGPT/OAuth), bukan API key statis (S1). */
function assertNotAgentKey(session: GarageSession) {
  if (session.profile.agentKey) {
    throw new AgentToolError("AGENT_FORBIDDEN", "Perubahan staf tidak boleh lewat API key agent — pakai ChatGPT (login Owner + 2FA).", 403);
  }
}

export const posStaffTools: AgentTool[] = [
  // ─── POS / Order ──────────────────────────────────────────────────────────
  {
    name: "riwayat_order",
    title: "Riwayat perubahan order",
    description: "Riwayat perubahan satu order dari audit log: siapa mengubah apa (info, metode bayar, batal/refund, arsip), sebelum/sesudah dan alasannya.",
    write: false,
    domain: "pos",
    risk: "R0",
    permission: "orders:read",
    input: z.object({ order: orderRef }),
    async run(session, args) {
      const { getOrderChangeHistory } = await import("@/lib/garage-service");
      return getOrderChangeHistory(String(args.order), session);
    },
  },
  {
    name: "ubah_info_order",
    title: "Ubah info order",
    description: "Ubah nama/telepon/catatan pelanggan atau nomor meja sebuah order. Nominal & item tidak pernah berubah. Alasan wajib.",
    write: true,
    domain: "pos",
    risk: "R1",
    permission: "orders:manage",
    input: z.object({
      order: orderRef,
      namaPelanggan: z.string().max(120).optional(),
      telepon: z.string().max(40).optional(),
      catatan: z.string().max(300).optional(),
      meja: z.string().max(10).optional(),
      alasan: z.string().min(3).max(300),
    }),
    async run(session, args) {
      const { updateOrderInfo } = await import("@/lib/garage-service");
      return updateOrderInfo(
        String(args.order),
        {
          customerName: args.namaPelanggan as string | undefined,
          customerPhone: args.telepon as string | undefined,
          customerNote: args.catatan as string | undefined,
          tableNumber: args.meja as string | undefined,
          reason: String(args.alasan),
        },
        session,
      );
    },
  },
  {
    name: "batalkan_order",
    title: "Batalkan (void) order",
    description:
      `Batalkan seluruh order. Selalu tercatat sebagai pengajuan APP-VOID; dari Owner/Manajer langsung disetujui (stok & kas dikembalikan lewat pipeline resmi). alasan: ${ORDER_CANCEL_REASON_CODES.join(", ")}; "lainnya" wajib catatan.`,
    write: true,
    domain: "pos",
    risk: "R2",
    permission: "orders:manage",
    input: z.object({ order: orderRef, alasan: reasonCode, catatan: z.string().max(300).optional() }),
    async run(session, args) {
      const { requestOrderVoidApproval } = await import("@/lib/garage-service");
      return requestOrderVoidApproval(String(args.order), { reasonCode: String(args.alasan), note: (args.catatan as string | undefined) ?? null }, session);
    },
    async preview(session, args) {
      const order = await refundableOrThrow(session, String(args.order));
      return {
        aksi: `BATALKAN order ${order.orderNo}`,
        meja: order.tableLabel,
        statusSaatIni: order.status,
        total: rupiah(order.total),
        item: order.items.map((item) => `${item.qty}× ${item.itemName}${item.variantLabel ? ` (${item.variantLabel})` : ""}`),
        alasan: args.alasan,
        catatan: order.pendingApprovalId
          ? `Sudah ada pengajuan menunggu (${order.pendingApprovalId}) — eksekusi kemungkinan ditolak.`
          : order.status === "voided"
            ? "Order sudah dibatalkan."
            : "Tercatat sebagai pengajuan APP-VOID (jejak audit). Pengajuan Owner/Manajer langsung disetujui → order batal, stok & kas dikembalikan lewat pipeline resmi.",
      };
    },
  },
  {
    name: "refund_order",
    title: "Refund item order lunas",
    description:
      "Refund sebagian/semua item order yang sudah lunas (uang kembali proporsional termasuk service/pajak/diskon; paket event harus utuh). Tercatat sebagai pengajuan APP-RFD; dari Owner/Manajer langsung disetujui. Panggil tanpa konfirmasi dulu: preview memuat orderItemId tiap item.",
    write: true,
    domain: "pos",
    risk: "R2",
    permission: "orders:manage",
    input: z.object({
      order: orderRef,
      item: z.array(z.object({ orderItemId: z.string().min(1), qty: z.number().int().positive() })).min(1).max(50),
      alasan: reasonCode,
      catatan: z.string().max(300).optional(),
    }),
    async run(session, args) {
      const { requestOrderRefundApproval } = await import("@/lib/garage-service");
      return requestOrderRefundApproval(
        String(args.order),
        { reasonCode: String(args.alasan), note: (args.catatan as string | undefined) ?? null, items: args.item as Array<{ orderItemId: string; qty: number }> },
        session,
      );
    },
    async preview(session, args) {
      const order = await refundableOrThrow(session, String(args.order));
      const wanted = args.item as Array<{ orderItemId: string; qty: number }>;
      return {
        aksi: `AJUKAN refund order ${order.orderNo}`,
        statusSaatIni: order.status,
        totalOrder: rupiah(order.total),
        itemDirefund: wanted.map((line) => {
          const item = order.items.find((row) => row.id === line.orderItemId);
          return item ? `${line.qty}/${item.qty}× ${item.itemName} @ ${rupiah(item.unitPrice)}` : `${line.orderItemId}: TIDAK ADA di order ini`;
        }),
        itemOrder: order.items.map((item) => ({ orderItemId: item.id, nama: item.itemName, varian: item.variantLabel, qty: item.qty, harga: item.unitPrice })),
        dampak: "Tercatat sebagai pengajuan APP-RFD. Pengajuan Owner/Manajer langsung disetujui → uang & stok item ini dikembalikan.",
        catatan: order.status !== "paid" ? "Refund hanya untuk order lunas — eksekusi akan ditolak." : order.pendingApprovalId ? `Ada pengajuan menunggu (${order.pendingApprovalId}).` : undefined,
      };
    },
  },
  {
    name: "koreksi_metode_bayar",
    title: "Koreksi metode bayar",
    description: "Ganti metode bayar yang salah input (Cash, QRIS, Bank Transfer, E-Wallet). Total tidak berubah; laci kas disesuaikan lewat buku kas. Alasan wajib.",
    write: true,
    domain: "pos",
    risk: "R2",
    permission: "orders:manage",
    input: z.object({
      orderId: z.string().uuid(),
      paymentId: z.string().uuid().optional().describe("Wajib bila order punya lebih dari satu pembayaran"),
      metodeBaru: z.enum(["Cash", "QRIS", "Bank Transfer", "E-Wallet"]),
      alasan: z.string().min(3).max(300),
    }),
    async run(session, args) {
      const { correctPaymentMethod } = await import("@/lib/garage-service");
      return correctPaymentMethod(
        String(args.orderId),
        { paymentId: args.paymentId as string | undefined, method: args.metodeBaru as "Cash" | "QRIS" | "Bank Transfer" | "E-Wallet", reason: String(args.alasan) },
        session,
      );
    },
    async preview(session, args) {
      const order = await refundableOrThrow(session, String(args.orderId));
      return {
        aksi: `KOREKSI metode bayar order ${order.orderNo} → ${args.metodeBaru}`,
        total: rupiah(order.total),
        statusSaatIni: order.status,
        alasan: args.alasan,
        dampak: "Total tetap; bila tunai ikut berubah, laci shift disesuaikan lewat baris buku kas (method_fix).",
      };
    },
  },

  // ─── Karyawan ─────────────────────────────────────────────────────────────
  {
    name: "daftar_staf",
    title: "Daftar staf",
    description: "Daftar akun staf: nama, email, peran, status (active/suspended), divisi, login terakhir, PIN sudah diatur.",
    write: false,
    domain: "karyawan",
    risk: "R0",
    permission: "staff:manage",
    input: z.object({ cari: z.string().max(80).optional() }),
    async run(_session, args) {
      const { listAdminUsers } = await import("@/lib/admin-user-service");
      const { rows, total } = await listAdminUsers({ query: (args.cari as string | undefined) || undefined, limit: 200 });
      return {
        total,
        staf: rows.map((row) => ({
          userId: row.userId,
          nama: row.name,
          email: row.email,
          peran: row.role,
          status: row.status,
          alasanSuspend: row.suspendedReason,
          divisi: row.division,
          jabatan: row.position,
          loginTerakhir: row.lastLoginAt,
          pinDiatur: row.pinConfigured,
        })),
      };
    },
  },
  {
    name: "ubah_status_peran_staf",
    title: "Ubah peran / suspend staf",
    description:
      "Ubah peran staf (Owner, Manajer, Kasir, Waiter) dan/atau suspend/aktifkan akun. Owner terakhir tidak bisa diturunkan/di-suspend; tidak bisa suspend diri sendiri. Password & PIN tidak bisa diubah lewat chat. Hanya lewat ChatGPT (login Owner), bukan API key.",
    write: true,
    domain: "karyawan",
    risk: "R3",
    permission: "staff:manage",
    input: z
      .object({
        userId: z.string().min(1).max(80),
        peran: z.enum(["Owner", "Manajer", "Kasir", "Waiter"]).optional(),
        status: z.enum(["active", "suspended"]).optional(),
        alasan: z.string().min(3).max(300),
      })
      .refine((value) => value.peran !== undefined || value.status !== undefined, { message: "Isi peran dan/atau status." }),
    async run(session, args) {
      assertNotAgentKey(session);
      if (args.userId === session.user.id && args.status === "suspended") {
        throw new AgentToolError("CANNOT_SUSPEND_SELF", "Tidak bisa men-suspend diri sendiri.");
      }
      const { updateAdminUser } = await import("@/lib/admin-user-service");
      const result = await updateAdminUser(
        String(args.userId),
        {
          role: args.peran as "Owner" | "Manajer" | "Kasir" | "Waiter" | undefined,
          status: args.status as "active" | "suspended" | undefined,
          suspendedReason: args.status === "suspended" ? String(args.alasan) : args.status === "active" ? null : undefined,
        },
        { actorUserId: session.user.id, actorName: session.user.name, actorRole: session.profile.role, deviceLabel: "mcp:chatgpt" },
      );
      if ("error" in result) throw new AgentToolError("UPDATE_USER_FAILED", result.error);
      return { ok: true, userId: args.userId, peran: args.peran ?? null, status: args.status ?? null };
    },
    async preview(session, args) {
      assertNotAgentKey(session);
      const { listAdminUsers } = await import("@/lib/admin-user-service");
      const { rows } = await listAdminUsers({ limit: 200 });
      const target = rows.find((row) => row.userId === args.userId);
      if (!target) throw new AgentToolError("NOT_FOUND", "Staf tidak ditemukan.", 404);
      return {
        aksi: [args.peran ? `UBAH PERAN ${target.role} → ${args.peran}` : null, args.status ? `STATUS ${target.status} → ${args.status}` : null].filter(Boolean).join(" & "),
        staf: `${target.name} (${target.email})`,
        alasan: args.alasan,
        dampak:
          args.status === "suspended"
            ? "Akun tidak bisa login; sesi aktif berakhir."
            : args.peran
              ? "Hak akses berubah mulai permintaan berikutnya."
              : "Akun bisa login lagi.",
      };
    },
  },
];
